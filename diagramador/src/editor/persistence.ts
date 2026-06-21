/**
 * persistence — salvar/carregar o projeto do editor (por enquanto em localStorage).
 *
 * O armazenamento é injetado (`KeyValueStore`) para a lógica ser testável sem DOM.
 * Sem backend neste ciclo.
 */
import type { EditorProject } from './editor-state';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'prelo.editor.project.v1';
const STORAGE_VERSION = 1;

interface PersistedShape {
  version: number;
  project: EditorProject;
}

export function saveProject(store: KeyValueStore, project: EditorProject): void {
  const payload: PersistedShape = { version: STORAGE_VERSION, project };
  store.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Carrega o projeto salvo; devolve null se ausente, corrompido ou de formato inválido. */
export function loadProject(store: KeyValueStore): EditorProject | null {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    const project = parsed?.project;
    if (!project || !project.document || !Array.isArray(project.document.pages)) {
      return null;
    }
    return project;
  } catch {
    return null;
  }
}

export function clearProject(store: KeyValueStore): void {
  store.removeItem(STORAGE_KEY);
}
