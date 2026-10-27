import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acid-base physiology figures. Each id has its own screen drawing and its own
 * print drawing. Title, description, marker, and pattern ids are already
 * separate per copy, and the chapter id is the Atelier stem. The chapter module
 * supplies the figcaption, as the Shock figures do.
 *
 * The `.inline.html` file beside each pair is the same two drawings concatenated.
 * The page renders the screen and print SVGs, as the airway figures do.
 *
 * Unlike the earlier figure sets, these drawings share one stylesheet: class
 * names (`t-ink`, `hatch`, ...) and the `text` font rules are not scoped to the
 * copy, and the print copy keeps the theme tokens (the print stylesheet sets
 * them to the light palette). Six inline SVGs on one page would otherwise
 * override each other's `.hatch` pattern and restyle every SVG `text` on the
 * page, so the wrapper scopes each class and each rule to its own copy. The
 * stored drawings stay byte for byte as delivered.
 */
export const acidBaseFigureIds = [
  'fig-r8-01-two-routes',
  'fig-r8-02-expected-vs-observed',
  'fig-r8-03-anion-gap-bookkeeping',
  'fig-r8-04-renal-bicarbonate',
] as const;

export type AcidBaseFigureId = (typeof acidBaseFigureIds)[number];

export type AcidBaseFigureVariant = 'screen' | 'print';

const assetDir = join(process.cwd(), 'src/assets/diagrams');

const textFace = "font-family:Literata,'DejaVu Serif',Georgia,serif";
const headingFace = 'font-family:Fraunces,Literata,Georgia,serif';
const siteTextFace = 'font-family:var(--f-text), Georgia, serif';
const siteHeadingFace = 'font-family:var(--f-display), Georgia, serif';

export function isAcidBaseFigureId(id: string): id is AcidBaseFigureId {
  return (acidBaseFigureIds as readonly string[]).includes(id);
}

function sourceFile(id: AcidBaseFigureId, variant: AcidBaseFigureVariant): string {
  return join(assetDir, variant === 'print' ? `${id}-print.svg` : `${id}.svg`);
}

export function acidBaseInlineFile(id: AcidBaseFigureId): string {
  return join(assetDir, `${id}.inline.html`);
}

export function acidBaseSvgSource(id: AcidBaseFigureId, variant: AcidBaseFigureVariant): string {
  return readFileSync(sourceFile(id, variant), 'utf8');
}

export function acidBaseFigureText(
  id: AcidBaseFigureId,
  variant: AcidBaseFigureVariant = 'screen',
): { title: string; description: string } {
  const source = acidBaseSvgSource(id, variant);
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
  const description = source.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/)?.[1]?.trim() ?? '';
  if (!title || !description) throw new Error(`${id} ${variant} is missing a title or description`);
  return { title, description };
}

/** Prefix each class selector with the copy scope, and root element rules at this SVG. */
function scopeStyle(style: string, scope: string, root: string): string {
  return style.replace(/(^|})([^{}]+)\{/g, (_rule, close: string, selector: string) => {
    const scoped = selector
      .split(',')
      .map((part) => {
        const trimmed = part.trim();
        if (trimmed.startsWith('.')) return trimmed.replace(/\.([\w-]+)/g, `.${scope}-$1`);
        return `${root} ${trimmed}`;
      })
      .join(',');
    return `${close}${scoped}{`;
  });
}

/** Screen or print copy for the Shock-style figure wrapper. Words stay as drawn. */
export function acidBaseSvg(id: AcidBaseFigureId, variant: AcidBaseFigureVariant): string {
  const source = acidBaseSvgSource(id, variant).trim();
  const scope = `${id}-${variant}`;
  const titleId = source.match(/<title\b[^>]*\bid="([^"]+)"/)?.[1];
  const descId = source.match(/<desc\b[^>]*\bid="([^"]+)"/)?.[1];
  const markerIds = [...source.matchAll(/<marker\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
  if (!titleId || !descId) throw new Error(`${id} ${variant} is missing a title or description id`);
  if (markerIds.length === 0) throw new Error(`${id} ${variant} is missing an arrowhead marker id`);
  if (!source.includes(textFace) || !source.includes(headingFace)) {
    throw new Error(`${id} ${variant} is missing its font faces`);
  }
  if (!titleId.startsWith(`${scope}-`) || !descId.startsWith(`${scope}-`)) {
    throw new Error(`${id} ${variant} title or description id is not scoped to that copy`);
  }
  for (const elementId of source.matchAll(/\bid="([^"]+)"/g)) {
    if (!(elementId[1] ?? '').startsWith(`${scope}-`)) {
      throw new Error(`${id} ${variant} element id is not scoped to that copy`);
    }
  }

  const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  if (styles.length !== 1) throw new Error(`${id} ${variant} must have exactly one stylesheet`);
  const style = styles[0]?.[1] ?? '';
  const classNames = new Set([...style.matchAll(/\.([\w-]+)/g)].map((match) => match[1] ?? ''));
  const root = `svg[aria-labelledby="${titleId}"]`;

  let svg = source.replace(
    /<style>[\s\S]*?<\/style>/,
    `<style>${scopeStyle(style, scope, root)}</style>`,
  );
  svg = svg.replace(/(<(?!svg\b)[a-z]+\b[^>]*\bclass=")([^"]*)"/g, (_match, start: string, value: string) => {
    const tokens = value.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (!classNames.has(token)) throw new Error(`${id} ${variant} uses class "${token}" with no rule`);
    }
    return `${start}${tokens.map((token) => `${scope}-${token}`).join(' ')}"`;
  });
  svg = svg.replaceAll(textFace, siteTextFace).replaceAll(headingFace, siteHeadingFace);
  if (svg.includes('DejaVu')) throw new Error(`${id} ${variant} still names DejaVu`);

  // Size comes from the page stylesheet, as for every other figure.
  svg = svg.replace(/<svg\b[^>]*>/, (open) => open.replace(/\s(?:width|height)="[^"]*"/g, ''));
  const open = svg.match(/<svg\b[^>]*>/)?.[0] ?? '';
  if (open.includes('width=') || open.includes('height=')) throw new Error(`${id} ${variant} sets a size`);
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

  const text = acidBaseFigureText(id, variant);
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
    if (!target.startsWith(`${scope}-`)) {
      throw new Error(`${id} ${variant} references "${target}" from another copy`);
    }
  }
  if (svg.includes('prefers-color-scheme')) {
    throw new Error(`${id} ${variant} must take its colours from the site theme tokens`);
  }
  if (!svg.includes('var(--fig-ink,#172d38)')) {
    throw new Error(`${id} ${variant} drawing lost its theme tokens`);
  }

  return svg;
}
