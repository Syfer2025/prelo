import { useEffect, useMemo, useRef, useState } from 'react';
import type { FrameLayout } from '../engine';
import type { Document } from '../model/types';
import { fontRegistry } from '../fonts/font-registry';
import { BLANK_BODY_STYLE_ID, BLANK_FONT_FAMILY, BLANK_FONT_SIZE } from '../editor/blank-document';
import {
  addPage,
  bodyStyle,
  createInitialEditorState,
  editorStateFromProject,
  mainStory,
  manuscriptText,
  pageTextChunks,
  setActivePage,
  setBodyStyle,
  setPageText,
  setProjectDocument,
} from '../editor/editor-state';
import type { EditorState } from '../editor/editor-state';
import { tiptapJsonToPreloParagraphs } from '../editor/tiptap-adapter';
import type { TiptapDoc } from '../editor/tiptap-adapter';
import TiptapWritingSurface from '../editor/components/TiptapWritingSurface';
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

/**
 * SPIKE: liga a camada de escrita Tiptap. Ligado nesta branch para avaliar; em `main` ficaria
 * `false`. O `EditablePage` atual NÃO é destruído — o caminho `false` continua intacto.
 */
const USE_TIPTAP_SPIKE = true;

/** Garante estilos heading-1/2/3 no documento (o adapter mapeia headings para esses ids). */
function ensureHeadingStyles(document: Document): void {
  const body = document.styles[BLANK_BODY_STYLE_ID];
  if (!body) return;
  const scales: Record<string, number> = { 'heading-1': 1.8, 'heading-2': 1.45, 'heading-3': 1.2 };
  for (const [id, scale] of Object.entries(scales)) {
    if (document.styles[id]) continue;
    document.styles[id] = {
      ...body,
      name: id,
      alignment: 'left',
      spaceBefore: Math.round(body.characterStyle.fontSize * scale * 0.6),
      spaceAfter: Math.round(body.characterStyle.fontSize * scale * 0.3),
      keepWithNext: true,
      characterStyle: {
        ...body.characterStyle,
        fontSize: Math.round(body.characterStyle.fontSize * scale),
        fontWeight: 'bold',
      },
    };
  }
}

/**
 * Deriva um EditorState cujo manuscrito vem do JSON do Tiptap (via adapter), preservando todo o
 * resto (páginas, frames, imagens) do Prelo. É a ÚNICA forma de o Tiptap alimentar o motor.
 */
function applyTiptapToState(base: EditorState, json: unknown): EditorState {
  if (!json) return base;
  const next = structuredClone(base);
  const story = mainStory(next);
  if (!story) return base;
  story.paragraphs = tiptapJsonToPreloParagraphs(json as TiptapDoc, BLANK_BODY_STYLE_ID);
  ensureHeadingStyles(next.project.document);
  return next;
}

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
  // SPIKE: JSON do Tiptap (debounced) que alimenta o preview do Prelo.
  const [tiptapJson, setTiptapJson] = useState<unknown | null>(null);
  // SPIKE: conteúdo inicial do Tiptap = manuscrito atual, capturado uma vez no mount.
  const [initialManuscript] = useState(() => manuscriptText(history.present));

  // Espelhos/refs para evitar closures velhas e efeitos colaterais dentro de updaters (StrictMode).
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  const draftRef = useRef<{ pageIndex: number; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiptapJsonRef = useRef<unknown>(null); // SPIKE: último JSON imediato (sem debounce)
  const tiptapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tiptapTimerRef.current) clearTimeout(tiptapTimerRef.current);
  }, []);

  const present = history.present;
  const style = bodyStyle(present);
  // SPIKE: a entrada do preview vem do Tiptap (quando ligado e já há JSON); senão, do estado normal.
  const previewInputState = useMemo(
    () => (USE_TIPTAP_SPIKE && tiptapJson ? applyTiptapToState(present, tiptapJson) : present),
    [present, tiptapJson]
  );
  // SPIKE: digitação fluida no Tiptap; o Prelo só repagina após a pausa (debounce), como no editor.
  function handleTiptapChange(json: unknown) {
    tiptapJsonRef.current = json;
    if (tiptapTimerRef.current) clearTimeout(tiptapTimerRef.current);
    tiptapTimerRef.current = setTimeout(() => setTiptapJson(json), TEXT_DEBOUNCE_MS);
  }

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
  const preview = useMemo(() => paginateWithEngine(previewInputState), [previewInputState, layoutCtx]);
  const previewState = preview.state;
  const previewDoc = previewState.project.document;
  // No spike, o texto exibido nas páginas vem do estado já paginado (derivado do Tiptap).
  const texts = USE_TIPTAP_SPIKE ? pageTextChunks(previewState) : pageTextChunks(present);

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
    // No spike, o PDF exporta o conteúdo escrito no Tiptap (via adapter), não o `present` base.
    const baseState =
      USE_TIPTAP_SPIKE && tiptapJsonRef.current
        ? applyTiptapToState(historyRef.current.present, tiptapJsonRef.current)
        : historyRef.current.present;
    const project = paginateWithEngine(baseState).state.project;
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
        {USE_TIPTAP_SPIKE ? (
          // SPIKE: escrita no Tiptap (esquerda) + PROVA paginada do Prelo (direita).
          // A prova é read-only (handlers no-op): a fonte da verdade do texto é o Tiptap,
          // e a fonte da verdade do layout/PDF continua sendo o Prelo.
          <div className="tiptap-spike-pane">
            <div className="tiptap-spike-write">
              <span className="spike-label">Escrita — Tiptap (spike)</span>
              <TiptapWritingSurface
                initialText={initialManuscript}
                onChangeJson={handleTiptapChange}
              />
            </div>
            <div className="tiptap-spike-preview">
              <span className="spike-label" style={{ padding: '8px 0 0 16px' }}>
                Prova paginada — Prelo (preview = PDF)
              </span>
              {previewDoc.pages.length > 0 ? (
                <EditorWorkspace
                  pages={previewDoc.pages}
                  frames={previewDoc.frames}
                  frameLayoutsByFrameId={preview.frameLayoutsByFrameId}
                  texts={texts}
                  activePageIndex={Math.min(present.activePageIndex, previewDoc.pages.length - 1)}
                  style={style}
                  zoom={zoom}
                  pageRevision={pageRevision}
                  onSelectPage={() => {}}
                  onTextInput={() => {}}
                  onTextCommit={() => {}}
                />
              ) : (
                <div className="editor-workspace" />
              )}
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
