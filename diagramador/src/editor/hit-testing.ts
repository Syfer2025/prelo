import type { Frame } from '../model/types';

export function frameAtPoint(frames: Frame[], x: number, y: number): Frame | null {
  for (let index = frames.length - 1; index >= 0; index--) {
    const frame = frames[index]!;
    if (
      x >= frame.x &&
      x <= frame.x + frame.width &&
      y >= frame.y &&
      y <= frame.y + frame.height
    ) {
      return frame;
    }
  }

  return null;
}
