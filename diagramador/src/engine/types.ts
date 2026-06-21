/**
 * Tipos do Pipeline de Composição
 * 
 * Tokenizer → Shaper → Line Breaker → Frame Filler → LayoutResult
 */

import type { CharacterStyle } from '../model/types';

// ─── Tokens ─────────────────────────────────────────────────

export const TokenType = {
  WORD: 'word',
  SPACE: 'space',
  NEWLINE: 'newline',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface Token {
  type: TokenType;
  value: string;
  style: CharacterStyle;
  /**
   * Leading (entrelinha) do parágrafo a que o token pertence, como MULTIPLICADOR
   * do fontSize (ex.: 1.5 = 150%). Opcional: quando ausente, o Frame Filler usa
   * o fallback padrão (1.5). Carregado aqui porque o leading é uma propriedade do
   * parágrafo e precisa viajar com os tokens até a quebra/preenchimento de linhas.
   */
  lineHeight?: number;
  /** Espaço (px) antes do parágrafo. Suprimido no topo do frame. */
  spaceBefore?: number;
  /** Espaço (px) depois do parágrafo. */
  spaceAfter?: number;
  /** Alinhamento horizontal do parágrafo. `justify` ainda se comporta como `left`. */
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Recuo (px) da PRIMEIRA linha do parágrafo. */
  indent?: number;
  /** Mínimo de linhas iniciais do parágrafo que podem ficar no rodapé de um frame. */
  orphans?: number;
  /** Mínimo de linhas finais do parágrafo que podem ficar no topo do frame seguinte. */
  widows?: number;
  /** Não dividir o parágrafo entre frames: se não couber inteiro, move-o todo adiante. */
  keepLinesTogether?: boolean;
  /** Forçar início do parágrafo no topo de um novo frame. */
  pageBreakBefore?: boolean;
  /** Não separar este parágrafo do início do próximo (ex.: títulos). Lookahead. */
  keepWithNext?: boolean;
  /** Hífen inserido pelo motor em quebra silábica; deve sumir se a linha for refluída. */
  softHyphen?: boolean;
  /** Palavra original de um fragmento gerado pelo quebrador de linha. */
  hyphenSource?: string;
}

// ─── Shaped Tokens (com métricas) ───────────────────────────

export interface ShapedToken extends Token {
  width: number;  // largura medida em pixels
}

// ─── Saída do Frame Filler ──────────────────────────────────

export interface PositionedGlyph {
  char: string;
  x: number;        // offset X relativo à linha
  advance: number;  // largura do glifo
}

/** Segmento posicionado dentro de uma linha (token com x/largura próprios). */
export interface LayoutRun {
  text: string;
  x: number;        // offset X relativo ao INÍCIO da linha (line.x)
  width: number;    // largura do run (espaços podem esticar na justificação)
  style: CharacterStyle;
}

export interface LayoutLine {
  text: string;
  x: number;         // posição X local (relativa à esquerda do frame) — alinhamento
  y: number;         // posição Y local (relativa ao topo do frame)
  width: number;     // largura NATURAL da linha (soma dos tokens, sem esticar)
  height: number;    // altura da linha (lineHeight em px)
  style: CharacterStyle;
  runs: LayoutRun[]; // segmentos posicionados; base para justificação e PDF
}

export interface FrameLayout {
  frameId: string;
  lines: LayoutLine[];
  /**
   * Retângulo do frame em coordenadas físicas ABSOLUTAS da página (pontos),
   * relativo ao MediaBox = offset do TrimBox + rectOnTrim. Preenchido por
   * `flowStory()` a partir da geometria física; permite ao futuro PDF posicionar
   * o frame sem recalcular o layout. As linhas (`lines`) seguem relativas ao topo
   * do frame (independentes do bleed).
   */
  rectOnPage?: { x: number; y: number; width: number; height: number };
}

export interface LayoutResult {
  frameLayouts: FrameLayout[];
  overflow: boolean;     // sobrou texto sem frame
  overflowText: string;  // o texto que não coube
}

// ─── Estado da Máquina ──────────────────────────────────────

export const FillerState = {
  IDLE: 'IDLE',
  CONSUMING: 'CONSUMING',
  LINE_FULL: 'LINE_FULL',
  CHECK_HEIGHT: 'CHECK_HEIGHT',
  SWITCH_FRAME: 'SWITCH_FRAME',
  DONE: 'DONE',
} as const;

export type FillerState = (typeof FillerState)[keyof typeof FillerState];
