/**
 * editor-state — estado puro do EDITOR do produto e operações imutáveis sobre ele.
 *
 * Não há React aqui. Cada operação devolve um novo `EditorState`. O `EditorShell`
 * conecta isto ao histórico (undo/redo) e ao React.
 */
import type { CharacterStyle, Document, Frame, ParagraphStyle, Story } from '../model/types';
import {
  BLANK_BODY_STYLE_ID,
  BLANK_FONT_SIZE,
  BLANK_PAGE_HEIGHT,
  BLANK_PAGE_MARGIN,
  BLANK_PAGE_WIDTH,
  BLANK_PROJECT_NAME,
  BLANK_STORY_ID,
  createBlankDocument,
  createBlankPageBundle,
} from './blank-document';

export interface EditorProject {
  id: string;
  name: string;
  document: Document;
}

export interface EditorState {
  project: EditorProject;
  activePageIndex: number;
  /** Maior número de página já criado — usado para gerar IDs únicos e estáveis. */
  pageSeq: number;
}

export function createInitialEditorState(): EditorState {
  return {
    project: {
      id: 'project-1',
      name: BLANK_PROJECT_NAME,
      document: createBlankDocument(),
    },
    activePageIndex: 0,
    pageSeq: 1,
  };
}

/**
 * Reconstrói um EditorState a partir de um projeto carregado (ex.: localStorage).
 * `pageSeq` é derivado dos IDs de página existentes (`page-N`) para não recriar IDs em uso.
 */
export function editorStateFromProject(project: EditorProject): EditorState {
  const seq = project.document.pages.reduce((max, page) => {
    const match = /^page-(\d+)$/.exec(page.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1);
  return { project, activePageIndex: 0, pageSeq: seq };
}

/** Story principal do manuscrito contínuo. */
export function mainStory(state: EditorState): Story | null {
  const { frames, stories } = state.project.document;
  const frameStoryIds = new Set(
    Object.values(frames)
      .filter((frame) => frame.type === 'text' && frame.storyId)
      .map((frame) => frame.storyId)
  );
  return (
    stories.find((story) => story.id === BLANK_STORY_ID) ??
    stories.find((story) => frameStoryIds.has(story.id)) ??
    stories[0] ??
    null
  );
}

/** Página ativa (ou null se índice inválido). */
export function activePage(state: EditorState) {
  return state.project.document.pages[state.activePageIndex] ?? null;
}

/** Story de texto da página ativa (resolve pelo primeiro frame de texto da página). */
export function activeStory(state: EditorState): Story | null {
  const page = activePage(state);
  if (!page) return mainStory(state);
  const { frames, stories } = state.project.document;
  for (const frameId of page.frames) {
    const frame = frames[frameId];
    if (frame && frame.type === 'text' && frame.storyId) {
      return stories.find((story) => story.id === frame.storyId) ?? null;
    }
  }
  return null;
}

/** Estilo de parágrafo "corpo" do documento. */
export function bodyStyle(state: EditorState): ParagraphStyle {
  return state.project.document.styles[BLANK_BODY_STYLE_ID]!;
}

/** Converte os parágrafos de uma story em texto simples (parágrafos separados por \n). */
export function storyToText(story: Story | null): string {
  if (!story) return '';
  return story.paragraphs.map((p) => p.spans.map((s) => s.text).join('')).join('\n');
}

/** Texto integral do manuscrito contínuo. */
export function manuscriptText(state: EditorState): string {
  return storyToText(mainStory(state));
}

interface PageTextCapacity {
  charsPerLine: number;
  linesPerPage: number;
}

function firstTextFrame(document: Document): Frame | null {
  for (const page of document.pages) {
    for (const frameId of page.frames) {
      const frame = document.frames[frameId];
      if (frame?.type === 'text') return frame;
    }
  }
  return null;
}

function pageTextCapacity(state: EditorState): PageTextCapacity {
  const frame = firstTextFrame(state.project.document);
  const style = bodyStyle(state);
  const fontSize = style.characterStyle.fontSize || BLANK_FONT_SIZE;
  const lineHeight = style.lineHeight > 4 ? style.lineHeight : fontSize * style.lineHeight;
  const frameWidth = frame?.width ?? BLANK_PAGE_WIDTH - BLANK_PAGE_MARGIN * 2;
  const frameHeight = frame?.height ?? BLANK_PAGE_HEIGHT - BLANK_PAGE_MARGIN * 2;

  return {
    charsPerLine: Math.max(16, Math.floor(frameWidth / Math.max(1, fontSize * 0.52))),
    linesPerPage: Math.max(1, Math.floor(frameHeight / Math.max(1, lineHeight))),
  };
}

function estimatedLineCount(text: string, charsPerLine: number): number {
  return visualLineFragments(text, charsPerLine).reduce((total, fragment) => total + fragment.lines, 0);
}

/** Estima quantas páginas editoriais são necessárias para o texto atual. */
export function estimateRequiredPagesForText(state: EditorState, text: string): number {
  const capacity = pageTextCapacity(state);
  return Math.max(1, Math.ceil(estimatedLineCount(text, capacity.charsPerLine) / capacity.linesPerPage));
}

interface TextLineFragment {
  text: string;
  lines: number;
}

function wrapTextLine(line: string, charsPerLine: number): string[] {
  if (line === '') return [''];
  const pieces: string[] = [];
  let remaining = line;

  while (remaining.length > charsPerLine) {
    const hardBreak = Math.min(charsPerLine, remaining.length);
    const spaceBreak = remaining.lastIndexOf(' ', hardBreak + 1);
    const breakAt = spaceBreak > 0 ? spaceBreak + 1 : hardBreak;
    pieces.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }

  pieces.push(remaining);
  return pieces;
}

function visualLineFragments(text: string, charsPerLine: number): TextLineFragment[] {
  const lines = text.split('\n');
  const fragments: TextLineFragment[] = [];

  lines.forEach((line, lineIndex) => {
    const hasLineBreak = lineIndex < lines.length - 1;
    const wrapped = wrapTextLine(line, charsPerLine);
    wrapped.forEach((piece, pieceIndex) => {
      const isLastPiece = pieceIndex === wrapped.length - 1;
      fragments.push({
        text: isLastPiece && hasLineBreak ? `${piece}\n` : piece,
        lines: 1,
      });
    });
  });

  return fragments.length > 0 ? fragments : [{ text: '', lines: 1 }];
}

function splitTextByCapacity(text: string, pageCount: number, capacity: PageTextCapacity): string[] {
  const chunks = Array.from({ length: pageCount }, () => '');
  const fragments = visualLineFragments(text, capacity.charsPerLine);
  let pageIndex = 0;
  let usedLines = 0;

  for (const fragment of fragments) {
    if (usedLines > 0 && usedLines + fragment.lines > capacity.linesPerPage && pageIndex < pageCount - 1) {
      pageIndex += 1;
      usedLines = 0;
    }
    chunks[pageIndex] += fragment.text;
    usedLines += fragment.lines;
  }

  return chunks;
}

/** Trechos do manuscrito a exibir em cada página do editor. */
export function pageTextChunks(state: EditorState): string[] {
  return splitTextByCapacity(
    manuscriptText(state),
    state.project.document.pages.length,
    pageTextCapacity(state)
  );
}

/** Texto editável da página ativa. */
export function activePageText(state: EditorState): string {
  return pageTextChunks(state)[state.activePageIndex] ?? '';
}

function textToParagraphs(text: string, styleId: string): Story['paragraphs'] {
  if (text === '') return [{ styleId, spans: [{ text: '' }] }];
  return text.split('\n').map((line) => ({ styleId, spans: [{ text: line }] }));
}

function appendPage(state: EditorState, activateNewPage: boolean): EditorState {
  const nextSeq = state.pageSeq + 1;
  const document = state.project.document;
  const story = mainStory(state);
  const storyId = story?.id ?? BLANK_STORY_ID;
  const prevFrameId = story?.frameChainIds.at(-1) ?? null;
  const { page, frame, story: createdStory } = createBlankPageBundle(nextSeq, storyId, prevFrameId);
  const frames = { ...document.frames, [frame.id]: frame };
  if (prevFrameId && frames[prevFrameId]) {
    frames[prevFrameId] = { ...frames[prevFrameId], nextFrameId: frame.id };
  }
  const stories = story
    ? document.stories.map((s) =>
        s.id === story.id ? { ...s, frameChainIds: [...s.frameChainIds, frame.id] } : s
      )
    : [...document.stories, createdStory];

  return {
    ...state,
    pageSeq: nextSeq,
    activePageIndex: activateNewPage ? document.pages.length : state.activePageIndex,
    project: {
      ...state.project,
      document: {
        ...document,
        pages: [...document.pages, page],
        frames,
        stories,
      },
    },
  };
}

function ensurePageCount(state: EditorState, minPageCount: number): EditorState {
  let next = state;
  while (next.project.document.pages.length < minPageCount) {
    next = appendPage(next, false);
  }
  return next;
}

/** Acrescenta uma nova página em branco e a torna ativa. */
export function addPage(state: EditorState): EditorState {
  return appendPage(state, true);
}

/** Seleciona a página ativa (índice fora do intervalo é fixado nos limites). */
export function setActivePage(state: EditorState, index: number): EditorState {
  const last = state.project.document.pages.length - 1;
  const clamped = Math.max(0, Math.min(index, last));
  if (clamped === state.activePageIndex) return state;
  return { ...state, activePageIndex: clamped };
}

/** Atualiza o manuscrito integral (reescreve os parágrafos da story principal). */
export function setManuscriptText(state: EditorState, text: string): EditorState {
  const story = mainStory(state);
  if (!story) return state;
  const styleId = story.paragraphs[0]?.styleId ?? BLANK_BODY_STYLE_ID;
  const nextParagraphs = textToParagraphs(text, styleId);
  const nextState = {
    ...state,
    project: {
      ...state.project,
      document: {
        ...state.project.document,
        stories: state.project.document.stories.map((s) =>
          s.id === story.id ? { ...s, paragraphs: nextParagraphs } : s
        ),
      },
    },
  };
  return ensurePageCount(nextState, estimateRequiredPagesForText(nextState, text));
}

function joinPageChunks(chunks: string[]): string {
  let end = chunks.length;
  while (end > 1 && chunks[end - 1] === '') end -= 1;
  return chunks.slice(0, end).join('');
}

/** Atualiza o trecho textual de uma página e recompõe o manuscrito contínuo. */
export function setPageText(state: EditorState, pageIndex: number, text: string): EditorState {
  const chunks = pageTextChunks(state);
  const clamped = Math.max(0, Math.min(pageIndex, state.project.document.pages.length - 1));
  chunks[clamped] = text;
  return setManuscriptText(state, joinPageChunks(chunks));
}

/** Atualiza o texto da página ativa. */
export function setActivePageText(state: EditorState, text: string): EditorState {
  return setPageText(state, state.activePageIndex, text);
}

/** Renomeia o projeto. */
export function setProjectName(state: EditorState, name: string): EditorState {
  return { ...state, project: { ...state.project, name } };
}

/** Substitui o documento do projeto, preservando o restante do estado do editor. */
export function setProjectDocument(state: EditorState, document: Document): EditorState {
  const last = Math.max(0, document.pages.length - 1);
  return {
    ...state,
    activePageIndex: Math.min(state.activePageIndex, last),
    project: {
      ...state.project,
      document,
    },
  };
}

/** Atualiza o estilo "corpo" (parágrafo e/ou caractere). */
export function setBodyStyle(
  state: EditorState,
  patch: { paragraph?: Partial<ParagraphStyle>; character?: Partial<CharacterStyle> }
): EditorState {
  const current = bodyStyle(state);
  const nextStyle: ParagraphStyle = {
    ...current,
    ...patch.paragraph,
    characterStyle: { ...current.characterStyle, ...patch.character },
  };
  return {
    ...state,
    project: {
      ...state.project,
      document: {
        ...state.project.document,
        styles: { ...state.project.document.styles, [BLANK_BODY_STYLE_ID]: nextStyle },
      },
    },
  };
}
