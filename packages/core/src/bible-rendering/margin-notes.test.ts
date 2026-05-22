import { describe, expect, it } from 'vitest';
import { formatNoteType, noteLabel } from './margin-notes.js';

describe('noteLabel', () => {
  it('maps the first 26 indices to a..z', () => {
    expect(noteLabel(0)).toBe('a');
    expect(noteLabel(1)).toBe('b');
    expect(noteLabel(25)).toBe('z');
  });

  it('rolls over to two-letter labels past 25', () => {
    expect(noteLabel(26)).toBe('aa');
    expect(noteLabel(27)).toBe('ab');
    expect(noteLabel(51)).toBe('az');
    expect(noteLabel(52)).toBe('ba');
  });
});

describe('formatNoteType', () => {
  it('prefixes the three known language types', () => {
    expect(formatNoteType('hebrew')).toBe('Heb. ');
    expect(formatNoteType('greek')).toBe('Gr. ');
    expect(formatNoteType('alternate')).toBe('Or, ');
  });

  it('returns an empty string for unknown / unprefixed types', () => {
    expect(formatNoteType('name')).toBe('');
    expect(formatNoteType('other')).toBe('');
    expect(formatNoteType('')).toBe('');
  });
});
