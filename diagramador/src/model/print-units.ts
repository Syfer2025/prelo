import type { Margins, PrintProfile } from './types';

export const POINTS_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

export type PrintUnit = 'pt' | 'in' | 'mm';

export interface PrintSizePt {
  width: number;
  height: number;
}

export interface PrintRectPt extends PrintSizePt {
  x: number;
  y: number;
}

export interface PrintRectInches {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintMarginsPt {
  top: number;
  bottom: number;
  inside: number;
  outside: number;
}

export interface PrintPageGeometry {
  unit: 'pt';
  trim: PrintSizePt;
  bleed: number;
  minMargins: PrintMarginsPt;
}

export function inchesToPt(inches: number): number {
  return inches * POINTS_PER_INCH;
}

export function ptToInches(points: number): number {
  return points / POINTS_PER_INCH;
}

export function mmToPt(mm: number): number {
  return inchesToPt(mm / MM_PER_INCH);
}

export function ptToMm(points: number): number {
  return ptToInches(points) * MM_PER_INCH;
}

export function marginsInchesToPt(margins: Margins): PrintMarginsPt {
  return {
    top: inchesToPt(margins.top),
    bottom: inchesToPt(margins.bottom),
    inside: inchesToPt(margins.inside),
    outside: inchesToPt(margins.outside),
  };
}

export function rectInchesToPt(rect: PrintRectInches): PrintRectPt {
  return {
    x: inchesToPt(rect.x),
    y: inchesToPt(rect.y),
    width: inchesToPt(rect.width),
    height: inchesToPt(rect.height),
  };
}

export function printProfileToPageGeometry(profile: PrintProfile): PrintPageGeometry {
  return {
    unit: 'pt',
    trim: {
      width: inchesToPt(profile.trimWidth),
      height: inchesToPt(profile.trimHeight),
    },
    bleed: inchesToPt(profile.bleed),
    minMargins: marginsInchesToPt(profile.minMargins),
  };
}
