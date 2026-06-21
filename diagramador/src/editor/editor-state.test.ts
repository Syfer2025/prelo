import { describe, expect, it } from 'vitest';
import {
  activePage,
  activePageText,
  addPage,
  bodyStyle,
  createInitialEditorState,
  editorStateFromProject,
  mainStory,
  manuscriptText,
  pageTextChunks,
  setActivePage,
  setBodyStyle,
  setManuscriptText,
  setProjectDocument,
  setProjectName,
} from './editor-state';

describe('createInitialEditorState', () => {
  it('começa com um projeto "Livro sem título" de uma página ativa', () => {
    const state = createInitialEditorState();
    expect(state.project.name).toBe('Livro sem título');
    expect(state.project.document.pages).toHaveLength(1);
    expect(state.activePageIndex).toBe(0);
    expect(state.pageSeq).toBe(1);
  });
});

describe('addPage', () => {
  it('acrescenta uma página, registra frame e encadeia na mesma story principal', () => {
    const next = addPage(createInitialEditorState());
    expect(next.project.document.pages).toHaveLength(2);
    expect(next.project.document.pages[1]!.id).toBe('page-2');
    expect(next.project.document.stories).toHaveLength(1);
    expect(mainStory(next)?.frameChainIds).toEqual(['frame-page-1', 'frame-page-2']);
    expect(next.project.document.frames['frame-page-1']!.nextFrameId).toBe('frame-page-2');
    expect(next.project.document.frames['frame-page-2']!.prevFrameId).toBe('frame-page-1');
    expect(next.project.document.frames['frame-page-2']!.storyId).toBe(mainStory(next)?.id);
    expect(next.activePageIndex).toBe(1);
    expect(next.pageSeq).toBe(2);
  });

  it('gera IDs únicos ao adicionar várias páginas', () => {
    const state = addPage(addPage(createInitialEditorState()));
    expect(state.project.document.pages.map((p) => p.id)).toEqual(['page-1', 'page-2', 'page-3']);
    expect(state.activePageIndex).toBe(2);
  });

  it('não muta o estado anterior (imutável)', () => {
    const initial = createInitialEditorState();
    addPage(initial);
    expect(initial.project.document.pages).toHaveLength(1);
  });
});

describe('setActivePage', () => {
  it('troca a página ativa e fixa nos limites', () => {
    const state = addPage(createInitialEditorState()); // 2 páginas, ativa 1
    expect(setActivePage(state, 0).activePageIndex).toBe(0);
    expect(setActivePage(state, 99).activePageIndex).toBe(1);
    expect(setActivePage(state, -5).activePageIndex).toBe(0);
  });
});

describe('texto da página ativa', () => {
  it('escreve e lê o manuscrito contínuo, com parágrafos por linha', () => {
    const state = setManuscriptText(createInitialEditorState(), 'linha um\nlinha dois');
    expect(manuscriptText(state)).toBe('linha um\nlinha dois');
    expect(mainStory(state)?.paragraphs).toHaveLength(2);
  });

  it('mantém o texto em uma única story mesmo após adicionar páginas', () => {
    let state = createInitialEditorState();
    state = setManuscriptText(state, 'pagina 1');
    state = addPage(state); // ativa página 2
    state = setManuscriptText(state, 'pagina 1\npagina 2');

    expect(manuscriptText(state)).toBe('pagina 1\npagina 2');
    expect(state.project.document.stories).toHaveLength(1);
    state = setActivePage(state, 0);
    expect(activePageText(state)).toContain('pagina 1');
  });

  it('texto vazio vira um único parágrafo vazio', () => {
    const state = setManuscriptText(createInitialEditorState(), '');
    expect(mainStory(state)?.paragraphs).toEqual([{ styleId: 'body', spans: [{ text: '' }] }]);
  });

  it('cria páginas automaticamente quando o manuscrito excede a primeira página', () => {
    const longText = Array.from(
      { length: 90 },
      (_, i) =>
        `Linha ${i + 1} com texto suficiente para simular um manuscrito real colado no editor.`
    ).join('\n');

    const state = setManuscriptText(createInitialEditorState(), longText);

    expect(state.project.document.pages.length).toBeGreaterThan(1);
    expect(mainStory(state)?.frameChainIds).toHaveLength(state.project.document.pages.length);
    expect(manuscriptText(state)).toBe(longText);
  });

  it('divide o manuscrito em trechos por página sem perder texto', () => {
    const longText = Array.from(
      { length: 70 },
      (_, i) => `Parágrafo ${i + 1} para preencher várias páginas no editor.`
    ).join('\n');

    const state = setManuscriptText(createInitialEditorState(), longText);
    const chunks = pageTextChunks(state);

    expect(chunks).toHaveLength(state.project.document.pages.length);
    expect(chunks.join('')).toBe(longText);
    expect(chunks.slice(1).some((chunk) => chunk.length > 0)).toBe(true);
  });

  it('quebra um parágrafo longo entre páginas sem deixar tudo preso na primeira página', () => {
    const longParagraph = Array.from(
      { length: 260 },
      (_, i) => `palavra${i + 1}`
    ).join(' ');

    const state = setManuscriptText(createInitialEditorState(), longParagraph);
    const chunks = pageTextChunks(state);

    expect(state.project.document.pages.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBeLessThan(longParagraph.length);
    expect(chunks.slice(1).some((chunk) => chunk.length > 0)).toBe(true);
    expect(chunks.join('')).toBe(longParagraph);
  });

  it('preserva quebras de linha originais ao distribuir texto com parágrafos', () => {
    const text = 'Título\n\nPrimeiro parágrafo com texto corrido.\n\nSegundo parágrafo.';
    const state = setManuscriptText(createInitialEditorState(), text);
    expect(pageTextChunks(state).join('')).toBe(text);
  });

  it('não empurra um parágrafo inteiro para a página seguinte quando ainda cabem linhas dele', () => {
    const text = `### A Cidade Que Cresceu em Volta do Rio

No início, não havia muralhas, arranha-céus ou avenidas largas. Existia apenas um rio. Ele cortava a planície lentamente, formando curvas que mudavam de lugar ao longo das décadas. As primeiras pessoas que chegaram não vieram para construir uma cidade. Vieram porque precisavam sobreviver. Encontraram água, solo fértil, peixes e árvores suficientes para fornecer sombra e madeira. Sem perceber, estavam escolhendo o lugar que, séculos depois, se transformaria em um centro urbano com milhões de habitantes.

As primeiras casas eram simples. Feitas de barro, madeira e pedra, não tinham ruas organizadas nem qualquer planejamento. As famílias se agrupavam por proximidade e necessidade. Os filhos aprendiam com os pais a plantar, caçar e fabricar ferramentas. O tempo era medido pelas estações do ano, pela posição do Sol e pela frequência das chuvas.

Com o passar dos anos, o pequeno povoado começou a atrair viajantes. Comerciantes vindos de terras distantes descobriram que aquele rio permitia transportar mercadorias com mais facilidade do que as rotas terrestres.`;

    const state = setManuscriptText(createInitialEditorState(), text);
    const chunks = pageTextChunks(state);

    expect(chunks[0]).toContain('As primeiras casas eram simples');
    expect(chunks.join('')).toBe(text);
  });
});

describe('setBodyStyle', () => {
  it('aplica alterações de parágrafo e de caractere ao estilo de corpo', () => {
    const state = setBodyStyle(createInitialEditorState(), {
      paragraph: { alignment: 'justify', lineHeight: 1.8 },
      character: { fontSize: 18 },
    });
    expect(bodyStyle(state).alignment).toBe('justify');
    expect(bodyStyle(state).lineHeight).toBe(1.8);
    expect(bodyStyle(state).characterStyle.fontSize).toBe(18);
  });
});

describe('setProjectName', () => {
  it('renomeia o projeto', () => {
    const state = setProjectName(createInitialEditorState(), 'Meu Livro');
    expect(state.project.name).toBe('Meu Livro');
  });
});

describe('setProjectDocument', () => {
  it('substitui o documento do projeto e fixa a página ativa dentro do novo total', () => {
    const state = addPage(createInitialEditorState());
    const nextDocument = {
      ...state.project.document,
      pages: [state.project.document.pages[0]!],
    };

    const next = setProjectDocument(state, nextDocument);

    expect(next.project.document).toBe(nextDocument);
    expect(next.activePageIndex).toBe(0);
  });
});

describe('seletores', () => {
  it('activePage retorna a página do índice ativo', () => {
    const state = addPage(createInitialEditorState());
    expect(activePage(state)?.id).toBe('page-2');
  });
});

describe('editorStateFromProject', () => {
  it('deriva pageSeq dos IDs existentes e ativa a primeira página', () => {
    const project = addPage(addPage(createInitialEditorState())).project; // page-1..3
    const state = editorStateFromProject(project);
    expect(state.pageSeq).toBe(3);
    expect(state.activePageIndex).toBe(0);
    // próxima página criada não colide com IDs existentes
    expect(addPage(state).project.document.pages[3]!.id).toBe('page-4');
  });
});
