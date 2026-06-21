/**
 * App — Aplicação principal do Prelo
 * 
 * Layout: Textarea (input de texto) à esquerda + Canvas (preview) à direita.
 * O texto digitado flui entre 3 frames de teste, demonstrando o motor Prelo.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Canvas from './components/Canvas';
import { TextEngine } from './engine';
import type { LayoutResult } from './engine';
import { renderCoverPdf } from './engine/cover-pdf';
import { renderToCanvas } from './render/canvas-renderer';
import { frameAtPoint } from './editor/hit-testing';
import { fontRegistry } from './fonts/font-registry';
import { formatExportError } from './export-error';
import { isImageFrame } from './model/image-checks';
import { runPreflight } from './model/preflight';
import { calculateCoverGeometry, spineWidthFromProfile } from './model/spine';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createDemoDocument,
  DEFAULT_DEMO_STYLE,
  DEMO_AUTO_PAGE_TEMPLATE_ID,
  DEMO_FRAMES,
  DEMO_FONT_FAMILY,
  DEMO_FONT_URL,
  DEMO_MAX_AUTO_PAGES,
  DEMO_PAGE_PROFILES,
  DEMO_PAGES,
  DEMO_STORY_ID,
  INITIAL_TEXT,
} from './demo-document';
import type { DemoStyleControls } from './demo-document';
import type { Frame } from './model/types';
import type { AlphaMask } from './model/text-wrap';
import './App.css';

export default function App() {
  const [text, setText] = useState(INITIAL_TEXT);
  const engineRef = useRef<TextEngine | null>(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [algorithm, setAlgorithm] = useState<'kp' | 'greedy'>('kp');
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(DEMO_FRAMES[0]?.id ?? null);
  const [styleControls, setStyleControls] = useState<DemoStyleControls>(DEFAULT_DEMO_STYLE);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [coverPageCount, setCoverPageCount] = useState(200);
  const [coverPdfStatus, setCoverPdfStatus] =
    useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [coverPdfError, setCoverPdfError] = useState<string | null>(null);
  const [imageElementsByUrl, setImageElementsByUrl] = useState<Record<string, HTMLImageElement>>({});
  const [layoutInfo, setLayoutInfo] = useState<{
    overflow: boolean;
    lineCount: number;
    pageCount: number;
    frameCount: number;
    autoPages: number;
    preflightErrors: number;
    preflightWarnings: number;
    spineMm: number | null;
  }>({
    overflow: false,
    lineCount: 0,
    pageCount: DEMO_PAGES.length,
    frameCount: DEMO_FRAMES.length,
    autoPages: 0,
    preflightErrors: 0,
    preflightWarnings: 0,
    spineMm: null,
  });

  const demoDocument = useMemo(
    () => createDemoDocument(text, styleControls),
    [text, styleControls]
  );
  const imageUrls = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(demoDocument.frames)
            .filter(isImageFrame)
            .map((frame) => frame.imageUrl)
        )
      ),
    [demoDocument]
  );
  const imageFrames = useMemo(
    () => Object.values(demoDocument.frames).filter(isImageFrame),
    [demoDocument]
  );
  const wrapMasksByFrameId = useMemo(() => {
    const nextMasks: Record<string, AlphaMask> = {};
    for (const frame of imageFrames) {
      if (frame.textWrap.mode !== 'alpha-channel') continue;
      const image = imageElementsByUrl[frame.imageUrl];
      if (!image) continue;
      nextMasks[frame.id] = alphaMaskFromImage(image, frame.textWrap.alphaThreshold);
    }
    return nextMasks;
  }, [imageElementsByUrl, imageFrames]);
  const coverInput = useMemo(
    () => ({
      trimWidthInches: demoDocument.printProfile.trimWidth,
      trimHeightInches: demoDocument.printProfile.trimHeight,
      bleedInches: demoDocument.printProfile.bleed,
      pageCount: coverPageCount,
      stock: { formula: demoDocument.printProfile.spineFormula },
      title: 'Prelo Demo',
      subtitle: 'Capa tecnica de teste',
      author: 'Motor Prelo',
    }),
    [coverPageCount, demoDocument.printProfile]
  );
  const coverGeometry = useMemo(() => calculateCoverGeometry(coverInput), [coverInput]);
  const selectedProfile = DEMO_PAGE_PROFILES[selectedPageIndex];
  const selectedPageLabel = selectedProfile?.label ?? `Continuação ${selectedPageIndex + 1}`;
  const currentPageFrames = useMemo(() => {
    const page = demoDocument.pages[selectedPageIndex];
    if (!page) return [];
    return page.frames
      .map((frameId) => demoDocument.frames[frameId])
      .filter((frame): frame is Frame => !!frame);
  }, [demoDocument, selectedPageIndex]);
  const selectedFrame =
    currentPageFrames.find((frame) => frame.id === selectedFrameId) ?? null;

  // Carregar as fontes tipográficas em formato binário TTF
  useEffect(() => {
    let active = true;
    const loadFonts = async () => {
      try {
        await fontRegistry.loadFont(DEMO_FONT_FAMILY, DEMO_FONT_URL);
        if (active) {
          setFontsLoaded(true);
          console.log('Fontes carregadas e registradas com sucesso no opentype.js!');
        }
      } catch (err) {
        console.error('Erro ao carregar fontes para o Prelo:', err);
      }
    };
    loadFonts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    for (const url of imageUrls) {
      if (imageElementsByUrl[url]) continue;
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        setImageElementsByUrl((current) =>
          current[url] ? current : { ...current, [url]: image }
        );
      };
      image.src = url;
    }
    return () => {
      active = false;
    };
  }, [imageElementsByUrl, imageUrls]);

  const handleReady = useCallback((ctx: CanvasRenderingContext2D) => {
    engineRef.current = new TextEngine(ctx, {
      fontSize: DEFAULT_DEMO_STYLE.fontSize,
      fontFamily: DEMO_FONT_FAMILY,
      lineHeight: DEFAULT_DEMO_STYLE.lineHeight,
    });
  }, []);

  const updateStyle = useCallback(<K extends keyof DemoStyleControls,>(
    key: K,
    value: DemoStyleControls[K]
  ) => {
    setStyleControls((current) => ({ ...current, [key]: value }));
  }, []);

  const handleCanvasPointerDown = useCallback(
    (point: { x: number; y: number }) => {
      setSelectedFrameId(frameAtPoint(currentPageFrames, point.x, point.y)?.id ?? null);
    },
    [currentPageFrames]
  );

  const handleDraw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const engine = engineRef.current;
      if (!engine) return;

      // Pipeline real do documento: Document/Story -> engine -> layout -> render/PDF
      const pagination = engine.paginateStory(demoDocument, DEMO_STORY_ID, {
        algorithm,
        templatePageId: DEMO_AUTO_PAGE_TEMPLATE_ID,
        maxAutoPages: DEMO_MAX_AUTO_PAGES,
        wrapMasksByFrameId,
      });
      const result: LayoutResult = pagination.layout;
      const pageIndex = Math.min(selectedPageIndex, pagination.document.pages.length - 1);
      if (pageIndex !== selectedPageIndex) {
        setSelectedPageIndex(pageIndex);
      }
      const page = pagination.document.pages[pageIndex];
      const selectedFrames = page
        ? page.frames
            .map((frameId) => pagination.document.frames[frameId])
            .filter((frame): frame is (typeof DEMO_FRAMES)[number] => !!frame)
        : [];

      renderToCanvas(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, selectedFrames, result, {
        imageElementsByUrl,
        selectedFrameId,
      });

      // Atualizar info de layout para a UI
      const totalLines = result.frameLayouts.reduce(
        (sum, fl) => sum + fl.lines.length, 0
      );
      const preflightIssues = runPreflight(pagination.document, { layout: result });
      // Lombada física calculada a partir do perfil + contagem de páginas paginadas.
      const spine = spineWidthFromProfile(
        pagination.document.printProfile,
        pagination.document.pages.length
      );
      setLayoutInfo({
        overflow: result.overflow,
        lineCount: totalLines,
        pageCount: pagination.document.pages.length,
        frameCount: Object.keys(pagination.document.frames).length,
        autoPages: pagination.addedPages,
        preflightErrors: preflightIssues.filter((issue) => issue.severity === 'error').length,
        preflightWarnings: preflightIssues.filter((issue) => issue.severity === 'warning').length,
        spineMm: spine ? spine.mm : null,
      });
    },
    [algorithm, demoDocument, imageElementsByUrl, selectedFrameId, selectedPageIndex, wrapMasksByFrameId]
  );

  const handleExportPdf = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !fontsLoaded) {
      setPdfStatus('error');
      return;
    }

    setPdfStatus('generating');
    setPdfError(null);
    try {
      const fontResponse = await fetch(DEMO_FONT_URL);
      if (!fontResponse.ok) {
        throw new Error(`Fonte Lora nao encontrada: ${fontResponse.status}`);
      }
      const fontBytes = await fontResponse.arrayBuffer();
      const pagination = engine.paginateStory(demoDocument, DEMO_STORY_ID, {
        algorithm,
        templatePageId: DEMO_AUTO_PAGE_TEMPLATE_ID,
        maxAutoPages: DEMO_MAX_AUTO_PAGES,
        wrapMasksByFrameId,
      });
      const imageBytesByFrameId = await fetchImageBytesByFrameId(pagination.document.frames);
      const pdfBytes = await engine.documentToPdf(pagination.document, {
        algorithm,
        fontBytes,
        imageBytesByFrameId,
        wrapMasksByFrameId,
      });
      const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBuffer).set(pdfBytes);
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'prelo-demo.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPdfStatus('ready');
    } catch (err) {
      console.error('Erro ao exportar PDF do Prelo:', err);
      setPdfError(formatExportError(err));
      setPdfStatus('error');
    }
  }, [algorithm, demoDocument, fontsLoaded, wrapMasksByFrameId]);

  const handleExportCoverPdf = useCallback(async () => {
    setCoverPdfStatus('generating');
    setCoverPdfError(null);
    try {
      const pdfBytes = await renderCoverPdf(coverInput);
      const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBuffer).set(pdfBytes);
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'prelo-capa-tecnica.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setCoverPdfStatus('ready');
    } catch (err) {
      console.error('Erro ao exportar PDF de capa do Prelo:', err);
      setCoverPdfError(formatExportError(err));
      setCoverPdfStatus('error');
    }
  }, [coverInput]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <h1>Prelo</h1>
          <span className="version">v0.1 — Motor de Diagramação</span>
        </div>

        <div className="text-toolbar" aria-label="Controles de texto">
          <label className="toolbar-field toolbar-font">
            <span>Fonte</span>
            <select value={DEMO_FONT_FAMILY} disabled>
              <option value={DEMO_FONT_FAMILY}>{DEMO_FONT_FAMILY}</option>
            </select>
          </label>

          <label className="toolbar-field toolbar-number">
            <span>Corpo</span>
            <input
              type="number"
              min="8"
              max="24"
              step="1"
              value={styleControls.fontSize}
              onChange={(e) => updateStyle('fontSize', Number(e.target.value))}
            />
          </label>

          <label className="toolbar-field toolbar-number">
            <span>Entrelinha</span>
            <input
              type="number"
              min="1"
              max="2.4"
              step="0.1"
              value={styleControls.lineHeight}
              onChange={(e) => updateStyle('lineHeight', Number(e.target.value))}
            />
          </label>

          <div className="toolbar-group">
            <span>Alinhar</span>
            <div className="segmented-control" aria-label="Alinhamento">
              {([
                ['left', 'E'],
                ['center', 'C'],
                ['right', 'D'],
                ['justify', 'J'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={styleControls.alignment === value ? 'active' : ''}
                  onClick={() => updateStyle('alignment', value)}
                  title={value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="toolbar-field toolbar-number">
            <span>Recuo</span>
            <input
              type="number"
              min="0"
              max="80"
              step="1"
              value={styleControls.indent}
              onChange={(e) => updateStyle('indent', Number(e.target.value))}
            />
          </label>

          <label className="toolbar-field toolbar-number">
            <span>Antes</span>
            <input
              type="number"
              min="0"
              max="40"
              step="1"
              value={styleControls.spaceBefore}
              onChange={(e) => updateStyle('spaceBefore', Number(e.target.value))}
            />
          </label>

          <label className="toolbar-field toolbar-number">
            <span>Depois</span>
            <input
              type="number"
              min="0"
              max="40"
              step="1"
              value={styleControls.spaceAfter}
              onChange={(e) => updateStyle('spaceAfter', Number(e.target.value))}
            />
          </label>

          <div className="toolbar-group toolbar-breaker">
            <span>Quebra</span>
            <div className="segmented-control" aria-label="Algoritmo de quebra">
              <button
                type="button"
                className={algorithm === 'kp' ? 'active' : ''}
                onClick={() => setAlgorithm('kp')}
              >
                KP
              </button>
              <button
                type="button"
                className={algorithm === 'greedy' ? 'active' : ''}
                onClick={() => setAlgorithm('greedy')}
              >
                Greedy
              </button>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <span className={`font-status ${fontsLoaded ? 'loaded' : 'loading'}`}>
            {fontsLoaded ? `● ${DEMO_FONT_FAMILY}` : '○ Fonte'}
          </span>
          <button
            type="button"
            className="toolbar-export"
            onClick={handleExportPdf}
            disabled={!fontsLoaded || pdfStatus === 'generating'}
          >
            {!fontsLoaded && 'Aguardando'}
            {fontsLoaded && pdfStatus === 'generating' && 'Gerando'}
            {fontsLoaded && pdfStatus !== 'generating' && 'Exportar PDF'}
          </button>
        </div>
      </header>

      <div className="workspace">
      <div className="sidebar">
        <div className="section">
          <label htmlFor="textInput" className="label">Story (Texto Contínuo)</label>
          <textarea
            id="textInput"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite seu texto aqui..."
          />
        </div>

        <div className="section selection-panel">
          <label className="label">Selecionado</label>
          <div className="selection-summary">
            <span className="selection-kind">
              {selectedFrame?.type === 'image' && 'Imagem'}
              {selectedFrame?.type === 'text' && 'Texto'}
              {!selectedFrame && 'Documento'}
            </span>
            <span className="selection-id">{selectedFrame?.id ?? 'sem seleção'}</span>
          </div>
          {selectedFrame && (
            <dl className="selection-meta">
              <div>
                <dt>Página</dt>
                <dd>{selectedFrame.pageId}</dd>
              </div>
              <div>
                <dt>Posição</dt>
                <dd>
                  {Math.round(selectedFrame.x)}×{Math.round(selectedFrame.y)}
                </dd>
              </div>
              <div>
                <dt>Tamanho</dt>
                <dd>
                  {Math.round(selectedFrame.width)}×{Math.round(selectedFrame.height)}
                </dd>
              </div>
              {isImageFrame(selectedFrame) && (
                <div>
                  <dt>Wrap</dt>
                  <dd>
                    {selectedFrame.textWrap.mode} / {selectedFrame.textWrap.sides}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div className="section stats">
          <div className="stat">
            <span className="stat-label">Linhas</span>
            <span className="stat-value">{layoutInfo.lineCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Páginas</span>
            <span className="stat-value">{layoutInfo.pageCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Frames</span>
            <span className="stat-value">{layoutInfo.frameCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Auto</span>
            <span className="stat-value">+{layoutInfo.autoPages}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Preflight</span>
            <span
              className={`stat-value ${
                layoutInfo.preflightErrors > 0 ? 'overflow-yes' : 'overflow-no'
              }`}
            >
              {layoutInfo.preflightErrors}/{layoutInfo.preflightWarnings}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Overflow</span>
            <span className={`stat-value ${layoutInfo.overflow ? 'overflow-yes' : 'overflow-no'}`}>
              {layoutInfo.overflow ? '⊕ Sim' : '✓ Não'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Lombada</span>
            <span className="stat-value">
              {layoutInfo.spineMm != null ? `${layoutInfo.spineMm.toFixed(1)} mm` : '—'}
            </span>
          </div>
        </div>

        <div className="section">
          {pdfStatus !== 'idle' && (
            <span className={`export-status ${pdfStatus}`}>
              {pdfStatus === 'ready' && 'PDF gerado'}
              {pdfStatus === 'error' && 'Erro ao gerar PDF'}
              {pdfStatus === 'generating' && 'Preparando arquivo'}
            </span>
          )}
          {pdfError && <span className="export-error-detail">{pdfError}</span>}

          <div className="cover-export">
            <label className="field">
              <span>Páginas p/ capa</span>
              <input
                type="number"
                min="1"
                max="828"
                step="1"
                value={coverPageCount}
                onChange={(e) => {
                  const next = Math.trunc(Number(e.target.value));
                  setCoverPageCount(Number.isFinite(next) ? Math.min(828, Math.max(1, next)) : 1);
                }}
              />
            </label>
            <span className="cover-meta">
              Lombada teste: {coverGeometry.spine.mm.toFixed(1)} mm · Arquivo:{' '}
              {coverGeometry.fullWidthInches.toFixed(3)}×{coverGeometry.fullHeightInches.toFixed(3)} in
            </span>
            <button
              type="button"
              className="export-btn cover-btn"
              onClick={handleExportCoverPdf}
              disabled={coverPdfStatus === 'generating'}
            >
              {coverPdfStatus === 'generating' ? 'Gerando capa...' : 'Exportar Capa PDF'}
            </button>
            {coverPdfStatus !== 'idle' && (
              <span className={`export-status ${coverPdfStatus}`}>
                {coverPdfStatus === 'ready' && 'Capa gerada'}
                {coverPdfStatus === 'error' && 'Erro ao gerar capa'}
                {coverPdfStatus === 'generating' && 'Preparando capa'}
              </span>
            )}
            {coverPdfError && <span className="export-error-detail">{coverPdfError}</span>}
          </div>
        </div>

        <div className="section pipeline-info">
          <h3>Pipeline Ativo</h3>
          <div className="pipeline">
            <span className="pipe-step active">Tokenizer</span>
            <span className="pipe-arrow">→</span>
            <span className="pipe-step active">Shaper</span>
            <span className="pipe-arrow">→</span>
            <span className={`pipe-step ${algorithm === 'kp' ? 'active' : 'disabled'}`} title="Hifenização + quebra Knuth-Plass">
              Line Breaker (KP)
            </span>
            <span className="pipe-arrow">→</span>
            <span className="pipe-step active">Frame Filler</span>
            <span className="pipe-arrow">→</span>
            <span className="pipe-step active">Canvas</span>
            <span className="pipe-arrow">/</span>
            <span className="pipe-step active">PDF</span>
          </div>
        </div>
      </div>

      <div className="canvas-area">
        <div className="canvas-header">
          <div>
            <h2>Prelo — Preview</h2>
            <span className="page-context">
              Página {selectedPageIndex + 1} de {layoutInfo.pageCount} · {selectedPageLabel}
            </span>
          </div>
          <div className="page-selector" aria-label="Selecionar página de teste">
            {Array.from({ length: layoutInfo.pageCount }, (_, index) => {
              const profile = DEMO_PAGE_PROFILES[index];
              return (
              <button
                key={profile?.id ?? `auto-page-${index + 1}`}
                type="button"
                className={`page-btn ${index === selectedPageIndex ? 'active' : ''}`}
                title={profile?.description ?? 'Pagina de continuacao criada automaticamente'}
                onClick={() => {
                  setSelectedPageIndex(index);
                  const page = demoDocument.pages[index];
                  const firstTextFrameId =
                    page?.frames.find((frameId) => demoDocument.frames[frameId]?.type === 'text') ??
                    page?.frames[0] ??
                    null;
                  setSelectedFrameId(firstTextFrameId);
                }}
              >
                {index + 1}
              </button>
              );
            })}
          </div>
        </div>
        <Canvas
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onReady={handleReady}
          onDraw={handleDraw}
          onPointerDown={handleCanvasPointerDown}
        />
      </div>
      </div>
    </div>
  );
}

async function fetchImageBytesByFrameId(frames: Record<string, Frame>) {
  const entries = await Promise.all(
    Object.values(frames)
      .filter(isImageFrame)
      .map(async (frame) => {
        const response = await fetch(frame.imageUrl);
        if (!response.ok) {
          throw new Error(`Imagem "${frame.id}" nao encontrada: ${response.status}`);
        }
        return [frame.id, await response.arrayBuffer()] as const;
      })
  );
  return Object.fromEntries(entries);
}

function alphaMaskFromImage(image: HTMLImageElement, alphaThreshold: number): AlphaMask {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { width: 1, height: 1, alpha: new Uint8Array([255]), threshold: 1 };
  }

  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = pixels[i * 4 + 3] ?? 0;
  }

  return {
    width,
    height,
    alpha,
    threshold: Math.round(alphaThreshold * 255),
  };
}
