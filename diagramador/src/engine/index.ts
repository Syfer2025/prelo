/**
 * Prelo Engine — API pública do motor de composição.
 * 
 * Este é o ponto de entrada: recebe texto bruto + frames → produz LayoutResult.
 * Orquestra o pipeline: Tokenizer → Shaper → Frame Filler.
 */

import type { Frame, CharacterStyle, Span, Document, ParagraphStyle, Story } from '../model/types';
import type { LayoutResult, Token } from './types';
import { TokenType } from './types';
import { tokenize } from './tokenizer';
import { shapeTokens, createCanvasMeasureFn } from './shaper';
import type { MeasureFn } from './shaper';
import { fillFrames } from './frame-filler';
import type { AlphaMask } from '../model/text-wrap';
import { createOpentypeMeasureFn } from '../fonts/font-metrics';
import {
  frameRectOnPage,
  framesFromPhysicalGeometry,
  normalizeDocumentGeometry,
} from '../model/physical-geometry';
import { computePdfPlacements } from './pdf-layout';
import { renderPdf } from './pdf-export';

export interface EngineConfig {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
}

export interface FlowOptions {
  measureFn?: MeasureFn;
  algorithm?: 'kp' | 'greedy';
  wrapMasksByFrameId?: Record<string, AlphaMask>;
}

export interface DocumentToPdfOptions extends FlowOptions {
  fontBytes?: Uint8Array | ArrayBuffer;
  imageBytesByFrameId?: Record<string, Uint8Array | ArrayBuffer>;
}

export interface PaginateStoryOptions extends FlowOptions {
  /** Quantas páginas novas o motor pode criar antes de devolver overflow. */
  maxAutoPages?: number;
  /** Página usada como molde. Padrão: última página que contém frame da story. */
  templatePageId?: string;
}

export interface PaginationResult {
  document: Document;
  layout: LayoutResult;
  addedPages: number;
  iterations: number;
}

/**
 * Classe principal do motor de composição.
 * Recebe um CanvasRenderingContext2D para medição (Fase 0).
 */
export class TextEngine {
  private ctx: CanvasRenderingContext2D;
  private config: EngineConfig;

  constructor(ctx: CanvasRenderingContext2D, config?: Partial<EngineConfig>) {
    this.ctx = ctx;
    this.config = {
      fontSize: config?.fontSize ?? 15,
      fontFamily: config?.fontFamily ?? 'Georgia, serif',
      lineHeight: config?.lineHeight ?? 1.5,
    };
  }

  /**
   * Processa texto bruto (string) e flui entre os frames dados.
   * 
   * Esta é a API simples da demo. Para documento estruturado, use flowStory().
   */
  flowText(text: string, frames: Frame[], options?: FlowOptions): LayoutResult {
    const baseStyle: CharacterStyle = {
      fontFamily: this.config.fontFamily,
      fontSize: this.config.fontSize,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#1f2d44',
      letterSpacing: 0,
      underline: false,
      strikethrough: false,
      textCase: 'normal',
      baselineShift: 'normal',
    };

    // Converter texto bruto em um único Span
    const spans: Span[] = [{ text }];

    // Pipeline: Tokenize → Shape → Fill
    // O leading da demo vem do EngineConfig (multiplicador).
    const tokens = tokenize(spans, baseStyle).map((token) => ({
      ...token,
      lineHeight: this.config.lineHeight,
    }));
    const measureFn = this.resolveMeasureFn(options?.measureFn);

    const shapedTokens = shapeTokens(tokens, measureFn);
    const result = fillFrames(shapedTokens, frames, { 
      measureFn,
      algorithm: options?.algorithm ?? 'kp'
    });

    return result;
  }

  /**
   * Processa uma Story real do Document, resolvendo a cadeia de frames por ID.
   *
   * Esta é a primeira API da Fase 1: o conteúdo passa a vir do modelo de
   * documento, enquanto o preenchimento ainda reutiliza o Frame Filler da Fase 0R.
   */
  flowStory(document: Document, storyId: string, options?: FlowOptions): LayoutResult {
    const story = document.stories.find((candidate) => candidate.id === storyId);
    if (!story) {
      throw new Error(`Story "${storyId}" not found`);
    }

    // Fonte da verdade do layout: geometria física normalizada (pontos, relativa ao trim).
    const geometry = normalizeDocumentGeometry(document);
    const frames = framesFromPhysicalGeometry(geometry, story.frameChainIds, storyId);

    const tokens: Token[] = [];
    for (let pIdx = 0; pIdx < story.paragraphs.length; pIdx++) {
      const paragraph = story.paragraphs[pIdx]!;
      const paragraphStyle = document.styles[paragraph.styleId];
      if (!paragraphStyle) {
        throw new Error(`Paragraph style "${paragraph.styleId}" not found`);
      }

      // Propriedades de parágrafo (leading, espaçamento e alinhamento) viajam nos tokens.
      const paragraphTokens = tokenize(paragraph.spans, paragraphStyle.characterStyle).map(
        (token) => ({
          ...token,
          lineHeight: paragraphStyle.lineHeight,
          spaceBefore: paragraphStyle.spaceBefore,
          spaceAfter: paragraphStyle.spaceAfter,
          align: paragraphStyle.alignment,
          indent: paragraphStyle.indent,
          orphans: paragraphStyle.orphans,
          widows: paragraphStyle.widows,
          keepLinesTogether: paragraphStyle.keepLinesTogether,
          pageBreakBefore: paragraphStyle.pageBreakBefore,
          keepWithNext: paragraphStyle.keepWithNext,
        })
      );
      tokens.push(...paragraphTokens);

      if (pIdx < story.paragraphs.length - 1) {
        tokens.push(this.createParagraphBreak(paragraphStyle));
      }
    }

    const measureFn = this.resolveMeasureFn(options?.measureFn);
    const shapedTokens = shapeTokens(tokens, measureFn);
    const result = fillFrames(shapedTokens, frames, {
      measureFn,
      algorithm: options?.algorithm ?? 'kp',
      wrapFrames: Object.values(document.frames),
      wrapMasksByFrameId: options?.wrapMasksByFrameId,
      baselineGrid: document.baselineGrid ?? undefined,
      pages: document.pages,
    });

    // Anexa a cada frame sua origem física absoluta na página (TrimBox + rectOnTrim),
    // para o futuro PDF posicionar sem recalcular o layout.
    return {
      ...result,
      frameLayouts: result.frameLayouts.map((frameLayout) => ({
        ...frameLayout,
        rectOnPage: frameRectOnPage(geometry, frameLayout.frameId),
      })),
    };
  }

  /**
   * Gera o PDF (RGB) do documento inteiro: roda todas as stories, junta os frame
   * layouts, calcula os placements físicos e materializa via pdf-lib.
   * Quando `fontBytes` é informado, embute a TTF real usada no layout.
   */
  async documentToPdf(document: Document, options?: DocumentToPdfOptions): Promise<Uint8Array> {
    const geometry = normalizeDocumentGeometry(document);
    const frameLayouts = document.stories.flatMap(
      (story) => this.flowStory(document, story.id, options).frameLayouts
    );
    return renderPdf(computePdfPlacements(geometry, frameLayouts, document.frames), {
      fontBytes: options?.fontBytes,
      imageBytesByFrameId: options?.imageBytesByFrameId,
    });
  }

  /**
   * Pagina uma Story automaticamente clonando uma página-template enquanto houver
   * overflow. Reprocessa a story inteira a cada rodada (Frame Filler segue puro), mas
   * CRESCE as páginas EM LOTE: estima quantas faltam pela proporção de texto que coube
   * e adiciona várias de uma vez. A estimativa usa `floor` (SUBESTIMA), então nunca cria
   * páginas em branco — o laço apenas converge para a contagem mínima, igual à versão
   * 1-a-1, mas em ~poucas iterações em vez de O(páginas). Crítico para manuscritos longos.
   */
  paginateStory(
    document: Document,
    storyId: string,
    options: PaginateStoryOptions = {}
  ): PaginationResult {
    const working = cloneDocument(document);
    const maxAutoPages = options.maxAutoPages ?? 50;
    const totalChars = storyCharCount(working, storyId);
    let addedPages = 0;
    let iterations = 1;
    let layout = this.flowStory(working, storyId, options);

    // Capacidade (chars) de UMA auto-página, medida na 1ª adicionada. As auto-páginas são
    // clones do mesmo template (homogêneas), então uma medição real estima as demais com
    // precisão — mesmo quando as páginas iniciais têm capacidades diferentes (caso do demo).
    let placedBefore = Math.max(0, totalChars - layout.overflowText.length);
    let autoPageCapacity = 0;

    while (layout.overflow && addedPages < maxAutoPages) {
      let bulk = 1; // 1ª rodada é uma sonda: adiciona 1 e mede a capacidade real
      if (autoPageCapacity > 0) {
        // SUBESTIMA (floor) → nunca cria página em branco; o laço converge para o mínimo.
        bulk = Math.max(1, Math.floor(layout.overflowText.length / autoPageCapacity));
      }
      bulk = Math.min(bulk, maxAutoPages - addedPages);
      for (let i = 0; i < bulk; i++) {
        appendAutoPageForStory(working, storyId, options);
        addedPages++;
      }
      iterations++;
      layout = this.flowStory(working, storyId, options);

      const placedNow = Math.max(0, totalChars - layout.overflowText.length);
      if (autoPageCapacity === 0 && bulk > 0) {
        autoPageCapacity = Math.max(0, (placedNow - placedBefore) / bulk);
      }
      placedBefore = placedNow;
    }

    return {
      document: working,
      layout,
      addedPages,
      iterations,
    };
  }

  private resolveMeasureFn(measureFn?: MeasureFn): MeasureFn {
    if (measureFn) return measureFn;
    const canvasMeasureFn = createCanvasMeasureFn(this.ctx);
    return createOpentypeMeasureFn(canvasMeasureFn);
  }

  private createParagraphBreak(paragraphStyle: ParagraphStyle): Token {
    return {
      type: TokenType.NEWLINE,
      value: '\n',
      style: paragraphStyle.characterStyle,
      lineHeight: paragraphStyle.lineHeight,
    };
  }
}

// Re-exports para conveniência
export type { LayoutResult, FrameLayout, LayoutLine } from './types';
export { TokenType } from './types';

function cloneDocument(document: Document): Document {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      margins: { ...page.margins },
      frames: [...page.frames],
    })),
    frames: Object.fromEntries(
      Object.entries(document.frames).map(([id, frame]) => [id, { ...frame }])
    ),
    stories: document.stories.map((story) => ({
      ...story,
      frameChainIds: [...story.frameChainIds],
      paragraphs: story.paragraphs.map((paragraph) => ({
        ...paragraph,
        spans: paragraph.spans.map((span) => ({
          ...span,
          styleOverrides: span.styleOverrides ? { ...span.styleOverrides } : undefined,
        })),
      })),
    })),
  };
}

function appendAutoPageForStory(
  document: Document,
  storyId: string,
  options: PaginateStoryOptions
): void {
  const story = findStory(document, storyId);
  const templatePage = findTemplatePage(document, story, options.templatePageId);
  const sourceFrames = templatePage.frames
    .map((frameId) => document.frames[frameId])
    .filter((frame): frame is Frame => !!frame && frame.type === 'text' && frame.storyId === storyId);

  if (sourceFrames.length === 0) {
    throw new Error(`Template page "${templatePage.id}" has no text frames for story "${storyId}"`);
  }

  const pageId = uniqueId(`auto-page-${document.pages.length + 1}`, (id) =>
    document.pages.some((page) => page.id === id)
  );
  const newFrameIds = sourceFrames.map((frame, index) =>
    uniqueId(`${pageId}-${frame.id}-${index + 1}`, (id) => !!document.frames[id])
  );
  const previousLastFrameId = story.frameChainIds.at(-1) ?? null;

  const newFrames = sourceFrames.map((frame, index): Frame => ({
    ...frame,
    id: newFrameIds[index]!,
    pageId,
    storyId,
    prevFrameId: index === 0 ? previousLastFrameId : newFrameIds[index - 1]!,
    nextFrameId: index === sourceFrames.length - 1 ? null : newFrameIds[index + 1]!,
  }));

  if (previousLastFrameId && document.frames[previousLastFrameId]) {
    document.frames[previousLastFrameId]!.nextFrameId = newFrameIds[0]!;
  }

  document.pages.push({
    ...templatePage,
    id: pageId,
    margins: { ...templatePage.margins },
    frames: newFrameIds,
  });

  for (const frame of newFrames) {
    document.frames[frame.id] = frame;
  }
  story.frameChainIds.push(...newFrameIds);
}

function findStory(document: Document, storyId: string): Story {
  const story = document.stories.find((candidate) => candidate.id === storyId);
  if (!story) {
    throw new Error(`Story "${storyId}" not found`);
  }
  return story;
}

/** Total de caracteres do texto da story (com separadores de parágrafo). Usado na estimativa de páginas. */
function storyCharCount(document: Document, storyId: string): number {
  const story = document.stories.find((candidate) => candidate.id === storyId);
  if (!story) return 0;
  let count = 0;
  for (const paragraph of story.paragraphs) {
    for (const span of paragraph.spans) count += span.text.length;
  }
  return count + Math.max(0, story.paragraphs.length - 1);
}

function findTemplatePage(document: Document, story: Story, templatePageId?: string) {
  if (templatePageId) {
    const explicit = document.pages.find((page) => page.id === templatePageId);
    if (!explicit) {
      throw new Error(`Template page "${templatePageId}" not found`);
    }
    return explicit;
  }

  for (let index = story.frameChainIds.length - 1; index >= 0; index--) {
    const frame = document.frames[story.frameChainIds[index]!];
    const page = frame ? document.pages.find((candidate) => candidate.id === frame.pageId) : null;
    if (page) return page;
  }

  const lastPage = document.pages.at(-1);
  if (!lastPage) {
    throw new Error('Cannot paginate a document without pages');
  }
  return lastPage;
}

function uniqueId(base: string, exists: (id: string) => boolean): string {
  if (!exists(base)) return base;

  let index = 2;
  let candidate = `${base}-${index}`;
  while (exists(candidate)) {
    index++;
    candidate = `${base}-${index}`;
  }
  return candidate;
}
