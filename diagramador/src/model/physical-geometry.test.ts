import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAGRAPH_STYLE,
  PRINT_PROFILE_KDP_6x9,
} from './types';
import type { Document, Frame, Story } from './types';
import {
  frameRectOnPage,
  framesFromPhysicalGeometry,
  normalizeDocumentGeometry,
} from './physical-geometry';

const frame = (id: string): Frame => ({
  id,
  pageId: 'page-1',
  x: 72,
  y: 90,
  width: 288,
  height: 432,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  nextFrameId: null,
  prevFrameId: null,
});

const frameAt = (
  id: string,
  rect: { x: number; y: number; width: number; height: number },
  type: Frame['type'] = 'text'
): Frame => ({
  ...frame(id),
  ...rect,
  type,
});

const story: Story = {
  id: 'story-1',
  frameChainIds: ['frame-1'],
  paragraphs: [
    {
      styleId: 'body',
      spans: [{ text: 'Texto fisico.' }],
    },
  ],
};

const documentFor = (frames: Frame[]): Document => ({
  pages: [
    {
      id: 'page-1',
      width: 999,
      height: 999,
      margins: { top: 0, bottom: 0, inside: 0, outside: 0 },
      bleed: 0,
      side: 'right',
      masterPageId: null,
      frames: frames.map((item) => item.id),
    },
  ],
  frames: Object.fromEntries(frames.map((item) => [item.id, item])),
  stories: [story],
  styles: { body: DEFAULT_PARAGRAPH_STYLE },
  characterStyles: {},
  masterPages: {},
  defaultStyleId: 'body',
  facingPages: true,
  printProfile: PRINT_PROFILE_KDP_6x9,
  baselineGrid: null,
});

describe('normalizeDocumentGeometry', () => {
  it('normalizes print boxes from the active print profile in PostScript points', () => {
    const geometry = normalizeDocumentGeometry(documentFor([frame('frame-1')]));

    expect(geometry.unit).toBe('pt');
    expect(geometry.print.trim).toEqual({ width: 432, height: 648 });
    expect(geometry.pages[0]?.boxes).toEqual({
      media: { x: 0, y: 0, width: 450, height: 666 },
      bleed: { x: 0, y: 0, width: 450, height: 666 },
      trim: { x: 9, y: 9, width: 432, height: 648 },
    });
    expect(geometry.pages[0]?.minMargins).toEqual({
      top: 27,
      bottom: 27,
      inside: 27,
      outside: 27,
    });
  });

  it('exposes document frames as explicit trim-relative rectangles in points', () => {
    const geometry = normalizeDocumentGeometry(documentFor([frame('frame-1')]));

    expect(geometry.frames['frame-1']).toEqual({
      id: 'frame-1',
      pageId: 'page-1',
      type: 'text',
      storyId: 'story-1',
      rotation: 0,
      rectOnTrim: {
        x: 72,
        y: 90,
        width: 288,
        height: 432,
      },
    });
    expect(geometry.pages[0]?.frameIds).toEqual(['frame-1']);
  });
});

describe('framesFromPhysicalGeometry', () => {
  it('returns layout frames in the requested chain order using trim-relative rectangles', () => {
    const a = frameAt('frame-a', { x: 72, y: 90, width: 288, height: 432 });
    const b = frameAt('frame-b', { x: 10, y: 20, width: 100, height: 200 });
    const geometry = normalizeDocumentGeometry(documentFor([a, b]));

    const frames = framesFromPhysicalGeometry(geometry, ['frame-b', 'frame-a'], 'story-1');

    // Order follows the chain argument, not the document frame map order.
    expect(frames.map((f) => f.id)).toEqual(['frame-b', 'frame-a']);

    // Layout rectangles must come from rectOnTrim, not from any other source.
    expect(frames[0]).toMatchObject({
      id: 'frame-b',
      x: 10,
      y: 20,
      width: 100,
      height: 200,
      type: 'text',
    });
    expect(frames[1]).toMatchObject({ id: 'frame-a', x: 72, y: 90, width: 288, height: 432 });
    expect(frames[0]?.width).toBe(geometry.frames['frame-b']?.rectOnTrim.width);
    expect(frames[0]?.height).toBe(geometry.frames['frame-b']?.rectOnTrim.height);
  });

  it('throws a descriptive error when a chained frame is absent from the geometry', () => {
    const geometry = normalizeDocumentGeometry(documentFor([frame('frame-1')]));

    expect(() => framesFromPhysicalGeometry(geometry, ['ghost'], 'story-1')).toThrow(
      'Frame "ghost" not found for story "story-1"'
    );
  });

  it('throws when a chained frame is not a text frame', () => {
    const image = frameAt('img-1', { x: 0, y: 0, width: 50, height: 50 }, 'image');
    const geometry = normalizeDocumentGeometry(documentFor([image]));

    expect(() => framesFromPhysicalGeometry(geometry, ['img-1'], 'story-1')).toThrow(
      'Frame "img-1" is not a text frame'
    );
  });
});

describe('frameRectOnPage', () => {
  it('returns the frame rectangle in absolute page (media) coordinates', () => {
    const geometry = normalizeDocumentGeometry(documentFor([frame('frame-1')]));

    // KDP bleed 0.125" => trim box offset 9pt inside media; frame sits at (72,90) on trim.
    expect(frameRectOnPage(geometry, 'frame-1')).toEqual({
      x: 81,
      y: 99,
      width: 288,
      height: 432,
    });
  });

  it('throws when the frame is absent from the physical geometry', () => {
    const geometry = normalizeDocumentGeometry(documentFor([frame('frame-1')]));

    expect(() => frameRectOnPage(geometry, 'ghost')).toThrow(
      'Frame "ghost" not found in physical geometry'
    );
  });
});
