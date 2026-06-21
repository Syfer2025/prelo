# Revisao tecnica do plano Prelo

Data da revisao: 2026-06-19  
Escopo analisado: `arquitetura-motor.html`, prototipo JS, app React/TypeScript `diagramador`, arquivos de viabilidade e checagens externas pontuais.

Atualizacao pos-revisao externa: os dois achados criticos sobre o contrato real do `tex-linebreak` e a perda de espacos no refluxo entre frames foram reproduzidos, corrigidos e cobertos por testes. A primeira API `flowStory(document, storyId)` tambem foi adicionada com testes para cadeia de frames, Story ausente, frame ausente e estilo ausente. A camada de unidades agora deriva geometria de pagina em pontos PostScript a partir de perfis de impressao; a camada `physical-geometry.ts` normaliza documentos em MediaBox/BleedBox/TrimBox e frames relativos ao trim; e `flowStory()` ja consome essa geometria via `framesFromPhysicalGeometry()`. A saida do layout passou a carregar coordenadas fisicas absolutas por frame (`rectOnPage` = TrimBox + rectOnTrim, via `frameRectOnPage()`) e o leading deixou de ser fixo: cada linha usa o `ParagraphStyle.lineHeight` (multiplicador), com fallback 1.5. O estado atual verificado em 2026-06-19 e: `npm test` com 45 testes passando, `npm run build` passando e `npm run lint` passando. As criticas sobre justificação visual, runs/glifos posicionados, PDF print-ready e shaping tipografico avancado continuam validas (e o Canvas ainda nao consome a saida fisica como fonte da verdade).

## Veredito curto

O rumo conceitual do Prelo esta correto: separar `Story` de `Frame`, calcular layout fora do DOM e usar Canvas apenas como preview e uma decisao coerente para um diagramador de livros. Essa e provavelmente a parte mais bem pensada do plano.

O problema e que o documento ainda precisa separar com rigor o que esta implementado do que esta arquitetado. A fundacao TypeScript foi saneada, mas os pontos que realmente quebram o produto continuam caros: composicao tipografica deterministica, edicao WYSIWYG no canvas, text-wrap real, export PDF/X/CMYK e preflight. Hoje eu trataria a Fase 0R como uma base tecnica revalidada, nao como um motor profissional pronto.

Minha recomendacao: antes de gastar dinheiro com VPS, UI completa ou editor interativo, fazer 3 spikes obrigatorios e baratos:

1. Motor tipografico minimo compilando, testado e deterministico.
2. Export PDF print-ready validado por preflight real em pelo menos um destino: KDP ou IngramSpark.
3. Text-wrap por retangulo/poligono/alpha provando performance e qualidade em documento de 30-50 paginas.

Se esses tres spikes falharem ou virarem um buraco, o produto deve ser reposicionado para algo mais simples: formatador opinativo de livros, nao "InDesign leve no navegador".

## Evidencias objetivas executadas

Comandos rodados:

```bash
cd /Users/alexmeiradossantos/Desktop/pasta\ sem\ título/diagramador
npm test
npm run build
npm run lint
```

Resultado atual apos saneamento:

- `npm test`: 6 arquivos de teste, 45 testes passando.
- `npm run build`: `tsc -b && vite build` passando.
- `npm run lint`: `eslint .` passando.
- Portanto, a fundacao TypeScript voltou a ser verificavel. Isso nao transforma o prototipo em motor profissional, mas remove o bloqueio tecnico mais imediato.

## Achados prioritarios

### P0 resolvido. A base voltou a compilar, mas isso nao conclui o motor

Evidencia local:

- O HTML agora declara "FASE 0R" e "Fundacao Revalidada".
- `npm test` passa com 45 testes.
- `npm run build` passa.
- `npm run lint` passa.

Impacto:

O bloqueio de compilacao foi removido. O risco agora deixa de ser "a base nao roda" e passa a ser "a base ainda nao modela o documento fisico completo": `Story`, paginas, runs posicionados, PDF e preflight continuam como lacunas de produto.

Recomendacao:

Manter build/lint/test como portao obrigatorio e ampliar os testes para `Story`, pagina fisica, frames encadeados por ID, runs posicionados e PDF.

### P0 parcial. Knuth-Plass agora quebra linhas, mas ainda nao justifica visualmente

Evidencia local:

- `line-breaker.ts` cria `CustomPenalty` com `cost` e `flagged: boolean` em `diagramador/src/engine/line-breaker.ts:28-35`.
- A declaracao local de `tex-linebreak` agora tambem espera `cost` e `flagged: boolean` em `diagramador/src/types-libs.d.ts`.
- O teste `uses the KP path without falling back to greedy` garante que o caminho KP nao cai silenciosamente no greedy.
- O renderer desenha cada linha com `ctx.fillText(line.text, frame.x, frame.y + line.y)` em `diagramador/src/render/canvas-renderer.ts:98-105`, sem distribuir espacos para justificar a linha.

Impacto:

O plano nao pode mais vender "Knuth-Plass justificado" como entrega atual. O que existe hoje e quebra de linha KP/hifenizacao testada. A justificação tipografica final depende de `LayoutLine` carregar runs/espacos posicionados e o renderer aplicar stretch/shrink, o que ainda nao foi implementado.

Recomendacao:

Separar claramente:

- line breaking: onde a linha quebra;
- justification: quanto cada espaco estica/encolhe;
- shaping: quais glifos existem e suas posicoes;
- rendering: desenhar glifos/espacos nas coordenadas calculadas.

O `LayoutLine` precisa carregar runs/glifos/espacos posicionados, nao apenas `text`.

### P0. O claim "PDF identico ao preview" ainda nao e sustentavel

Evidencia local:

- O HTML promete que o PDF exportado sera identico ao preview em `arquitetura-motor.html:390-391`.
- O `LayoutLine` guarda texto de linha, largura, altura e estilo, mas nao guarda posicao por glifo em `diagramador/src/engine/types.ts:37-43`.
- Existe `PositionedGlyph`, mas nao esta integrado ao pipeline em `diagramador/src/engine/types.ts:31-35`.
- O Canvas usa `fillText`, delegando shaping/renderizacao ao browser em `diagramador/src/render/canvas-renderer.ts:98-105`.

Impacto:

Canvas `fillText`, pdf-lib, opentype.js e Ghostscript nao formam automaticamente a mesma engine de texto. Se o preview e o PDF usarem caminhos diferentes, mudam kerning, ligaturas, fallback de fonte, espacos, acentos e quebras. Esse e o tipo de divergencia que faz uma grafica rejeitar arquivo ou uma pagina ficar diferente do esperado.

Recomendacao:

O motor deve gerar uma representacao final unica:

- paginas;
- frames;
- linhas;
- runs;
- glifos ou, no minimo, spans posicionados;
- caixas Trim/Bleed/Media;
- assets referenciados.

Canvas e PDF devem ser apenas dois renderizadores dessa mesma saida. Nao devem recalcular texto.

### P0 parcial. "Story != Frame" entrou na engine, mas ainda nao fecha layout fisico

Evidencia local:

- `Story` existe como tipo em `diagramador/src/model/types.ts:74-78`.
- `Document.frames` agora registra frames por ID em `diagramador/src/model/types.ts`.
- `TextEngine.flowStory(document, storyId)` resolve `Story.frameChainIds` e reutiliza o pipeline atual em `diagramador/src/engine/index.ts`.
- `src/engine/index.test.ts` cobre ordem da cadeia de frames, Story ausente, frame ausente e estilo ausente.
- A demo usa `DEMO_FRAMES` hardcoded em `diagramador/src/App.tsx:17-37`.

Impacto:

O principio arquitetural comecou a ser provado no motor. A lacuna agora nao e mais a inexistencia de `flowStory()`, e sim a profundidade do layout fisico: master pages, variaveis, colunas, padding, ordem fisica de paginas, recomposicao incremental e runs posicionados continuam pendentes.

Recomendacao:

Proximo passo tecnico nao deve ser UI. Deve ser evoluir `flowStory(document, storyId)` com:

- paginas fisicas reais;
- colunas e padding de text frame;
- teste de overflow;
- teste de frame com larguras diferentes;
- teste de paragrafo que atravessa frames;
- preparacao para runs posicionados.

### P1. Requisitos marcados como "implementados" estao majoritariamente apenas tipados

Evidencia local:

- O HTML diz "13 / 22 requisitos cobertos" em `arquitetura-motor.html:377-378`.
- "Estilos de paragrafo" e "Estilos de caractere" aparecem como implementados em `arquitetura-motor.html:545-557`.
- O modelo tem interfaces ricas em `diagramador/src/model/types.ts:24-60`.
- O motor atual cria um `baseStyle` unico e transforma o texto em um unico `Span` em `diagramador/src/engine/index.ts:45-63`.

Impacto:

Ter tipo nao equivale a comportamento. Exemplo: `orphans`, `widows`, `keepWithNext`, `dropCapLines`, `smallcaps`, `baselineShift`, `tabStops` e `tocLevel` existem, mas nao ha algoritmo aplicando esses recursos. Isso mascara o tamanho real do projeto.

Recomendacao:

Mudar status para quatro categorias:

- `modelado`: existe no schema;
- `calculado`: o motor aplica;
- `renderizado`: aparece corretamente no preview;
- `exportado`: sai corretamente no PDF.

Hoje muitos itens estao apenas em `modelado`.

### P1. A stack de PDF esta subestimada: pdf-lib sozinho nao entrega PDF/X print-ready

Evidencia local:

- O HTML planeja exportacao com `pdf-lib` em `arquitetura-motor.html:574-578`.
- A Fase 6 adiciona Ghostscript depois, em `arquitetura-motor.html:1053-1068`.

Evidencia externa:

- A propria lista de features do `pdf-lib` fala em criar/modificar PDFs, desenhar texto/imagens/vetores e embutir fontes, mas nao promete PDF/X, OutputIntent, preflight ou gestao ICC completa: https://github.com/Hopding/pdf-lib
- A API de `pdf-lib` tem tipo CMYK, mas isso nao significa PDF/X completo com OutputIntent e validacao: https://pdf-lib.js.org/docs/api/interfaces/cmyk
- A documentacao do Ghostscript exige arquivo de definicao PDF/X e ICC profile para OutputIntent, alem de boxes corretas como TrimBox/BleedBox: https://ghostscript.readthedocs.io/en/latest/VectorDevices.html

Impacto:

Export print-ready nao e "desenhar um PDF". E fechamento grafico: fontes embutidas/subset, TrimBox, BleedBox, MediaBox, OutputIntent, conversao CMYK, limite de tinta, imagens em DPI correto, transparencia, overprint e validacao. Se isso ficar para o fim, pode invalidar a arquitetura inteira.

Recomendacao:

Fazer agora um spike de export com um documento minimo:

- 4 paginas;
- texto preto 100K;
- uma imagem 300ppi;
- bleed correto;
- fonte embutida;
- PDF/X-1a ou PDF/X-3;
- preflight em Acrobat/callas ou validador aceito pela grafica.

So depois escolher definitivamente `pdf-lib + Ghostscript`, PrinceXML, callas/pdfRest, ou outro pipeline.

### P1. A regra de margens KDP esta inconsistente no codigo

Evidencia local:

- O preset KDP tem `bleed: 0.125`, mas `top`, `bottom` e `outside` em `0.25` em `diagramador/src/model/types.ts:294-307`.

Evidencia externa:

- A pagina oficial da Amazon KDP diz que, com bleed, as margens superior, inferior e externa devem ser pelo menos `0.375"`; sem bleed, `0.25"`. Tambem confirma bleed de `0.125"` e tabela de gutter por paginas: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6

Impacto:

Esse tipo de detalhe causa rejeicao automatica no upload do KDP. E tambem mostra que presets "reais" precisam ser versionados e testados contra documentacao oficial, nao apenas digitados no modelo.

Recomendacao:

Criar testes de presets por destino:

- KDP sem bleed;
- KDP com bleed;
- IngramSpark color/BW;
- offset BR configuravel por grafica.

Cada preset deve apontar para fonte/documentacao e data de verificacao.

### P1. Edicao WYSIWYG diretamente no canvas esta muito subestimada

Evidencia local:

- A Fase 2 promete hit-testing, caret, selecao entre frames, edicao incremental e undo/redo em 3-4 semanas em `arquitetura-motor.html:972-989`.

Impacto:

Editar texto no canvas nao e so desenhar um cursor. Envolve IME, selecao, copy/paste, acessibilidade, undo granular, atalhos, composicao de caracteres, zoom/pan, hit-testing por glifo, selecao atravessando frames, scroll e reflow incremental. Isso e um subsistema de editor, nao uma etapa pequena.

Recomendacao:

MVP mais seguro:

- editor textual estruturado em painel lateral ou ProseMirror/Tiptap;
- canvas como preview paginado;
- edicao direta no canvas apenas para mover/redimensionar frames e imagens;
- caret no canvas so depois que o motor de layout estiver estavel.

### P1. Text-wrap foi jogado tarde demais para uma feature que pode destruir o motor

Evidencia local:

- Text-wrap fica para Fase 5 em `arquitetura-motor.html:1033-1049`.
- O modelo ja permite `bounding-box`, `polygon` e `alpha-channel` em `diagramador/src/model/types.ts:125-132`.

Impacto:

Text-wrap nao e uma feature lateral. Ele altera a largura util linha a linha, interfere no Knuth-Plass, no overflow, na paginacao e na performance. Se o produto depende de livros com imagens, isso precisa ser provado antes de construir UI de edicao rica.

Recomendacao:

Trazer text-wrap para spike inicial, mas com escopo menor:

1. bounding-box;
2. poligono manual simples;
3. alpha-channel simplificado somente depois.

Nao começar por marching squares em tempo real. Comecar por algoritmo de bandas horizontais: para cada linha Y, calcular intervalos bloqueados e largura disponivel.

### P1. O plano de tipografia profissional deveria considerar HarfBuzz/rustybuzz, nao apenas opentype.js

Evidencia local:

- Fase 1 depende de `opentype.js` para metricas reais em `arquitetura-motor.html:963-965`.
- O codigo mede `font.stringToGlyphs()` e `font.getKerningValue()` em `diagramador/src/fonts/font-metrics.ts:16-37`.

Evidencia externa:

- `opentype.js` declara suporte a kerning, ligaturas e leitura de fontes, mas isso nao substitui automaticamente um shaper completo para textos complexos: https://github.com/opentypejs/opentype.js

Impacto:

Para portugues simples em Lora/EB Garamond, `opentype.js` pode servir como etapa inicial. Para qualidade profissional, scripts complexos, ligaturas OpenType, features de fonte, fallback e clusters Unicode, um shaper real como HarfBuzz/rustybuzz e mais apropriado. Se voce prometer "profissional", a regua sobe.

Recomendacao:

Definir explicitamente o suporte inicial:

- MVP: portugues/latim, fontes embarcadas, sem scripts complexos.
- V1: ligaturas e kerning melhor.
- V2: HarfBuzz/rustybuzz se o produto exigir qualidade tipografica real.

### P1. Mistura de unidades fisicas, pixels e pontos pode virar bug caro

Evidencia local:

- `Page.width/height` sao definidos como px a 72dpi em `diagramador/src/model/types.ts:134-139`.
- `PrintProfile` usa polegadas em `diagramador/src/model/types.ts:200-212`.
- O Canvas usa dimensoes fixas 700x600 em `diagramador/src/App.tsx:49-50`.

Impacto:

PDF usa pontos PostScript (`1pt = 1/72in`). Canvas usa CSS pixels e DPR. Grafica fala em mm/polegadas/ppi. Misturar tudo como "px" faz bugs sutis em bleed, margens, DPI de imagem, lombada e PDF final.

Recomendacao:

Escolher uma unidade interna canonica:

- pontos PDF para layout impresso; ou
- microns/inteiros para geometria fisica.

Canvas deve ser apenas uma transformacao de visualizacao: `physicalUnit -> screenPx`.

### P2. Undo/redo com Zustand/Immer pode ficar caro em documento grande

Evidencia local:

- Fase 2 sugere Zustand/Immer para historico completo em `arquitetura-motor.html:987-989`.

Impacto:

Snapshots grandes de documento + layout podem consumir memoria e tornar o app lento. Undo de diagramador precisa registrar comandos/transacoes, nao necessariamente clonar todo o documento a cada tecla ou drag.

Recomendacao:

Para texto, preferir transacoes do editor estruturado. Para layout, usar command pattern:

- `MoveFrame`;
- `ResizeFrame`;
- `UpdateStyle`;
- `InsertText`;
- `DeleteText`.

Guardar estado serializavel, mas nao salvar layout derivado no historico.

### P2. Performance ainda nao tem arquitetura de reflow incremental

Evidencia local:

- `App.tsx` recalcula `engine.flowText(text, DEMO_FRAMES, { algorithm })` a cada draw em `diagramador/src/App.tsx:93-109`.
- O motor atual recebe todo o texto e todos os frames a cada chamada.

Impacto:

Isso serve para demo curta, mas nao para livro. Um livro de 200 paginas precisa:

- cache de shaped runs;
- cache de paragrafos;
- invalidacao a partir do ponto editado;
- layout em worker;
- virtualizacao de paginas visiveis;
- cancelamento/debounce durante digitacao.

Recomendacao:

Criar desde cedo uma API incremental, mesmo que internamente ainda recalcule tudo. Exemplo:

- `layoutDocument(document, invalidationRange)`;
- `layoutStory(storyId, fromParagraphIndex)`;
- `measureCache`.

## Decisoes boas que eu manteria

1. `Story != Frame` e a abstracao certa. Isso aproxima o projeto de DTP real e evita acoplamento entre conteudo e geometria.
2. Nao depender de DOM/contenteditable para calcular paginas fisicas e uma decisao correta para print fidelity.
3. Canvas como preview rapido e razoavel, desde que nao seja a fonte da verdade tipografica.
4. TypeScript estrito e adequado, e agora precisa continuar protegido por build/lint/test em toda mudanca.
5. Pensar em Ghostscript/VPS para CMYK/PDF/X e correto, mas precisa virar spike validado agora, nao promessa de Fase 6.

## Plano de acao recomendado

### Semana 1: sanear fundacao

- [x] Corrigir build e lint.
- [x] Remover incompatibilidade de `erasableSyntaxOnly` trocando `enum` por const objects.
- [x] Corrigir contrato real de `tex-linebreak`.
- [x] Adicionar testes de `breakParagraph`, `fillFrames`, `flowStory`, unidades fisicas e preset KDP com bleed.
- [x] Rebaixar status do HTML para refletir realidade.
- [ ] Adicionar testes diretos de `tokenize` e `shape`.
- [x] Derivar geometria de pagina em pontos PostScript a partir de perfil de impressao.
- [x] Normalizar documento fisico em MediaBox/BleedBox/TrimBox e frames relativos ao trim.
- [x] Fazer `flowStory()` consumir frames derivados da geometria normalizada via `framesFromPhysicalGeometry()`.
- [x] Levar a saida do layout para coordenadas fisicas absolutas da pagina (`rectOnPage`) e honrar `ParagraphStyle.lineHeight` no Frame Filler.
- [x] Freio de emergencia: palavra mais larga que o frame e quebrada por caractere (`enforceMaxLineWidth`), nao vaza mais para fora da caixa (greedy e KP).
- [x] Espacamento de paragrafo (`spaceBefore`/`spaceAfter`) e alinhamento `left`/`center`/`right` (`x` por linha) no Frame Filler.
- [x] `indent` (recuo de primeira linha) no Frame Filler (1a linha quebra na largura reduzida).
- [x] Runs/espacos posicionados em `LayoutLine` + `justify` (estica espacos, exceto na ultima linha).
- [~] Export PDF (RGB): `computePdfPlacements` (caixas + Y invertido), `renderPdf` (pdf-lib) e o glue `documentToPdf` (documento -> PDF) prontos e testados; falta embutir fonte TTF e CMYK/PDF-X server-side.
- [ ] Aplicar `spaceBefore`/`spaceAfter`, `indent` e alinhamento horizontal simples no Frame Filler.
- [ ] Trocar `LayoutLine.text` por runs/espacos posicionados (pre-requisito de justify e PDF).

### Semana 2: provar layout deterministico

- [x] Implementar a primeira versao de `flowStory()` usando `Document`, `Story` e `frameChainIds`.
- Evoluir `flowStory()` para paginas fisicas completas, colunas e padding.
- Fazer testes com 3 frames de larguras diferentes.
- Fazer teste de paragrafo atravessando frames.
- Guardar linhas com runs/espacos posicionados, nao apenas string.

### Semana 3: provar PDF

- Gerar PDF com o mesmo `LayoutResult`.
- Embutir fonte.
- Definir MediaBox/TrimBox/BleedBox.
- Rodar Ghostscript para PDF/X.
- Validar em ferramenta real de preflight.
- Testar upload ou validador do destino prioritario.

### Semana 4: provar text-wrap minimo

- Implementar wrap por bounding-box.
- Implementar wrap por poligono simples.
- Medir performance com 30-50 paginas.
- So depois avaliar alpha-channel/marching squares.

## Corte de MVP recomendado

MVP que eu acho realista:

- Importar/colar texto.
- Escolher formato do livro.
- Aplicar poucos estilos nomeados: corpo, titulo, subtitulo.
- Gerar paginas automaticamente com frames retangulares.
- Preview canvas paginado.
- Export PDF para KDP primeiro.
- Preflight basico: overflow, bleed, imagens abaixo de 300ppi, fonte ausente.

Fora do MVP:

- edicao direta de texto no canvas;
- alpha text-wrap automatico;
- master pages completas;
- TOC automatico;
- tabelas;
- PDF/X para toda grafica;
- CMYK arbitrario/spot/Pantone;
- colaboracao;
- undo/redo sofisticado;
- IngramSpark e offset BR antes de KDP estar provado.

## Riscos que podem fazer voce gastar dinheiro errado

1. Contratar VPS/Ghostscript antes de provar PDF/X validado.
2. Construir UI bonita antes de provar motor de layout.
3. Prometer "profissional" quando o MVP talvez deva ser "facil e bom o suficiente para KDP".
4. Comecar por edicao WYSIWYG no canvas.
5. Tratar "tipo/interface existe" como "feature implementada".
6. Deixar PDF/export para o fim.
7. Usar presets de grafica sem testes e sem data de verificacao.

## Fontes externas consultadas

- pdf-lib features: https://github.com/Hopding/pdf-lib
- pdf-lib CMYK API: https://pdf-lib.js.org/docs/api/interfaces/cmyk
- tex-linebreak: https://github.com/robertknight/tex-linebreak
- opentype.js: https://github.com/opentypejs/opentype.js
- KDP trim/bleed/margins: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
- Ghostscript PDF/X: https://ghostscript.readthedocs.io/en/latest/VectorDevices.html
- IngramSpark File Creation Guide: https://www.ingramspark.com/hubfs/downloads/file-creation-guide.pdf

## Conclusao

Nao jogue o projeto fora. A intuicao central e boa. Mas o plano atual esta otimista demais e usa "arquitetado" como se fosse "implementado". A maneira mais barata de nao cometer um erro caro e transformar o proximo mes em mes de provas duras: compilar, testar engine, gerar PDF validado e provar text-wrap. Se isso passar, ai sim faz sentido investir em UI, produto e infraestrutura.
