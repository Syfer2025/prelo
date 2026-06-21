/**
 * editor-history — pilha genérica de undo/redo (pura, imutável).
 *
 * Guarda `present` mais as listas `past`/`future`. Zoom NÃO passa por aqui
 * (é estado puramente visual, decidido no EditorShell).
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Limite de passos guardados para não crescer indefinidamente. */
export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Empurra um novo presente; o anterior vai para `past` e o `future` é descartado. */
export function pushHistory<T>(history: History<T>, next: T): History<T> {
  const past = [...history.past, history.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  const previous = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  const next = history.future[0]!;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
