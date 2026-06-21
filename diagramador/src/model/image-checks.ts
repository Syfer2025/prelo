/**
 * Image checks — helpers PUROS de pré-impressão para frames de imagem.
 *
 * Foco em livro FÍSICO: a causa nº1 de rejeição em gráfica é imagem abaixo da
 * resolução mínima (DPI). Aqui calculamos o DPI EFETIVO = pixels originais da
 * imagem divididos pelo tamanho FÍSICO em que ela é impressa no frame.
 *
 * Unidades: `frame.width`/`frame.height` estão em pontos (1pt = 1/72 in); por isso
 * dividimos por `POINTS_PER_INCH` para obter polegadas antes de calcular o DPI.
 */

import { POINTS_PER_INCH } from './print-units';
import type { Frame, ImageFrame } from './types';

export function isImageFrame(frame: Frame): frame is ImageFrame {
  return frame.type === 'image';
}

export interface ImageDpi {
  dpiX: number;
  dpiY: number;
  /** DPI da dimensão limitante (a menor) — é o que decide a qualidade de impressão. */
  effectiveDpi: number;
}

export function imageEffectiveDpi(frame: ImageFrame): ImageDpi {
  const widthInches = frame.width / POINTS_PER_INCH;
  const heightInches = frame.height / POINTS_PER_INCH;
  const dpiX = widthInches > 0 ? frame.originalWidth / widthInches : 0;
  const dpiY = heightInches > 0 ? frame.originalHeight / heightInches : 0;
  return { dpiX, dpiY, effectiveDpi: Math.min(dpiX, dpiY) };
}
