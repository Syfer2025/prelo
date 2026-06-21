declare module 'hypher' {
  export default class Hypher {
    constructor(pattern: unknown);
    hyphenate(word: string): string[];
    hyphenateText(text: string): string;
  }
}

declare module 'hyphenation.pt' {
  const pattern: unknown;
  export default pattern;
}

declare module 'tex-linebreak' {
  export interface Box {
    type: 'box';
    width: number;
    text: string;
    style?: unknown;
  }
  export interface Glue {
    type: 'glue';
    width: number;
    stretch: number;
    shrink: number;
    text?: string;
  }
  export interface Penalty {
    type: 'penalty';
    width: number;
    cost: number;
    flagged: boolean;
  }

  export type BreakItem = Box | Glue | Penalty;

  export interface Breakpoint {
    position: number;
    demerits: number;
    ratio: number;
    line: number;
  }

  export interface BreakOptions {
    /** Opções reais do tex-linebreak (ver dist/types/src/layout.d.ts → `Options`). */
    maxAdjustmentRatio?: number | null;
    initialMaxAdjustmentRatio?: number;
    doubleHyphenPenalty?: number;
    adjacentLooseTightPenalty?: number;
    /** Campos legados deste shim, mantidos por compatibilidade. */
    measureFn?: (word: string) => number;
    glueStretchFactor?: number;
    glueShrinkFactor?: number;
    preset?: string;
    tolerance?: number;
  }

  const texLinebreak: {
    breakLines(items: BreakItem[], width: number | number[], options?: BreakOptions): number[];
    layoutItemsFromString(text: string, measureFn: (word: string) => number): BreakItem[];
    MIN_COST: number;
    MAX_COST: number;
  };

  export default texLinebreak;
}
