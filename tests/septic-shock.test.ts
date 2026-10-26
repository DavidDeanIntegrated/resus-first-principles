import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasNarration } from '../src/lib/narration.ts';
import {
  chapterRobots,
  chaptersForBuild,
  chaptersForDiscovery,
  includeChapter,
  isBuiltChapter,
} from '../src/lib/publish.ts';
import { caseSchema, declaredDiagramIds } from '../src/lib/schema.ts';
import {
  septicFigureIds,
  septicFigureStem,
  septicFigureText,
  septicInlineFile,
  septicSvg,
  septicSvgSource,
} from '../src/lib/septic-figures.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Accepted draft (sha256). The chapter file is that draft, including its diagram ids. */
const acceptedDraftSha256 = '751585e4c48568b082427ef4780f55ebba0103c5df741113754056924e05390f';

/** sha256 of the Atelier attachments, in chapter-id file names. */
const attachmentSha256: Record<string, string> = {
  'r3-three-septic-circulations.svg': '586c4039ed797269f283b744b31008747d2162c07b7339338a07c7d71c296b4f',
  'r3-three-septic-circulations-print.svg': 'fb2b4267d6b6b8ad3c2507adc446a3bdbe2d04e1d27f29d78bf0dfd036f15dc5',
  'r3-three-septic-circulations.inline.html': 'fa174d705b64d07cd18a1e611237cc3609603efcddbc63a4e1f1c412341a6ea3',
  'r3-where-fluid-goes.svg': '91125d22e76630be960de94f5fbd9bf49c7f2a22d6619809bc61c692e89797e5',
  'r3-where-fluid-goes-print.svg': '9614f1dc14eb0ed6060032e3d14fee16dc264e73a285680933392996a9e61f15',
  'r3-where-fluid-goes.inline.html': '31e60606e5eff87fc54a98fc5fcd306d32025072f0431a3039c9f175f7fec7cd',
  'r3-coherence.svg': '92a67218d792394965ffd692be549fef5d63869f22944e3ded9090a8a1e600c3',
  'r3-coherence-print.svg': '2f65f7307506dab7bc2b0b55cb469b90c156492e9a94549707ad275e7f265c3f',
  'r3-coherence.inline.html': '417e49c4ed6ccd69ff9f1a8c661352cd76c597a6f827a2866889fac226524ea3',
};

const placements: Record<string, string> = {
  'r3-three-septic-circulations': 'three-profiles',
  'shock-fluid-response': 'capacitance-shift',
  'r3-where-fluid-goes': 'where-fluid-goes',
  'r3-coherence': 'micro-flow',
};

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('septic shock chapter', () => {
  const chapterPath = join(repoRoot, 'src/content/cases/septic-shock.json');
  const rawText = readFileSync(chapterPath, 'utf8');
  const raw = JSON.parse(rawText);
  const parsed = caseSchema.safeParse(raw);

  it('is a draft chapter with its own diagram ids and no narration', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.slug).toBe('septic-shock');
    expect(document.title).toBe('Septic Shock: Vascular Tone, Blood Distribution, and Cellular Dysfunction');
    expect(document.contentStatus).toBe('draft');
    expect(document.strict).toBe(true);
    expect(document.diagrams).toEqual([
      'r3-three-septic-circulations',
      'shock-fluid-response',
      'r3-where-fluid-goes',
      'r3-coherence',
    ]);
    expect([...declaredDiagramIds(document)]).toEqual(document.diagrams);
    expect(chapterRobots(document.contentStatus)).toBe('noindex');
    expect(hasNarration(document.slug)).toBe(false);
    expect(rawText).not.toContain('audio');
  });

  it('matches the accepted draft byte for byte', () => {
    expect(sha256(rawText)).toBe(acceptedDraftSha256);
    expect(rawText).not.toMatch(/Search Bot/i);
    expect(rawText).not.toMatch(/checking process/i);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    for (const reference of parsed.data.references ?? []) {
      const note = reference.note ?? '';
      expect(note, reference.id).not.toMatch(/search bot/i);
      expect(note, reference.id).not.toMatch(/checked by/i);
      expect(note, reference.id).not.toMatch(/checking process/i);
    }
  });

  it('places each declared figure on the section named in the chapter', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const attached = parsed.data.principles.flatMap((principle) => {
      if (!principle.diagram || typeof principle.diagram === 'string') return [];
      return [{ section: principle.id, id: principle.diagram.id, caption: principle.diagram.caption }];
    });
    expect(attached.map(({ section, id }) => ({ section, id }))).toEqual([
      { section: 'three-profiles', id: 'r3-three-septic-circulations' },
      { section: 'capacitance-shift', id: 'shock-fluid-response' },
      { section: 'where-fluid-goes', id: 'r3-where-fluid-goes' },
      { section: 'micro-flow', id: 'r3-coherence' },
    ]);
    for (const figure of attached) expect(placements[figure.id]).toBe(figure.section);
    expect(attached[0]?.caption.startsWith('Figure 1. One diagnosis, three circulations.')).toBe(true);
    expect(attached[1]?.caption.startsWith('Figure 2. Reused from the Shock chapter.')).toBe(true);
    expect(attached[2]?.caption.startsWith('Figure 3. Where fluid goes when the capillary leaks.')).toBe(true);
    expect(attached[3]?.caption.startsWith('Figure 4. Loss of hemodynamic coherence')).toBe(true);
    const opening = parsed.data.principles.find((principle) => principle.id === 'three-profiles');
    expect(opening?.title).toBe('One diagnosis, three circulations');
    const fluid = parsed.data.principles.find((principle) => principle.id === 'where-fluid-goes');
    expect(fluid?.title).toBe('Patient L: where 6 liters went');
    const coherence = parsed.data.principles.find((principle) => principle.id === 'micro-flow');
    expect(coherence?.title).toBe('Heterogeneous microvascular flow (observed)');
  });

  it('stores each Atelier drawing byte-for-byte', () => {
    const assetDir = join(repoRoot, 'src/assets/diagrams');
    for (const [name, digest] of Object.entries(attachmentSha256)) {
      expect(sha256(readFileSync(join(assetDir, name)))).toBe(digest);
    }
    for (const id of septicFigureIds) {
      expect(sha256(readFileSync(septicInlineFile(id)))).toBe(attachmentSha256[`${id}.inline.html`]);
      expect(sha256(septicSvgSource(id, 'screen'))).toBe(attachmentSha256[`${id}.svg`]);
      expect(sha256(septicSvgSource(id, 'print'))).toBe(attachmentSha256[`${id}-print.svg`]);
    }
  });

  it('wraps each new drawing as its own screen SVG and print SVG', () => {
    for (const id of septicFigureIds) {
      const screen = septicSvg(id, 'screen');
      const print = septicSvg(id, 'print');
      const screenText = septicFigureText(id, 'screen');
      const printText = septicFigureText(id, 'print');
      const stem = septicFigureStem(id);
      expect(screen).toContain(`>${screenText.title}</title>`);
      expect(screen).toContain(`>${screenText.description}</desc>`);
      expect(print).toContain(`>${printText.title}</title>`);
      expect(print).toContain(`>${printText.description}</desc>`);
      for (const svg of [screen, print]) {
        expect(svg).toContain('role="img"');
        expect(svg).not.toContain('DejaVu');
        expect(svg).toContain('var(--f-text)');
        expect(svg.match(/<svg\b[^>]*>/)?.[0]).not.toContain('width=');
      }
      expect(screen).toContain('class="diagram-screen"');
      expect(print).toContain('class="diagram-print"');
      expect(print).not.toContain('width="100%"');
      const screenIds = [...screen.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
      const printIds = [...print.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
      expect(screenIds.every((elementId) => elementId.includes('-screen-'))).toBe(true);
      expect(printIds.every((elementId) => elementId.includes('-print-'))).toBe(true);
      expect(new Set([...screenIds, ...printIds]).size).toBe(screenIds.length + printIds.length);
      expect(screen).toContain(`aria-labelledby="${stem}-screen-title"`);
      expect(screen).toContain(`aria-describedby="${stem}-screen-desc"`);
      expect(print).toContain(`aria-labelledby="${stem}-print-title"`);
      expect(print).toContain(`aria-describedby="${stem}-print-desc"`);
      expect(screen).toContain(`id="${stem}-screen-ah"`);
      expect(print).toContain(`id="${stem}-print-ah"`);
      expect(print).not.toContain('var(--fig-');
      expect(print).not.toContain('prefers-color-scheme');
      expect(print).toContain('fill:#172d38');
      expect(print).toContain('fill:#ffffff');
      expect(screen).toContain('var(--fig-ink');
      expect(screen).toContain('prefers-color-scheme:dark');
      const rendered = `<figure class="diagram" data-diagram="${id}">${screen}${print}<figcaption>`;
      expect(rendered).toContain('class="diagram-screen"');
      expect(rendered).toContain('class="diagram-print"');
      expect(rendered.match(/<svg\b/g)).toHaveLength(2);
    }
    const figure = readFileSync(join(repoRoot, 'src/components/diagrams/SepticFigure.astro'), 'utf8');
    expect(figure).toContain('data-diagram={id}');
    expect(figure).toContain('septicSvg(id, \'screen\')');
    expect(figure).toContain('septicSvg(id, \'print\')');
    const diagram = readFileSync(join(repoRoot, 'src/components/PrincipleDiagram.astro'), 'utf8');
    expect(diagram).toContain('<SepticFigure id={diagramId} caption={caption} alt={alt} />');
  });

  it('reuses the Shock fluid figure instead of copying its SVG', () => {
    const shock = readFileSync(join(repoRoot, 'src/components/diagrams/ShockFluidResponse.astro'), 'utf8');
    expect(shock).toContain('data-diagram="shock-fluid-response"');
    expect(shock.match(/<svg\b/g)).toHaveLength(2);
    expect(shock).toContain('class="diagram-screen"');
    expect(shock).toContain('class="diagram-print"');
    expect(shock).toContain('aria-labelledby="shock-fluid-response-screen-title"');
    expect(shock).toContain('aria-labelledby="shock-fluid-response-print-title"');
    const diagram = readFileSync(join(repoRoot, 'src/components/PrincipleDiagram.astro'), 'utf8');
    expect(diagram).toContain("'shock-fluid-response': ShockFluidResponse");
    const assets = readdirSync(join(repoRoot, 'src/assets/diagrams'));
    expect(assets.some((name) => name.includes('shock-fluid'))).toBe(false);
    expect(assets.some((name) => name.startsWith('r3-'))).toBe(true);
    expect((septicFigureIds as readonly string[]).includes('shock-fluid-response')).toBe(false);
  });

  it('is excluded from the production build', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    const chapters = [{ slug: document.slug, contentStatus: document.contentStatus }];
    expect(isBuiltChapter(document.contentStatus, {})).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'production' })).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(false);
    expect(includeChapter(document.contentStatus, 'route', {})).toBe(false);
    expect(includeChapter(document.contentStatus, 'index', {})).toBe(false);
    expect(includeChapter(document.contentStatus, 'sitemap', { VERCEL_ENV: 'preview' })).toBe(false);
    expect(chaptersForBuild(chapters, {}).map((entry) => entry.slug)).toEqual([]);
    expect(chaptersForDiscovery(chapters)).toEqual([]);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'preview' })).toBe(true);
    expect(
      isBuiltChapter(document.contentStatus, {
        WORKERS_CI: '1',
        WORKERS_CI_BRANCH: 'cursor/septic-shock-f25f',
      }),
    ).toBe(true);

    const page = join(repoRoot, 'dist/cases/septic-shock/index.html');
    expect(existsSync(page)).toBe(false);
    const index = readFileSync(join(repoRoot, 'dist/index.html'), 'utf8');
    expect(index).not.toContain('/cases/septic-shock');
    expect(index).not.toContain('Septic Shock');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
    expect(index).toContain('href="/cases/shock-pressure-flow"');
  });
});
