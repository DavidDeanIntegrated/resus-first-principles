import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cardiogenic pulmonary edema figures. Each id has its own screen drawing and
 * its own print drawing. Title, description, and marker ids are already
 * separate per copy (the Atelier stem, not the chapter id). The chapter
 * module supplies the figcaption, as the Shock figures do.
 *
 * The `.inline.html` file beside each pair is the same two drawings concatenated.
 * The page renders the screen and print SVGs, as the airway figures do.
 */
export const cardiogenicFigureIds = [
  'r4-three-flooded-lungs',
  'r4-pressure-chain',
  'r4-pressure-volume',
  'r4-pleural-pressure',
] as const;

export type CardiogenicFigureId = (typeof cardiogenicFigureIds)[number];

export type CardiogenicFigureVariant = 'screen' | 'print';

/** Ids already written into the drawing. The chapter id is the shorter name. */
const figureStem: Record<CardiogenicFigureId, string> = {
  'r4-three-flooded-lungs': 'fig-r4-01-three-flooded-lungs',
  'r4-pressure-chain': 'fig-r4-02a-pressure-chain',
  'r4-pressure-volume': 'fig-r4-02-pressure-volume',
  'r4-pleural-pressure': 'fig-r4-03-pleural-pressure',
};

const assetDir = join(process.cwd(), 'src/assets/diagrams');

const fontFace = "font-family:'DejaVu Sans',system-ui,sans-serif";
const siteFace = 'font-family:var(--f-text), Georgia, serif';

export function isCardiogenicFigureId(id: string): id is CardiogenicFigureId {
  return (cardiogenicFigureIds as readonly string[]).includes(id);
}

export function cardiogenicFigureStem(id: CardiogenicFigureId): string {
  return figureStem[id];
}

function sourceFile(id: CardiogenicFigureId, variant: CardiogenicFigureVariant): string {
  return join(assetDir, variant === 'print' ? `${id}-print.svg` : `${id}.svg`);
}

export function cardiogenicInlineFile(id: CardiogenicFigureId): string {
  return join(assetDir, `${id}.inline.html`);
}

export function cardiogenicSvgSource(id: CardiogenicFigureId, variant: CardiogenicFigureVariant): string {
  return readFileSync(sourceFile(id, variant), 'utf8');
}

export function cardiogenicFigureText(
  id: CardiogenicFigureId,
  variant: CardiogenicFigureVariant = 'screen',
): { title: string; description: string } {
  const source = cardiogenicSvgSource(id, variant);
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
  const description = source.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/)?.[1]?.trim() ?? '';
  if (!title || !description) throw new Error(`${id} ${variant} is missing a title or description`);
  return { title, description };
}

/** Screen or print copy for the Shock-style figure wrapper. Words stay as drawn. */
export function cardiogenicSvg(id: CardiogenicFigureId, variant: CardiogenicFigureVariant): string {
  const source = cardiogenicSvgSource(id, variant).trim();
  const stem = figureStem[id];
  const titleId = source.match(/<title\b[^>]*\bid="([^"]+)"/)?.[1];
  const descId = source.match(/<desc\b[^>]*\bid="([^"]+)"/)?.[1];
  const markerIds = [...source.matchAll(/<marker\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
  if (!titleId || !descId) throw new Error(`${id} ${variant} is missing a title or description id`);
  if (markerIds.length === 0) throw new Error(`${id} ${variant} is missing an arrowhead marker id`);
  if (!source.includes(fontFace)) throw new Error(`${id} ${variant} is missing its font face`);
  if (!titleId.startsWith(`${stem}-${variant}-`) || !descId.startsWith(`${stem}-${variant}-`)) {
    throw new Error(`${id} ${variant} title or description id is not scoped to that copy`);
  }
  for (const markerId of markerIds) {
    if (!markerId.startsWith(`${stem}-${variant}-`)) {
      throw new Error(`${id} ${variant} marker id is not scoped to that copy`);
    }
  }

  let svg = source.replaceAll(fontFace, siteFace);
  if (svg.includes('DejaVu')) throw new Error(`${id} ${variant} still names DejaVu`);
  if (svg.includes('width="100%"')) throw new Error(`${id} ${variant} sets width="100%"`);

  const open = svg.match(/<svg\b[^>]*>/)?.[0] ?? '';
  if (!open.includes(`class="diagram-${variant}"`)) {
    throw new Error(`${id} ${variant} is missing class diagram-${variant}`);
  }
  if (!open.includes('role="img"')) throw new Error(`${id} ${variant} is missing role="img"`);
  if (!open.includes(`aria-labelledby="${titleId}"`)) {
    throw new Error(`${id} ${variant} aria-labelledby does not point at its own title`);
  }
  if (!open.includes(`aria-describedby="${descId}"`)) {
    throw new Error(`${id} ${variant} aria-describedby does not point at its own description`);
  }
  if (!/viewBox="[^"]+"/.test(open)) throw new Error(`${id} ${variant} is missing a viewBox`);

  const text = cardiogenicFigureText(id, variant);
  if (!svg.includes(`>${text.title}</title>`) || !svg.includes(`>${text.description}</desc>`)) {
    throw new Error(`${id} ${variant} title or description changed`);
  }
  for (const markerId of markerIds) {
    if (!svg.includes(`id="${markerId}"`)) {
      throw new Error(`${id} ${variant} marker id was dropped`);
    }
  }
  for (const reference of svg.matchAll(/url\(#([^)]+)\)/g)) {
    const target = reference[1] ?? '';
    if (!target.startsWith(`${stem}-${variant}-`)) {
      throw new Error(`${id} ${variant} references marker "${target}" from another copy`);
    }
  }

  if (variant === 'print') {
    if (svg.includes('var(--fig-') || svg.includes('prefers-color-scheme')) {
      throw new Error(`${id} print drawing must keep its fixed light colours`);
    }
    if (!svg.includes('fill:#172d38') || !svg.includes('fill:#ffffff')) {
      throw new Error(`${id} print drawing lost its light palette`);
    }
  } else if (!svg.includes('var(--fig-ink') || !svg.includes('prefers-color-scheme:dark')) {
    throw new Error(`${id} screen drawing must keep its theme tokens`);
  }

  return svg;
}
