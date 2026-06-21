/**
 * Cover PDF Export - technical spread proof for physical book covers.
 *
 * This draws the full cover as one piece: back cover + spine + front cover,
 * including bleed and PDF boxes. It is not a final cover designer yet.
 */

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import { calculateCoverGeometry } from '../model/spine';
import type { CoverGeometry, CoverGeometryInput } from '../model/spine';
import { inchesToPt } from '../model/print-units';

export interface RenderCoverPdfInput extends CoverGeometryInput {
  title?: string;
  subtitle?: string;
  author?: string;
}

export async function renderCoverPdf(input: RenderCoverPdfInput): Promise<Uint8Array> {
  const geometry = calculateCoverGeometry(input);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([geometry.fullWidthPt, geometry.fullHeightPt]);
  const bleedPt = inchesToPt(input.bleedInches);

  page.setMediaBox(0, 0, geometry.fullWidthPt, geometry.fullHeightPt);
  page.setBleedBox(0, 0, geometry.fullWidthPt, geometry.fullHeightPt);
  page.setTrimBox(
    bleedPt,
    bleedPt,
    geometry.fullWidthPt - bleedPt * 2,
    geometry.fullHeightPt - bleedPt * 2
  );

  drawCoverRegions(page, geometry);
  drawCoverText(page, geometry, regular, bold, {
    title: input.title ?? 'Prelo',
    subtitle: input.subtitle ?? 'Capa tecnica de teste',
    author: input.author ?? 'Motor de diagramacao',
    pageCount: input.pageCount,
  });

  return pdf.save({ useObjectStreams: false });
}

interface CoverText {
  title: string;
  subtitle: string;
  author: string;
  pageCount: number;
}

function drawCoverRegions(page: PDFPage, geometry: CoverGeometry) {
  const mediaBorder = rgb(0.18, 0.2, 0.24);
  const trimBorder = rgb(0.82, 0.24, 0.24);
  const guide = rgb(0.56, 0.6, 0.66);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: geometry.fullWidthPt,
    height: geometry.fullHeightPt,
    color: rgb(0.95, 0.93, 0.88),
    borderColor: mediaBorder,
    borderWidth: 1,
  });

  drawRegion(page, geometry.regionsPt.backCover, rgb(0.86, 0.89, 0.86), guide);
  drawRegion(page, geometry.regionsPt.spine, rgb(0.19, 0.22, 0.27), guide);
  drawRegion(page, geometry.regionsPt.frontCover, rgb(0.91, 0.88, 0.78), guide);

  page.drawRectangle({
    x: geometry.regionsPt.backCover.x,
    y: geometry.regionsPt.backCover.y,
    width:
      geometry.regionsPt.backCover.width +
      geometry.regionsPt.spine.width +
      geometry.regionsPt.frontCover.width,
    height: geometry.regionsPt.backCover.height,
    borderColor: trimBorder,
    borderWidth: 0.75,
  });
}

function drawRegion(
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  color: RGB,
  borderColor: RGB
) {
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color,
    borderColor,
    borderWidth: 0.5,
  });
}

function drawCoverText(
  page: PDFPage,
  geometry: CoverGeometry,
  regular: PDFFont,
  bold: PDFFont,
  text: CoverText
) {
  const { backCover, frontCover, spine } = geometry.regionsPt;
  const ink = rgb(0.12, 0.16, 0.23);
  const muted = rgb(0.28, 0.32, 0.38);
  const reverse = rgb(0.96, 0.95, 0.9);

  drawCenteredText(page, 'CONTRACAPA', backCover.x, backCover.y + backCover.height - 34, backCover.width, {
    font: bold,
    size: 11,
    color: muted,
  });
  drawCenteredText(page, text.author, backCover.x, backCover.y + backCover.height * 0.52, backCover.width, {
    font: regular,
    size: 18,
    color: ink,
  });
  drawCenteredText(page, coverSummary(geometry, text.pageCount), backCover.x, backCover.y + 36, backCover.width, {
    font: regular,
    size: 8,
    color: muted,
  });

  drawCenteredText(page, 'CAPA', frontCover.x, frontCover.y + frontCover.height - 34, frontCover.width, {
    font: bold,
    size: 11,
    color: muted,
  });
  drawCenteredText(page, text.title, frontCover.x, frontCover.y + frontCover.height * 0.6, frontCover.width, {
    font: bold,
    size: 30,
    color: ink,
  });
  drawCenteredText(page, text.subtitle, frontCover.x, frontCover.y + frontCover.height * 0.6 - 34, frontCover.width, {
    font: regular,
    size: 13,
    color: muted,
  });

  if (spine.width >= 18) {
    const label = text.title.toUpperCase();
    const size = Math.min(11, spine.width - 6);
    const textWidth = bold.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: spine.x + spine.width / 2 + size / 2,
      y: spine.y + (spine.height - textWidth) / 2,
      size,
      font: bold,
      color: reverse,
      rotate: degrees(90),
    });
  }
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  options: { font: PDFFont; size: number; color: RGB }
) {
  const safeText = text.trim();
  if (!safeText) return;
  const textWidth = options.font.widthOfTextAtSize(safeText, options.size);
  page.drawText(safeText, {
    x: x + Math.max(0, (width - textWidth) / 2),
    y,
    size: options.size,
    font: options.font,
    color: options.color,
  });
}

function coverSummary(geometry: CoverGeometry, pageCount: number): string {
  return [
    `${pageCount} paginas`,
    `lombada ${geometry.spine.mm.toFixed(1)} mm`,
    `arquivo ${geometry.fullWidthInches.toFixed(3)} x ${geometry.fullHeightInches.toFixed(3)} in`,
  ].join(' | ');
}
