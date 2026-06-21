import { describe, expect, it } from 'vitest';
import {
  BLANK_FONT_FAMILY,
  BLANK_PAGE_HEIGHT,
  BLANK_PAGE_MARGIN,
  BLANK_STORY_ID,
  BLANK_PAGE_WIDTH,
  BLANK_PROJECT_NAME,
  createBlankBodyStyle,
  createBlankDocument,
  createBlankPageBundle,
} from './blank-document';

describe('createBlankDocument', () => {
  it('cria um documento 6x9 com uma página e um frame de texto dentro das margens', () => {
    const doc = createBlankDocument();
    expect(doc.pages).toHaveLength(1);
    const page = doc.pages[0]!;
    expect([page.width, page.height]).toEqual([BLANK_PAGE_WIDTH, BLANK_PAGE_HEIGHT]);

    expect(Object.keys(doc.frames)).toHaveLength(1);
    const frame = doc.frames[page.frames[0]!]!;
    expect(frame.type).toBe('text');
    expect(frame.x).toBe(BLANK_PAGE_MARGIN);
    expect(frame.y).toBe(BLANK_PAGE_MARGIN);
    expect(frame.width).toBe(BLANK_PAGE_WIDTH - BLANK_PAGE_MARGIN * 2);
    expect(frame.height).toBe(BLANK_PAGE_HEIGHT - BLANK_PAGE_MARGIN * 2);
  });

  it('começa com uma story vazia ligada ao frame e estilo de corpo com fonte embutível', () => {
    const doc = createBlankDocument();
    expect(doc.stories).toHaveLength(1);
    expect(doc.stories[0]!.id).toBe(BLANK_STORY_ID);
    expect(doc.stories[0]!.frameChainIds).toEqual([doc.pages[0]!.frames[0]]);
    expect(doc.stories[0]!.paragraphs).toEqual([{ styleId: 'body', spans: [{ text: '' }] }]);
    expect(doc.defaultStyleId).toBe('body');
    expect(doc.styles.body!.characterStyle.fontFamily).toBe(BLANK_FONT_FAMILY);
  });
});

describe('createBlankPageBundle', () => {
  it('gera IDs estáveis e liga a página à story principal', () => {
    const { page, frame, story } = createBlankPageBundle(3, BLANK_STORY_ID, 'frame-page-2');
    expect(page.id).toBe('page-3');
    expect(page.frames).toEqual(['frame-page-3']);
    expect(frame.id).toBe('frame-page-3');
    expect(frame.pageId).toBe('page-3');
    expect(frame.storyId).toBe(BLANK_STORY_ID);
    expect(frame.prevFrameId).toBe('frame-page-2');
    expect(story.id).toBe(BLANK_STORY_ID);
    expect(story.frameChainIds).toEqual(['frame-page-3']);
  });
});

describe('createBlankBodyStyle', () => {
  it('usa justificação como padrão editorial do corpo do livro', () => {
    expect(createBlankBodyStyle().alignment).toBe('justify');
  });
});

describe('constantes', () => {
  it('expõe o nome de projeto em branco', () => {
    expect(BLANK_PROJECT_NAME).toBe('Livro sem título');
  });
});
