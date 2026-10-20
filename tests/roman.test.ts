import { describe, expect, it } from 'vitest';
import { toRoman } from '../src/lib/roman.ts';

describe('toRoman', () => {
  it('numbers principle chapters', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(2)).toBe('II');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(14)).toBe('XIV');
    expect(toRoman(20)).toBe('XX');
  });

  it('rejects values outside the chapter range', () => {
    expect(() => toRoman(0)).toThrow(/roman numeral/);
    expect(() => toRoman(21)).toThrow(/roman numeral/);
  });
});
