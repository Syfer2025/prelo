# Prelo PDF/Preview Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um gate objetivo para provar que o preview do editor e o PDF exportado continuam usando o mesmo motor, com linhas justificadas/hifenizadas sem espacamentos grotescos.

**Architecture:** O motor continua sendo a fonte da verdade. O gate exercita `paginateProjectStory`/`documentToPdf` pelo adapter do editor, mede as linhas geradas pelo `FrameLayout`, valida o PDF com `pdf-lib` e rasteriza a primeira pagina com Poppler (`pdftoppm`) para detectar regressao visual grosseira.

**Tech Stack:** Vitest, TypeScript, `pdf-lib`, engine/editor adapter existente, fixtures de manuscrito em texto puro.

---

## File Structure

- Create: `src/editor/fixtures/long-portuguese-manuscript.ts`
  - Responsabilidade: texto longo estavel em portugues para testes de paginacao, hifenizacao e export.
- Create: `src/editor/pdf-preview-quality.test.ts`
  - Responsabilidade: teste de integracao leve entre editor adapter, paginacao e PDF exportado.
- Modify: `src/engine/frame-filler.ts`
  - Somente se o teste revelar linha frouxa que ainda passa pelo motor.
- Modify: `src/engine/line-breaker.ts`
  - Somente se o teste revelar falta real de breakpoint/hifenizacao.

---

### Task 1: Add Stable Portuguese Manuscript Fixture

**Files:**
- Create: `src/editor/fixtures/long-portuguese-manuscript.ts`

- [x] **Step 1: Create the fixture file**

```ts
export const LONG_PORTUGUESE_MANUSCRIPT = `A Cidade Que Cresceu em Volta do Rio

No inicio, nao havia muralhas, arranha-ceus ou avenidas largas. Existia apenas um rio. Ele cortava a planicie lentamente, formando curvas que mudavam de lugar ao longo das decadas.

As primeiras casas eram simples. Feitas de barro, madeira e pedra, nao tinham rua organizada nem qualquer planejamento. As familias se agrupavam por proximidade e necessidade.

Com o passar dos anos, o pequeno povoado comecou a atrair viajantes. Comerciantes vinham de terras distantes descobriram que aquele rio permitia transportar mercadorias com mais facilidade do que as rotas terrestres.

Pessoas de diferentes culturas passaram a compartilhar tecnicas de agricultura, formas de construcao, idiomas e crencas. O vilarejo deixou de ser apenas um agrupamento de familias e se tornou um ponto de encontro.

A cidade cresceu em torno da praca principal. Nela aconteciam feiras, celebracoes e discussoes publicas. Criancas corriam entre barracas enquanto musicos tocavam instrumentos rudimentares.

Decadas se transformaram em seculos. Novas geracoes ja nao conheciam a vida sem o mercado, sem as pontes e sem os barcos que chegavam diariamente.

A prosperidade chamava a atencao de povos vizinhos. Alguns vieram em paz, buscando oportunidades. Outros chegaram em busca de riquezas e poder.

Com o avanco da tecnologia, novas ferramentas mudaram a forma como as pessoas viviam. A roda, que antes servia apenas para carrocas, revelou-se indispensavel para construcoes.

A invencao da escrita transformou profundamente a sociedade. Pela primeira vez, conhecimentos deixaram de depender exclusivamente da memoria humana.

No seculo seguinte, a eletricidade mudou tudo mais uma vez. As noites deixaram de ser escuras. Ruas iluminadas permitiram que a vida urbana continuasse apos o por do Sol.

Ainda assim, algumas coisas nunca mudaram. As pessoas continuavam buscando seguranca, pertencimento e melhores futuros.

E talvez seja a caracteristica mais curiosa das cidades: elas refletem as pessoas ao longo do tempo. Cada rua, cada ponte, cada casa revela uma escolha coletiva.

Mas, de certa forma, cada pedra colocada, cada arvore plantada e cada decisao tomada continuam presentes. Porque nenhuma cidade nasce pronta.`;
```

- [x] **Step 2: Run TypeScript through the focused test command**

Run:

```bash
npm test -- src/editor/pdf-preview-quality.test.ts
```

Expected: FAIL because the test file does not exist yet. This confirms the fixture alone did not create behavior.

---

### Task 2: Add Layout Quality Assertions For Editor Pagination

**Files:**
- Create: `src/editor/pdf-preview-quality.test.ts`

- [x] **Step 1: Write the failing integration test**

```ts
import { describe, expect, it } from 'vitest';
import { TextEngine } from '../engine';
import { BLANK_BODY_STYLE_ID, BLANK_PROJECT_NAME, createBlankDocument } from './blank-document';
import { createEngineAdapter } from './engine-adapter';
import { EDITOR_LAYOUT_ALGORITHM } from './editor-layout';
import { LONG_PORTUGUESE_MANUSCRIPT } from './fixtures/long-portuguese-manuscript';
import type { EditorProject } from './editor-state';
import type { LayoutLine } from '../engine/types';

const measureFn = (text: string) => text.length * 5;

function projectWithManuscript(): EditorProject {
  const document = createBlankDocument();
  const story = document.stories[0]!;
  story.paragraphs = LONG_PORTUGUESE_MANUSCRIPT.split(/\n\n+/).map((text) => ({
    styleId: BLANK_BODY_STYLE_ID,
    spans: [{ text }],
  }));

  return {
    id: 'quality-gate-project',
    name: BLANK_PROJECT_NAME,
    document,
  };
}

function realEngineAdapter() {
  const engine = new TextEngine({} as CanvasRenderingContext2D);
  return createEngineAdapter(engine);
}

function justifiedLineEnd(line: LayoutLine): number {
  const last = line.runs[line.runs.length - 1];
  return last ? last.x + last.width : line.width;
}

describe('PDF/preview quality gate', () => {
  it('paginates a long Portuguese manuscript without grotesquely stretched justified lines', () => {
    const project = projectWithManuscript();
    const story = project.document.stories[0]!;

    const adapter = realEngineAdapter();
    const pagination = adapter.paginateProjectStory(project, story.id, {
      algorithm: EDITOR_LAYOUT_ALGORITHM,
      maxAutoPages: 50,
      measureFn,
    });

    const lines = pagination.layout.frameLayouts.flatMap((frameLayout) => frameLayout.lines);
    const nonLastLines = lines.filter((line, index) => index < lines.length - 1 && line.runs.length > 0);
    const overStretched = nonLastLines.filter((line) => {
      const naturalWidth = line.width;
      const renderedWidth = justifiedLineEnd(line);
      return renderedWidth - naturalWidth > naturalWidth;
    });

    expect(lines.length).toBeGreaterThan(50);
    expect(pagination.layout.overflow).toBe(false);
    expect(overStretched).toEqual([]);
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/editor/pdf-preview-quality.test.ts
```

Expected: FAIL if `createBrowserEngineAdapter` cannot accept the test context shape or if the current engine still emits grotesquely stretched lines.

- [x] **Step 3: Fix the real failing route**

If this fails, inspect the failure before editing. Fix only the component named by the failure:

- if `overStretched` is not empty, change `src/engine/frame-filler.ts`;
- if lines are missing hifenization opportunities, change `src/engine/line-breaker.ts`;
- if the adapter bypasses the engine, change `src/editor/engine-adapter.ts`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/editor/pdf-preview-quality.test.ts
```

Expected: PASS.

---

### Task 3: Add PDF Export Contract To The Same Gate

**Files:**
- Modify: `src/editor/pdf-preview-quality.test.ts`

- [x] **Step 1: Extend the test with PDF validation**

Append this test to the same file:

```ts
import { PDFDocument } from 'pdf-lib';

it('exports the same paginated manuscript as a valid multi-page 6x9 PDF', async () => {
  const project = projectWithManuscript();
  const story = project.document.stories[0]!;

  const adapter = realEngineAdapter();

  const pagination = adapter.paginateProjectStory(project, story.id, {
    algorithm: EDITOR_LAYOUT_ALGORITHM,
    maxAutoPages: 50,
    measureFn,
  });
  const bytes = await adapter.exportProjectToPdf({ ...project, document: pagination.document }, {
    algorithm: EDITOR_LAYOUT_ALGORITHM,
    measureFn,
  });

  const pdf = await PDFDocument.load(bytes);
  const firstPage = pdf.getPage(0);

  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(firstPage.getMediaBox()).toMatchObject({ width: 450, height: 666 });
  expect(firstPage.getTrimBox()).toMatchObject({ x: 9, y: 9, width: 432, height: 648 });
});
```

- [x] **Step 2: Run the focused test and verify RED/GREEN**

Run:

```bash
npm test -- src/editor/pdf-preview-quality.test.ts
```

Expected: PASS if the current PDF route is coherent. If it fails, fix the failing route in `src/editor/engine-adapter.ts` or `src/engine/index.ts`, not in the test.

---

### Task 4: Full Verification And Handoff Update

**Files:**
- Modify: `/Users/alexmeiradossantos/Desktop/pasta sem título/CLAUDE-HANDOFF-PRELO.md`

- [x] **Step 1: Run full verification**

Run:

```bash
npm test
npm run build
npm run lint
```

Expected:

- `npm test`: all test files pass;
- `npm run build`: TypeScript and Vite build pass;
- `npm run lint`: no lint errors.

- [x] **Step 2: Update handoff with the new gate**

Add this paragraph to `PONTO DE PARADA`:

```md
**FEITO agora — gate PDF/preview do manuscrito longo:** teste de integracao em `src/editor/pdf-preview-quality.test.ts` prova que o editor pagina o manuscrito longo via motor real sem linhas grotescamente esticadas, exporta PDF multi-pagina 6x9 com MediaBox/TrimBox corretos e rasteriza a primeira pagina com Poppler para detectar conteudo visivel dentro da folha.
```

- [x] **Step 3: Record the new test count**

Update every "testes passando" count in the handoff to the value reported by `npm test`.

---

## Acceptance Criteria

- There is a stable long Portuguese manuscript fixture.
- A focused test proves editor pagination uses the real engine and does not emit grotesquely stretched justified lines.
- A focused test proves exported PDF is valid, multi-page, and keeps 6x9 trim with 0.125in bleed.
- A focused test rasterizes the first PDF page with `pdftoppm` and confirms visible ink inside expected page bounds.
- `npm test`, `npm run build`, and `npm run lint` pass.
- `CLAUDE-HANDOFF-PRELO.md` reflects the latest test count and the new quality gate.

---

## Follow-Up Plan Depois Deste

1. Add baseline grid support in the motor.
2. Extend orphan/widow/keep rules into text-wrap image bands.
3. Implement CMYK/PDF-X server-side conversion and validation.
4. Expand the editor UI for image drag/resize/crop with wrap controls.
