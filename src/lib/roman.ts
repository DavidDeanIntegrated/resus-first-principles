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
