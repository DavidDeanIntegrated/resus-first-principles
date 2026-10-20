/** Split a committed explanation into its first sentence and the remainder. */
export function splitLead(text: string): { lead: string; rest: string } {
  const trimmed = text.trim();
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(trimmed);
  if (!match || match[0].length === trimmed.length) {
    return { lead: trimmed, rest: '' };
  }
  return {
    lead: match[0].trim(),
    rest: trimmed.slice(match[0].length).trim(),
  };
}
