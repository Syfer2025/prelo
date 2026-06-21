import type { Frame, Page, ParagraphStyle } from '../../model/types';
import type { FrameLayout } from '../../engine';
import EditablePage from './EditablePage';

interface EditorWorkspaceProps {
  pages: Page[];
  frames: Record<string, Frame>;
  frameLayoutsByFrameId: Record<string, FrameLayout>;
  texts: string[];
  activePageIndex: number;
  style: ParagraphStyle;
  zoom: number;
  /** Muda quando o conteúdo deve ser re-semeado (undo/redo, load, redistribuição). */
  pageRevision: number;
  onSelectPage: (pageIndex: number) => void;
  onTextInput: (pageIndex: number, text: string) => void;
  onTextCommit: () => void;
}

export default function EditorWorkspace({
  pages,
  frames,
  frameLayoutsByFrameId,
  texts,
  activePageIndex,
  style,
  zoom,
  pageRevision,
  onSelectPage,
  onTextInput,
  onTextCommit,
}: EditorWorkspaceProps) {
  return (
    <div className="editor-workspace">
      <div className="editor-canvas-scroll">
        <div className="editor-pages-stack">
          {pages.map((page, pageIndex) => {
            const frame = page.frames
              .map((id) => frames[id])
              .find((candidate): candidate is Frame => !!candidate && candidate.type === 'text');
            if (!frame) return null;
            const active = pageIndex === activePageIndex;
            return (
              <div
                key={page.id}
                className={`editor-page-scaler${active ? ' is-active' : ''}`}
                style={{ width: page.width * zoom, height: page.height * zoom }}
                onMouseDown={() => {
                  if (!active) onSelectPage(pageIndex);
                }}
              >
                <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                  <EditablePage
                    key={`${page.id}:${pageRevision}`}
                    page={page}
                    frame={frame}
                    frameLayout={frameLayoutsByFrameId[frame.id]}
                    text={texts[pageIndex] ?? ''}
                    style={style}
                    onInput={(text) => onTextInput(pageIndex, text)}
                    onCommit={onTextCommit}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
