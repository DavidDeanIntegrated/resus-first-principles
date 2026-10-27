import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  asthmaFigureIds,
  asthmaFigureText,
  asthmaInlineFile,
  asthmaSvg,
  asthmaSvgSource,
} from '../src/lib/asthma-figures.ts';
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
const contentDirectory = join(repoRoot, 'src/content/cases');

/** Accepted draft (sha256). The chapter file matches that draft byte for byte. */
const acceptedDraftSha256 = '1dd41f99658edbb70460017f48054231d5bae3dad06fccdc837d3958f050af8e';

/** sha256 of the Atelier attachments. The chapter id is the Atelier stem. */
const attachmentSha256: Record<string, string> = {
  'fig-r7-01-equal-pressure-point.svg': 'abc412ee899a56db12a898c32e142e0def8ec1b4626a276f1f053ed6bfcff561',
  'fig-r7-01-equal-pressure-point-print.svg': 'e0ac0207461721e8f915b15111d60c9fc18fdd3948f8d900ef27536e964ce28b',
  'fig-r7-01-equal-pressure-point.inline.html': '2c19d160f2398368b8c8316328f76c29ba00a2d5f4383c18d606c7183b4ed621',
  'fig-r7-02-breath-stacking.svg': '88634c23d0805ffdb414c96e040b67d66bc3fd432fadc165b5a07b681646ca41',
  'fig-r7-02-breath-stacking-print.svg': '61f43ed199aba0b9da26c314a7bacebbdbe09a894af1dc8e16a9eed433af0c0f',
  'fig-r7-02-breath-stacking.inline.html': '557023fb6847711fb3bd6ef8de1f0de56c0882b4622fbdc115e55f629feeda40',
  'fig-r7-03-more-time-to-exhale.svg': 'f19061e94d66e5eeda025d5d55e8508536b20492326b379c263027c610787a6b',
  'fig-r7-03-more-time-to-exhale-print.svg': '035c115eab0a6f14a33f143878f5577f44cd00c531fe395f0f5ecdaf63d8ca2e',
  'fig-r7-03-more-time-to-exhale.inline.html': '0a5da4badab3f6d7d2f5fdbbe6c6c6830459a1713b8254e43a19505bf466f14b',
};

const placements: Record<string, string> = {
  'fig-r7-01-equal-pressure-point': 'equal-pressure-point',
  'fig-r7-02-breath-stacking': 'hyperinflation',
  'fig-r7-03-more-time-to-exhale': 'time-to-exhale',
};

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Every string in the chapter, wherever it sits. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function chapterStatuses(): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const name of readdirSync(contentDirectory)) {
    if (!name.endsWith('.json')) continue;
    const document = JSON.parse(readFileSync(join(contentDirectory, name), 'utf8'));
    statuses.set(document.slug, document.contentStatus);
  }
  return statuses;
}

describe('life-threatening asthma chapter', () => {
  const chapterPath = join(contentDirectory, 'life-threatening-asthma.json');
  const rawText = readFileSync(chapterPath, 'utf8');
  const raw = JSON.parse(rawText);
  const parsed = caseSchema.safeParse(raw);

  it('is a draft chapter with its own diagram ids and no narration', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.slug).toBe('life-threatening-asthma');
    expect(document.title).toBe('Life-Threatening Asthma: When the Lung Cannot Empty');
    expect(document.contentStatus).toBe('draft');
    expect(document.strict).toBe(true);
    expect(document.diagrams).toEqual([...asthmaFigureIds]);
    expect([...declaredDiagramIds(document)]).toEqual(document.diagrams);
    expect(chapterRobots(document.contentStatus)).toBe('noindex');
    expect(hasNarration(document.slug)).toBe(false);
    expect(rawText).not.toContain('audio');
  });

  it('matches the accepted draft byte for byte', () => {
    expect(rawText.match(/"contentStatus": "[a-z]+"/g)).toEqual(['"contentStatus": "draft"']);
    expect(sha256(rawText)).toBe(acceptedDraftSha256);
    expect(rawText).not.toContain('Search Bot');
    expect(rawText).not.toContain('(proposal)');
    for (const id of asthmaFigureIds) {
      expect(rawText.split(id)).toHaveLength(3);
    }
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
      { section: 'equal-pressure-point', id: 'fig-r7-01-equal-pressure-point' },
      { section: 'hyperinflation', id: 'fig-r7-02-breath-stacking' },
      { section: 'time-to-exhale', id: 'fig-r7-03-more-time-to-exhale' },
    ]);
    for (const figure of attached) {
      expect(placements[figure.id]).toBe(figure.section);
      expect(figure.caption.length).toBeGreaterThan(0);
      expect(figure.alt.length).toBeGreaterThan(0);
    }
    expect(attached.map((figure) => figure.caption)).toEqual([
      'Why pushing harder stops helping: pressure along a narrowed airway',
      'When the next breath comes before the lung has emptied',
      'Why more time to exhale works, and what it costs',
    ]);
    for (const reference of parsed.data.references ?? []) {
      const note = reference.note ?? '';
      expect(note).not.toMatch(/Search Bot/i);
    }
  });

  it('links only to published chapters', () => {
    const statuses = chapterStatuses();
    const links = strings(raw).flatMap((text) =>
      [...text.matchAll(/\]\((\/cases\/[^)#]+)(#[^)]*)?\)/g)].map((match) => match[1] ?? ''),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const slug = link.replace(/^\/cases\//, '');
      expect(slug).not.toBe('life-threatening-asthma');
      expect(statuses.get(slug)).toBe('published');
    }
    expect(new Set(links)).toEqual(
      new Set(['/cases/acute-respiratory-failure', '/cases/physiologically-difficult-airway', '/cases/septic-shock']),
    );
    expect(strings(raw).some((text) => /\]\((?!\/cases\/|#|https?:)/.test(text))).toBe(false);
  });

  it('stores each Atelier drawing byte-for-byte', () => {
    const assetDir = join(repoRoot, 'src/assets/diagrams');
    for (const [name, digest] of Object.entries(attachmentSha256)) {
      expect(sha256(readFileSync(join(assetDir, name)))).toBe(digest);
    }
    for (const id of asthmaFigureIds) {
      expect(sha256(readFileSync(asthmaInlineFile(id)))).toBe(attachmentSha256[`${id}.inline.html`]);
      expect(sha256(asthmaSvgSource(id, 'screen'))).toBe(attachmentSha256[`${id}.svg`]);
      expect(sha256(asthmaSvgSource(id, 'print'))).toBe(attachmentSha256[`${id}-print.svg`]);
      expect(readFileSync(asthmaInlineFile(id), 'utf8')).toBe(
        `${asthmaSvgSource(id, 'screen')}\n${asthmaSvgSource(id, 'print')}\n`,
      );
    }
  });

  it('wraps each new drawing as its own screen SVG and print SVG', () => {
    for (const id of asthmaFigureIds) {
      const screen = asthmaSvg(id, 'screen');
      const print = asthmaSvg(id, 'print');
      const screenText = asthmaFigureText(id, 'screen');
      const printText = asthmaFigureText(id, 'print');
      expect(screen).toContain(`>${screenText.title}</title>`);
      expect(screen).toContain(`>${screenText.description}</desc>`);
      expect(print).toContain(`>${printText.title}</title>`);
      expect(print).toContain(`>${printText.description}</desc>`);
      for (const svg of [screen, print]) {
        expect(svg).toContain('role="img"');
        expect(svg).not.toContain('DejaVu');
        expect(svg).toContain('var(--f-text)');
        expect(svg).toContain('var(--f-display)');
        expect(svg.match(/<svg\b[^>]*>/)?.[0]).not.toContain('width=');
        expect(svg.match(/<svg\b[^>]*>/)?.[0]).not.toContain('height=');
        expect(svg).toContain('var(--fig-ink,#172d38)');
        expect(svg).not.toContain('prefers-color-scheme');
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
      const rendered = `<figure class="diagram" data-diagram="${id}">${screen}${print}<figcaption>`;
      expect(rendered.match(/<svg\b/g)).toHaveLength(2);
    }
    const figure = readFileSync(join(repoRoot, 'src/components/diagrams/AsthmaFigure.astro'), 'utf8');
    expect(figure).toContain('data-diagram={id}');
    expect(figure).toContain("asthmaSvg(id, 'screen')");
    expect(figure).toContain("asthmaSvg(id, 'print')");
    const diagram = readFileSync(join(repoRoot, 'src/components/PrincipleDiagram.astro'), 'utf8');
    expect(diagram).toContain('<AsthmaFigure id={diagramId} caption={caption} alt={alt} />');
  });

  it('is excluded from the production build and present in preview', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    const chapters = [{ slug: document.slug, contentStatus: document.contentStatus }];
    expect(isBuiltChapter(document.contentStatus, {})).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'production' })).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'preview' })).toBe(true);
    expect(
      isBuiltChapter(document.contentStatus, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'chapter/life-threatening-asthma' }),
    ).toBe(true);
    expect(includeChapter(document.contentStatus, 'route', {})).toBe(false);
    expect(includeChapter(document.contentStatus, 'index', {})).toBe(false);
    expect(includeChapter(document.contentStatus, 'route', { VERCEL_ENV: 'preview' })).toBe(true);
    expect(includeChapter(document.contentStatus, 'index', { VERCEL_ENV: 'preview' })).toBe(true);
    for (const surface of ['sitemap', 'feed', 'search'] as const) {
      expect(includeChapter(document.contentStatus, surface, { VERCEL_ENV: 'preview' })).toBe(false);
    }
    expect(chaptersForBuild(chapters, {})).toEqual([]);
    expect(chaptersForBuild(chapters, { VERCEL_ENV: 'preview' }).map((entry) => entry.slug)).toEqual([
      'life-threatening-asthma',
    ]);
    expect(chaptersForDiscovery(chapters)).toEqual([]);

    // `npm run build` sets no preview signal, so dist is the production build.
    expect(existsSync(join(repoRoot, 'dist/cases/life-threatening-asthma/index.html'))).toBe(false);
    const index = readFileSync(join(repoRoot, 'dist/index.html'), 'utf8');
    expect(index).not.toContain('/cases/life-threatening-asthma');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
  });
});
