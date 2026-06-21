/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import opentype from 'opentype.js';
import { PDFDocument } from 'pdf-lib';
import { TextEngine } from './engine';
import type { MeasureFn } from './engine/shaper';
import { measureTextWithFont } from './fonts/font-metrics';
import { runPreflight } from './model/preflight';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createDemoDocument,
  DEFAULT_DEMO_STYLE,
  DEMO_AUTO_PAGE_TEMPLATE_ID,
  DEMO_FRAMES,
  DEMO_FONT_FAMILY,
  DEMO_FONT_PATH,
  DEMO_MAX_AUTO_PAGES,
  DEMO_PAGE_PROFILES,
  DEMO_PAGES,
  DEMO_STORY_ID,
  INITIAL_TEXT,
} from './demo-document';
import type { ImageFrame } from './model/types';

const measureFn: MeasureFn = (text, style) => text.length * (style.fontSize / 2);

const engine = () =>
  new TextEngine({} as CanvasRenderingContext2D, {
    fontSize: DEFAULT_DEMO_STYLE.fontSize,
    fontFamily: DEMO_FONT_FAMILY,
    lineHeight: DEFAULT_DEMO_STYLE.lineHeight,
  });

describe('demo document bridge', () => {
  it('uses a real TTF font compatible with opentype.js measurements', async () => {
    const fontBytes = await readFile(DEMO_FONT_PATH);
    const fontBuffer = fontBytes.buffer.slice(
      fontBytes.byteOffset,
      fontBytes.byteOffset + fontBytes.byteLength
    );
    const font = opentype.parse(fontBuffer);

    expect(measureTextWithFont('Prelo fisico', font, DEFAULT_DEMO_STYLE.fontSize)).toBeGreaterThan(
      0
    );
  });

  it('keeps demo frames inside the page without overlapping each other', () => {
    const pageById = Object.fromEntries(DEMO_PAGES.map((page) => [page.id, page]));

    for (const frame of DEMO_FRAMES) {
      const page = pageById[frame.pageId];
      expect(page).toBeDefined();
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(page!.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(page!.height);
    }

    for (let i = 0; i < DEMO_FRAMES.length; i++) {
      for (let j = i + 1; j < DEMO_FRAMES.length; j++) {
        if (DEMO_FRAMES[i]!.pageId !== DEMO_FRAMES[j]!.pageId) continue;
        expect(framesOverlap(DEMO_FRAMES[i]!, DEMO_FRAMES[j]!)).toBe(false);
      }
    }
  });

  it('covers realistic multi-page book profiles in the local demo', () => {
    const document = createDemoDocument(INITIAL_TEXT);

    expect(document.pages).toHaveLength(DEMO_PAGE_PROFILES.length);
    expect(document.pages.length).toBeGreaterThan(1);
    expect(DEMO_PAGE_PROFILES.map((profile) => profile.category)).toEqual([
      'kids-magazine',
      'fiction',
      'non-fiction',
      'art-photo',
      'technical',
      'poetry',
      'planner',
      'fiction',
    ]);
    expect(document.stories[0]?.frameChainIds).toEqual(DEMO_FRAMES.map((frame) => frame.id));
    expect(INITIAL_TEXT.length).toBeGreaterThan(3500);
  });

  it('includes a wrapped image obstacle in the demo without adding it to the story chain', () => {
    const document = createDemoDocument(INITIAL_TEXT);
    const image = Object.values(document.frames).find(
      (frame): frame is ImageFrame => frame.type === 'image'
    );

    expect(image).toBeDefined();
    expect(image?.pageId).toBe('page-1');
    expect(image?.textWrap.mode).toBe('alpha-channel');
    expect(document.pages[0]?.frames).toContain(image?.id);
    expect(document.stories[0]?.frameChainIds).not.toContain(image?.id);

    const layout = engine().flowStory(document, DEMO_STORY_ID, {
      algorithm: 'greedy',
      measureFn,
    });

    const firstLine = layout.frameLayouts[0]?.lines[0];
    expect(firstLine?.x).toBeGreaterThan(0);
  });

  it('auto-paginates the long demo text and puts visible text on every generated page', async () => {
    const document = createDemoDocument(INITIAL_TEXT);
    const pagination = engine().paginateStory(document, DEMO_STORY_ID, {
      algorithm: 'kp',
      measureFn: await createRealDemoMeasureFn(),
      templatePageId: DEMO_AUTO_PAGE_TEMPLATE_ID,
      maxAutoPages: DEMO_MAX_AUTO_PAGES,
    });
    const layout = pagination.layout;
    const framesWithText = new Set(
      layout.frameLayouts
        .filter((frameLayout) => frameLayout.lines.length > 0)
        .map((frameLayout) => frameLayout.frameId)
    );

    expect(pagination.addedPages).toBeGreaterThan(0);
    expect(layout.overflow).toBe(false);
    for (const page of pagination.document.pages) {
      expect(page.frames.some((frameId) => framesWithText.has(frameId))).toBe(true);
    }
  });

  it('keeps the auto-paginated demo free of print-blocking preflight errors', async () => {
    const document = createDemoDocument(INITIAL_TEXT);
    const pagination = engine().paginateStory(document, DEMO_STORY_ID, {
      algorithm: 'kp',
      measureFn: await createRealDemoMeasureFn(),
      templatePageId: DEMO_AUTO_PAGE_TEMPLATE_ID,
      maxAutoPages: DEMO_MAX_AUTO_PAGES,
    });

    const issues = runPreflight(pagination.document, { layout: pagination.layout });

    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('builds a physical Document using the current demo style controls', () => {
    const document = createDemoDocument('Primeiro paragrafo.\n\nSegundo paragrafo.', {
      alignment: 'right',
      indent: 18,
      lineHeight: 1.8,
      spaceBefore: 4,
      spaceAfter: 9,
    });

    expect(document.pages[0]?.width).toBe(CANVAS_WIDTH);
    expect(document.pages[0]?.height).toBe(CANVAS_HEIGHT);
    expect(document.stories[0]?.id).toBe(DEMO_STORY_ID);
    expect(document.stories[0]?.frameChainIds).toEqual(DEMO_FRAMES.map((frame) => frame.id));
    expect(document.stories[0]?.paragraphs.map((paragraph) => paragraph.spans[0]?.text)).toEqual([
      'Primeiro paragrafo.',
      'Segundo paragrafo.',
    ]);

    const style = document.styles.body!;
    expect(style.alignment).toBe('right');
    expect(style.indent).toBe(18);
    expect(style.lineHeight).toBe(1.8);
    expect(style.spaceBefore).toBe(4);
    expect(style.spaceAfter).toBe(9);
    expect(style.characterStyle.fontFamily).toBe(DEMO_FONT_FAMILY);
    expect(style.characterStyle.fontSize).toBe(DEFAULT_DEMO_STYLE.fontSize);
  });

  it('feeds flowStory and documentToPdf for the local demo', async () => {
    const document = createDemoDocument(
      'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
      {
        alignment: 'justify',
        indent: 12,
        lineHeight: 1.6,
        spaceAfter: 6,
      }
    );

    const layout = engine().flowStory(document, DEMO_STORY_ID, {
      algorithm: 'greedy',
      measureFn,
    });

    expect(layout.frameLayouts.map((frameLayout) => frameLayout.frameId)).toEqual(
      DEMO_FRAMES.map((frame) => frame.id)
    );
    expect(layout.frameLayouts.some((frameLayout) => frameLayout.lines.length > 0)).toBe(true);
    expect(layout.frameLayouts.every((frameLayout) => frameLayout.rectOnPage)).toBe(true);

    const bytes = await engine().documentToPdf(document, {
      algorithm: 'greedy',
      measureFn,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(DEMO_PAGES.length);
    const mediaBox = pdf.getPage(0).getMediaBox();
    expect([mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height]).toEqual([0, 0, 450, 666]);
  });

  it('keeps technical tokens and short words intact in the demo layout', async () => {
    const document = createDemoDocument(INITIAL_TEXT, {
      ...DEFAULT_DEMO_STYLE,
      alignment: 'right',
    });

    const layout = engine().flowStory(document, DEMO_STORY_ID, {
      algorithm: 'kp',
      measureFn: await createRealDemoMeasureFn(),
    });

    const lineTexts = layout.frameLayouts.flatMap((frameLayout) =>
      frameLayout.lines.map((line) => line.text)
    );

    const renderedText = lineTexts.join('\n');

    for (const token of ['flowStory', '6x9', 'PDF', 'documento', 'entrelinha']) {
      expect(renderedText).toContain(token);
    }

    expect(renderedText).not.toContain('docu-mento');
  });
});

async function createRealDemoMeasureFn(): Promise<MeasureFn> {
  const fontBytes = await readFile(DEMO_FONT_PATH);
  const fontBuffer = fontBytes.buffer.slice(
    fontBytes.byteOffset,
    fontBytes.byteOffset + fontBytes.byteLength
  );
  const font = opentype.parse(fontBuffer);

  return (text, style) =>
    measureTextWithFont(text, font, style.fontSize, style.letterSpacing);
}

function framesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
