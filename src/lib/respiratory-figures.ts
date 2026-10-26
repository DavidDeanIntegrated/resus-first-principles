import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acute respiratory failure figures. The drawing, title, and description stay
 * in the SVG. The chapter module supplies the figcaption, as the Shock figures do.
 * r1-four-mechanisms has a separate wide print drawing with fixed light colours.
 */
export const respiratoryFigureIds = [
  'r1-four-mechanisms',
  'r1-alveolar-ventilation',
  'r1-load-capacity',
] as const;

export type RespiratoryFigureId = (typeof respiratoryFigureIds)[number];

export type RespiratoryFigureVariant = 'screen' | 'print';

const assetDir = join(process.cwd(), 'src/assets/diagrams');

const fontFace = "font-family:'DejaVu Sans',system-ui,sans-serif";
const siteFace = 'font-family:var(--f-text), Georgia, serif';

/** Print drawing that is not a copy of the screen SVG. Colours stay as authored. */
const dedicatedPrint = new Set<RespiratoryFigureId>(['r1-four-mechanisms']);

export function isRespiratoryFigureId(id: string): id is RespiratoryFigureId {
  return (respiratoryFigureIds as readonly string[]).includes(id);
}

export function respiratorySvgSource(id: RespiratoryFigureId): string {
  return readFileSync(join(assetDir, `${id}.svg`), 'utf8');
}

export function respiratoryFigureText(id: RespiratoryFigureId): { title: string; description: string } {
  const source = respiratorySvgSource(id);
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
  const description = source.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/)?.[1]?.trim() ?? '';
  if (!title || !description) throw new Error(`${id} is missing a title or description`);
  return { title, description };
}

function variantSource(id: RespiratoryFigureId, variant: RespiratoryFigureVariant): string {
  const file = variant === 'print' && dedicatedPrint.has(id) ? `${id}-print.svg` : `${id}.svg`;
  return readFileSync(join(assetDir, file), 'utf8').trim();
}

/** Screen and print copies, with unique ids, in the Shock figure wrapper. */
export function respiratorySvg(id: RespiratoryFigureId, variant: RespiratoryFigureVariant): string {
  const source = variantSource(id, variant);
  const titleId = source.match(/<title\b[^>]*\bid="([^"]+)"/)?.[1];
  const descId = source.match(/<desc\b[^>]*\bid="([^"]+)"/)?.[1];
  const markerIds = [...source.matchAll(/<marker\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  if (!titleId || !descId) throw new Error(`${id} is missing a title or description id`);
  if (markerIds.length === 0) throw new Error(`${id} is missing an arrowhead marker id`);
  if (!source.includes(fontFace)) throw new Error(`${id} is missing its font face`);

  const prefix = `${id}-${variant}`;
  const ownTitleId = `${prefix}-${titleId}`;
  const ownDescId = `${prefix}-${descId}`;
  let svg = source.replaceAll(fontFace, siteFace);
  svg = svg.replace(/\bid="([^"]+)"/g, (_match, elementId: string) => `id="${prefix}-${elementId}"`);
  svg = svg.replace(/url\(#([^)]+)\)/g, (_match, elementId: string) => `url(#${prefix}-${elementId})`);
  // The four-mechanisms copies name both their own title and description, as the source drawings do.
  const labelledBy = dedicatedPrint.has(id)
    ? `${ownTitleId} ${ownDescId}`
    : ownTitleId;
  const describedBy = dedicatedPrint.has(id) ? '' : ` aria-describedby="${ownDescId}"`;
  svg = svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const next = attrs
      .replace(/\swidth="[^"]*"/g, '')
      .replace(/\sheight="[^"]*"/g, '')
      .replace(/\srole="[^"]*"/g, '')
      .replace(/\saria-labelledby="[^"]*"/g, '')
      .replace(/\saria-describedby="[^"]*"/g, '')
      .replace(/\sclass="[^"]*"/g, '');
    if (!/viewBox="[^"]+"/.test(next)) throw new Error(`${id} is missing a viewBox`);
    return `<svg${next} class="diagram-${variant}" role="img" aria-labelledby="${labelledBy}"${describedBy}>`;
  });
  if (svg.includes('DejaVu')) throw new Error(`${id} still names DejaVu`);
  if (svg.includes('width="100%"')) throw new Error(`${id} ${variant} still sets width="100%"`);
  const text = respiratoryFigureText(id);
  if (!svg.includes(`>${text.title}</title>`) || !svg.includes(`>${text.description}</desc>`)) {
    throw new Error(`${id} title or description changed`);
  }
  if (!svg.includes(`id="${ownTitleId}"`) || !svg.includes(`id="${ownDescId}"`)) {
    throw new Error(`${id} ${variant} title or description id was not prefixed`);
  }
  for (const markerId of markerIds) {
    if (!svg.includes(`id="${prefix}-${markerId}"`)) {
      throw new Error(`${id} ${variant} marker id was not prefixed`);
    }
  }
  if (dedicatedPrint.has(id) && variant === 'print') {
    if (svg.includes('var(--fig-') || svg.includes('prefers-color-scheme')) {
      throw new Error(`${id} print drawing must keep its fixed light colours`);
    }
    if (!svg.includes('fill:#172d38') || !svg.includes('fill:#ffffff')) {
      throw new Error(`${id} print drawing lost its light palette`);
    }
  }
  return svg;
}
