import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sectionNumerals, toRoman } from '../src/lib/roman.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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

describe('sectionNumerals', () => {
  it('numbers top-level parts with roman numerals and subsections as decimals', () => {
    const numerals = sectionNumerals([
      { id: 'orientation' },
      { id: 'normal-circulation' },
      { id: 'cpr-circulation' },
      { id: 'coronary-cerebral-perfusion', parentId: 'cpr-circulation' },
      { id: 'cpr-mechanics', parentId: 'cpr-circulation' },
      { id: 'electrical-mechanical' },
      { id: 'early-defibrillation', parentId: 'electrical-mechanical' },
    ]);

    expect(numerals.get('orientation')).toEqual({ label: 'I', partNumber: 1 });
    expect(numerals.get('normal-circulation')).toEqual({ label: 'II', partNumber: 2 });
    expect(numerals.get('cpr-circulation')).toEqual({ label: 'III', partNumber: 3 });
    expect(numerals.get('coronary-cerebral-perfusion')).toEqual({ label: '3.1', partNumber: 3 });
    expect(numerals.get('cpr-mechanics')).toEqual({ label: '3.2', partNumber: 3 });
    expect(numerals.get('electrical-mechanical')).toEqual({ label: 'IV', partNumber: 4 });
    expect(numerals.get('early-defibrillation')).toEqual({ label: '4.1', partNumber: 4 });
    expect([...numerals.values()].some((value) => value.label.includes('II.'))).toBe(false);
  });

  it('renumbers later subsections when one is dropped', () => {
    const withBoth = sectionNumerals([
      { id: 'part' },
      { id: 'first', parentId: 'part' },
      { id: 'second', parentId: 'part' },
    ]);
    const dropped = sectionNumerals([
      { id: 'part' },
      { id: 'second', parentId: 'part' },
    ]);

    expect(withBoth.get('second')?.label).toBe('1.2');
    expect(dropped.get('second')?.label).toBe('1.1');
    expect(dropped.get('part')?.label).toBe('I');
  });

  it('numbers the committed case from its own parent links', () => {
    const document = JSON.parse(
      readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8'),
    ) as { principles: Array<{ id: string; parentId?: string }> };
    const numerals = sectionNumerals(document.principles);
    const roots = document.principles.filter((principle) => !principle.parentId);

    expect(roots.length).toBeLessThanOrEqual(20);
    roots.forEach((principle, index) => {
      expect(numerals.get(principle.id)).toEqual({ label: toRoman(index + 1), partNumber: index + 1 });
    });

    const childCounts = new Map<string, number>();
    for (const principle of document.principles) {
      if (!principle.parentId) continue;
      const parent = numerals.get(principle.parentId);
      const next = (childCounts.get(principle.parentId) ?? 0) + 1;
      childCounts.set(principle.parentId, next);
      expect(numerals.get(principle.id)?.label).toBe(`${parent?.partNumber}.${next}`);
      expect(numerals.get(principle.id)?.label).not.toMatch(/[IVX]+\./);
    }
  });
});
