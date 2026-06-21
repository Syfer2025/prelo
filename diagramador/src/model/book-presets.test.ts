import { describe, expect, it } from 'vitest';
import { BOOK_TYPE_PRESETS } from './types';
import type { BookCategory, Frame } from './types';
import { buildBookPresetPage } from './book-presets';

const categories = Object.keys(BOOK_TYPE_PRESETS) as BookCategory[];

describe('book preset page builder', () => {
  it('builds every book category as physical page frames inside the trim', () => {
    for (const category of categories) {
      const { page, frames, preset } = buildBookPresetPage(category, {
        id: `page-${category}`,
        storyId: 'story-1',
        width: 432,
        height: 648,
      });

      expect(preset.category).toBe(category);
      expect(page.width).toBe(432);
      expect(page.height).toBe(648);
      expect(page.frames).toEqual(frames.map((frame) => frame.id));
      expect(frames.length).toBeGreaterThan(0);

      for (const frame of frames) {
        expect(frame.type).toBe('text');
        expect(frame.storyId).toBe('story-1');
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(page.width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(page.height);
      }
    }
  });

  it('uses a single body frame for fiction with the preset margins', () => {
    const { page, frames } = buildBookPresetPage('fiction', {
      id: 'fiction-page',
      storyId: 'story-1',
      width: 432,
      height: 648,
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      x: BOOK_TYPE_PRESETS.fiction.defaultMargins.inside,
      y: BOOK_TYPE_PRESETS.fiction.defaultMargins.top,
      width:
        page.width -
        BOOK_TYPE_PRESETS.fiction.defaultMargins.inside -
        BOOK_TYPE_PRESETS.fiction.defaultMargins.outside,
      height:
        page.height -
        BOOK_TYPE_PRESETS.fiction.defaultMargins.top -
        BOOK_TYPE_PRESETS.fiction.defaultMargins.bottom,
    });
  });

  it('builds technical books as two non-overlapping text columns', () => {
    const { frames } = buildBookPresetPage('technical', {
      id: 'technical-page',
      storyId: 'story-1',
      width: 432,
      height: 648,
    });

    expect(frames).toHaveLength(2);
    expect(framesOverlap(frames[0]!, frames[1]!)).toBe(false);
    expect(frames[0]?.width).toBe(frames[1]?.width);
    expect(frames[0]?.y).toBe(frames[1]?.y);
    expect(frames[0]?.height).toBe(frames[1]?.height);
  });

  it('chains generated frames in reading order within the page', () => {
    const { frames } = buildBookPresetPage('non-fiction', {
      id: 'non-fiction-page',
      storyId: 'story-1',
      width: 432,
      height: 648,
    });

    expect(frames[0]?.prevFrameId).toBeNull();
    expect(frames[0]?.nextFrameId).toBe(frames[1]?.id);
    expect(frames[1]?.prevFrameId).toBe(frames[0]?.id);
    expect(frames[1]?.nextFrameId).toBe(frames[2]?.id);
    expect(frames[2]?.prevFrameId).toBe(frames[1]?.id);
    expect(frames[2]?.nextFrameId).toBeNull();
  });

  it('builds planner books as repeated writing blocks', () => {
    const { frames } = buildBookPresetPage('planner', {
      id: 'planner-page',
      storyId: 'story-1',
      width: 432,
      height: 648,
    });

    expect(frames).toHaveLength(3);
    expect(frames[0]?.y).toBeLessThan(frames[1]!.y);
    expect(frames[1]?.y).toBeLessThan(frames[2]!.y);
  });
});

function framesOverlap(a: Frame, b: Frame): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
