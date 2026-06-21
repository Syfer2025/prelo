# Text Wrap Motor Implementation Plan

> **STATUS 2026-06-20: CONCLUIDO.** Tasks 1-6 implementadas com TDD. `npm test` 139 verdes,
> build e lint OK. `computeBandIntervals` (multi-intervalo) + `sides` real + `polygon` pela mesma
> API; frame-filler emite multiplos fragmentos no mesmo `y`; integracao `flowStory` testada.
> `computeBandInterval` (singular) mantido intacto p/ compat (nao refatorado em wrapper — os 4
> testes originais passam sem alteracao). Smoke visual ao vivo (`npm run dev`) NAO executado para
> economizar tokens: os renderers nao mudaram estruturalmente e os caminhos demo/alpha/PDF estao
> cobertos por testes verdes + build. Detalhes no `CLAUDE-HANDOFF-PRELO.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Prelo's image text-wrap engine from one free band per line to multiple free intervals per line, so images can sit left, right, center, or use alpha/polygon contours without blocking the whole image rectangle.

**Architecture:** Keep this task inside the motor. Do not build the Canva-style drag/drop UI in this pass. First make the pure geometry and frame filler capable of producing correct layout; the existing canvas/PDF renderers should consume the resulting `LayoutLine[]` without special cases because they already draw each line/run by coordinates.

**Tech Stack:** TypeScript, Vitest, React/Vite app only for smoke preview, existing modules `src/model/text-wrap.ts`, `src/engine/frame-filler.ts`, `src/engine/index.ts`.

---

## Prompt Para Claude Code

Use este prompt se estiver transferindo o trabalho para outro agente:

```text
Voce esta assumindo o Prelo em /Users/alexmeiradossantos/Desktop/pasta sem título/diagramador.

Objetivo: evoluir o motor de text-wrap de imagem. Hoje ele ja suporta bounding-box e alpha-channel, mas so calcula UM intervalo livre por linha (`computeBandInterval`). Isso funciona para imagem grudada na esquerda/direita, mas nao serve para imagem no meio da pagina com texto dos dois lados.

Execute o plano em docs/superpowers/plans/2026-06-20-text-wrap-motor.md com TDD estrito:
- teste falhando primeiro;
- menor implementacao;
- npm test do arquivo afetado;
- suite/build/lint ao final.

Nao implemente UI estilo Canva neste ciclo. Nao implemente upload/drag-drop agora. O escopo e o motor: multi-intervalo, sides (`left`, `right`, `both`, `largest`), alpha e polygon convergindo para a mesma API. Preview/PDF so devem continuar funcionando por receberem mais `LayoutLine`s posicionadas.
```

---

## Estado Atual Que O Agente Deve Assumir

- `src/model/text-wrap.ts`
  - Existe `computeBandInterval(frameWidth, bandTop, bandBottom, obstacles): BandInterval`.
  - Existe `obstaclesForTextFrame(textFrame, candidateFrames, { masksByFrameId })`.
  - `alpha-channel` ja usa `AlphaMask` quando fornecida; sem mascara cai para bounding-box.
  - Limitacao atual: o algoritmo escolhe apenas o maior lado livre. Imagem central nao permite texto dos dois lados.

- `src/engine/frame-filler.ts`
  - Quando ha obstaculos de wrap, ele calcula um `band` por linha e quebra a linha naquela largura.
  - Banda totalmente bloqueada avanca `currentY` sem perder texto.
  - Limitacao atual: uma linha fisica so recebe uma caixa de texto. Para `sides:'both'`, precisamos permitir duas ou mais linhas logicas no mesmo `y`.

- `src/model/types.ts`
  - `TextWrapConfig` ja tem:
    - `mode: 'none' | 'bounding-box' | 'polygon' | 'alpha-channel'`
    - `offset`
    - `sides: 'both' | 'left' | 'right' | 'largest'`
    - `alphaThreshold`
    - `polygon?: { x: number; y: number }[]`

- Verificacao anterior nesta sessao:
  - `npm test`: 18 arquivos, 124 testes passando
  - `npm run build`: passou
  - `npm run lint`: passou

---

## Escopo

### Dentro Deste Plano

- Criar API pura `computeBandIntervals(...)`.
- Manter `computeBandInterval(...)` como wrapper de compatibilidade.
- Implementar semantica real de `sides`.
- Fazer `polygon` gerar intervalo ocupado por banda.
- Fazer o frame filler preencher varios intervalos no mesmo `y` quando permitido.
- Garantir que preview/PDF continuam consumindo o layout sem mudancas estruturais.

### Fora Deste Plano

- Upload de imagem.
- Drag/drop no canvas.
- Resize handles estilo Canva.
- Crop UI.
- Rotacao visual.
- Edicao visual de poligono.
- Persistencia de assets no backend.

Esses itens dependem deste plano, mas devem ser um plano separado.

---

## Decisoes Tecnicas

### 1. Nova API de geometria

Adicionar:

```ts
export function computeBandIntervals(
  frameWidth: number,
  bandTop: number,
  bandBottom: number,
  obstacles: WrapRect[]
): BandInterval[]
```

Regras:

- Sem obstaculo: retorna `[{ x: 0, width: frameWidth }]`.
- Obstaculos que nao cruzam a banda vertical sao ignorados.
- Obstaculos ativos geram intervalos ocupados.
- Intervalos ocupados sao unidos/sortidos antes de subtrair da largura total.
- Resultado nunca tem `width <= 0`.
- Resultado sempre fica dentro de `[0, frameWidth]`.

Manter:

```ts
export function computeBandInterval(...): BandInterval
```

como wrapper:

- chama `computeBandIntervals(...)`;
- se houver mais de um intervalo, retorna o maior;
- preserva os testes atuais.

### 2. Semantica de `sides`

`WrapRect` deve carregar `sides`:

```ts
export interface WrapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  offset?: number;
  mask?: AlphaMask;
  sides?: 'both' | 'left' | 'right' | 'largest';
  polygon?: { x: number; y: number }[];
}
```

Semantica por banda:

- `both`: texto pode ocupar todos os intervalos livres.
- `left`: texto so pode ocupar o intervalo livre antes do bloco ocupado da imagem.
- `right`: texto so pode ocupar o intervalo livre depois do bloco ocupado da imagem.
- `largest`: texto ocupa apenas o maior intervalo livre.

Regra pratica para multiplos obstaculos na mesma banda:

- Calcule todos os ocupados.
- Una os ocupados em blocos.
- Para `both`, subtraia todos os blocos e retorne todos os livres.
- Para `largest`, retorne apenas o maior livre.
- Para `left`, retorne livres cujo fim seja menor ou igual ao primeiro ocupado.
- Para `right`, retorne livres cujo inicio seja maior ou igual ao ultimo ocupado.

### 3. Polygon

`polygon` deve ser uma lista de pontos locais da imagem, normalizados no retangulo do frame de imagem:

```ts
[
  { x: 0.12, y: 0.10 },
  { x: 0.80, y: 0.20 }
]
```

Para v1 do motor, o poligono pode ser convertido por banda para um intervalo ocupado conservador:

- interseccione a faixa vertical da linha com o poligono;
- encontre `minX` e `maxX` dos pontos/arestas que cruzam a banda;
- converta para coordenada local do text frame;
- aplique `offset`.

Nao tente suportar multiplos intervalos internos de poligono concavo neste plano. O objetivo e permitir ajuste manual util, nao CAD.

### 4. Frame filler

O tipo `LayoutLine` nao precisa mudar agora.

Para uma linha fisica com varios intervalos livres:

- o filler pode emitir varias `LayoutLine`s com o mesmo `y`;
- cada uma tem `x` proprio e `runs` proprios;
- canvas e PDF ja desenham cada linha independentemente.

Exemplo esperado:

```ts
[
  { text: 'alpha beta', x: 0, y: 0, ... },
  { text: 'gamma', x: 140, y: 0, ... },
  { text: 'delta epsilon', x: 0, y: 15, ... }
]
```

---

## Arquivos

- Modify: `src/model/text-wrap.ts`
  - `computeBandIntervals`
  - wrapper `computeBandInterval`
  - suporte a `sides`
  - suporte a `polygon`

- Modify: `src/model/text-wrap.test.ts`
  - testes puros de multi-intervalo, sides e polygon

- Modify: `src/engine/frame-filler.ts`
  - preencher mais de um intervalo no mesmo `currentY`

- Modify: `src/engine/frame-filler.test.ts`
  - testes de linhas com mesmo `y`
  - garantir que nao perde tokens entre intervalos

- Modify: `src/engine/index.test.ts`
  - um teste de integracao `flowStory` com imagem central `sides:'both'`

- Optional Modify: `src/demo-document.ts`
  - somente se quiser demonstrar no preview uma imagem central depois dos testes do motor

---

## Task 1: Pure Geometry - Multi-Interval Bands

**Files:**
- Modify: `src/model/text-wrap.ts`
- Modify: `src/model/text-wrap.test.ts`

- [ ] **Step 1: Write failing tests for centered obstacles**

Add tests to `src/model/text-wrap.test.ts`:

```ts
describe('computeBandIntervals', () => {
  it('returns both free intervals around a centered obstacle when sides is both', () => {
    const obstacle = { x: 100, y: 0, width: 80, height: 100, sides: 'both' as const };

    expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([
      { x: 0, width: 100 },
      { x: 180, width: 120 },
    ]);
  });

  it('returns the largest interval for compatibility through computeBandInterval', () => {
    const obstacle = { x: 100, y: 0, width: 80, height: 100, sides: 'both' as const };

    expect(computeBandInterval(300, 0, 20, [obstacle])).toEqual({ x: 180, width: 120 });
  });
});
```

Also update the import:

```ts
import { computeBandInterval, computeBandIntervals, obstaclesForTextFrame } from './text-wrap';
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
npm test -- src/model/text-wrap.test.ts
```

Expected failure: `computeBandIntervals` is not exported or not defined.

- [ ] **Step 3: Implement `computeBandIntervals` minimally**

In `src/model/text-wrap.ts`:

```ts
export function computeBandIntervals(
  frameWidth: number,
  bandTop: number,
  bandBottom: number,
  obstacles: WrapRect[]
): BandInterval[] {
  const occupied = obstacles
    .map((obstacle) => occupiedIntervalForBand(obstacle, bandTop, bandBottom))
    .filter((interval): interval is { left: number; right: number } => interval !== null)
    .map((interval) => ({
      left: clamp(interval.left, 0, frameWidth),
      right: clamp(interval.right, 0, frameWidth),
    }))
    .filter((interval) => interval.right > interval.left)
    .sort((a, b) => a.left - b.left);

  if (occupied.length === 0) return [{ x: 0, width: frameWidth }];

  const merged: { left: number; right: number }[] = [];
  for (const interval of occupied) {
    const last = merged[merged.length - 1];
    if (!last || interval.left > last.right) {
      merged.push({ ...interval });
    } else {
      last.right = Math.max(last.right, interval.right);
    }
  }

  const free: BandInterval[] = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.left > cursor) free.push({ x: cursor, width: interval.left - cursor });
    cursor = Math.max(cursor, interval.right);
  }
  if (cursor < frameWidth) free.push({ x: cursor, width: frameWidth - cursor });

  return free.filter((interval) => interval.width > 0);
}
```

Then change `computeBandInterval(...)` to:

```ts
export function computeBandInterval(
  frameWidth: number,
  bandTop: number,
  bandBottom: number,
  obstacles: WrapRect[]
): BandInterval {
  const intervals = computeBandIntervals(frameWidth, bandTop, bandBottom, obstacles);
  return largestInterval(intervals) ?? { x: 0, width: 0 };
}
```

Add helper:

```ts
function largestInterval(intervals: BandInterval[]): BandInterval | null {
  let largest: BandInterval | null = null;
  for (const interval of intervals) {
    if (!largest || interval.width > largest.width) largest = interval;
  }
  return largest;
}
```

- [ ] **Step 4: Run focused test**

Run:

```bash
npm test -- src/model/text-wrap.test.ts
```

Expected: all `text-wrap` tests pass.

---

## Task 2: Pure Geometry - Wrap Sides

**Files:**
- Modify: `src/model/text-wrap.ts`
- Modify: `src/model/text-wrap.test.ts`

- [ ] **Step 1: Write failing tests for `sides`**

Add tests:

```ts
it('keeps only the left free interval when sides is left', () => {
  const obstacle = { x: 100, y: 0, width: 80, height: 100, sides: 'left' as const };

  expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([{ x: 0, width: 100 }]);
});

it('keeps only the right free interval when sides is right', () => {
  const obstacle = { x: 100, y: 0, width: 80, height: 100, sides: 'right' as const };

  expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([{ x: 180, width: 120 }]);
});

it('keeps only the largest free interval when sides is largest', () => {
  const obstacle = { x: 90, y: 0, width: 80, height: 100, sides: 'largest' as const };

  expect(computeBandIntervals(300, 0, 20, [obstacle])).toEqual([{ x: 170, width: 130 }]);
});

it('copies textWrap sides into extracted obstacles', () => {
  const image = imageFrame({
    x: 100,
    y: 0,
    width: 80,
    height: 80,
    textWrap: { mode: 'bounding-box', offset: 0, sides: 'right', alphaThreshold: 0.5 },
  });

  expect(obstaclesForTextFrame(textFrame, [image])[0]?.sides).toBe('right');
});
```

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/model/text-wrap.test.ts
```

Expected: at least the `sides` expectations fail.

- [ ] **Step 3: Implement side filtering**

In `WrapRect`, add:

```ts
sides?: 'both' | 'left' | 'right' | 'largest';
```

In `obstaclesForTextFrame(...)`, set:

```ts
sides: frame.textWrap.sides,
```

In `computeBandIntervals(...)`, after computing merged occupied intervals and free intervals, apply:

```ts
const side = dominantSide(obstacles, bandTop, bandBottom);
return filterIntervalsBySide(free, merged, side);
```

Add:

```ts
function dominantSide(
  obstacles: WrapRect[],
  bandTop: number,
  bandBottom: number
): 'both' | 'left' | 'right' | 'largest' {
  for (const obstacle of obstacles) {
    if (occupiedIntervalForBand(obstacle, bandTop, bandBottom)) {
      return obstacle.sides ?? 'largest';
    }
  }
  return 'largest';
}

function filterIntervalsBySide(
  free: BandInterval[],
  occupied: { left: number; right: number }[],
  side: 'both' | 'left' | 'right' | 'largest'
): BandInterval[] {
  if (side === 'both') return free;
  if (side === 'largest') {
    const largest = largestInterval(free);
    return largest ? [largest] : [];
  }

  const firstOccupied = occupied[0];
  const lastOccupied = occupied[occupied.length - 1];
  if (!firstOccupied || !lastOccupied) return free;

  if (side === 'left') {
    return free.filter((interval) => interval.x + interval.width <= firstOccupied.left);
  }
  return free.filter((interval) => interval.x >= lastOccupied.right);
}
```

If TypeScript complains about repeated calls to `occupiedIntervalForBand`, keep the implementation simple first; optimize after tests pass.

- [ ] **Step 4: Run focused test**

Run:

```bash
npm test -- src/model/text-wrap.test.ts
```

Expected: all `text-wrap` tests pass.

---

## Task 3: Pure Geometry - Polygon Occupied Interval

**Files:**
- Modify: `src/model/text-wrap.ts`
- Modify: `src/model/text-wrap.test.ts`

- [ ] **Step 1: Write failing polygon test**

Add:

```ts
it('uses polygon points to compute the occupied interval for a band', () => {
  const obstacle = {
    x: 50,
    y: 0,
    width: 100,
    height: 100,
    sides: 'both' as const,
    polygon: [
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  };

  expect(computeBandIntervals(220, 70, 90, [obstacle])).toEqual([
    { x: 0, width: 55 },
    { x: 145, width: 75 },
  ]);
});
```

This triangle is wide near the bottom. In band `70..90`, the conservative occupied x range should be about `55..145`.

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/model/text-wrap.test.ts
```

Expected: polygon is ignored or behaves as full rectangle.

- [ ] **Step 3: Implement polygon branch before alpha/rect branch**

In `occupiedIntervalForBand(...)`, before `if (!obstacle.mask)`, add:

```ts
if (obstacle.polygon && obstacle.polygon.length >= 3) {
  return polygonIntervalForBand(obstacle, bandTop, bandBottom);
}
```

Add helper:

```ts
function polygonIntervalForBand(
  obstacle: WrapRect,
  bandTop: number,
  bandBottom: number
): { left: number; right: number } | null {
  const polygon = obstacle.polygon;
  if (!polygon || polygon.length < 3) return null;

  const offset = obstacle.offset ?? 0;
  const sampleYs = [bandTop, (bandTop + bandBottom) / 2, bandBottom].map(
    (y) => (y - obstacle.y) / obstacle.height
  );

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const sampleY of sampleYs) {
    if (sampleY < 0 || sampleY > 1) continue;
    const intersections = polygonIntersectionsAtY(polygon, sampleY);
    for (const x of intersections) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  return {
    left: obstacle.x + min * obstacle.width - offset,
    right: obstacle.x + max * obstacle.width + offset,
  };
}

function polygonIntersectionsAtY(
  polygon: { x: number; y: number }[],
  y: number
): number[] {
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      xs.push(a.x + t * (b.x - a.x));
    }
  }
  return xs.sort((a, b) => a - b);
}
```

This is conservative. It is acceptable for v1 because text should not invade the shape.

- [ ] **Step 4: Run focused test**

Run:

```bash
npm test -- src/model/text-wrap.test.ts
```

Expected: all `text-wrap` tests pass.

---

## Task 4: Frame Filler - Fill Multiple Intervals On Same Physical Line

**Files:**
- Modify: `src/engine/frame-filler.ts`
- Modify: `src/engine/frame-filler.test.ts`

- [ ] **Step 1: Write failing frame-filler test**

Add a test near the existing text-wrap tests:

```ts
it('places text on both sides of a centered image obstacle on the same y band', () => {
  const text = frame('a', 200, 100);
  const image = imageFrame({
    x: 80,
    y: 0,
    width: 40,
    height: 30,
    textWrap: { mode: 'bounding-box', offset: 0, sides: 'both', alphaThreshold: 0.5 },
  });
  const tokens = [
    word('aa'), space(), word('bb'), space(), word('cc'), space(),
    word('dd'), space(), word('ee'), space(), word('ff'),
  ];

  const result = fillFrames(tokens, [text], {
    algorithm: 'greedy',
    measureFn: (value) => value.length * 5,
    wrapFrames: [text, image],
  });

  const lines = result.frameLayouts[0]?.lines ?? [];
  expect(lines[0]?.y).toBe(0);
  expect(lines[1]?.y).toBe(0);
  expect(lines[0]?.x).toBe(0);
  expect(lines[1]?.x).toBe(120);
  expect(lines.map((line) => line.text).join(' ')).toContain('aa');
  expect(lines.map((line) => line.text).join(' ')).toContain('ff');
});
```

The exact words per segment may vary by line breaker, but the first two segments must share `y = 0` and occupy both sides.

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/engine/frame-filler.test.ts
```

Expected: only one line at `y = 0`, or x uses largest side only.

- [ ] **Step 3: Import new geometry API**

In `src/engine/frame-filler.ts`, change import:

```ts
import { computeBandIntervals, obstaclesForTextFrame } from '../model/text-wrap';
```

- [ ] **Step 4: Replace wrapped single-band placement with interval loop**

In the `if (wrapObstacles.length > 0)` branch:

- compute `intervals = computeBandIntervals(...)`;
- if no intervals fit, advance `currentY`;
- for each interval in `intervals`, try to place one segment at current `currentY`;
- after trying all intervals for that physical line, advance `currentY` once;
- preserve `paragraphLinesPlaced`;
- preserve indent only for the first placed segment of the paragraph.

Implementation shape:

```ts
const intervals = computeBandIntervals(
  frame.width,
  currentY,
  currentY + lineHeightPx,
  wrapObstacles
);

let placedAnySegment = false;
for (const interval of intervals) {
  const isParagraphFirstLine = paragraphLinesPlaced === 0;
  const extraIndent = isParagraphFirstLine && indent > 0 ? indent : 0;
  const effectiveWidth = interval.width - extraIndent;
  if (effectiveWidth <= 0) continue;

  const rawLines = algo === 'greedy'
    ? breakParagraphGreedy(remainingTokens, effectiveWidth)
    : breakParagraphKP(remainingTokens, effectiveWidth, measureFn);
  const lines = enforceMaxLineWidth(rawLines, effectiveWidth, measureFn);
  const line = lines[0];
  if (!line) continue;

  // push LayoutLine using interval.x + extraIndent
  // update remainingTokens from unplaced lines
  // mark placedAnySegment true
  // increment paragraphLinesPlaced
}

if (placedAnySegment) {
  currentY += lineHeightPx;
  if (remainingTokens.length > 0) continue;
  break;
}

currentY += lineHeightPx;
continue;
```

Important: do not call `currentY += lineHeightPx` inside each interval. It must happen once per physical line.

- [ ] **Step 5: Run focused frame-filler test**

Run:

```bash
npm test -- src/engine/frame-filler.test.ts
```

Expected: all frame-filler tests pass.

---

## Task 5: Integration - `flowStory` With Center Image

**Files:**
- Modify: `src/engine/index.test.ts`

- [ ] **Step 1: Write integration test**

Add under `TextEngine.flowStory` tests:

```ts
it('flows story text into both sides of a centered image obstacle', () => {
  const text = textFrame('frame-a', 200, 100);
  const image = imageFrame({
    id: 'img-center',
    x: 80,
    y: 0,
    width: 40,
    height: 30,
    textWrap: { mode: 'bounding-box', offset: 0, sides: 'both', alphaThreshold: 0.5 },
  });
  const story: Story = {
    id: 'story-1',
    frameChainIds: ['frame-a'],
    paragraphs: [paragraph('aa bb cc dd ee ff gg hh ii jj kk')],
  };
  const document = documentFor(story, [text, image]);

  const result = engine().flowStory(document, 'story-1', {
    algorithm: 'greedy',
    measureFn,
  });

  const lines = result.frameLayouts[0]?.lines ?? [];
  expect(lines[0]?.y).toBe(0);
  expect(lines[1]?.y).toBe(0);
  expect(lines[0]?.x).toBe(0);
  expect(lines[1]?.x).toBe(120);
});
```

- [ ] **Step 2: Run integration test**

Run:

```bash
npm test -- src/engine/index.test.ts
```

Expected: pass after Task 4.

---

## Task 6: Verification And Handoff

**Files:**
- Modify if needed: `../CLAUDE-HANDOFF-PRELO.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run build
npm run lint
```

Expected:

- all tests pass;
- build passes;
- lint has no errors.

- [ ] **Step 2: Manual smoke**

Run:

```bash
npm run dev
```

Open the Vite URL and verify:

- existing demo still renders;
- PDF export still works;
- existing alpha dragon wrap does not regress.

- [ ] **Step 3: Update handoff**

Update `/Users/alexmeiradossantos/Desktop/pasta sem título/CLAUDE-HANDOFF-PRELO.md` with:

- new test count;
- statement that text-wrap supports multi-interval bands;
- statement that UI drag/drop is still not implemented;
- next recommended task: image editing UI (upload, select, drag, resize, wrap panel).

---

## Acceptance Criteria

- `computeBandIntervals` exists and is tested.
- `computeBandInterval` keeps backward compatibility.
- `sides:'both'` allows text on both sides of centered image obstacles.
- `sides:'left'`, `right`, and `largest` are tested.
- `polygon` mode has a pure geometry test and does not use the full image rectangle.
- Frame filler can emit multiple `LayoutLine`s with the same `y` for the same physical line.
- No text is lost when moving between intervals.
- Existing alpha-channel behavior still passes.
- Existing PDF/canvas renderers do not need structural changes.
- Full verification passes: `npm test`, `npm run build`, `npm run lint`.

---

## Follow-Up Plan Depois Deste

Only after this motor task is green:

1. Add editor state for selected image frame.
2. Add canvas hit-testing for image frames.
3. Add drag-to-move.
4. Add corner handles for resize.
5. Add upload/drag-drop image insertion.
6. Add wrap panel controls:
   - mode;
   - sides;
   - offset;
   - alpha threshold;
   - polygon editing mode.
7. Add PDF/export smoke with inserted user image.

Do not start these UI items until the motor accepts centered image wrap correctly.

