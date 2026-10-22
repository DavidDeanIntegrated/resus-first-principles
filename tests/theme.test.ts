import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const COLOR_TOKENS = [
  'paper',
  'paper-deep',
  'card',
  'rule',
  'rule-strong',
  'ink',
  'ink-soft',
  'accent',
  'accent-tint',
  'sage',
  'sage-tint',
  'hatch',
  'focus',
  'fig-canvas',
  'fig-panel',
  'fig-ink',
  'fig-muted',
  'fig-teal',
  'fig-red',
  'fig-gold',
  'fig-rule',
  'fig-teal-tint',
  'fig-red-tint',
  'fig-callout',
  'fig-on-callout',
  'fig-on-callout-soft',
] as const;

const LIGHT: Record<(typeof COLOR_TOKENS)[number], string> = {
  paper: '#fbf6ee',
  'paper-deep': '#f3eadb',
  card: '#fffdf8',
  rule: '#e2d5c1',
  'rule-strong': '#918476',
  ink: '#2a211b',
  'ink-soft': '#5e4f43',
  accent: '#8e2f22',
  'accent-tint': '#f6e4dc',
  sage: '#2f5d50',
  'sage-tint': '#e3ece5',
  hatch: '#918476',
  focus: '#1f4fa8',
  'fig-canvas': '#f7f5ef',
  'fig-panel': '#ffffff',
  'fig-ink': '#172d38',
  'fig-muted': '#526671',
  'fig-teal': '#077578',
  'fig-red': '#af4639',
  'fig-gold': '#996613',
  'fig-rule': '#d5dedc',
  'fig-teal-tint': '#ddedea',
  'fig-red-tint': '#f5e4df',
  'fig-callout': '#172d38',
  'fig-on-callout': '#ffffff',
  'fig-on-callout-soft': '#dae8e6',
};

const DARK: Record<(typeof COLOR_TOKENS)[number], string> = {
  paper: '#1c1915',
  'paper-deep': '#2d2822',
  card: '#25211c',
  rule: '#4a4238',
  'rule-strong': '#7d7266',
  ink: '#e8dfd0',
  'ink-soft': '#b3a897',
  accent: '#d98a78',
  'accent-tint': '#43302a',
  sage: '#8fbfae',
  'sage-tint': '#22302b',
  hatch: '#7d7266',
  focus: '#8fb3f0',
  'fig-canvas': '#25211c',
  'fig-panel': '#2d2822',
  'fig-ink': '#e8dfd0',
  'fig-muted': '#b3a897',
  'fig-teal': '#6fb8b0',
  'fig-red': '#e0907f',
  'fig-gold': '#d9a955',
  'fig-rule': '#4a4238',
  'fig-teal-tint': '#30443f',
  'fig-red-tint': '#43302a',
  'fig-callout': '#3a4a44',
  'fig-on-callout': '#f2ebdf',
  'fig-on-callout-soft': '#d7e3de',
};

const HEX_PAINT = /\b(?:fill|stroke|stop-color|flood-color)\s*=\s*["'][^"']*#[0-9A-Fa-f]{3,8}/i;
const HEX_STYLE = /\bstyle\s*=\s*["'][^"']*\b(?:fill|stroke)\s*:\s*#[0-9A-Fa-f]{3,8}/i;

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/.exec(hex.trim().toLowerCase());
  if (!match?.[1]) throw new Error(`Expected a 6-digit hex color, received ${hex}`);
  const raw = match[1];
  return (
    0.2126 * channel(Number.parseInt(raw.slice(0, 2), 16)) +
    0.7152 * channel(Number.parseInt(raw.slice(2, 4), 16)) +
    0.0722 * channel(Number.parseInt(raw.slice(4, 6), 16))
  );
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function colorTokens(block: string): Record<string, string> {
  const tokens = Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2]?.trim() ?? '']),
  );
  const colors: Record<string, string> = {};
  for (const name of COLOR_TOKENS) colors[name] = tokens[name] ?? '';
  return colors;
}

function sliceBlock(css: string, header: string): { block: string; end: number; start: number } {
  const start = css.indexOf(header);
  expect(start, header).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return { block: css.slice(open + 1, i), end: i + 1, start };
    }
  }
  throw new Error(`Unclosed ${header}`);
}

function stripScreen(css: string): string {
  let rest = css;
  let guard = 0;
  while (guard < 20) {
    const at = rest.search(/@media\s+screen\b/i);
    if (at < 0) return rest;
    const open = rest.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < rest.length; end += 1) {
      if (rest[end] === '{') depth += 1;
      else if (rest[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    rest = rest.slice(0, at) + rest.slice(end + 1);
    guard += 1;
  }
  throw new Error('Could not strip @media screen blocks');
}

function figures(html: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < html.length) {
    const at = html.indexOf('data-diagram="', from);
    if (at < 0) break;
    const end = html.indexOf('</figure>', at);
    expect(end).toBeGreaterThan(at);
    blocks.push(html.slice(at, end));
    from = end + '</figure>'.length;
  }
  return blocks;
}

function builtCss(): string {
  const dir = join(repoRoot, 'dist/_astro');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

describe('theme', () => {
  const css = read('src/styles/global.css');
  const root = css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
  const systemDark = sliceBlock(css, '@media screen and (prefers-color-scheme: dark)');
  const forcedDark = sliceBlock(css, '@media screen {');
  const print = sliceBlock(css, '@media print');

  it('keeps light tokens on :root and in print, and scopes dark tokens to screen', () => {
    expect(colorTokens(root)).toEqual(LIGHT);
    expect(colorTokens(print.block)).toEqual(LIGHT);
    expect(systemDark.block).toContain(':root:not([data-theme="light"])');
    expect(forcedDark.block).toContain(':root[data-theme="dark"]');
    expect(colorTokens(systemDark.block)).toEqual(DARK);
    expect(colorTokens(forcedDark.block)).toEqual(DARK);
    expect(systemDark.block).toContain('color-scheme: dark');
    expect(forcedDark.block).toContain('color-scheme: dark');
    expect(print.block).toContain('color-scheme: light');

    const withoutScreen = stripScreen(css);
    for (const hex of new Set(Object.values(DARK))) {
      expect(withoutScreen.toLowerCase(), hex).not.toContain(hex);
    }
    expect(print.block).toContain('stroke: #111');
    expect(print.block).toContain('fill: #fff');
    expect(print.block).toContain('#f4f4f4');
    expect(print.block).toContain('#e4e4e4');
    expect(print.block).toContain('#666');
    expect(print.block).not.toContain('#1c1915');
    expect(css).toMatch(/\.diagram svg\s*\{[^}]*border:\s*1px solid var\(--rule-strong\)/);
    expect(css).toMatch(/\.q\s*\{[^}]*border:\s*1px solid var\(--rule-strong\)/);
    expect(css).toMatch(/\.example\s*\{[^}]*border:\s*1px solid var\(--rule-strong\)/);
    expect(css).toMatch(/\.diagram-node\s*\{[^}]*stroke:\s*var\(--rule\)/);
    expect(css).toMatch(/\.diagram-physiology img\s*\{[^}]*background:\s*#fffdf8/);
    expect(css).toMatch(/\.diagram-physiology img\s*\{[^}]*color-scheme:\s*light/);
  });

  it('keeps dark text and meaningful lines at WCAG AA', () => {
    const pairs: Array<[(typeof COLOR_TOKENS)[number], (typeof COLOR_TOKENS)[number], number]> = [
      ['ink', 'paper', 4.5],
      ['ink', 'card', 4.5],
      ['ink', 'paper-deep', 4.5],
      ['ink', 'sage-tint', 4.5],
      ['ink', 'accent-tint', 4.5],
      ['ink-soft', 'paper', 4.5],
      ['ink-soft', 'card', 4.5],
      ['ink-soft', 'paper-deep', 4.5],
      ['accent', 'paper', 4.5],
      ['accent', 'card', 4.5],
      ['accent', 'paper-deep', 4.5],
      ['accent', 'accent-tint', 4.5],
      ['sage', 'paper', 4.5],
      ['sage', 'card', 4.5],
      ['sage', 'paper-deep', 4.5],
      ['sage', 'sage-tint', 4.5],
      ['focus', 'paper', 3],
      ['focus', 'card', 3],
      ['hatch', 'paper', 3],
      ['hatch', 'card', 3],
      ['hatch', 'paper-deep', 3],
      ['rule-strong', 'paper', 3],
      ['rule-strong', 'card', 3],
      ['rule-strong', 'paper-deep', 3],
      ['fig-ink', 'fig-canvas', 4.5],
      ['fig-ink', 'fig-panel', 4.5],
      ['fig-muted', 'fig-canvas', 4.5],
      ['fig-muted', 'fig-panel', 4.5],
      ['fig-teal', 'fig-canvas', 4.5],
      ['fig-teal', 'fig-panel', 4.5],
      ['fig-teal', 'fig-teal-tint', 4.5],
      ['fig-red', 'fig-canvas', 4.5],
      ['fig-red', 'fig-panel', 4.5],
      ['fig-red', 'fig-red-tint', 4.5],
      ['fig-gold', 'fig-canvas', 4.5],
      ['fig-gold', 'fig-panel', 4.5],
      ['fig-on-callout', 'fig-callout', 4.5],
      ['fig-on-callout-soft', 'fig-callout', 4.5],
    ];
    for (const [foreground, background, minimum] of pairs) {
      expect(contrast(DARK[foreground], DARK[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(
        minimum,
      );
    }
  });

  it('ships the screen-only dark theme and the light print tokens', () => {
    const shipped = builtCss().toLowerCase();
    expect(shipped).toContain('prefers-color-scheme:dark');
    expect(shipped).toContain('#1c1915');
    const unscreened = stripScreen(shipped);
    expect(unscreened).not.toContain('#1c1915');
    expect(unscreened).toContain('#fbf6ee');
    expect(unscreened).toContain('#111');
    expect(unscreened).toContain('#f4f4f4');
  });

  it('renders every figure without a hard-coded fill or stroke', () => {
    const html = read('dist/cases/adult-cardiac-arrest/index.html');
    const blocks = figures(html);
    const ids = blocks.map((block) => /data-diagram="([^"]+)"/.exec(block)?.[1] ?? '');
    expect(ids).toHaveLength(12);
    expect([...ids].sort()).toEqual([
      '01-oxygen-delivery',
      '02-after-the-shock',
      '03-two-pressure-gradients',
      '04-gas-trapping',
      '05-reading-capnography',
      '06-after-rosc',
      'compression-pause',
      'compression-release',
      'coronary-circuit',
      'pressure-gradient',
      'pressure-pairs',
      'reversible-cause-overlap',
    ]);
    for (const block of blocks) {
      const svgs = block.match(/<svg\b[\s\S]*?<\/svg>/g) ?? [];
      expect(svgs.length).toBeGreaterThan(0);
      for (const svg of svgs) {
        expect(svg).not.toMatch(HEX_PAINT);
        expect(svg).not.toMatch(HEX_STYLE);
      }
    }
    const gradients = figures(html).find((block) => block.includes('data-diagram="03-two-pressure-gradients"')) ?? '';
    expect(gradients).toContain('fill="var(--fig-callout)"');
    expect(gradients).toContain('fill="var(--fig-on-callout)"');
    expect(gradients).toContain('fill="var(--fig-on-callout-soft)"');
    expect(gradients).toContain('fill="var(--fig-ink)"');
    expect(gradients).toContain('fill="var(--fig-panel)"');
    expect(gradients).toContain('fill="var(--fig-teal-tint)"');
  });

  it('puts a blocking theme script in the head and a light, dark, and system control on every page', () => {
    for (const page of ['index.html', '404.html', 'cases/adult-cardiac-arrest/index.html']) {
      const html = read(join('dist', page));
      const headStart = html.indexOf('<head');
      const headEnd = html.indexOf('</head>');
      expect(headStart, page).toBeGreaterThan(-1);
      expect(headEnd, page).toBeGreaterThan(headStart);
      const head = html.slice(headStart, headEnd);
      const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
      const boot = scripts.find((match) => match[2]?.includes('localStorage.getItem("rfp-theme")'));
      expect(boot, page).toBeTruthy();
      const attrs = boot?.[1] ?? '';
      expect(attrs, page).not.toMatch(/\b(?:defer|async)\b/i);
      expect(attrs, page).not.toMatch(/\btype\s*=/i);
      expect(boot?.[2]).toContain('setAttribute("data-theme"');
      expect(head.indexOf('rfp-theme')).toBeGreaterThan(-1);

      const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
      expect(header).toContain('Color theme');
      expect(header).toContain('name="color-theme"');
      expect(header).toContain('value="light"');
      expect(header).toContain('value="dark"');
      expect(header).toContain('value="system"');
      expect(header).toContain('localStorage.setItem("rfp-theme"');
      expect(header.indexOf('<fieldset class="theme-toggle">')).toBeLessThan(header.indexOf('rfp-theme'));
    }
  });
});
