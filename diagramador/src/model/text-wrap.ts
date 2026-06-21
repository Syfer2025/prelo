/**
 * Text wrap — geometria PURA do contorno de texto ao redor de obstáculos (imagens).
 *
 * Esta é a base do diferencial do Prelo: texto que envolve imagens. O algoritmo é
 * "por bandas": para cada faixa vertical de uma linha [bandTop, bandBottom), calcula
 * o maior intervalo horizontal LIVRE, descontando os obstáculos que cruzam a banda.
 *
 * v1 (bounding-box, intervalo único): cada linha usa UM intervalo contíguo — cobre o
 * caso comum de livro (imagem encostada num lado, texto do outro). Texto nos DOIS
 * lados de uma imagem central (multi-intervalo) fica para depois.
 *
 * Coordenadas: tudo em pontos, LOCAIS ao text frame (x a partir da esquerda do frame,
 * y a partir do topo do frame).
 */

import { isImageFrame } from './image-checks';
import type { Frame } from './types';

/** Em qual lado do obstáculo o texto pode fluir (igual a `TextWrapConfig.sides`). */
export type WrapSides = 'both' | 'left' | 'right' | 'largest';

export interface WrapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  offset?: number;
  mask?: AlphaMask;
  /** Lados permitidos para o texto. Default: 'both' (texto dos dois lados). */
  sides?: WrapSides;
  /** Polígono de contorno, pontos NORMALIZADOS (0..1) no retângulo da imagem. */
  polygon?: { x: number; y: number }[];
}

export interface BandInterval {
  x: number;
  width: number;
}

export interface AlphaMask {
  width: number;
  height: number;
  alpha: Uint8Array | Uint8ClampedArray;
  threshold: number;
}

export interface ObstaclesForTextFrameOptions {
  masksByFrameId?: Record<string, AlphaMask>;
}

/**
 * Maior intervalo horizontal livre numa banda vertical [bandTop, bandBottom),
 * dado o conjunto de obstáculos (em coords locais ao frame). Para cada obstáculo
 * que cruza a banda, mantemos o maior dos dois lados livres (intervalo único).
 */
export function computeBandInterval(
  frameWidth: number,
  bandTop: number,
  bandBottom: number,
  obstacles: WrapRect[]
): BandInterval {
  let left = 0;
  let right = frameWidth;

  for (const obstacle of obstacles) {
    const occupied = occupiedIntervalForBand(obstacle, bandTop, bandBottom);
    if (!occupied) continue;

    const obstacleLeft = occupied.left;
    const obstacleRight = occupied.right;
    if (obstacleRight <= left || obstacleLeft >= right) continue; // fora do intervalo atual

    const leftGap = obstacleLeft - left;
    const rightGap = right - obstacleRight;
    if (rightGap >= leftGap) {
      left = Math.max(left, obstacleRight); // mantém o lado direito (gap maior)
    } else {
      right = Math.min(right, obstacleLeft); // mantém o lado esquerdo
    }
  }

  return { x: left, width: Math.max(0, right - left) };
}

/**
 * MULTI-INTERVALO: devolve TODOS os intervalos horizontais livres na banda, na ordem
 * esquerda→direita. É o que permite texto dos DOIS lados de uma imagem central.
 *
 * Por obstáculo, `sides` converte a área ocupada num "span efetivo bloqueado":
 *  - 'both'    → bloqueia só a imagem  ([occ.left, occ.right]) ⇒ pode sobrar texto nos 2 lados;
 *  - 'left'    → texto só à esquerda   (bloqueia [occ.left, frameWidth]);
 *  - 'right'   → texto só à direita    (bloqueia [0, occ.right]);
 *  - 'largest' → mantém só o maior vão (bloqueia a imagem + o lado menor); empate → direita
 *               (idêntico ao `computeBandInterval` clássico).
 * Os spans efetivos são unidos e o complemento em [0, frameWidth] são os intervalos livres.
 * Suporta os mesmos obstáculos de `computeBandInterval` (bounding-box e alpha-channel).
 */
export function computeBandIntervals(
  frameWidth: number,
  bandTop: number,
  bandBottom: number,
  obstacles: WrapRect[]
): BandInterval[] {
  const spans: Array<[number, number]> = [];

  for (const obstacle of obstacles) {
    const occupied = occupiedIntervalForBand(obstacle, bandTop, bandBottom);
    if (!occupied) continue;

    const occLeft = clamp(occupied.left, 0, frameWidth);
    const occRight = clamp(occupied.right, 0, frameWidth);
    if (occRight <= occLeft) continue;

    const sides = obstacle.sides ?? 'both';
    let blockLeft = occLeft;
    let blockRight = occRight;

    if (sides === 'left') {
      blockRight = frameWidth; // some o lado direito → texto só à esquerda
    } else if (sides === 'right') {
      blockLeft = 0; // some o lado esquerdo → texto só à direita
    } else if (sides === 'largest') {
      const leftGap = occLeft;
      const rightGap = frameWidth - occRight;
      if (rightGap >= leftGap) {
        blockLeft = 0; // mantém o vão direito (maior/empate) → bloqueia tudo à esquerda
      } else {
        blockRight = frameWidth; // mantém o vão esquerdo
      }
    }
    // 'both' → mantém [occLeft, occRight]

    if (blockRight > blockLeft) spans.push([blockLeft, blockRight]);
  }

  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [l, r] of spans) {
    const last = merged[merged.length - 1];
    if (last && l <= last[1]) {
      last[1] = Math.max(last[1], r);
    } else {
      merged.push([l, r]);
    }
  }

  const intervals: BandInterval[] = [];
  let pos = 0;
  for (const [l, r] of merged) {
    if (l > pos) intervals.push({ x: pos, width: l - pos });
    pos = Math.max(pos, r);
  }
  if (pos < frameWidth) intervals.push({ x: pos, width: frameWidth - pos });

  return intervals.filter((interval) => interval.width > 0);
}

/**
 * Extrai os obstáculos de wrap para um text frame: frames de imagem com
 * `textWrap.mode !== 'none'` que se sobrepõem ao text frame. Converte para coords
 * locais ao text frame e expande pela `offset` do wrap. Ignora imagens que não
 * cruzam o frame e frames que não são imagem.
 */
export function obstaclesForTextFrame(
  textFrame: Frame,
  candidateFrames: Frame[],
  options: ObstaclesForTextFrameOptions = {}
): WrapRect[] {
  const rects: WrapRect[] = [];

  for (const frame of candidateFrames) {
    if (!isImageFrame(frame) || frame.textWrap.mode === 'none') continue;

    const offset = frame.textWrap.offset;
    const alphaMask =
      frame.textWrap.mode === 'alpha-channel' ? options.masksByFrameId?.[frame.id] : undefined;
    const polygon =
      frame.textWrap.mode === 'polygon' && (frame.textWrap.polygon?.length ?? 0) >= 3
        ? frame.textWrap.polygon
        : undefined;
    // Contornos (alpha/polygon) mantêm o retângulo base e aplicam o offset por banda;
    // bounding-box infla o próprio retângulo pela offset.
    const isContour = alphaMask !== undefined || polygon !== undefined;
    const local: WrapRect = {
      x: frame.x - textFrame.x,
      y: frame.y - textFrame.y,
      width: frame.width,
      height: frame.height,
      sides: frame.textWrap.sides,
      ...(isContour
        ? {
            offset,
            ...(alphaMask ? { mask: alphaMask } : {}),
            ...(polygon ? { polygon } : {}),
          }
        : {
            x: frame.x - offset - textFrame.x,
            y: frame.y - offset - textFrame.y,
            width: frame.width + offset * 2,
            height: frame.height + offset * 2,
          }),
    };

    // Mantém apenas se cruza a área do text frame.
    const bleed = local.offset ?? 0;
    const overlaps =
      local.x - bleed < textFrame.width &&
      local.x + local.width + bleed > 0 &&
      local.y - bleed < textFrame.height &&
      local.y + local.height + bleed > 0;
    if (overlaps) rects.push(local);
  }

  return rects;
}

function occupiedIntervalForBand(
  obstacle: WrapRect,
  bandTop: number,
  bandBottom: number
): { left: number; right: number } | null {
  if (obstacle.polygon && obstacle.polygon.length >= 3) {
    return polygonIntervalForBand(obstacle, bandTop, bandBottom);
  }

  if (!obstacle.mask) {
    const overlapsBand = obstacle.y < bandBottom && obstacle.y + obstacle.height > bandTop;
    if (!overlapsBand) return null;
    return { left: obstacle.x, right: obstacle.x + obstacle.width };
  }

  return alphaMaskIntervalForBand(obstacle, bandTop, bandBottom);
}

/**
 * Intervalo ocupado por um polígono numa banda (conservador, v1). Amostra o topo,
 * meio e base da banda; em cada Y normalizado pega o min/max das interseções com as
 * arestas; converte para coord local do frame e aplica o offset. Não tenta múltiplos
 * vãos internos de polígono côncavo (o objetivo é ajuste manual útil, não CAD).
 */
function polygonIntervalForBand(
  obstacle: WrapRect,
  bandTop: number,
  bandBottom: number
): { left: number; right: number } | null {
  const polygon = obstacle.polygon;
  if (!polygon || polygon.length < 3 || obstacle.height <= 0) return null;

  const offset = obstacle.offset ?? 0;
  const sampleYs = [bandTop, (bandTop + bandBottom) / 2, bandBottom].map(
    (y) => (y - obstacle.y) / obstacle.height
  );

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sampleY of sampleYs) {
    if (sampleY < 0 || sampleY > 1) continue;
    for (const x of polygonIntersectionsAtY(polygon, sampleY)) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  return {
    left: obstacle.x + min * obstacle.width - offset,
    right: obstacle.x + max * obstacle.width + offset,
  };
}

function polygonIntersectionsAtY(polygon: { x: number; y: number }[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      xs.push(a.x + t * (b.x - a.x));
    }
  }
  return xs.sort((p, q) => p - q);
}

function alphaMaskIntervalForBand(
  obstacle: WrapRect,
  bandTop: number,
  bandBottom: number
): { left: number; right: number } | null {
  const mask = obstacle.mask;
  if (!mask || mask.width <= 0 || mask.height <= 0 || obstacle.width <= 0 || obstacle.height <= 0) {
    return null;
  }

  const offset = obstacle.offset ?? 0;
  const inflatedTop = obstacle.y - offset;
  const inflatedBottom = obstacle.y + obstacle.height + offset;
  if (inflatedTop >= bandBottom || inflatedBottom <= bandTop) return null;

  const localTop = Math.max(0, bandTop - obstacle.y - offset);
  const localBottom = Math.min(obstacle.height, bandBottom - obstacle.y + offset);
  if (localBottom <= 0 || localTop >= obstacle.height) return null;

  const y0 = clamp(Math.floor((localTop / obstacle.height) * mask.height), 0, mask.height - 1);
  const y1 = clamp(Math.ceil((localBottom / obstacle.height) * mask.height), 0, mask.height);

  let minX = mask.width;
  let maxX = -1;
  for (let y = y0; y < y1; y++) {
    const row = y * mask.width;
    for (let x = 0; x < mask.width; x++) {
      if ((mask.alpha[row + x] ?? 0) >= mask.threshold) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }

  if (maxX < minX) return null;

  const left = obstacle.x + (minX / mask.width) * obstacle.width - offset;
  const right = obstacle.x + ((maxX + 1) / mask.width) * obstacle.width + offset;
  return { left, right };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
