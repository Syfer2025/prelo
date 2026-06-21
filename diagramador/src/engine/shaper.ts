/**
 * Shaper — Mede a largura de cada token usando métricas de fonte.
 * 
 * Fase 0: Usa ctx.measureText() como placeholder.
 * Fase 1: Será substituído por opentype.js para métricas determinísticas.
 * 
 * O Shaper é uma função pura: recebe tokens e retorna shaped tokens.
 * A medição é delegada a uma função injetada (MeasureFn), permitindo
 * trocar a implementação sem alterar o pipeline.
 */

import type { CharacterStyle } from '../model/types';
import type { Token, ShapedToken } from './types';

/**
 * Função de medição de texto.
 * Recebe o texto e o estilo, retorna a largura em pixels.
 */
export type MeasureFn = (text: string, style: CharacterStyle) => number;

/**
 * Cria uma MeasureFn baseada no Canvas 2D.
 * Esta é a implementação de "placeholder" — será substituída
 * por opentype.js na Fase 1 para métricas determinísticas.
 */
export function createCanvasMeasureFn(ctx: CanvasRenderingContext2D): MeasureFn {
  return (text: string, style: CharacterStyle): number => {
    ctx.font = buildFontString(style);
    return ctx.measureText(text).width;
  };
}

/**
 * Constrói a string CSS font a partir do CharacterStyle.
 * Ex: "italic bold 16px Georgia, serif"
 */
export function buildFontString(style: CharacterStyle): string {
  const parts: string[] = [];
  if (style.fontStyle === 'italic') parts.push('italic');
  if (style.fontWeight === 'bold') parts.push('bold');
  parts.push(`${style.fontSize}px`);
  parts.push(style.fontFamily);
  return parts.join(' ');
}

/**
 * Shape: adiciona largura medida a cada token.
 */
export function shapeTokens(tokens: Token[], measureFn: MeasureFn): ShapedToken[] {
  return tokens.map(token => ({
    ...token,
    width: token.value === '\n' ? 0 : measureFn(token.value, token.style),
  }));
}
