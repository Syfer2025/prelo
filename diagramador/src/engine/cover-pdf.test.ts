import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderCoverPdf } from './cover-pdf';
import { calculateCoverGeometry } from '../model/spine';
import { PRINT_PROFILE_KDP_6x9 } from '../model/types';
import { inchesToPt } from '../model/print-units';

describe('renderCoverPdf', () => {
  it('produces a single spread cover PDF with physical boxes from cover geometry', async () => {
    const input = {
      trimWidthInches: PRINT_PROFILE_KDP_6x9.trimWidth,
      trimHeightInches: PRINT_PROFILE_KDP_6x9.trimHeight,
      bleedInches: PRINT_PROFILE_KDP_6x9.bleed,
      pageCount: 200,
      stock: { formula: PRINT_PROFILE_KDP_6x9.spineFormula },
      title: 'Prelo Demo',
      subtitle: 'Capa tecnica de teste',
      author: 'Motor Prelo',
    } as const;
    const geometry = calculateCoverGeometry(input);

    const bytes = await renderCoverPdf(input);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);

    const page = loaded.getPage(0);
    const media = page.getMediaBox();
    expect(media.x).toBe(0);
    expect(media.y).toBe(0);
    expect(media.width).toBeCloseTo(geometry.fullWidthPt, 4);
    expect(media.height).toBeCloseTo(geometry.fullHeightPt, 4);

    const bleed = page.getBleedBox();
    expect(bleed.x).toBe(0);
    expect(bleed.y).toBe(0);
    expect(bleed.width).toBeCloseTo(geometry.fullWidthPt, 4);
    expect(bleed.height).toBeCloseTo(geometry.fullHeightPt, 4);

    const trim = page.getTrimBox();
    const bleedPt = inchesToPt(input.bleedInches);
    expect(trim.x).toBeCloseTo(bleedPt, 4);
    expect(trim.y).toBeCloseTo(bleedPt, 4);
    expect(trim.width).toBeCloseTo(inchesToPt(2 * input.trimWidthInches) + geometry.spine.points, 4);
    expect(trim.height).toBeCloseTo(inchesToPt(input.trimHeightInches), 4);
  });
});
