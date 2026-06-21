/**
 * Spine & Cover Geometry — cálculo PURO da lombada e da capa física completa.
 *
 * Livro FÍSICO: a capa é uma peça única "espalhada" = contracapa + lombada + capa,
 * com sangria nas bordas externas. A lombada cresce com a contagem de páginas e o papel.
 * Este módulo NÃO desenha nada; só calcula dimensões confiáveis e testáveis.
 *
 * Unidades: cálculo interno em polegadas (as constantes de gráfica são em polegadas),
 * com saída também em mm e pontos PostScript para leitura/uso no PDF.
 */

import { inchesToPt, MM_PER_INCH } from './print-units';
import type { PrintRectPt } from './print-units';
import type { PrintProfile } from './types';

export type SpineFormula = 'kdp-white' | 'kdp-cream' | 'kdp-color' | 'offset-br';

/**
 * KDP: espessura adicionada por PÁGINA, em polegadas (multiplica a contagem total de
 * páginas, não de folhas). Fonte: Amazon KDP "Set Trim Size, Bleed, and Margins" /
 * calculadora oficial de lombada da KDP.
 *   white  (papel branco)         0.002252 in/página
 *   cream  (papel creme)          0.0025   in/página
 *   color  (papel colorido)       0.002347 in/página
 */
export const KDP_SPINE_CALIPER_INCHES: Record<'kdp-white' | 'kdp-cream' | 'kdp-color', number> = {
  'kdp-white': 0.002252,
  'kdp-cream': 0.0025,
  'kdp-color': 0.002347,
};

/**
 * Mínimo de páginas (recomendado) para imprimir TEXTO na lombada.
 * KDP recomenda evitar texto na lombada abaixo de ~100 páginas; offset/IngramSpark
 * costuma permitir a partir de ~48 páginas. Estes são limiares de recomendação, não
 * dimensões físicas — por isso ficam separados do cálculo de largura.
 */
export const MIN_PAGES_FOR_SPINE_TEXT: Record<SpineFormula, number> = {
  'kdp-white': 100,
  'kdp-cream': 100,
  'kdp-color': 100,
  'offset-br': 48,
};

/** Volume específico (bulk) padrão do papel offset quando não informado (cm³/g). */
export const DEFAULT_OFFSET_BULK_CM3_PER_G = 1.0;

export interface SpineStock {
  formula: SpineFormula;
  /** offset-br: gramatura do papel em g/m² (obrigatório para offset). */
  paperGsm?: number;
  /** offset-br: volume específico (bulk) em cm³/g. Default 1.0. */
  paperBulkCm3PerG?: number;
}

export interface SpineCalculationInput {
  pageCount: number;
  stock: SpineStock;
}

export interface SpineWidth {
  formula: SpineFormula;
  inches: number;
  mm: number;
  points: number;
  /** Páginas suficientes para texto na lombada (recomendação da gráfica). */
  hasPrintableSpine: boolean;
  minPagesForSpineText: number;
}

export interface CoverGeometryInput {
  trimWidthInches: number;
  trimHeightInches: number;
  bleedInches: number;
  pageCount: number;
  stock: SpineStock;
}

export interface CoverRegionsPt {
  backCover: PrintRectPt;
  spine: PrintRectPt;
  frontCover: PrintRectPt;
}

export interface CoverGeometry {
  spine: SpineWidth;
  fullWidthInches: number;
  fullHeightInches: number;
  fullWidthPt: number;
  fullHeightPt: number;
  /** Regiões em pontos, origem no canto da sangria (x cresce: contracapa → lombada → capa). */
  regionsPt: CoverRegionsPt;
}

/** Espessura adicionada por página, em polegadas, conforme o papel/fórmula. */
function caliperInchesPerPage(stock: SpineStock): number {
  if (stock.formula === 'offset-br') {
    if (stock.paperGsm == null || stock.paperGsm <= 0) {
      throw new Error('offset-br exige paperGsm (gramatura do papel em g/m²).');
    }
    const bulk = stock.paperBulkCm3PerG ?? DEFAULT_OFFSET_BULK_CM3_PER_G;
    // Espessura de UMA folha (mm) = gramatura(g/m²) × volume(cm³/g) / 1000.
    // Uma folha = 2 páginas → espessura por página (mm) = gsm × bulk / 2000.
    const mmPerPage = (stock.paperGsm * bulk) / 2000;
    return mmPerPage / MM_PER_INCH;
  }
  return KDP_SPINE_CALIPER_INCHES[stock.formula];
}

export function calculateSpineWidth(input: SpineCalculationInput): SpineWidth {
  const { pageCount, stock } = input;
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new RangeError(`pageCount inválido: ${pageCount} (precisa ser inteiro >= 1).`);
  }

  const inches = pageCount * caliperInchesPerPage(stock);
  const minPages = MIN_PAGES_FOR_SPINE_TEXT[stock.formula];

  return {
    formula: stock.formula,
    inches,
    mm: inches * MM_PER_INCH,
    points: inchesToPt(inches),
    hasPrintableSpine: pageCount >= minPages,
    minPagesForSpineText: minPages,
  };
}

export function calculateCoverGeometry(input: CoverGeometryInput): CoverGeometry {
  const { trimWidthInches, trimHeightInches, bleedInches, pageCount, stock } = input;
  if (trimWidthInches <= 0 || trimHeightInches <= 0 || bleedInches < 0) {
    throw new RangeError('Dimensões de trim/bleed inválidas para a capa.');
  }

  const spine = calculateSpineWidth({ pageCount, stock });

  // Capa espalhada: bleed | contracapa(trim) | lombada(spine) | capa(trim) | bleed
  const fullWidthInches = 2 * trimWidthInches + spine.inches + 2 * bleedInches;
  const fullHeightInches = trimHeightInches + 2 * bleedInches;

  const bleedPt = inchesToPt(bleedInches);
  const trimWpt = inchesToPt(trimWidthInches);
  const trimHpt = inchesToPt(trimHeightInches);
  const spinePt = spine.points;

  return {
    spine,
    fullWidthInches,
    fullHeightInches,
    fullWidthPt: inchesToPt(fullWidthInches),
    fullHeightPt: inchesToPt(fullHeightInches),
    regionsPt: {
      backCover: { x: bleedPt, y: bleedPt, width: trimWpt, height: trimHpt },
      spine: { x: bleedPt + trimWpt, y: bleedPt, width: spinePt, height: trimHpt },
      frontCover: { x: bleedPt + trimWpt + spinePt, y: bleedPt, width: trimWpt, height: trimHpt },
    },
  };
}

/**
 * Calcula a lombada a partir de um `PrintProfile` + contagem de páginas.
 * Retorna `null` quando os dados do papel não estão no perfil (offset-br precisa de
 * gramatura, que não é parte do `PrintProfile`).
 */
export function spineWidthFromProfile(profile: PrintProfile, pageCount: number): SpineWidth | null {
  if (profile.spineFormula === 'offset-br') return null;
  return calculateSpineWidth({ pageCount, stock: { formula: profile.spineFormula } });
}
