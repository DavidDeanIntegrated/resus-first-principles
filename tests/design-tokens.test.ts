import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const normalized = hex.trim().toLowerCase();
  const match = /^#([0-9a-f]{6})$/.exec(normalized);
  if (!match?.[1]) {
    throw new Error(`Expected a 6-digit hex color, received ${hex}`);
  }
  const raw = match[1];
  const red = channel(Number.parseInt(raw.slice(0, 2), 16));
  const green = channel(Number.parseInt(raw.slice(2, 4), 16));
  const blue = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('annotated primer tokens', () => {
  const css = read('src/styles/global.css');
  const rootBlock = css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
  const tokens = Object.fromEntries(
    [...rootBlock.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2]?.trim() ?? '']),
  );

  it('defines the paper palette, the 4px spacing scale, and a 66ch measure', () => {
    expect(tokens).toMatchObject({
      paper: '#fbf6ee',
      'paper-deep': '#f3eadb',
      card: '#fffdf8',
      rule: '#e2d5c1',
      ink: '#2a211b',
      'ink-soft': '#5e4f43',
      accent: '#8e2f22',
      'accent-tint': '#f6e4dc',
      sage: '#2f5d50',
      'sage-tint': '#e3ece5',
      focus: '#1f4fa8',
      s1: '4px',
      s2: '8px',
      s3: '12px',
      s4: '16px',
      s5: '24px',
      s6: '32px',
      s7: '48px',
      s8: '64px',
      s9: '96px',
      measure: '66ch',
      'text-body': '17px',
      'text-h1': '2.5rem',
      'text-h2': '1.875rem',
      'text-stem': '1.25rem',
      'text-step': '1.125rem',
      'text-lede': '1.1875rem',
      'text-small': '0.875rem',
      'text-label': '0.75rem',
    });
  });

  it('raises body and display sizes at the single 900px breakpoint', () => {
    const desktop = css.match(/@media\s*\(min-width:\s*900px\)\s*\{([\s\S]*?)\n\}/);
    expect(desktop?.[1]).toContain('--text-body: 18px');
    expect(desktop?.[1]).toContain('--text-h1: 4rem');
    expect(desktop?.[1]).toContain('--text-h2: 2.5rem');

    const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1]?.trim());
    expect(queries).toEqual([
      '(min-width: 900px)',
      '(prefers-reduced-motion: reduce)',
      'screen and (max-width: 700px)',
      'print',
    ]);
    const narrow = css.match(/@media screen and \(max-width:\s*700px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(narrow).toContain('width: 780px');
    expect(narrow).not.toContain('--text-body');
  });

  it('prints without navigation, with disclosures open and figures intact', () => {
    const print = css.match(/@media print\s*\{([\s\S]*)\n\}/)?.[1] ?? '';
    expect(print).toContain('.toc-dock');
    expect(print).toContain('.cause-nav');
    expect(print).toContain('display: none !important');
    expect(print).toContain('details:not([open]) > :not(summary)');
    expect(print).toContain('display: block !important');
    expect(print).toContain('break-inside: avoid');
    expect(print).toContain("content: ' (' attr(href) ')'");
    expect(print).toContain('.diagram-node');
    expect(print).toContain('stroke: #111');
    expect(print).toContain('.diagram-print');
    expect(print).toContain('max-height: 7.6in');
  });

  it('keeps text and the focus ring at WCAG AA contrast', () => {
    const pairs: Array<[string, string, number]> = [
      ['ink', 'paper', 4.5],
      ['ink', 'paper-deep', 4.5],
      ['ink', 'card', 4.5],
      ['ink', 'sage-tint', 4.5],
      ['ink-soft', 'paper', 4.5],
      ['ink-soft', 'paper-deep', 4.5],
      ['ink-soft', 'card', 4.5],
      ['accent', 'paper', 4.5],
      ['accent', 'paper-deep', 4.5],
      ['accent', 'card', 4.5],
      ['accent', 'accent-tint', 4.5],
      ['sage', 'paper', 4.5],
      ['sage', 'paper-deep', 4.5],
      ['sage', 'card', 4.5],
      ['sage', 'sage-tint', 4.5],
      ['sage', 'accent-tint', 4.5],
      ['focus', 'paper', 3],
      ['focus', 'card', 3],
    ];

    for (const [foreground, background, minimum] of pairs) {
      const fg = tokens[foreground];
      const bg = tokens[background];
      expect(fg, foreground).toBeTruthy();
      expect(bg, background).toBeTruthy();
      expect(contrast(fg ?? '', bg ?? ''), `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('keeps the cause jump list sticky, tappable, and clear of its anchors', () => {
    expect(css).toMatch(/\.cause-nav\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.cause-nav a\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.cause-nav a:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
    expect(css).toContain('scroll-margin-top: var(--cause-stick)');
    expect(css).toMatch(
      /\.cause-nav::after\s*\{[^}]*linear-gradient\(to right, transparent, var\(--paper\)\)/,
    );
    expect(css).toContain('scroll-padding-inline-end: 2.75rem');
    expect(css).toMatch(/\.part h3,\s*\n\.field-label\s*\{[^}]*font-variant-caps:\s*all-small-caps/);
  });

  it('self-hosts the Latin woff2 subsets and their OFL texts', () => {
    expect(css).toContain('font-display: swap');
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).toContain('/fonts/Fraunces-latin.woff2');
    expect(css).toContain('/fonts/Fraunces-Italic-latin.woff2');
    expect(css).toContain('/fonts/Literata-latin.woff2');
    expect(css).toContain('/fonts/Literata-Italic-latin.woff2');
    expect(read('public/fonts/OFL-Fraunces.txt')).toContain('SIL Open Font License');
    expect(read('public/fonts/OFL-Literata.txt')).toContain('SIL Open Font License');
    expect(statSync(join(repoRoot, 'public/fonts/Fraunces-latin.woff2')).size).toBeGreaterThan(1000);
    expect(statSync(join(repoRoot, 'public/fonts/Literata-latin.woff2')).size).toBeGreaterThan(1000);
  });
});
