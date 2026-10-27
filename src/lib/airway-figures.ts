import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Physiologically difficult airway figures. Each id has its own screen drawing
 * and its own print drawing. Title, description, and marker ids are already
 * separate per copy. The chapter module supplies the figcaption, as the Shock
 * figures do. `shock-circulation-gradients` is not here: that section reuses
 * the Shock component.
 */
export const airwayFigureIds = [
  'fig-r2-02-what-intubation-removes',
  'fig-r2-01-apnoea-clock',
  'fig-r2-03-rv-spiral',
] as const;

export type AirwayFigureId = (typeof airwayFigureIds)[number];

export type AirwayFigureVariant = 'screen' | 'print';

const assetDir = join(process.cwd(), 'src/assets/diagrams');

const fontFace = "font-family:'DejaVu Sans',system-ui,sans-serif";
const siteFace = 'font-family:var(--f-text), Georgia, serif';

export function isAirwayFigureId(id: string): id is AirwayFigureId {
  return (airwayFigureIds as readonly string[]).includes(id);
}

function sourceFile(id: AirwayFigureId, variant: AirwayFigureVariant): string {
  return join(assetDir, variant === 'print' ? `${id}-print.svg` : `${id}.svg`);
}

export function airwaySvgSource(id: AirwayFigureId, variant: AirwayFigureVariant): string {
  return readFileSync(sourceFile(id, variant), 'utf8');
}

export function airwayFigureText(
  id: AirwayFigureId,
  variant: AirwayFigureVariant = 'screen',
): { title: string; description: string } {
  const source = airwaySvgSource(id, variant);
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
  const description = source.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/)?.[1]?.trim() ?? '';
  if (!title || !description) throw new Error(`${id} ${variant} is missing a title or description`);
  return { title, description };
}

/** Screen or print copy for the Shock-style figure wrapper. Words stay as drawn. */
export function airwaySvg(id: AirwayFigureId, variant: AirwayFigureVariant): string {
  const source = airwaySvgSource(id, variant).trim();
  const titleId = source.match(/<title\b[^>]*\bid="([^"]+)"/)?.[1];
  const descId = source.match(/<desc\b[^>]*\bid="([^"]+)"/)?.[1];
  const markerIds = [...source.matchAll(/<marker\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
  if (!titleId || !descId) throw new Error(`${id} ${variant} is missing a title or description id`);
  if (markerIds.length === 0) throw new Error(`${id} ${variant} is missing an arrowhead marker id`);
  if (!source.includes(fontFace)) throw new Error(`${id} ${variant} is missing its font face`);
  if (!titleId.includes(`-${variant}-`) || !descId.includes(`-${variant}-`)) {
    throw new Error(`${id} ${variant} title or description id is not scoped to that copy`);
  }
  for (const markerId of markerIds) {
    if (!markerId.includes(`-${variant}-`)) {
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

  const text = airwayFigureText(id, variant);
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
    if (!target.includes(`-${variant}-`)) {
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
