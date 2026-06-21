/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextEngine } from '../engine';
import type { LayoutLine } from '../engine/types';
import { BLANK_BODY_STYLE_ID, BLANK_PROJECT_NAME, createBlankDocument } from './blank-document';
import { createEngineAdapter } from './engine-adapter';
import type { EditorProject } from './editor-state';
import { EDITOR_LAYOUT_ALGORITHM } from './editor-layout';
import { LONG_PORTUGUESE_MANUSCRIPT } from './fixtures/long-portuguese-manuscript';

const measureFn = (text: string) => text.length * 5;

interface PpmImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

interface InkBounds {
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function projectWithManuscript(): EditorProject {
  const document = createBlankDocument();
  const story = document.stories[0]!;
  story.paragraphs = LONG_PORTUGUESE_MANUSCRIPT.split(/\n\n+/).map((text) => ({
    styleId: BLANK_BODY_STYLE_ID,
    spans: [{ text }],
  }));

  return {
    id: 'quality-gate-project',
    name: BLANK_PROJECT_NAME,
    document,
  };
}

function realEngineAdapter() {
  const engine = new TextEngine({} as CanvasRenderingContext2D);
  return createEngineAdapter(engine);
}

function justifiedLineEnd(line: LayoutLine): number {
  const last = line.runs[line.runs.length - 1];
  return last ? last.x + last.width : line.width;
}

function renderFirstPageToPpm(pdfBytes: Uint8Array): PpmImage {
  const dir = mkdtempSync(join(tmpdir(), 'prelo-pdf-smoke-'));
  try {
    const pdfPath = join(dir, 'input.pdf');
    const outputPrefix = join(dir, 'page');
    const cacheDir = join(dir, 'cache');
    mkdirSync(cacheDir);
    writeFileSync(pdfPath, pdfBytes);

    execFileSync('pdftoppm', [
      '-q',
      '-f',
      '1',
      '-l',
      '1',
      '-singlefile',
      '-r',
      '72',
      pdfPath,
      outputPrefix,
    ], {
      env: {
        ...process.env,
        HOME: dir,
        XDG_CACHE_HOME: cacheDir,
      },
    });

    return parsePpm(readFileSync(`${outputPrefix}.ppm`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parsePpm(buffer: Buffer): PpmImage {
  const magic = readPpmToken(buffer, 0);
  const width = readPpmToken(buffer, magic.offset);
  const height = readPpmToken(buffer, width.offset);
  const maxValue = readPpmToken(buffer, height.offset);

  if (magic.value !== 'P6') {
    throw new Error(`Unsupported PPM format: ${magic.value}`);
  }
  if (maxValue.value !== '255') {
    throw new Error(`Unsupported PPM max value: ${maxValue.value}`);
  }

  const parsedWidth = Number(width.value);
  const parsedHeight = Number(height.value);
  let dataOffset = maxValue.offset;
  if (isPpmWhitespace(buffer[dataOffset])) dataOffset++;

  const expectedLength = parsedWidth * parsedHeight * 3;
  const pixels = buffer.subarray(dataOffset, dataOffset + expectedLength);
  if (pixels.byteLength !== expectedLength) {
    throw new Error(`Invalid PPM pixel data: expected ${expectedLength}, got ${pixels.byteLength}`);
  }

  return {
    width: parsedWidth,
    height: parsedHeight,
    pixels,
  };
}

function readPpmToken(buffer: Buffer, offset: number): { value: string; offset: number } {
  let cursor = offset;
  while (cursor < buffer.length) {
    const byte = buffer[cursor];
    if (byte === 35) {
      while (cursor < buffer.length && buffer[cursor] !== 10) cursor++;
      continue;
    }
    if (!isPpmWhitespace(byte)) break;
    cursor++;
  }

  const start = cursor;
  while (cursor < buffer.length && !isPpmWhitespace(buffer[cursor])) {
    cursor++;
  }

  return {
    value: buffer.toString('ascii', start, cursor),
    offset: cursor,
  };
}

function isPpmWhitespace(byte: number | undefined): boolean {
  return byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
}

function analyzeInkBounds(image: PpmImage, whiteThreshold: number): InkBounds {
  let count = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < image.pixels.length; index += 3) {
    const r = image.pixels[index]!;
    const g = image.pixels[index + 1]!;
    const b = image.pixels[index + 2]!;
    if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
      continue;
    }

    const pixelIndex = index / 3;
    const x = pixelIndex % image.width;
    const y = Math.floor(pixelIndex / image.width);
    count++;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { count, minX, minY, maxX, maxY };
}

describe('PDF/preview quality gate', () => {
  it('paginates a long Portuguese manuscript without grotesquely stretched justified lines', () => {
    const project = projectWithManuscript();
    const story = project.document.stories[0]!;

    const pagination = realEngineAdapter().paginateProjectStory(project, story.id, {
      algorithm: EDITOR_LAYOUT_ALGORITHM,
      maxAutoPages: 50,
      measureFn,
    });

    const lines = pagination.layout.frameLayouts.flatMap((frameLayout) => frameLayout.lines);
    const nonLastLines = lines.filter((line, index) => index < lines.length - 1 && line.runs.length > 0);
    const overStretched = nonLastLines.filter((line) => {
      const naturalWidth = line.width;
      const renderedWidth = justifiedLineEnd(line);
      return renderedWidth - naturalWidth > naturalWidth;
    });

    expect(lines.length).toBeGreaterThan(50);
    expect(pagination.layout.overflow).toBe(false);
    expect(overStretched).toEqual([]);
  });

  it('exports the same paginated manuscript as a valid multi-page 6x9 PDF', async () => {
    const project = projectWithManuscript();
    const story = project.document.stories[0]!;
    const adapter = realEngineAdapter();

    const pagination = adapter.paginateProjectStory(project, story.id, {
      algorithm: EDITOR_LAYOUT_ALGORITHM,
      maxAutoPages: 50,
      measureFn,
    });
    const bytes = await adapter.exportProjectToPdf({ ...project, document: pagination.document }, {
      algorithm: EDITOR_LAYOUT_ALGORITHM,
      measureFn,
    });

    const pdf = await PDFDocument.load(bytes);
    const firstPage = pdf.getPage(0);

    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(firstPage.getMediaBox()).toMatchObject({ width: 450, height: 666 });
    expect(firstPage.getTrimBox()).toMatchObject({ x: 9, y: 9, width: 432, height: 648 });
  });

  it('rasterizes the exported PDF and detects visible text inside the page', async () => {
    const project = projectWithManuscript();
    const story = project.document.stories[0]!;
    const adapter = realEngineAdapter();

    const pagination = adapter.paginateProjectStory(project, story.id, {
      algorithm: EDITOR_LAYOUT_ALGORITHM,
      maxAutoPages: 50,
      measureFn,
    });
    const bytes = await adapter.exportProjectToPdf({ ...project, document: pagination.document }, {
      algorithm: EDITOR_LAYOUT_ALGORITHM,
      measureFn,
    });

    const rendered = renderFirstPageToPpm(bytes);
    const ink = analyzeInkBounds(rendered, 245);

    expect(rendered.width).toBe(450);
    expect(rendered.height).toBe(666);
    expect(ink.count).toBeGreaterThan(1_000);
    expect(ink.minX).toBeGreaterThanOrEqual(40);
    expect(ink.minY).toBeGreaterThanOrEqual(40);
    expect(ink.maxX).toBeLessThanOrEqual(410);
    expect(ink.maxY).toBeLessThanOrEqual(630);
  });
});
