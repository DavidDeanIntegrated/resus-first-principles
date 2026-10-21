export interface SectionNode<T> {
  item: T;
  children: SectionNode<T>[];
}

/** File order, with at most one level of children. A missing parent stays a root. */
export function sectionTree<T extends { id: string; parentId?: string }>(
  items: readonly T[],
): SectionNode<T>[] {
  const nodes = new Map<string, SectionNode<T>>();
  for (const item of items) nodes.set(item.id, { item, children: [] });

  const roots: SectionNode<T>[] = [];
  for (const item of items) {
    const node = nodes.get(item.id);
    if (!node) continue;
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export interface AnchorSource {
  principles: ReadonlyArray<{
    id: string;
    questions?: ReadonlyArray<{ id: string }>;
    causes?: ReadonlyArray<{ id: string; examples: ReadonlyArray<{ id: string }> }>;
    workedExample?: { id: string };
  }>;
  treatmentApproach: ReadonlyArray<{ id: string }>;
  references?: ReadonlyArray<{ id: string }>;
}

/** Ids the case page actually emits, without the leading `#`. */
export function anchorIds(value: AnchorSource): Set<string> {
  const anchors = new Set<string>(['treatment-heading']);
  for (const principle of value.principles) {
    anchors.add(`principle-${principle.id}`);
    anchors.add(`principle-${principle.id}-title`);
    for (const question of principle.questions ?? []) {
      anchors.add(`question-${question.id}`);
      anchors.add(`question-stem-${question.id}`);
    }
    for (const cause of principle.causes ?? []) {
      anchors.add(`cause-${cause.id}`);
      for (const example of cause.examples) anchors.add(`example-${example.id}`);
    }
    if (principle.workedExample) anchors.add(`worked-example-${principle.workedExample.id}`);
  }
  for (const step of value.treatmentApproach) anchors.add(`step-${step.id}`);
  for (const reference of value.references ?? []) anchors.add(`reference-${reference.id}`);
  return anchors;
}
