# Prelo Foundation Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the Prelo foundation so the project compiles, has tests for core text flow behavior, uses clearer print-oriented units, and stops overstating unimplemented features.

**Architecture:** Keep the existing React/TypeScript app and engine boundaries, but make the engine testable and deterministic enough for the next print/PDF spikes. Do not implement the whole book engine in this pass; fix the foundation that future print-ready work depends on.

**Tech Stack:** React, TypeScript, Vite, Canvas 2D, opentype.js, tex-linebreak, hypher, Vitest.

---

### Task 1: Baseline diagnostics

**Files:** inspect package/config/source files only.

- [ ] Run build and lint to capture failures.
- [ ] Inspect TypeScript config and current declarations.
- [ ] Identify root causes before edits.

### Task 2: Test harness

**Files:**
- Modify: `diagramador/package.json`
- Create: `diagramador/src/engine/*.test.ts`
- Create or modify test setup only if needed.

- [ ] Add a test runner.
- [ ] Write failing tests for line breaking/frame filling behavior.
- [ ] Verify tests fail for the right reason before production changes.

### Task 3: Engine build fixes

**Files:**
- Modify: `diagramador/src/engine/types.ts`
- Modify: `diagramador/src/engine/line-breaker.ts`
- Modify: `diagramador/src/engine/frame-filler.ts`
- Modify: `diagramador/src/types-libs.d.ts`
- Modify: `diagramador/src/fonts/*.ts`

- [ ] Fix TypeScript incompatibilities.
- [ ] Preserve behavior covered by tests.
- [ ] Run targeted tests after each fix.

### Task 4: Print unit foundation

**Files:**
- Modify or create model/print unit helpers.
- Modify presets if needed.

- [ ] Add explicit physical unit helpers/conversions.
- [ ] Fix KDP bleed margin inconsistency.
- [ ] Add tests for conversion and print profile basics.

### Task 5: Plan/status correction

**Files:**
- Modify: `arquitetura-motor.html` if practical.

- [ ] Replace overconfident status language with evidence-based status.
- [ ] Reframe next phase around physical engine/PDF/preflight spikes.

### Task 6: Verification

- [ ] Run unit tests.
- [ ] Run build.
- [ ] Run lint.
- [ ] Report exact remaining gaps.

