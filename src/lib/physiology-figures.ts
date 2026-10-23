import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifestJson from '../assets/diagrams/physiology-manifest.json' with { type: 'json' };

const assetDir = join(process.cwd(), 'src/assets/diagrams');

export const physiologyFigureIds = [
  '01-oxygen-delivery',
  '02-after-the-shock',
  '03-two-pressure-gradients',
  '04-gas-trapping',
  '05-reading-capnography',
  '06-after-rosc',
] as const;

export type PhysiologyFigureId = (typeof physiologyFigureIds)[number];

interface ManifestEntry {
  file: string;
  caption: string;
  alt: string;
  sources: string[];
}

export interface PhysiologyFigure {
  id: PhysiologyFigureId;
  file: string;
  principleId: string;
  scrollLabel: string;
  /** The figure follows the paragraph that starts with this sentence. Omit to follow the whole prose block. */
  afterParagraphStartsWith?: string;
  caption: string;
  alt: string;
  sources: readonly string[];
}

const placement: Record<
  PhysiologyFigureId,
  { principleId: string; scrollLabel: string; afterParagraphStartsWith?: string }
> = {
  '01-oxygen-delivery': {
    principleId: 'normal-circulation',
    scrollLabel: 'Oxygen delivery diagram',
    afterParagraphStartsWith: 'During CPR the first factor is the limiting one.',
  },
  '02-after-the-shock': {
    principleId: 'after-shock',
    scrollLabel: 'After the shock diagram',
    afterParagraphStartsWith: 'Two mechanisms look the same on a single rhythm check.',
  },
  '03-two-pressure-gradients': {
    principleId: 'oxygenation-without-hyperventilation',
    scrollLabel: 'Two pressure gradients diagram',
    afterParagraphStartsWith: 'Every positive-pressure breath is also a circulatory event.',
  },
  '04-gas-trapping': {
    principleId: 'peri-intubation',
    scrollLabel: 'Gas trapping diagram',
    afterParagraphStartsWith: 'Gas trapping adds a fourth mechanism.',
  },
  '05-reading-capnography': {
    principleId: 'monitoring',
    scrollLabel: 'Capnography diagram',
  },
  '06-after-rosc': {
    principleId: 'post-rosc-physiology',
    scrollLabel: 'After ROSC diagram',
  },
};

const manifest = manifestJson as ManifestEntry[];

function manifestEntry(file: string): ManifestEntry {
  const entry = manifest.find((item) => item.file === file);
  if (!entry) throw new Error(`Physiology manifest is missing ${file}`);
  if (!entry.caption || !entry.alt || entry.sources.length === 0) {
    throw new Error(`Physiology manifest entry ${file} is missing caption, alt, or sources`);
  }
  return entry;
}

export const physiologyFigures: readonly PhysiologyFigure[] = physiologyFigureIds.map((id) => {
  const place = placement[id];
  const file = `${id}.svg`;
  const entry = manifestEntry(file);
  return {
    id,
    file,
    principleId: place.principleId,
    scrollLabel: place.scrollLabel,
    afterParagraphStartsWith: place.afterParagraphStartsWith,
    caption: entry.caption,
    alt: entry.alt,
    sources: entry.sources,
  };
});

const byId = new Map(physiologyFigures.map((figure) => [figure.id, figure]));

export function isPhysiologyFigureId(id: string): id is PhysiologyFigureId {
  return byId.has(id as PhysiologyFigureId);
}

export function physiologyFigure(id: PhysiologyFigureId): PhysiologyFigure {
  const figure = byId.get(id);
  if (!figure) throw new Error(`Unknown physiology figure ${id}`);
  return figure;
}

export function physiologySvgSource(file: string): string {
  return readFileSync(join(assetDir, file), 'utf8');
}

export function physiologyAnchorErrors(principleId: string, paragraphs: readonly string[]): string[] {
  return physiologyFigures.flatMap((figure) => {
    if (figure.principleId !== principleId || !figure.afterParagraphStartsWith) return [];
    const hits = paragraphs.filter((paragraph) => paragraph.startsWith(figure.afterParagraphStartsWith ?? ''));
    return hits.length === 1 ? [] : [`${figure.id} matched ${hits.length} paragraphs in ${principleId}`];
  });
}
