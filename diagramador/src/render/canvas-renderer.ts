/**
 * Canvas Renderer — Desenha o LayoutResult no Canvas.
 * 
 * SEPARAÇÃO CRÍTICA: Este módulo SÓ desenha. Não calcula posições.
 * As posições vêm do LayoutResult produzido pelo engine.
 * Isso permite reusar o mesmo LayoutResult para gerar PDF (Fase 6).
 */

import type { Frame, ImageFrame } from '../model/types';
import type { LayoutResult } from '../engine/types';
import { buildFontString } from '../engine/shaper';
import { isImageFrame } from '../model/image-checks';

export interface RenderConfig {
  /** Cor das bordas dos frames */
  frameStrokeColor: string;
  /** Cor dos rótulos dos frames */
  frameLabelColor: string;
  /** Cor dos pontos de encadeamento */
  chainPointColor: string;
  /** Mostrar indicador de overflow */
  showOverflow: boolean;
  /** Imagens ja carregadas pelo app, indexadas por `ImageFrame.imageUrl`. */
  imageElementsByUrl: Record<string, CanvasImageSource>;
  /** Frame selecionado no editor, usado apenas como overlay de preview. */
  selectedFrameId: string | null;
}

const DEFAULT_RENDER_CONFIG: RenderConfig = {
  frameStrokeColor: '#38bdf8',
  frameLabelColor: '#aaa',
  chainPointColor: '#38bdf8',
  showOverflow: true,
  imageElementsByUrl: {},
  selectedFrameId: null,
};

/**
 * Renderiza frames e texto no canvas.
 */
export function renderToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  frames: Frame[],
  layoutResult: LayoutResult,
  config?: Partial<RenderConfig>
): void {
  const cfg = { ...DEFAULT_RENDER_CONFIG, ...config };

  // 1. Limpar canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 2. Desenhar frames
  drawFrames(ctx, frames, cfg);

  // 3. Desenhar texto
  drawText(ctx, frames, layoutResult);

  // 4. Overlay de seleção
  drawSelectedFrame(ctx, frames, cfg);

  // 5. Indicador de overflow
  if (cfg.showOverflow && layoutResult.overflow) {
    drawOverflowIndicator(ctx, frames);
  }
}

// ─── Desenho dos Frames ─────────────────────────────────────

function drawFrames(
  ctx: CanvasRenderingContext2D,
  frames: Frame[],
  cfg: RenderConfig
): void {
  frames.forEach((frame, index) => {
    if (isImageFrame(frame)) {
      drawImageFrame(ctx, frame, index, cfg);
      return;
    }

    // Contorno pontilhado do frame
    ctx.strokeStyle = cfg.frameStrokeColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);

    // Rótulo do frame
    ctx.setLineDash([]);
    ctx.fillStyle = cfg.frameLabelColor;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Frame ${index + 1}`, frame.x, frame.y - 5);

    // Pontos de encadeamento (entrada/saída)
    ctx.fillStyle = cfg.chainPointColor;
    ctx.fillRect(frame.x - 3, frame.y - 3, 6, 6);
    ctx.fillRect(frame.x + frame.width - 3, frame.y + frame.height - 3, 6, 6);
  });
}

function drawImageFrame(
  ctx: CanvasRenderingContext2D,
  frame: ImageFrame,
  index: number,
  cfg: RenderConfig
): void {
  const image = cfg.imageElementsByUrl[frame.imageUrl];
  if (image) {
    ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);
    return;
  } else {
    ctx.fillStyle = 'rgba(31, 45, 68, 0.12)';
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  }

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.beginPath();
  ctx.moveTo(frame.x, frame.y);
  ctx.lineTo(frame.x + frame.width, frame.y + frame.height);
  ctx.moveTo(frame.x + frame.width, frame.y);
  ctx.lineTo(frame.x, frame.y + frame.height);
  ctx.stroke();

  ctx.fillStyle = cfg.frameLabelColor;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Imagem ${index + 1}`, frame.x, frame.y - 5);
}

// ─── Desenho do Texto ───────────────────────────────────────

function drawText(
  ctx: CanvasRenderingContext2D,
  frames: Frame[],
  layoutResult: LayoutResult
): void {
  layoutResult.frameLayouts.forEach(frameLayout => {
    const frame = frames.find(f => f.id === frameLayout.frameId);
    if (!frame) return;

    ctx.textBaseline = 'top';
    frameLayout.lines.forEach(line => {
      // Desenha run a run: cada segmento traz seu próprio x (justificação) e estilo.
      // Posição absoluta = canto do frame + x da linha (alinhamento/recuo) + x do run.
      line.runs.forEach(run => {
        ctx.font = buildFontString(run.style);
        ctx.fillStyle = run.style.color;
        ctx.fillText(run.text, frame.x + line.x + run.x, frame.y + line.y);
      });
    });
  });
}

function drawSelectedFrame(
  ctx: CanvasRenderingContext2D,
  frames: Frame[],
  cfg: RenderConfig
): void {
  if (!cfg.selectedFrameId) return;
  const frame = frames.find((candidate) => candidate.id === cfg.selectedFrameId);
  if (!frame) return;

  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 2;
  ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);

  ctx.fillStyle = '#0ea5e9';
  const handles: Array<{ x: number; y: number }> = [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x, y: frame.y + frame.height },
    { x: frame.x + frame.width, y: frame.y + frame.height },
  ];
  for (const handle of handles) {
    ctx.fillRect(handle.x - 3, handle.y - 3, 6, 6);
  }
  ctx.restore();
}

// ─── Indicador de Overflow ──────────────────────────────────

function drawOverflowIndicator(
  ctx: CanvasRenderingContext2D,
  frames: Frame[]
): void {
  const lastFrame = frames[frames.length - 1];
  if (!lastFrame) return;

  const x = lastFrame.x + lastFrame.width - 14;
  const y = lastFrame.y + lastFrame.height - 14;

  // Quadrado vermelho com "+" (estilo InDesign)
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x, y, 12, 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('+', x + 6, y + 6);
  ctx.textAlign = 'left'; // Reset
}
