/**
 * Componente Canvas — Hospeda o <canvas> e gerencia DPR para telas retina.
 * 
 * Recebe um callback onReady que fornece o CanvasRenderingContext2D
 * já configurado para alta resolução.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { PointerEvent } from 'react';

export interface CanvasProps {
  width: number;
  height: number;
  onReady: (ctx: CanvasRenderingContext2D, logicalWidth: number, logicalHeight: number) => void;
  onDraw: (ctx: CanvasRenderingContext2D, logicalWidth: number, logicalHeight: number) => void;
  onPointerDown?: (point: { x: number; y: number }) => void;
  className?: string;
}

export default function Canvas({
  width,
  height,
  onReady,
  onDraw,
  onPointerDown,
  className,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const readyRef = useRef(false);

  // Setup: ajusta resolução para DPR e chama onReady
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    readyRef.current = true;
    onReady(ctx, width, height);
  }, [width, height, onReady]);

  // Expor função de redesenho via useCallback
  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && readyRef.current) {
      onDraw(ctx, width, height);
    }
  }, [onDraw, width, height]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!onPointerDown) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onPointerDown({
        x: ((event.clientX - rect.left) / rect.width) * width,
        y: ((event.clientY - rect.top) / rect.height) * height,
      });
    },
    [height, onPointerDown, width]
  );

  // Redesenhar quando onDraw muda
  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onPointerDown={handlePointerDown}
      style={{
        background: '#fafafa',
        border: '1px solid #eaeaea',
        borderRadius: '4px',
        cursor: onPointerDown ? 'crosshair' : 'default',
      }}
    />
  );
}
