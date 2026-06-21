/**
 * engine-adapter — ÚNICO ponto de contato entre a UI do produto e o motor de composição.
 *
 * Regra de arquitetura: a nova UI nunca importa `../engine` diretamente; importa este
 * adapter. Assim o motor estável (`src/engine`) fica isolado por trás de uma porta
 * (`EnginePort`). Se um dia a UI precisar de comportamento experimental do motor,
 * o fork acontece AQUI, sem tocar no caminho estável usado pelo laboratório.
 */
import { TextEngine } from '../engine';
import type {
  DocumentToPdfOptions,
  EngineConfig,
  PaginateStoryOptions,
  PaginationResult,
} from '../engine';
import type { Document } from '../model/types';
import type { EditorProject } from './editor-state';

/** Porta mínima do motor que o editor consome (fácil de simular em teste). */
export interface EnginePort {
  documentToPdf(document: Document, options?: DocumentToPdfOptions): Promise<Uint8Array>;
  paginateStory(document: Document, storyId: string, options?: PaginateStoryOptions): PaginationResult;
}

export interface EditorEngineAdapter {
  exportProjectToPdf(project: EditorProject, options?: DocumentToPdfOptions): Promise<Uint8Array>;
  paginateProjectStory(
    project: EditorProject,
    storyId: string,
    options?: PaginateStoryOptions
  ): PaginationResult;
}

/** Cria o adapter a partir de qualquer porta de motor (real ou simulada). */
export function createEngineAdapter(engine: EnginePort): EditorEngineAdapter {
  return {
    exportProjectToPdf(project, options) {
      return engine.documentToPdf(project.document, options);
    },
    paginateProjectStory(project, storyId, options) {
      return engine.paginateStory(pruneAutoPages(project.document, storyId), storyId, options);
    },
  };
}

/** Conveniência para o app: instancia o motor estável real e o embrulha no adapter. */
export function createBrowserEngineAdapter(
  ctx: CanvasRenderingContext2D,
  config?: Partial<EngineConfig>
): EditorEngineAdapter {
  const engine = new TextEngine(ctx, config);
  return createEngineAdapter(engine);
}

function pruneAutoPages(document: Document, storyId: string): Document {
  let keptStoryTemplate = false;
  const keptPages = document.pages.filter((page) => {
    if (page.id.startsWith('auto-page-')) return false;

    const pageFrames = page.frames.map((frameId) => document.frames[frameId]).filter(Boolean);
    const isOnlyStoryTextPage =
      pageFrames.length > 0 &&
      pageFrames.every((frame) => frame?.type === 'text' && frame.storyId === storyId);
    if (!isOnlyStoryTextPage) return true;
    if (!keptStoryTemplate) {
      keptStoryTemplate = true;
      return true;
    }
    return false;
  });
  const keptPageIds = new Set(keptPages.map((page) => page.id));
  const keptFrames = Object.fromEntries(
    Object.entries(document.frames)
      .filter(([, frame]) => keptPageIds.has(frame.pageId))
      .map(([id, frame]) => [id, { ...frame }])
  );

  const stories = document.stories.map((story) => {
    if (story.id !== storyId) {
      return {
        ...story,
        frameChainIds: story.frameChainIds.filter((frameId) => !!keptFrames[frameId]),
        paragraphs: story.paragraphs.map((paragraph) => ({
          ...paragraph,
          spans: paragraph.spans.map((span) => ({ ...span })),
        })),
      };
    }

    const frameChainIds = story.frameChainIds.filter((frameId) => !!keptFrames[frameId]);
    frameChainIds.forEach((frameId, index) => {
      const frame = keptFrames[frameId]!;
      keptFrames[frameId] = {
        ...frame,
        prevFrameId: frameChainIds[index - 1] ?? null,
        nextFrameId: frameChainIds[index + 1] ?? null,
      };
    });

    return {
      ...story,
      frameChainIds,
      paragraphs: story.paragraphs.map((paragraph) => ({
        ...paragraph,
        spans: paragraph.spans.map((span) => ({ ...span })),
      })),
    };
  });

  return {
    ...document,
    pages: keptPages.map((page) => ({
      ...page,
      margins: { ...page.margins },
      frames: page.frames.filter((frameId) => !!keptFrames[frameId]),
    })),
    frames: keptFrames,
    stories,
  };
}
