import { describe, expect, it } from 'vitest';
import { tiptapJsonToPreloParagraphs } from './tiptap-adapter';

describe('tiptapJsonToPreloParagraphs', () => {
  it('converts plain paragraphs into Prelo paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Primeiro paragrafo.' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Segundo paragrafo.' }],
        },
      ],
    };

    const paragraphs = tiptapJsonToPreloParagraphs(doc, 'body');

    expect(paragraphs).toEqual([
      { styleId: 'body', spans: [{ text: 'Primeiro paragrafo.' }] },
      { styleId: 'body', spans: [{ text: 'Segundo paragrafo.' }] },
    ]);
  });

  it('maps headings to heading style ids', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Capitulo 1' }],
        },
      ],
    };

    const paragraphs = tiptapJsonToPreloParagraphs(doc, 'body');

    expect(paragraphs).toEqual([
      { styleId: 'heading-1', spans: [{ text: 'Capitulo 1' }] },
    ]);
  });

  it('keeps inline marks as span metadata for later style mapping', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Texto ' },
            { type: 'text', text: 'forte', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' e ' },
            { type: 'text', text: 'italico', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };

    const paragraphs = tiptapJsonToPreloParagraphs(doc, 'body');

    expect(paragraphs).toEqual([
      {
        styleId: 'body',
        spans: [
          { text: 'Texto ' },
          { text: 'forte', marks: ['bold'] },
          { text: ' e ' },
          { text: 'italico', marks: ['italic'] },
        ],
      },
    ]);
  });
});
