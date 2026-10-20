export interface ReferenceMark {
  id: string;
  n: number;
}

/** 1-based index of each reference id, in the order written on the topic module. */
export function referenceNumbers(
  references: ReadonlyArray<{ id: string }> | undefined,
): Map<string, number> {
  return new Map((references ?? []).map((reference, index) => [reference.id, index + 1]));
}

export function marksFor(
  refs: readonly string[] | undefined,
  numbers: ReadonlyMap<string, number>,
): ReferenceMark[] {
  return (refs ?? []).map((id) => ({ id, n: numbers.get(id) ?? 0 }));
}
