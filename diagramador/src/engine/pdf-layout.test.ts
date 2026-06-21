import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_STYLE,
  DEFAULT_PARAGRAPH_STYLE,
  PRINT_PROFILE_KDP_6x9,
} from '../model/types';
import type { Document, Frame, ImageFrame, Story } from '../model/types';
import { normalizeDocumentGeometry } from '../model/physical-geometry';
import { TextEngine } from './index';
import { computePdfPlacements } from './pdf-layout';
import type { MeasureFn } from './shaper';

const measureFn: MeasureFn = (text) => text.length * 5;

const textFrame = (id: string, rect: { x: number; y: number; width: number; height: number }): Frame => ({
  id,
  pageId: 'page-1',
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  nextFrameId: null,
  prevFrameId: null,
});

const imageFrame = (
  id: string,
  rect: { x: number; y: number; width: number; height: number }
): ImageFrame => ({
  id,
  pageId: 'page-1',
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
  rotation: 0,
  type: 'image',
  storyId: null,
  nextFrameId: null,
  prevFrameId: null,
  imageUrl: '/images/demo.png',
  originalWidth: 300,
  originalHeight: 300,
  cropX: 0,
  cropY: 0,
  cropWidth: 300,
  cropHeight: 300,
  fitMode: 'fill',
  textWrap: { mode: 'none', offset: 0, sides: 'both', alphaThreshold: 0.5 },
});

const documentFor = (story: Story, frames: Frame[]): Document => ({
  pages: [
    {
      id: 'page-1',
      width: 432,
      height: 648,
      margins: { top: 36, bottom: 36, inside: 36, outside: 36 },
      bleed: 0,
      side: 'single',
      masterPageId: null,
      frames: frames.map((f) => f.id),
    },
  ],
  frames: Object.fromEntries(frames.map((f) => [f.id, f])),
  stories: [story],
  styles: {
    body: {
      ...DEFAULT_PARAGRAPH_STYLE,
      name: 'Body',
      characterStyle: { ...DEFAULT_CHARACTER_STYLE, fontFamily: 'Test', fontSize: 10 },
    },
  },
  characterStyles: {},
  masterPages: {},
  defaultStyleId: 'body',
  facingPages: false,
  printProfile: PRINT_PROFILE_KDP_6x9,
  baselineGrid: null,
});

const engine = () =>
  new TextEngine({} as CanvasRenderingContext2D, { fontSize: 10, fontFamily: 'Test', lineHeight: 1.5 });

describe('computePdfPlacements', () => {
  it('emits one PDF page per Page with physical boxes in points (origin bottom-left)', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [{ styleId: 'body', spans: [{ text: 'alpha' }] }],
    };
    const document = documentFor(story, [textFrame('frame-a', { x: 72, y: 90, width: 288, height: 432 })]);
    const geometry = normalizeDocumentGeometry(document);
    const layout = engine().flowStory(document, 'story-1', { algorithm: 'greedy', measureFn });

    const placements = computePdfPlacements(geometry, layout.frameLayouts, document.frames);

    expect(placements.unit).toBe('pt');
    expect(placements.pages).toHaveLength(1);
    // KDP 6x9 + bleed 0.125" => media 450x666, trim offset 9pt.
    expect(placements.pages[0]?.mediaBox).toEqual([0, 0, 450, 666]);
    expect(placements.pages[0]?.trimBox).toEqual([9, 9, 441, 657]);
    expect(placements.pages[0]?.bleedBox).toEqual([0, 0, 450, 666]);
  });

  it('places each run in absolute PDF coordinates with the Y axis inverted', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [{ styleId: 'body', spans: [{ text: 'alpha' }] }],
    };
    const document = documentFor(story, [textFrame('frame-a', { x: 72, y: 90, width: 288, height: 432 })]);
    const geometry = normalizeDocumentGeometry(document);
    const layout = engine().flowStory(document, 'story-1', { algorithm: 'greedy', measureFn });

    const placements = computePdfPlacements(geometry, layout.frameLayouts, document.frames);
    const run = placements.pages[0]?.runs[0];

    // rectOnPage = trim(9) + rectOnTrim(72,90) => (81,99). line.x/run.x = 0 => x = 81.
    expect(run?.x).toBe(81);
    // baseline (de cima) = rectOnPage.y(99) + line.y(0) + fontSize(10)*0.8 = 107.
    // Y do PDF (de baixo) = mediaHeight(666) - 107 = 559.
    expect(run?.y).toBe(559);
    expect(run?.text).toBe('alpha');
    expect(run?.fontSize).toBe(10);
    expect(run?.color).toBe('#1f2d44');
  });

  it('places image frames in absolute PDF coordinates with the Y axis inverted', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [{ styleId: 'body', spans: [{ text: 'alpha' }] }],
    };
    const image = imageFrame('img-1', { x: 36, y: 72, width: 144, height: 108 });
    const document = documentFor(story, [
      textFrame('frame-a', { x: 72, y: 90, width: 288, height: 432 }),
      image,
    ]);
    const geometry = normalizeDocumentGeometry(document);
    const layout = engine().flowStory(document, 'story-1', { algorithm: 'greedy', measureFn });

    const placements = computePdfPlacements(geometry, layout.frameLayouts, document.frames);
    const placed = placements.pages[0]?.images[0];

    expect(placed).toEqual({
      frameId: 'img-1',
      imageUrl: '/images/demo.png',
      x: 45,
      y: 477,
      width: 144,
      height: 108,
    });
  });
});
