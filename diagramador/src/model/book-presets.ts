import type { BookCategory, BookTypePreset, Frame, Margins, Page } from './types';
import { BOOK_TYPE_PRESETS } from './types';
import { inchesToPt } from './print-units';

export interface BuildBookPresetPageOptions {
  id: string;
  storyId: string;
  width?: number;
  height?: number;
  bleed?: number;
  side?: Page['side'];
  masterPageId?: string | null;
  frameIdPrefix?: string;
}

export interface BuiltBookPresetPage {
  preset: BookTypePreset;
  page: Page;
  frames: Frame[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GAP = 24;

export function buildBookPresetPage(
  category: BookCategory,
  options: BuildBookPresetPageOptions
): BuiltBookPresetPage {
  const preset = BOOK_TYPE_PRESETS[category];
  const width = options.width ?? inchesToPt(preset.defaultTrimWidth);
  const height = options.height ?? inchesToPt(preset.defaultTrimHeight);
  const margins = fitMargins(preset.defaultMargins, width, height);
  const content = contentRect(width, height, margins);
  const prefix = options.frameIdPrefix ?? options.id;
  const rects = frameRectsFor(category, content);
  const frameIds = rects.map((rect) => `${prefix}-${rect.name}`);
  const frames = rects.map((rect, index) =>
    createTextFrame({
      id: frameIds[index]!,
      pageId: options.id,
      storyId: options.storyId,
      rect,
      prevFrameId: frameIds[index - 1] ?? null,
      nextFrameId: frameIds[index + 1] ?? null,
    })
  );

  return {
    preset,
    page: {
      id: options.id,
      width,
      height,
      margins,
      bleed: options.bleed ?? preset.defaultBleed,
      side: options.side ?? 'single',
      masterPageId: options.masterPageId ?? null,
      frames: frames.map((frame) => frame.id),
    },
    frames,
  };
}

function fitMargins(margins: Margins, width: number, height: number): Margins {
  const maxHorizontal = Math.max(0, width / 2 - 12);
  const maxVertical = Math.max(0, height / 2 - 12);

  return {
    top: Math.min(margins.top, maxVertical),
    bottom: Math.min(margins.bottom, maxVertical),
    inside: Math.min(margins.inside, maxHorizontal),
    outside: Math.min(margins.outside, maxHorizontal),
  };
}

function contentRect(width: number, height: number, margins: Margins): Rect {
  return {
    x: margins.inside,
    y: margins.top,
    width: Math.max(1, width - margins.inside - margins.outside),
    height: Math.max(1, height - margins.top - margins.bottom),
  };
}

function frameRectsFor(category: BookCategory, content: Rect): Array<Rect & { name: string }> {
  if (category === 'fiction') {
    return [{ ...content, name: 'body' }];
  }

  if (category === 'technical') {
    const columnWidth = (content.width - GAP) / 2;
    return [
      { name: 'column-left', x: content.x, y: content.y, width: columnWidth, height: content.height },
      {
        name: 'column-right',
        x: content.x + columnWidth + GAP,
        y: content.y,
        width: columnWidth,
        height: content.height,
      },
    ];
  }

  if (category === 'planner') {
    const blockGap = 36;
    const blockHeight = (content.height - blockGap * 2) / 3;
    return [0, 1, 2].map((index) => ({
      name: `block-${index + 1}`,
      x: content.x,
      y: content.y + index * (blockHeight + blockGap),
      width: content.width,
      height: blockHeight,
    }));
  }

  if (category === 'poetry') {
    const bodyWidth = content.width * 0.72;
    const bodyHeight = content.height * 0.62;
    return [
      {
        name: 'poem',
        x: content.x + (content.width - bodyWidth) / 2,
        y: content.y,
        width: bodyWidth,
        height: bodyHeight,
      },
      {
        name: 'note',
        x: content.x,
        y: content.y + bodyHeight + GAP,
        width: content.width,
        height: content.height - bodyHeight - GAP,
      },
    ];
  }

  if (category === 'non-fiction') {
    const sideWidth = Math.max(72, content.width * 0.28);
    const mainWidth = content.width - sideWidth - GAP;
    const sideHeight = (content.height - GAP) / 2;
    return [
      { name: 'main', x: content.x, y: content.y, width: mainWidth, height: content.height },
      {
        name: 'sidebar',
        x: content.x + mainWidth + GAP,
        y: content.y,
        width: sideWidth,
        height: sideHeight,
      },
      {
        name: 'aside',
        x: content.x + mainWidth + GAP,
        y: content.y + sideHeight + GAP,
        width: sideWidth,
        height: sideHeight,
      },
    ];
  }

  if (category === 'art-photo') {
    const essayHeight = content.height * 0.42;
    const captionHeight = content.height - essayHeight - GAP * 2;
    const captionWidth = (content.width - GAP) / 2;
    return [
      { name: 'essay', x: content.x, y: content.y, width: content.width, height: essayHeight },
      {
        name: 'caption-left',
        x: content.x,
        y: content.y + essayHeight + GAP * 2,
        width: captionWidth,
        height: captionHeight,
      },
      {
        name: 'caption-right',
        x: content.x + captionWidth + GAP,
        y: content.y + essayHeight + GAP * 2,
        width: captionWidth,
        height: captionHeight,
      },
    ];
  }

  const topHeight = content.height * 0.48;
  const columnWidth = (content.width - GAP) / 2;
  return [
    { name: 'top-left', x: content.x, y: content.y, width: columnWidth, height: topHeight },
    {
      name: 'top-right',
      x: content.x + columnWidth + GAP,
      y: content.y,
      width: columnWidth,
      height: topHeight,
    },
    {
      name: 'wide',
      x: content.x,
      y: content.y + topHeight + GAP,
      width: content.width,
      height: content.height - topHeight - GAP,
    },
  ];
}

function createTextFrame(input: {
  id: string;
  pageId: string;
  storyId: string;
  rect: Rect;
  prevFrameId: string | null;
  nextFrameId: string | null;
}): Frame {
  return {
    id: input.id,
    pageId: input.pageId,
    x: input.rect.x,
    y: input.rect.y,
    width: input.rect.width,
    height: input.rect.height,
    rotation: 0,
    type: 'text',
    storyId: input.storyId,
    prevFrameId: input.prevFrameId,
    nextFrameId: input.nextFrameId,
  };
}
