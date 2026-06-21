/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { DEMO_FONT_PATH } from '../demo-document';
import { fontRegistry } from './font-registry';
import { measureTextWithFont } from './font-metrics';

describe('font registry', () => {
  it('loads a real TTF through the browser fetch path', async () => {
    const fontBytes = await readFile(DEMO_FONT_PATH);
    const dataUrl = `data:font/ttf;base64,${fontBytes.toString('base64')}`;
    const fontName = `Fetch Loaded Demo Font ${Date.now()}`;

    const font = await fontRegistry.loadFont(fontName, dataUrl);

    expect(fontRegistry.isFontLoaded(fontName)).toBe(true);
    expect(measureTextWithFont('Prelo fisico', font, 15)).toBeGreaterThan(0);
  });
});
