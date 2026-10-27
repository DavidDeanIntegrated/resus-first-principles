import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  acidBaseFigureIds,
  acidBaseFigureText,
  acidBaseInlineFile,
  acidBaseSvg,
  acidBaseSvgSource,
} from '../src/lib/acid-base-figures.ts';
import { hasNarration } from '../src/lib/narration.ts';
import {
  chapterRobots,
  chaptersForBuild,
  chaptersForDiscovery,
  includeChapter,
  isBuiltChapter,
} from '../src/lib/publish.ts';
import { caseSchema, declaredDiagramIds } from '../src/lib/schema.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Accepted draft (sha256). The chapter file matches that draft byte for byte. */
const acceptedDraftSha256 = 'd7059a6bad40ac53d3337f305cf3a59f5829cb4555bcdd0634a2479a8cdd43dc';

/** sha256 of the Atelier attachments. The chapter id is the Atelier stem. */
const attachmentSha256: Record<string, string> = {
  'fig-r8-01-two-routes.svg': '645e34bddf916d50657f30462aa682e03bdcf0865edbb25d435cfb8e9b474474',
  'fig-r8-01-two-routes-print.svg': 'ddef0f8e8183d4f0a0a328c1a6cca49c2e00344ff20944bc2bfceb6c38b0142f',
  'fig-r8-01-two-routes.inline.html': '315bc5352e1edd6627118354caea68cffc7c0d528567742dcd6a25d63db0954e',
  'fig-r8-02-expected-vs-observed.svg': 'd919e55660b34cc1c8b5c4c373b518c0b3cc80355ca0befbb2e33f10c2f560d3',
  'fig-r8-02-expected-vs-observed-print.svg': '95d9ed470e0a7aab360dbfa7b12f5979c0a6479b82b81e756aba920ab47c074e',
  'fig-r8-02-expected-vs-observed.inline.html': '3d86637e9b6cb859866278c8382e00f81d8bd698a3eeb1b5c05b3b2c35f2cfe1',
  'fig-r8-03-anion-gap-bookkeeping.svg': '5561968e675b3504fdaceefc099af8623e7646a047dbfcd7fd1673e39af59358',
  'fig-r8-03-anion-gap-bookkeeping-print.svg': '2e8d0943ede68be993c80f89918cea2bee996e4db99c065f249d01a9529c31a0',
  'fig-r8-03-anion-gap-bookkeeping.inline.html': '0dc5c684c7be75cccaac9e4f709055b4b4d7ed6bad3d56ffdba98a0b07acb929',
};

const placements: Record<string, string> = {
  'fig-r8-01-two-routes': 'acid-sources',
  'fig-r8-02-expected-vs-observed': 'expected-compensation',
  'fig-r8-03-anion-gap-bookkeeping': 'anion-gap',
};

const twoRoutesAlt =
  'Two acid sources, carbon dioxide from metabolism as a large daily load and nonvolatile acid from diet and metabolism as a small daily load, flow into a buffer pool of bicarbonate, proteins including hemoglobin, and phosphate, labeled as holding hydrogen ions without removing them. Two exits leave the pool: the lungs, as carbon dioxide, in minutes, drawn as a solid arrow; and the kidneys, as ammonium and titratable acid with new bicarbonate generated, in hours to days, drawn as a dashed arrow. Beneath the pool, the reaction carbon dioxide plus water to carbonic acid to hydrogen ion plus bicarbonate, with the note that the lungs remove the carbon dioxide end. A corner note reads: 7.4 to 7.1 roughly doubles [H+], from 40 to about 80 nmol/L.';

const expectedVsObservedAlt =
  'Three patient cards in one format, each with a primary change bar, an expected compensation bracket and an observed marker. Patient 1, toxic alcohol: low bicarbonate, carbon dioxide driven low by deep fast breathing, observed within expected, with the note that this breathing is keeping pH survivable. Patient 2, acute carbon dioxide retention after an opioid: carbon dioxide up in minutes, bicarbonate barely moved, because the kidneys have not had time. Patient 3, vomiting with an added acidosis: pH near normal, but the observed values do not match a single process, marked as a mismatch that signals a second disorder.';

const anionGapAlt =
  'Paired stacked columns of cations and anions, schematic and not to scale. Sodium stands against chloride, bicarbonate and unmeasured anions, with albumin the largest part of the unmeasured block. Four variants: normal; low albumin, where the baseline gap shrinks and can hide an added acid; gap acidosis, where bicarbonate is replaced by lactate, ketones or toxic alcohol acids and the gap widens; and hyperchloremic acidosis, where bicarbonate is replaced by chloride and the gap is unchanged. Renal dysfunction is noted as both. A small timeline shows the osmolar gap high early and the anion gap rising later in toxic alcohol poisoning.';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('acid-base physiology chapter', () => {
  const chapterPath = join(repoRoot, 'src/content/cases/acid-base-physiology.json');
  const rawText = readFileSync(chapterPath, 'utf8');
  const raw = JSON.parse(rawText);
  const parsed = caseSchema.safeParse(raw);

  it('is a draft chapter with its own diagram ids and no narration', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.slug).toBe('acid-base-physiology');
    expect(document.title).toBe('Acid–Base Physiology: What pH Reveals and What It Hides');
    expect(document.contentStatus).toBe('draft');
    expect(document.strict).toBe(true);
    expect(document.diagrams).toEqual([...acidBaseFigureIds]);
    expect([...declaredDiagramIds(document)]).toEqual(document.diagrams);
    expect(chapterRobots(document.contentStatus)).toBe('noindex');
    expect(hasNarration(document.slug)).toBe(false);
    expect(rawText).not.toContain('audio');
    const audioDir = join(repoRoot, 'public/audio');
    if (existsSync(audioDir)) {
      expect(readdirSync(audioDir).filter((name) => name.includes('acid-base'))).toEqual([]);
    }
  });

  it('matches the accepted draft byte for byte', () => {
    expect(sha256(rawText)).toBe(acceptedDraftSha256);
    expect(rawText.match(/"contentStatus": "[a-z]+"/g)).toEqual(['"contentStatus": "draft"']);
    expect(rawText).not.toContain('Search Bot');
    expect(rawText).not.toContain('(proposal)');
    for (const id of acidBaseFigureIds) expect(rawText.split(id)).toHaveLength(3);
  });

  it('places each declared figure on the section named in the chapter', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const attached = parsed.data.principles.flatMap((principle) => {
      if (!principle.diagram || typeof principle.diagram === 'string') return [];
      return [
        {
          section: principle.id,
          id: principle.diagram.id,
          caption: principle.diagram.caption,
          alt: principle.diagram.alt,
        },
      ];
    });
    expect(attached.map(({ section, id }) => ({ section, id }))).toEqual([
      { section: 'acid-sources', id: 'fig-r8-01-two-routes' },
      { section: 'expected-compensation', id: 'fig-r8-02-expected-vs-observed' },
      { section: 'anion-gap', id: 'fig-r8-03-anion-gap-bookkeeping' },
    ]);
    for (const figure of attached) expect(placements[figure.id]).toBe(figure.section);
    expect(attached.map((figure) => figure.caption)).toEqual([
      'Where acid comes from, where it is held, and how it leaves',
      'The same pH, different states: compare compensation with what is expected',
      'The anion gap is bookkeeping, and albumin fills most of it',
    ]);
    expect(attached.map((figure) => figure.alt)).toEqual([twoRoutesAlt, expectedVsObservedAlt, anionGapAlt]);
    for (const reference of parsed.data.references ?? []) {
      const note = reference.note ?? '';
      expect(note).not.toMatch(/Search Bot/i);
      expect(note).not.toMatch(/check/i);
    }
    const sources = parsed.data.principles.find((principle) => principle.id === 'acid-sources');
    expect(sources?.title).toBe('Two kinds of acid, two routes out, two time scales');
    const compensation = parsed.data.principles.find((principle) => principle.id === 'expected-compensation');
    expect(compensation?.title).toBe('Expected compensation, and how a second disorder shows itself');
    const gap = parsed.data.principles.find((principle) => principle.id === 'anion-gap');
    expect(gap?.title).toBe('The anion gap is bookkeeping');
  });

  it('links only to published chapters', () => {
    const linked = [...new Set([...rawText.matchAll(/\/cases\/([a-z0-9-]+)/g)].map((match) => match[1] ?? ''))];
    expect(linked).toEqual(['physiologically-difficult-airway']);
    for (const slug of linked) {
      expect(slug).not.toBe('acid-base-physiology');
      const path = join(repoRoot, 'src/content/cases', `${slug}.json`);
      expect(existsSync(path), slug).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf8')).contentStatus, slug).toBe('published');
    }
  });

  it('stores each Atelier drawing byte-for-byte', () => {
    const assetDir = join(repoRoot, 'src/assets/diagrams');
    for (const [name, digest] of Object.entries(attachmentSha256)) {
      expect(sha256(readFileSync(join(assetDir, name)))).toBe(digest);
    }
    for (const id of acidBaseFigureIds) {
      expect(sha256(readFileSync(acidBaseInlineFile(id)))).toBe(attachmentSha256[`${id}.inline.html`]);
      expect(sha256(acidBaseSvgSource(id, 'screen'))).toBe(attachmentSha256[`${id}.svg`]);
      expect(sha256(acidBaseSvgSource(id, 'print'))).toBe(attachmentSha256[`${id}-print.svg`]);
      expect(readFileSync(acidBaseInlineFile(id), 'utf8')).toBe(
        `${acidBaseSvgSource(id, 'screen')}\n${acidBaseSvgSource(id, 'print')}\n`,
      );
    }
  });

  it('wraps each new drawing as its own screen SVG and print SVG', () => {
    for (const id of acidBaseFigureIds) {
      const screen = acidBaseSvg(id, 'screen');
      const print = acidBaseSvg(id, 'print');
      const screenText = acidBaseFigureText(id, 'screen');
      const printText = acidBaseFigureText(id, 'print');
      expect(screen).toContain(`>${screenText.title}</title>`);
      expect(screen).toContain(`>${screenText.description}</desc>`);
      expect(print).toContain(`>${printText.title}</title>`);
      expect(print).toContain(`>${printText.description}</desc>`);
      for (const svg of [screen, print]) {
        expect(svg).toContain('role="img"');
        expect(svg).not.toContain('DejaVu');
        expect(svg).toContain('var(--f-text)');
        expect(svg).toContain('var(--fig-ink,#172d38)');
        expect(svg).not.toContain('prefers-color-scheme');
        const open = svg.match(/<svg\b[^>]*>/)?.[0];
        expect(open).not.toContain('width=');
        expect(open).not.toContain('height=');
      }
      expect(screen).toContain('class="diagram-screen"');
      expect(print).toContain('class="diagram-print"');
      const screenIds = [...screen.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
      const printIds = [...print.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
      expect(screenIds.every((elementId) => elementId.startsWith(`${id}-screen-`))).toBe(true);
      expect(printIds.every((elementId) => elementId.startsWith(`${id}-print-`))).toBe(true);
      expect(new Set([...screenIds, ...printIds]).size).toBe(screenIds.length + printIds.length);
      expect(screen).toContain(`aria-labelledby="${id}-screen-title"`);
      expect(screen).toContain(`aria-describedby="${id}-screen-desc"`);
      expect(print).toContain(`aria-labelledby="${id}-print-title"`);
      expect(print).toContain(`aria-describedby="${id}-print-desc"`);
      expect(screen).toContain(`id="${id}-screen-ar"`);
      expect(print).toContain(`id="${id}-print-ar"`);

      // The shared stylesheet is scoped to each copy: every class and every rule.
      for (const [variant, svg] of [
        ['screen', screen],
        ['print', print],
      ] as const) {
        const scope = `${id}-${variant}`;
        const style = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
        const selectors = [...style.matchAll(/(?:^|})([^{}]+)\{/g)].flatMap((match) => (match[1] ?? '').split(','));
        expect(selectors.length).toBeGreaterThan(0);
        for (const selector of selectors) {
          expect(
            selector.startsWith(`.${scope}-`) || selector.startsWith(`svg[aria-labelledby="${scope}-title"] `),
            selector,
          ).toBe(true);
        }
        const body = svg.replace(/<svg\b[^>]*>/, '');
        for (const match of body.matchAll(/\bclass="([^"]*)"/g)) {
          for (const token of (match[1] ?? '').split(/\s+/)) expect(token.startsWith(`${scope}-`), token).toBe(true);
        }
      }

      const rendered = `<figure class="diagram" data-diagram="${id}">${screen}${print}<figcaption>`;
      expect(rendered).toContain('class="diagram-screen"');
      expect(rendered).toContain('class="diagram-print"');
      expect(rendered.match(/<svg\b/g)).toHaveLength(2);
    }
    const figure = readFileSync(join(repoRoot, 'src/components/diagrams/AcidBaseFigure.astro'), 'utf8');
    expect(figure).toContain('data-diagram={id}');
    expect(figure).toContain("acidBaseSvg(id, 'screen')");
    expect(figure).toContain("acidBaseSvg(id, 'print')");
    const diagram = readFileSync(join(repoRoot, 'src/components/PrincipleDiagram.astro'), 'utf8');
    expect(diagram).toContain('<AcidBaseFigure id={diagramId} caption={caption} alt={alt} />');
  });

  it('is excluded from the production build and present on preview builds', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    const chapters = [{ slug: document.slug, contentStatus: document.contentStatus }];
    expect(isBuiltChapter(document.contentStatus, {})).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'production' })).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'preview' })).toBe(true);
    expect(
      isBuiltChapter(document.contentStatus, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'chapter/acid-base-physiology' }),
    ).toBe(true);
    expect(includeChapter(document.contentStatus, 'route', { VERCEL_ENV: 'preview' })).toBe(true);
    expect(includeChapter(document.contentStatus, 'index', { VERCEL_ENV: 'preview' })).toBe(true);
    expect(includeChapter(document.contentStatus, 'sitemap', { VERCEL_ENV: 'preview' })).toBe(false);
    expect(chaptersForBuild(chapters, {})).toEqual([]);
    expect(chaptersForBuild(chapters, { VERCEL_ENV: 'preview' }).map((entry) => entry.slug)).toEqual([
      'acid-base-physiology',
    ]);
    expect(chaptersForDiscovery(chapters)).toEqual([]);

    expect(existsSync(join(repoRoot, 'dist/cases/acid-base-physiology'))).toBe(false);
    const index = readFileSync(join(repoRoot, 'dist/index.html'), 'utf8');
    expect(index).not.toContain('acid-base-physiology');
    expect(index).not.toContain('Acid–Base Physiology: What pH Reveals and What It Hides');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
  });
});
