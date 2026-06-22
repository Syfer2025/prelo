# Tiptap Spike Evaluation

Branch: `spike/tiptap-editor` · Checkpoint do motor antes do spike: `a8db9a0`.

> **Atualização (decisão do usuário):** a tela DIVIDIDA foi removida. O Tiptap NÃO é um painel de
> escrita separado — ele substitui o `contenteditable` DENTRO do frame da própria página Prelo
> (uma área só). Dois modos no MESMO frame/margens: `editing` (Tiptap visível no frame) e `proof`
> (`engine-line-layer` do Prelo = exatamente o que vai ao PDF). Ao focar o frame, entra em edição;
> ao desfocar, o JSON do Tiptap vira `Story.paragraphs` (via `tiptap-adapter`) e o Prelo repagina,
> voltando à prova no mesmo lugar. Componentes: `TiptapFrameEditor.tsx` (no frame) + `EditablePage.tsx`
> (alterna editing/proof). `EditorShell` voltou ao layout normal (sidebar + workspace; zoom; export).

Fluxo implementado (a regra absoluta foi respeitada):

```
Tiptap JSON -> tiptap-adapter -> Story.paragraphs -> paginateStory -> Preview Prelo (no frame) -> documentToPdf
```

O `src/engine` NÃO foi tocado. Tiptap só descreve texto + formatação inline/parágrafo. Páginas,
frames, imagens, text-wrap, sangria, preflight e PDF continuam 100% do Prelo. Imagens NÃO são
convertidas (continuam `ImageFrame`). Preview final e PDF continuam no mesmo lugar onde se escreve.

## Texto de teste

Mesmo manuscrito em português que expôs as quebras ruins ("No princípio, quando ainda não existiam
cidades, nomes para os continentes ..."), repetido em ~24 parágrafos.

## Checks

- [x] Digitação/colagem no Tiptap é fluida (ProseMirror; debounce de 700ms antes de repaginar o Prelo).
- [x] Colar texto longo NÃO congela o editor (a paginação cara é debounced; o ProseMirror é nativo).
- [x] Tiptap JSON converte deterministicamente em `Story.paragraphs` (3 testes em `tiptap-adapter.test.ts`).
- [x] Parágrafos simples, headings (h1/h2/h3 -> `heading-1/2/3`) e marks (bold/italic/underline) sobrevivem à conversão (marks como metadata de span).
- [x] O preview do Prelo PAGINA a story convertida (medido ao vivo: 7.864 chars colados -> 24 parágrafos no Tiptap -> **9 páginas / 193 linhas** compostas pelo Prelo).
- [x] Export PDF continua pelo `documentToPdf` (blob válido `application/pdf` de ~155 KB gerado no app; e PDF de inspeção `tmp/pdfs/tiptap-spike.pdf` gerado pelo mesmo caminho).
- [x] PDF tem MediaBox/BleedBox/TrimBox corretos (`pdfinfo -box`: MediaBox 0–450×0–666, TrimBox 9–441×9–657 em 6×9"+sangria).
- [x] Extração de texto NÃO mostra hífen artificial no meio de palavra (`pdftotext -layout`: 0 ocorrências de `letra-letra` no meio; hífens só no fim de linha, ex.: "organi-" + "zada").
- [x] Imagens/text-wrap continuam pertencendo ao Prelo (Tiptap não tem nós de imagem no spike).
- [x] Testes existentes continuam verdes (`npm test` 203, `npm run build` ok, `npm run lint` ok).

## Findings

**Qualidade da escrita:** claramente melhor que o `EditablePage` improvisado. ProseMirror dá cursor,
seleção, undo/redo nativos e colagem robusta de texto longo. A escrita não trava (a recomposição
do Prelo é debounced e roda só na pausa).

**Conversão:** determinística e testada. `tiptapJsonToPreloParagraphs` mapeia paragraph->`body`,
heading level N->`heading-N`, e preserva marks (`bold`/`italic`/`underline`) como `marks: string[]`
no span (metadata para mapeamento futuro a `styleOverrides`/estilos de caractere). Imagens não são
convertidas — continuam `ImageFrame` do Prelo. **Pendência conhecida:** os marks ainda NÃO são
mapeados para `CharacterStyle.styleOverrides`, então bold/italic/underline sobrevivem à conversão
mas ainda não RENDERIZAM no preview/PDF (trabalho de integração futura, não do spike).

**Preview/PDF:** vêm do Prelo, como exigido. O preview paginado e o PDF são o mesmo `documentToPdf`.
Boxes físicas corretas. Sem hífen artificial no meio de palavra.

**Performance:** colar texto longo não congela; a digitação é fluida. (A recomposição do livro
inteiro a cada pausa ainda custa o hitch já documentado no handoff — não é regressão do spike.)

**ACHADO CRÍTICO (o spike isolou a variável):** alimentando o motor com input LIMPO do Tiptap
(um único parágrafo, sem `innerText`, sem `\n` espúrio), o PDF do Prelo AINDA isola palavras curtas
em linha própria ("nomes", "e", "que", "capazes" aparecem sozinhos, com a linha anterior curta/ragged
— ver `tmp/pdfs/tiptap-spike.pdf`, página 1). Como não há quebra rígida na entrada, **esse é um bug
do MOTOR de composição do Prelo (line-breaker/frame-filler), não da camada de edição/`innerText`**.
Conclusão importante: trocar o editor por Tiptap NÃO conserta o defeito visível mais grave; ele
precisa ser corrigido no motor.

### Repro do bug do motor (para a próxima sessão)
Converter o parágrafo "No princípio, quando ainda não existiam cidades, nomes para os continentes ou
sequer uma maneira organizada de medir o tempo..." em `Story.paragraphs` (1 parágrafo, 1 span),
`paginateStory({algorithm:'kp'})` + `documentToPdf`, e inspecionar: "nomes" sai sozinho na 2ª linha.
Uma linha de UMA palavra no meio do parágrafo teria badness enorme no Knuth-Plass — então há uma
quebra sendo FORÇADA indevidamente no fluxo de tokens. Investigar tokenizer/shaper/line-breaker.

## Recommendation

**Decisão tomada (a pedido do usuário): ADOTAR o Tiptap como superfície de escrita — mas DENTRO do
frame da página (uma área só), não como editor separado.** Já implementado e verificado nesta branch:
escrita no frame, conversão determinística, Prelo continua sendo a prova (preview) e o produto (PDF),
sem segunda fonte da verdade. Permanece na branch `spike/tiptap-editor`, sem merge na `main` sem ok.

**Ressalva que continua valendo (independente do editor):**

1. **O defeito visível mais grave é do MOTOR, não do editor.** O spike provou que "nomes" isolado
   acontece com input LIMPO do Tiptap (ver repro acima). Trocar/embutir o editor NÃO conserta isso —
   **corrigir o line-breaker do Prelo é a prioridade nº 1** e independe do Tiptap.
2. **O plano-mestre** (`docs/superpowers/plans/2026-06-21-prelo-engine-finalization-master-plan.md`)
   sequencia o contrato Preview=PDF + quality gate. O Tiptap-no-frame respeita isso (o motor segue
   sendo a prova), mas a maturação editorial (incl. o bug acima) deve continuar em paralelo.

**Limitações conhecidas do estado atual (in-frame):** durante a edição o que se vê é o layout NATIVO
do navegador (Tiptap), e só ao desfocar aparece a prova do Prelo (= PDF) — ainda não é WYSIWYG
caractere-a-caractere durante a digitação. Marks (bold/italic/underline) sobrevivem na conversão mas
ainda não são mapeados para `CharacterStyle`/estilos (não renderizam no PDF ainda). Edição é por
trecho de página (modelo de chunks atual). Próximo passo de integração: mapear marks->estilos,
preservar headings no round-trip, e o gate de fidelidade preview/PDF.

Ordem recomendada: (a) corrigir o bug de quebra de linha do motor (repro acima); (b) landar o gate
Preview=PDF; (c) então adotar o Tiptap com um plano de integração próprio (mapeamento de toolbar,
schema do documento, marks->styleOverrides, normalização de paste, undo/redo, imagens como
`ImageFrame`, gate de fidelidade preview/PDF). A branch `spike/tiptap-editor` fica preservada para isso.

> Prelo layout é a prova. Prelo PDF é o produto. Tiptap é só o instrumento de escrita.
