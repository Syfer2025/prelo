import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import type { ParagraphStyle } from '../../model/types';
import { tiptapJsonToPreloParagraphs } from '../tiptap-adapter';

interface TiptapFrameEditorProps {
  /** Trecho de texto da página (modelo do manuscrito: parágrafos separados por '\n'). */
  chunkText: string;
  style: ParagraphStyle;
  /** Chamado ao desfocar: já convertido (Tiptap JSON -> Story.paragraphs -> texto do trecho). */
  onCommitText: (text: string) => void;
}

/**
 * SPIKE: editor Tiptap que vive DENTRO do frame da página Prelo (no lugar do contenteditable cru).
 * Não tem largura própria — preenche o frame/margens da página. Ao desfocar, converte o JSON do
 * Tiptap para o trecho de texto do Prelo (via `tiptap-adapter`), que o motor então repagina.
 */
export default function TiptapFrameEditor({
  chunkText,
  style,
  onCommitText,
}: TiptapFrameEditorProps) {
  const cs = style.characterStyle;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: chunkToHtml(chunkText),
    autofocus: 'end',
    editorProps: { attributes: { class: 'tiptap-frame-editor' } },
  });

  function handleBlur() {
    if (editor) onCommitText(jsonToChunkText(editor.getJSON()));
  }

  return (
    <div
      className="tiptap-frame-wrap"
      onBlur={handleBlur}
      style={{
        fontFamily: `"${cs.fontFamily}", Georgia, serif`,
        fontSize: cs.fontSize,
        lineHeight: String(style.lineHeight),
        color: cs.color,
        textAlign: style.alignment,
        textIndent: style.indent,
        letterSpacing: cs.letterSpacing,
        ['--space-after' as string]: `${style.spaceAfter}px`,
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Semeia o Tiptap a partir do trecho da página (cada linha '\n' = um parágrafo). */
function chunkToHtml(text: string): string {
  const paragraphs = text.length === 0 ? [''] : text.split('\n');
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

/** Converte o JSON do Tiptap no trecho de texto do Prelo (parágrafos separados por '\n'). */
function jsonToChunkText(json: unknown): string {
  const paragraphs = tiptapJsonToPreloParagraphs(
    json as Parameters<typeof tiptapJsonToPreloParagraphs>[0],
    'body'
  );
  return paragraphs.map((p) => p.spans.map((s) => s.text).join('')).join('\n');
}
