/**
 * Prelo — Modelo de Dados
 * 
 * Princípio central (InDesign): Story ≠ Frame
 * O texto vive na Story (fluxo contínuo). Os Frames são "janelas" 
 * posicionadas que mostram pedaços da Story.
 * 
 * Cobre os 22 requisitos do diagramador de livros:
 * - Essenciais: páginas fixas, threaded text, text-wrap, estilos,
 *   imagens, margens/sangria, PDF, numeração, undo/redo
 * - Importantes: baseline grid, facing pages, master pages,
 *   page breaks, sumário, fontes, zoom
 * - Bônus: presets KDP/IngramSpark, preview, preflight
 */

// ─── Estilos ────────────────────────────────────────────────

export interface TabStop {
  position: number;       // em px a partir da margem esquerda do frame/coluna
  alignment: 'left' | 'center' | 'right' | 'decimal';
  leader?: string;        // caractere líder (ex: ".")
}

export interface CharacterStyle {
  fontFamily: string;
  fontSize: number;       // em pixels (CSS px)
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;          // hex string, ex: '#1f2d44'
  letterSpacing: number;  // tracking, em pixels
  underline: boolean;     // sublinhado
  strikethrough: boolean; // tachado
  underlineColor?: string; // cor do sublinhado (opcional)
  underlineStyle?: 'solid' | 'double' | 'dotted' | 'dashed'; // estilo do sublinhado (opcional)
  textCase: 'normal' | 'uppercase' | 'lowercase' | 'smallcaps'; // caixa alta/versalete
  baselineShift: 'normal' | 'superscript' | 'subscript'; // sobrescrito/subscrito
}

export interface ParagraphStyle {
  name: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;     // multiplicador (ex: 1.4 = 140%) ou fixo em px
  spaceBefore: number;    // espaço antes do parágrafo em px
  spaceAfter: number;     // espaço depois do parágrafo em px
  indent: number;         // recuo da primeira linha em px
  leftIndent: number;     // recuo esquerdo em px
  rightIndent: number;    // recuo direito em px
  orphans: number;        // controle de órfãs (mínimo de linhas no início do frame)
  widows: number;         // controle de viúvas (mínimo de linhas no fim do frame)
  keepLinesTogether: boolean; // manter todas as linhas do parágrafo juntas
  keepWithNext: boolean;  // #14: não separar do próximo parágrafo (títulos)
  pageBreakBefore: boolean; // #14: forçar quebra de página antes
  dropCapLines: number;   // linhas ocupadas pela capitular (0 para desativado)
  dropCapCharacters: number; // número de caracteres na capitular
  listType: 'none' | 'bullet' | 'numbered';
  listLevel: number;
  tabStops: TabStop[];
  tocLevel: number | null;  // #15: nível no sumário (1=capítulo, 2=seção, null=não)
  characterStyle: CharacterStyle; // estilo base dos caracteres
}

// ─── Conteúdo (Story) ───────────────────────────────────────

export interface Span {
  text: string;
  styleOverrides?: Partial<CharacterStyle>;
}

export interface Paragraph {
  spans: Span[];
  styleId: string; // referência ao ParagraphStyle no StyleRegistry
}

export interface Story {
  id: string;
  paragraphs: Paragraph[];
  frameChainIds: string[]; // IDs dos frames encadeados, em ordem
}

// ─── Layout Físico ──────────────────────────────────────────

/** #7: Margens de página (em px) */
export interface Margins {
  top: number;
  bottom: number;
  inside: number;    // lado da lombada (gutter)
  outside: number;   // lado do corte
}

export interface Frame {
  id: string;
  pageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  type: 'text' | 'image' | 'shape';
  storyId: string | null;
  nextFrameId: string | null;
  prevFrameId: string | null;
}

export interface TextFrame extends Frame {
  type: 'text';
  columns: number;        // número de colunas, ex: 1, 2, 3
  columnGap: number;      // espaçamento entre colunas em px
  textPadding: Margins;   // moldura com padding interno (PX)
}

/** #6: Frame de imagem com crop e text-wrap (#3) */
export interface ImageFrame extends Frame {
  type: 'image';
  imageUrl: string;
  originalWidth: number;   // #16: dimensões originais para DPI
  originalHeight: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  fitMode: 'fill' | 'fit' | 'stretch' | 'none';
  textWrap: TextWrapConfig;
}

/** #3: Configuração de contorno de texto */
export interface TextWrapConfig {
  mode: 'none' | 'bounding-box' | 'polygon' | 'alpha-channel';
  offset: number;          // distância texto ↔ obstáculo (px)
  sides: 'both' | 'left' | 'right' | 'largest';
  alphaThreshold: number;  // 0.0–1.0, para modo alpha-channel
  polygon?: { x: number; y: number }[];  // para modo polígono manual
}

export interface Page {
  id: string;
  width: number;           // em px (ex: 6" × 72dpi = 432px)
  height: number;
  margins: Margins;        // #7: margens de conteúdo
  bleed: number;           // #7: sangria em px (ex: 0.125" = 9px @72dpi)
  side: 'left' | 'right' | 'single'; // #12: facing pages
  masterPageId: string | null; // #13: referência à master page
  frames: string[];        // IDs dos frames nesta página
}

/** #13: Master pages — templates reutilizáveis */
export interface MasterPage {
  id: string;
  name: string;            // ex: "A-Master", "Capítulo"
  width: number;
  height: number;
  margins: Margins;
  frames: Frame[];         // frames estáticos (cabeçalho, rodapé, nº página)
}

/** #9: Variável de texto resolvida na renderização */
export type TextVariable =
  | { type: 'page-number' }
  | { type: 'total-pages' }
  | { type: 'chapter-title' }
  | { type: 'running-header'; styleId: string };

export interface Document {
  pages: Page[];
  frames: Record<string, Frame>;       // registro global de frames resolvidos por ID
  stories: Story[];
  styles: Record<string, ParagraphStyle>;
  characterStyles: Record<string, CharacterStyle>; // #5: estilos reutilizáveis
  masterPages: Record<string, MasterPage>;          // #13: master pages
  defaultStyleId: string;
  facingPages: boolean;          // #12: modo páginas espelhadas
  printProfile: PrintProfile;    // #19: perfil de impressão ativo
  baselineGrid: BaselineGridConfig | null; // #11: grade base
}

// ─── Tipologias de Livros ───────────────────────────────────

export type BookCategory =
  | 'fiction'       // 1. Texto puro (Romances / Ficção)
  | 'non-fiction'   // 2. Imagens ocasionais (Não-ficção básica)
  | 'kids-magazine' // 3. Imagens com contorno (Infantil / Revistas)
  | 'art-photo'     // 4. Livros de imagens (Arte, fotografia, portfólio)
  | 'technical'     // 5. Livros técnicos / didáticos (manuais, apostilas)
  | 'poetry'        // 6. Livros de poesia / peças
  | 'planner';      // 7. Cadernos / planners / agendas

export interface BookTypePreset {
  category: BookCategory;
  name: string;
  defaultTrimWidth: number;   // em polegadas
  defaultTrimHeight: number;  // em polegadas
  defaultMargins: Margins;    // em px (@72dpi)
  defaultBleed: number;       // em px (@72dpi)
  requiresWrap: boolean;      // se necessita de contorno de imagem ativo
  requiresCMYK: boolean;      // se exige preflight CMYK estrito
  requiresMasterTemplates: boolean; // se exige templates/mestres repetitivos
}

// ─── #19: Perfis de Impressão ───────────────────────────────


export interface PrintProfile {
  name: string;                  // ex: "KDP Paperback 6x9"
  trimWidth: number;             // em polegadas
  trimHeight: number;
  bleed: number;                 // em polegadas (0.125 para KDP/IngramSpark)
  minMargins: Margins;           // margens mínimas em polegadas
  gutterTable: { maxPages: number; gutter: number }[];  // gutter por contagem
  spineFormula: 'kdp-white' | 'kdp-cream' | 'kdp-color' | 'offset-br';
  maxTAC: number;                // Total Area Coverage (ex: 240 para IngramSpark)
  pdfStandard: 'PDF/X-1a' | 'PDF/X-3' | 'PDF/X-4';
  colorMode: 'rgb' | 'cmyk';
  iccProfile: string;            // ex: "US Web Coated SWOP v2"
  minDPI: number;                // 300 para KDP/IngramSpark
}

// ─── #11: Baseline Grid ─────────────────────────────────────

export interface BaselineGridConfig {
  startOffset: number;           // px a partir do topo da margem
  increment: number;             // espaçamento da grade em px
  color: string;                 // cor visual da grade
  visible: boolean;
}

// ─── #15: Entrada de Sumário ────────────────────────────────

export interface TocEntry {
  text: string;
  pageNumber: number;
  level: number;                 // 1 = capítulo, 2 = seção, etc.
  storyId: string;
  paragraphIndex: number;
}

// ─── #22: Resultado de Preflight ────────────────────────────

export type PreflightSeverity = 'error' | 'warning' | 'info';

export interface PreflightIssue {
  severity: PreflightSeverity;
  code: string;                  // ex: 'LOW_DPI', 'TEXT_OUTSIDE_MARGIN'
  message: string;
  pageIndex?: number;
  frameId?: string;
}

// ─── Constantes Default ─────────────────────────────────────

export const DEFAULT_CHARACTER_STYLE: CharacterStyle = {
  fontFamily: 'Georgia, serif',
  fontSize: 15,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#1f2d44',
  letterSpacing: 0,
  underline: false,
  strikethrough: false,
  textCase: 'normal',
  baselineShift: 'normal',
};

export const DEFAULT_PARAGRAPH_STYLE: ParagraphStyle = {
  name: 'Corpo',
  alignment: 'left',
  lineHeight: 1.5,
  spaceBefore: 0,
  spaceAfter: 0,
  indent: 0,
  leftIndent: 0,
  rightIndent: 0,
  orphans: 2,
  widows: 2,
  keepLinesTogether: false,
  keepWithNext: false,
  pageBreakBefore: false,
  dropCapLines: 0,
  dropCapCharacters: 1,
  listType: 'none',
  listLevel: 0,
  tabStops: [],
  tocLevel: null,
  characterStyle: DEFAULT_CHARACTER_STYLE,
};

// ─── #19: Presets de Gráfica ────────────────────────────────

export const KDP_GUTTER_TABLE = [
  { maxPages: 150, gutter: 0.375 },
  { maxPages: 300, gutter: 0.5 },
  { maxPages: 500, gutter: 0.625 },
  { maxPages: 700, gutter: 0.75 },
  { maxPages: 828, gutter: 0.875 },
];

export const PRINT_PROFILE_KDP_6x9: PrintProfile = {
  name: 'KDP Paperback 6×9"',
  trimWidth: 6,
  trimHeight: 9,
  bleed: 0.125,
  minMargins: { top: 0.375, bottom: 0.375, inside: 0.375, outside: 0.375 },
  gutterTable: KDP_GUTTER_TABLE,
  spineFormula: 'kdp-white',
  maxTAC: 300,
  pdfStandard: 'PDF/X-1a',
  colorMode: 'cmyk',
  iccProfile: 'US Web Coated SWOP v2',
  minDPI: 300,
};

export const PRINT_PROFILE_INGRAMSPARK: PrintProfile = {
  name: 'IngramSpark 6×9"',
  trimWidth: 6,
  trimHeight: 9,
  bleed: 0.125,
  minMargins: { top: 0.5, bottom: 0.5, inside: 0.5, outside: 0.5 },
  gutterTable: KDP_GUTTER_TABLE,
  spineFormula: 'kdp-white',
  maxTAC: 240,
  pdfStandard: 'PDF/X-1a',
  colorMode: 'cmyk',
  iccProfile: 'US Web Coated SWOP v2',
  minDPI: 300,
};

export const PRINT_PROFILE_OFFSET_BR: PrintProfile = {
  name: 'Offset Brasil 14×21cm',
  trimWidth: 5.512,   // 14cm em polegadas
  trimHeight: 8.268,  // 21cm em polegadas
  bleed: 0.197,       // 5mm em polegadas
  minMargins: { top: 0.394, bottom: 0.394, inside: 0.591, outside: 0.394 },
  gutterTable: [{ maxPages: 9999, gutter: 0.591 }],
  spineFormula: 'offset-br',
  maxTAC: 300,
  pdfStandard: 'PDF/X-1a',
  colorMode: 'cmyk',
  iccProfile: 'ISO Coated v2 (FOGRA39)',
  minDPI: 300,
};

// ─── Presets de Tipologia de Livro ──────────────────────────

export const BOOK_TYPE_PRESETS: Record<BookCategory, BookTypePreset> = {
  fiction: {
    category: 'fiction',
    name: '1. Texto Puro (Romance / Ficção)',
    defaultTrimWidth: 5.512, // 14cm
    defaultTrimHeight: 8.268, // 21cm
    defaultMargins: { top: 43, bottom: 43, inside: 57, outside: 43 },
    defaultBleed: 0,
    requiresWrap: false,
    requiresCMYK: false,
    requiresMasterTemplates: false,
  },
  'non-fiction': {
    category: 'non-fiction',
    name: '2. Imagens Ocasionais (Não-Ficção)',
    defaultTrimWidth: 6, // 6x9"
    defaultTrimHeight: 9,
    defaultMargins: { top: 51, bottom: 51, inside: 62, outside: 51 },
    defaultBleed: 9, // 0.125" (9px)
    requiresWrap: true,
    requiresCMYK: false,
    requiresMasterTemplates: false,
  },
  'kids-magazine': {
    category: 'kids-magazine',
    name: '3. Imagens com Contorno (Infantil / Revistas)',
    defaultTrimWidth: 8.25, // 8.25x8.25"
    defaultTrimHeight: 8.25,
    defaultMargins: { top: 34, bottom: 34, inside: 34, outside: 34 },
    defaultBleed: 9,
    requiresWrap: true,
    requiresCMYK: true,
    requiresMasterTemplates: false,
  },
  'art-photo': {
    category: 'art-photo',
    name: '4. Livro de Imagens (Arte / Fotografia)',
    defaultTrimWidth: 11, // 11" x 8.5" (Landscape)
    defaultTrimHeight: 8.5,
    defaultMargins: { top: 28, bottom: 28, inside: 28, outside: 28 },
    defaultBleed: 9,
    requiresWrap: false,
    requiresCMYK: true,
    requiresMasterTemplates: false,
  },
  technical: {
    category: 'technical',
    name: '5. Técnico / Didático (Manuais / Apostilas)',
    defaultTrimWidth: 8.268, // A4
    defaultTrimHeight: 11.693,
    defaultMargins: { top: 57, bottom: 57, inside: 71, outside: 57 },
    defaultBleed: 9,
    requiresWrap: false,
    requiresCMYK: false,
    requiresMasterTemplates: false,
  },
  poetry: {
    category: 'poetry',
    name: '6. Poesia / Peças',
    defaultTrimWidth: 5, // 5" x 8"
    defaultTrimHeight: 8,
    defaultMargins: { top: 57, bottom: 57, inside: 71, outside: 71 },
    defaultBleed: 0,
    requiresWrap: false,
    requiresCMYK: false,
    requiresMasterTemplates: false,
  },
  planner: {
    category: 'planner',
    name: '7. Cadernos / Planners / Agendas',
    defaultTrimWidth: 5.827, // A5
    defaultTrimHeight: 8.268,
    defaultMargins: { top: 34, bottom: 34, inside: 51, outside: 34 },
    defaultBleed: 9,
    requiresWrap: false,
    requiresCMYK: false,
    requiresMasterTemplates: true,
  },
};
