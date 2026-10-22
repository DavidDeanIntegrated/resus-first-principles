/** Presentation inserted around committed prose. The source paragraphs stay unchanged. */
const subheads = [
  {
    principleId: 'cpr-mechanics',
    beforeParagraphStartsWith: 'A compression moves blood by raising pressure',
    text: 'How a compression moves blood',
  },
  {
    principleId: 'cpr-mechanics',
    beforeParagraphStartsWith: 'Release is the other half of the cycle',
    text: 'Release',
  },
  {
    principleId: 'cpr-mechanics',
    beforeParagraphStartsWith: 'The compression variables are not independent dials.',
    text: 'Five variables, one cycle',
  },
] as const;

const cycleArithmeticParagraph =
  'An illustrative calculation, from the guideline numbers rather than from measurement';

export const cycleArithmeticCaption =
  'These figures show the arithmetic of the cycle, not targets, and they do not say how much flow occurs in each phase.';

export function subheadBefore(principleId: string, paragraph: string): string | undefined {
  return subheads.find(
    (item) => item.principleId === principleId && paragraph.startsWith(item.beforeParagraphStartsWith),
  )?.text;
}

export function showsCycleArithmetic(principleId: string, paragraph: string): boolean {
  return principleId === 'cpr-mechanics' && paragraph.startsWith(cycleArithmeticParagraph);
}
