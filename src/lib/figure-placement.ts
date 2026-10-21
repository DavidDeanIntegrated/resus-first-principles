import { physiologyFigures, type PhysiologyFigureId } from './physiology-figures.ts';

/** Figures drawn beside a principle. They are not keys in the case JSON. */
export const placedFigureIds = [
  ...physiologyFigures.map((figure) => figure.id),
  'reversible-cause-overlap',
] as const;

export type PlacedFigureId = (typeof placedFigureIds)[number];

export interface ProseGroup {
  paragraphs: string[];
  figures: readonly PhysiologyFigureId[];
}

/** Figures that follow the whole prose block, before causes and questions. */
export function figuresForPrinciple(id: string): readonly PlacedFigureId[] {
  const physiology = physiologyFigures
    .filter((figure) => figure.principleId === id && !figure.afterParagraphStartsWith)
    .map((figure) => figure.id);
  if (id === 'reversible-causes') return [...physiology, 'reversible-cause-overlap'];
  return physiology;
}

/** Figures that follow one paragraph inside the prose. */
export function inlineFiguresAfter(principleId: string, paragraph: string): readonly PhysiologyFigureId[] {
  return physiologyFigures
    .filter(
      (figure) =>
        figure.principleId === principleId &&
        figure.afterParagraphStartsWith !== undefined &&
        paragraph.startsWith(figure.afterParagraphStartsWith),
    )
    .map((figure) => figure.id);
}

/**
 * Keep paragraph order, and close a group where a figure is anchored.
 * `visibleText` returns the words that actually render for that source paragraph.
 */
export function groupParagraphs(
  paragraphs: readonly string[],
  visibleText: (paragraph: string, index: number) => string,
  figuresAfter: (paragraph: string) => readonly PhysiologyFigureId[],
): ProseGroup[] {
  const groups: ProseGroup[] = [];
  let bucket: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    const visible = visibleText(paragraph, index);
    if (visible.length > 0) bucket.push(visible);
    const figures = figuresAfter(paragraph);
    if (figures.length > 0) {
      groups.push({ paragraphs: bucket, figures });
      bucket = [];
    }
  });
  if (bucket.length > 0) groups.push({ paragraphs: bucket, figures: [] });
  return groups;
}
