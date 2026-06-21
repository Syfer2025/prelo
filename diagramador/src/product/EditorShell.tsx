import { useEffect, useMemo, useRef, useState } from 'react';
import type { FrameLayout } from '../engine';
import { fontRegistry } from '../fonts/font-registry';
import { BLANK_FONT_FAMILY, BLANK_FONT_SIZE } from '../editor/blank-document';
import {
  addPage,
  bodyStyle,
  createInitialEditorState,
  editorStateFromProject,
  mainStory,
  pageTextChunks,
  setActivePage,
  setBodyStyle,
  setPageText,
  setProjectDocument,
} from '../editor/editor-state';
import type { EditorState } from '../editor/editor-state';
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
} from '../editor/editor-history';
import type { History } from '../editor/editor-history';
import { loadProject, saveProject } from '../editor/persistence';
import { createBrowserEngineAdapter } from '../editor/engine-adapter';
import { EDITOR_LAYOUT_ALGORITHM } from '../editor/editor-layout';
import PageSidebar from '../editor/components/PageSidebar';
import TextToolbar from '../editor/components/TextToolbar';
import EditorWorkspace from '../editor/components/EditorWorkspace';

const EDITOR_FONT_URL = '/fonts/CrimsonText-Regular.ttf';
const TEXT_DEBOUNCE_MS = 700;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;

function loadInitialHistory(): History<EditorState> {
  try {
    const saved = typeof window !== 'undefined' ? loadProject(window.localStorage) : null;
    if (saved) return createHistory(editorStateFromProject(saved));
  } catch {
    /* localStorage indisponível — começa em branco */
  }
  return createHistory(createInitialEditorState());
}

export default function EditorShell() {
  const [history, setHistory] = useState<History<EditorState>>(loadInitialHistory);
  const [layoutCtx] = useState<CanvasRenderingContext2D | null>(() =>
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  );
  const [zoom, setZoom] = useState(1);
  const [pageRevision, setPageRevision] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [exportStatus, setExportStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>(
    'idle'
  );

  // Espelhos/refs para evitar closures velhas e efeitos colaterais dentro de updaters (StrictMode).
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  const draftRef = useRef<{ pageIndex: number; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const present = history.present;
  const style = bodyStyle(present);
  const texts = pageTextChunks(present);

  function paginateWithEngine(state: EditorState): {
    state: EditorState;
    frameLayoutsByFrameId: Record<string, FrameLayout>;
  } {
    const story = mainStory(state);
    if (!story || !layoutCtx) return { state, frameLayoutsByFrameId: {} };

    const stateStyle = bodyStyle(state);
    const adapter = createBrowserEngineAdapter(layoutCtx, {
      fontFamily: BLANK_FONT_FAMILY,
      fontSize: BLANK_FONT_SIZE,
      lineHeight: stateStyle.lineHeight,
    });
    const pagination = adapter.paginateProjectStory(state.project, story.id, {
      algorithm: EDITOR_LAYOUT_ALGORITHM,
      maxAutoPages: 200,
    });
    return {
      state: setProjectDocument(state, pagination.document),
      frameLayoutsByFrameId: Object.fromEntries(
        pagination.layout.frameLayouts.map((frameLayout) => [frameLayout.frameId, frameLayout])
      ),
    };
  }

  // Paginar é CARO (tokenize → KP+hifenização → fill, por todas as páginas). Memoizar para
  // rodar SÓ quando o documento/estilo/algoritmo mudam de fato — e não a cada render incidental
  // (zoom, status de salvar, export). Durante a digitação (debounced) `present` não muda → 0 repaginações.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const preview = useMemo(() => paginateWithEngine(present), [present, layoutCtx]);
  const previewState = preview.state;
  const previewDoc = previewState.project.document;

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function withFlushedDraft(h: History<EditorState>): History<EditorState> {
    const draft = draftRef.current;
    draftRef.current = null;
    if (draft === null) return h;
    const currentText = pageTextChunks(h.present)[draft.pageIndex] ?? '';
    if (draft.text === currentText) return h;
    return pushHistory(h, paginateWithEngine(setPageText(h.present, draft.pageIndex, draft.text)).state);
  }

  function commitHistory(next: History<EditorState>) {
    historyRef.current = next;
    setHistory(next);
  }

  function flushDraft() {
    clearTimer();
    const current = historyRef.current;
    const next = withFlushedDraft(current);
    if (next !== current) {
      commitHistory(next);
      // NÃO bumpar pageRevision aqui: o flush de digitação NÃO deve remontar todas as páginas
      // (custo enorme com manuscrito grande). O EditablePage sincroniza o conteúdo via
      // useEffect([text]) quando o trecho da página muda. pageRevision fica só para mudanças
      // estruturais (add/seleção de página, undo/redo, load), que precisam re-semear o DOM.
    }
  }

  function applyChange(
    fn: (state: EditorState) => EditorState,
    opts: { push?: boolean; bump?: boolean } = {}
  ) {
    const { push = true, bump = false } = opts;
    clearTimer();
    let h = withFlushedDraft(historyRef.current);
    const next = paginateWithEngine(fn(h.present)).state;
    if (next !== h.present) h = push ? pushHistory(h, next) : { ...h, present: next };
    commitHistory(h);
    if (bump) setPageRevision((r) => r + 1);
    setSaveStatus('idle');
  }

  // ── Texto ────────────────────────────────────────────────
  function handleTextInput(pageIndex: number, text: string) {
    draftRef.current = { pageIndex, text };
    clearTimer();
    timerRef.current = setTimeout(flushDraft, TEXT_DEBOUNCE_MS);
    setSaveStatus('idle');
  }
  function handleTextCommit() {
    flushDraft();
  }

  // ── Páginas ──────────────────────────────────────────────
  function handleAddPage() {
    applyChange(addPage, { push: true, bump: true });
  }
  function handleSelectPage(index: number) {
    if (index === historyRef.current.present.activePageIndex) return;
    applyChange((s) => setActivePage(paginateWithEngine(s).state, index), { push: false, bump: true });
  }

  // ── Estilo ───────────────────────────────────────────────
  function handleStyleChange(patch: Parameters<typeof setBodyStyle>[1]) {
    applyChange((s) => setBodyStyle(s, patch), { push: true, bump: false });
  }

  // ── Undo / Redo ──────────────────────────────────────────
  function handleUndo() {
    clearTimer();
    const flushed = withFlushedDraft(historyRef.current);
    commitHistory(undo(flushed));
    setPageRevision((r) => r + 1);
    setSaveStatus('idle');
  }
  function handleRedo() {
    clearTimer();
    draftRef.current = null;
    commitHistory(redo(historyRef.current));
    setPageRevision((r) => r + 1);
    setSaveStatus('idle');
  }

  // ── Salvar ───────────────────────────────────────────────
  function handleSave() {
    flushDraft();
    try {
      saveProject(window.localStorage, historyRef.current.present.project);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1600);
    } catch (err) {
      console.error('Falha ao salvar projeto:', err);
    }
  }

  // ── Zoom (fora do histórico) ─────────────────────────────
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  const handleZoomIn = () => setZoom((z) => clampZoom(z + ZOOM_STEP));
  const handleZoomOut = () => setZoom((z) => clampZoom(z - ZOOM_STEP));
  const handleZoomReset = () => setZoom(1);

  // ── Exportar PDF (via adapter → motor estável) ───────────
  async function handleExportPdf() {
    flushDraft();
    const project = paginateWithEngine(historyRef.current.present).state.project;
    setExportStatus('generating');
    try {
      await fontRegistry.loadFont(BLANK_FONT_FAMILY, EDITOR_FONT_URL);
      const fontResponse = await fetch(EDITOR_FONT_URL);
      if (!fontResponse.ok) throw new Error(`Fonte indisponível: ${fontResponse.status}`);
      const fontBytes = await fontResponse.arrayBuffer();

      if (!layoutCtx) throw new Error('Canvas indisponível para exportação');
      const adapter = createBrowserEngineAdapter(layoutCtx, {
        fontFamily: BLANK_FONT_FAMILY,
        fontSize: BLANK_FONT_SIZE,
        lineHeight: style.lineHeight,
      });
      const bytes = await adapter.exportProjectToPdf(project, {
        algorithm: EDITOR_LAYOUT_ALGORITHM,
        fontBytes,
      });

      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.name || 'livro'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus('ready');
      setTimeout(() => setExportStatus('idle'), 1600);
    } catch (err) {
      console.error('Erro ao exportar PDF do editor:', err);
      setExportStatus('error');
    }
  }

  return (
    <div className="editor-shell">
      <TextToolbar
        projectName={present.project.name}
        style={style}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        saveStatus={saveStatus}
        exportStatus={exportStatus}
        zoom={zoom}
        onStyleChange={handleStyleChange}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportPdf={handleExportPdf}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />
      <div className="editor-body">
        <PageSidebar
          pageCount={previewDoc.pages.length}
          activeIndex={present.activePageIndex}
          onSelect={handleSelectPage}
          onAddPage={handleAddPage}
        />
        {previewDoc.pages.length > 0 ? (
          <EditorWorkspace
            pages={previewDoc.pages}
            frames={previewDoc.frames}
            frameLayoutsByFrameId={preview.frameLayoutsByFrameId}
            texts={texts}
            activePageIndex={present.activePageIndex}
            style={style}
            zoom={zoom}
            pageRevision={pageRevision}
            onSelectPage={handleSelectPage}
            onTextInput={handleTextInput}
            onTextCommit={handleTextCommit}
          />
        ) : (
          <div className="editor-workspace" />
        )}
      </div>
    </div>
  );
}
