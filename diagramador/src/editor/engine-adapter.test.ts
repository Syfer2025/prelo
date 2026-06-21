import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { TextEngine } from '../engine';
import type { PaginationResult } from '../engine';
import type { MeasureFn } from '../engine/shaper';
import type { Page } from '../model/types';
import { createEngineAdapter } from './engine-adapter';
import { createInitialEditorState, setManuscriptText } from './editor-state';
import { EDITOR_LAYOUT_ALGORITHM } from './editor-layout';
import { BLANK_STORY_ID } from './blank-document';

const measureFn: MeasureFn = (text) => text.length * 5;

describe('engine-adapter', () => {
  it('encaminha exportProjectToPdf para engine.documentToPdf com o document do projeto', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fake = {
      documentToPdf: vi.fn().mockResolvedValue(bytes),
      paginateStory: vi.fn(),
    };
    const adapter = createEngineAdapter(fake);
    const project = createInitialEditorState().project;

    const out = await adapter.exportProjectToPdf(project, { algorithm: 'greedy', measureFn });

    expect(fake.documentToPdf).toHaveBeenCalledWith(project.document, {
      algorithm: 'greedy',
      measureFn,
    });
    expect(out).toBe(bytes);
  });

  it('encaminha paginateProjectStory para engine.paginateStory com o document do projeto', () => {
    const project = createInitialEditorState().project;
    const pagination: PaginationResult = {
      document: project.document,
      layout: { frameLayouts: [], overflow: false, overflowText: '' },
      addedPages: 0,
      iterations: 1,
    };
    const fake = {
      documentToPdf: vi.fn(),
      paginateStory: vi.fn().mockReturnValue(pagination),
    };
    const adapter = createEngineAdapter(fake);

    const out = adapter.paginateProjectStory(project, 'story-main', {
      algorithm: 'greedy',
      measureFn,
      maxAutoPages: 3,
    });

    expect(fake.paginateStory).toHaveBeenCalledWith(project.document, 'story-main', {
      algorithm: 'greedy',
      measureFn,
      maxAutoPages: 3,
    });
    expect(out).toBe(pagination);
  });

  it('remove páginas automáticas antigas antes de pedir uma nova paginação ao motor', () => {
    const project = setManuscriptText(createInitialEditorState(), 'texto').project;
    const autoPage = {
      ...project.document.pages[0]!,
      id: 'auto-page-2',
      frames: ['auto-page-2-frame-page-1-1'],
    };
    const autoFrame = {
      ...project.document.frames['frame-page-1']!,
      id: 'auto-page-2-frame-page-1-1',
      pageId: 'auto-page-2',
      prevFrameId: 'frame-page-1',
      nextFrameId: null,
    };
    const dirtyProject = {
      ...project,
      document: {
        ...project.document,
        pages: [...project.document.pages, autoPage],
        frames: {
          ...project.document.frames,
          [autoFrame.id]: autoFrame,
          'frame-page-1': {
            ...project.document.frames['frame-page-1']!,
            nextFrameId: autoFrame.id,
          },
        },
        stories: project.document.stories.map((story) =>
          story.id === 'story-main'
            ? { ...story, frameChainIds: [...story.frameChainIds, autoFrame.id] }
            : story
        ),
      },
    };
    const fake = {
      documentToPdf: vi.fn(),
      paginateStory: vi.fn((document) => ({
        document,
        layout: { frameLayouts: [], overflow: false, overflowText: '' },
        addedPages: 0,
        iterations: 1,
      })),
    };
    const adapter = createEngineAdapter(fake);

    adapter.paginateProjectStory(dirtyProject, 'story-main');

    const cleanDocument = fake.paginateStory.mock.calls[0]![0];
    expect(cleanDocument.pages.map((page: Page) => page.id)).toEqual(['page-1']);
    expect(cleanDocument.frames['auto-page-2-frame-page-1-1']).toBeUndefined();
    expect(cleanDocument.frames['frame-page-1']!.nextFrameId).toBeNull();
    expect(cleanDocument.stories[0]!.frameChainIds).toEqual(['frame-page-1']);
  });

  it('remove páginas textuais criadas pela paginação antiga antes de repaginar', () => {
    const project = createInitialEditorState().project;
    const stalePage = {
      ...project.document.pages[0]!,
      id: 'page-2',
      frames: ['frame-page-2'],
    };
    const staleFrame = {
      ...project.document.frames['frame-page-1']!,
      id: 'frame-page-2',
      pageId: 'page-2',
      prevFrameId: 'frame-page-1',
      nextFrameId: null,
    };
    const dirtyProject = {
      ...project,
      document: {
        ...project.document,
        pages: [...project.document.pages, stalePage],
        frames: {
          ...project.document.frames,
          'frame-page-1': {
            ...project.document.frames['frame-page-1']!,
            nextFrameId: staleFrame.id,
          },
          [staleFrame.id]: staleFrame,
        },
        stories: project.document.stories.map((story) =>
          story.id === 'story-main'
            ? { ...story, frameChainIds: [...story.frameChainIds, staleFrame.id] }
            : story
        ),
      },
    };
    const fake = {
      documentToPdf: vi.fn(),
      paginateStory: vi.fn((document) => ({
        document,
        layout: { frameLayouts: [], overflow: false, overflowText: '' },
        addedPages: 0,
        iterations: 1,
      })),
    };
    const adapter = createEngineAdapter(fake);

    adapter.paginateProjectStory(dirtyProject, 'story-main');

    const cleanDocument = fake.paginateStory.mock.calls[0]![0];
    expect(cleanDocument.pages.map((page: Page) => page.id)).toEqual(['page-1']);
    expect(cleanDocument.frames['frame-page-2']).toBeUndefined();
    expect(cleanDocument.stories[0]!.frameChainIds).toEqual(['frame-page-1']);
  });

  it('usa o mesmo algoritmo editorial (kp) no preview e na exportação PDF', async () => {
    const project = createInitialEditorState().project;
    const pagination: PaginationResult = {
      document: project.document,
      layout: { frameLayouts: [], overflow: false, overflowText: '' },
      addedPages: 0,
      iterations: 1,
    };
    const fake = {
      documentToPdf: vi.fn().mockResolvedValue(new Uint8Array([1])),
      paginateStory: vi.fn().mockReturnValue(pagination),
    };
    const adapter = createEngineAdapter(fake);

    adapter.paginateProjectStory(project, BLANK_STORY_ID, { algorithm: EDITOR_LAYOUT_ALGORITHM });
    await adapter.exportProjectToPdf(project, { algorithm: EDITOR_LAYOUT_ALGORITHM });

    // O preset do editor é justificação editorial com Knuth-Plass (hifenização pt-BR ativa).
    expect(EDITOR_LAYOUT_ALGORITHM).toBe('kp');
    // O MESMO algoritmo chega ao motor pelos dois caminhos (preview e PDF).
    expect(fake.paginateStory.mock.calls[0]![2]!.algorithm).toBe('kp');
    expect(fake.documentToPdf.mock.calls[0]![1]!.algorithm).toBe('kp');
  });

  it('gera um PDF carregável a partir do documento em branco usando o motor real', async () => {
    const engine = new TextEngine({} as CanvasRenderingContext2D, {
      fontSize: 15,
      fontFamily: 'Test',
      lineHeight: 1.5,
    });
    const adapter = createEngineAdapter(engine);
    const project = createInitialEditorState().project;

    const bytes = await adapter.exportProjectToPdf(project, { algorithm: 'greedy', measureFn });

    expect(bytes.length).toBeGreaterThan(0);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});
