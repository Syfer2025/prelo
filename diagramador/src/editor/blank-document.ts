/**
 * blank-document — fábrica de documento/página em branco para o EDITOR do produto.
 *
 * Reutiliza o modelo do motor estável (`Document`/`Page`/`Frame`/`Story`) para que o
 * `engine-adapter` consiga exportar PDF sem nenhuma conversão. Lógica pura e determinística.
 */
import {
  DEFAULT_CHARACTER_STYLE,
  DEFAULT_PARAGRAPH_STYLE,
  PRINT_PROFILE_KDP_6x9,
} from '../model/types';
import type { Document, Frame, Page, ParagraphStyle, Story } from '../model/types';

export const BLANK_PROJECT_NAME = 'Livro sem título';
export const BLANK_BODY_STYLE_ID = 'body';
export const BLANK_STORY_ID = 'story-main';

/** 6×9" a 72 dpi → 432×648 pt. */
export const BLANK_PAGE_WIDTH = 432;
export const BLANK_PAGE_HEIGHT = 648;
/** Margem padrão confortável de livro (0,75" = 54 pt em todos os lados). */
export const BLANK_PAGE_MARGIN = 54;
/** Fonte com TTF real disponível no projeto (a única embutível no PDF por enquanto). */
export const BLANK_FONT_FAMILY = 'Crimson Text';
export const BLANK_FONT_SIZE = 15;

export function pageIdFor(n: number): string {
  return `page-${n}`;
}
export function frameIdFor(n: number): string {
  return `frame-page-${n}`;
}
export function storyIdFor(n: number): string {
  return `story-page-${n}`;
}

/**
 * Estilo de parágrafo base do editor (corpo de livro).
 * Preset editorial: justificação por padrão. Combinado com o algoritmo Knuth-Plass +
 * hifenização pt-BR (ver `editor-layout.ts` e `engine/line-breaker.ts`), produz uma mancha
 * de texto com margem direita regular, como corpo de livro impresso.
 */
export function createBlankBodyStyle(): ParagraphStyle {
  return {
    ...DEFAULT_PARAGRAPH_STYLE,
    name: 'Corpo',
    alignment: 'justify',
    characterStyle: {
      ...DEFAULT_CHARACTER_STYLE,
      fontFamily: BLANK_FONT_FAMILY,
      fontSize: BLANK_FONT_SIZE,
    },
  };
}

/**
 * Cria o conjunto página + frame de texto para a página número `n` (1-based).
 * Todas as páginas do editor apontam para a mesma story principal; frames são janelas
 * encadeadas sobre o manuscrito contínuo.
 */
export function createBlankPageBundle(
  n: number,
  storyId = BLANK_STORY_ID,
  prevFrameId: string | null = null
): { page: Page; frame: Frame; story: Story } {
  const pageId = pageIdFor(n);
  const frameId = frameIdFor(n);

  const page: Page = {
    id: pageId,
    width: BLANK_PAGE_WIDTH,
    height: BLANK_PAGE_HEIGHT,
    margins: {
      top: BLANK_PAGE_MARGIN,
      bottom: BLANK_PAGE_MARGIN,
      inside: BLANK_PAGE_MARGIN,
      outside: BLANK_PAGE_MARGIN,
    },
    bleed: 0,
    side: 'single',
    masterPageId: null,
    frames: [frameId],
  };

  const frame: Frame = {
    id: frameId,
    pageId,
    x: BLANK_PAGE_MARGIN,
    y: BLANK_PAGE_MARGIN,
    width: BLANK_PAGE_WIDTH - BLANK_PAGE_MARGIN * 2,
    height: BLANK_PAGE_HEIGHT - BLANK_PAGE_MARGIN * 2,
    rotation: 0,
    type: 'text',
    storyId,
    nextFrameId: null,
    prevFrameId,
  };

  const story: Story = {
    id: storyId,
    frameChainIds: [frameId],
    paragraphs: [{ styleId: BLANK_BODY_STYLE_ID, spans: [{ text: '' }] }],
  };

  return { page, frame, story };
}

/** Documento em branco: uma página 6×9 com um frame de texto dentro das margens. */
export function createBlankDocument(): Document {
  const { page, frame, story } = createBlankPageBundle(1);
  return {
    pages: [page],
    frames: { [frame.id]: frame },
    stories: [story],
    styles: { [BLANK_BODY_STYLE_ID]: createBlankBodyStyle() },
    characterStyles: {},
    masterPages: {},
    defaultStyleId: BLANK_BODY_STYLE_ID,
    facingPages: false,
    printProfile: PRINT_PROFILE_KDP_6x9,
    baselineGrid: null,
  };
}
