import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://www.resusfirstprinciples.io';
const imageUrl = `${origin}/og-image.png`;
const imageAlt = 'Resus First Principles logo mark and title.';
const siteDescription =
  'Resuscitation explained from the physiology up: why pressure, flow and oxygen delivery behave as they do, and what that tells you at the bedside.';
const caseTitle = 'Adult cardiac arrest | Resus First Principles';
const caseDescription =
  'Why compressions create flow, what a pause costs, and how the coronary pressure gradient decides whether the arrested heart can recover.';
const caseSummary =
  'Adult cardiac arrest resuscitation from first principles, aligned with the 2025 American Heart Association adult basic life support, advanced life support, and post-cardiac arrest care guidelines. This is study material. Care follows the current guideline and local protocol.';

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function headOf(html: string): string {
  const start = html.indexOf('<head>');
  const end = html.indexOf('</head>');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

function tags(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function meta(head: string, key: 'property' | 'name', value: string): string {
  const found = tags(head, 'meta').filter((tag) => attr(tag, key) === value);
  expect(found, `${key}=${value}`).toHaveLength(1);
  return found[0] ?? '';
}

function link(head: string, rel: string, extra?: (tag: string) => boolean): string {
  const found = tags(head, 'link').filter((tag) => attr(tag, 'rel') === rel && (extra ? extra(tag) : true));
  expect(found, `link ${rel}`).toHaveLength(1);
  return found[0] ?? '';
}

describe('link previews', () => {
  it('puts absolute preview tags on the home page and the adult cardiac arrest case', () => {
    const home = read('dist/index.html');
    const casePage = read('dist/cases/adult-cardiac-arrest/index.html');
    const homeHead = headOf(home);
    const caseHead = headOf(casePage);

    expectPreview(homeHead, {
      type: 'website',
      url: `${origin}/`,
      title: 'Resus First Principles',
      description: siteDescription,
    });
    expectPreview(caseHead, {
      type: 'article',
      url: `${origin}/cases/adult-cardiac-arrest/`,
      title: caseTitle,
      description: caseDescription,
    });

    expect(homeHead).not.toContain('https://resusfirstprinciples.io');
    expect(caseHead).not.toContain('https://resusfirstprinciples.io');
    expect(homeHead).not.toContain('Static first-principles teaching pages');
    expect(caseHead).not.toContain(caseSummary);
    expect(caseHead).not.toContain('Shock: Pressure, Flow');

    expect(home).toContain('Each resuscitation case is split into pathophysiology principles');
    expect(casePage).toContain(`<h1>Adult cardiac arrest</h1>`);
    expect(casePage).toContain(`<p class="lede">${caseSummary}</p>`);
    expect(casePage.slice(casePage.indexOf('<body>'))).not.toContain(caseDescription);

    const missingHead = headOf(read('dist/404.html'));
    expect(attr(link(missingHead, 'canonical'), 'href')).toBe(`${origin}/404`);
    expect(attr(meta(missingHead, 'property', 'og:type'), 'content')).toBe('website');
  });

  it('publishes a 1200 by 630 share image', () => {
    const bytes = readFileSync(join(repoRoot, 'public/og-image.png'));
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(createHash('sha256').update(bytes).digest('hex').startsWith('38844bfd')).toBe(true);
    expect(readFileSync(join(repoRoot, 'dist/og-image.png')).equals(bytes)).toBe(true);
  });
});

function expectPreview(
  head: string,
  page: { type: 'website' | 'article'; url: string; title: string; description: string },
) {
  expect(attr(link(head, 'canonical'), 'href')).toBe(page.url);
  expect(attr(meta(head, 'name', 'description'), 'content')).toBe(page.description);
  expect(attr(meta(head, 'property', 'og:type'), 'content')).toBe(page.type);
  expect(attr(meta(head, 'property', 'og:site_name'), 'content')).toBe('Resus First Principles');
  expect(attr(meta(head, 'property', 'og:title'), 'content')).toBe(page.title);
  expect(attr(meta(head, 'property', 'og:description'), 'content')).toBe(page.description);
  expect(attr(meta(head, 'property', 'og:url'), 'content')).toBe(page.url);
  expect(attr(meta(head, 'property', 'og:image'), 'content')).toBe(imageUrl);
  expect(attr(meta(head, 'property', 'og:image:width'), 'content')).toBe('1200');
  expect(attr(meta(head, 'property', 'og:image:height'), 'content')).toBe('630');
  expect(attr(meta(head, 'property', 'og:image:alt'), 'content')).toBe(imageAlt);
  expect(attr(meta(head, 'name', 'twitter:card'), 'content')).toBe('summary_large_image');
  expect(attr(meta(head, 'name', 'twitter:title'), 'content')).toBe(page.title);
  expect(attr(meta(head, 'name', 'twitter:description'), 'content')).toBe(page.description);
  expect(attr(meta(head, 'name', 'twitter:image'), 'content')).toBe(imageUrl);
  expect(head).toContain(`<title>${page.title}</title>`);

  const svg = link(head, 'icon', (tag) => attr(tag, 'type') === 'image/svg+xml');
  expect(attr(svg, 'href')).toBe('/favicon.svg');
  const png = link(head, 'icon', (tag) => attr(tag, 'type') === 'image/png');
  expect(attr(png, 'href')).toBe('/favicon-32.png');
  expect(attr(png, 'sizes')).toBe('32x32');
  const apple = link(head, 'apple-touch-icon');
  expect(attr(apple, 'href')).toBe('/apple-touch-icon.png');

  const theme = tags(head, 'meta').filter((tag) => attr(tag, 'name') === 'theme-color');
  expect(theme.map((tag) => [attr(tag, 'content'), attr(tag, 'media')])).toEqual([
    ['#fbf6ee', '(prefers-color-scheme: light)'],
    ['#1c1915', '(prefers-color-scheme: dark)'],
  ]);
}
