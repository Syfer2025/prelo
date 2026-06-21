import type { BookCategory, Document, Frame, ImageFrame, ParagraphStyle } from './model/types';
import {
  DEFAULT_CHARACTER_STYLE,
  DEFAULT_PARAGRAPH_STYLE,
  PRINT_PROFILE_KDP_6x9,
} from './model/types';
import { buildBookPresetPage } from './model/book-presets';
import demoImageUrl from './assets/dragon-alpha.png';

export const DEMO_STORY_ID = 'story-1';
export const DEMO_STYLE_ID = 'body';
export const DEMO_FONT_FAMILY = 'Crimson Text';
export const DEMO_FONT_URL = '/fonts/CrimsonText-Regular.ttf';
export const DEMO_FONT_PATH = 'public/fonts/CrimsonText-Regular.ttf';
export const DEMO_IMAGE_URL = demoImageUrl;
export const CANVAS_WIDTH = 432;
export const CANVAS_HEIGHT = 648;
export const DEMO_AUTO_PAGE_TEMPLATE_ID = 'page-8';
export const DEMO_MAX_AUTO_PAGES = 24;

export type DemoAlignment = ParagraphStyle['alignment'];

export interface DemoPageProfile {
  id: string;
  label: string;
  category: BookCategory;
  description: string;
}

export interface DemoStyleControls {
  alignment: DemoAlignment;
  indent: number;
  lineHeight: number;
  spaceBefore: number;
  spaceAfter: number;
  fontSize: number;
}

export const DEFAULT_DEMO_STYLE: DemoStyleControls = {
  alignment: 'left',
  indent: 0,
  lineHeight: 1.5,
  spaceBefore: 0,
  spaceAfter: 8,
  fontSize: 15,
};

export const DEMO_PAGE_PROFILES: DemoPageProfile[] = [
  {
    id: 'page-1',
    label: 'Infantil / revista',
    category: 'kids-magazine',
    description: 'Tres frames encadeados para testar materia curta, bloco lateral e caixa ampla.',
  },
  {
    id: 'page-2',
    label: 'Ficcao',
    category: 'fiction',
    description: 'Pagina de romance com uma mancha de texto continua e margens de livro fisico.',
  },
  {
    id: 'page-3',
    label: 'Nao ficcao',
    category: 'non-fiction',
    description: 'Texto principal com chamada lateral e complemento de rodape.',
  },
  {
    id: 'page-4',
    label: 'Arte / foto',
    category: 'art-photo',
    description: 'Bloco de ensaio, legenda e texto curatorial curto.',
  },
  {
    id: 'page-5',
    label: 'Tecnico',
    category: 'technical',
    description: 'Duas colunas para apostila, manual e livro didatico.',
  },
  {
    id: 'page-6',
    label: 'Poesia',
    category: 'poetry',
    description: 'Frame mais estreito para verso, respiro e notas.',
  },
  {
    id: 'page-7',
    label: 'Planner',
    category: 'planner',
    description: 'Blocos curtos repetidos para caderno, diario e agenda.',
  },
  {
    id: 'page-8',
    label: 'Texto corrido 1',
    category: 'fiction',
    description: 'Pagina extra para testar continuacao longa sem overflow no PDF padrao.',
  },
];

const DEMO_BUILT_PRESET_PAGES = DEMO_PAGE_PROFILES.map((profile) =>
  buildBookPresetPage(profile.category, {
    id: profile.id,
    storyId: DEMO_STORY_ID,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    bleed: 9,
  })
);

export const DEMO_FRAMES: Frame[] = chainFrames(
  DEMO_BUILT_PRESET_PAGES.flatMap((built) => built.frames)
);

const firstDemoTextFrame = DEMO_FRAMES[0]!;
// Frame único e largo da página de ficção (page-2): ideal para imagem CENTRAL com texto dos dois lados.
const fictionTextFrame =
  DEMO_FRAMES.find((frame) => frame.pageId === 'page-2') ?? firstDemoTextFrame;

const CENTER_WRAP_IMAGE_WIDTH = 116;
const CENTER_WRAP_IMAGE_HEIGHT = 140;

export const DEMO_WRAP_IMAGE_FRAMES: ImageFrame[] = [
  {
    id: 'page-1-wrap-image',
    pageId: firstDemoTextFrame.pageId,
    x: firstDemoTextFrame.x,
    y: firstDemoTextFrame.y,
    width: Math.min(82, firstDemoTextFrame.width * 0.48),
    height: Math.min(108, firstDemoTextFrame.height * 0.38),
    rotation: 0,
    type: 'image',
    storyId: null,
    prevFrameId: null,
    nextFrameId: null,
    imageUrl: DEMO_IMAGE_URL,
    originalWidth: 512,
    originalHeight: 512,
    cropX: 0,
    cropY: 0,
    cropWidth: 512,
    cropHeight: 512,
    fitMode: 'fill',
    textWrap: { mode: 'alpha-channel', offset: 8, sides: 'largest', alphaThreshold: 0.5 },
  },
  {
    // Cenário multi-intervalo: imagem no CENTRO da mancha, texto fluindo à esquerda E à direita.
    id: 'page-2-center-image',
    pageId: fictionTextFrame.pageId,
    x: fictionTextFrame.x + (fictionTextFrame.width - CENTER_WRAP_IMAGE_WIDTH) / 2,
    y: fictionTextFrame.y + fictionTextFrame.height * 0.26,
    width: CENTER_WRAP_IMAGE_WIDTH,
    height: CENTER_WRAP_IMAGE_HEIGHT,
    rotation: 0,
    type: 'image',
    storyId: null,
    prevFrameId: null,
    nextFrameId: null,
    imageUrl: DEMO_IMAGE_URL,
    originalWidth: 512,
    originalHeight: 512,
    cropX: 0,
    cropY: 0,
    cropWidth: 512,
    cropHeight: 512,
    fitMode: 'fill',
    // `sides: 'both'` exige o motor multi-intervalo: cada faixa devolve um vão à esquerda e outro à direita.
    textWrap: { mode: 'bounding-box', offset: 8, sides: 'both', alphaThreshold: 0.5 },
  },
];

const DEMO_DOCUMENT_FRAMES: Frame[] = [...DEMO_FRAMES, ...DEMO_WRAP_IMAGE_FRAMES];

export const DEMO_PAGES = DEMO_BUILT_PRESET_PAGES.map((built) => {
  const wrapImageIds = DEMO_WRAP_IMAGE_FRAMES.filter(
    (frame) => frame.pageId === built.page.id
  ).map((frame) => frame.id);
  return {
    ...built.page,
    frames: wrapImageIds.length > 0 ? [...built.page.frames, ...wrapImageIds] : built.page.frames,
  };
});

export const INITIAL_TEXT = `Bem-vindo ao Prelo.

Este arquivo de teste usa uma unica story encadeada por varias paginas. A ideia e provar o caminho que importa para livro fisico: texto continuo, pagina com tamanho fixo, sangria, margens, frames, fonte TTF real, canvas e PDF final usando o mesmo modelo de documento.

PAGINA INFANTIL E REVISTA. Este primeiro spread de teste mantem tres frames na mesma pagina porque ele forca o motor a sair de uma caixa estreita, entrar em outra caixa estreita e depois continuar em um bloco horizontal. Esse tipo de composicao aparece em livro infantil, revista pequena, caderno de atividades e material paradidatico. O objetivo aqui nao e ficar bonito como arte final; o objetivo e revelar se o texto encadeado respeita os limites fisicos da pagina.

Quando o texto passa de um frame para outro, ele nao pode perder palavras, duplicar linhas, encavalar letras ou empurrar o conteudo para fora da caixa. Em um produto real, essa pagina tambem teria imagens e contorno de texto, mas nesta etapa a prova e mais basica: o fluxo tipografico precisa ser confiavel antes de imagens, estilos ricos e automacoes.

PAGINA DE FICCAO. Um romance, uma novela ou um livro de memorias depende de uma mancha de texto calma, regular e previsivel. A maioria das paginas desse tipo de livro tem um unico frame grande, com margens internas pensadas para lombada, corte e conforto de leitura. O leitor nao deve perceber o motor. Se ele percebe, geralmente e porque a entrelinha esta errada, a justificacao abriu buracos demais, a hifenizacao esta agressiva ou a pagina quebrou em um ponto ruim.

O Prelo precisa lidar bem com muitos paragrafos seguidos. A cada alteracao de corpo, entrelinha, alinhamento ou recuo, o motor precisa recalcular o fluxo sem mudar o tamanho fisico da pagina. Esta e a base para livros comuns: romance, biografia, ensaio narrativo, coletanea de contos e obras tecnicas com predominancia de texto.

Em um livro fisico, a pagina nao e uma tela elastica. Ela e uma area de impressao com dimensoes reais. Por isso o demo usa uma pagina seis por nove polegadas em setenta e dois pontos por polegada, mais sangria de um oitavo de polegada no PDF exportado. O arquivo final precisa sair com MediaBox, TrimBox e BleedBox coerentes para que a grafica consiga interpretar o corte.

PAGINA DE NAO FICCAO. Livros de desenvolvimento pessoal, negocios, historia, religiao, educacao e divulgacao cientifica costumam misturar texto principal com chamada lateral, destaque, nota curta ou complemento. O motor precisa permitir essa geometria sem transformar cada pagina em um desenho manual impossivel para leigos.

Nesta pagina de teste, a coluna principal recebe a maior parte do conteudo e dois frames laterais simulam chamadas. Isso testa uma coisa importante: o encadeamento nao e apenas vertical. O texto pode continuar para uma area lateral, voltar para outra area e seguir adiante na pagina seguinte. O usuario final talvez nao enxergue isso como tecnica, mas o motor precisa entender a pagina como um conjunto de caixas encadeadas.

Se o texto principal muda, a chamada lateral pode receber conteudo diferente. Se o corpo da fonte aumenta, menos linhas cabem. Se o alinhamento vira justificado, as linhas precisam distribuir espacos sem juntar letras. Esse e o tipo de comportamento que separa um editor visual simples de um motor de diagramacao de livro.

PAGINA DE ARTE E FOTOGRAFIA. Livros de imagem, portfolio, catalogo e fotografia tem menos texto corrido, mas exigem grande cuidado com legenda, credito, ensaio curto e respiro. Mesmo antes de implementar imagem real, o Prelo precisa representar paginas que nao sao apenas blocos de romance.

O frame superior desta pagina simula um texto curatorial curto. Os dois frames inferiores simulam legendas, creditos ou descricoes de obra. Quando entrarmos em imagem de verdade, esta estrutura sera combinada com DPI minimo, corte, area segura, sangria e preflight. Por enquanto, ela serve para garantir que o PDF final ja consiga carregar paginas com ritmos diferentes.

PAGINA TECNICA. Manuais, apostilas, livros didaticos e material profissional frequentemente usam duas colunas. O motivo e simples: linhas muito longas cansam, e blocos densos precisam de escaneabilidade. Para o motor, isso cria um problema pratico: cada coluna e um frame com largura propria, e a quebra de linha precisa respeitar essa largura sem destruir palavras comuns.

Em texto tecnico, aparecem tokens que nao devem ser quebrados de qualquer jeito: medidas como 6x9, nomes como flowStory, codigos, siglas, URLs, versoes e pequenas expressoes numericas. Se o algoritmo hifenizar tudo com agressividade, o resultado parece amador. Se nao hifenizar nunca, palavras muito grandes podem estourar a caixa. O caminho correto e ser conservador com termos tecnicos e ainda ter um freio de emergencia para palavras gigantes.

Esta pagina tambem testa o uso de colunas estreitas. As colunas precisam receber texto suficiente para revelar problemas de espaco, mas nao podem criar sobreposicao de letras. Qualquer encavalamento no PDF e sinal de erro de metrica, fonte ou posicionamento de run.

PAGINA DE POESIA. Poesia, teatro e textos fragmentados usam espaco como parte da obra. O motor precisa aceitar frames mais estreitos, paragrafos curtos e muito respiro sem tentar preencher a pagina como se tudo fosse romance. A mesma story pode conter linhas mais curtas e notas editoriais.

Aqui o texto continua corrido porque ainda estamos em uma prova simples de fluxo, mas a geometria da pagina ja forca o preview a mostrar um corpo centralizado e um bloco de nota. Quando estilos avancados chegarem, esta categoria deve ganhar alinhamento por linha, quebras preservadas e controle melhor de espaco vertical.

PAGINA DE PLANNER. Cadernos, agendas, diarios guiados e planners nao sao livros tradicionais de leitura corrida, mas fazem parte do universo de impressos. Eles precisam de blocos repetidos, areas de escrita, cabecalhos, rodapes, numeracao, templates e consistencia de pagina. O Prelo nao deve comecar por formularios complexos, mas deve respeitar esse tipo de geometria desde cedo.

Os tres blocos desta pagina simulam secoes de manha, tarde e revisao. A exportacao em PDF precisa manter todos os blocos na pagina correta, com sangria e caixas fisicas previsiveis. Depois, esses frames poderao receber linhas, checklists e elementos mestres, mas a base continua sendo a mesma: pagina fisica, frames e fluxo controlado.

TEXTO LONGO DE CONTROLE. Este paragrafo final existe para dar massa ao teste. O usuario pode mudar corpo, entrelinha, recuo, espaco antes e depois, alinhamento a esquerda, centro, direita ou justificado. O preview deve atualizar a pagina selecionada e o PDF deve baixar com todas as paginas. Se alguma pagina ficar vazia, se o texto sumir, se a fonte nao carregar ou se o arquivo final mostrar letras coladas, isso indica problema real no motor e nao apenas detalhe visual do demo.

O objetivo desta vitrine nao e substituir o editor final. Ela existe para provar o encadeamento do motor antes de gastar dinheiro construindo interface completa. Uma vez que este caminho esteja estavel, podemos evoluir para presets reais por tipo de livro, estilos de titulo, capitular, paginas mestras, imagens, contorno, numeracao, sumario, preflight, calculo de lombada e exportacao mais rigorosa para grafica.

BLOCO DE ESTRESSE DE PAGINACAO. Este trecho adicional existe para provar que o motor cria novas paginas quando a story passa da capacidade dos templates de base. Em um livro real, um manuscrito nunca tera exatamente o tamanho previsto pelo modelo inicial. O sistema precisa continuar gerando paginas de texto corrido, mantendo o mesmo tamanho fisico, as mesmas margens e a mesma mancha de texto da pagina-template escolhida para continuacao.

Quando um usuario leigo cola um capitulo grande, o Prelo nao pode pedir que ele desenhe manualmente cada pagina. O motor precisa assumir essa parte tecnica: criar paginas, clonar os frames corretos, encadear a story, recalcular a quebra de linha e exportar um PDF com todas as paginas geradas. Este comportamento e pequeno no codigo, mas enorme no produto, porque transforma uma prova de layout em uma base de diagramacao de livro.

O teste tambem precisa continuar pesado o suficiente para revelar regressao. Se uma mudanca de preset aumentar a area de texto, o conteudo precisa seguir passando do limite para forcar a criacao automatica. Se uma mudanca de estilo aumentar corpo ou entrelinha, o documento deve criar mais paginas sem quebrar. Se o usuario reduzir corpo, o total de paginas pode cair, mas o fluxo deve permanecer coerente.`;

export function createDemoDocument(
  text: string,
  controls: Partial<DemoStyleControls> = {}
): Document {
  const styleControls = { ...DEFAULT_DEMO_STYLE, ...controls };
  const characterStyle = {
    ...DEFAULT_CHARACTER_STYLE,
    fontFamily: DEMO_FONT_FAMILY,
    fontSize: styleControls.fontSize,
    color: '#1f2d44',
  };
  const paragraphStyle: ParagraphStyle = {
    ...DEFAULT_PARAGRAPH_STYLE,
    name: 'Corpo demo',
    alignment: styleControls.alignment,
    indent: styleControls.indent,
    lineHeight: styleControls.lineHeight,
    spaceBefore: styleControls.spaceBefore,
    spaceAfter: styleControls.spaceAfter,
    characterStyle,
  };

  return {
    pages: DEMO_PAGES,
    frames: Object.fromEntries(DEMO_DOCUMENT_FRAMES.map((frame) => [frame.id, frame])),
    stories: [
      {
        id: DEMO_STORY_ID,
        paragraphs: paragraphsFromText(text).map((paragraphText) => ({
          styleId: DEMO_STYLE_ID,
          spans: [{ text: paragraphText }],
        })),
        frameChainIds: DEMO_FRAMES.map((frame) => frame.id),
      },
    ],
    styles: {
      [DEMO_STYLE_ID]: paragraphStyle,
    },
    characterStyles: {
      [DEMO_STYLE_ID]: characterStyle,
    },
    masterPages: {},
    defaultStyleId: DEMO_STYLE_ID,
    facingPages: false,
    printProfile: PRINT_PROFILE_KDP_6x9,
    baselineGrid: null,
  };
}

function chainFrames(frames: Frame[]): Frame[] {
  return frames.map((frame, index) => ({
    ...frame,
    prevFrameId: frames[index - 1]?.id ?? null,
    nextFrameId: frames[index + 1]?.id ?? null,
  }));
}

function paragraphsFromText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter((block) => block.length > 0);

  return paragraphs.length > 0 ? paragraphs : [''];
}
