# Handoff para Claude Code — Prelo

Data: 2026-06-19  
Workspace: `/Users/alexmeiradossantos/Desktop/pasta sem título`

## PONTO DE PARADA (retomar daqui)

**Estado (verificado nesta sessao):** `npm test` **200 testes** verdes, build e lint OK.
Motor de texto completo + paginacao automatica (`paginateStory`) + export PDF RGB com fonte TTF
real embutida (`documentToPdf` + `@pdf-lib/fontkit`) + presets por categoria (`book-presets.ts`)
+ preflight fisico (`preflight.ts`) + lombada/capa (`spine.ts` + `cover-pdf.ts`)
+ demo usando `flowStory`/`documentToPdf` + **fundacao da UI real do produto** (editor em branco).

**COMO ABRIR (importante):** `npm run dev`. O app agora abre no **EDITOR REAL EM BRANCO**
(`src/product/AppShell.tsx` → `EditorShell`). Para o demo tecnico antigo, clique na aba
**"Laboratorio do motor"** no topo (renderiza o `App.tsx` original, intacto).

**PLANO MESTRE DE FINALIZACAO DO MOTOR:** ver
`docs/superpowers/plans/2026-06-21-prelo-engine-finalization-master-plan.md`.
Esse plano fixa a ordem correta: primeiro contrato Preview=PDF + quality gate, depois qualidade fina
de composicao, PDF print-ready/preflight, estrutura real de livro, imagens, templates e performance.
Proximo plano especifico recomendado: **Phase 0 + Phase 1: shared layout artifact and PDF/preview
quality gate hardening**. Nao iniciar migracao Tiptap antes desses gates.

**FEITO agora — PERFORMANCE do editor (digitacao travava com texto grande):**
  - Diagnostico medido (preview, manuscrito 47KB → 45 paginas, ~17,7k nos no DOM): o flush de
    digitacao disparava um LONG TASK de ~12,6 SEGUNDOS (congelamento). `innerText`/reflow eram
    baratos (0,02/0,08ms) — o vilao era a paginacao.
  - CAUSA RAIZ no motor: `paginateStory` era O(paginas²) — chamava `flowStory` (tokenize → KP +
    hifenizacao sobre o manuscrito INTEIRO) UMA VEZ POR PAGINA adicionada. 45 paginas = ~45 reflows.
  - FIX motor (`src/engine/index.ts`): `paginateStory` agora cresce paginas EM LOTE. A 1ª auto-pagina
    e uma SONDA que mede a capacidade real (chars) de uma auto-pagina (clones do template, homogeneos);
    as demais sao estimadas por `floor(overflow / capacidade)` — SUBESTIMA, entao nunca cria pagina em
    branco e converge para a contagem minima (igual a versao 1-a-1). Helper `storyCharCount`.
    Saida identica (mesmo `addedPages`/paginas); so `iterations` cai. Resultado medido: 12,6s → 0,37s.
  - FIX editor (`src/product/EditorShell.tsx`):
    - `paginateWithEngine(present)` agora em `useMemo([present, layoutCtx])` → roda SO quando o
      documento muda, nao a cada render incidental (zoom/salvar/export) nem 2× por commit.
    - `flushDraft` NAO bumpa mais `pageRevision` → o flush de digitacao nao remonta as 45 paginas
      (custo enorme). O `EditablePage` sincroniza o conteudo via `useEffect([text])`. `pageRevision`
      fica so para mudancas estruturais (add/selecao de pagina, undo/redo, load).
  - Teste de regressao em `index.test.ts`: manuscrito longo pagina em MUITO menos `iterations` que
    paginas, sem overflow e sem pagina em branco no fim. (Contagem global: ver PONTO DE PARADA.)
  - LIMITE HONESTO: ainda ha um hitch de ~0,37s no flush (debounced 700ms) porque o editor recompoe
    o LIVRO INTEIRO a cada edicao. O fim de jogo (Fase futura) e LAYOUT INCREMENTAL (so recompor o
    trecho afetado) ou paginacao em Web Worker. Por ora, usavel (era 12,6s).

**FEITO agora — feedback visual imediato na digitacao (TDD):**
  - Problema: quando havia `frameLayout`, o editor deixava o `contenteditable` transparente e o usuario
    so enxergava o texto depois do debounce/re-paginacao da camada do motor. Isso parecia atraso entre
    tecla e texto aparecendo.
  - `EditablePage.tsx` ganhou estado local `isEditing`: no foco/input, a pagina entra em modo de
    edicao; no blur, sai do modo e commita o draft.
  - Durante `isEditing`, o CSS mostra o texto nativo do `contenteditable` imediatamente e oculta a
    camada `engine-line-layer`. Ao sair da edicao, a camada diagramada volta.
  - O `useEffect` que sincroniza `textContent` agora nao sobrescreve o DOM enquanto o usuario esta
    digitando.
  - Teste novo: `src/product/editor-typing-latency.test.ts`, garantindo que a camada nativa nao fique
    transparente durante edicao e que a camada do motor seja escondida nesse estado.
  - Verificacao: `npm test` 26 arquivos / 200 testes verdes; `npm run build` passou; `npm run lint`
    passou.

**ROADMAP p/ FECHAR O MOTOR (decidido com o usuario):** o motor esta ~35-45% de um produto serio
de livro fisico. Sequencia acordada: **Fase 1 composicao editorial** (em andamento) → Fase 2 infra
de teste visual PDF×preview → Fase 3 estrutura (estilos por paragrafo, master pages, numeracao,
sumario, notas) → Fase 4 UI de imagem (drag/resize/crop + wrap visual) → Fase 5 CMYK/PDF-X/preflight
grafico (risco nº1) → Fase 6 shaping real (HarfBuzz) + performance. NAO criar sistema paralelo;
amadurecer o motor existente.

**FEITO agora — FASE 1 (parte): composicao editorial no frame-filler/line-breaker (motor puro, TDD):**
  - `Token` ganhou `orphans`/`widows`/`keepLinesTogether`/`pageBreakBefore`/`keepWithNext` (opcionais);
    `flowStory` mapeia do `ParagraphStyle`. Default no frame-filler = 1/1 (SEM restricao) quando o
    token nao traz → testes sinteticos intactos; o produto injeta 2/2 do `DEFAULT_PARAGRAPH_STYLE`.
  - `frame-filler.ts` agora decide QUANTAS linhas ficam no frame (helper `countLinesThatFit`):
    - **page-break-before**: paragrafo comeca no topo de um novo frame.
    - **keep-together** (`keepLinesTogether`): paragrafo que nao cabe inteiro vai todo adiante.
    - **orfas**: nao deixa < `orphans` linhas iniciais no rodape (empurra o paragrafo).
    - **viuvas**: nao deixa < `widows` linhas finais sozinhas no proximo frame (puxa linha p/ baixo).
    - **keep-with-next**: paragrafo (ex.: titulo) que cabe inteiro mas deixaria o INICIO do proximo
      paragrafo na pagina seguinte desce junto (lookahead a altura da 1a linha do proximo paragrafo).
    - **anti-loop**: no topo de um frame que nao comporta a regra, coloca assim mesmo (a paginacao
      automatica cuida do resto). Compoe com `paginateStory`.
  - 5 testes novos em `frame-filler.test` (page-break-before, keep-together, orfas, viuvas,
    keep-with-next). (Contagem global de testes: ver PONTO DE PARADA no topo.)
  - ESCOPO/limites HONESTOS desta parte:
    - As regras valem no fluxo de texto SEM wrap de imagem (corpo comum). O caminho de wrap
      multi-intervalo ainda NAO honra orfas/viuvas/keeps.
    - keep-with-next cobre o caso comum (titulo curto que CABE inteiro no frame); se o proprio
      paragrafo keep-with-next se dividir entre frames, nao e tratado.
    - Paragrafos com `indent > 0` tem tratamento aproximado de orfas/viuvas (o recuo re-quebra a 1a
      linha); com `indent = 0` (default do produto) e exato.
  - Justificacao fina ganhou dois reforcos:
    - `buildLineRuns()` agora limita o quanto cada espaco pode esticar. Se uma linha exigiria
      espacos grotescos, ela fica natural em vez de criar rios enormes no PDF.
    - `buildBreakItems()` agora oferece TODOS os pontos silabicos aceitaveis ao Knuth-Plass,
      em vez de apenas um corte balanceado. Isso permite hifenizar em ponto mais cedo quando
      a coluna/frame e estreita.
    - `MIN_HYPHENATED_WORD_LENGTH` caiu de 13 para 10, mantendo fragmentos minimos de 4 letras
      e regex de palavra natural. Palavras comuns de livro como `necessidade` passam a poder
      hifenizar; codigos/numeros/maiusculas seguem bloqueados.
  - Testes novos cobrem:
    - freio de justificação quando o espaco ficaria absurdo;
    - greedy hifenizando palavra portuguesa longa no fallback;
    - KP com multiplos pontos de hifenizacao;
    - KP usando ponto de hifenizacao cedo quando o ponto balanceado estoura a linha;
    - hifenizacao de palavra portuguesa media (`necessidade`).
  - Fase 1 ainda NAO deve ser chamada de perfeita: faltam metricas/ranking de qualidade de linhas
    para detectar rios de forma sistematica. Mas o defeito grosseiro do PDF com letras/espacos
    encavalados ou espacos gigantes foi tratado no motor.

**FEITO agora — correcao de hifen artificial persistente em reflow (TDD):**
  - Problema observado no PDF `Livro sem titulo (3).pdf`: hifens automaticos viravam texto
    permanente no meio da linha depois de reflow entre frames/paginas (`assen-tamentos`,
    `relaci-onadas`). O PDF anexado ainda NAO esta correto; ele precisa ser reexportado apos esta
    correcao.
  - `Token` ganhou metadados opcionais `softHyphen` e `hyphenSource`.
  - `line-breaker.ts` preserva a palavra original nos fragmentos silabicos e marca o hifen inserido
    pelo motor como `softHyphen`.
  - `frame-filler.ts` remove o hifen artificial quando linhas nao colocadas sao refluidas para um
    frame mais largo, mas preserva hifen digitado pelo usuario (`al-` + `pha` continua `al-pha`).
  - O freio de emergencia por caractere (`charChunks`) tambem preserva `hyphenSource`, para evitar
    reconstruir uma palavra como duas palavras separadas (`cresce ram`).
  - Teste novo: `removes artificial hyphens when unplaced KP lines reflow into a wider frame`.
  - Verificacao: `npm test` 25 arquivos / 198 testes verdes; `npm run build` passou; `npm run lint`
    passou.

**FEITO agora — baseline grid no motor (TDD):**
  - `FrameFillerConfig` ganhou `baselineGrid` + `pages`.
  - `fillFrames()` agora alinha a baseline das linhas ao grid quando configurado:
    `page.margins.top + baselineGrid.startOffset + n * baselineGrid.increment`.
  - `flowStory()` passa `document.baselineGrid` e `document.pages` para o `frame-filler`, entao o
    campo `Document.baselineGrid` deixou de ser decorativo e passou a afetar layout real.
  - Testes novos:
    - `frame-filler.test`: linhas que ficariam em `0/15/30` passam a `0/18/36` com grid 18pt;
    - `index.test`: `flowStory` aplica o grid do documento a partir da margem superior.
  - Limite honesto: a baseline usa a mesma aproximacao do PDF atual (`fontSize * 0.8`). Quando entrar
    metricas reais de fonte/HarfBuzz, essa conta deve virar ascent real.

**FEITO agora — gate PDF/preview do manuscrito longo (TDD):**
  - `src/editor/fixtures/long-portuguese-manuscript.ts` adiciona um manuscrito longo e estavel em
    portugues para testes de paginacao/export.
  - `src/editor/pdf-preview-quality.test.ts` prova que `createEngineAdapter` + `TextEngine` real
    paginam o manuscrito pelo mesmo algoritmo do editor (`EDITOR_LAYOUT_ALGORITHM = 'kp'`) sem
    linhas grotescamente esticadas.
  - O mesmo teste exporta o documento paginado para PDF e valida com `pdf-lib`:
    PDF multi-pagina, MediaBox 450×666 pt e TrimBox 432×648 pt em offset 9 pt (6×9 com sangria).
  - Gate visual Poppler tambem implementado: o teste chama `pdftoppm`, rasteriza a primeira pagina
    exportada em PPM a 72 DPI, valida dimensoes 450×666 px e mede pixels nao brancos dentro da area
    esperada da pagina. Isso pega PDF branco, texto fora da folha, escala errada ou render quebrado.
  - O cache do Fontconfig e isolado em diretorio temporario no teste para manter `npm test` limpo.
    Ainda nao e comparacao pixel-perfect; e um smoke visual objetivo.

**FEITO agora — PRESET EDITORIAL DE COMPOSICAO (corpo de livro: justify + hifenizacao pt-BR):**
  - Problema: o editor compunha com `greedy` + alinhamento `left` → margem direita esburacada.
  - `src/editor/editor-layout.ts` (NOVO): `EDITOR_LAYOUT_ALGORITHM = 'kp'`. Fonte UNICA do
    algoritmo; `EditorShell` usa a MESMA constante no preview (paginacao) e no export PDF →
    mesmo caminho de layout. (Removido o `EDITOR_LAYOUT_ALGORITHM='greedy'` local do EditorShell.)
  - `src/editor/blank-document.ts`: preset de corpo agora `alignment: 'justify'`.
  - `src/engine/line-breaker.ts`: `breakLines` recebe opcoes editoriais —
    `maxAdjustmentRatio: null` (CRITICO: sem isso o KP lancava e caia no greedy quando uma linha
    nao podia ser esticada, jogando a palavra longa inteira p/ a linha seguinte em vez de hifenizar),
    `doubleHyphenPenalty: 120` (desencoraja hifens consecutivos), `adjacentLooseTightPenalty: 10`.
    As guardas de hifenizacao JA existiam e foram mantidas: so palavras >=13 letras, fragmentos >=4,
    regex `NATURAL_WORD_RE` exclui nomes/codigos/numeros/maiusculas.
  - `src/types-libs.d.ts`: o shim de `tex-linebreak` tinha `BreakOptions` ficticio; corrigido p/
    incluir as opcoes reais (`maxAdjustmentRatio`/`doubleHyphenPenalty`/`adjacentLooseTightPenalty`).
  - `src/editor/components/EditablePage.tsx`: a camada `.engine-line` agora renderiza os `runs`
    posicionados (com espacos esticados) em vez de `line.text` puro → a JUSTIFICACAO fica visivel
    no preview, igual ao que o PDF escreve (o PDF ja desenhava run-a-run).
  - Testes (TDD, +3 novos, total 182): hifenizacao pt-BR quebra palavra longa comum
    (`line-breaker.test`); preset do corpo e `justify` (`blank-document.test`); mesmo algoritmo `kp`
    no preview e no PDF (`engine-adapter.test`). Justify com runs esticados e ultima linha natural
    JA eram cobertos (`frame-filler.test`).
  - Verificado ao vivo (vite 5188) colando o manuscrito "A Cidade Que Cresceu em Volta do Rio":
    9 linhas preenchem exatamente os 324pt do frame (margem direita reta), 3 linhas hifenizadas
    (`simulta-/neamente`, `transfor-/macoes`, `surpreen-/dentemente`), ultimas linhas de paragrafo
    ragged (correto). Export PDF gerou blob valido (~19,8 KB) sem erro. Laboratorio intacto.
  - LIMITES editoriais (ATUALIZADO — ver bloco FASE 1 acima): orfas/viuvas/keep-together/
    page-break-before/keep-with-next/baseline grid JA implementados; faltam qualidade fina de
    justificacao (rios/espacamento por palavra), kerning/ligaturas (shaping real/HarfBuzz).
    O seletor de fonte muda o display mas o PDF embute Crimson Text.

**FEITO agora — FUNDACAO DA UI DO PRODUTO (separada do demo, motor intacto):**
  - Separacao explicita: motor estavel = `src/engine` (NAO tocado); a UI so fala com o motor
    via `src/editor/engine-adapter.ts` (a "porta"). NAO foi criado motor experimental vazio —
    o fork, se um dia precisar, acontece atras do adapter. Demo tecnico vira LABORATORIO.
  - `src/editor/` (logica pura, TDD — 31 testes novos):
    - `blank-document.ts` → `createBlankDocument()` (1 pagina 6×9 = 432×648 pt, margens 54, 1 frame
      de texto, story vazia, estilo "body" com fonte Crimson Text) + `createBlankPageBundle(n)`.
    - `editor-state.ts` → estado imutavel: `addPage`, `setActivePage`, `setActivePageText`,
      `setBodyStyle`, seletores, `editorStateFromProject` (deriva pageSeq dos IDs).
    - `editor-history.ts` → undo/redo generico (past/present/future, limite 100).
    - `persistence.ts` → save/load em `KeyValueStore` injetavel (localStorage no app),
      chave `prelo.editor.project.v1`; load tolera JSON corrompido/formato invalido (→ null).
    - `engine-adapter.ts` → `createEngineAdapter(port)` (testavel) + `createBrowserEngineAdapter(ctx)`;
      `exportProjectToPdf(project, opts)` → `engine.documentToPdf(project.document, opts)`.
  - `src/editor/components/` (React, presentacionais): `PageSidebar`, `TextToolbar`, `EditablePage`,
    `EditorWorkspace`, `ZoomControls`.
  - `src/product/`: `AppShell` (raiz, troca Editor↔Laboratorio, abre no Editor), `EditorShell`
    (cerebro: estado+historico+zoom+persistencia+export; usa refs p/ sobreviver ao StrictMode),
    `ProjectDashboard` (STUB), `NewBookWizard` (STUB).
  - `src/lab/MotorLab.tsx` embrulha o `App.tsx` original (demo preservado, nao apagado).
  - `main.tsx` agora monta `<AppShell/>`.
  - Escrita DIRETA na pagina via `contenteditable` (layout NATIVO do navegador). RESSALVA HONESTA:
    o editor NAO reflui pelo motor ainda — o que se ve digitando NAO bate pixel-a-pixel com o PDF.
    Reflow-pelo-motor no editor e o problema dificil, deixado para depois.
  - Verificado ao vivo (vite 5188): editor abre em branco; digitacao na pagina; "+ Pagina" cria
    Pagina 2; troca de pagina preserva o texto (round-trip pelo estado); toolbar centraliza;
    undo volta o alinhamento; Salvar grava no localStorage; Exportar PDF gera blob real
    (~10,9 KB, sem erro); aba Laboratorio renderiza o demo completo (9 paginas, wrap, capa).
    Sem erros no console.

**CONCLUIDO em 2026-06-20 — plano text-wrap-motor (TDD):**
  - Plano `diagramador/docs/superpowers/plans/2026-06-20-text-wrap-motor.md` EXECUTADO por completo.
  - `src/model/text-wrap.ts` ganhou `computeBandIntervals(frameWidth, bandTop, bandBottom, obstacles)`
    → MULTI-INTERVALO por banda (o `computeBandInterval` singular continua intacto p/ compat).
  - `WrapSides = 'both'|'left'|'right'|'largest'` real: `both` devolve todos os vaos livres,
    `left`/`right` so um lado, `largest` o maior vao unico (empate → direita).
  - `WrapRect.polygon?` (pontos normalizados 0..1): `polygon` entra pela MESMA API de obstaculo;
    bounding-box infla o rect pela offset, alpha/polygon sao "contorno" (rect base + mascara/poligono).
  - `frame-filler.ts`: o ramo de wrap agora itera os intervalos da banda (esquerda→direita),
    emitindo um fragmento de `LayoutLine` por vao no mesmo `currentY` → texto dos DOIS lados de
    uma imagem central. Banda totalmente bloqueada ainda avanca `currentY` (anti-loop preservado).
  - `flowStory` ja passava `Object.values(document.frames)` como `wrapFrames`: imagem central
    funciona ponta-a-ponta (teste de integracao em `index.test.ts`).
  - Verificado: `npm test` 139 verdes, build e lint OK. Preview/PDF seguem funcionando (sem regressao).
  - Fora do escopo (continua NAO feito): upload, drag/drop, resize handles, crop e painel visual
    estilo Canva. Essa e a proxima tarefa natural (UI de edicao de imagem sobre o motor real).

**FEITO agora — SMOKE visual do demo (imagem central `sides:'both'`):**
  - `src/demo-document.ts`: novo obstaculo `page-2-center-image` no centro do frame unico da pagina de
    FICCAO (page-2), `textWrap.mode='bounding-box'`, `sides:'both'`, offset 8. `DEMO_PAGES` agora anexa
    imagens de wrap a QUALQUER pagina cujo `pageId` casa (antes era hardcoded so page-1).
  - Preview verificado ao vivo (vite na 5188): na page-2, varredura de pixels do canvas achou 13 linhas
    com texto a ESQUERDA e a DIREITA com vao central vazio (a imagem) + 65 linhas full-width acima/abaixo.
    Prova direta do multi-intervalo no preview real.
  - PDF verificado: documento paginado exportado por `documentToPdf` (mesma pipeline `paginateStory`),
    `pdftoppm` da page-2 mostra o mesmo layout — dragao central com duas colunas de texto ladeando.
    PDF e canvas derivam do MESMO `frameLayouts`; o PDF nao recalcula layout (so inverte Y).
  - Sem UI Canva ainda (continua proposital). `npm test` 139 verdes, build e lint OK.

**FEITO agora — bloco IMAGENS (parte 1 de 3): DPI + geometria de wrap (puro, testado):**
  - `src/model/image-checks.ts` → `imageEffectiveDpi(frame)` = pixels originais / tamanho fisico
    (in); `effectiveDpi` = menor dimensao. `isImageFrame()` guard.
  - Preflight: warning `LOW_IMAGE_DPI` quando imagem < `printProfile.minDPI` (so para frames
    `type:'image'` com `originalWidth/Height` > 0). Doc valido continua `[]`.
  - `src/model/text-wrap.ts` (PURO): `computeBandInterval(frameWidth, bandTop, bandBottom, obstacles)`
    → maior intervalo horizontal livre numa banda (intervalo unico);
    `obstaclesForTextFrame(textFrame, frames)` → rects de imagem (wrap != none) em coords LOCAIS
    do text frame, expandidos pela `offset`. Testado (esquerda/direita/sem overlap/none/nao-imagem).
  - Correcao importante: `alpha-channel` agora usa mascara de alpha real (`AlphaMask`) e bloqueia so
    pixels opacos da imagem, nao o retangulo inteiro. Sem mascara, cai para bounding-box por seguranca.
**FEITO agora — bloco IMAGENS (parte 2 de 3): text-wrap ligado ao layout/preview:**
  - `FrameFillerConfig.wrapFrames?: Frame[]` alimenta obstaculos de imagem por pagina.
  - `FrameFillerConfig.wrapMasksByFrameId?: Record<string, AlphaMask>` alimenta mascaras alpha.
  - `frame-filler.ts` calcula `computeBandInterval(...)` por linha quando o frame atual tem
    obstaculos; sem obstaculos, preserva o caminho antigo em lote.
  - Banda totalmente bloqueada avanca `currentY` pelo lineHeight, sem perder texto e sem loop infinito.
  - `flowStory(...)` passa `Object.values(document.frames)` para o filler; `flowText(...)` segue simples.
  - Demo ganhou `page-1-wrap-image` como obstaculo visual na primeira pagina. O frame fica em
    `Document.frames`/`Page.frames`, mas NAO entra em `Story.frameChainIds`.
  - Canvas pinta placeholder se a imagem ainda nao carregou.

**FEITO agora — bloco IMAGENS (parte 3 de 3): bitmap real no canvas/PDF + sangria:**
  - Demo usa `src/assets/dragon-alpha.png` (convertido do WebP enviado pelo usuario, com alpha) como
    imagem real (`DEMO_IMAGE_URL`), carregada no App.
  - App extrai a mascara alpha via canvas (`getImageData`) e passa `wrapMasksByFrameId` para
    `paginateStory(...)` e `documentToPdf(...)`.
  - `renderToCanvas(..., { imageElementsByUrl })` desenha bitmap real quando carregado.
  - `computePdfPlacements(...)` agora emite `images[]` por pagina, com coordenadas fisicas e Y invertido.
  - `renderPdf(...)` aceita `imageBytesByFrameId` e embute/desenha PNG/JPG antes do texto.
  - `documentToPdf(...)` passa frames e bytes de imagem para o PDF final.
  - Preflight novo: erro `IMAGE_MISSING_BLEED` quando imagem toca o trim mas nao avanca ate a sangria.
    Imagem que esta dentro da area de bleed permitida nao gera `FRAME_OUTSIDE_TRIM`.
  - Verificacao visual: `tmp/pdfs/prelo-demo-image.pdf` gerado e renderizado; pagina 1 mostra imagem
    embutida e texto contornando.

**FEITO agora — lombada/capa fisica (`src/model/spine.ts`, modulo PURO e testado):**
  - `calculateSpineWidth({ pageCount, stock })` → largura da lombada (in/mm/pt). Constantes KDP
    documentadas: white 0.002252, cream 0.0025, color 0.002347 in/pagina. offset-br deriva de
    gramatura+bulk (mm = paginas × gsm × bulk / 2000). Valida pageCount; exige gsm p/ offset.
  - `calculateCoverGeometry({...})` → capa espalhada: fullWidth = 2×trim + lombada + 2×bleed,
    fullHeight = trimHeight + 2×bleed, regioes em pt (contracapa | lombada | capa).
  - `spineWidthFromProfile(profile, pageCount)` → lombada a partir do PrintProfile (null p/ offset).
  - Preflight: warning `SPINE_TOO_THIN_FOR_TEXT` (OPT-IN via `expectSpineText`, nao polui doc valido).
  - Demo mostra stat "Lombada: X mm" a partir das paginas auto-paginadas (verificado no preview).

**FEITO agora — PDF tecnico de capa (`src/engine/cover-pdf.ts`):**
  - `renderCoverPdf(...)` gera capa espalhada em uma pagina: contracapa + lombada + capa + sangria.
  - Define `MediaBox`, `BleedBox` e `TrimBox` coerentes com `calculateCoverGeometry`.
  - Demo ganhou campo "Paginas p/ capa" (default 200) e botao "Exportar Capa PDF".
  - Arquivo de conferencia gerado em `diagramador/tmp/pdfs/prelo-capa-tecnica.pdf`; render PNG OK.

**PROXIMO PASSO sugerido (continuar a UI do produto):** sobre a fundacao do editor recem-criada,
  o proximo bloco e a **UI de imagem no editor**: inserir imagem, selecionar, arrastar, redimensionar
  (resize handles), crop e PAINEL de wrap (escolher mode bounding-box/alpha/polygon e `sides`
  left/right/both/largest) — ligando os controles `editor/` ao motor SO via `engine-adapter.ts`.
  Itens tecnicos abertos no editor que viram tarefa: (a) reflow REAL pelo motor dentro do editor
  (hoje a digitacao usa layout nativo do navegador, nao bate pixel-a-pixel com o PDF);
  (b) seletor de fonte real no PDF (export embute Crimson Text independente da fonte escolhida na UI).

**Outro bloco grande (risco nº1, separado):** CMYK/PDF-X/OutputIntent server-side com Ghostscript
(JA instalado: `/opt/homebrew/bin/gs` 10.07; `pdfinfo` tambem). Converter o PDF RGB → PDF/X-1a CMYK
e validar. Nota: `pdf-lib` esta no bundle do cliente (aviso de chunk size); avaliar PDF no servidor.

**Para retomar:** rodar `npm test && npm run build && npm run lint` (deve dar 200 verdes),
seguir com TDD (teste falhando primeiro). NUNCA confundir capa com pagina interna; capa NAO tem trim por pagina.
Regra deste ciclo: a UI nova so toca o motor por `src/editor/engine-adapter.ts`; nao refatorar o motor.

## Objetivo do produto

O Prelo e um motor de diagramacao de livros fisicos impressos no navegador.

Nao e um gerador simples de ebook. Nao e um produto KDP-only. O alvo e diagramacao fisica seria: paginas fixas, medidas reais, margens, bleed, frames encadeados, composicao tipografica, PDF com caixas fisicas e preflight.

Prioridade tecnica:

1. Motor de layout fisico.
2. PDF/preflight.
3. So depois editor visual rico, UI final, SaaS, login, IA e automacoes comerciais.

## Estado atual verificado

Ultima verificacao executada:

```bash
cd /Users/alexmeiradossantos/Desktop/pasta\ sem\ título/diagramador
npm test && npm run build && npm run lint
```

Resultado:

```text
npm test: 26 arquivos, 200 testes passando
npm run build: passou
npm run lint: passou
```

## Arquivos principais

- `diagramador/src/engine/index.ts`
  - API publica `TextEngine`.
  - `flowText(text, frames, options)` continua existindo para demo.
  - `flowStory(document, storyId, options)` foi criado como primeira API real de documento.

- `diagramador/src/model/types.ts`
  - Modelo central: `Document`, `Story`, `Frame`, `Page`, `PrintProfile`.
  - `Document.frames: Record<string, Frame>` foi adicionado para resolver frames por ID.

- `diagramador/src/model/print-units.ts`
  - Conversoes fisicas.
  - Ponto PostScript como base: `1 in = 72 pt`.
  - `printProfileToPageGeometry(profile)` gera trim, bleed e margens em pontos.

- `diagramador/src/model/physical-geometry.ts`
  - `normalizeDocumentGeometry(document)` normaliza o documento para geometria fisica.
  - Gera paginas com `MediaBox`, `BleedBox`, `TrimBox`.
  - Gera frames como `rectOnTrim`, relativos ao trim.

- `diagramador/src/engine/frame-filler.ts`
  - Distribui linhas nos frames (recebe `Frame[]`, hoje derivados da geometria fisica).
  - Honra leading (`lineHeight`), `spaceBefore`/`spaceAfter`, alinhamento, `indent` (1a linha)
    e justificacao; emite `runs` posicionados por linha (`LayoutLine.runs`).
  - Freio de emergencia: quebra por caractere palavra mais larga que o frame.

- `diagramador/src/render/canvas-renderer.ts`
  - Preview Canvas atual; desenha RUN A RUN (`frame.x + line.x + run.x`), fonte/cor por run.
  - Ainda nao deve ser tratado como fonte da verdade fisica.

- `EXECUTAR-MOTOR-PRELO.md`
  - Manual operacional atualizado.

- `arquitetura-motor.html`
  - Painel central do projeto.

- `revisao-prelo-codex.md`
  - Revisao tecnica e riscos.

## O que ja foi corrigido

1. `tex-linebreak`
   - Corrigido contrato real: `Penalty` usa `cost: number` e `flagged: boolean`.
   - Teste garante que KP nao cai silenciosamente no greedy no fluxo basico.

2. Refluxo entre frames
   - Corrigida perda de espacos quando linhas restantes sao recalculadas em frame mais largo.
   - Teste cobre caso tipo `gamma deltaepsilon`.
   - Teste protege fragmento hifenizado para nao virar `al- pha`.

3. `flowStory(document, storyId)`
   - Resolve `Story.frameChainIds`.
   - Busca frames em `Document.frames`.
   - Aplica estilos de paragrafo via `document.styles`.
   - Erros testados:
     - Story ausente.
     - Frame ausente.
     - Estilo de paragrafo ausente.

4. Geometria fisica inicial
   - `printProfileToPageGeometry(PRINT_PROFILE_KDP_6x9)` gera:
     - trim `432 x 648 pt`;
     - bleed `9 pt`;
     - margens minimas `27 pt`.
   - `normalizeDocumentGeometry(document)` gera:
     - `MediaBox`;
     - `BleedBox`;
     - `TrimBox`;
     - frames relativos ao trim.

5. Frame Filler / flowStory consumindo a geometria fisica
   - `framesFromPhysicalGeometry(geometry, frameChainIds, storyId)` em
     `physical-geometry.ts` resolve a cadeia de frames a partir da geometria
     normalizada e devolve `Frame[]` derivados de `rectOnTrim` (pontos, relativo ao trim).
   - `flowStory()` agora chama `normalizeDocumentGeometry(document)` e usa essa ponte,
     em vez de ler `Document.frames` cru. `flowText()` e o preview seguem intactos.
   - Testes novos:
     - ordem segue `Story.frameChainIds`;
     - frame do layout vem de `rectOnTrim`;
     - erro claro quando o frame nao existe na geometria / nao e de texto;
     - layout de texto identico com `bleed` 0 vs 0.125 (caixas nao movem o texto).

6. Coordenadas fisicas absolutas + leading do paragrafo
   - `frameRectOnPage(geometry, frameId)` em `physical-geometry.ts` devolve o retangulo
     do frame em pontos ABSOLUTOS da pagina (offset do `TrimBox` + `rectOnTrim`).
   - `flowStory()` anexa esse retangulo a cada `FrameLayout` como `rectOnPage`
     (estrutura nova e opcional em `FrameLayout`), para o futuro PDF posicionar sem recalcular.
   - O leading deixou de ser fixo `fontSize * 1.5`: o `Token` carrega `lineHeight`
     (multiplicador) vindo do `ParagraphStyle` (via `flowStory`) ou do `EngineConfig`
     (via `flowText`); o Frame Filler usa esse valor, com fallback 1.5. KP preserva o
     `lineHeight` ao reconstruir silabas/hifens.
   - Semantica adotada: `ParagraphStyle.lineHeight` e MULTIPLICADOR do fontSize
     (ex.: 1.5 = 150%). Leading fixo em px ainda NAO e suportado.
   - Testes novos:
     - Frame Filler usa o `lineHeight` do token; fallback 1.5 sem `lineHeight`;
     - `flowStory` aplica `ParagraphStyle.lineHeight` (1.5 -> 15px, 2 -> 20px @ fontSize 10);
     - `flowStory` anexa `rectOnPage` = `TrimBox` + `rectOnTrim`;
     - `frameRectOnPage` retorna coordenadas absolutas e erra claro se o frame nao existe;
     - bleed muda `rectOnPage` mas NAO muda as linhas (texto relativo ao trim).

7. Freio de emergencia para palavra mais larga que o frame (overflow horizontal)
   - Bug encontrado em teste manual: uma sequencia longa sem espaco/hifen (ex.:
     `dqkebqkebqkbqkwebq...`) vazava para fora da caixa, pois nenhum algoritmo tinha
     ponto de quebra dentro da palavra.
   - Correcao: `enforceMaxLineWidth()` no Frame Filler garante que NENHUMA linha exceda
     `frame.width`; tokens mais largos que o frame sao quebrados por caractere
     (`charChunks`). Vale para greedy E KP (pos-processamento das linhas, independente
     do algoritmo). Linhas que ja cabem passam intactas.
   - Testes novos:
     - palavra mais larga que o frame e quebrada por caractere (greedy), sem perder
       caracteres e sem nenhuma linha ultrapassar a largura;
     - mesmo caso sob KP tambem respeita a largura.
   - Verificado tambem no preview (palavra gigante fica contida no frame).

8. Espacamento de paragrafo e alinhamento horizontal
   - `LayoutLine` agora carrega `x` (posicao horizontal relativa ao frame).
   - O Frame Filler honra, do `ParagraphStyle` (via `flowStory`):
     - `spaceBefore` (suprimido no topo do frame) e `spaceAfter` (avanco de `currentY`);
     - `alignment` `left`/`center`/`right` (calcula `x` por linha; `alignLineX`).
   - `justify` ainda se comporta como `left` (precisa de runs/espacos posicionados).
   - `indent` (recuo de primeira linha) ainda NAO foi feito (mexe na largura da quebra).
   - O canvas-renderer desenha em `frame.x + line.x` (alinhamento visivel no preview).
   - `flowText` (demo) nao usa estilos de paragrafo: continua left, sem espacamento.
   - Testes novos:
     - Frame Filler centraliza/alinha-a-direita pelo `x`; default left = 0;
     - `spaceAfter`+`spaceBefore` deslocam o `y` entre paragrafos; space-before suprimido no topo;
     - `flowStory` aplica `alignment` e `spaceAfter` vindos do estilo do documento.

9. Recuo de primeira linha (`indent`)
   - A PRIMEIRA linha do paragrafo quebra numa largura util reduzida (`frame.width - indent`)
     e e posicionada com `x += indent`; as demais linhas usam a largura cheia.
   - Combina com o alinhamento: `x = indent + alignLineX(align, lineWidth, frame.width - indent)`.
   - O contador `paragraphLinesPlaced` sobrevive a troca de frame, entao o recuo vale para
     a 1a linha do paragrafo mesmo que ela caia no frame seguinte.
   - `flowStory` carimba `indent` do `ParagraphStyle`; `flowText` (demo) usa 0.
   - Testes novos:
     - Frame Filler recua a 1a linha (que quebra mais cedo) e re-flui o resto na largura cheia;
     - `flowStory` aplica `indent` do estilo (1a linha `x = indent`, demais `x = 0`).

10. Runs posicionados + justificacao
   - `LayoutLine` agora carrega `runs: LayoutRun[]` (`{ text, x, width, style }`), com `x`
     relativo ao inicio da linha. `text`/`width` continuam (largura NATURAL) para compat.
   - `buildLineRuns()` no Frame Filler gera os runs; em `justify`, distribui o espaco livre
     (`usableWidth - naturalWidth`) igualmente entre os espacos (estica os runs de espaco).
   - Justifica todas as linhas do paragrafo MENOS a ultima (`lIdx === lines.length - 1`).
     Linha sem espacos (uma palavra) nao estica. Nunca encolhe abaixo do natural.
   - O canvas-renderer passou a desenhar RUN A RUN (`frame.x + line.x + run.x`), com fonte/cor
     por run (suporta tambem estilos mistos na linha).
   - `flowText` (demo) e left: runs naturais; preview identico ao anterior (verificado).
   - Testes novos:
     - linha gera runs com `x` crescente e soma das larguras = largura da linha;
     - `justify` faz os runs preencherem a largura util; a ULTIMA linha fica natural;
     - `flowStory` justifica via estilo do documento, exceto a ultima linha.
   - Observacao: runs sao por TOKEN, nao por glifo. Shaping por glifo (HarfBuzz) continua fora.

11. Export PDF — sub-passos 1 e 2 (RGB)
   - `engine/pdf-layout.ts` → `computePdfPlacements(geometry, frameLayouts)`: PURO. Gera, por
     pagina, as caixas `mediaBox`/`trimBox`/`bleedBox` (PDF `[x0,y0,x1,y1]`) e os runs com
     coordenadas absolutas em pontos, ja com **Y invertido** (origem inferior-esquerda do PDF).
     Baseline aproximada em `fontSize × 0.8` (refinar com metricas reais da fonte).
   - `engine/pdf-export.ts` → `renderPdf(placements)`: adaptador fino que materializa os
     placements num PDF real via `pdf-lib` (RGB, fonte Helvetica padrao por enquanto).
   - `pdf-lib` instalado (`npm i pdf-lib`).
   - `TextEngine.documentToPdf(document, options)` em `engine/index.ts` — GLUE ponta a ponta:
     roda flowStory de todas as stories, junta frameLayouts, computePdfPlacements + renderPdf.
   - Testes novos:
     - `computePdfPlacements`: 1 pagina por `Page`, caixas corretas, run em (x=81, y=559) com Y invertido;
     - `renderPdf`: PDF carregavel, 1 pagina, MediaBox/TrimBox corretos ao recarregar;
     - `documentToPdf`: documento -> PDF carregavel, 1 pagina, MediaBox correto.
   - FALTA (proximo): embutir fonte TTF real (metricas/acentos) e CMYK/PDF-X server-side.

## Testes atuais

Arquivos de teste:

- `diagramador/src/engine/line-breaker.test.ts`
- `diagramador/src/engine/frame-filler.test.ts`
- `diagramador/src/engine/index.test.ts`
- `diagramador/src/engine/pdf-layout.test.ts`
- `diagramador/src/engine/pdf-export.test.ts`
- `diagramador/src/model/print-units.test.ts`
- `diagramador/src/model/print-profiles.test.ts`
- `diagramador/src/model/physical-geometry.test.ts`

Total atual:

```text
Ver PONTO DE PARADA no topo: 26 arquivos, 200 testes.
```

## Limites atuais importantes

Nao dizer que estes pontos estao prontos:

- HarfBuzz/rustybuzz;
- PDF print-ready;
- PDF/X;
- OutputIntent/ICC;
- CMYK final;
- preflight completo de imagens alem de DPI/sangria basica;
- colunas e padding completos;
- viuvas/orfas no caminho com text-wrap de imagem;
- baseline grid com metricas reais de fonte (a versao atual usa `fontSize * 0.8`);
- editor visual WYSIWYG.

O Canvas atual e preview. Ele nao e fonte da verdade fisica.

## Proximo passo tecnico recomendado

> CONCLUIDO: geometria fisica (item 5); `rectOnPage` + leading (item 6); freio de emergencia
> (item 7); espacamento + alinhamento (item 8); `indent` (item 9); runs posicionados + justificacao
> (item 10). O motor ja produz, por pagina/frame/linha, RUNS posicionados em pontos fisicos —
> a saida necessaria para gerar PDF. `flowText()` e o preview seguem intactos.

Proximo passo natural (continuar TDD): atacar CMYK/PDF-X server-side ou estender orfas/viuvas/keeps
para o caminho com text-wrap de imagem. PDF RGB, fonte TTF, imagem bitmap, baseline grid e caixas
fisicas ja existem; PDF/X+CMYK ainda exige pos-processamento (Ghostscript).

## Prompt pronto para mandar ao Claude

Use este prompt:

```text
Voce esta continuando o projeto Prelo em /Users/alexmeiradossantos/Desktop/pasta sem título.

Leia primeiro:
- CLAUDE-HANDOFF-PRELO.md
- EXECUTAR-MOTOR-PRELO.md
- revisao-prelo-codex.md
- arquitetura-motor.html

Contexto essencial:
Prelo e um motor de diagramacao de livros fisicos impressos. Nao e ebook, nao e KDP-only, nao e UI/SaaS agora. Prioridade absoluta: motor fisico deterministico, medidas reais, frames encadeados, PDF/preflight depois.

Estado atual verificado:
cd /Users/alexmeiradossantos/Desktop/pasta\ sem\ título/diagramador
npm test && npm run build && npm run lint

Ultimo resultado conhecido:
- 25 arquivos de teste
- 200 testes passando
- build passando
- lint passando

Nao reescreva arquitetura. Continue com TDD onde aplicavel.

Proxima tarefa recomendada:
UI de edicao de imagem sobre o motor real: upload, drag/drop, resize handles, crop e painel de
text-wrap (escolher mode bounding-box/alpha/polygon e `sides` left/right/both/largest). Ja feito:
motor de text-wrap com MULTI-INTERVALO por banda, `sides` real, alpha e polygon pela mesma API,
imagem central com texto dos dois lados ponta-a-ponta (flowStory/preview/PDF). CMYK/PDF-X fica para
um passo server-side posterior (Ghostscript).

Arquivos relevantes:
- diagramador/src/model/physical-geometry.ts
- diagramador/src/model/print-units.ts
- diagramador/src/engine/index.ts
- diagramador/src/engine/frame-filler.ts
- diagramador/src/engine/types.ts
- diagramador/src/model/types.ts

Regras:
1. Escreva testes falhando antes.
2. Rode o teste focado e confirme o RED.
3. Implemente o minimo.
4. Rode npm test && npm run build && npm run lint.
5. Atualize EXECUTAR-MOTOR-PRELO.md e arquitetura-motor.html se o comportamento mudar.
6. Nao diga que PDF, justificação visual, runs posicionados, preflight ou HarfBuzz estao prontos.
```

## Comando de verificacao obrigatorio

Ao terminar qualquer etapa:

```bash
cd /Users/alexmeiradossantos/Desktop/pasta\ sem\ título/diagramador
npm test && npm run build && npm run lint
```
