import type { Document, Frame, Page } from './types';
import type { PrintMarginsPt, PrintPageGeometry, PrintRectPt } from './print-units';
import { printProfileToPageGeometry } from './print-units';

export interface PhysicalPdfBoxes {
  media: PrintRectPt;
  bleed: PrintRectPt;
  trim: PrintRectPt;
}

export interface PhysicalPageGeometry {
  id: string;
  side: Page['side'];
  frameIds: string[];
  boxes: PhysicalPdfBoxes;
  minMargins: PrintMarginsPt;
}

export interface PhysicalFrameGeometry {
  id: string;
  pageId: string;
  type: Frame['type'];
  storyId: string | null;
  rotation: number;
  rectOnTrim: PrintRectPt;
}

export interface PhysicalDocumentGeometry {
  unit: 'pt';
  print: PrintPageGeometry;
  pages: PhysicalPageGeometry[];
  frames: Record<string, PhysicalFrameGeometry>;
}

/**
 * Ponte entre a geometria física normalizada e o Frame Filler.
 *
 * Resolve a cadeia de frames de uma Story (na ordem de `frameChainIds`) a partir
 * da geometria normalizada, devolvendo `Frame[]` derivados de `rectOnTrim` (pontos,
 * relativos ao trim). O layout passa, assim, a consumir a geometria física como
 * fonte da verdade — em vez dos `Frame` crus do documento.
 */
export function framesFromPhysicalGeometry(
  geometry: PhysicalDocumentGeometry,
  frameChainIds: string[],
  storyId: string
): Frame[] {
  return frameChainIds.map((frameId) => {
    const physical = geometry.frames[frameId];
    if (!physical) {
      throw new Error(`Frame "${frameId}" not found for story "${storyId}"`);
    }
    if (physical.type !== 'text') {
      throw new Error(`Frame "${frameId}" is not a text frame`);
    }

    return {
      id: physical.id,
      pageId: physical.pageId,
      x: physical.rectOnTrim.x,
      y: physical.rectOnTrim.y,
      width: physical.rectOnTrim.width,
      height: physical.rectOnTrim.height,
      rotation: physical.rotation,
      type: physical.type,
      storyId: physical.storyId,
      nextFrameId: null,
      prevFrameId: null,
    };
  });
}

/**
 * Retângulo do frame em coordenadas físicas ABSOLUTAS da página (pontos),
 * relativo ao MediaBox: origem do TrimBox da página + `rectOnTrim` do frame.
 *
 * Permite que o futuro PDF posicione o frame na página sem recalcular o layout.
 * Alterar o bleed move o TrimBox dentro do MediaBox (e, portanto, este retângulo),
 * mas NÃO altera as coordenadas de texto relativas ao frame.
 */
export function frameRectOnPage(
  geometry: PhysicalDocumentGeometry,
  frameId: string
): PrintRectPt {
  const physical = geometry.frames[frameId];
  if (!physical) {
    throw new Error(`Frame "${frameId}" not found in physical geometry`);
  }

  const page = geometry.pages.find((candidate) => candidate.id === physical.pageId);
  if (!page) {
    throw new Error(`Page "${physical.pageId}" not found for frame "${frameId}"`);
  }

  const { trim } = page.boxes;
  return {
    x: trim.x + physical.rectOnTrim.x,
    y: trim.y + physical.rectOnTrim.y,
    width: physical.rectOnTrim.width,
    height: physical.rectOnTrim.height,
  };
}

export function normalizeDocumentGeometry(document: Document): PhysicalDocumentGeometry {
  const print = printProfileToPageGeometry(document.printProfile);

  return {
    unit: 'pt',
    print,
    pages: document.pages.map((page) => normalizePage(page, print)),
    frames: normalizeFrames(document.frames),
  };
}

function normalizePage(page: Page, print: PrintPageGeometry): PhysicalPageGeometry {
  return {
    id: page.id,
    side: page.side,
    frameIds: page.frames,
    boxes: createPdfBoxes(print),
    minMargins: print.minMargins,
  };
}

function normalizeFrames(frames: Record<string, Frame>): Record<string, PhysicalFrameGeometry> {
  return Object.fromEntries(
    Object.entries(frames).map(([id, frame]) => [
      id,
      {
        id: frame.id,
        pageId: frame.pageId,
        type: frame.type,
        storyId: frame.storyId,
        rotation: frame.rotation,
        rectOnTrim: {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
        },
      },
    ])
  );
}

function createPdfBoxes(print: PrintPageGeometry): PhysicalPdfBoxes {
  const mediaWidth = print.trim.width + print.bleed * 2;
  const mediaHeight = print.trim.height + print.bleed * 2;

  return {
    media: { x: 0, y: 0, width: mediaWidth, height: mediaHeight },
    bleed: { x: 0, y: 0, width: mediaWidth, height: mediaHeight },
    trim: {
      x: print.bleed,
      y: print.bleed,
      width: print.trim.width,
      height: print.trim.height,
    },
  };
}
