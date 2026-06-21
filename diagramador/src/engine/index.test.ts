import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_STYLE,
  DEFAULT_PARAGRAPH_STYLE,
  PRINT_PROFILE_KDP_6x9,
} from '../model/types';
import type { Document, Frame, ImageFrame, Paragraph, Story } from '../model/types';
import { PDFDocument } from 'pdf-lib';
import { TextEngine } from './index';
import type { LayoutResult } from './index';
import type { MeasureFn } from './shaper';
import type { AlphaMask } from '../model/text-wrap';

const measureFn: MeasureFn = (text) => text.length * 5;

const onePixelPng = () =>
  Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lv6l8wAAAABJRU5ErkJggg==',
      'base64'
    )
  );

const textFrame = (id: string, width: number, height: number): Frame => ({
  id,
  pageId: 'page-1',
  x: 0,
  y: 0,
  width,
  height,
  rotation: 0,
  type: 'text',
  storyId: 'story-1',
  nextFrameId: null,
  prevFrameId: null,
});

const imageFrame = (overrides: Partial<ImageFrame> = {}): ImageFrame => ({
  id: 'image-1',
  pageId: 'page-1',
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  rotation: 0,
  type: 'image',
  storyId: null,
  nextFrameId: null,
  prevFrameId: null,
  imageUrl: 'image.png',
  originalWidth: 1200,
  originalHeight: 1200,
  cropX: 0,
  cropY: 0,
  cropWidth: 1200,
  cropHeight: 1200,
  fitMode: 'fill',
  textWrap: { mode: 'bounding-box', offset: 0, sides: 'largest', alphaThreshold: 0.5 },
  ...overrides,
});

const paragraph = (text: string, styleId = 'body'): Paragraph => ({
  styleId,
  spans: [{ text }],
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
      frames: frames.map((frame) => frame.id),
    },
  ],
  frames: Object.fromEntries(frames.map((frame) => [frame.id, frame])),
  stories: [story],
  styles: {
    body: {
      ...DEFAULT_PARAGRAPH_STYLE,
      name: 'Body',
      characterStyle: {
        ...DEFAULT_CHARACTER_STYLE,
        fontFamily: 'Test',
        fontSize: 10,
      },
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
  new TextEngine({} as CanvasRenderingContext2D, {
    fontSize: 10,
    fontFamily: 'Test',
    lineHeight: 1.5,
  });

describe('TextEngine.flowStory', () => {
  it('flows a story through the frame chain declared by the story', () => {
    const frameA = textFrame('frame-a', 50, 15);
    const frameB = textFrame('frame-b', 130, 45);
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a', 'frame-b'],
      paragraphs: [paragraph('alpha beta gamma delta epsilon zeta')],
    };
    const document = documentFor(story, [frameB, frameA]);

    const result = engine().flowStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    expect(result.overflow).toBe(false);
    expect(result.frameLayouts.map((layout) => layout.frameId)).toEqual(['frame-a', 'frame-b']);
    expect(result.frameLayouts[0]?.lines.map((line) => line.text)).toEqual(['alpha beta']);
    expect(result.frameLayouts[1]?.lines.map((line) => line.text)).toEqual([
      'gamma delta epsilon zeta',
    ]);
  });

  it('keeps text layout identical regardless of bleed (frames are trim-relative)', () => {
    const frameA = textFrame('frame-a', 50, 15);
    const frameB = textFrame('frame-b', 130, 45);
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a', 'frame-b'],
      paragraphs: [paragraph('alpha beta gamma delta epsilon zeta')],
    };
    const base = documentFor(story, [frameB, frameA]);
    const withBleed: Document = {
      ...base,
      printProfile: { ...PRINT_PROFILE_KDP_6x9, bleed: 0.125 },
    };
    const noBleed: Document = {
      ...base,
      printProfile: { ...PRINT_PROFILE_KDP_6x9, bleed: 0 },
    };

    const layoutWithBleed = engine().flowStory(withBleed, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });
    const layoutNoBleed = engine().flowStory(noBleed, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    // Bleed shifts the absolute page origin, but must NOT move trim-relative text.
    const trimRelative = (result: LayoutResult) =>
      result.frameLayouts.map((fl) => ({ frameId: fl.frameId, lines: fl.lines }));
    expect(trimRelative(layoutWithBleed)).toEqual(trimRelative(layoutNoBleed));

    // The physical page origin DOES include the bleed offset (9pt for 0.125").
    expect(layoutNoBleed.frameLayouts[0]?.rectOnPage?.x).toBe(0);
    expect(layoutWithBleed.frameLayouts[0]?.rectOnPage?.x).toBe(9);
  });

  it('applies the paragraph style line height to the laid-out lines', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha')],
    };
    const baseDoc = documentFor(story, [textFrame('frame-a', 200, 200)]);
    const tallDoc: Document = {
      ...baseDoc,
      styles: { body: { ...baseDoc.styles.body!, lineHeight: 2 } },
    };

    const defaultLeading = engine().flowStory(baseDoc, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });
    const wideLeading = engine().flowStory(tallDoc, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    expect(defaultLeading.frameLayouts[0]?.lines[0]?.height).toBe(15); // fontSize 10 * 1.5
    expect(wideLeading.frameLayouts[0]?.lines[0]?.height).toBe(20); // fontSize 10 * 2
  });

  it('applies the document baseline grid from the top margin', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('aaa bbb ccc')],
    };
    const text = { ...textFrame('frame-a', 20, 100), y: 36 };
    const baseDoc = documentFor(story, [text]);
    const gridded: Document = {
      ...baseDoc,
      baselineGrid: { startOffset: 8, increment: 18, color: '#00f', visible: true },
    };

    const result = engine().flowStory(gridded, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    expect(result.frameLayouts[0]?.lines.map((line) => line.y)).toEqual([0, 18, 36]);
  });

  it('attaches each frame physical page rectangle (trim offset + rectOnTrim)', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a', 'frame-b'],
      paragraphs: [paragraph('alpha beta gamma delta epsilon zeta')],
    };
    const document = documentFor(story, [textFrame('frame-b', 130, 45), textFrame('frame-a', 50, 15)]);

    const result = engine().flowStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    // KDP bleed 0.125" => trim offset 9pt; textFrame sits at (0,0) on the trim.
    expect(result.frameLayouts[0]?.rectOnPage).toEqual({ x: 9, y: 9, width: 50, height: 15 });
    expect(result.frameLayouts[1]?.rectOnPage).toEqual({ x: 9, y: 9, width: 130, height: 45 });
  });

  it('applies paragraph alignment from the document style', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha')],
    };
    const baseDoc = documentFor(story, [textFrame('frame-a', 200, 200)]);
    const centered: Document = {
      ...baseDoc,
      styles: { body: { ...baseDoc.styles.body!, alignment: 'center' } },
    };

    const result = engine().flowStory(centered, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    const line = result.frameLayouts[0]?.lines[0];
    expect(line?.width).toBe(25); // 'alpha' = 5 chars * 5
    expect(line?.x).toBe((200 - 25) / 2); // 87.5
  });

  it('applies paragraph space-after from the document style', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha'), paragraph('beta')],
    };
    const baseDoc = documentFor(story, [textFrame('frame-a', 200, 400)]);
    const spaced: Document = {
      ...baseDoc,
      styles: { body: { ...baseDoc.styles.body!, spaceAfter: 10 } },
    };

    const result = engine().flowStory(spaced, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines.map((line) => line.text)).toEqual(['alpha', 'beta']);
    // alpha y0 (altura 15) + space-after 10 => beta y = 25
    expect(lines[1]?.y).toBe(25);
  });

  it('applies first-line indent from the document style', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha beta gamma delta')],
    };
    const baseDoc = documentFor(story, [textFrame('frame-a', 60, 400)]);
    const indented: Document = {
      ...baseDoc,
      styles: { body: { ...baseDoc.styles.body!, indent: 30 } },
    };

    const result = engine().flowStory(indented, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines[0]?.x).toBe(30); // primeira linha recuada
    expect(lines[1]?.x).toBe(0); // demais sem recuo
  });

  it('justifies lines via the document style except the last line', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('aa bb cc dd ee ff')],
    };
    const baseDoc = documentFor(story, [textFrame('frame-a', 30, 400)]);
    const justified: Document = {
      ...baseDoc,
      styles: { body: { ...baseDoc.styles.body!, alignment: 'justify' } },
    };

    const result = engine().flowStory(justified, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    expect(lines.length).toBe(3);
    const lineEnd = (i: number) => {
      const runs = lines[i]!.runs;
      const last = runs[runs.length - 1]!;
      return last.x + last.width;
    };
    expect(lineEnd(0)).toBe(30); // justificada
    expect(lineEnd(1)).toBe(30); // justificada
    expect(lineEnd(2)).toBe(25); // última linha natural (aa=10, sp=5, bb=10)
  });

  it('applies image text-wrap obstacles from the document when flowing a story', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('aaaa bbbb cccc dddd')],
    };
    const document = documentFor(story, [
      textFrame('frame-a', 100, 100),
      imageFrame({ x: 0, y: 0, width: 40, height: 40 }),
    ]);

    const result = engine().flowStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    const line = result.frameLayouts[0]?.lines[0];
    expect(line?.text).toBe('aaaa bbbb');
    expect(line?.x).toBe(40);
  });

  it('flows story text on BOTH sides of a centered image (sides=both)', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('aa bb cc dd ee ff gg hh ii jj kk')],
    };
    const document = documentFor(story, [
      textFrame('frame-a', 200, 100),
      imageFrame({
        id: 'img-center',
        x: 80,
        y: 0,
        width: 40,
        height: 30,
        textWrap: { mode: 'bounding-box', offset: 0, sides: 'both', alphaThreshold: 0.5 },
      }),
    ]);

    const result = engine().flowStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
    });

    const lines = result.frameLayouts[0]?.lines ?? [];
    // A primeira faixa (y=0) recebe dois fragmentos: à esquerda (x=0) e à direita (x=120) da imagem centrada.
    expect(lines[0]?.y).toBe(0);
    expect(lines[1]?.y).toBe(0);
    expect(lines[0]?.x).toBe(0);
    expect(lines[1]?.x).toBe(120);
  });

  it('applies alpha-channel image masks from flow options when flowing a story', () => {
    const alpha = new Uint8Array(100);
    for (let y = 0; y < 10; y++) {
      alpha[y * 10 + 4] = 255;
      alpha[y * 10 + 5] = 255;
    }
    const mask: AlphaMask = { width: 10, height: 10, alpha, threshold: 128 };
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha')],
    };
    const image = imageFrame({
      id: 'img-alpha',
      x: 50,
      y: 0,
      width: 100,
      height: 100,
      textWrap: { mode: 'alpha-channel', offset: 0, sides: 'largest', alphaThreshold: 0.5 },
    });
    const document = documentFor(story, [textFrame('frame-a', 200, 100), image]);

    const result = engine().flowStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
      wrapMasksByFrameId: { 'img-alpha': mask },
    });

    expect(result.frameLayouts[0]?.lines[0]?.x).toBe(110);
  });

  it('exports the whole document to a loadable RGB PDF', async () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha beta gamma')],
    };
    const document = documentFor(story, [textFrame('frame-a', 200, 200)]);

    const bytes = await engine().documentToPdf(document, { algorithm: 'greedy', measureFn });

    expect(bytes.length).toBeGreaterThan(0);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    const media = loaded.getPage(0).getMediaBox();
    expect([media.x, media.y, media.width, media.height]).toEqual([0, 0, 450, 666]);
  });

  it('exports image frames to PDF when image bytes are supplied', async () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha beta gamma')],
    };
    const image = imageFrame({ id: 'img-1', x: 36, y: 72, width: 72, height: 72 });
    const document = documentFor(story, [textFrame('frame-a', 200, 200), image]);

    const bytes = await engine().documentToPdf(document, {
      algorithm: 'greedy',
      measureFn,
      imageBytesByFrameId: { 'img-1': onePixelPng() },
    });

    expect(Buffer.from(bytes).toString('latin1')).toContain('/Subtype /Image');
  });

  it('auto-paginates a story by cloning the template page until the text fits', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [
        paragraph(
          'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'
        ),
      ],
    };
    const document = documentFor(story, [textFrame('frame-a', 55, 15)]);

    const pagination = engine().paginateStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
      maxAutoPages: 20,
    });

    const paginatedStory = pagination.document.stories[0]!;
    expect(document.pages).toHaveLength(1);
    expect(pagination.addedPages).toBeGreaterThan(0);
    expect(pagination.document.pages.length).toBeGreaterThan(1);
    expect(pagination.layout.overflow).toBe(false);
    expect(paginatedStory.frameChainIds).toHaveLength(pagination.document.pages.length);

    const chain = paginatedStory.frameChainIds.map((frameId) => pagination.document.frames[frameId]!);
    expect(chain[0]?.prevFrameId).toBeNull();
    expect(chain.at(-1)?.nextFrameId).toBeNull();
    for (let i = 0; i < chain.length - 1; i++) {
      expect(chain[i]?.nextFrameId).toBe(chain[i + 1]?.id);
      expect(chain[i + 1]?.prevFrameId).toBe(chain[i]?.id);
    }
  });

  it('keeps overflow when automatic pagination reaches the configured page limit', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [
        paragraph(
          'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'
        ),
      ],
    };
    const document = documentFor(story, [textFrame('frame-a', 55, 15)]);

    const pagination = engine().paginateStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
      maxAutoPages: 1,
    });

    expect(pagination.addedPages).toBe(1);
    expect(pagination.document.pages).toHaveLength(2);
    expect(pagination.layout.overflow).toBe(true);
  });

  it('paginates a long story in far fewer iterations than pages (bulk growth, no blank tail)', () => {
    // frame 55×30 com fonte 10 ⇒ ~1 palavra/linha, ~2 linhas/página. ~60 palavras ⇒ ~30 páginas
    // (bem abaixo do teto de 400, para o texto caber sem overflow residual).
    const longParagraph = Array.from({ length: 6 }, (_, i) => `palavra${i}`).join(' ');
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: Array.from({ length: 10 }, () => paragraph(longParagraph)),
    };
    const document = documentFor(story, [textFrame('frame-a', 55, 30)]);

    const pagination = engine().paginateStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
      maxAutoPages: 400,
    });

    expect(pagination.layout.overflow).toBe(false);
    expect(pagination.document.pages.length).toBeGreaterThan(8); // muitas páginas
    // Crescimento em lote: converge em MUITO menos rodadas do que páginas (antes era ~1 por página).
    expect(pagination.iterations).toBeLessThan(pagination.document.pages.length);
    // Sem página em branco no fim: a última página da story recebe ao menos 1 linha.
    const lastFrameId = pagination.document.stories[0]!.frameChainIds.at(-1)!;
    const lastLayout = pagination.layout.frameLayouts.find((fl) => fl.frameId === lastFrameId);
    expect(lastLayout?.lines.length ?? 0).toBeGreaterThan(0);
  });

  it('exports the auto-paginated document with every generated page', async () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [
        paragraph(
          'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'
        ),
      ],
    };
    const document = documentFor(story, [textFrame('frame-a', 55, 15)]);
    const pagination = engine().paginateStory(document, 'story-1', {
      algorithm: 'greedy',
      measureFn,
      maxAutoPages: 20,
    });

    const bytes = await engine().documentToPdf(pagination.document, {
      algorithm: 'greedy',
      measureFn,
    });

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(pagination.document.pages.length);
  });

  it('throws a descriptive error when the requested story does not exist', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha')],
    };
    const document = documentFor(story, [textFrame('frame-a', 50, 15)]);

    expect(() =>
      engine().flowStory(document, 'missing-story', {
        algorithm: 'greedy',
        measureFn,
      })
    ).toThrow('Story "missing-story" not found');
  });

  it('throws a descriptive error when the story references a missing frame', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['missing-frame'],
      paragraphs: [paragraph('alpha')],
    };
    const document = documentFor(story, []);

    expect(() =>
      engine().flowStory(document, 'story-1', {
        algorithm: 'greedy',
        measureFn,
      })
    ).toThrow('Frame "missing-frame" not found for story "story-1"');
  });

  it('throws a descriptive error when a paragraph style is missing', () => {
    const story: Story = {
      id: 'story-1',
      frameChainIds: ['frame-a'],
      paragraphs: [paragraph('alpha', 'missing-style')],
    };
    const document = documentFor(story, [textFrame('frame-a', 50, 15)]);

    expect(() =>
      engine().flowStory(document, 'story-1', {
        algorithm: 'greedy',
        measureFn,
      })
    ).toThrow('Paragraph style "missing-style" not found');
  });
});
