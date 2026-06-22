import { useState } from 'react';
import type { FrameLayout } from '../../engine';
import type { Frame, Page, ParagraphStyle } from '../../model/types';
import TiptapFrameEditor from './TiptapFrameEditor';

interface EditablePageProps {
  page: Page;
  frame: Frame;
  frameLayout?: FrameLayout;
  text: string;
  style: ParagraphStyle;
  onInput: (text: string) => void;
  onCommit: () => void;
}

/**
 * Página física do Prelo com escrita DIRETA no próprio frame — uma área só.
 * Dois modos no MESMO frame/margens:
 *  - proof  (padrão): a `engine-line-layer` do Prelo (= exatamente o que vai para o PDF);
 *  - editing (ao focar): o Tiptap dentro do frame, sem largura própria.
 * Ao desfocar, o Tiptap converte JSON -> texto e o Prelo repagina (a prova volta a aparecer).
 */
export default function EditablePage({
  page,
  frame,
  frameLayout,
  text,
  style,
  onInput,
  onCommit,
}: EditablePageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const cs = style.characterStyle;
  const isEmpty = text.trim().length === 0;

  return (
    <div className="editor-page" style={{ width: page.width, height: page.height }}>
      <div
        className={`editor-page-frame${isEditing ? ' is-editing' : ''}`}
        style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      >
        {isEditing ? (
          // EDITING: Tiptap ocupa o frame; ao desfocar converte e repagina pelo Prelo.
          <TiptapFrameEditor
            chunkText={text}
            style={style}
            onCommitText={(committed) => {
              onInput(committed);
              onCommit();
              setIsEditing(false);
            }}
          />
        ) : (
          <>
            {/* PROOF: a composição do motor — o que sai no PDF. */}
            {frameLayout ? (
              <div className="engine-line-layer" aria-hidden="true">
                {frameLayout.lines.map((line, lineIndex) => {
                  const lineStyle = line.style;
                  return (
                    <div
                      key={`${line.y}:${lineIndex}:${line.text}`}
                      className="engine-line"
                      style={{
                        left: line.x,
                        top: line.y,
                        height: line.height,
                        fontFamily: `"${lineStyle.fontFamily}", Georgia, serif`,
                        fontSize: lineStyle.fontSize,
                        lineHeight: `${line.height}px`,
                        fontWeight: lineStyle.fontWeight,
                        fontStyle: lineStyle.fontStyle,
                        letterSpacing: lineStyle.letterSpacing,
                        color: lineStyle.color,
                      }}
                    >
                      {line.runs && line.runs.length > 0
                        ? line.runs.map((run, runIndex) => (
                            <span
                              key={`${runIndex}:${run.x}`}
                              className="engine-run"
                              style={{ left: run.x }}
                            >
                              {run.text}
                            </span>
                          ))
                        : line.text}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {/* Camada de foco: clicar/focar no frame ativa a edição Tiptap, no mesmo lugar. */}
            <div
              className="editable-enter"
              role="textbox"
              tabIndex={0}
              aria-label="Escrever nesta página"
              data-placeholder={isEmpty ? 'Comece a escrever…' : undefined}
              onMouseDown={(e) => {
                // stopPropagation: não deixar o page-scaler (seleção de página) remontar e
                // perder o foco recém-criado do editor.
                e.stopPropagation();
                setIsEditing(true);
              }}
              onFocus={() => setIsEditing(true)}
              style={
                isEmpty
                  ? {
                      fontFamily: `"${cs.fontFamily}", Georgia, serif`,
                      fontSize: cs.fontSize,
                      lineHeight: String(style.lineHeight),
                      color: cs.color,
                      textAlign: style.alignment,
                    }
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
