/**
 * PDF Layout — converte a saída do motor (geometria física + frame layouts) em
 * "placements" absolutos de PDF: caixas por página e runs com coordenadas em pontos,
 * já com o eixo Y INVERTIDO (PDF tem origem no canto inferior esquerdo).
 *
 * Esta é a parte arriscada (matemática de coordenada) e fica PURA e testável.
 * Um adaptador separado (próximo passo) só desenha esses placements com pdf-lib.
 */

import type { PhysicalDocumentGeometry } from '../model/physical-geometry';
import { isImageFrame } from '../model/image-checks';
import type { Frame } from '../model/types';
import type { FrameLayout } from './types';

/** Razão aproximada da baseline a partir do topo da linha (ascent ≈ fontSize × isto).
 *  Aproximação até o passo de métricas de fonte reais (opentype.js). */
const BASELINE_RATIO = 0.8;

export type PdfBox = [number, number, number, number]; // [x0, y0, x1, y1] em pontos

export interface PdfRunPlacement {
  text: string;
  x: number;        // pontos, origem inferior-esquerda
  y: number;        // pontos, baseline (Y já invertido)
  fontSize: number;
  color: string;
}

export interface PdfPagePlacement {
  id: string;
  mediaBox: PdfBox;
  trimBox: PdfBox;
  bleedBox: PdfBox;
  runs: PdfRunPlacement[];
  images: PdfImagePlacement[];
}

export interface PdfPlacements {
  unit: 'pt';
  pages: PdfPagePlacement[];
}

export interface PdfImagePlacement {
  frameId: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxToRect(box: { x: number; y: number; width: number; height: number }): PdfBox {
  return [box.x, box.y, box.x + box.width, box.y + box.height];
}

/**
 * Calcula os placements de PDF a partir da geometria física e dos frame layouts
 * (que já trazem `rectOnPage`, anexado por `flowStory`). Frames sem `rectOnPage`
 * ou que não pertençam à página são ignorados.
 */
export function computePdfPlacements(
  geometry: PhysicalDocumentGeometry,
  frameLayouts: FrameLayout[],
  framesById: Record<string, Frame> = {}
): PdfPlacements {
  const pages: PdfPagePlacement[] = geometry.pages.map((page) => {
    const mediaHeight = page.boxes.media.height;
    const runs: PdfRunPlacement[] = [];
    const images: PdfImagePlacement[] = [];

    for (const frameLayout of frameLayouts) {
      const physical = geometry.frames[frameLayout.frameId];
      const rect = frameLayout.rectOnPage;
      if (!physical || physical.pageId !== page.id || !rect) continue;

      for (const line of frameLayout.lines) {
        for (const run of line.runs) {
          const x = rect.x + line.x + run.x;
          // Topo da linha (de cima) + ascent → baseline (de cima); inverte para o PDF.
          const baselineFromTop = rect.y + line.y + run.style.fontSize * BASELINE_RATIO;
          runs.push({
            text: run.text,
            x,
            y: mediaHeight - baselineFromTop,
            fontSize: run.style.fontSize,
            color: run.style.color,
          });
        }
      }
    }

    for (const frameId of page.frameIds) {
      const frame = framesById[frameId];
      const physical = geometry.frames[frameId];
      if (!frame || !physical || !isImageFrame(frame)) continue;

      const rect = {
        x: page.boxes.trim.x + physical.rectOnTrim.x,
        y: page.boxes.trim.y + physical.rectOnTrim.y,
        width: physical.rectOnTrim.width,
        height: physical.rectOnTrim.height,
      };
      images.push({
        frameId: frame.id,
        imageUrl: frame.imageUrl,
        x: rect.x,
        y: mediaHeight - (rect.y + rect.height),
        width: rect.width,
        height: rect.height,
      });
    }

    return {
      id: page.id,
      mediaBox: boxToRect(page.boxes.media),
      trimBox: boxToRect(page.boxes.trim),
      bleedBox: boxToRect(page.boxes.bleed),
      runs,
      images,
    };
  });

  return { unit: 'pt', pages };
}
