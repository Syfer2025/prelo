import { describe, expect, it } from 'vitest';
import {
  calculateCoverGeometry,
  calculateSpineWidth,
  spineWidthFromProfile,
  KDP_SPINE_CALIPER_INCHES,
  MIN_PAGES_FOR_SPINE_TEXT,
} from './spine';
import { inchesToPt, MM_PER_INCH } from './print-units';
import { PRINT_PROFILE_KDP_6x9, PRINT_PROFILE_OFFSET_BR } from './types';

describe('calculateSpineWidth', () => {
  it('uses the KDP white-paper caliper (0.002252 in/page)', () => {
    const spine = calculateSpineWidth({ pageCount: 200, stock: { formula: 'kdp-white' } });
    expect(spine.inches).toBeCloseTo(200 * 0.002252, 6); // 0.4504"
    expect(spine.mm).toBeCloseTo(0.4504 * MM_PER_INCH, 4); // ~11.44 mm
    expect(spine.points).toBeCloseTo(inchesToPt(0.4504), 4);
    expect(spine.formula).toBe('kdp-white');
  });

  it('uses the KDP cream-paper caliper (0.0025 in/page)', () => {
    const spine = calculateSpineWidth({ pageCount: 200, stock: { formula: 'kdp-cream' } });
    expect(spine.inches).toBeCloseTo(0.5, 6);
    expect(spine.mm).toBeCloseTo(12.7, 4);
  });

  it('uses the KDP color-paper caliper (0.002347 in/page)', () => {
    const spine = calculateSpineWidth({ pageCount: 200, stock: { formula: 'kdp-color' } });
    expect(spine.inches).toBeCloseTo(200 * KDP_SPINE_CALIPER_INCHES['kdp-color'], 6);
  });

  it('derives offset-br thickness from grammage and bulk (mm = pages × gsm × bulk / 2000)', () => {
    const spine = calculateSpineWidth({
      pageCount: 200,
      stock: { formula: 'offset-br', paperGsm: 80, paperBulkCm3PerG: 1.0 },
    });
    // 200 × 80 × 1.0 / 2000 = 8.0 mm
    expect(spine.mm).toBeCloseTo(8.0, 6);
  });

  it('throws on an invalid page count (<= 0 or non-integer)', () => {
    expect(() => calculateSpineWidth({ pageCount: 0, stock: { formula: 'kdp-white' } })).toThrow();
    expect(() => calculateSpineWidth({ pageCount: -10, stock: { formula: 'kdp-white' } })).toThrow();
    expect(() => calculateSpineWidth({ pageCount: 1.5, stock: { formula: 'kdp-white' } })).toThrow();
  });

  it('requires grammage for offset-br', () => {
    expect(() => calculateSpineWidth({ pageCount: 200, stock: { formula: 'offset-br' } })).toThrow();
  });

  it('flags a spine too thin for spine text below the formula minimum', () => {
    const thin = calculateSpineWidth({ pageCount: 50, stock: { formula: 'kdp-white' } });
    expect(thin.hasPrintableSpine).toBe(false);
    expect(thin.minPagesForSpineText).toBe(MIN_PAGES_FOR_SPINE_TEXT['kdp-white']);

    const thick = calculateSpineWidth({ pageCount: 120, stock: { formula: 'kdp-white' } });
    expect(thick.hasPrintableSpine).toBe(true);
  });
});

describe('calculateCoverGeometry', () => {
  it('builds a full cover = back + spine + front + bleed on both sides', () => {
    const cover = calculateCoverGeometry({
      trimWidthInches: 6,
      trimHeightInches: 9,
      bleedInches: 0.125,
      pageCount: 200,
      stock: { formula: 'kdp-white' },
    });

    const spineInches = 200 * 0.002252; // 0.4504
    expect(cover.fullWidthInches).toBeCloseTo(2 * 6 + spineInches + 2 * 0.125, 6); // 12.7004
    expect(cover.fullHeightInches).toBeCloseTo(9 + 2 * 0.125, 6); // 9.25

    // Regiões em pontos, com origem após o bleed.
    expect(cover.regionsPt.backCover.x).toBeCloseTo(inchesToPt(0.125), 4);
    expect(cover.regionsPt.backCover.width).toBeCloseTo(inchesToPt(6), 4);
    expect(cover.regionsPt.spine.x).toBeCloseTo(inchesToPt(0.125 + 6), 4);
    expect(cover.regionsPt.spine.width).toBeCloseTo(inchesToPt(spineInches), 4);
    expect(cover.regionsPt.frontCover.x).toBeCloseTo(inchesToPt(0.125 + 6 + spineInches), 4);
    expect(cover.regionsPt.frontCover.height).toBeCloseTo(inchesToPt(9), 4);
  });
});

describe('spineWidthFromProfile', () => {
  it('computes the spine for a KDP profile from a page count', () => {
    const spine = spineWidthFromProfile(PRINT_PROFILE_KDP_6x9, 200);
    expect(spine?.inches).toBeCloseTo(0.4504, 6);
  });

  it('returns null for offset profiles (paper grammage not on the profile)', () => {
    expect(spineWidthFromProfile(PRINT_PROFILE_OFFSET_BR, 200)).toBeNull();
  });
});
