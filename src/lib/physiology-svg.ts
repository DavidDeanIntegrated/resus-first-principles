/** Presentational SVG cleanup for the physiology figures. Labels and numbers stay as drawn. */

const TEXT_FONT = "'Literata', Georgia, serif";
const DISPLAY_FONT = "'Fraunces', Georgia, serif";
const DISPLAY_MIN_PX = 27;

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
  return svg;
}

export function svgText(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '');
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
