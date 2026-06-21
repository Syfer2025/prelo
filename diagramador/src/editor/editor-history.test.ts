import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
} from './editor-history';

describe('editor-history', () => {
  it('começa sem passado nem futuro', () => {
    const h = createHistory('a');
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('push move o presente para o passado e limpa o futuro', () => {
    const h = pushHistory(createHistory('a'), 'b');
    expect(h.present).toBe('b');
    expect(h.past).toEqual(['a']);
    expect(canUndo(h)).toBe(true);
  });

  it('undo volta ao presente anterior e habilita redo', () => {
    let h = pushHistory(createHistory('a'), 'b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe('b');
  });

  it('undo sem passado é no-op', () => {
    const h = createHistory('a');
    expect(undo(h)).toBe(h);
  });

  it('um novo push após undo descarta o futuro', () => {
    let h = pushHistory(createHistory('a'), 'b');
    h = undo(h); // present 'a', future ['b']
    h = pushHistory(h, 'c');
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBe(false);
  });

  it('respeita o limite de histórico', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = pushHistory(h, i);
    expect(h.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    expect(h.present).toBe(HISTORY_LIMIT + 10);
  });
});
