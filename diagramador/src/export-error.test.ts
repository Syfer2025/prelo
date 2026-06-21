import { describe, expect, it } from 'vitest';
import { formatExportError } from './export-error';

describe('formatExportError', () => {
  it('extracts useful messages from export failures', () => {
    expect(formatExportError(new Error('fontkit create is not a function'))).toBe(
      'fontkit create is not a function'
    );
    expect(formatExportError('download blocked')).toBe('download blocked');
    expect(formatExportError(null)).toBe('Erro desconhecido ao gerar PDF');
  });
});
