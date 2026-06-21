/**
 * PDF Export — adaptador fino que desenha `PdfPlacements` num PDF real via pdf-lib.
 *
 * NÃO recalcula layout: apenas materializa os placements (caixas + runs já em pontos,
 * com Y invertido) calculados por `computePdfPlacements`. Saída em RGB.
 *
 * Limites (honestos): quando `fontBytes` não é informado, usa Helvetica padrão
 * como fallback. PDF/X, CMYK e OutputIntent NÃO são feitos aqui; dependem de
 * pós-processamento server-side (Ghostscript).
 */

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { PDFImage } from 'pdf-lib';
import type { PdfBox, PdfPlacements } from './pdf-layout';

export interface RenderPdfOptions {
  fontBytes?: Uint8Array | ArrayBuffer;
  imageBytesByFrameId?: Record<string, Uint8Array | ArrayBuffer>;
}

function hexToRgb(hex: string) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return rgb(0, 0, 0);
  const n = parseInt(match[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function applyBox(
  page: PDFPage,
  setter: 'setMediaBox' | 'setTrimBox' | 'setBleedBox',
  box: PdfBox
) {
  const [x0, y0, x1, y1] = box;
  page[setter](x0, y0, x1 - x0, y1 - y0);
}

export async function renderPdf(
  placements: PdfPlacements,
  options: RenderPdfOptions = {}
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font: PDFFont = await embedPdfFont(pdf, options.fontBytes);

  for (const placement of placements.pages) {
    const [, , mediaWidth, mediaHeight] = placement.mediaBox;
    const page = pdf.addPage([mediaWidth, mediaHeight]);

    applyBox(page, 'setMediaBox', placement.mediaBox);
    applyBox(page, 'setBleedBox', placement.bleedBox);
    applyBox(page, 'setTrimBox', placement.trimBox);

    for (const image of placement.images) {
      const bytes = options.imageBytesByFrameId?.[image.frameId];
      if (!bytes) continue;
      const embedded = await embedPdfImage(pdf, bytes, image.imageUrl);
      page.drawImage(embedded, {
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
      });
    }

    for (const run of placement.runs) {
      if (run.text.length === 0) continue;
      page.drawText(run.text, {
        x: run.x,
        y: run.y,
        size: run.fontSize,
        font,
        color: hexToRgb(run.color),
      });
    }
  }

  return pdf.save({ useObjectStreams: false });
}

export function resolvePdfFontkit() {
  return fontkit;
}

async function embedPdfFont(
  pdf: PDFDocument,
  fontBytes?: Uint8Array | ArrayBuffer
): Promise<PDFFont> {
  if (!fontBytes) {
    return pdf.embedFont(StandardFonts.Helvetica);
  }

  pdf.registerFontkit(resolvePdfFontkit());
  return pdf.embedFont(toUint8Array(fontBytes), { subset: true });
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  return new Uint8Array(bytes);
}

async function embedPdfImage(
  pdf: PDFDocument,
  bytes: Uint8Array | ArrayBuffer,
  sourceName: string
): Promise<PDFImage> {
  const data = toUint8Array(bytes);
  if (looksLikeJpeg(data) || /\.jpe?g($|\?)/i.test(sourceName)) {
    return pdf.embedJpg(data);
  }
  return pdf.embedPng(data);
}

function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
