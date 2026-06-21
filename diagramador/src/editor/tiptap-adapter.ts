/**
 * tiptap-adapter — converte o JSON do Tiptap (ProseMirror) em parágrafos do Prelo.
 *
 * SPIKE: esta é a ÚNICA ponte entre a camada de escrita (Tiptap) e o motor estável.
 * Regra de arquitetura: o Tiptap só descreve TEXTO e formatação inline/parágrafo. Páginas,
 * frames, imagens, text-wrap, sangria, preflight e PDF continuam 100% do Prelo. Imagens NÃO
 * são convertidas aqui — permanecem `ImageFrame` do Prelo.
 */
type TiptapMark = { type: string };

type TiptapTextNode = {
  type: string;
  text: string;
  marks?: TiptapMark[];
};

type TiptapBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapTextNode[];
};

export type TiptapDoc = {
  type: string;
  content?: TiptapBlockNode[];
};

export interface PreloSpanDraft {
  text: string;
  marks?: string[];
}

export interface PreloParagraphDraft {
  styleId: string;
  spans: PreloSpanDraft[];
}

export function tiptapJsonToPreloParagraphs(
  doc: TiptapDoc,
  defaultStyleId: string
): PreloParagraphDraft[] {
  const blocks = doc.content ?? [];

  return blocks
    .map((block): PreloParagraphDraft | null => {
      const spans = (block.content ?? [])
        .filter((node) => node.type === 'text' && node.text.length > 0)
        .map((node) => {
          const marks = node.marks?.map((mark) => mark.type) ?? [];
          return marks.length > 0 ? { text: node.text, marks } : { text: node.text };
        });

      if (spans.length === 0) return null;

      return {
        styleId: styleIdForBlock(block, defaultStyleId),
        spans,
      };
    })
    .filter((paragraph): paragraph is PreloParagraphDraft => paragraph !== null);
}

function styleIdForBlock(block: TiptapBlockNode, defaultStyleId: string): string {
  if (block.type === 'heading') {
    const level = typeof block.attrs?.level === 'number' ? block.attrs.level : 1;
    return `heading-${level}`;
  }
  return defaultStyleId;
}
