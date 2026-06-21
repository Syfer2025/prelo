import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_STYLE,
  DEFAULT_PARAGRAPH_STYLE,
  PRINT_PROFILE_KDP_6x9,
} from './types';
import type { Document, Frame, ImageFrame, Story } from './types';
import type { LayoutResult } from '../engine/types';
import { requiredPrintMargins, runPreflight } from './preflight';

const imageFixture = (id: string, originalWidth: number, originalHeight: number): ImageFrame => ({
  id,
  pageId: 'page-1',
  x: 0,
  y: 0,
  width: 432, // 6in @72 = trim inteiro da página de teste
  height: 648, // 9in
  rotation: 0,
  type: 'image',
  storyId: null,
  prevFrameId: null,
  nextFrameId: null,
  imageUrl: 'x.png',
  originalWidth,
  originalHeight,
  cropX: 0,
  cropY: 0,
  cropWidth: originalWidth,
  cropHeight: originalHeight,
  fitMode: 'fill',
  textWrap: { mode: 'none', offset: 0, sides: 'both', alphaThreshold: 0.5 },
});

const textFrame = (id: string, overrides: Partial<Frame> = {}): Frame => ({
  id,
  pageId: 'page-1',
  x: 72,
  y: 72,
  width: 288,
  height: 504,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  prevFrameId: null,
  nextFrameId: null,
  ...overrides,
});

const story: Story = {
  id: 'story-1',
  paragraphs: [{ styleId: 'body', spans: [{ text: 'Texto fisico.' }] }],
  frameChainIds: ['frame-1'],
};

function documentFor(frames: Frame[] = [textFrame('frame-1')]): Document {
  return {
    pages: [
      {
        id: 'page-1',
        width: 432,
        height: 648,
        margins: { top: 36, bottom: 36, inside: 36, outside: 36 },
        bleed: 9,
        side: 'single',
        masterPageId: null,
        frames: frames.map((frame) => frame.id),
      },
    ],
    frames: Object.fromEntries(frames.map((frame) => [frame.id, frame])),
    stories: [story],
    styles: {
      body: {
        ...DEFAULT_PARAGRAPH_STYLE,
        characterStyle: DEFAULT_CHARACTER_STYLE,
      },
    },
    characterStyles: {},
    masterPages: {},
    defaultStyleId: 'body',
    facingPages: false,
    printProfile: PRINT_PROFILE_KDP_6x9,
    baselineGrid: null,
  };
}

describe('runPreflight', () => {
  it('accepts a physically valid 6x9 document with safe text frames', () => {
    expect(runPreflight(documentFor())).toEqual([]);
  });

  it('reports page trim and bleed mismatches against the active print profile', () => {
    const document = documentFor();
    document.pages[0] = {
      ...document.pages[0]!,
      width: 400,
      bleed: 0,
    };

    expect(runPreflight(document).map((issue) => issue.code)).toEqual([
      'PAGE_SIZE_MISMATCH',
      'BLEED_MISMATCH',
    ]);
  });

  it('uses the print profile gutter table as the required inside margin', () => {
    const required = requiredPrintMargins(PRINT_PROFILE_KDP_6x9, 151);

    expect(required.inside).toBe(36);
    expect(required.top).toBe(27);
  });

  it('reports margins below the profile minimum or page-count gutter', () => {
    const document = documentFor();
    document.pages = Array.from({ length: 151 }, (_, index) => ({
      ...document.pages[0]!,
      id: `page-${index + 1}`,
      frames: index === 0 ? ['frame-1'] : [],
      margins: { top: 20, bottom: 36, inside: 27, outside: 36 },
    }));

    const issues = runPreflight(document);

    expect(issues.some((issue) => issue.code === 'MARGIN_BELOW_MINIMUM')).toBe(true);
    expect(issues.some((issue) => issue.message.includes('inside'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('top'))).toBe(true);
  });

  it('reports frames outside trim and text frames outside the safe area', () => {
    const document = documentFor([
      textFrame('frame-1', { x: -1, y: 72, width: 288, height: 504 }),
      textFrame('frame-2', { x: 0, y: 0, width: 80, height: 80 }),
    ]);
    document.stories[0] = { ...story, frameChainIds: ['frame-1', 'frame-2'] };

    const issues = runPreflight(document);

    expect(issues.some((issue) => issue.code === 'FRAME_OUTSIDE_TRIM')).toBe(true);
    expect(issues.some((issue) => issue.code === 'TEXT_FRAME_OUTSIDE_SAFE_AREA')).toBe(true);
  });

  it('reports layout overflow when a layout result is supplied', () => {
    const layout: LayoutResult = {
      frameLayouts: [],
      overflow: true,
      overflowText: 'texto que sobrou',
    };

    expect(runPreflight(documentFor(), { layout }).map((issue) => issue.code)).toContain(
      'TEXT_OVERFLOW'
    );
  });

  it('warns when an image is below the profile minimum DPI', () => {
    const document = documentFor([imageFixture('img-low', 600, 900)]); // 6x9in => 100 DPI
    document.stories = [];

    const issues = runPreflight(document);
    expect(issues.some((issue) => issue.code === 'LOW_IMAGE_DPI')).toBe(true);
    expect(issues.find((issue) => issue.code === 'LOW_IMAGE_DPI')?.frameId).toBe('img-low');
  });

  it('does not warn about images at or above the minimum DPI', () => {
    const document = documentFor([imageFixture('img-ok', 1800, 2700)]); // 300 DPI
    document.stories = [];

    expect(runPreflight(document).some((issue) => issue.code === 'LOW_IMAGE_DPI')).toBe(false);
  });

  it('errors when an image touches the trim edge but does not extend to bleed', () => {
    const image = imageFixture('img-no-bleed', 1800, 2700);
    const document = documentFor([image]);
    document.stories = [];

    const issues = runPreflight(document);

    expect(issues.some((issue) => issue.code === 'IMAGE_MISSING_BLEED')).toBe(true);
    expect(issues.find((issue) => issue.code === 'IMAGE_MISSING_BLEED')?.severity).toBe('error');
  });

  it('allows an image that extends from trim edge to the required bleed', () => {
    const image = imageFixture('img-with-bleed', 1860, 2760);
    image.x = -9;
    image.y = -9;
    image.width = 432 + 18;
    image.height = 648 + 18;
    const document = documentFor([image]);
    document.stories = [];

    const codes = runPreflight(document).map((issue) => issue.code);

    expect(codes).not.toContain('IMAGE_MISSING_BLEED');
    expect(codes).not.toContain('FRAME_OUTSIDE_TRIM');
  });

  it('does not emit any spine issue by default', () => {
    expect(runPreflight(documentFor()).some((issue) => issue.code.startsWith('SPINE'))).toBe(false);
  });

  it('warns when spine text is requested but the page count is too low', () => {
    const issues = runPreflight(documentFor(), { expectSpineText: true });
    expect(issues.some((issue) => issue.code === 'SPINE_TOO_THIN_FOR_TEXT')).toBe(true);
  });

  it('does not warn about spine text when there are enough pages', () => {
    const document = documentFor();
    document.pages = Array.from({ length: 120 }, (_, index) => ({
      ...document.pages[0]!,
      id: `page-${index + 1}`,
      frames: index === 0 ? ['frame-1'] : [],
    }));

    const issues = runPreflight(document, { expectSpineText: true });
    expect(issues.some((issue) => issue.code === 'SPINE_TOO_THIN_FOR_TEXT')).toBe(false);
  });

  it('reports missing and non-text story frames', () => {
    const image = textFrame('image-1', { type: 'image' });
    const document = documentFor([image]);
    document.stories[0] = { ...story, frameChainIds: ['image-1', 'missing'] };

    const codes = runPreflight(document).map((issue) => issue.code);

    expect(codes).toContain('NON_TEXT_FRAME_IN_STORY');
    expect(codes).toContain('MISSING_FRAME');
  });
});
