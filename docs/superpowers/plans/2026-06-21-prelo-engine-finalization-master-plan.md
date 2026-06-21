# Prelo Engine Finalization Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to split each phase below into its own implementation plan before coding. For execution, use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Prelo engine to a level where a first commercial MVP can honestly generate physical book PDFs for simple print projects.

**Architecture:** Keep Prelo as the single source of truth for physical layout. The editor may use native DOM or a rich-text library for input, but final preview and PDF must both come from Prelo layout data. Do not replace the engine with Tiptap, Paged.js, Vivliostyle, ONLYOFFICE, or any other external editor.

**Tech Stack:** TypeScript, React, Vite, Vitest, `pdf-lib`, `@pdf-lib/fontkit`, `opentype.js`, `hypher`, `tex-linebreak`, Poppler (`pdfinfo`, `pdftoppm`, `pdftotext`), Ghostscript for future PDF/X/CMYK work.

---

## Current Baseline

Verified baseline at the time of this plan:

- `npm test`: 26 files, 200 tests passing.
- `npm run build`: passing.
- `npm run lint`: passing.
- App URL currently used in the desktop browser: `http://127.0.0.1:60634/`.

Already implemented:

- Physical pages with trim/bleed boxes.
- Chained text frames.
- Story to document layout path via `flowStory` / `paginateStory`.
- Portuguese hyphenation.
- Knuth-Plass based line breaking.
- Justification via positioned runs.
- Orphans, widows, keep-together, page-break-before, keep-with-next on the normal text path.
- Baseline grid approximation.
- PDF export with embedded TTF.
- Basic image DPI and bleed preflight.
- Image text-wrap by bounding-box, alpha mask, and polygon geometry.
- Basic cover/spine calculation and technical cover PDF.
- Initial product editor shell and lab mode.
- Performance fix for large text pagination.
- Immediate native typing feedback while engine preview updates after debounce.

Core principle for the remaining work:

```text
Typing surface can be approximate.
Prelo preview must be authoritative.
Exported PDF must match Prelo preview.
Preflight must block files that are unsafe for print.
```

---

## Definition Of Done For "Motor Vendavel Basico"

The engine is not considered ready until all items below are true:

- [ ] Preview final and exported PDF are generated from the same `LayoutResult` or an explicitly equivalent frozen layout object.
- [ ] A long Portuguese manuscript exports without artificial hyphens inside words, single-word bad lines in normal body text, grotesque spaces, blank accidental pages, or text overflow.
- [ ] PDF internal boxes are correct for every supported book preset: MediaBox, BleedBox, TrimBox.
- [ ] Fonts used in the document are embedded or the export is blocked.
- [ ] Images below required DPI are flagged.
- [ ] Images touching trim without bleed are blocked or warned according to severity.
- [ ] Exported internal book PDF passes structural validation with Poppler and Ghostscript.
- [ ] RGB-only export is clearly labeled as non-final, or PDF/X/CMYK export is implemented and validated.
- [ ] The engine has fixtures for at least: fiction, nonfiction, poetry, illustrated book, academic/textbook, and children's book.
- [ ] Automated tests cover the above fixtures.

---

## Non-Goals Until The Engine Is Stable

Do not spend major work on these before the core engine gates pass:

- Full SaaS login/account/billing.
- AI writing features.
- Marketplace/templates business flow.
- Full collaborative editing.
- Tiptap migration.
- ONLYOFFICE integration.
- Polished marketing site.

Small UI changes are allowed only when they expose or verify engine behavior.

---

## Phase 0: Freeze The Engine Contract

**Purpose:** Prevent the project from becoming two separate systems: one for preview and another for PDF.

**Primary files:**

- `diagramador/src/engine/types.ts`
- `diagramador/src/engine/index.ts`
- `diagramador/src/engine/pdf-export.ts`
- `diagramador/src/render/canvas-renderer.ts`
- `diagramador/src/editor/engine-adapter.ts`

**Tasks:**

- [ ] Define a frozen `ComposedDocument` or equivalent contract that contains pages, frames, lines, runs, images, and physical boxes.
- [ ] Make preview consume this contract.
- [ ] Make PDF export consume this contract.
- [ ] Add a test proving PDF export does not recompute text layout differently from preview.
- [ ] Add a regression test for the latest attached PDF class of bugs: no persisted artificial hyphens inside reflowed words.

**Acceptance criteria:**

- Preview and PDF share a single layout artifact.
- A test fails if PDF export calls a different layout path and produces different line text or positions.

**Risk if skipped:** The product may show one result and export another, which makes it unsafe to sell.

---

## Phase 1: Visual And Structural PDF Quality Gate

**Purpose:** Create a repeatable gate that says whether a generated PDF is physically and visually sane.

**Primary files:**

- `diagramador/src/editor/pdf-preview-quality.test.ts`
- `diagramador/src/editor/fixtures/long-portuguese-manuscript.ts`
- New fixtures under `diagramador/src/editor/fixtures/`
- Optional helper: `diagramador/src/editor/pdf-quality-gate.ts`

**Tasks:**

- [ ] Add fixtures for multiple book categories: fiction, nonfiction, poetry, academic/textbook, illustrated, children's.
- [ ] Export every fixture through `documentToPdf`.
- [ ] Validate PDF boxes using `pdf-lib` and/or `pdfinfo`.
- [ ] Render selected pages using `pdftoppm`.
- [ ] Detect blank pages, text outside trim, text outside safe area, and unexpected empty final pages.
- [ ] Extract text with `pdftotext -layout` to catch artificial hyphens and split words.
- [ ] Store thresholds in code, not in human judgment.

**Acceptance criteria:**

- `npm test -- src/editor/pdf-preview-quality.test.ts` catches:
  - blank PDF;
  - wrong page size;
  - wrong trim/bleed;
  - invisible text;
  - text outside page;
  - persisted artificial hyphen patterns;
  - accidental empty final pages.

**Risk if skipped:** Every later change can silently break PDF quality.

---

## Phase 2: Text Composition Quality

**Purpose:** Move from "text fits" to "text looks like a professionally composed book".

**Primary files:**

- `diagramador/src/engine/line-breaker.ts`
- `diagramador/src/engine/frame-filler.ts`
- `diagramador/src/engine/line-breaker.test.ts`
- `diagramador/src/engine/frame-filler.test.ts`
- New helper: `diagramador/src/engine/line-quality.ts`

**Tasks:**

- [ ] Implement a line quality scorer for body text.
- [ ] Penalize single-word body lines when avoidable.
- [ ] Penalize excessive word spacing.
- [ ] Penalize excessive consecutive hyphenated lines.
- [ ] Penalize very loose lines before short words.
- [ ] Add minimum/maximum acceptable stretch thresholds per paragraph style.
- [ ] Add tests for Portuguese manuscript cases that previously created bad lines such as isolated `nomes` or `possivel`.
- [ ] Keep emergency behavior for impossible frames and impossible words.

**Acceptance criteria:**

- Long body text does not produce avoidable one-word lines in normal 6x9 body frames.
- Justified lines do not exceed configured spacing limits.
- Hyphenation improves composition without producing repeated ugly hyphenation.
- Existing 200 tests remain green.

**Risk if skipped:** PDFs may be technically valid but visually amateur.

---

## Phase 3: Real Font Metrics And Shaping Strategy

**Purpose:** Reduce mismatch between browser/canvas/PDF and make text measurement reliable enough for print.

**Primary files:**

- `diagramador/src/fonts/font-metrics.ts`
- `diagramador/src/fonts/font-registry.ts`
- `diagramador/src/engine/shaper.ts`
- `diagramador/src/engine/pdf-export.ts`
- `diagramador/src/engine/frame-filler.ts`
- `diagramador/src/fonts/font-registry.test.ts`

**Tasks:**

- [ ] Use real font ascent/descent for line box and baseline grid instead of `fontSize * 0.8`.
- [ ] Add tests comparing measured widths against known font metrics for Crimson Text and EB Garamond.
- [ ] Decide whether current `opentype.js` measurement is enough for MVP.
- [ ] Run a HarfBuzz/rustybuzz spike for kerning, ligatures, combining marks, and complex scripts.
- [ ] If HarfBuzz is deferred, document the supported script/language limits for MVP.

**Acceptance criteria:**

- Baseline grid uses real font metrics for supported fonts.
- PDF line positions and preview line positions use the same measurements.
- MVP language support is explicit and tested.

**Risk if skipped:** Line breaks may shift between preview and PDF; typography may look wrong with real fonts.

---

## Phase 4: Document Structure For Real Books

**Purpose:** Support actual book structure beyond one continuous text frame.

**Primary files:**

- `diagramador/src/model/types.ts`
- `diagramador/src/model/book-presets.ts`
- `diagramador/src/engine/index.ts`
- `diagramador/src/engine/frame-filler.ts`
- New modules under `diagramador/src/model/`

**Tasks:**

- [ ] Add sections: front matter, body, back matter.
- [ ] Add master pages for left/right pages.
- [ ] Add page numbers as generated content.
- [ ] Add headers and footers.
- [ ] Add chapter starts with page-break-before and optional recto start.
- [ ] Add blank intentional pages with metadata so they are not flagged as accidental.
- [ ] Add basic table of contents generation from heading styles.
- [ ] Defer footnotes unless required for the first sellable category; if included, create a separate plan because footnotes affect layout deeply.

**Acceptance criteria:**

- A fiction template can generate front matter, chapter starts, body pages, and page numbers.
- Intentional blank pages are distinguishable from accidental blank pages.
- Page numbering respects front matter/body numbering rules.

**Risk if skipped:** The product can export pages, but not a complete book.

---

## Phase 5: Images, Text Wrap, And Image Preflight Productionization

**Purpose:** Turn the current image/wrap engine into a production-safe print feature.

**Primary files:**

- `diagramador/src/model/text-wrap.ts`
- `diagramador/src/model/image-checks.ts`
- `diagramador/src/model/preflight.ts`
- `diagramador/src/engine/frame-filler.ts`
- `diagramador/src/engine/pdf-export.ts`
- `diagramador/src/render/canvas-renderer.ts`

**Tasks:**

- [ ] Keep images as Prelo `ImageFrame` objects, not as rich-text editor image nodes.
- [ ] Add image frame crop metadata tests.
- [ ] Validate DPI after crop and physical scaling.
- [ ] Validate bleed when image touches trim.
- [ ] Validate safe-area warnings for important image content.
- [ ] Extend orphans/widows/keeps to text-wrap path or explicitly block those rules when wrap is active.
- [ ] Add fixtures with alpha-channel wrap, polygon wrap, left/right/both/largest sides.
- [ ] Add PDF render tests confirming bitmap position and text avoidance match preview.

**Acceptance criteria:**

- Image wrap works in preview and PDF from the same layout artifact.
- Low-DPI images are caught.
- Missing bleed is caught.
- Text does not overlap image masks in tested fixtures.

**Risk if skipped:** Image-heavy books will fail in print or export differently from preview.

---

## Phase 6: Print-Ready PDF Pipeline

**Purpose:** Move from "PDF opens" to "PDF can be submitted to a printer with known limits".

**Primary files:**

- `diagramador/src/engine/pdf-export.ts`
- `diagramador/src/engine/pdf-layout.ts`
- `diagramador/src/model/print-profiles.ts`
- `diagramador/src/model/preflight.ts`
- New module: `diagramador/src/engine/pdfx-export.ts` or server-side equivalent.

**Tasks:**

- [ ] Define export levels:
  - Preview PDF: RGB, fast, for user review.
  - Print PDF: print profile validated, all boxes correct.
  - PDF/X CMYK: server-side or CLI pipeline with OutputIntent.
- [ ] Add Ghostscript conversion spike for PDF/X-1a or PDF/X-4.
- [ ] Add ICC profile handling.
- [ ] Add validation command documentation using Ghostscript and, if available, veraPDF.
- [ ] Decide what runs in browser and what must run server-side.
- [ ] Add tests that fail when fonts are not embedded.
- [ ] Add tests that fail when trim/bleed/media boxes are wrong.

**Acceptance criteria:**

- For MVP, the system clearly labels whether the file is preview-only or print-ready.
- Print-ready export has deterministic validation commands.
- Unsupported print requirements block export instead of silently producing unsafe files.

**Risk if skipped:** The product may sell PDFs that printers reject.

---

## Phase 7: Preflight Profiles And Blocking Rules

**Purpose:** Make export decisions deterministic instead of subjective.

**Primary files:**

- `diagramador/src/model/preflight.ts`
- `diagramador/src/model/print-profiles.ts`
- `diagramador/src/model/book-presets.ts`
- `diagramador/src/model/preflight.test.ts`

**Tasks:**

- [ ] Split preflight severities into `error`, `warning`, and `info`.
- [ ] Add printer profile capabilities: min DPI, bleed required, color mode, max ink if known, allowed trim sizes, min margins.
- [ ] Add blocking export rules for errors.
- [ ] Add user-facing messages for each preflight code.
- [ ] Add tests for every preflight code.
- [ ] Add fixtures that intentionally fail each rule.

**Acceptance criteria:**

- Export is blocked for known fatal print issues.
- Warnings are visible but do not block unless the profile says so.
- Every preflight code is test-covered.

**Risk if skipped:** Users can export broken files without knowing.

---

## Phase 8: Templates That Prove The Engine

**Purpose:** Validate the engine against real product categories, not synthetic examples.

**Primary files:**

- `diagramador/src/model/book-presets.ts`
- `diagramador/src/demo-document.ts`
- `diagramador/src/editor/fixtures/`
- New fixtures/templates under `diagramador/src/templates/` if needed.

**Tasks:**

- [ ] Create a simple fiction template.
- [ ] Create a nonfiction template with headings.
- [ ] Create a poetry template with preserved line breaks and spacing rules.
- [ ] Create an illustrated book template with images and wrap.
- [ ] Create an academic/textbook template with headings and figure blocks.
- [ ] Create a children's book template with image-heavy pages.
- [ ] Add export tests for each template.

**Acceptance criteria:**

- Each template exports a valid multi-page PDF.
- Each template passes the PDF quality gate.
- Template-specific constraints are documented.

**Risk if skipped:** The engine may pass unit tests but fail actual user use cases.

---

## Phase 9: Performance And Incremental Layout

**Purpose:** Keep editing usable as books grow.

**Primary files:**

- `diagramador/src/engine/index.ts`
- `diagramador/src/product/EditorShell.tsx`
- `diagramador/src/editor/engine-adapter.ts`
- New worker module if needed: `diagramador/src/editor/layout-worker.ts`

**Tasks:**

- [ ] Measure current pagination time for 10, 50, 100, and 200 pages.
- [ ] Add performance regression tests for `paginateStory` iteration counts.
- [ ] Cache shaped paragraphs by text/style hash.
- [ ] Recompose from the first affected paragraph/frame instead of the entire book.
- [ ] Move expensive pagination to Web Worker if main-thread pauses remain visible.
- [ ] Add cancellation for stale layout jobs.

**Acceptance criteria:**

- Typing remains responsive on a 100-page text-only manuscript.
- Layout jobs do not pile up while typing.
- Export still uses a final complete layout.

**Risk if skipped:** The product becomes unusable for real book-length manuscripts.

---

## Phase 10: Editor Integration Boundary

**Purpose:** Allow future Tiptap or another editor without corrupting the engine.

**Primary files:**

- `diagramador/src/editor/editor-state.ts`
- `diagramador/src/editor/engine-adapter.ts`
- `diagramador/src/editor/components/EditablePage.tsx`
- Future optional module: `diagramador/src/editor/rich-text-adapter.ts`

**Tasks:**

- [ ] Define `EditorContent -> Prelo Story` as the only allowed path from editor to engine.
- [ ] Keep images, frames, pages, crop, and text-wrap as Prelo document objects.
- [ ] Do not store page breaks from Tiptap/native editor as authoritative layout.
- [ ] If Tiptap is tested, implement it as a spike behind an adapter and keep `EditablePage` until the spike passes.
- [ ] Add conversion tests from editor content to `Story.paragraphs`.

**Acceptance criteria:**

- The engine can run without the editor UI.
- The editor UI can change without changing PDF rules.
- No image wrap or page layout state is owned by Tiptap/native contenteditable.

**Risk if skipped:** The project becomes a patchwork of editor state and engine state.

---

## Execution Order

Execute in this order:

1. Phase 0: Freeze layout contract.
2. Phase 1: PDF quality gate.
3. Phase 2: Text composition quality.
4. Phase 6 and Phase 7 together: print PDF and preflight.
5. Phase 4: real book structure.
6. Phase 5: production image handling.
7. Phase 8: templates.
8. Phase 9: performance.
9. Phase 10: optional editor library boundary/spike.

Reasoning:

- If preview and PDF do not match, nothing else matters.
- If PDF cannot be validated, the product cannot sell print files.
- If text composition is ugly, the product fails its core promise.
- UI/editor library work should not precede engine correctness.

---

## Commercial MVP Cut Line

The first paid MVP should target only this:

- Text-heavy fiction/nonfiction books.
- Fixed trim presets.
- Limited fonts.
- Simple chapter structure.
- Basic images allowed only if preflight passes.
- PDF export with clear print-profile limits.

Do not promise:

- Complex magazines.
- Full children's book layout freedom.
- Academic footnotes/endnotes if not implemented.
- Arbitrary typography.
- Guaranteed acceptance by every printer.
- CMYK/PDF-X unless Phase 6 is complete.

---

## Immediate Next Plan To Write

Write a specific implementation plan for:

```text
Phase 0 + Phase 1: shared layout artifact and PDF/preview quality gate hardening
```

This is the correct next step because it establishes the truth contract:

```text
Prelo layout artifact -> Preview
Prelo layout artifact -> PDF
Automated gate proves both are physically sane
```

Only after that should the project continue to line-quality tuning, PDF/X, images, or editor-library experiments.

