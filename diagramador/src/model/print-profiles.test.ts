import { describe, expect, it } from 'vitest';
import { PRINT_PROFILE_KDP_6x9 } from './types';

describe('print profiles', () => {
  it('uses KDP outside/top/bottom minimum margins for interiors with bleed', () => {
    expect(PRINT_PROFILE_KDP_6x9.bleed).toBe(0.125);
    expect(PRINT_PROFILE_KDP_6x9.minMargins.top).toBeGreaterThanOrEqual(0.375);
    expect(PRINT_PROFILE_KDP_6x9.minMargins.bottom).toBeGreaterThanOrEqual(0.375);
    expect(PRINT_PROFILE_KDP_6x9.minMargins.outside).toBeGreaterThanOrEqual(0.375);
  });
});
