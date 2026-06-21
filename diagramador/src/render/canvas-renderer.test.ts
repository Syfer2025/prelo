import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_STYLE } from '../model/types';
import type { Frame, ImageFrame } from '../model/types';
import type { LayoutResult } from '../engine/types';
import { renderToCanvas } from './canvas-renderer';

const imageFrame = (): ImageFrame => ({
  id: 'img-1',
  pageId: 'page-1',
  x: 10,
  y: 20,
  width: 80,
  height: 60,
  rotation: 0,
  type: 'image',
  storyId: null,
  prevFrameId: null,
  nextFrameId: null,
  imageUrl: '/images/demo.png',
  originalWidth: 800,
  originalHeight: 600,
  cropX: 0,
  cropY: 0,
  cropWidth: 800,
  cropHeight: 600,
  fitMode: 'fill',
  textWrap: { mode: 'bounding-box', offset: 8, sides: 'largest', alphaThreshold: 0.5 },
});

const textFrame = (): Frame => ({
  id: 'text-1',
  pageId: 'page-1',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  prevFrameId: null,
  nextFrameId: null,
});

describe('renderToCanvas', () => {
  it('draws loaded image elements for image frames', () => {
    const drawImageCalls: unknown[][] = [];
    const ctx = {
      clearRect: () => undefined,
      strokeRect: () => undefined,
      fillRect: () => undefined,
      fillText: () => undefined,
      setLineDash: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      drawImage: (...args: unknown[]) => drawImageCalls.push(args),
      set fillStyle(_value: string) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set font(_value: string) {},
      set textBaseline(_value: CanvasTextBaseline) {},
      set textAlign(_value: CanvasTextAlign) {},
    } as unknown as CanvasRenderingContext2D;
    const imageElement = { complete: true } as unknown as CanvasImageSource;
    const layout: LayoutResult = {
      frameLayouts: [
        {
          frameId: 'text-1',
          lines: [
            {
              text: 'alpha',
              x: 0,
              y: 0,
              width: 10,
              height: 15,
              style: DEFAULT_CHARACTER_STYLE,
              runs: [],
            },
          ],
        },
      ],
      overflow: false,
      overflowText: '',
    };

    renderToCanvas(ctx, 200, 200, [imageFrame(), textFrame()], layout, {
      imageElementsByUrl: { '/images/demo.png': imageElement },
    });

    expect(drawImageCalls[0]).toEqual([imageElement, 10, 20, 80, 60]);
  });

  it('does not draw placeholder guides over loaded image frames', () => {
    const strokeRectCalls: unknown[][] = [];
    const diagonalSegments: unknown[][] = [];
    const labels: unknown[][] = [];
    const ctx = {
      clearRect: () => undefined,
      strokeRect: (...args: unknown[]) => strokeRectCalls.push(args),
      fillRect: () => undefined,
      fillText: (...args: unknown[]) => labels.push(args),
      setLineDash: () => undefined,
      beginPath: () => undefined,
      moveTo: (...args: unknown[]) => diagonalSegments.push(args),
      lineTo: (...args: unknown[]) => diagonalSegments.push(args),
      stroke: () => undefined,
      drawImage: () => undefined,
      set fillStyle(_value: string) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set font(_value: string) {},
      set textBaseline(_value: CanvasTextBaseline) {},
      set textAlign(_value: CanvasTextAlign) {},
    } as unknown as CanvasRenderingContext2D;
    const imageElement = { complete: true } as unknown as CanvasImageSource;
    const layout: LayoutResult = {
      frameLayouts: [],
      overflow: false,
      overflowText: '',
    };

    renderToCanvas(ctx, 200, 200, [imageFrame(), textFrame()], layout, {
      imageElementsByUrl: { '/images/demo.png': imageElement },
    });

    expect(strokeRectCalls).not.toContainEqual([10, 20, 80, 60]);
    expect(diagonalSegments).not.toContainEqual([10, 20]);
    expect(labels).not.toContainEqual(['Imagem 1', 10, 15]);
  });
});
