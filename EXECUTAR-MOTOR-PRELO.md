# Como executar o motor Prelo

Data: 2026-06-19  
Escopo: motor atual do diretorio `diagramador`, estado Fase 0R.

Este arquivo explica como executar o motor Prelo hoje, tanto pelo preview visual em React/Vite quanto diretamente pela API TypeScript. Ele tambem marca os limites atuais para evitar confundir o prototipo validado com o motor final de producao de livros fisicos.

## 1. O que existe hoje

O motor atual executa este pipeline:

```text
Texto bruto
  -> Tokenizer
  -> Shaper
  -> Line Breaker (greedy ou Knuth-Plass)
  -> Frame Filler
  -> LayoutResult
  -> Canvas Preview
```

Entrada principal atual:

- `text`: string com o texto da story.
- `frames`: lista de frames retangulares.
- `algorithm`: `kp` ou `greedy`.

Saida principal atual:

- `frameLayouts`: linhas calculadas para cada frame.
- `overflow`: boolean indicando se sobrou texto.
- `overflowText`: texto que nao coube em nenhum frame.

O ponto de entrada publico esta em:

```text
diagramador/src/engine/index.ts
```

A classe principal e:

```ts
TextEngine
```

O metodo principal atual e:

```ts
engine.flowText(text, frames, { algorithm: 'kp' })
```

A primeira API de documento tambem esta disponivel:

```ts
engine.flowStory(document, storyId, { algorithm: 'kp' })
```

## 2. O que ainda nao existe

Nao trate a execucao atual como motor final de livro fisico.

Ainda faltam:

- migrar frames, paginas e renderer para usar ponto PostScript como unidade interna;
- linhas com runs/espacos/glifos posicionados;
- justificacao visual real com stretch/shrink de espacos;
- PDF fisico com MediaBox, TrimBox e BleedBox;
- embedding de fonte no PDF;
- preflight real;
- validacao de PDF/X;
- text-wrap real por imagem/poligono/alpha;
- controle de viuvas, orfas, baseline grid e master pages.

O objetivo da Fase 0R e provar a fundacao: compilar, testar, quebrar linhas, fluir texto entre frames e detectar overflow.

## 3. Pre-requisitos

Use Node.js e npm.

Para conferir se estao disponiveis:

```bash
node --version
npm --version
```

Entre no diretorio do app:

```bash
cd /Users/alexmeiradossantos/Desktop/pasta\ sem\ título/diagramador
```

Instale dependencias, se ainda nao estiverem instaladas:

```bash
npm install
```

## 4. Como rodar o preview visual

No diretorio `diagramador`:

```bash
npm run dev
```

O Vite vai imprimir uma URL local, normalmente:

```text
http://localhost:5173
```

Se a porta 5173 estiver ocupada, ele pode abrir em outra porta, por exemplo:

```text
http://localhost:5174
```

Abra a URL no navegador.

No preview atual:

1. Digite ou cole texto no campo `Story`.
2. Escolha o algoritmo:
   - `Knuth-Plass (Quebra)` para o caminho KP com hifenizacao.
   - `Greedy (Simples)` para quebra gananciosa.
3. Observe o texto sendo distribuido nos frames.
4. Veja o indicador de overflow quando o texto nao couber.

O preview usa frames de demonstracao definidos em:

```text
diagramador/src/App.tsx
```

Constante:

```ts
DEMO_FRAMES
```

## 5. Como rodar a validacao tecnica

Sempre rode estes comandos antes de considerar qualquer mudanca como pronta:

```bash
npm test
npm run build
npm run lint
```

Ou em uma unica linha:

```bash
npm test && npm run build && npm run lint
```

O estado atual esperado e:

```text
6 arquivos de teste passando
45 testes passando
build passando
lint passando
```

Se qualquer comando falhar, nao avance para a proxima etapa do motor antes de corrigir.

## 6. Como executar o motor pela API atual

O motor atual depende de um `CanvasRenderingContext2D`, porque a Fase 0R ainda usa o canvas/browser como apoio de medicao.

Exemplo dentro de codigo de navegador ou componente React:

```ts
import { TextEngine } from './engine';
import type { Frame } from './model/types';

const frames: Frame[] = [
  {
    id: 'frame-1',
    pageId: 'page-1',
    x: 40,
    y: 40,
    width: 200,
    height: 250,
    rotation: 0,
    type: 'text',
    storyId: 'story-1',
    nextFrameId: 'frame-2',
    prevFrameId: null,
  },
  {
    id: 'frame-2',
    pageId: 'page-1',
    x: 280,
    y: 40,
    width: 200,
    height: 400,
    rotation: 0,
    type: 'text',
    storyId: 'story-1',
    nextFrameId: null,
    prevFrameId: 'frame-1',
  },
];

const engine = new TextEngine(ctx, {
  fontSize: 15,
  fontFamily: 'Lora',
  lineHeight: 1.5,
});

const result = engine.flowText(
  'Texto de teste do livro fisico. Este texto deve fluir entre frames.',
  frames,
  { algorithm: 'kp' }
);

console.log(result.frameLayouts);
console.log(result.overflow);
console.log(result.overflowText);
```

Resultado esperado em alto nivel:

```ts
{
  frameLayouts: [
    {
      frameId: 'frame-1',
      lines: [
        {
          text: 'Texto de teste...',
          y: 0,
          width: 123,
          height: 22.5,
          style: { ... }
        }
      ]
    }
  ],
  overflow: false,
  overflowText: ''
}
```

### 6.1. Como executar uma Story do modelo

Para usar o modelo de documento, o `Document` precisa ter:

- `stories`: lista de stories;
- `frames`: registro global de frames por ID;
- `styles`: estilos de paragrafo usados pela Story;
- `Story.frameChainIds`: ordem dos frames que recebem o texto.

Exemplo reduzido:

```ts
const document = {
  pages: [
    {
      id: 'page-1',
      width: 432,
      height: 648,
      margins: { top: 36, bottom: 36, inside: 36, outside: 36 },
      bleed: 0,
      side: 'single',
      masterPageId: null,
      frames: ['frame-1', 'frame-2'],
    },
  ],
  frames: {
    'frame-1': {
      id: 'frame-1',
      pageId: 'page-1',
      x: 40,
      y: 40,
      width: 200,
      height: 250,
      rotation: 0,
      type: 'text',
      storyId: 'story-1',
      nextFrameId: 'frame-2',
      prevFrameId: null,
    },
    'frame-2': {
      id: 'frame-2',
      pageId: 'page-1',
      x: 280,
      y: 40,
      width: 200,
      height: 400,
      rotation: 0,
      type: 'text',
      storyId: 'story-1',
      nextFrameId: null,
      prevFrameId: 'frame-1',
    },
  },
  stories: [
    {
      id: 'story-1',
      frameChainIds: ['frame-1', 'frame-2'],
      paragraphs: [
        {
          styleId: 'body',
          spans: [{ text: 'Texto do livro vindo de uma Story real.' }],
        },
      ],
    },
  ],
  styles: {
    body: {
      ...DEFAULT_PARAGRAPH_STYLE,
      characterStyle: {
        ...DEFAULT_CHARACTER_STYLE,
        fontFamily: 'Lora',
        fontSize: 15,
      },
    },
  },
  characterStyles: {},
  masterPages: {},
  defaultStyleId: 'body',
  facingPages: false,
  printProfile: PRINT_PROFILE_KDP_6x9,
  baselineGrid: null,
};

const result = engine.flowStory(document, 'story-1', { algorithm: 'kp' });
```

A partir de agora, `flowStory()` resolve os frames do layout pela geometria fisica
normalizada (`normalizeDocumentGeometry(document)`), e nao mais pelos `Document.frames`
crus. Na pratica isso significa:

- a ordem dos frames vem de `Story.frameChainIds`;
- cada frame entregue ao Frame Filler vem do `rectOnTrim` (pontos, relativo ao trim);
- as caixas `MediaBox`/`BleedBox`/`TrimBox` nao alteram as coordenadas de texto dentro
  do trim (mudar o bleed do perfil nao move o texto);
- cada `FrameLayout` retornado por `flowStory()` traz `rectOnPage`: o retangulo do frame
  em pontos ABSOLUTOS da pagina (`TrimBox` + `rectOnTrim`). Mudar o bleed desloca
  `rectOnPage`, mas as linhas (relativas ao topo do frame) continuam estaveis;
- o leading (entrelinha) das linhas vem de `ParagraphStyle.lineHeight`, interpretado como
  MULTIPLICADOR do fontSize (ex.: 1.5 = 150%); sem valor, o fallback e 1.5. Leading fixo
  em px ainda NAO e suportado;
- o Frame Filler honra `spaceBefore`/`spaceAfter` (espaco vertical entre paragrafos;
  `spaceBefore` suprimido no topo do frame), o `alignment` `left`/`center`/`right`/`justify`,
  e o `indent` (recuo da 1a linha: ela quebra numa largura util reduzida e ganha `x += indent`);
- cada `LayoutLine` traz `runs` (`{ text, x, width, style }`) posicionados; `justify`
  estica os espacos para preencher a largura util, exceto na ultima linha do paragrafo.
  O canvas desenha run a run (`frame.x + line.x + run.x`);
- uma palavra mais larga que o frame e quebrada por caractere (freio de emergencia),
  em vez de vazar para fora da caixa.

Erros esperados:

- se a Story nao existir: `Story "<id>" not found`;
- se um frame da cadeia nao existir na geometria: `Frame "<id>" not found for story "<id>"`;
- se um frame da cadeia nao for de texto: `Frame "<id>" is not a text frame`;
- se um estilo de paragrafo nao existir: `Paragraph style "<id>" not found`.

## 7. Como renderizar o resultado no Canvas

O motor nao deve desenhar diretamente. Ele calcula o layout.

Quem desenha hoje e:

```text
diagramador/src/render/canvas-renderer.ts
```

Fluxo usado pelo app:

```ts
const result = engine.flowText(text, DEMO_FRAMES, { algorithm });
renderToCanvas(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, DEMO_FRAMES, result);
```

Esse desenho ainda usa `fillText` por linha. Portanto:

- serve para preview da Fase 0R;
- nao garante fidelidade tipografica final;
- nao aplica justificacao visual real;
- nao deve ser usado como verdade final para PDF fisico.

## 8. Como testar o Line Breaker isoladamente

Testes existentes:

```text
diagramador/src/engine/line-breaker.test.ts
```

Rodar apenas estes testes:

```bash
npm test -- --run src/engine/line-breaker.test.ts
```

O que eles cobrem:

- greedy nao inicia linha com espaco;
- contrato real do `tex-linebreak`;
- caminho KP roda sem cair silenciosamente no fallback greedy.

Arquivos envolvidos:

```text
diagramador/src/engine/line-breaker.ts
diagramador/src/types-libs.d.ts
```

## 9. Como testar o Frame Filler isoladamente

Testes existentes:

```text
diagramador/src/engine/frame-filler.test.ts
```

Rodar apenas estes testes:

```bash
npm test -- --run src/engine/frame-filler.test.ts
```

O que eles cobrem:

- texto fluindo do primeiro frame para o proximo;
- overflow quando nao ha frame suficiente;
- preservacao de espacos quando linhas restantes sao recalculadas em frame mais largo;
- nao inserir espaco dentro de fragmento hifenizado.

Arquivo principal:

```text
diagramador/src/engine/frame-filler.ts
```

## 10. Como mudar os frames de teste

No preview atual, os frames ficam em:

```text
diagramador/src/App.tsx
```

Procure:

```ts
const DEMO_FRAMES: Frame[] = [...]
```

Campos importantes:

- `x`, `y`: posicao do frame no canvas;
- `width`, `height`: tamanho do frame;
- `nextFrameId`: proximo frame encadeado;
- `prevFrameId`: frame anterior;
- `storyId`: story associada.

Na API antiga <code>flowText()</code>, a ordem real usada pelo motor ainda e a ordem do array recebido. Na API nova <code>flowStory(document, storyId)</code>, a ordem ja vem de <code>Story.frameChainIds</code> e os frames sao resolvidos por <code>Document.frames</code>.

## 11. Como mudar o texto inicial

No preview atual, edite:

```text
diagramador/src/App.tsx
```

Procure:

```ts
const INITIAL_TEXT = `...`;
```

Esse texto aparece no textarea quando a aplicacao abre.

## 12. Como mudar fonte e tamanho no preview

No preview atual, a criacao do motor fica em:

```text
diagramador/src/App.tsx
```

Procure:

```ts
engineRef.current = new TextEngine(ctx, {
  fontSize: 15,
  fontFamily: 'Lora',
  lineHeight: 1.5,
});
```

Arquivos de fonte carregados hoje:

```text
diagramador/public/fonts/Lora-Regular.ttf
diagramador/public/fonts/EBGaramond-Regular.ttf
```

Registro de fontes:

```text
diagramador/src/fonts/font-registry.ts
```

Medicao de fontes:

```text
diagramador/src/fonts/font-metrics.ts
```

Observacao: o uso atual de `opentype.js` ainda nao substitui uma engine completa de shaping como HarfBuzz/rustybuzz.

## 13. Como identificar overflow

Depois de executar:

```ts
const result = engine.flowText(text, frames, { algorithm: 'kp' });
```

Leia:

```ts
result.overflow
result.overflowText
```

Se `result.overflow` for `true`, sobrou texto sem frame disponivel.

No preview visual, isso aparece como indicador vermelho no ultimo frame.

## 14. Como gerar geometria fisica em pontos

A camada de impressao usa pontos PostScript:

```text
1 in = 72 pt
```

Para derivar geometria fisica a partir de um perfil de impressao:

```ts
import { PRINT_PROFILE_KDP_6x9 } from './model/types';
import { printProfileToPageGeometry } from './model/print-units';
import { normalizeDocumentGeometry } from './model/physical-geometry';

const geometry = printProfileToPageGeometry(PRINT_PROFILE_KDP_6x9);
const physicalDocument = normalizeDocumentGeometry(document);
```

Resultado esperado para KDP 6x9:

```ts
{
  unit: 'pt',
  trim: {
    width: 432,
    height: 648,
  },
  bleed: 9,
  minMargins: {
    top: 27,
    bottom: 27,
    inside: 27,
    outside: 27,
  },
}
```

Use essa geometria como base para a futura saida PDF. O Canvas ainda deve ser tratado como transformacao de visualizacao, nao como unidade fisica final.

`normalizeDocumentGeometry(document)` tambem gera:

- `pages[].boxes.media`: MediaBox em pontos;
- `pages[].boxes.bleed`: BleedBox em pontos;
- `pages[].boxes.trim`: TrimBox em pontos;
- `frames[frameId].rectOnTrim`: frame em pontos, relativo ao trim.

## 15. Como escolher entre KP e greedy

Use KP por padrao:

```ts
engine.flowText(text, frames, { algorithm: 'kp' });
```

Use greedy para comparacao ou debug:

```ts
engine.flowText(text, frames, { algorithm: 'greedy' });
```

Interprete assim:

- `kp`: melhor para avaliar caminho de quebra futura do motor editorial;
- `greedy`: mais simples, util para isolar bugs de frame/overflow.

Importante: `kp` hoje significa quebra de linha com Knuth-Plass. Ainda nao significa texto visualmente justificado.

## 16. Como debugar fallback do KP

Se o KP falhar, o motor imprime no console:

```text
Knuth-Plass falhou, usando fallback greedy:
```

Isso nao deve acontecer no fluxo basico coberto por testes.

Se acontecer:

1. Reproduza o texto e os frames em um teste.
2. Rode apenas o teste do line breaker.
3. Confira se os itens enviados para `tex-linebreak` terminam com forced break.
4. Confira se penalties usam:
   - `cost: number`;
   - `flagged: boolean`.

## 17. Ordem correta para evoluir a execucao para Fase 1

Nao comece por editor visual.

A ordem correta e:

1. Usar a geometria em pontos PostScript gerada por `printProfileToPageGeometry()`.
2. Usar `normalizeDocumentGeometry()` como ponte para PDF e preview fisico.
3. Migrar `Frame`, `Page`, margens e bleed para unidade fisica consistente.
4. Evoluir `flowStory(document, storyId)` para paginas fisicas completas.
5. Validar colunas, padding, ordem de paginas e recomposicao incremental.
6. Trocar `LayoutLine.text` por runs posicionados.
7. Guardar espacos, stretch/shrink e baseline por linha.
8. Fazer Canvas desenhar a saida geometrica do motor, sem recalcular texto.
9. Fazer PDF usar a mesma saida geometrica.
10. Embutir fontes.
11. Rodar preflight minimo.
12. Validar um PDF real no destino escolhido.

## 18. Comandos de rotina diaria

Entrar no projeto:

```bash
cd /Users/alexmeiradossantos/Desktop/pasta\ sem\ título/diagramador
```

Rodar preview:

```bash
npm run dev
```

Rodar testes:

```bash
npm test
```

Rodar build:

```bash
npm run build
```

Rodar lint:

```bash
npm run lint
```

Rodar tudo antes de fechar uma etapa:

```bash
npm test && npm run build && npm run lint
```

## 19. Checklist antes de dizer que o motor esta OK

Antes de considerar uma mudanca pronta:

- [ ] `npm test` passa.
- [ ] `npm run build` passa.
- [ ] `npm run lint` passa.
- [ ] O bug original tem teste.
- [ ] O teste falharia sem a correcao.
- [ ] O HTML/documentacao nao promete feature que ainda nao existe.
- [ ] O preview nao e tratado como PDF final.
- [ ] A diferenca entre quebra KP e justificacao visual esta clara.

## 20. Resumo operacional

Para executar o motor hoje:

```bash
cd /Users/alexmeiradossantos/Desktop/pasta\ sem\ título/diagramador
npm install
npm run dev
```

Para validar o motor hoje:

```bash
npm test && npm run build && npm run lint
```

Para usar por codigo:

```ts
const engine = new TextEngine(ctx, { fontSize: 15, fontFamily: 'Lora', lineHeight: 1.5 });
const result = engine.flowText(text, frames, { algorithm: 'kp' });
```

Para usar uma Story do modelo:

```ts
const result = engine.flowStory(document, 'story-1', { algorithm: 'kp' });
```

O Prelo esta pronto para iniciar a producao da Fase 1 do motor. Ainda nao esta pronto para prometer exportacao profissional de livro fisico ate PDF, preflight e runs posicionados estarem implementados e validados.
