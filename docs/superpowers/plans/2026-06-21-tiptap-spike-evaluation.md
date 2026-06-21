# Tiptap Spike Evaluation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Test whether Tiptap should replace Prelo's improvised text editing surface while keeping the Prelo engine as the only source of truth for pagination, image wrap, preflight, and PDF export.

**Architecture:** Tiptap is allowed to own only editable text content and inline/paragraph formatting during writing. Prelo continues to own pages, frames, images, text-wrap, pagination, preview-final layout, and PDF. This spike must be isolated on a branch and must be reversible.

**Tech Stack:** TypeScript, React, Vite, Vitest, Tiptap/ProseMirror packages, current Prelo engine (`flowStory`, `paginateStory`, `documentToPdf`), existing editor adapter.

---

## Precondition: Current Engine Checkpoint

The current engine state was pushed before this spike:

```bash
git log --oneline --max-count=1
```

Expected:

```text
a8db9a0 chore: checkpoint prelo engine before tiptap spike
```

Remote:

```text
origin https://github.com/Syfer2025/prelo.git
branch main tracks origin/main
```

Do not start the spike unless `main` is clean and pushed.

---

## Non-Negotiable Rules

- Tiptap must not replace `src/engine`.
- Tiptap must not own pages, page breaks, frames, images, crop, text-wrap, bleed, preflight, or PDF.
- Tiptap must not become the visual proof for print.
- Final preview must still come from Prelo layout.
- PDF must still come from Prelo layout/export.
- The spike must be easy to discard.

Correct data flow:

```text
Tiptap JSON
  -> adapter
  -> Prelo Story.paragraphs
  -> paginateStory / flowStory
  -> Prelo preview
  -> documentToPdf
```

Wrong data flow:

```text
Tiptap DOM
  -> screenshot/HTML/PDF
```

---

## Decision Gate

At the end of the spike, choose one:

1. **Adopt Tiptap for writing surface**
   - Keep Prelo engine.
   - Continue integrating toolbar/schema/conversion.
2. **Reject Tiptap**
   - Keep current editor.
   - Use lessons from Tiptap UI/UX only.
3. **Delay decision**
   - Keep spike branch.
   - Do not merge into main.

Do not partially merge if conversion or fidelity is unclear.

---

## Success Criteria

Tiptap is considered viable only if all are true:

- [ ] Typing/pasting the long Portuguese manuscript feels clearly better than current `EditablePage`.
- [ ] Tiptap JSON converts deterministically into Prelo `Story.paragraphs`.
- [ ] Plain paragraphs, headings, bold, italic, underline, alignment, and paragraph spacing survive conversion.
- [ ] Prelo preview still paginates the converted story.
- [ ] PDF export still works through `documentToPdf`.
- [ ] Images remain Prelo `ImageFrame` objects, not Tiptap image nodes.
- [ ] Text-wrap still works from Prelo frames after conversion.
- [ ] No second source of truth is introduced.
- [ ] Existing engine tests remain green.

Reject or delay if any of these fail.

---

## Task 1: Create Spike Branch

**Files:**

- No file changes expected.

- [ ] **Step 1: Confirm clean main**

Run:

```bash
git status --short
git branch --show-current
git log --oneline --max-count=1
```

Expected:

```text
<no status output>
main
a8db9a0 chore: checkpoint prelo engine before tiptap spike
```

- [ ] **Step 2: Create branch**

Run:

```bash
git switch -c spike/tiptap-editor
```

Expected:

```text
Switched to a new branch 'spike/tiptap-editor'
```

- [ ] **Step 3: Push branch early**

Run:

```bash
git push -u origin spike/tiptap-editor
```

Expected: branch exists on GitHub.

---

## Task 2: Install Tiptap Packages

**Files:**

- Modify: `diagramador/package.json`
- Modify: `diagramador/package-lock.json`

- [ ] **Step 1: Install minimal dependencies**

Run:

```bash
cd diagramador
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-text-align
```

Expected:

- `package.json` contains the new Tiptap packages.
- `package-lock.json` is updated.

- [ ] **Step 2: Run baseline gate**

Run:

```bash
npm test
npm run build
npm run lint
```

Expected:

- Tests still pass.
- Build still passes.
- Lint still passes.

- [ ] **Step 3: Commit dependency spike**

Run:

```bash
git add diagramador/package.json diagramador/package-lock.json
git commit -m "chore: add tiptap spike dependencies"
```

---

## Task 3: Add Tiptap-To-Prelo Adapter Tests

**Files:**

- Create: `diagramador/src/editor/tiptap-adapter.test.ts`
- Create: `diagramador/src/editor/tiptap-adapter.ts`

- [ ] **Step 1: Write failing tests**

Create `diagramador/src/editor/tiptap-adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tiptapJsonToPreloParagraphs } from './tiptap-adapter';

describe('tiptapJsonToPreloParagraphs', () => {
  it('converts plain paragraphs into Prelo paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Primeiro paragrafo.' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Segundo paragrafo.' }],
        },
      ],
    };

    const paragraphs = tiptapJsonToPreloParagraphs(doc, 'body');

    expect(paragraphs).toEqual([
      { styleId: 'body', spans: [{ text: 'Primeiro paragrafo.' }] },
      { styleId: 'body', spans: [{ text: 'Segundo paragrafo.' }] },
    ]);
  });

  it('maps headings to heading style ids', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Capitulo 1' }],
        },
      ],
    };

    const paragraphs = tiptapJsonToPreloParagraphs(doc, 'body');

    expect(paragraphs).toEqual([
      { styleId: 'heading-1', spans: [{ text: 'Capitulo 1' }] },
    ]);
  });

  it('keeps inline marks as span metadata for later style mapping', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Texto ' },
            { type: 'text', text: 'forte', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' e ' },
            { type: 'text', text: 'italico', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };

    const paragraphs = tiptapJsonToPreloParagraphs(doc, 'body');

    expect(paragraphs).toEqual([
      {
        styleId: 'body',
        spans: [
          { text: 'Texto ' },
          { text: 'forte', marks: ['bold'] },
          { text: ' e ' },
          { text: 'italico', marks: ['italic'] },
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
cd diagramador
npm test -- src/editor/tiptap-adapter.test.ts
```

Expected: FAIL because `tiptap-adapter` does not exist.

- [ ] **Step 3: Add minimal adapter**

Create `diagramador/src/editor/tiptap-adapter.ts`:

```ts
type TiptapMark = { type: string };

type TiptapTextNode = {
  type: 'text';
  text: string;
  marks?: TiptapMark[];
};

type TiptapBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapTextNode[];
};

type TiptapDoc = {
  type: 'doc';
  content?: TiptapBlockNode[];
};

export interface PreloSpanDraft {
  text: string;
  marks?: string[];
}

export interface PreloParagraphDraft {
  styleId: string;
  spans: PreloSpanDraft[];
}

export function tiptapJsonToPreloParagraphs(
  doc: TiptapDoc,
  defaultStyleId: string
): PreloParagraphDraft[] {
  const blocks = doc.content ?? [];

  return blocks
    .map((block): PreloParagraphDraft | null => {
      const spans = (block.content ?? [])
        .filter((node) => node.type === 'text' && node.text.length > 0)
        .map((node) => {
          const marks = node.marks?.map((mark) => mark.type) ?? [];
          return marks.length > 0 ? { text: node.text, marks } : { text: node.text };
        });

      if (spans.length === 0) return null;

      return {
        styleId: styleIdForBlock(block, defaultStyleId),
        spans,
      };
    })
    .filter((paragraph): paragraph is PreloParagraphDraft => paragraph !== null);
}

function styleIdForBlock(block: TiptapBlockNode, defaultStyleId: string): string {
  if (block.type === 'heading') {
    const level = typeof block.attrs?.level === 'number' ? block.attrs.level : 1;
    return `heading-${level}`;
  }
  return defaultStyleId;
}
```

- [ ] **Step 4: Run adapter test and verify GREEN**

Run:

```bash
npm test -- src/editor/tiptap-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit adapter**

Run:

```bash
git add diagramador/src/editor/tiptap-adapter.ts diagramador/src/editor/tiptap-adapter.test.ts
git commit -m "test: map tiptap json to prelo paragraphs"
```

---

## Task 4: Add Isolated Tiptap Lab Component

**Files:**

- Create: `diagramador/src/editor/components/TiptapWritingSurface.tsx`
- Modify: `diagramador/src/product/EditorShell.tsx`
- Modify: `diagramador/src/product/product.css`

- [ ] **Step 1: Add component behind a prop**

Create `diagramador/src/editor/components/TiptapWritingSurface.tsx`:

```tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';

interface TiptapWritingSurfaceProps {
  initialText: string;
  onChangeJson: (json: unknown) => void;
}

export default function TiptapWritingSurface({
  initialText,
  onChangeJson,
}: TiptapWritingSurfaceProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: initialText
      .split(/\n\n+/)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join(''),
    editorProps: {
      attributes: {
        class: 'tiptap-writing-surface',
      },
    },
    onUpdate: ({ editor }) => {
      onChangeJson(editor.getJSON());
    },
  });

  return <EditorContent editor={editor} />;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
```

- [ ] **Step 2: Add CSS**

Append to `diagramador/src/product/product.css`:

```css
.tiptap-writing-surface {
  min-height: 100%;
  outline: none;
  color: #1f2d44;
  font-family: "Crimson Text", Georgia, serif;
  font-size: 15px;
  line-height: 1.5;
}

.tiptap-writing-surface p {
  margin: 0 0 12px;
  text-align: justify;
}

.tiptap-writing-surface h1,
.tiptap-writing-surface h2,
.tiptap-writing-surface h3 {
  margin: 0 0 14px;
  color: #1f2d44;
}
```

- [ ] **Step 3: Wire only in lab mode**

Modify `EditorShell.tsx` only enough to add a temporary local boolean:

```ts
const USE_TIPTAP_SPIKE = false;
```

Then pass either the current `EditorWorkspace` path or a temporary Tiptap surface. Keep default `false`.

Expected: main product still uses current editor unless the constant is manually flipped in the spike branch.

- [ ] **Step 4: Run build/lint**

Run:

```bash
cd diagramador
npm run build
npm run lint
```

Expected: both pass.

- [ ] **Step 5: Commit isolated lab component**

Run:

```bash
git add diagramador/src/editor/components/TiptapWritingSurface.tsx diagramador/src/product/EditorShell.tsx diagramador/src/product/product.css
git commit -m "feat: add isolated tiptap writing surface spike"
```

---

## Task 5: Convert Tiptap Content Into Prelo Preview

**Files:**

- Modify: `diagramador/src/product/EditorShell.tsx`
- Modify: `diagramador/src/editor/tiptap-adapter.ts`
- Test: `diagramador/src/editor/tiptap-adapter.test.ts`

- [ ] **Step 1: Extend adapter to output actual Prelo paragraph shape**

Update tests so converted paragraphs can be assigned to:

```ts
document.stories[0]!.paragraphs = convertedParagraphs;
```

Expected: TypeScript accepts the assignment.

- [ ] **Step 2: Wire temporary Tiptap JSON state**

In `EditorShell.tsx`, keep Tiptap JSON in local state only on spike branch:

```ts
const [tiptapJson, setTiptapJson] = useState<unknown | null>(null);
```

Then derive a temporary project for preview:

```ts
const previewInputState = useMemo(() => {
  if (!USE_TIPTAP_SPIKE || !tiptapJson) return present;
  const next = structuredClone(present);
  const story = mainStory(next);
  if (!story) return present;
  story.paragraphs = tiptapJsonToPreloParagraphs(tiptapJson, BLANK_BODY_STYLE_ID);
  return next;
}, [present, tiptapJson]);
```

Use `previewInputState` for `paginateWithEngine`.

- [ ] **Step 3: Run tests**

Run:

```bash
cd diagramador
npm test -- src/editor/tiptap-adapter.test.ts src/editor/engine-adapter.test.ts
npm run build
npm run lint
```

Expected: all pass.

- [ ] **Step 4: Commit conversion-to-preview spike**

Run:

```bash
git add diagramador/src/product/EditorShell.tsx diagramador/src/editor/tiptap-adapter.ts diagramador/src/editor/tiptap-adapter.test.ts
git commit -m "feat: preview prelo layout from tiptap content"
```

---

## Task 6: Manual Evaluation Checklist

**Files:**

- Create: `docs/tiptap-spike-evaluation.md`

- [ ] **Step 1: Create evaluation doc**

Create `docs/tiptap-spike-evaluation.md`:

```md
# Tiptap Spike Evaluation

## Test Text

Use the same Portuguese manuscript that exposed bad line breaks in Prelo.

## Checks

- [ ] Typing feels immediate.
- [ ] Pasting long text does not freeze the editor.
- [ ] Toolbar basics work: heading, bold, italic, underline, alignment.
- [ ] Tiptap JSON converts to Prelo paragraphs.
- [ ] Prelo preview paginates the converted story.
- [ ] Export PDF works through Prelo.
- [ ] Exported PDF has correct MediaBox/BleedBox/TrimBox.
- [ ] Exported PDF text extraction does not show artificial mid-word hyphens.
- [ ] Image frames and text-wrap still belong to Prelo, not Tiptap.

## Findings

Record:

- Typing quality:
- Conversion problems:
- Preview/PDF mismatch:
- Performance:
- Recommendation:
```

- [ ] **Step 2: Run app**

Run:

```bash
cd diagramador
npm run dev
```

Open local URL shown by Vite.

- [ ] **Step 3: Test manually**

Use:

- same long text from prior screenshots;
- a heading;
- bold/italic/underline;
- justified paragraph;
- export PDF.

- [ ] **Step 4: Inspect PDF**

Run:

```bash
pdfinfo -box "/path/to/exported.pdf"
pdftotext -layout "/path/to/exported.pdf" -
pdftoppm -png -f 1 -l 2 "/path/to/exported.pdf" /tmp/prelo-tiptap-page
```

Expected:

- Boxes are physically correct.
- Extracted text has no artificial persistent hyphen artifacts.
- Rendered PNG visually matches Prelo preview, not necessarily Tiptap writing surface.

- [ ] **Step 5: Commit evaluation doc**

Run:

```bash
git add docs/tiptap-spike-evaluation.md
git commit -m "docs: record tiptap spike evaluation"
```

---

## Task 7: Decide And Report

**Files:**

- Modify: `docs/tiptap-spike-evaluation.md`
- Optional modify: `CLAUDE-HANDOFF-PRELO.md`

- [ ] **Step 1: Fill recommendation**

Use one of:

```text
Recommendation: adopt Tiptap as writing surface.
Recommendation: reject Tiptap for now.
Recommendation: delay; keep branch for further testing.
```

- [ ] **Step 2: Push branch**

Run:

```bash
git push
```

- [ ] **Step 3: If adoption is recommended, do not merge yet**

Before merge, write a separate implementation plan:

```text
Tiptap Writing Surface Integration Plan
```

That plan must include:

- toolbar command mapping;
- document schema;
- conversion to Prelo styles;
- paste normalization;
- undo/redo strategy;
- interaction with pages/preview;
- image handling as Prelo `ImageFrame`;
- PDF/preview fidelity gate.

---

## Final Decision Rule

Adopt Tiptap only if it improves writing UX without weakening this rule:

```text
Prelo layout is the proof.
Prelo PDF is the product.
Tiptap is only the writing instrument.
```

