import { describe, expect, it } from 'vitest';
import { PRINT_PROFILE_KDP_6x9 } from './types';
import {
  inchesToPt,
  marginsInchesToPt,
  mmToPt,
  printProfileToPageGeometry,
  ptToInches,
  rectInchesToPt,
} from './print-units';

describe('print unit conversions', () => {
  it('uses PostScript points as the canonical print layout unit', () => {
    expect(inchesToPt(1)).toBe(72);
    expect(ptToInches(144)).toBe(2);
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
  });

  it('derives print page geometry from a print profile in PostScript points', () => {
    const geometry = printProfileToPageGeometry(PRINT_PROFILE_KDP_6x9);

    expect(geometry.unit).toBe('pt');
    expect(geometry.trim.width).toBe(432);
    expect(geometry.trim.height).toBe(648);
    expect(geometry.bleed).toBe(9);
    expect(geometry.minMargins).toEqual({
      top: 27,
      bottom: 27,
      inside: 27,
      outside: 27,
    });
  });

  it('converts physical margins and rectangles from inches to points', () => {
    expect(marginsInchesToPt({ top: 0.5, bottom: 0.25, inside: 1, outside: 0.75 })).toEqual({
      top: 36,
      bottom: 18,
      inside: 72,
      outside: 54,
    });

    expect(rectInchesToPt({ x: 0.5, y: 1, width: 5, height: 7 })).toEqual({
      x: 36,
      y: 72,
      width: 360,
      height: 504,
    });
  });
});
