import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Life-threatening asthma figures. Each id has its own screen drawing and its
 * own print drawing. Title, description, marker, and hatch ids are already
 * separate per copy. The chapter id is the Atelier stem, so the drawing ids
 * start with the chapter id. The chapter module supplies the figcaption, as
 * the Shock figures do.
 *
 * The `.inline.html` file beside each pair is the same two drawings concatenated.
 * The page renders the screen and print SVGs, as the cardiogenic figures do.
 *
 * Unlike the cardiogenic drawings, both copies use the site figure tokens with
 * light fallbacks. The print stylesheet resets those tokens to the light palette.
 */
export const asthmaFigureIds = [
  'fig-r7-01-equal-pressure-point',
  'fig-r7-02-breath-stacking',
  'fig-r7-03-more-time-to-exhale',
] as const;

export type AsthmaFigureId = (typeof asthmaFigureIds)[number];

export type AsthmaFigureVariant = 'screen' | 'print';

const assetDir = join(process.cwd(), 'src/assets/diagrams');

const textFace = "font-family:Literata,'DejaVu Serif',Georgia,serif";
const displayFace = 'font-family:Fraunces,Literata,Georgia,serif';
const siteTextFace = 'font-family:var(--f-text), Georgia, serif';
const siteDisplayFace = 'font-family:var(--f-display), Georgia, serif';

export function isAsthmaFigureId(id: string): id is AsthmaFigureId {
  return (asthmaFigureIds as readonly string[]).includes(id);
}

function sourceFile(id: AsthmaFigureId, variant: AsthmaFigureVariant): string {
  return join(assetDir, variant === 'print' ? `${id}-print.svg` : `${id}.svg`);
}

export function asthmaInlineFile(id: AsthmaFigureId): string {
  return join(assetDir, `${id}.inline.html`);
}

export function asthmaSvgSource(id: AsthmaFigureId, variant: AsthmaFigureVariant): string {
  return readFileSync(sourceFile(id, variant), 'utf8');
}

export function asthmaFigureText(
  id: AsthmaFigureId,
  variant: AsthmaFigureVariant = 'screen',
): { title: string; description: string } {
  const source = asthmaSvgSource(id, variant);
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
  const description = source.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/)?.[1]?.trim() ?? '';
  if (!title || !description) throw new Error(`${id} ${variant} is missing a title or description`);
  return { title, description };
}

/** Screen or print copy for the Shock-style figure wrapper. Words stay as drawn. */
export function asthmaSvg(id: AsthmaFigureId, variant: AsthmaFigureVariant): string {
  const source = asthmaSvgSource(id, variant).trim();
  const scope = `${id}-${variant}-`;
  const titleId = source.match(/<title\b[^>]*\bid="([^"]+)"/)?.[1];
  const descId = source.match(/<desc\b[^>]*\bid="([^"]+)"/)?.[1];
  const markerIds = [...source.matchAll(/<marker\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
  const elementIds = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
  if (!titleId || !descId) throw new Error(`${id} ${variant} is missing a title or description id`);
  if (markerIds.length === 0) throw new Error(`${id} ${variant} is missing an arrowhead marker id`);
  if (!source.includes(textFace) || !source.includes(displayFace)) {
    throw new Error(`${id} ${variant} is missing its font faces`);
  }
  for (const elementId of elementIds) {
    if (!elementId.startsWith(scope)) throw new Error(`${id} ${variant} id "${elementId}" is not scoped to that copy`);
  }

  let svg = source.replaceAll(textFace, siteTextFace).replaceAll(displayFace, siteDisplayFace);
  if (svg.includes('DejaVu')) throw new Error(`${id} ${variant} still names DejaVu`);

  // The print drawing is sized in inches for the page; the stylesheet sizes both copies.
  svg = svg.replace(/<svg\b[^>]*>/, (open) => open.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, ''));
  if (svg.includes('width="100%"')) throw new Error(`${id} ${variant} sets width="100%"`);

  const open = svg.match(/<svg\b[^>]*>/)?.[0] ?? '';
  if (/\s(width|height)=/.test(open)) throw new Error(`${id} ${variant} still sets a fixed size`);
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

  const text = asthmaFigureText(id, variant);
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
    if (!target.startsWith(scope) || !elementIds.includes(target)) {
      throw new Error(`${id} ${variant} references "${target}" from another copy`);
    }
  }

  if (svg.includes('prefers-color-scheme')) {
    throw new Error(`${id} ${variant} must follow the site theme, not its own color scheme`);
  }
  if (!svg.includes('var(--fig-ink,#172d38)') || !svg.includes('var(--fig-panel,#ffffff)')) {
    throw new Error(`${id} ${variant} lost its figure tokens or light fallbacks`);
  }

  return svg;
}
