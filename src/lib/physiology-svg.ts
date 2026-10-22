/** Presentational SVG cleanup for the physiology figures. Labels and numbers stay as drawn. */

const TEXT_FONT = "'Literata', Georgia, serif";
const DISPLAY_FONT = "'Fraunces', Georgia, serif";
const DISPLAY_MIN_PX = 27;

/** Hexes that mean one token no matter which element carries them. */
const PAINT: Record<string, string> = {
  '#526671': 'var(--fig-muted)',
  '#087F82': 'var(--fig-teal)',
  '#D5DEDC': 'var(--fig-rule)',
  '#B84A3C': 'var(--fig-red)',
  '#F7F5EF': 'var(--fig-canvas)',
  '#F5E4DF': 'var(--fig-red-tint)',
  '#A16B14': 'var(--fig-gold)',
  '#E1EFEB': 'var(--fig-teal-tint)',
  '#DDEDEA': 'var(--fig-teal-tint)',
};

/**
 * #172D38, #FFFFFF, and #DAE8E6 are each a background on rects and text on
 * the callout. The element decides which token they become.
 */
function physiologyToken(hex: string, tag: string): string {
  const color = hex.toUpperCase();
  if (color === '#172D38') {
    if (tag === 'text') return 'var(--fig-ink)';
    if (tag === 'rect') return 'var(--fig-callout)';
  } else if (color === '#FFFFFF' || color === '#FFF') {
    if (tag === 'text') return 'var(--fig-on-callout)';
    if (tag === 'rect') return 'var(--fig-panel)';
  } else if (color === '#DAE8E6') {
    if (tag === 'text') return 'var(--fig-on-callout-soft)';
    if (tag === 'rect') return 'var(--fig-teal-tint)';
  } else {
    const token = PAINT[color];
    if (token) return token;
  }
  throw new Error(`No physiology token for ${color} on <${tag}>`);
}

/** Rewrite hard-coded physiology fill and stroke colors to theme tokens. */
export function recolorPhysiologySvg(source: string): string {
  return source.replace(/<([A-Za-z][\w:.-]*)\b([^<>]*)>/g, (full, rawTag: string, attrs: string) => {
    if (!/\b(?:fill|stroke)\s*=\s*"[^"]*#[0-9A-Fa-f]{3,8}/i.test(attrs)) return full;
    const tag = rawTag.toLowerCase();
    const next = attrs.replace(/\b(fill|stroke)\s*=\s*"([^"]*)"/gi, (_attr, name: string, value: string) => {
      const rewritten = value.replace(/#[0-9A-Fa-f]{3,8}/g, (hex) => physiologyToken(hex, tag));
      return `${name}="${rewritten}"`;
    });
    return `<${rawTag}${next}>`;
  });
}

export function preparePhysiologySvg(source: string, idPrefix: string, alt: string): string {
  let svg = source.trim();
  svg = svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const next = attrs
      .replace(/\swidth="[^"]*"/g, '')
      .replace(/\sheight="[^"]*"/g, '')
      .replace(/\saria-labelledby="[^"]*"/g, '')
      .replace(/\srole="[^"]*"/g, '');
    if (!/viewBox="[^"]+"/.test(next)) {
      throw new Error(`${idPrefix} is missing a viewBox`);
    }
    return `<svg${next} role="img" aria-label="${escapeAttr(alt)}">`;
  });
  svg = svg.replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '');
  svg = svg.replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, '');
  svg = svg.replace(/<text\b[^>]*>/g, (tag) => {
    const size = Number(/font-size="([0-9.]+)"/.exec(tag)?.[1] ?? '0');
    const family = size >= DISPLAY_MIN_PX ? DISPLAY_FONT : TEXT_FONT;
    if (!tag.includes('font-family="')) return tag.replace('<text', `<text font-family="${family}"`);
    return tag.replace(/font-family="[^"]*"/, `font-family="${family}"`);
  });
  if (svg.includes('DejaVu')) throw new Error(`${idPrefix} still names DejaVu`);
  svg = svg.replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${idPrefix}-${id}"`);
  svg = svg.replace(/url\(#([^)]+)\)/g, (_match, id: string) => `url(#${idPrefix}-${id})`);
  svg = recolorPhysiologySvg(svg);
  if (/\b(?:fill|stroke)\s*=\s*["'][^"']*#[0-9A-Fa-f]{3,8}/i.test(svg)) {
    throw new Error(`${idPrefix} still has a hard-coded fill or stroke`);
  }
  return svg;
}

export function svgText(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '');
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
