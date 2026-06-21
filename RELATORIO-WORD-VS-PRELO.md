# Relatório — Por que o PDF do Word está melhor diagramado que o do Prelo

> Pesquisa (NÃO codar nesta etapa). Objetivo: entender o que o Word faz melhor na
> composição/diagramação e o que o motor do Prelo pode aprender. Documento salvo
> incrementalmente — cada seção é gravada assim que descoberta, para não se perder se
> o limite de tokens estourar.
>
> Status: ✅ CONCLUÍDO. Seções 1–3 (comparação empírica) verificadas nos PDFs reais; seções 4–5–7
> (como Word/InDesign/LaTeX compõem + recomendações priorizadas) sintetizadas de 6 frentes de
> pesquisa web. Não foi codado nada — é relatório de decisão.

---

## 1. Os dois artefatos (metadados reais — `pdfinfo`/`pdffonts`)

| | **Prelo** (`pdf exportado pelo prelo.pdf`) | **Word** (`texto feito em word.pdf`) |
|---|---|---|
| Produtor | pdf-lib | Microsoft Word |
| Página | 450×666 pt (6×9" + sangria) | 595×842 pt (A4) |
| Páginas | 8 | 3 |
| Fonte | CrimsonText-Regular, **embutida INTEIRA (sub=no)** | Aptos, **subconjunto (sub=yes)** |
| Encoding | Identity-H (CID) | WinAnsi |
| Tagged PDF | **não** | **sim** (estruturado/acessível) |
| Metadata stream | não | sim |
| Tamanho | **169 KB** (8 pág.) | **31 KB** (3 pág.) |

Observações:
- Páginas diferentes (6×9 livro vs A4) — esperado, são setups distintos. A comparação é de
  QUALIDADE de composição, não de tamanho de página.
- Prelo **não faz subset da fonte** → arquivo ~5× maior por página. Word faz subset.
- Word gera **PDF tagged** (estrutura lógica, acessibilidade) e metadados; Prelo não.

## 2. O defeito mais grave do Prelo: quebras espúrias de linha/parágrafo

Texto extraído (`pdftotext`) da página 1:

**Prelo (quebrado):**
```
No princípio, quando ainda não existiam cidades,
nomes
para os continentes ou sequer uma maneira organizada de medir o tempo...
```
**Word (correto):**
```
No princípio, quando ainda não existiam cidades, nomes para os continentes ou sequer
uma maneira organizada de medir o tempo...
```

No render do Prelo, a linha 1 fica **curta e ragged** ("...cidades,") e **"nomes" aparece
sozinho** numa linha — exatamente a "linha solta" que o usuário reclamou. O Word mantém
"cidades, nomes para os continentes" fluindo na mesma linha.

**Causa-raiz (hipótese forte, já diagnosticada em sessão anterior):** o editor lê o texto do
`contenteditable` via `e.currentTarget.innerText`. O `innerText` **serializa as quebras VISUAIS
do navegador como `\n` reais**. Resultado: o manuscrito é poluído com quebras rígidas nos pontos
de wrap; o motor então trata cada quebra como fim de parágrafo → "nomes" vira um parágrafo de uma
palavra → última linha de parágrafo (não justificada) → linha solta. **Isto NÃO é defeito do motor
de composição; é corrupção do texto na camada de edição.** É o item de maior impacto visual.

## 3. Comparação de composição (o que dá para ver nos renders)

- **Justificação:** ambos justificam. No Prelo, as linhas "normais" justificam com a margem direita
  reta (funciona). O problema aparece só nas linhas afetadas pelo defeito da seção 2.
- **Hifenização:** este export do Prelo mostra **0 hífens de fim de linha**; o Word também **não
  hifeniza** (padrão do Word é hifenização desligada). Ou seja, a diferença de "feel" NÃO vem de
  hifenização aqui.
- **Medida (largura da coluna):** Word em A4 tem linha longa (~90 caracteres) → a justificação
  fica visualmente uniforme (linhas longas "escondem" folgas de espaço). Prelo em 6×9 tem medida
  estreita (~50 caracteres) → a mesma justificação EXPÕE mais as folgas entre palavras. Medida
  estreita + justificada **exige** melhor controle de espaçamento e/ou hifenização para não abrir
  "rios". Esta é uma diferença estrutural real entre os dois documentos.
- **Espaçamento:** o Word mantém espaçamento entre palavras muito uniforme; o Prelo, por ser
  medida estreita e (neste export) sem hifenização, tende a folgas maiores.

### Conclusão parcial (seções 1–3)
O PDF do Word parece melhor por uma combinação de: (a) **texto íntegro** (sem quebras espúrias — o
Prelo perde aqui por causa do `innerText`), (b) **medida larga** que perdoa a justificação, e
(c) detalhes de qualidade de fonte/PDF (subset, tagged). O motor do Prelo **já justifica**; o que
falta é integridade do texto + qualidade fina de composição em medida estreita.

---

## 4. Como o Word (e o padrão-ouro) compõem — descobertas da pesquisa

> **A virada mais importante:** o **Word NÃO é o teto de qualidade — é o piso.** Ele usa quebra de
> linha **gananciosa** (greedy, linha a linha) no Print Layout/exportação. O Prelo já usa
> **Knuth-Plass (tex-linebreak)**, que é o algoritmo do TeX/LaTeX — ou seja, **o Prelo já nasce
> ACIMA do Word** nessa dimensão. O PDF do Word pareceu melhor por outros motivos (texto íntegro,
> medida larga, motor de render), não por composição superior. O alvo certo do Prelo é
> **InDesign/LaTeX**, não o Word.

### 4.1 Quebra de linha e justificação
- **Word = greedy/linha-a-linha** (decisão local, irrevogável) → produz "rios" e buracos, pior em
  medida estreita. (Existe um modo "optimal paragraph"/Knuth-Plass no Word, mas **só no Read Mode**,
  NÃO na exportação/Print Layout.)
- **Justificação do Word:** só estica **espaço entre palavras** por padrão (sem teto) → buracos.
  InDesign usa **cascata**: espaço entre palavras (faixa estreita) → letter-spacing ±2% → escala de
  glifo ±2%.
- **Última linha** não é esticada (correto). O bug clássico "linha esticada de margem a margem" vem
  de quebra forçada (Shift+Enter) dentro de parágrafo justificado — o Word esconde a correção numa
  opção obscura; deveria ser padrão.
- **Lição p/ Prelo:** já temos o motor certo (tex-linebreak). Garantir que rode por **parágrafo
  inteiro** (não por linha) e **nunca delegar ao CSS `text-align:justify`** (que é greedy = nível Word).

### 4.2 Por que o texto do Word "parece" uniforme (não é o que se pensa)
- **~90% vem do motor de render (DirectWrite + ClearType): posicionamento subpixel e larguras de
  avanço fracionárias** — não acumula erro de arredondamento ao longo da linha. **~10% da fonte.**
- **Kerning de pares vem DESLIGADO** por padrão no corpo de texto do Word (mito desfeito).
- **Lição p/ Prelo:** no PDF (vetorial, resolução-independente), **alimentar advance widths reais e
  fracionários** (opentype.js) **sem arredondar para inteiro** já iguala/supera o subpixel do Word
  "de graça". O risco real é arredondar avanços no loop de layout.

### 4.3 Hifenização
- **Word: hifenização OFF por padrão**; e o campo "Hyphenation Zone" está **morto no .docx** (Word
  2013+). Logo, justificado do Word em coluna estreita quase sempre tem buracos.
- **Padrão-ouro:** hifenização **integrada** à decisão de quebra (Knuth-Plass trata o hífen como
  penalidade balanceada contra esticar espaço), padrões de **Liang/TeX** por idioma, limite de
  **hífens consecutivos** (evitar "escada"), mínimos de letras antes/depois.
- **Lição p/ Prelo:** **ligar hifenização pt-BR por padrão** no corpo justificado (já temos
  hypher+hyphenation.pt) — vantagem direta sobre o Word. Em medida estreita ela é **obrigatória**.

### 4.4 Composição de parágrafo e página (Word acerta aqui)
- Word liga por padrão **viúvas/órfãs**; tem **keep-with-next**, **keep-lines-together**,
  **page-break-before** — exatamente o que o Prelo implementou na Fase 1. ✅
- **Entrelinha "Single" ≠ corpo da fonte:** vem das métricas **OS/2 `usWinAscent`+`usWinDescent`**
  (ou `sTypo*` quando `USE_TYPO_METRICS`). Quem calcula `line-height = fontSize` erra a paginação.
- **Lição p/ Prelo:** derivar a altura de linha das **métricas reais da fonte** (opentype.js), não
  do corpo nominal — fundação de paginação confiável e baseline grid.

### 4.5 O padrão-ouro além do Word (o alvo real do Prelo)
- **Total-fit** (Knuth-Plass / Adobe Paragraph Composer): otimiza o parágrafo inteiro, distribui o
  "mal" — espaçamento uniforme, sem rios. **(Prelo já tem via tex-linebreak.)**
- **Microtipografia** (pdfTeX/`microtype`, base do InDesign): **protrusão de margem** (Optical Margin
  Alignment — pontuação/curvas ultrapassam levemente a margem → borda opticamente reta) + **expansão
  de fonte** (hz-program de Zapf/Karow — escalar glifos ±2% para tirar pressão dos espaços). É o que
  dá a "mancha homogênea" inconfundível de livro fino.

### 4.6 Viabilidade no stack do Prelo (TS · canvas · pdf-lib+fontkit · opentype.js · tex-linebreak)
- ⚠️ **`pdf-lib.drawText` NÃO aplica kerning/ligaduras (GPOS/GSUB).** Para refinamento real é preciso
  dirigir o posicionamento via operador **TJ** (`page.pushOperators`) com avanços de um shaper.
- **HarfBuzz (`harfbuzzjs`, WASM)** como **fonte única de verdade** de larguras/posições para canvas
  **e** PDF → kerning/ligaduras de produção + elimina divergência preview↔PDF.
- **Subset de fonte:** trivial — `embedFont(bytes, { subset: true })` (testar por família, fallback
  `subset:false`).
- **Soft hyphen (U+00AD):** tex-linebreak já suporta (`softHyphenPenalty`); **não emitir o glifo
  fora do fim de linha** (vira caractere fantasma no PDF) e usar `stripSoftHyphens` no output.
- **Limites de glue:** `glueStretchFactor`/`glueShrinkFactor` + `renderLineAsUnjustifiedIfAdjustmentRatioExceeds`
  (cair para ragged em vez de abrir buracos).

---

## 5. O que o Prelo deve incorporar — recomendações priorizadas (impacto ÷ esforço)

| # | Recomendação | Impacto | Esforço | Fase |
|---|---|---|---|---|
| 1 | **Parar de ler o `innerText`** — serializar o manuscrito preservando parágrafos lógicos (só `\n` em fronteira de bloco real), ou manter modelo canônico e usar o contenteditable só como view. **Corrige o pior defeito ("nomes" sozinho).** | alto | baixo | ganho rápido |
| 2 | Tratar **toda quebra forçada (soft return) e a última linha como "não esticar"** por padrão (glue final esticável no tex-linebreak). | alto | baixo | ganho rápido |
| 3 | Garantir tex-linebreak **por parágrafo** + canvas e PDF usando a **mesma medição** (opentype.js advanceWidth, não `ctx.measureText`); não arredondar posições. | alto | médio | paridade preview↔PDF |
| 4 | **Hifenização pt-BR LIGADA por padrão** no corpo justificado (Hypher + U+00AD; leftmin/rightmin 2/3; `doubleHyphenPenalty` alto). | alto | médio | composição (medida estreita) |
| 5 | **Apertar limites de glue** (espaço ~80–133%) + cair para ragged quando estourar (`renderLineAsUnjustifiedIfAdjustmentRatioExceeds`). | médio | baixo | ganho rápido |
| 6 | **Subset de fonte no PDF** (`embedFont {subset:true}`) — corrige o PDF ~5× maior. | médio | baixo | qualidade de PDF |
| 7 | **Entrelinha pelas métricas da fonte** (OS/2 `usWin`/`sTypo` via opentype.js), não pelo corpo nominal. | médio | alto | paginação |
| 8 | **Paginação por parágrafo** (viúvas/órfãs ON, keep-with-next encadeado, keep-together, page-break-before, recto/verso). *(Fase 1 já cobriu boa parte.)* | alto | médio | composição (paginação) |
| 9 | **Kerning + ligaduras reais no PDF** via shaping (HarfBuzz como fonte única) → trocar `drawText` por **TJ** dirigido. | médio | alto | microtipografia |
| 10 | **Microtipografia:** protrusão de margem (Optical Margin Alignment) + expansão de fonte ±2% (Tz no PDF). | médio | alto | microtipografia |

### Ganhos rápidos (alto impacto / baixo esforço — fazer primeiro)
- **#1** serialização sem `innerText` (corrige o "nomes" sozinho).
- **#2** soft return + última linha = não esticar.
- **#5** apertar glue + fallback ragged.
- **#4** hifenização pt-BR por padrão (médio, mas altíssimo retorno em 6×9).
- **#6** subset de fonte no PDF.
- **#3** paridade de medição canvas↔PDF (opentype.js; não arredondar).
- Modo **debug** que destaca linhas com adjustment ratio > ~3.0× (QA de rios).

### Apostas maiores (alto impacto / alto esforço — depois)
- **HarfBuzz como fonte única** de larguras/posições (canvas + PDF via `pushOperators`+`TJ`): kerning
  GPOS + ligaduras GSUB reais e fim da divergência preview↔impressão.
- **Entrelinha pelas métricas** + modo "Exactly" para travar baseline grid.
- **Paginador** completo (viúvas/órfãs N linhas, keep-with-next encadeado, recto/verso com página em
  branco automática para capítulo em página ímpar).
- **Microtipografia plena** (protrusão + expansão ±2%, idealmente realimentada ao tex-linebreak).
- Sliders que o Word abandonou: **"densidade de hífens"** e hifenização que **escala com a largura
  da coluna**.

### O que fazer ALÉM do Word (para realmente superá-lo — diferencial competitivo)
1. **Total-fit (Knuth-Plass) por parágrafo** — já temos; só blindar (não cair no CSS justify).
2. **Hifenização ligada por padrão** e integrada à quebra (Word vem OFF).
3. **Cascata de espaço** estilo InDesign (palavra → letra ±2% → glifo ±2%) em vez de só esticar espaço.
4. **Microtipografia** (protrusão + expansão) — o Word não tem.
5. **WYSIWYG print-first real** (preview == PDF via uma só fonte de métricas) — o Word separa "tela
   vs impressão".
6. **Old-style figures + ligaduras ligadas por padrão** no corpo serifado.
7. **Subset + (passo maior) PDF tagged/PDF-X** para produção (KDP/IngramSpark).

---

## 7. Conexão com o roadmap atual (já registrado no handoff)
- **#1, #2, #5** = ganhos rápidos novos → entram **antes** de fechar a Fase 1 (composição editorial),
  porque o #1 corrige o defeito mais visível e é barato.
- **#4** (hifenização por padrão) + **#3** (paridade de medição) = parte da **Fase 1**.
- **#8** (paginação) = já em andamento na **Fase 1**.
- **#6** (subset) = ganho rápido de **qualidade de PDF** (encaixa na Fase 2/qualidade).
- **#9, #10** (HarfBuzz/shaping, microtipografia) = **Fase 6** (shaping real) do roadmap — apostas
  maiores que levam o Prelo ao nível InDesign/LaTeX.

## Fontes (principais)
Microsoft (text-justification, line-and-word-breaking, control-pagination, OS/2 spec, DirectWrite),
Adobe InDesign (text-composition, Paragraph Composer, Optical Margin Alignment), Knuth-Plass
(artigo original + wiki), pdfTeX/`microtype` (Hàn Thế Thành; hz-program de Zapf/Karow), bibliotecas
`robertknight/tex-linebreak` (+ fork `egilll/tex-linebreak2`), `harfbuzzjs`, `opentype.js`,
`pdf-lib`/`@pdf-lib/fontkit`, `hypher`. Lista completa de URLs no arquivo de saída do workflow.

> Status: ✅ **CONCLUÍDO.** Comparação empírica (1–3) verificada nos PDFs reais; pesquisa (4) e
> recomendações priorizadas (5/7) sintetizadas de 6 frentes de pesquisa web. Próximo passo é
> **decisão de produto** sobre por onde começar (sugestão: ganhos rápidos #1, #2, #5, #6) — sem
> codar nesta etapa, conforme pedido.

## 6. Riscos e limitações desta análise
- Os dois documentos têm página/medida diferentes (6×9 vs A4); parte da diferença de "feel" vem
  disso, não só do motor.
- A causa-raiz da seção 2 é hipótese forte baseada no código do editor (camada `innerText`);
  precisa ser confirmada inspecionando o manuscrito salvo (localStorage) — fica para a fase de código.
