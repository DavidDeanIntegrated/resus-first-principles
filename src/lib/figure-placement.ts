import { physiologyFigures } from './physiology-figures.ts';

/** Figures the presentation layer places inside a principle. */
export const placedFigureIds = [
  ...physiologyFigures.map((figure) => figure.id),
  'reversible-cause-overlap',
  'coronary-circuit',
  'pressure-pairs',
  'compression-release',
  'pressure-gradient',
] as const;

export type PlacedFigureId = (typeof placedFigureIds)[number];

export interface ProseGroup {
  paragraphs: string[];
  figures: readonly PlacedFigureId[];
}

/** Primer figures anchored to one source paragraph. They are not physiology assets. */
const primerInline = [
  {
    id: 'coronary-circuit',
    principleId: 'coronary-cerebral-perfusion',
    afterParagraphStartsWith: 'The heart is a muscle that never rests in health',
  },
  {
    id: 'pressure-pairs',
    principleId: 'coronary-cerebral-perfusion',
    afterParagraphStartsWith: 'With that picture in place, the equation is a short summary of it.',
  },
  {
    id: 'compression-release',
    principleId: 'coronary-cerebral-perfusion',
    afterParagraphStartsWith: 'Phase matters for a second reason, which has to do with the vessels themselves.',
  },
  {
    id: 'pressure-gradient',
    principleId: 'coronary-cerebral-perfusion',
    afterParagraphStartsWith: 'For the heart, the gradient that matters is coronary perfusion pressure',
  },
] as const satisfies readonly {
  id: PlacedFigureId;
  principleId: string;
  afterParagraphStartsWith: string;
}[];

/** Figures that follow the whole prose block, before causes and questions. */
export function figuresForPrinciple(id: string): readonly PlacedFigureId[] {
  const physiology = physiologyFigures
    .filter((figure) => figure.principleId === id && !figure.afterParagraphStartsWith)
    .map((figure) => figure.id);
  if (id === 'reversible-causes') return [...physiology, 'reversible-cause-overlap'];
  return physiology;
}

/** Figures that follow one paragraph inside the prose. */
export function inlineFiguresAfter(principleId: string, paragraph: string): readonly PlacedFigureId[] {
  const physiology = physiologyFigures
    .filter(
      (figure) =>
        figure.principleId === principleId &&
        figure.afterParagraphStartsWith !== undefined &&
        paragraph.startsWith(figure.afterParagraphStartsWith),
    )
    .map((figure) => figure.id);
  const primer = primerInline
    .filter(
      (figure) => figure.principleId === principleId && paragraph.startsWith(figure.afterParagraphStartsWith),
    )
    .map((figure) => figure.id);
  return [...physiology, ...primer];
}

export function primerAnchorErrors(principleId: string, paragraphs: readonly string[]): string[] {
  return primerInline.flatMap((figure) => {
    if (figure.principleId !== principleId) return [];
    const hits = paragraphs.filter((paragraph) => paragraph.startsWith(figure.afterParagraphStartsWith));
    return hits.length === 1 ? [] : [`${figure.id} matched ${hits.length} paragraphs in ${principleId}`];
  });
}

/**
 * Keep paragraph order, and close a group where a figure is anchored.
 * `visibleText` returns the words that actually render for that source paragraph.
 */
export function groupParagraphs(
  paragraphs: readonly string[],
  visibleText: (paragraph: string, index: number) => string,
  figuresAfter: (paragraph: string) => readonly PlacedFigureId[],
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
