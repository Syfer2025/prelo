import { describe, expect, it } from 'vitest';
import { computeBandInterval, computeBandIntervals, obstaclesForTextFrame } from './text-wrap';
import type { AlphaMask } from './text-wrap';
import type { Frame, ImageFrame } from './types';

const imageFrame = (overrides: Partial<ImageFrame> = {}): ImageFrame => ({
  id: 'img',
  pageId: 'page-1',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  type: 'image',
  storyId: null,
  prevFrameId: null,
  nextFrameId: null,
  imageUrl: 'x.png',
  originalWidth: 600,
  originalHeight: 600,
  cropX: 0,
  cropY: 0,
  cropWidth: 600,
  cropHeight: 600,
  fitMode: 'fill',
  textWrap: { mode: 'bounding-box', offset: 0, sides: 'largest', alphaThreshold: 0.5 },
  ...overrides,
});

const textFrame: Frame = {
  id: 'text',
  pageId: 'page-1',
  x: 0,
  y: 0,
  width: 300,
  height: 400,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  prevFrameId: null,
  nextFrameId: null,
};

describe('computeBandInterval', () => {
  it('returns the full width when no obstacle overlaps the band', () => {
    expect(computeBandInterval(300, 0, 20, [])).toEqual({ x: 0, width: 300 });
  });

  it('pushes text to the right of a left-side obstacle (larger gap wins)', () => {
    const obstacle = { x: 0, y: 0, width: 80, height: 100 };
    expect(computeBandInterval(300, 0, 20, [obstacle])).toEqual({ x: 80, width: 220 });
  });

  it('clips text to the left of a right-side obstacle', () => {
    const obstacle = { x: 220, y: 0, width: 80, height: 100 };
    expect(computeBandInterval(300, 0, 20, [obstacle])).toEqual({ x: 0, width: 220 });
  });

  it('ignores an obstacle that does not overlap the band vertically', () => {
    const obstacle = { x: 0, y: 100, width: 80, height: 50 };
    expect(computeBandInterval(300, 0, 20, [obstacle])).toEqual({ x: 0, width: 300 });
  });

  it('uses an alpha mask instead of blocking the full image rectangle', () => {
    const alpha = new Uint8Array(100);
    for (let y = 0; y < 10; y++) {
      alpha[y * 10 + 4] = 255;
      alpha[y * 10 + 5] = 255;
    }
    const mask: AlphaMask = { width: 10, height: 10, alpha, threshold: 128 };
    const obstacle = { x: 50, y: 0, width: 100, height: 100, mask };

    expect(computeBandInterval(200, 0, 20, [obstacle])).toEqual({ x: 110, width: 90 });
  });

  it('ignores transparent alpha-mask rows outside the drawn shape', () => {
    const alpha = new Uint8Array(100);
    for (let x = 0; x < 10; x++) {
      alpha[0 * 10 + x] = 255;
    }
    const mask: AlphaMask = { width: 10, height: 10, alpha, threshold: 128 };
    const obstacle = { x: 0, y: 0, width: 100, height: 100, mask };

    expect(computeBandInterval(200, 70, 90, [obstacle])).toEqual({ x: 0, width: 200 });
  });

  it('expands alpha-mask occupied pixels by the wrap offset', () => {
    const alpha = new Uint8Array(100);
    alpha[5 * 10 + 5] = 255;
    const mask: AlphaMask = { width: 10, height: 10, alpha, threshold: 128 };
    const obstacle = { x: 0, y: 0, width: 100, height: 100, mask, offset: 10 };

    expect(computeBandInterval(200, 45, 60, [obstacle])).toEqual({ x: 70, width: 130 });
  });
});

describe('obstaclesForTextFrame', () => {
  it('returns wrap rects in the text frame local space, expanded by the offset', () => {
    // imagem na esquerda da página, sobreposta ao text frame, com offset 10.
    const image = imageFrame({ x: 20, y: 30, width: 100, height: 100, textWrap: { mode: 'bounding-box', offset: 10, sides: 'largest', alphaThreshold: 0.5 } });
    const obstacles = obstaclesForTextFrame({ ...textFrame, x: 0, y: 0 }, [image]);

    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]).toEqual({ x: 10, y: 20, width: 120, height: 120, sides: 'largest' }); // (20-10, 30-10, 100+20, 100+20)
  });

  it('ignores image frames whose text wrap is none', () => {
    const image = imageFrame({ textWrap: { mode: 'none', offset: 0, sides: 'both', alphaThreshold: 0.5 } });
    expect(obstaclesForTextFrame(textFrame, [image])).toEqual([]);
  });

  it('ignores images that do not overlap the text frame', () => {
    const image = imageFrame({ x: 1000, y: 1000, width: 50, height: 50 });
    expect(obstaclesForTextFrame(textFrame, [image])).toEqual([]);
  });

  it('ignores non-image frames', () => {
    const other: Frame = { ...textFrame, id: 'other', type: 'text' };
    expect(obstaclesForTextFrame(textFrame, [other])).toEqual([]);
  });

  it('attaches alpha masks to alpha-channel image frames without expanding the base rect', () => {
    const alpha = new Uint8Array(4);
    const mask: AlphaMask = { width: 2, height: 2, alpha, threshold: 128 };
    const image = imageFrame({
      x: 20,
      y: 30,
      width: 100,
      height: 100,
      textWrap: { mode: 'alpha-channel', offset: 10, sides: 'largest', alphaThreshold: 0.5 },
    });

    expect(obstaclesForTextFrame(textFrame, [image], { masksByFrameId: { img: mask } })).toEqual([
      { x: 20, y: 30, width: 100, height: 100, sides: 'largest', offset: 10, mask },
    ]);
  });

  it('attaches the polygon (normalized) for polygon-mode images, keeping the base rect', () => {
    const polygon = [
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const image = imageFrame({
      x: 20,
      y: 30,
      width: 100,
      height: 100,
      textWrap: { mode: 'polygon', offset: 5, sides: 'both', alphaThreshold: 0.5, polygon },
    });

    expect(obstaclesForTextFrame(textFrame, [image])).toEqual([
      { x: 20, y: 30, width: 100, height: 100, sides: 'both', offset: 5, polygon },
    ]);
  });

  it('carries sides=both for centered-image wrap', () => {
    const image = imageFrame({ x: 50, y: 0, width: 80, height: 80, textWrap: { mode: 'bounding-box', offset: 0, sides: 'both', alphaThreshold: 0.5 } });
    const obstacles = obstaclesForTextFrame({ ...textFrame, x: 0, y: 0, width: 300, height: 300 }, [image]);
    expect(obstacles[0]?.sides).toBe('both');
  });
});

describe('computeBandIntervals (multi-intervalo)', () => {
  it('returns the full width when there is no obstacle', () => {
    expect(computeBandIntervals(300, 0, 20, [])).toEqual([{ x: 0, width: 300 }]);
  });

  it('returns TWO intervals around a centered image when sides=both', () => {
    const obstacle = { x: 100, y: 0, width: 100, height: 100, sides: 'both' as const };
    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([
      { x: 0, width: 100 },
      { x: 200, width: 100 },
    ]);
  });

  it('keeps only the left interval when sides=left', () => {
    const obstacle = { x: 100, y: 0, width: 100, height: 100, sides: 'left' as const };
    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([{ x: 0, width: 100 }]);
  });

  it('keeps only the right interval when sides=right', () => {
    const obstacle = { x: 100, y: 0, width: 100, height: 100, sides: 'right' as const };
    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([{ x: 200, width: 100 }]);
  });

  it('keeps a single largest interval when sides=largest (tie → right)', () => {
    const obstacle = { x: 100, y: 0, width: 100, height: 100, sides: 'largest' as const };
    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([{ x: 200, width: 100 }]);
  });

  it('defaults to both when sides is omitted', () => {
    const obstacle = { x: 100, y: 0, width: 100, height: 100 };
    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([
      { x: 0, width: 100 },
      { x: 200, width: 100 },
    ]);
  });

  it('returns nothing when an obstacle blocks the whole band', () => {
    const obstacle = { x: 0, y: 0, width: 300, height: 100, sides: 'both' as const };
    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([]);
  });

  it('ignores obstacles that do not overlap the band vertically', () => {
    const obstacle = { x: 100, y: 100, width: 100, height: 50, sides: 'both' as const };
    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([{ x: 0, width: 300 }]);
  });

  it('uses the alpha mask to leave text on both sides of the drawn pixels', () => {
    const alpha = new Uint8Array(100);
    for (let y = 0; y < 10; y++) {
      alpha[y * 10 + 4] = 255;
      alpha[y * 10 + 5] = 255;
    }
    const mask: AlphaMask = { width: 10, height: 10, alpha, threshold: 128 };
    const obstacle = { x: 50, y: 0, width: 100, height: 100, mask, sides: 'both' as const };
    expect(computeBandIntervals(200, 0, 20, [obstacle])).toEqual([
      { x: 0, width: 90 },
      { x: 110, width: 90 },
    ]);
  });

  it('uses polygon points to compute the occupied interval for a band', () => {
    const obstacle = {
      x: 50,
      y: 0,
      width: 100,
      height: 100,
      sides: 'both' as const,
      polygon: [
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    // Triângulo largo na base: na faixa 70..90 o ocupado fica ~[55,145].
    expect(computeBandIntervals(220, 70, 90, [obstacle])).toEqual([
      { x: 0, width: 55 },
      { x: 145, width: 75 },
    ]);
  });

  it('merges two overlapping obstacles into one blocked span', () => {
    const a = { x: 80, y: 0, width: 60, height: 100, sides: 'both' as const };
    const b = { x: 120, y: 0, width: 60, height: 100, sides: 'both' as const };
    expect(computeBandIntervals(300, 0, 20, [a, b])).toEqual([
      { x: 0, width: 80 },
      { x: 180, width: 120 },
    ]);
  });
});
