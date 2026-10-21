/** Figures drawn beside a principle. They are not keys in the case JSON. */
export const placedFigureIds = ['oxygen-delivery', 'etco2-determinants', 'reversible-cause-overlap'] as const;

export type PlacedFigureId = (typeof placedFigureIds)[number];

const placement: Record<string, readonly PlacedFigureId[]> = {
  'oxygenation-without-hyperventilation': ['oxygen-delivery', 'etco2-determinants'],
  'reversible-causes': ['reversible-cause-overlap'],
};

export function figuresForPrinciple(id: string): readonly PlacedFigureId[] {
  return placement[id] ?? [];
}
