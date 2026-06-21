import { describe, expect, it } from 'vitest';
import { imageEffectiveDpi, isImageFrame } from './image-checks';
import { inchesToPt } from './print-units';
import type { Frame, ImageFrame } from './types';

const imageFrame = (overrides: Partial<ImageFrame> = {}): ImageFrame => ({
  id: 'img-1',
  pageId: 'page-1',
  x: 0,
  y: 0,
  width: inchesToPt(6),
  height: inchesToPt(9),
  rotation: 0,
  type: 'image',
  storyId: null,
  prevFrameId: null,
  nextFrameId: null,
  imageUrl: 'x.png',
  originalWidth: 1800,
  originalHeight: 2700,
  cropX: 0,
  cropY: 0,
  cropWidth: 1800,
  cropHeight: 2700,
  fitMode: 'fill',
  textWrap: { mode: 'none', offset: 0, sides: 'both', alphaThreshold: 0.5 },
  ...overrides,
});

describe('imageEffectiveDpi', () => {
  it('computes DPI from original pixels over the physical frame size', () => {
    const dpi = imageEffectiveDpi(imageFrame()); // 1800px / 6in = 300; 2700px / 9in = 300
    expect(dpi.dpiX).toBeCloseTo(300, 6);
    expect(dpi.dpiY).toBeCloseTo(300, 6);
    expect(dpi.effectiveDpi).toBeCloseTo(300, 6);
  });

  it('uses the limiting (smaller) dimension as the effective DPI', () => {
    const dpi = imageEffectiveDpi(imageFrame({ originalHeight: 1350 })); // dpiY = 1350/9 = 150
    expect(dpi.dpiX).toBeCloseTo(300, 6);
    expect(dpi.dpiY).toBeCloseTo(150, 6);
    expect(dpi.effectiveDpi).toBeCloseTo(150, 6);
  });

  it('returns 0 DPI for a degenerate (zero-size) frame instead of Infinity', () => {
    expect(imageEffectiveDpi(imageFrame({ width: 0, height: 0 })).effectiveDpi).toBe(0);
  });
});

describe('isImageFrame', () => {
  it('narrows by frame type', () => {
    const image: Frame = imageFrame();
    const text: Frame = { ...imageFrame(), type: 'text' } as unknown as Frame;
    expect(isImageFrame(image)).toBe(true);
    expect(isImageFrame(text)).toBe(false);
  });
});
