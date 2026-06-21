import type { Document, Frame, Margins, PreflightIssue, PrintProfile } from './types';
import type { LayoutResult } from '../engine/types';
import { inchesToPt, printProfileToPageGeometry } from './print-units';
import { spineWidthFromProfile } from './spine';
import { imageEffectiveDpi, isImageFrame } from './image-checks';

export interface PreflightOptions {
  layout?: LayoutResult;
  /** Quando true, avisa se a contagem de páginas é baixa demais para texto na lombada. */
  expectSpineText?: boolean;
}

const EPSILON = 0.01;

export function runPreflight(
  document: Document,
  options: PreflightOptions = {}
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const print = printProfileToPageGeometry(document.printProfile);
  const requiredMargins = requiredPrintMargins(document.printProfile, document.pages.length);

  if (options.layout?.overflow) {
    issues.push({
      severity: 'error',
      code: 'TEXT_OVERFLOW',
      message: 'Texto sobrou fora dos frames depois da paginacao.',
    });
  }

  document.pages.forEach((page, pageIndex) => {
    if (!closeTo(page.width, print.trim.width) || !closeTo(page.height, print.trim.height)) {
      issues.push({
        severity: 'error',
        code: 'PAGE_SIZE_MISMATCH',
        message: `Pagina ${pageIndex + 1} nao bate com o trim do perfil (${print.trim.width}x${print.trim.height} pt).`,
        pageIndex,
      });
    }

    if (!closeTo(page.bleed, print.bleed)) {
      issues.push({
        severity: 'error',
        code: 'BLEED_MISMATCH',
        message: `Pagina ${pageIndex + 1} usa sangria ${page.bleed} pt, mas o perfil exige ${print.bleed} pt.`,
        pageIndex,
      });
    }

    for (const side of marginSides()) {
      if (page.margins[side] + EPSILON < requiredMargins[side]) {
        issues.push({
          severity: 'error',
          code: 'MARGIN_BELOW_MINIMUM',
          message: `Pagina ${pageIndex + 1}: margem ${side} ${page.margins[side]} pt abaixo do minimo ${requiredMargins[side]} pt.`,
          pageIndex,
        });
      }
    }

    for (const frameId of page.frames) {
      const frame = document.frames[frameId];
      if (!frame) {
        issues.push({
          severity: 'error',
          code: 'MISSING_FRAME',
          message: `Pagina ${pageIndex + 1} referencia o frame ausente "${frameId}".`,
          pageIndex,
          frameId,
        });
        continue;
      }

      const imageFrame = isImageFrame(frame) ? frame : null;
      if (
        (!imageFrame && !frameInsideTrim(frame, page.width, page.height)) ||
        (imageFrame && !imageInsideBleed(frame, page.width, page.height, page.bleed))
      ) {
        issues.push({
          severity: 'error',
          code: 'FRAME_OUTSIDE_TRIM',
          message: `Frame "${frame.id}" ultrapassa a area de corte da pagina ${pageIndex + 1}.`,
          pageIndex,
          frameId: frame.id,
        });
      }

      if (frame.type === 'text' && !textFrameInsideSafeArea(frame, page.width, page.height, requiredMargins)) {
        issues.push({
          severity: 'warning',
          code: 'TEXT_FRAME_OUTSIDE_SAFE_AREA',
          message: `Frame de texto "${frame.id}" invade a area de margem segura da pagina ${pageIndex + 1}.`,
          pageIndex,
          frameId: frame.id,
        });
      }

      if (imageFrame && imageMissingBleed(imageFrame, page.width, page.height, page.bleed)) {
        issues.push({
          severity: 'error',
          code: 'IMAGE_MISSING_BLEED',
          message: `Imagem "${frame.id}" toca o corte da pagina ${pageIndex + 1}, mas nao avanca ate a sangria exigida.`,
          pageIndex,
          frameId: frame.id,
        });
      }

      if (imageFrame && imageFrame.originalWidth > 0 && imageFrame.originalHeight > 0) {
        const { effectiveDpi } = imageEffectiveDpi(imageFrame);
        if (effectiveDpi + EPSILON < document.printProfile.minDPI) {
          issues.push({
            severity: 'warning',
            code: 'LOW_IMAGE_DPI',
            message: `Imagem "${frame.id}" a ~${Math.round(effectiveDpi)} DPI na pagina ${pageIndex + 1}, abaixo do minimo de ${document.printProfile.minDPI} DPI.`,
            pageIndex,
            frameId: frame.id,
          });
        }
      }
    }
  });

  for (const story of document.stories) {
    for (const frameId of story.frameChainIds) {
      const frame = document.frames[frameId];
      if (!frame) {
        issues.push({
          severity: 'error',
          code: 'MISSING_FRAME',
          message: `Story "${story.id}" referencia o frame ausente "${frameId}".`,
          frameId,
        });
        continue;
      }
      if (frame.type !== 'text') {
        issues.push({
          severity: 'error',
          code: 'NON_TEXT_FRAME_IN_STORY',
          message: `Story "${story.id}" referencia o frame "${frameId}", que nao e de texto.`,
          frameId,
        });
      }
    }
  }

  if (options.expectSpineText) {
    const spine = spineWidthFromProfile(document.printProfile, document.pages.length);
    if (spine && !spine.hasPrintableSpine) {
      issues.push({
        severity: 'warning',
        code: 'SPINE_TOO_THIN_FOR_TEXT',
        message: `Lombada com ${document.pages.length} paginas (~${spine.mm.toFixed(1)} mm) abaixo do minimo de ${spine.minPagesForSpineText} paginas recomendado para texto na lombada.`,
      });
    }
  }

  return dedupeIssues(issues);
}

export function requiredPrintMargins(profile: PrintProfile, pageCount: number): Margins {
  const gutter = profile.gutterTable.find((entry) => pageCount <= entry.maxPages)?.gutter;
  const inside = Math.max(profile.minMargins.inside, gutter ?? profile.minMargins.inside);

  return {
    top: inchesToPt(profile.minMargins.top),
    bottom: inchesToPt(profile.minMargins.bottom),
    inside: inchesToPt(inside),
    outside: inchesToPt(profile.minMargins.outside),
  };
}

function frameInsideTrim(frame: Frame, pageWidth: number, pageHeight: number): boolean {
  return (
    frame.x >= 0 &&
    frame.y >= 0 &&
    frame.width > 0 &&
    frame.height > 0 &&
    frame.x + frame.width <= pageWidth + EPSILON &&
    frame.y + frame.height <= pageHeight + EPSILON
  );
}

function imageInsideBleed(
  frame: Frame,
  pageWidth: number,
  pageHeight: number,
  bleed: number
): boolean {
  return (
    frame.x + EPSILON >= -bleed &&
    frame.y + EPSILON >= -bleed &&
    frame.width > 0 &&
    frame.height > 0 &&
    frame.x + frame.width <= pageWidth + bleed + EPSILON &&
    frame.y + frame.height <= pageHeight + bleed + EPSILON
  );
}

function imageMissingBleed(
  frame: Frame,
  pageWidth: number,
  pageHeight: number,
  bleed: number
): boolean {
  if (bleed <= EPSILON) return false;

  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const touchesLeftTrim = frame.x <= EPSILON;
  const touchesTopTrim = frame.y <= EPSILON;
  const touchesRightTrim = right >= pageWidth - EPSILON;
  const touchesBottomTrim = bottom >= pageHeight - EPSILON;

  return (
    (touchesLeftTrim && frame.x > -bleed + EPSILON) ||
    (touchesTopTrim && frame.y > -bleed + EPSILON) ||
    (touchesRightTrim && right < pageWidth + bleed - EPSILON) ||
    (touchesBottomTrim && bottom < pageHeight + bleed - EPSILON)
  );
}

function textFrameInsideSafeArea(
  frame: Frame,
  pageWidth: number,
  pageHeight: number,
  margins: Margins
): boolean {
  return (
    frame.x + EPSILON >= margins.inside &&
    frame.y + EPSILON >= margins.top &&
    frame.x + frame.width <= pageWidth - margins.outside + EPSILON &&
    frame.y + frame.height <= pageHeight - margins.bottom + EPSILON
  );
}

function closeTo(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function marginSides(): Array<keyof Margins> {
  return ['top', 'bottom', 'inside', 'outside'];
}

function dedupeIssues(issues: PreflightIssue[]): PreflightIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.pageIndex ?? ''}:${issue.frameId ?? ''}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
