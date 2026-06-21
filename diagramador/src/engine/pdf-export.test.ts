/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { renderPdf, resolvePdfFontkit } from './pdf-export';
import type { PdfPlacements } from './pdf-layout';
import { DEMO_FONT_PATH } from '../demo-document';

const placements: PdfPlacements = {
  unit: 'pt',
  pages: [
    {
      id: 'p1',
      mediaBox: [0, 0, 450, 666],
      trimBox: [9, 9, 441, 657],
      bleedBox: [0, 0, 450, 666],
      runs: [{ text: 'alpha', x: 81, y: 559, fontSize: 10, color: '#1f2d44' }],
      images: [],
    },
  ],
};

const onePixelPng = () =>
  Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lv6l8wAAAABJRU5ErkJggg==',
      'base64'
    )
  );

describe('renderPdf', () => {
  it('registers a fontkit object compatible with custom font embedding', () => {
    expect(typeof resolvePdfFontkit().create).toBe('function');
  });

  it('produces a loadable PDF with one page per placement and the correct boxes', async () => {
    const bytes = await renderPdf(placements);
    expect(bytes.length).toBeGreaterThan(0);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);

    const page = loaded.getPage(0);
    const media = page.getMediaBox();
    expect([media.x, media.y, media.width, media.height]).toEqual([0, 0, 450, 666]);
    const trim = page.getTrimBox();
    expect([trim.x, trim.y, trim.width, trim.height]).toEqual([9, 9, 432, 648]);
  });

  it('embeds provided TTF font bytes instead of drawing with a standard fallback font', async () => {
    const fontBytes = await readFile(DEMO_FONT_PATH);

    const bytes = await renderPdf(placements, { fontBytes });

    const rawPdf = Buffer.from(bytes).toString('latin1');
    expect(rawPdf).toContain('/FontFile2');
  });

  it('embeds and draws image placements when image bytes are provided', async () => {
    const bytes = await renderPdf(
      {
        unit: 'pt',
        pages: [
          {
            ...placements.pages[0]!,
            runs: [],
            images: [
              {
                frameId: 'img-1',
                imageUrl: '/images/demo.png',
                x: 20,
                y: 30,
                width: 40,
                height: 50,
              },
            ],
          },
        ],
      },
      { imageBytesByFrameId: { 'img-1': onePixelPng() } }
    );

    const rawPdf = Buffer.from(bytes).toString('latin1');
    expect(rawPdf).toContain('/Subtype /Image');
  });
});
