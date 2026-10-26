import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acute respiratory failure figures. The drawing, title, and description stay
 * in the SVG. The chapter module supplies the figcaption, as the Shock figures do.
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

/** Screen and print copies of one drawing, with unique ids, in the Shock figure wrapper. */
export function respiratorySvg(id: RespiratoryFigureId, variant: RespiratoryFigureVariant): string {
  const source = respiratorySvgSource(id).trim();
  const titleId = source.match(/<title\b[^>]*\bid="([^"]+)"/)?.[1];
  const descId = source.match(/<desc\b[^>]*\bid="([^"]+)"/)?.[1];
  if (!titleId || !descId) throw new Error(`${id} is missing a title or description id`);
  if (!source.includes(fontFace)) throw new Error(`${id} is missing its font face`);

  const prefix = `${id}-${variant}`;
  let svg = source.replaceAll(fontFace, siteFace);
  svg = svg.replace(/\bid="([^"]+)"/g, (_match, elementId: string) => `id="${prefix}-${elementId}"`);
  svg = svg.replace(/url\(#([^)]+)\)/g, (_match, elementId: string) => `url(#${prefix}-${elementId})`);
  svg = svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const next = attrs
      .replace(/\swidth="[^"]*"/g, '')
      .replace(/\sheight="[^"]*"/g, '')
      .replace(/\srole="[^"]*"/g, '')
      .replace(/\saria-labelledby="[^"]*"/g, '')
      .replace(/\saria-describedby="[^"]*"/g, '')
      .replace(/\sclass="[^"]*"/g, '');
    if (!/viewBox="[^"]+"/.test(next)) throw new Error(`${id} is missing a viewBox`);
    return `<svg${next} class="diagram-${variant}" role="img" aria-labelledby="${prefix}-${titleId}" aria-describedby="${prefix}-${descId}">`;
  });
  if (svg.includes('DejaVu')) throw new Error(`${id} still names DejaVu`);
  const text = respiratoryFigureText(id);
  if (!svg.includes(`>${text.title}</title>`) || !svg.includes(`>${text.description}</desc>`)) {
    throw new Error(`${id} title or description changed`);
  }
  return svg;
}
