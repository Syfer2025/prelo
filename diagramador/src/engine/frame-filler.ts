import type { BaselineGridConfig, Frame, Page } from '../model/types';
import type { ShapedToken, LayoutResult, FrameLayout, LayoutRun } from './types';
import { TokenType } from './types';
import type { MeasureFn } from './shaper';
import { splitIntoParagraphs, breakParagraphKP, breakParagraphGreedy } from './line-breaker';
import { computeBandIntervals, obstaclesForTextFrame } from '../model/text-wrap';
import type { AlphaMask, WrapRect } from '../model/text-wrap';

export interface FrameFillerConfig {
  measureFn: MeasureFn;
  algorithm?: 'kp' | 'greedy';
  /** Frames da página/documento usados para extrair obstáculos de text-wrap. */
  wrapFrames?: Frame[];
  /** Máscaras alpha por frame de imagem, usadas por `textWrap.mode = alpha-channel`. */
  wrapMasksByFrameId?: Record<string, AlphaMask>;
  /** Grade base do documento. Quando presente, alinha baselines à grade vertical. */
  baselineGrid?: BaselineGridConfig;
  /** Páginas do documento, usadas para interpretar `baselineGrid.startOffset` a partir da margem. */
  pages?: Page[];
}

/** Leading padrão (multiplicador do fontSize) quando o token não traz lineHeight. */
const DEFAULT_LINE_HEIGHT = 1.5;
const BASELINE_RATIO = 0.8;
const MAX_JUSTIFY_EXTRA_SPACE_RATIO = 4;

/**
 * Preenche os frames com texto, produzindo o LayoutResult final.
 * Utiliza o algoritmo Knuth-Plass por parágrafo, recalculando a quebra
 * caso ocorra transbordo para um frame com dimensões diferentes.
 */
export function fillFrames(
  shapedTokens: ShapedToken[],
  frames: Frame[],
  config: FrameFillerConfig
): LayoutResult {
  const { measureFn } = config;

  // Resultado: um FrameLayout por frame
  const frameLayouts: FrameLayout[] = frames.map(f => ({
    frameId: f.id,
    lines: [],
  }));

  if (shapedTokens.length === 0 || frames.length === 0) {
    return { frameLayouts, overflow: false, overflowText: '' };
  }

  // 1. Dividir os tokens em parágrafos separados
  const paragraphs = splitIntoParagraphs(shapedTokens);
  
  let frameIdx = 0;
  let currentY = 0;
  let overflow = false;
  const overflowedTokens: ShapedToken[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx]!;

    if (overflow) {
      overflowedTokens.push(...paragraph);
      if (pIdx < paragraphs.length - 1) {
        overflowedTokens.push({
          type: TokenType.NEWLINE,
          value: '\n',
          width: 0,
          style: paragraph[0]?.style ?? shapedTokens[0]!.style,
        });
      }
      continue;
    }

    let remainingTokens = [...paragraph];

    // Se o parágrafo estiver vazio (ex: quebra de linha dupla), adiciona uma linha vazia
    if (remainingTokens.length === 0) {
      const frame = frames[frameIdx];
      if (!frame) {
        overflow = true;
        continue;
      }
      const style = shapedTokens[0]!.style;
      const lineHeightPx = style.fontSize * (shapedTokens[0]!.lineHeight ?? DEFAULT_LINE_HEIGHT);
      let lineY = snapLineTopToBaselineGrid(currentY, frame, [shapedTokens[0]!], shapedTokens, config);

      if (lineY + lineHeightPx > frame.height) {
        frameIdx++;
        currentY = 0;
      }

      const nextFrame = frames[frameIdx];
      if (!nextFrame) {
        overflow = true;
        continue;
      }
      lineY = snapLineTopToBaselineGrid(currentY, nextFrame, [shapedTokens[0]!], shapedTokens, config);

      frameLayouts[frameIdx]!.lines.push({
        text: '',
        x: 0,
        y: lineY,
        width: 0,
        height: lineHeightPx,
        style,
        runs: [],
      });
      currentY = lineY + lineHeightPx;
      continue;
    }

    // Propriedades de parágrafo (capturadas uma vez): alinhamento e espaçamento vertical.
    const para0 = paragraph[0];
    const spaceBefore = para0?.spaceBefore ?? 0;
    const spaceAfter = para0?.spaceAfter ?? 0;
    const align = para0?.align ?? 'left';
    const indent = para0?.indent ?? 0;
    // Composição editorial. Default 1/1 = SEM restrição (preserva tokens sintéticos dos testes);
    // o produto injeta os valores do ParagraphStyle (ex.: 2/2) via flowStory.
    const orphans = Math.max(1, para0?.orphans ?? 1);
    const widows = Math.max(1, para0?.widows ?? 1);
    const keepTogether = para0?.keepLinesTogether ?? false;
    const pageBreakBefore = para0?.pageBreakBefore ?? false;
    const keepWithNext = para0?.keepWithNext ?? false;
    let paragraphLinesPlaced = 0; // controla o recuo de primeira linha entre frames

    // Espaço antes do parágrafo — suprimido no topo do frame (currentY === 0).
    if (currentY > 0 && spaceBefore > 0) {
      currentY += spaceBefore;
    }

    // Processa os tokens do parágrafo corrente
    while (remainingTokens.length > 0) {
      const frame = frames[frameIdx];
      if (!frame) {
        overflow = true;
        overflowedTokens.push(...remainingTokens);
        break;
      }
      const wrapObstacles = wrapObstaclesForFrame(
        frame,
        config.wrapFrames,
        config.wrapMasksByFrameId
      );

      if (wrapObstacles.length > 0) {
        const lineProbe = remainingTokens[0] ?? shapedTokens[0]!;
        const style = lineProbe.style;
        const lineHeightMultiplier =
          lineProbe.lineHeight ?? shapedTokens[0]!.lineHeight ?? DEFAULT_LINE_HEIGHT;
        const lineHeightPx = style.fontSize * lineHeightMultiplier;
        const bandY = snapLineTopToBaselineGrid(currentY, frame, [lineProbe], shapedTokens, config);

        if (bandY + lineHeightPx > frame.height) {
          frameIdx++;
          currentY = 0;
          continue;
        }

        const algo = config.algorithm ?? 'kp';
        // MULTI-INTERVALO: a banda pode ter mais de um vão livre (texto dos dois lados de
        // uma imagem central). Preenchemos os vãos esquerda→direita, todos no mesmo Y.
        const intervals = computeBandIntervals(
          frame.width,
          bandY,
          bandY + lineHeightPx,
          wrapObstacles
        );

        let placedOnBand = false;
        for (const interval of intervals) {
          if (remainingTokens.length === 0) break;

          const isParagraphFirstLine = paragraphLinesPlaced === 0;
          const extraIndent = isParagraphFirstLine && indent > 0 && !placedOnBand ? indent : 0;
          const usableWidth = interval.width - extraIndent;
          if (usableWidth <= 0) continue; // vão estreito demais → tenta o próximo

          const rawLines = algo === 'greedy'
            ? breakParagraphGreedy(remainingTokens, usableWidth, measureFn)
            : breakParagraphKP(remainingTokens, usableWidth, measureFn);
          const lines = enforceMaxLineWidth(rawLines, usableWidth, measureFn);
          const line = lines[0];
          if (!line) break;

          const lineText = line.map(t => t.value).join('');
          const lineWidth = line.reduce((sum, t) => sum + t.width, 0);
          const lineX = interval.x + extraIndent + alignLineX(align, lineWidth, usableWidth);
          const remainingLines = lines.slice(1);
          // Justifica enquanto ainda houver texto a fluir (não justifica o último fragmento).
          const justify = align === 'justify' && remainingLines.length > 0;
          const runs = buildLineRuns(line, justify, usableWidth, lineWidth);

          frameLayouts[frameIdx]!.lines.push({
            text: lineText,
            x: lineX,
            y: bandY,
            width: lineWidth,
            height: lineHeightPx,
            style,
            runs,
          });

          placedOnBand = true;
          paragraphLinesPlaced++;
          remainingTokens =
            remainingLines.length > 0 ? tokensFromRemainingLines(remainingLines, measureFn) : [];
          if (remainingTokens.length === 0) break;
        }

        // Banda toda bloqueada (nenhum vão utilizável) OU fragmentos colocados: avança o Y.
        // Avançar sempre garante terminação (anti-loop), pois o topo do loop troca de frame
        // quando currentY ultrapassa a altura.
        currentY = bandY + lineHeightPx;
        if (placedOnBand && remainingTokens.length === 0) break;
        continue;
      }

      // A PRIMEIRA linha do parágrafo quebra numa largura útil reduzida pelo recuo
      // (indent); as demais usam a largura cheia do frame.
      const effectiveWidth = paragraphLinesPlaced === 0 && indent > 0
        ? frame.width - indent
        : frame.width;

      // Executa a quebra de linha do parágrafo de acordo com o algoritmo selecionado
      const algo = config.algorithm ?? 'kp';
      const rawLines = algo === 'greedy'
        ? breakParagraphGreedy(remainingTokens, effectiveWidth, measureFn)
        : breakParagraphKP(remainingTokens, effectiveWidth, measureFn);

      // Freio de emergência: nenhuma linha pode ser mais larga que a largura útil.
      // Palavras sem ponto de quebra (sequências longas sem espaço/hífen) são quebradas
      // por caractere — caso contrário "vazariam" para fora da caixa.
      const lines = enforceMaxLineWidth(rawLines, effectiveWidth, measureFn);

      // ── Composição editorial: decide QUANTAS linhas ficam neste frame ──
      const isParagraphStart = paragraphLinesPlaced === 0;

      // page-break-before: o parágrafo deve começar no topo de um novo frame.
      if (pageBreakBefore && isParagraphStart && currentY > 0) {
        frameIdx++;
        currentY = 0;
        continue;
      }

      const maxFit = countLinesThatFit(lines, currentY, frame, shapedTokens, config);
      const totalLines = lines.length;
      let linesToPlace = Math.min(maxFit, totalLines);
      const willSplit = maxFit < totalLines;

      // keep-with-next: o parágrafo cabe inteiro aqui (ex.: título), mas não pode ficar separado
      // do INÍCIO do parágrafo seguinte. Se não sobra espaço nem para a 1ª linha do próximo,
      // desce o parágrafo junto (apenas fora do topo do frame, para não entrar em loop).
      if (keepWithNext && isParagraphStart && currentY > 0 && !willSplit) {
        const nextPara = paragraphs[pIdx + 1];
        if (nextPara && nextPara.length > 0) {
          let paragraphHeight = 0;
          for (const ln of lines) paragraphHeight += lineHeightPxOf(ln, shapedTokens);
          const nextFirstLineHeight = lineHeightPxOf(nextPara, shapedTokens);
          if (currentY + paragraphHeight + spaceAfter + nextFirstLineHeight > frame.height) {
            frameIdx++;
            currentY = 0;
            continue;
          }
        }
      }

      // keep-together / órfãs: se dividiria o parágrafo e NÃO estamos no topo do frame,
      // empurra o restante todo para o próximo frame (o `currentY > 0` evita loop infinito).
      if (willSplit && currentY > 0 && (keepTogether || (isParagraphStart && maxFit < orphans))) {
        frameIdx++;
        currentY = 0;
        continue;
      }

      // viúvas: não deixar menos que `widows` linhas finais para o próximo frame.
      if (willSplit) {
        const leftover = totalLines - linesToPlace;
        if (leftover > 0 && leftover < widows) {
          const reduced = totalLines - widows;
          if (reduced >= 1 && (!isParagraphStart || reduced >= orphans)) {
            linesToPlace = reduced; // puxa linhas para baixo
          } else if (isParagraphStart && currentY > 0) {
            // não dá para honrar viúvas e órfãs juntas aqui → empurra o parágrafo todo.
            frameIdx++;
            currentY = 0;
            continue;
          }
          // (no topo do frame, mantém o que dá: nunca empurra para não criar loop)
        }
      }

      // Anti-loop: frame que não comporta nem 1 linha ainda recebe 1 (a paginação cuida do resto).
      if (currentY === 0 && linesToPlace < 1) {
        linesToPlace = 1;
      }

      let linesPlaced = 0;

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        // Atingiu o limite editorial/vertical deste frame → resto vai para o próximo.
        if (lIdx >= linesToPlace) {
          frameIdx++;
          currentY = 0;
          break;
        }

        const line = lines[lIdx]!;
        const style = line[0]?.style ?? shapedTokens[0]!.style;
        const lineHeightMultiplier = line[0]?.lineHeight ?? shapedTokens[0]!.lineHeight ?? DEFAULT_LINE_HEIGHT;
        const lineHeightPx = style.fontSize * lineHeightMultiplier;
        const lineY = snapLineTopToBaselineGrid(currentY, frame, line, shapedTokens, config);

        if (lineY + lineHeightPx > frame.height) {
          frameIdx++;
          currentY = 0;
          break;
        }

        const lineText = line.map(t => t.value).join('');
        const lineWidth = line.reduce((sum, t) => sum + t.width, 0);

        // Recuo só na primeira linha do parágrafo; soma ao x do alinhamento.
        const isParagraphFirstLine = paragraphLinesPlaced === 0;
        const extraIndent = isParagraphFirstLine && indent > 0 ? indent : 0;
        const usableWidth = frame.width - extraIndent;
        const lineX = extraIndent + alignLineX(align, lineWidth, usableWidth);

        // Justifica todas as linhas do parágrafo, menos a última (que termina o texto).
        const isLastOfParagraph = lIdx === lines.length - 1;
        const justify = align === 'justify' && !isLastOfParagraph;
        const runs = buildLineRuns(line, justify, usableWidth, lineWidth);

        frameLayouts[frameIdx]!.lines.push({
          text: lineText,
          x: lineX,
          y: lineY,
          width: lineWidth,
          height: lineHeightPx,
          style,
          runs,
        });

        currentY = lineY + lineHeightPx;
        linesPlaced++;
        paragraphLinesPlaced++;

        // Recuo vale só para a 1ª linha: para aqui e re-quebra o resto na largura cheia.
        if (isParagraphFirstLine && indent > 0) {
          break;
        }
      }

      // Linhas ainda não colocadas (por troca de frame OU por recuo de 1ª linha) são
      // re-quebradas na próxima iteração, recuperando o espaço de fronteira removido.
      const remainingLines = lines.slice(linesPlaced);
      if (remainingLines.length > 0) {
        remainingTokens = tokensFromRemainingLines(remainingLines, measureFn);
        continue;
      }

      // Parágrafo totalmente colocado.
      break;
    }

    // Espaço depois do parágrafo (apenas se o parágrafo coube por completo).
    if (!overflow && spaceAfter > 0) {
      currentY += spaceAfter;
    }
  }

  // Reunir o texto de overflow
  let overflowText = '';
  if (overflowedTokens.length > 0) {
    overflowText = overflowedTokens.map(t => t.value).join('');
  }

  return {
    frameLayouts,
    overflow: overflowText.length > 0,
    overflowText,
  };
}

function wrapObstaclesForFrame(
  frame: Frame,
  wrapFrames: Frame[] | undefined,
  wrapMasksByFrameId: Record<string, AlphaMask> | undefined
): WrapRect[] {
  if (!wrapFrames || wrapFrames.length === 0) return [];
  return obstaclesForTextFrame(
    frame,
    wrapFrames.filter((candidate) => candidate.id !== frame.id && candidate.pageId === frame.pageId),
    { masksByFrameId: wrapMasksByFrameId }
  );
}

function tokensFromRemainingLines(
  remainingLines: ShapedToken[][],
  measureFn: MeasureFn
): ShapedToken[] {
  const nextRemainingTokens: ShapedToken[] = [];
  for (let rIdx = 0; rIdx < remainingLines.length; rIdx++) {
    const rLine = remainingLines[rIdx]!;
    const previous = nextRemainingTokens[nextRemainingTokens.length - 1];
    const first = rLine[0];
    if (
      rIdx > 0 &&
      previous?.type === TokenType.WORD &&
      first?.type === TokenType.WORD
    ) {
      if (sameHyphenatedSource(previous, first)) {
        removeTrailingSoftHyphen(previous, measureFn);
      } else if (previous.softHyphen) {
        removeTrailingSoftHyphen(previous, measureFn);
      } else if (previous.value.endsWith('-')) {
        // Hífen digitado pelo usuário: não é uma quebra artificial recuperável,
        // então preserva a junção sem inserir espaço.
      } else {
        nextRemainingTokens.push({
          type: TokenType.SPACE,
          value: ' ',
          width: measureFn(' ', previous.style),
          style: previous.style,
        });
      }
    }
    nextRemainingTokens.push(...rLine);
  }
  return nextRemainingTokens;
}

function sameHyphenatedSource(a: ShapedToken, b: ShapedToken): boolean {
  return !!a.hyphenSource && a.hyphenSource === b.hyphenSource;
}

function removeTrailingSoftHyphen(token: ShapedToken, measureFn: MeasureFn): void {
  if (!token.softHyphen || !token.value.endsWith('-')) return;
  token.value = token.value.slice(0, -1);
  token.width = measureFn(token.value, token.style);
  token.softHyphen = false;
}

/** Soma das larguras dos tokens de uma linha. */
function lineWidthOf(line: ShapedToken[]): number {
  return line.reduce((sum, token) => sum + token.width, 0);
}

/** Altura (px) de uma linha, derivada do 1º token (ou do fallback do documento). */
function lineHeightPxOf(line: ShapedToken[], fallbackTokens: ShapedToken[]): number {
  const first = line[0];
  const fontSize = first?.style.fontSize ?? fallbackTokens[0]!.style.fontSize;
  const mult = first?.lineHeight ?? fallbackTokens[0]!.lineHeight ?? DEFAULT_LINE_HEIGHT;
  return fontSize * mult;
}

/** Quantas linhas (do topo da lista) cabem verticalmente a partir de `startY`. */
function countLinesThatFit(
  lines: ShapedToken[][],
  startY: number,
  frame: Frame,
  fallbackTokens: ShapedToken[],
  config: FrameFillerConfig
): number {
  let y = startY;
  let count = 0;
  for (const line of lines) {
    const lineHeightPx = lineHeightPxOf(line, fallbackTokens);
    const lineY = snapLineTopToBaselineGrid(y, frame, line, fallbackTokens, config);
    if (lineY + lineHeightPx <= frame.height) {
      y = lineY + lineHeightPx;
      count++;
    } else {
      break;
    }
  }
  return count;
}

function snapLineTopToBaselineGrid(
  currentY: number,
  frame: Frame,
  line: ShapedToken[],
  fallbackTokens: ShapedToken[],
  config: FrameFillerConfig
): number {
  const grid = config.baselineGrid;
  if (!grid || grid.increment <= 0) return currentY;

  const first = line[0] ?? fallbackTokens[0];
  if (!first) return currentY;

  const pageMarginTop =
    config.pages?.find((page) => page.id === frame.pageId)?.margins.top ?? 0;
  const firstBaselineOnPage = pageMarginTop + grid.startOffset;
  const baselineOffset = first.style.fontSize * BASELINE_RATIO;
  const candidateBaselineOnPage = frame.y + currentY + baselineOffset;
  const gridSteps = Math.max(
    0,
    Math.ceil((candidateBaselineOnPage - firstBaselineOnPage) / grid.increment)
  );
  const snappedBaselineOnPage = firstBaselineOnPage + gridSteps * grid.increment;
  const snappedLineTop = snappedBaselineOnPage - baselineOffset - frame.y;

  return Math.max(currentY, snappedLineTop);
}

/**
 * Converte os tokens de uma linha em runs posicionados (x acumulado). Quando
 * `justify` é verdadeiro, distribui o espaço livre (`usableWidth - naturalWidth`)
 * igualmente entre os espaços, mas só até um limite editorial. Linhas que exigiriam
 * espaços grotescamente largos ficam naturais em vez de criar "rios" no PDF.
 */
function buildLineRuns(
  line: ShapedToken[],
  justify: boolean,
  usableWidth: number,
  naturalWidth: number
): LayoutRun[] {
  let extraPerSpace = 0;
  if (justify) {
    let spaces = 0;
    let naturalSpaceWidth = 0;
    for (const token of line) {
      if (token.type === TokenType.SPACE) {
        spaces++;
        naturalSpaceWidth += token.width;
      }
    }
    if (spaces > 0 && usableWidth > naturalWidth) {
      const candidateExtraPerSpace = (usableWidth - naturalWidth) / spaces;
      const averageSpaceWidth = naturalSpaceWidth / spaces;
      if (
        averageSpaceWidth > 0 &&
        candidateExtraPerSpace <= averageSpaceWidth * MAX_JUSTIFY_EXTRA_SPACE_RATIO
      ) {
        extraPerSpace = candidateExtraPerSpace;
      }
    }
  }

  const runs: LayoutRun[] = [];
  let x = 0;
  for (const token of line) {
    const width = token.type === TokenType.SPACE ? token.width + extraPerSpace : token.width;
    runs.push({ text: token.value, x, width, style: token.style });
    x += width;
  }
  return runs;
}

/**
 * Deslocamento X da linha conforme o alinhamento do parágrafo, relativo à
 * esquerda do frame. `justify` ainda se comporta como `left` (a distribuição
 * real de espaços depende de runs posicionados — passo futuro).
 */
function alignLineX(
  align: 'left' | 'center' | 'right' | 'justify',
  lineWidth: number,
  frameWidth: number
): number {
  const free = frameWidth - lineWidth;
  if (free <= 0) return 0;
  if (align === 'right') return free;
  if (align === 'center') return free / 2;
  return 0;
}

/**
 * Garante que nenhuma linha exceda `maxWidth`. Linhas que cabem passam intactas
 * (preservando as decisões do quebrador). Linhas que estouram — tipicamente uma
 * única "palavra" sem ponto de quebra mais larga que o frame — são re-empacotadas
 * com quebra por caractere.
 */
function enforceMaxLineWidth(
  lines: ShapedToken[][],
  maxWidth: number,
  measureFn: MeasureFn
): ShapedToken[][] {
  if (maxWidth <= 0) return lines;

  const result: ShapedToken[][] = [];
  for (const line of lines) {
    if (lineWidthOf(line) <= maxWidth) {
      result.push(line);
      continue;
    }
    result.push(...packWithCharBreak(line, maxWidth, measureFn));
  }
  return result;
}

/**
 * Re-empacota os tokens de UMA linha que estourou, quebrando por caractere
 * qualquer token mais largo que `maxWidth`.
 */
function packWithCharBreak(
  tokens: ShapedToken[],
  maxWidth: number,
  measureFn: MeasureFn
): ShapedToken[][] {
  const lines: ShapedToken[][] = [];
  let current: ShapedToken[] = [];
  let currentWidth = 0;

  const flush = () => {
    if (current.length > 0) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
  };

  for (const token of tokens) {
    if (token.type === TokenType.SPACE) {
      // Mantém o espaço só se couber e não estiver no início da linha.
      if (current.length > 0 && currentWidth + token.width <= maxWidth) {
        current.push(token);
        currentWidth += token.width;
      }
      continue;
    }

    if (currentWidth + token.width <= maxWidth || (current.length === 0 && token.width <= maxWidth)) {
      current.push(token);
      currentWidth += token.width;
      continue;
    }

    if (token.width > maxWidth) {
      // Palavra mais larga que o frame inteiro: quebra por caractere.
      flush();
      const chunks = charChunks(token, maxWidth, measureFn);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        if (i < chunks.length - 1) {
          lines.push([chunk]);
        } else {
          current = [chunk];
          currentWidth = chunk.width;
        }
      }
      continue;
    }

    // Token cabe sozinho, mas não no que resta da linha atual.
    flush();
    current = [token];
    currentWidth = token.width;
  }

  flush();
  return lines.length > 0 ? lines : [tokens];
}

/**
 * Quebra o valor de um token em pedaços, cada um cabendo em `maxWidth`.
 * Um caractere isolado mais largo que `maxWidth` é mantido (não há como quebrar mais).
 */
function charChunks(token: ShapedToken, maxWidth: number, measureFn: MeasureFn): ShapedToken[] {
  const chars = Array.from(token.value);
  const chunks: ShapedToken[] = [];
  let buffer = '';
  const hyphenSource = token.hyphenSource ?? token.value;

  const pushBuffer = () => {
    if (buffer.length === 0) return;
    chunks.push({
      type: TokenType.WORD,
      value: buffer,
      width: measureFn(buffer, token.style),
      style: token.style,
      lineHeight: token.lineHeight,
      hyphenSource,
    });
    buffer = '';
  };

  for (const char of chars) {
    const candidate = buffer + char;
    if (buffer.length > 0 && measureFn(candidate, token.style) > maxWidth) {
      pushBuffer();
      buffer = char;
    } else {
      buffer = candidate;
    }
  }
  pushBuffer();

  return chunks;
}
