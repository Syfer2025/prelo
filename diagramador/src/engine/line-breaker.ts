import type { ShapedToken } from './types';
import type { MeasureFn } from './shaper';
import { TokenType } from './types';
import Hypher from 'hypher';
import portuguese from 'hyphenation.pt';
import texLinebreak from 'tex-linebreak';

const hypher = new Hypher(portuguese);
const MIN_HYPHENATED_WORD_LENGTH = 10;
const MIN_HYPHEN_FRAGMENT_LENGTH = 4;
const NATURAL_WORD_RE = /^[a-záàâãéêíóôõúüç]+$/;

/**
 * Opções editoriais do Knuth-Plass.
 * - `maxAdjustmentRatio: null` → nunca lança `MaxAdjustmentExceededError`. Sem isso, uma linha
 *   que não pode ser esticada até a largura (ex.: palavra longa isolada) fazia o KP falhar e cair
 *   no greedy, jogando a palavra inteira para a linha seguinte em vez de hifenizar.
 * - `doubleHyphenPenalty` → desencoraja linhas hifenizadas consecutivas (estética de corpo de livro).
 * - `adjacentLooseTightPenalty` → suaviza diferenças de espaçamento entre linhas vizinhas.
 */
const KP_BREAK_OPTIONS = {
  maxAdjustmentRatio: null,
  doubleHyphenPenalty: 120,
  adjacentLooseTightPenalty: 10,
} as const;

interface CustomBox {
  type: 'box';
  width: number;
  text: string;
  tokenRef: ShapedToken;
  isSyllable?: boolean;
  isLastSyllable?: boolean;
}

interface CustomGlue {
  type: 'glue';
  width: number;
  stretch: number;
  shrink: number;
  text: string;
  tokenRef: ShapedToken;
}

interface CustomPenalty {
  type: 'penalty';
  cost: number;
  width: number;
  flagged: boolean;
  isHyphen?: boolean;
  hyphenWidth?: number;
}

type CustomBreakItem = CustomBox | CustomGlue | CustomPenalty;

/**
 * Divide os tokens de uma Story em parágrafos separados por NEWLINE.
 */
export function splitIntoParagraphs(tokens: ShapedToken[]): ShapedToken[][] {
  const paragraphs: ShapedToken[][] = [];
  let current: ShapedToken[] = [];

  for (const token of tokens) {
    if (token.type === TokenType.NEWLINE) {
      paragraphs.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }

  paragraphs.push(current); // Último parágrafo
  return paragraphs;
}

/**
 * Converte ShapedToken[] em boxes, glues e penalties do TeX.
 */
export function buildBreakItems(
  tokens: ShapedToken[],
  measureFn: MeasureFn
): CustomBreakItem[] {
  const items: CustomBreakItem[] = [];

  for (const token of tokens) {
    if (token.type === TokenType.SPACE) {
      const spaceWidth = token.width;
      items.push({
        type: 'glue',
        width: spaceWidth,
        stretch: spaceWidth * 0.5,
        shrink: spaceWidth * 0.3,
        text: ' ',
        tokenRef: token,
      });
      continue;
    }

    if (token.type === TokenType.WORD) {
      const word = token.value;

      if (canHyphenateWord(word)) {
        const syllables = hypher.hyphenate(word);
        if (syllables.length > 1) {
          const hyphenWidth = measureFn('-', token.style);
          for (let idx = 0; idx < syllables.length; idx++) {
            items.push(createHyphenBox(syllables[idx]!, token, measureFn));

            const breakIndex = idx + 1;
            if (breakIndex < syllables.length && isAcceptableHyphenBreak(syllables, breakIndex)) {
              items.push({
                type: 'penalty',
                cost: 50, // Penalidade por quebra com hifen
                width: hyphenWidth,
                flagged: true,
                isHyphen: true,
                hyphenWidth: hyphenWidth,
              });
            }
          }
          continue;
        }
      }

      // Palavra inteira se não houver hifenização
      items.push({
        type: 'box',
        width: token.width,
        text: word,
        tokenRef: token,
      });
    }
  }

  // Elementos padrão de fim de parágrafo no TeX (cola infinita + forced penalty)
  items.push({
    type: 'glue',
    width: 0,
    stretch: 1000,
    shrink: 0,
    text: '',
    tokenRef: {
      type: TokenType.SPACE,
      value: '',
      width: 0,
      style: tokens[0]?.style ?? {
        fontFamily: 'Lora',
        fontSize: 15,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#1f2d44',
        letterSpacing: 0,
        underline: false,
        strikethrough: false,
        textCase: 'normal',
        baselineShift: 'normal',
      },
    },
  });

  items.push({
    type: 'penalty',
    cost: -1000, // Forca a quebra no fim do paragrafo
    width: 0,
    flagged: false,
  });

  return items;
}

function canHyphenateWord(word: string): boolean {
  return word.length >= MIN_HYPHENATED_WORD_LENGTH && NATURAL_WORD_RE.test(word);
}

function createHyphenBox(
  text: string,
  token: ShapedToken,
  measureFn: MeasureFn
): CustomBox {
  return {
    type: 'box',
    width: measureFn(text, token.style),
    text,
    tokenRef: token,
    isSyllable: true,
  };
}

function createHyphenToken(
  text: string,
  token: ShapedToken,
  measureFn: MeasureFn
): ShapedToken {
  const hyphenSource = token.hyphenSource ?? token.value;
  return {
    type: TokenType.WORD,
    value: text,
    width: measureFn(text, token.style),
    style: token.style,
    lineHeight: token.lineHeight,
    hyphenSource,
  };
}

function isAcceptableHyphenBreak(syllables: string[], breakIndex: number): boolean {
  if (breakIndex <= 0 || breakIndex >= syllables.length) return false;
  const left = syllables.slice(0, breakIndex).join('');
  const right = syllables.slice(breakIndex).join('');
  return (
    left.length >= MIN_HYPHEN_FRAGMENT_LENGTH &&
    right.length >= MIN_HYPHEN_FRAGMENT_LENGTH
  );
}

function bestFittingHyphenSplit(
  token: ShapedToken,
  availableWidth: number,
  measureFn: MeasureFn
): { left: ShapedToken; right: ShapedToken } | null {
  if (token.type !== TokenType.WORD || availableWidth <= 0 || !canHyphenateWord(token.value)) {
    return null;
  }

  const syllables = hypher.hyphenate(token.value);
  let best: { left: ShapedToken; right: ShapedToken } | null = null;

  for (let breakIndex = 1; breakIndex < syllables.length; breakIndex++) {
    if (!isAcceptableHyphenBreak(syllables, breakIndex)) {
      continue;
    }

    const hyphenSource = token.hyphenSource ?? token.value;
    const leftText = `${syllables.slice(0, breakIndex).join('')}-`;
    const leftWidth = measureFn(leftText, token.style);
    if (leftWidth > availableWidth) {
      continue;
    }

    const rightText = syllables.slice(breakIndex).join('');
    best = {
      left: {
        type: TokenType.WORD,
        value: leftText,
        width: leftWidth,
        style: token.style,
        lineHeight: token.lineHeight,
        softHyphen: true,
        hyphenSource,
      },
      right: createHyphenToken(rightText, token, measureFn),
    };
  }

  return best;
}

/**
 * Reconstrói as linhas de ShapedToken[] a partir dos breakpoints.
 */
export function reconstructLines(
  items: CustomBreakItem[],
  breaks: number[],
  measureFn: MeasureFn
): ShapedToken[][] {
  const lines: ShapedToken[][] = [];

  for (let i = 0; i < breaks.length - 1; i++) {
    const startIdx = breaks[i]!;
    const endIdx = breaks[i + 1]!;
    const lineTokens: ShapedToken[] = [];

    for (let k = startIdx; k < endIdx; k++) {
      const item = items[k];
      if (!item) continue;

      // Descarta cola no início físico da linha
      if (k === startIdx && (item.type === 'glue' || item.type === 'penalty')) {
        continue;
      }

      if (item.type === 'box') {
        if (item.isSyllable) {
          lineTokens.push({
            type: TokenType.WORD,
            value: item.text,
            width: item.width,
            style: item.tokenRef.style,
            lineHeight: item.tokenRef.lineHeight,
            hyphenSource: item.tokenRef.hyphenSource ?? item.tokenRef.value,
          });
        } else {
          lineTokens.push(item.tokenRef);
        }
      } else if (item.type === 'glue') {
        lineTokens.push(item.tokenRef);
      }
    }

    // Se a linha terminou em um hífen, anexa o caractere '-' ao último token de palavra
    const lastItem = items[endIdx];
    if (lastItem && lastItem.type === 'penalty' && lastItem.isHyphen) {
      let lastWordIdx = -1;
      for (let j = lineTokens.length - 1; j >= 0; j--) {
        if (lineTokens[j]?.type === TokenType.WORD) {
          lastWordIdx = j;
          break;
        }
      }

      if (lastWordIdx !== -1) {
        const lastWord = lineTokens[lastWordIdx]!;
        const style = lastWord.style;
        const newValue = lastWord.value + '-';
        lineTokens[lastWordIdx] = {
          type: TokenType.WORD,
          value: newValue,
          style,
          width: measureFn(newValue, style),
          lineHeight: lastWord.lineHeight,
          softHyphen: true,
          hyphenSource: lastWord.hyphenSource,
        };
      }
    }

    if (lineTokens.length > 0) {
      lines.push(lineTokens);
    }
  }

  return lines;
}

/**
 * Lógica de fallback gananciosa (greedy) caso o Knuth-Plass falhe
 */
export function breakParagraphGreedy(
  tokens: ShapedToken[],
  width: number,
  measureFn?: MeasureFn
): ShapedToken[][] {
  const lines: ShapedToken[][] = [];
  let currentLine: ShapedToken[] = [];
  let lineWidth = 0;

  const pushCurrentLine = () => {
    while (currentLine[currentLine.length - 1]?.type === TokenType.SPACE) {
      const removed = currentLine.pop();
      lineWidth -= removed?.width ?? 0;
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
      lineWidth = 0;
    }
  };

  for (const token of tokens) {
    if (token.type === TokenType.SPACE) {
      if (currentLine.length > 0 && lineWidth + token.width <= width) {
        currentLine.push(token);
        lineWidth += token.width;
      }
      continue;
    }

    if (lineWidth + token.width <= width || currentLine.length === 0) {
      currentLine.push(token);
      lineWidth += token.width;
    } else {
      const split = measureFn
        ? bestFittingHyphenSplit(token, width - lineWidth, measureFn)
        : null;
      if (split) {
        currentLine.push(split.left);
        lineWidth += split.left.width;
        pushCurrentLine();
        currentLine = [split.right];
        lineWidth = split.right.width;
        continue;
      }

      pushCurrentLine();
      currentLine = [token];
      lineWidth = token.width;
    }
  }

  pushCurrentLine();

  return lines;
}

/**
 * Executa a quebra de linha do parágrafo usando o algoritmo Knuth-Plass.
 */
export function breakParagraphKP(
  tokens: ShapedToken[],
  width: number,
  measureFn: MeasureFn
): ShapedToken[][] {
  if (tokens.length === 0) return [];

  try {
    const items = buildBreakItems(tokens, measureFn);
    const breaks = texLinebreak.breakLines(items, width, KP_BREAK_OPTIONS);
    return reconstructLines(items, breaks, measureFn);
  } catch (err) {
    console.warn('Knuth-Plass falhou, usando fallback greedy:', err);
    return breakParagraphGreedy(tokens, width, measureFn);
  }
}
