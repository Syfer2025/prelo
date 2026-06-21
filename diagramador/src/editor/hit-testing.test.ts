import { describe, expect, it } from 'vitest';
import { frameAtPoint } from './hit-testing';
import type { Frame } from '../model/types';

const frame = (id: string, x: number, y: number, width: number, height: number): Frame => ({
  id,
  pageId: 'page-1',
  x,
  y,
  width,
  height,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  prevFrameId: null,
  nextFrameId: null,
});

describe('frameAtPoint', () => {
  it('returns the topmost frame that contains the point', () => {
    const bottom = frame('bottom', 0, 0, 100, 100);
    const top = frame('top', 20, 20, 100, 100);

    expect(frameAtPoint([bottom, top], 30, 30)?.id).toBe('top');
  });

  it('returns null when the point is outside every frame', () => {
    expect(frameAtPoint([frame('a', 0, 0, 100, 100)], 140, 20)).toBeNull();
  });
});
