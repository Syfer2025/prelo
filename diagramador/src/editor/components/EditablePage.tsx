import { useEffect, useRef, useState } from 'react';
import type { FrameLayout } from '../../engine';
import type { Frame, Page, ParagraphStyle } from '../../model/types';

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
 * Página branca com um frame de texto editável diretamente (contenteditable).
 * IMPORTANTE: usa layout NATIVO do navegador para a digitação — não é o motor.
 * O conteúdo é sincronizado quando o trecho daquela página muda no estado puro
 * (ex.: colagem longa redistribuída entre páginas, undo/redo ou load).
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
  const ref = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    const el = ref.current;
    if (el && el.textContent !== text) el.textContent = text;
  }, [isEditing, text]);

  const cs = style.characterStyle;

  return (
    <div className="editor-page" style={{ width: page.width, height: page.height }}>
      <div
        className={`editor-page-frame${isEditing ? ' is-editing' : ''}`}
        style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      >
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
                        // Renderiza RUNS posicionados (mesma fonte da verdade do PDF):
                        // em linhas justificadas os espaços vêm esticados via run.x, então a
                        // margem direita fica regular — igual ao que o motor escreve no PDF.
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
        <div
          ref={ref}
          className={`editable-frame${frameLayout ? ' has-engine-layout' : ''}${isEditing ? ' is-editing' : ''}`}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-multiline="true"
          aria-label="Texto da página"
          onFocus={() => setIsEditing(true)}
          onInput={(e) => {
            setIsEditing(true);
            onInput(e.currentTarget.innerText);
          }}
          onBlur={() => {
            setIsEditing(false);
            onCommit();
          }}
          data-placeholder="Comece a escrever…"
          style={{
            fontFamily: `"${cs.fontFamily}", Georgia, serif`,
            fontSize: cs.fontSize,
            lineHeight: style.lineHeight,
            color: cs.color,
            ['--editable-text-color' as string]: cs.color,
            textAlign: style.alignment,
            textIndent: style.indent,
            letterSpacing: cs.letterSpacing,
            ['--space-before' as string]: `${style.spaceBefore}px`,
            ['--space-after' as string]: `${style.spaceAfter}px`,
          }}
        />
      </div>
    </div>
  );
}
