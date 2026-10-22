/** Presentation-only display lines. The case paragraphs stay word for word. */

export const arterialContentEquation = 'CaO2 ≈ (1.34 × Hb × SaO2) + (0.003 × PaO2)';
export const oxygenDeliveryEquation = 'DO2 = CO × CaO2';

const deliverySentence = `Oxygen delivery is the product of cardiac output and arterial oxygen content (${oxygenDeliveryEquation}).`;

export type ProsePiece = { kind: 'text'; text: string } | { kind: 'equation'; text: string };

/**
 * Keep the committed words, and set the two oxygen formulas on their own lines.
 * CaO2 follows paragraph 1. DO2 follows the sentence that states it.
 */
export function prosePieces(principleId: string, paragraph: string): ProsePiece[] {
  if (principleId !== 'normal-circulation') return [{ kind: 'text', text: paragraph }];

  if (paragraph.includes(arterialContentEquation)) {
    return [
      { kind: 'text', text: paragraph },
      { kind: 'equation', text: arterialContentEquation },
    ];
  }

  const at = paragraph.indexOf(deliverySentence);
  if (at !== -1) {
    const cut = at + deliverySentence.length;
    const before = paragraph.slice(0, cut).trim();
    const after = paragraph.slice(cut).trim();
    const pieces: ProsePiece[] = [
      { kind: 'text', text: before },
      { kind: 'equation', text: oxygenDeliveryEquation },
    ];
    if (after.length > 0) pieces.push({ kind: 'text', text: after });
    return pieces;
  }

  return [{ kind: 'text', text: paragraph }];
}
