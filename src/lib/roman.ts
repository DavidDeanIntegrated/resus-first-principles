import { sectionTree } from './sections.ts';

const ROMAN_NUMERALS = [
  '',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
  'XVI',
  'XVII',
  'XVIII',
  'XIX',
  'XX',
] as const;

/** Chapter numerals for principle order. The content schema has no numeral field. */
export function toRoman(value: number): string {
  const numeral = ROMAN_NUMERALS[value];
  if (!numeral) {
    throw new Error(`Cannot format ${value} as a roman numeral`);
  }
  return numeral;
}

export interface SectionNumeral {
  /** Visible label: a roman numeral for a top-level part, or `2.1` for a subsection. */
  label: string;
  /** 1-based index of the top-level part this section belongs to. */
  partNumber: number;
}

/**
 * Numbers sections from file order and `parentId`.
 * Top-level parts are I, II, III… Subsections are `part.1`, `part.2`, where `part` is the parent's decimal index.
 * Dropping a subsection renumbers only its later siblings.
 */
export function sectionNumerals<T extends { id: string; parentId?: string }>(
  items: readonly T[],
): Map<string, SectionNumeral> {
  const numerals = new Map<string, SectionNumeral>();
  sectionTree(items).forEach((root, rootIndex) => {
    const partNumber = rootIndex + 1;
    numerals.set(root.item.id, { label: toRoman(partNumber), partNumber });
    root.children.forEach((child, childIndex) => {
      numerals.set(child.item.id, { label: `${partNumber}.${childIndex + 1}`, partNumber });
    });
  });
  return numerals;
}
