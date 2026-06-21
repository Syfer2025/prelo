/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const productCss = readFileSync(join(process.cwd(), 'src/product/product.css'), 'utf8');
const editablePageSource = readFileSync(
  join(process.cwd(), 'src/editor/components/EditablePage.tsx'),
  'utf8'
);

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = productCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match?.[1] ?? '';
}

describe('editor typing latency guard', () => {
  it('keeps native typed text visible while the engine layer waits for re-pagination', () => {
    const editableEditingRule = cssRule('.editable-frame.has-engine-layout.is-editing');
    const engineEditingRule = cssRule('.editor-page-frame.is-editing .engine-line-layer');

    expect(editablePageSource).toContain('isEditing');
    expect(editablePageSource).toContain('setIsEditing(true)');
    expect(editablePageSource).toContain('setIsEditing(false)');
    expect(editableEditingRule).toContain('color: var(--editable-text-color');
    expect(editableEditingRule).not.toContain('transparent');
    expect(engineEditingRule).toContain('opacity: 0');
  });
});
