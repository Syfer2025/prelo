import { describe, expect, it } from 'vitest';
import type { Frame, ImageFrame } from '../model/types';
import { DEFAULT_CHARACTER_STYLE } from '../model/types';
import { fillFrames } from './frame-filler';
import { TokenType } from './types';
import type { ShapedToken } from './types';
import type { AlphaMask } from '../model/text-wrap';

const style = {
  ...DEFAULT_CHARACTER_STYLE,
  fontFamily: 'Test',
  fontSize: 10,
};

const word = (value: string, width = 20): ShapedToken => ({
  type: TokenType.WORD,
  value,
  width,
  style,
});

const space = (): ShapedToken => ({
  type: TokenType.SPACE,
  value: ' ',
  width: 5,
  style,
});

const wordWithLeading = (value: string, lineHeight: number, width = 20): ShapedToken => ({
  type: TokenType.WORD,
  value,
  width,
  style,
  lineHeight,
});

const frame = (id: string, width: number, height: number): Frame => ({
  id,
  pageId: 'page-1',
  x: 0,
  y: 0,
  width,
  height,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  nextFrameId: null,
  prevFrameId: null,
});

const imageFrame = (overrides: Partial<ImageFrame> = {}): ImageFrame => ({
  id: 'image-1',
  pageId: 'page-1',
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  rotation: 0,
  type: 'image',
  storyId: null,
  nextFrameId: null,
  prevFrameId: null,
  imageUrl: 'image.png',
  originalWidth: 1200,
  originalHeight: 1200,
  cropX: 0,
  cropY: 0,
  cropWidth: 1200,
  cropHeight: 1200,
  fitMode: 'fill',
  textWrap: { mode: 'bounding-box', offset: 0, sides: 'largest', alphaThreshold: 0.5 },
  ...overrides,
});

describe('fillFrames', () => {
  it('flows remaining paragraph lines into the next frame when the first frame is full', () => {
    const tokens = [
      word('alpha'),
      space(),
      word('beta'),
      space(),
      word('gamma'),
      space(),
      word('delta'),
    ];

    const result = fillFrames(tokens, [frame('a', 45, 15), frame('b', 44, 45)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    expect(result.overflow).toBe(false);
    expect(result.frameLayouts[0]?.lines.map((line) => line.text)).toEqual(['alpha beta']);
    expect(result.frameLayouts[1]?.lines.map((line) => line.text)).toEqual(['gamma', 'delta']);
  });

  it('reports overflow text when no frame can receive the remaining content', () => {
    const tokens = [word('alpha'), space(), word('beta'), space(), word('gamma')];

    const result = fillFrames(tokens, [frame('a', 45, 15)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    expect(result.overflow).toBe(true);
    expect(result.overflowText).toContain('gamma');
  });

  it('preserves spaces when reflowing multiple remaining lines into a wider frame', () => {
    const tokens = [
      word('alpha'),
      space(),
      word('beta'),
      space(),
      word('gamma'),
      space(),
      word('delta'),
      space(),
      word('epsilon'),
      space(),
      word('zeta'),
    ];

    const result = fillFrames(tokens, [frame('a', 45, 15), frame('b', 95, 45)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    expect(result.overflow).toBe(false);
    expect(result.frameLayouts[0]?.lines.map((line) => line.text)).toEqual(['alpha beta']);
    expect(result.frameLayouts[1]?.lines.map((line) => line.text)).toEqual([
      'gamma delta epsilon zeta',
    ]);
  });

  it('reflows unplaced hyphenated lines from original tokens when switching frames', () => {
    const tokens = [
      word('modelo', 30),
      space(),
      word('de', 10),
      space(),
      word('documento', 45),
      space(),
      word('que', 15),
    ];

    const result = fillFrames(tokens, [frame('a', 65, 15), frame('b', 120, 45)], {
      algorithm: 'kp',
      measureFn: (text) => text.length * 5,
    });

    expect(result.frameLayouts[0]?.lines.map((line) => line.text)).toEqual(['modelo de']);
    expect(result.frameLayouts[1]?.lines[0]?.text).toBe('documento que');
  });

  it('uses the per-token line height multiplier for the laid-out line', () => {
    const result = fillFrames([wordWithLeading('alpha', 2)], [frame('a', 100, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    // fontSize 10 * lineHeight 2 = 20
    expect(result.frameLayouts[0]?.lines[0]?.height).toBe(20);
  });

  it('snaps line baselines to the configured baseline grid', () => {
    const tokens = [
      word('aaa', 90),
      space(),
      word('bbb', 90),
      space(),
      word('ccc', 90),
    ];

    const result = fillFrames(tokens, [frame('a', 100, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
      baselineGrid: { startOffset: 8, increment: 18, color: '#00f', visible: true },
    });

    expect(result.frameLayouts[0]?.lines.map((line) => line.y)).toEqual([0, 18, 36]);
  });

  it('falls back to a 1.5 leading when tokens carry no line height', () => {
    const result = fillFrames([word('alpha')], [frame('a', 100, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    // fontSize 10 * default 1.5 = 15
    expect(result.frameLayouts[0]?.lines[0]?.height).toBe(15);
  });

  it('character-breaks a word wider than the frame instead of overflowing (greedy)', () => {
    const wide: ShapedToken = { type: TokenType.WORD, value: 'abcdefghij', width: 50, style };

    const result = fillFrames([wide], [frame('a', 20, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.width).toBeLessThanOrEqual(20);
    }
    // No characters are lost or duplicated when emergency-breaking.
    expect(lines.map((line) => line.text).join('')).toBe('abcdefghij');
    expect(result.overflow).toBe(false);
  });

  it('character-breaks an oversized word under the KP algorithm too', () => {
    const wide: ShapedToken = { type: TokenType.WORD, value: 'abcdefghij', width: 50, style };

    const result = fillFrames([wide], [frame('a', 20, 100)], {
      algorithm: 'kp',
      measureFn: (text) => text.length * 5,
    });

    for (const line of result.frameLayouts[0]?.lines ?? []) {
      expect(line.width).toBeLessThanOrEqual(20);
    }
  });

  it('centers a line based on the frame width', () => {
    const tokens: ShapedToken[] = [
      { type: TokenType.WORD, value: 'alpha', width: 20, style, align: 'center' },
    ];

    const result = fillFrames(tokens, [frame('a', 100, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    const line = result.frameLayouts[0]?.lines[0];
    expect(line?.width).toBe(20);
    expect(line?.x).toBe(40); // (100 - 20) / 2
  });

  it('right-aligns a line based on the frame width', () => {
    const tokens: ShapedToken[] = [
      { type: TokenType.WORD, value: 'alpha', width: 20, style, align: 'right' },
    ];

    const result = fillFrames(tokens, [frame('a', 100, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    expect(result.frameLayouts[0]?.lines[0]?.x).toBe(80); // 100 - 20
  });

  it('defaults to left alignment (x = 0)', () => {
    const result = fillFrames([word('alpha')], [frame('a', 100, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    expect(result.frameLayouts[0]?.lines[0]?.x).toBe(0);
  });

  it('inserts space-after and space-before between paragraphs', () => {
    const tokens: ShapedToken[] = [
      { type: TokenType.WORD, value: 'alpha', width: 20, style, spaceAfter: 8 },
      { type: TokenType.NEWLINE, value: '\n', width: 0, style },
      { type: TokenType.WORD, value: 'beta', width: 20, style, spaceBefore: 4 },
    ];

    const result = fillFrames(tokens, [frame('a', 100, 200)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines.map((line) => line.text)).toEqual(['alpha', 'beta']);
    expect(lines[0]?.y).toBe(0);
    // 15 (altura de linha @ fontSize 10) + 8 (space-after de A) + 4 (space-before de B)
    expect(lines[1]?.y).toBe(27);
  });

  it('suppresses space-before at the top of a frame', () => {
    const tokens: ShapedToken[] = [
      { type: TokenType.WORD, value: 'alpha', width: 20, style, spaceBefore: 50 },
    ];

    const result = fillFrames(tokens, [frame('a', 100, 200)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    expect(result.frameLayouts[0]?.lines[0]?.y).toBe(0);
  });

  it('indents the first line of a paragraph and re-flows the rest at full width', () => {
    const indentedWord = (value: string): ShapedToken => ({
      type: TokenType.WORD,
      value,
      width: 40,
      style,
      indent: 30,
    });
    const indentedSpace = (): ShapedToken => ({
      type: TokenType.SPACE,
      value: ' ',
      width: 10,
      style,
      indent: 30,
    });
    const tokens: ShapedToken[] = [
      indentedWord('aaaa'),
      indentedSpace(),
      indentedWord('bbbb'),
      indentedSpace(),
      indentedWord('cccc'),
    ];

    const result = fillFrames(tokens, [frame('a', 100, 200)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    // 1ª linha quebra cedo (largura útil 100-30=70 só cabe "aaaa"); o resto re-flui em 100.
    expect(lines.map((line) => line.text)).toEqual(['aaaa', 'bbbb cccc']);
    expect(lines[0]?.x).toBe(30); // primeira linha recuada
    expect(lines[1]?.x).toBe(0); // demais linhas sem recuo
  });

  it('produces positioned runs for a line (x accumulates; widths sum to the line width)', () => {
    const tokens: ShapedToken[] = [
      { type: TokenType.WORD, value: 'alpha', width: 20, style },
      { type: TokenType.SPACE, value: ' ', width: 5, style },
      { type: TokenType.WORD, value: 'beta', width: 20, style },
    ];

    const result = fillFrames(tokens, [frame('a', 100, 100)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    const runs = result.frameLayouts[0]?.lines[0]?.runs ?? [];
    expect(runs.map((r) => r.text)).toEqual(['alpha', ' ', 'beta']);
    expect(runs.map((r) => r.x)).toEqual([0, 20, 25]);
    const last = runs[runs.length - 1]!;
    expect(last.x + last.width).toBe(45);
  });

  it('justifies non-last lines by stretching spaces, leaving the last line natural', () => {
    const jw = (value: string): ShapedToken => ({
      type: TokenType.WORD,
      value,
      width: 20,
      style,
      align: 'justify',
    });
    const jsp = (): ShapedToken => ({
      type: TokenType.SPACE,
      value: ' ',
      width: 5,
      style,
      align: 'justify',
    });
    const tokens = [jw('aa'), jsp(), jw('bb'), jsp(), jw('cc'), jsp(), jw('dd')];

    const result = fillFrames(tokens, [frame('a', 60, 200)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines.map((line) => line.text)).toEqual(['aa bb', 'cc dd']);

    // 1ª linha (não-última) justificada: os runs preenchem os 60px úteis.
    const r1 = lines[0]!.runs;
    expect(r1[r1.length - 1]!.x + r1[r1.length - 1]!.width).toBe(60);

    // última linha natural: termina em 45 (não esticada).
    const r2 = lines[1]!.runs;
    expect(r2[r2.length - 1]!.x + r2[r2.length - 1]!.width).toBe(45);
  });

  it('does not justify a line when doing so would create grotesquely wide spaces', () => {
    const jw = (value: string, width = 20): ShapedToken => ({
      type: TokenType.WORD,
      value,
      width,
      style,
      align: 'justify',
    });
    const jsp = (): ShapedToken => ({
      type: TokenType.SPACE,
      value: ' ',
      width: 5,
      style,
      align: 'justify',
    });
    const tokens = [jw('aa'), jsp(), jw('bb'), jsp(), jw('SKU1234567890', 100)];

    const result = fillFrames(tokens, [frame('a', 140, 200)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines.map((line) => line.text)).toEqual(['aa bb', 'SKU1234567890']);

    const firstLineRuns = lines[0]!.runs;
    const firstLineEnd =
      firstLineRuns[firstLineRuns.length - 1]!.x + firstLineRuns[firstLineRuns.length - 1]!.width;

    expect(firstLineEnd).toBe(45);
  });

  it('does not insert a recovered space inside a hyphenated word fragment', () => {
    const tokens = [
      word('start', 20),
      space(),
      word('al-', 15),
      word('pha', 15),
    ];

    const result = fillFrames(tokens, [frame('a', 20, 15), frame('b', 40, 45)], {
      algorithm: 'greedy',
      measureFn: (text) => text.length * 5,
    });

    expect(result.overflow).toBe(false);
    expect(result.frameLayouts[0]?.lines.map((line) => line.text)).toEqual(['start']);
    expect(result.frameLayouts[1]?.lines.map((line) => line.text)).toEqual(['al-pha']);
  });

  it('removes artificial hyphens when unplaced KP lines reflow into a wider frame', () => {
    const tokens = [
      word('intro', 25),
      space(),
      word('assentamentos', 65),
      space(),
      word('cresceram', 45),
    ];

    const result = fillFrames(tokens, [frame('a', 30, 15), frame('b', 200, 60)], {
      algorithm: 'kp',
      measureFn: (text) => text.length * 5,
    });

    expect(result.frameLayouts[0]?.lines.map((line) => line.text.trim())).toEqual(['intro']);
    expect(result.frameLayouts[1]?.lines.map((line) => line.text).join('\n')).toBe(
      'assentamentos cresceram'
    );
  });

  it('places wrapped text in the free band beside a left-side image obstacle', () => {
    const text = frame('a', 100, 100);
    const image = imageFrame({ x: 0, y: 0, width: 40, height: 40 });
    const tokens = [
      word('aa'),
      space(),
      word('bb'),
      space(),
      word('cc'),
      space(),
      word('dd'),
    ];

    const result = fillFrames(tokens, [text], {
      algorithm: 'greedy',
      measureFn: (value) => value.length * 5,
      wrapFrames: [text, image],
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines[0]?.text).toBe('aa bb');
    expect(lines[0]?.x).toBe(40);
    expect(lines[0]?.width).toBeLessThanOrEqual(60);
  });

  it('uses alpha-channel masks so text follows the drawn pixels instead of the image rectangle', () => {
    const text = frame('a', 200, 100);
    const alpha = new Uint8Array(100);
    for (let y = 0; y < 10; y++) {
      alpha[y * 10 + 4] = 255;
      alpha[y * 10 + 5] = 255;
    }
    const mask: AlphaMask = { width: 10, height: 10, alpha, threshold: 128 };
    const image = imageFrame({
      x: 50,
      y: 0,
      width: 100,
      height: 100,
      textWrap: { mode: 'alpha-channel', offset: 0, sides: 'largest', alphaThreshold: 0.5 },
    });

    const result = fillFrames([word('alpha')], [text], {
      algorithm: 'greedy',
      measureFn: (value) => value.length * 5,
      wrapFrames: [text, image],
      wrapMasksByFrameId: { 'image-1': mask },
    });

    expect(result.frameLayouts[0]?.lines[0]?.x).toBe(110);
  });

  it('falls back to bounding-box wrap for alpha-channel images without a supplied mask', () => {
    const text = frame('a', 200, 100);
    const image = imageFrame({
      x: 50,
      y: 0,
      width: 100,
      height: 100,
      textWrap: { mode: 'alpha-channel', offset: 0, sides: 'largest', alphaThreshold: 0.5 },
    });

    const result = fillFrames([word('alpha')], [text], {
      algorithm: 'greedy',
      measureFn: (value) => value.length * 5,
      wrapFrames: [text, image],
    });

    expect(result.frameLayouts[0]?.lines[0]?.x).toBe(150);
  });

  it('ignores image obstacles whose text-wrap mode is none', () => {
    const text = frame('a', 100, 100);
    const image = imageFrame({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      textWrap: { mode: 'none', offset: 0, sides: 'largest', alphaThreshold: 0.5 },
    });
    const tokens = [
      word('aa'),
      space(),
      word('bb'),
      space(),
      word('cc'),
      space(),
      word('dd'),
    ];

    const result = fillFrames(tokens, [text], {
      algorithm: 'greedy',
      measureFn: (value) => value.length * 5,
      wrapFrames: [text, image],
    });

    expect(result.frameLayouts[0]?.lines[0]?.text).toBe('aa bb cc dd');
    expect(result.frameLayouts[0]?.lines[0]?.x).toBe(0);
  });

  it('skips a fully blocked wrap band without losing text or looping forever', () => {
    const text = frame('a', 100, 100);
    const image = imageFrame({ x: 0, y: 0, width: 100, height: 30 });

    const result = fillFrames([word('alpha')], [text], {
      algorithm: 'greedy',
      measureFn: (value) => value.length * 5,
      wrapFrames: [text, image],
    });

    const line = result.frameLayouts[0]?.lines[0];
    expect(result.overflow).toBe(false);
    expect(line?.text).toBe('alpha');
    expect(line?.y).toBe(30);
  });

  it('flows text on BOTH sides of a centered image (sides=both)', () => {
    const text = frame('a', 200, 100);
    // imagem central [80,120]; vãos livres: esquerda [0,80] e direita [120,200].
    const image = imageFrame({
      x: 80,
      y: 0,
      width: 40,
      height: 200,
      textWrap: { mode: 'bounding-box', offset: 0, sides: 'both', alphaThreshold: 0.5 },
    });
    const tokens = [
      word('aa'), space(), word('bb'), space(), word('cc'),
      space(), word('dd'), space(), word('ee'), space(), word('ff'),
    ];

    const result = fillFrames(tokens, [text], {
      algorithm: 'greedy',
      measureFn: (value) => value.length * 5,
      wrapFrames: [text, image],
    });

    const band0 = (result.frameLayouts[0]?.lines ?? []).filter((line) => line.y === 0);
    expect(band0.map((line) => line.x)).toEqual([0, 120]); // fragmento esquerdo e direito, mesmo Y
    expect(band0.map((line) => line.text)).toEqual(['aa bb cc', 'dd ee ff']);
  });
});

describe('composição editorial (órfãs/viúvas/keeps/page-break)', () => {
  const measureFn = (text: string) => text.length * 5;
  const paraBreak = (): ShapedToken => ({ type: TokenType.NEWLINE, value: '\n', width: 0, style });
  const texts = (result: ReturnType<typeof fillFrames>, frameIdx: number) =>
    (result.frameLayouts[frameIdx]?.lines ?? []).map((line) => line.text);

  it('page-break-before: parágrafo começa no topo de um novo frame', () => {
    const tokens: ShapedToken[] = [
      word('alpha'),
      paraBreak(),
      { ...word('beta'), pageBreakBefore: true },
    ];

    const result = fillFrames(tokens, [frame('a', 100, 100), frame('b', 100, 100)], {
      algorithm: 'greedy',
      measureFn,
    });

    expect(texts(result, 0)).toEqual(['alpha']); // beta NÃO continua no frame a
    expect(texts(result, 1)).toEqual(['beta']); // beta salta para o frame b
  });

  it('keep-together: parágrafo que não cabe inteiro vai todo para o próximo frame', () => {
    const tokens: ShapedToken[] = [
      word('aaa'),
      paraBreak(),
      // 3 linhas (cada palavra 90px num frame de 100px)
      { ...word('bbb', 90), keepLinesTogether: true },
      space(),
      word('ccc', 90),
      space(),
      word('ddd', 90),
    ];

    // frame a (altura 40) comporta 2 linhas; após "aaa" só sobra espaço p/ 1 → empurra B inteiro.
    const result = fillFrames(tokens, [frame('a', 100, 40), frame('b', 100, 100)], {
      algorithm: 'greedy',
      measureFn,
    });

    expect(texts(result, 0)).toEqual(['aaa']);
    expect(texts(result, 1)).toEqual(['bbb', 'ccc', 'ddd']);
  });

  it('órfãs: não deixa menos que `orphans` linhas iniciais no rodapé da página', () => {
    const tokens: ShapedToken[] = [
      word('aaa'),
      paraBreak(),
      { ...word('bbb', 90), orphans: 2 },
      space(),
      word('ccc', 90),
      space(),
      word('ddd', 90),
    ];

    // após "aaa" só cabe 1 linha de B no frame a; orphans=2 → empurra B inteiro p/ frame b.
    const result = fillFrames(tokens, [frame('a', 100, 40), frame('b', 100, 100)], {
      algorithm: 'greedy',
      measureFn,
    });

    expect(texts(result, 0)).toEqual(['aaa']);
    expect(texts(result, 1)).toEqual(['bbb', 'ccc', 'ddd']);
  });

  it('viúvas: puxa linha para baixo para não deixar 1 linha final sozinha no próximo frame', () => {
    const tokens: ShapedToken[] = [
      { ...word('uuu', 90), widows: 2 },
      space(),
      word('vvv', 90),
      space(),
      word('www', 90),
    ];

    // frame a (altura 30) comporta 2 linhas; sem viúvas deixaria 1 sozinha no frame b.
    // widows=2 → coloca só 1 no frame a e manda 2 para o frame b.
    const result = fillFrames(tokens, [frame('a', 100, 30), frame('b', 100, 100)], {
      algorithm: 'greedy',
      measureFn,
    });

    expect(texts(result, 0)).toEqual(['uuu']);
    expect(texts(result, 1)).toEqual(['vvv', 'www']);
  });

  it('keep-with-next: mantém o título junto do início do parágrafo seguinte', () => {
    const tokens: ShapedToken[] = [
      word('aaa'),
      paraBreak(),
      { ...word('Titulo'), keepWithNext: true },
      paraBreak(),
      word('corpo'),
    ];

    // frame a (altura 30) comporta 2 linhas. Sem keep-with-next: "aaa"+"Titulo" no frame a e
    // "corpo" sozinho no frame b → título órfão do corpo. Com keep-with-next o título desce junto.
    const result = fillFrames(tokens, [frame('a', 100, 30), frame('b', 100, 100)], {
      algorithm: 'greedy',
      measureFn,
    });

    expect(texts(result, 0)).toEqual(['aaa']);
    expect(texts(result, 1)).toEqual(['Titulo', 'corpo']);
  });
});
