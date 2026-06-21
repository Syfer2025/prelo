import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';

interface TiptapWritingSurfaceProps {
  initialText: string;
  onChangeJson: (json: unknown) => void;
}

/**
 * SPIKE: superfície de ESCRITA baseada em Tiptap/ProseMirror. Só descreve texto + formatação
 * inline/parágrafo. NÃO controla páginas, frames, imagens, text-wrap, sangria, preflight ou PDF —
 * isso continua sendo do motor Prelo. O JSON do Tiptap é convertido para `Story.paragraphs` via
 * `tiptap-adapter` e o preview/PDF continuam vindo do Prelo.
 */
export default function TiptapWritingSurface({
  initialText,
  onChangeJson,
}: TiptapWritingSurfaceProps) {
  const editor = useEditor({
    extensions: [
      // StarterKit v3 já inclui Underline; desabilitamos para usar a extensão explícita
      // sem registrar o nome 'underline' duas vezes.
      StarterKit.configure({ underline: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: initialText
      .split(/\n\n+/)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join(''),
    editorProps: {
      attributes: {
        class: 'tiptap-writing-surface',
      },
    },
    onUpdate: ({ editor }) => {
      onChangeJson(editor.getJSON());
    },
  });

  return <EditorContent editor={editor} />;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
