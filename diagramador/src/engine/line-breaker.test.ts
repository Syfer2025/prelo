import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHARACTER_STYLE } from '../model/types';
import { breakParagraphGreedy, breakParagraphKP, buildBreakItems } from './line-breaker';
import { TokenType } from './types';
import type { ShapedToken } from './types';

const style = DEFAULT_CHARACTER_STYLE;

const token = (type: TokenType, value: string, width: number): ShapedToken => ({
  type,
  value,
  width,
  style,
});

describe('breakParagraphGreedy', () => {
  it('does not start a new line with a space token', () => {
    const tokens = [
      token(TokenType.WORD, 'alpha', 25),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'beta', 20),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'gamma', 25),
    ];

    const lines = breakParagraphGreedy(tokens, 50);

    expect(lines.map((line) => line.map((item) => item.value).join(''))).toEqual([
      'alpha beta',
      'gamma',
    ]);
  });

  it('hyphenates a long Portuguese word when that avoids leaving a loose short line', () => {
    const tokens = [
      token(TokenType.WORD, 'casa', 20),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'extraordinariamente', 95),
    ];

    const lines = (breakParagraphGreedy as (
      tokens: ShapedToken[],
      width: number,
      measureFn: (text: string) => number
    ) => ShapedToken[][])(tokens, 90, (text) => text.length * 5);
    const texts = lines.map((line) => line.map((item) => item.value).join(''));

    expect(texts.length).toBeGreaterThan(1);
    expect(texts[0]).toMatch(/-$/);
  });
});

describe('breakParagraphKP', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits penalty items using the tex-linebreak runtime contract', () => {
    const items = buildBreakItems([
      token(TokenType.WORD, 'alpha', 25),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'beta', 20),
    ], () => 5);

    const forcedBreak = items.at(-1) as { type: 'penalty'; cost?: number; flagged?: boolean };

    expect(forcedBreak.type).toBe('penalty');
    expect(forcedBreak.cost).toBeLessThanOrEqual(-1000);
    expect(forcedBreak.flagged).toBe(false);
  });

  it('does not hyphenate technical tokens, acronyms, numeric tokens, or short words', () => {
    const items = buildBreakItems([
      token(TokenType.WORD, 'flowStory:', 50),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'PDF', 15),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, '6x9', 15),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'direita', 35),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'aumente', 35),
    ], () => 5);

    const hyphenPenalties = items.filter(
      (item) => item.type === 'penalty' && item.isHyphen === true
    );

    expect(hyphenPenalties).toEqual([]);
  });

  it('keeps hyphenation available for very long natural Portuguese words', () => {
    const items = buildBreakItems([token(TokenType.WORD, 'extraordinariamente', 95)], () => 5);

    const hyphenPenalties = items.filter(
      (item) => item.type === 'penalty' && item.isHyphen === true
    );

    expect(hyphenPenalties.length).toBeGreaterThan(0);
  });

  it('offers every acceptable Portuguese hyphenation point to Knuth-Plass', () => {
    const items = buildBreakItems([token(TokenType.WORD, 'extraordinariamente', 95)], (text) => text.length * 5);

    const hyphenPenalties = items.filter(
      (item) => item.type === 'penalty' && item.isHyphen === true
    );

    expect(hyphenPenalties.length).toBeGreaterThan(1);
  });

  it('does not expose medium-word syllable fragments as independent breakable boxes', () => {
    const items = buildBreakItems([token(TokenType.WORD, 'documento', 45)], (text) => text.length * 5);

    const boxes = items
      .filter((item) => item.type === 'box')
      .map((item) => item.text);

    expect(boxes).toEqual(['documento']);
  });

  it('hyphenates medium-length Portuguese book words when fragments stay readable', () => {
    const items = buildBreakItems([token(TokenType.WORD, 'necessidade', 55)], (text) => text.length * 5);

    const hyphenPenalties = items.filter(
      (item) => item.type === 'penalty' && item.isHyphen === true
    );

    expect(hyphenPenalties.length).toBeGreaterThan(0);
  });

  it('reconstructs an unbroken hyphenable word without inserting an artificial hyphen', () => {
    const tokens = [
      token(TokenType.WORD, 'documento', 45),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'que', 15),
    ];

    const lines = breakParagraphKP(tokens, 120, (text) => text.length * 5);

    expect(lines.map((line) => line.map((item) => item.value).join(''))).toEqual([
      'documento que',
    ]);
  });

  it('hyphenates a long common Portuguese word instead of pushing it whole to the next line', () => {
    // Fluxo realista (com espaço/glue antes): "casa extraordinariamente" não cabe em 90px,
    // então o motor deve quebrar a palavra longa com hífen silábico pt-BR, em vez de jogá-la
    // inteira para a linha seguinte (o que deixaria a primeira linha curta e cheia de buraco).
    const tokens = [
      token(TokenType.WORD, 'casa', 20),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'extraordinariamente', 95),
    ];
    const lines = breakParagraphKP(tokens, 90, (text) => text.length * 5);
    const texts = lines.map((line) => line.map((item) => item.value).join(''));

    expect(texts.length).toBeGreaterThan(1);
    expect(texts.some((text) => text.endsWith('-'))).toBe(true);
  });

  it('uses an early hyphenation point when the balanced split is too wide for the line', () => {
    const tokens = [
      token(TokenType.WORD, 'casa', 20),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'extraordinariamente', 95),
    ];

    const lines = breakParagraphKP(tokens, 55, (text) => text.length * 5);
    const texts = lines.map((line) => line.map((item) => item.value).join(''));

    expect(texts[0]).toBe('casa extra-');
  });

  it('uses the KP path without falling back to greedy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tokens = [
      token(TokenType.WORD, 'alpha', 25),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'beta', 20),
      token(TokenType.SPACE, ' ', 5),
      token(TokenType.WORD, 'gamma', 25),
    ];

    const lines = breakParagraphKP(tokens, 50, (text) => text.length * 5);

    expect(lines.length).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
  });
});
