import opentype from 'opentype.js';
import type { CharacterStyle } from '../model/types';
import { fontRegistry } from './font-registry';

/**
 * Mede a largura exata de um texto em pixels usando métricas de fonte binária do opentype.js.
 */
export function measureTextWithFont(
  text: string,
  font: opentype.Font,
  fontSize: number,
  letterSpacing: number = 0
): number {
  if (!text) return 0;

  const scale = (1 / font.unitsPerEm) * fontSize;
  const glyphs = Array.from(text).map((char) => font.charToGlyph(char));
  let totalWidth = 0;

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    if (!glyph) continue;

    let advance = glyph.advanceWidth || 0;

    // Aplicar kerning se não for o último glifo
    if (i < glyphs.length - 1) {
      const nextGlyph = glyphs[i + 1];
      if (nextGlyph) {
        const kerningValue = font.getKerningValue(glyph, nextGlyph);
        advance += kerningValue;
      }
    }

    // Avanço em pixels + letterSpacing (tracking)
    totalWidth += advance * scale + letterSpacing;
  }

  return totalWidth;
}

/**
 * Cria uma MeasureFn compatível com o motor, baseada em opentype.js.
 * Se a fonte não estiver carregada, faz fallback temporário para a medição passada
 * ou zera.
 */
export function createOpentypeMeasureFn(fallbackMeasureFn?: (text: string, style: CharacterStyle) => number) {
  return (text: string, style: CharacterStyle): number => {
    // Tenta encontrar a fonte correspondente
    const font = fontRegistry.getFont(style.fontFamily);
    if (font) {
      return measureTextWithFont(text, font, style.fontSize, style.letterSpacing);
    }
    // Caso a fonte específica do estilo não esteja no registro, tenta usar EB Garamond ou Lora como default
    const defaultFont = fontRegistry.getFont('Lora') || fontRegistry.getFont('EB Garamond');
    if (defaultFont) {
      return measureTextWithFont(text, defaultFont, style.fontSize, style.letterSpacing);
    }

    // Fallback se nenhuma fonte binária estiver carregada
    if (fallbackMeasureFn) {
      return fallbackMeasureFn(text, style);
    }

    // Fallback ingênuo (estimativa de proporção de fonte monospace/serifada básica)
    return text.length * style.fontSize * 0.5;
  };
}
