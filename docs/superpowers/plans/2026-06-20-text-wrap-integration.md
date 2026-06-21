# Plano — Integrar text-wrap no Frame Filler (bloco IMAGENS, parte 2/3)

Data: 2026-06-20
Status: PLANO (não implementado). Etapa marcada como perigosa pelo dono.

## 1. Objetivo e escopo

Fazer o texto **contornar imagens** no layout: cada linha quebra na largura da sua
"banda" (intervalo horizontal livre naquele Y), descontando obstáculos (image frames com
`textWrap.mode !== 'none'`).

Já pronto e testado (não mexer): geometria pura em `src/model/text-wrap.ts`
(`computeBandInterval`, `obstaclesForTextFrame`). Falta **ligar** ao motor.

### Escopo v1 (o que ENTRA)
- Wrap por bounding-box, **intervalo único por linha** (imagem de um lado, texto do outro).
- Funciona com `left`/`center`/`right`/`justify` e com `indent` de 1ª linha.
- Obstáculos por frame; re-fluxo entre frames preserva a regra por frame.

### NÃO entra (explícito, para não prometer)
- Texto nos DOIS lados de uma imagem central (multi-intervalo).
- Wrap por polígono/alpha real (só bounding-box).
- Renderizar a imagem (isso é a parte 3). Aqui o texto desvia de um "buraco"; a imagem
  em si aparece só na parte 3. Wrap é testável sem render.

## 2. Por que é perigoso (o risco central)

Hoje `frame-filler.ts` quebra o **parágrafo inteiro numa largura única** por passada do
`while`, depois coloca as linhas. Wrap exige largura **por linha** (a banda muda a cada Y).
Isso muda o coração do loop que hoje passa em 105 testes com comportamentos sutis já
corretos: `indent` de 1ª linha, `justify`, `spaceBefore/After`, recuperação de espaço de
fronteira no re-fluxo, freio de emergência (char-break), troca de frame.

Erro típico aqui: **loop infinito** (banda 0 sem avançar Y) ou **regressão silenciosa**
nos casos sem imagem.

## 3. Estratégia de menor risco

Reaproveitar o mecanismo que JÁ existe: "colocar 1 linha e re-quebrar o resto" (o caminho
do `indent`). Generalizar para: **quando o frame tem obstáculos, todo o parágrafo é colocado
uma linha por vez**, cada linha na largura da sua banda.

- **Sem obstáculos → caminho atual intacto** (em lote). Zero regressão por construção.
- **Com obstáculos → modo "uma linha por passada"** com largura/X da banda.

Garantia de regressão: `obstaclesByFrameId` é opcional; ausente ⇒ nada muda. Teste de
regressão explícito (mesma entrada sem obstáculos ⇒ saída idêntica à atual).

### Fallback (go/no-go)
Se ao integrar o loop unificado ficar difícil manter os 105 verdes, ISOLAR num caminho
separado `fillFramesWrap` usado só quando há obstáculos (duplica um pouco, mas risco de
regressão = zero). Critério: se em ~1 sessão o loop unificado não fechar verde + 7 testes
novos, trocar para o caminho isolado.

## 4. Fluxo de dados (de onde vêm os obstáculos)

`flowStory(document, storyId)`:
1. Já resolve frames por página (geometria física, coords relativas ao trim).
2. Para cada **text frame** da cadeia: `obstacles = obstaclesForTextFrame(textFrame, framesDaMesmaPagina)`.
   - `framesDaMesmaPagina` = frames cujo `pageId` == pageId do text frame (pegar de `document.frames`).
3. Montar `obstaclesByFrameId: Record<frameId, WrapRect[]>` e passar em `FrameFillerConfig`.

**Coordenadas (landmine):** `obstaclesForTextFrame` devolve o obstáculo em coords LOCAIS ao
text frame (`image.xy - textFrame.xy`, expandido por `offset`). O frame-filler posiciona
linhas em coords locais ao frame (origem 0,0 no topo-esquerda). Os dois usam a MESMA base
(x/y de frame, já que `rectOnTrim` = x/y cru). Conferir que a banda (frame-local) e o
`line.x` (frame-local) batem. Teste deve travar isso com números concretos.

## 5. Mudanças por arquivo

### `src/engine/frame-filler.ts`
- `FrameFillerConfig` ganha `obstaclesByFrameId?: Record<string, WrapRect[]>`.
- Dentro do `while (remainingTokens...)`, ao entrar numa passada com `frame` atual:
  - `const obstacles = config.obstaclesByFrameId?.[frame.id] ?? []`
  - `const hasObstacles = obstacles.length > 0`
  - `const predictedLineHeight = (remainingTokens[0].style.fontSize) × (lineHeight ?? 1.5)`
  - Se `hasObstacles`:
    - `band = computeBandInterval(frame.width, currentY, currentY + predictedLineHeight, obstacles)`
    - **Banda bloqueada** (`band.width < minTokenWidth` — usar a largura da 1ª palavra do
      restante, ou um épsilon): NÃO quebrar; `currentY += predictedLineHeight`; se passar do
      fim do frame → trocar de frame (frameIdx++, currentY=0); se não há frame → overflow.
      Guard anti-loop: contador máximo de "skips" por frame (ex.: ceil(frame.height/lineHeight)+1).
    - Senão: `effectiveWidth = band.width (− indent se 1ª linha)`, quebrar, **colocar só lines[0]**,
      `lineX = band.x + extraIndent + alignLineX(align, lineWidth, band.width − extraIndent)`,
      `runs = buildLineRuns(line, justify, band.width − extraIndent, lineWidth)`, e re-quebrar o resto.
  - Se NÃO `hasObstacles`: caminho atual (em lote), inalterado.
- O re-fluxo `remainingLines = lines.slice(linesPlaced)` + recuperação de espaço já existe; reusar.

### `src/engine/index.ts` (`flowStory`)
- Montar `obstaclesByFrameId` (item 4) e passar ao `fillFrames`.
- `flowText` (demo cru) não muda (sem obstáculos).

### `src/engine/types.ts` ou import de `WrapRect`
- `WrapRect` vem de `model/text-wrap.ts`. Frame-filler importa o tipo (engine→model já ocorre).

## 6. Edge cases (TODOS viram teste)

1. **Sem obstáculos** ⇒ saída idêntica ao atual (regressão).
2. **Imagem à esquerda no topo** ⇒ 1ª(s) linha(s) com `x = band.x > 0` e largura menor;
   abaixo da imagem, linhas voltam a `x = 0` e largura cheia (banda recalcula por Y).
3. **Imagem à direita** ⇒ `x = 0`, largura menor.
4. **Banda totalmente bloqueada** num Y ⇒ aquela faixa é pulada; próxima linha aparece abaixo
   da imagem. SEM loop infinito.
5. **Wrap + justify** ⇒ runs preenchem `band.width` nas linhas não-finais.
6. **Wrap + indent** ⇒ 1ª linha = `band.x + indent`.
7. **Obstáculo só no frame A; parágrafo transborda p/ frame B sem obstáculo** ⇒ B usa largura cheia.
8. **Imagem mais alta que o frame inteiro** ⇒ nenhuma linha cabe ⇒ overflow para o próximo
   frame (ou `overflow=true` se não houver) — SEM travar.
9. (menor, documentar) **linha em branco** (parágrafo vazio) sob obstáculo: v1 usa largura cheia
   (não desvia). Aceitável; anotar como limitação.

## 7. Caveats honestos (anotar no código/handoff)

- **KP por linha:** colocar 1 linha por passada chama o quebrador no restante a cada linha.
  Com KP isso reduz a otimização de parágrafo inteiro (vira quase greedy por linha). Aceitável
  v1; documentar. (Alternativa futura: KP ciente de larguras variáveis.)
- **Performance:** O(linhas × tokens) por re-quebra a cada linha. OK para páginas (bounded);
  otimizar depois (cache/incremental) se necessário. Anotar.
- **`predictedLineHeight`** usa o 1º token do restante; assume linha de altura uniforme.
- **Imagem ainda não renderiza** (parte 3): visualmente o texto desvia de um vazio.

## 8. Plano de testes (RED primeiro)

Nível `fillFrames` (com `obstaclesByFrameId`), medindo `line.x` / `line.width` / `line.text`:
- T1 regressão: sem obstáculos, caso conhecido ⇒ saída idêntica.
- T2 imagem esquerda topo ⇒ x deslocado nas linhas do topo, x=0 abaixo.
- T3 imagem direita ⇒ x=0, largura menor.
- T4 banda bloqueada ⇒ linha pulada para baixo da imagem (e não trava).
- T5 wrap+justify ⇒ soma dos runs = band.width nas linhas não-finais.
- T6 overflow entre frames com obstáculo só no 1º frame.
- T7 imagem mais alta que o frame ⇒ overflow sem loop infinito (teste com timeout implícito).
Nível `flowStory`: T8 — documento com 1 imagem (wrap on) + texto ⇒ linhas próximas à imagem
têm x/width coerentes com `obstaclesForTextFrame`.

## 9. Sequência de commits (pequenos, cada um verde)

1. Tipo `obstaclesByFrameId` em config + caminho sem-obstáculo intacto + T1 (regressão).
2. Modo uma-linha-por-banda (T2, T3) — imagem lateral.
3. Banda bloqueada + guard anti-loop (T4, T7).
4. Combinações: justify (T5), indent (T6/overflow).
5. Wiring `flowStory` + `obstaclesByFrameId` (T8).
6. (Demo opcional) inserir um image frame de exemplo p/ ver o wrap no preview.

Gate obrigatório a cada commit: `npm test && npm run build && npm run lint`.

## 10. Critérios de aceite

- 105 testes atuais continuam verdes (regressão zero no caminho sem imagem).
- 8 testes novos (T1–T8) provam o comportamento + o anti-loop.
- `npm test/build/lint` verdes.
- Caveats (KP/perf/render) anotados no código e no handoff.
- NUNCA confundir capa com página interna; isto é layout de página interna.

## 11. Auto-crítica (o red-team por workflow FALHOU — limite de sessão, reset 19:50)

A revisão adversarial automática não rodou. Estes são furos que eu mesmo identifiquei e que
DEVEM entrar antes de codar (tratar como achados de revisão):

- **A1 (blocker anti-loop):** o gatilho de "banda bloqueada" NÃO pode ser `band.width <= 0`.
  Uma banda de 2pt é `> 0` mas não cabe glifo → o char-break empilharia 1 caractere por linha
  (quase-infinito / lixo). Usar um **mínimo usável**: `band.width < minUsable` ⇒ tratar como
  bloqueada e avançar Y. `minUsable` = largura da maior 1ª-sílaba/menor palavra do restante,
  ou um piso simples (ex.: `fontSize` ≈ 1em). Documentar a escolha.
- **A2 (blocker anti-loop):** além do cap de "skips por frame", colocar um **cap absoluto** de
  iterações do `while` (ex.: nº de linhas teóricas do documento × fator) que, se estourado,
  encerra com `overflow = true`. Belt-and-suspenders contra qualquer regressão de terminação.
- **A3 (correção):** `predictedLineHeight` deve vir do primeiro token de PALAVRA do restante
  (o `remainingTokens[0]` pode ser SPACE após re-fluxo). Guard para style/altura ausentes.
- **A4 (coordenadas):** imagens NÃO estão na cadeia da story (`frameChainIds`); vivem em
  `document.frames` / `page.frames`. `obstaclesForTextFrame` deve buscar as imagens da MESMA
  página (por `pageId`), não da story. Confirmar que `page.frames` lista os ids das imagens.
- **A5 (teste novo):** "obstáculo no MEIO vertical do frame" — linhas acima cheias, linhas ao
  lado da imagem estreitas, linhas abaixo cheias de novo (prova que a banda recalcula por Y nos
  dois sentidos). Vira T9.
- **A6 (caveat):** quando a banda é estreita e a palavra é mais larga que a banda, o char-break
  ainda atua — garantir que `enforceMaxLineWidth` roda com `band.width` (não `frame.width`).

Próxima sessão (após reset): re-rodar o red-team (`Workflow` resume do `wf_2c7011f8-d13`) OU
seguir direto com a implementação já incorporando A1–A6. NÃO implementar sem A1/A2 (anti-loop).
