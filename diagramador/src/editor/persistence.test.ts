import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, clearProject, loadProject, saveProject } from './persistence';
import type { KeyValueStore } from './persistence';
import { createInitialEditorState } from './editor-state';

function fakeStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('persistence', () => {
  it('salva e recarrega o projeto (round-trip)', () => {
    const store = fakeStore();
    const project = createInitialEditorState().project;
    saveProject(store, project);

    const loaded = loadProject(store);
    expect(loaded?.name).toBe(project.name);
    expect(loaded?.document.pages).toHaveLength(1);
  });

  it('devolve null quando não há nada salvo', () => {
    expect(loadProject(fakeStore())).toBeNull();
  });

  it('devolve null em JSON corrompido', () => {
    const store = fakeStore();
    store.setItem(STORAGE_KEY, '{not json');
    expect(loadProject(store)).toBeNull();
  });

  it('devolve null quando o formato salvo é inválido', () => {
    const store = fakeStore();
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 1, project: { name: 'x' } }));
    expect(loadProject(store)).toBeNull();
  });

  it('clearProject remove o projeto salvo', () => {
    const store = fakeStore();
    saveProject(store, createInitialEditorState().project);
    clearProject(store);
    expect(loadProject(store)).toBeNull();
  });
});
