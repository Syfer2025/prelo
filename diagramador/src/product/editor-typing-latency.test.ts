/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const productCss = readFileSync(join(process.cwd(), 'src/product/product.css'), 'utf8');
const editablePageSource = readFileSync(
  join(process.cwd(), 'src/editor/components/EditablePage.tsx'),
  'utf8'
);
const frameEditorSource = readFileSync(
  join(process.cwd(), 'src/editor/components/TiptapFrameEditor.tsx'),
  'utf8'
);

describe('escrita no próprio frame (Tiptap dentro da página Prelo)', () => {
  it('alterna editing (Tiptap) e proof (engine-line) no MESMO frame, mutuamente exclusivos', () => {
    expect(editablePageSource).toContain('isEditing');
    expect(editablePageSource).toContain('setIsEditing(true)');
    expect(editablePageSource).toContain('setIsEditing(false)');
    // editing = Tiptap no frame; proof = camada de linhas do motor (= PDF)
    expect(editablePageSource).toContain('TiptapFrameEditor');
    expect(editablePageSource).toContain('engine-line-layer');
    // exclusivos: o Tiptap aparece no ramo isEditing; a prova no ramo else (depois no fonte)
    const editingIndex = editablePageSource.indexOf('TiptapFrameEditor');
    const proofIndex = editablePageSource.indexOf('engine-line-layer');
    expect(editingIndex).toBeGreaterThan(-1);
    expect(proofIndex).toBeGreaterThan(editingIndex);
  });

  it('ao desfocar, o Tiptap converte para texto do Prelo e dispara commit (repaginação)', () => {
    expect(frameEditorSource).toContain('onCommitText');
    expect(frameEditorSource).toContain('tiptapJsonToPreloParagraphs');
    expect(frameEditorSource).toMatch(/onBlur|handleBlur/);
    // EditablePage liga o commit do Tiptap ao onInput + onCommit do Prelo.
    expect(editablePageSource).toMatch(/onCommitText=\{[\s\S]*onInput\([\s\S]*onCommit\(\)/);
  });

  it('o editor Tiptap não tem largura própria: ocupa o frame (CSS inset:0, absolute)', () => {
    const wrap = productCss.match(/\.tiptap-frame-wrap\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(wrap).toContain('position: absolute');
    expect(wrap).toContain('inset: 0');
  });
});
