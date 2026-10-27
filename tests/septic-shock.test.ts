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
const acceptedDraftSha256 = 'a53a0c60925d31873e6ee58ef899557dc2a70f65f94f05386f038a897598cc3d';

/** sha256 of the Atelier attachments, in chapter-id file names. */
const attachmentSha256: Record<string, string> = {
  'r3-three-septic-circulations.svg': '1cf507277d0ad7e912ff16a824f8336afe19f9b839230c8f3c2f9f5addb75339',
  'r3-three-septic-circulations-print.svg': '6e97b4fd7ac325c17ef76500d3d3d5c932b5058ac245a5bce65ccc97d5be4d71',
  'r3-three-septic-circulations.inline.html': 'b918d7ba9b609bf368e551fbae190c82ba1a37c39d7bcb4438b0d358a03124b9',
  'r3-where-fluid-goes.svg': '139b8d1e673ed0eb3323ec4fee9b6b322f57feffa896017fac72b9824235c1c3',
  'r3-where-fluid-goes-print.svg': 'b2fcdca881ed2e68d1d049efc371efdda7dd0df2c677b35ae849306e365265bd',
  'r3-where-fluid-goes.inline.html': '0d882b5f8e82e1b5f3abcec26837eecf7873eabd4af43e2aac6999c2b86affb3',
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

  it('is a published chapter with its own diagram ids and no narration', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.slug).toBe('septic-shock');
    expect(document.title).toBe('Septic Shock: Vascular Tone, Blood Distribution, and Cellular Dysfunction');
    expect(document.contentStatus).toBe('published');
    expect(document.strict).toBe(true);
    expect(document.diagrams).toEqual([
      'r3-three-septic-circulations',
      'shock-fluid-response',
      'r3-where-fluid-goes',
      'r3-coherence',
    ]);
    expect([...declaredDiagramIds(document)]).toEqual(document.diagrams);
    expect(chapterRobots(document.contentStatus)).toBeNull();
    expect(hasNarration(document.slug)).toBe(false);
    expect(rawText).not.toContain('audio');
  });

  it('matches the accepted draft byte for byte', () => {
    // The accepted draft, with only contentStatus flipped from "draft" to "published" at Ship.
    expect(rawText.match(/"contentStatus": "[a-z]+"/g)).toEqual(['"contentStatus": "published"']);
    expect(sha256(rawText.replace('"contentStatus": "published"', '"contentStatus": "draft"'))).toBe(acceptedDraftSha256);
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
    expect(attached[2]?.caption.startsWith('Figure 3. Where given fluid goes in sepsis.')).toBe(true);
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

  it('is included in the production build', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    const production = [{ slug: document.slug, contentStatus: document.contentStatus }];
    expect(isBuiltChapter(document.contentStatus, {})).toBe(true);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'production' })).toBe(true);
    expect(isBuiltChapter(document.contentStatus, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(true);
    expect(includeChapter(document.contentStatus, 'route', {})).toBe(true);
    expect(includeChapter(document.contentStatus, 'index', {})).toBe(true);
    expect(includeChapter(document.contentStatus, 'sitemap', { VERCEL_ENV: 'preview' })).toBe(true);
    expect(chaptersForBuild(production, {}).map((entry) => entry.slug)).toEqual(['septic-shock']);
    expect(chaptersForDiscovery(production).map((entry) => entry.slug)).toEqual(['septic-shock']);

    const page = join(repoRoot, 'dist/cases/septic-shock/index.html');
    expect(existsSync(page)).toBe(true);
    const index = readFileSync(join(repoRoot, 'dist/index.html'), 'utf8');
    expect(index).toContain('/cases/septic-shock');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
    expect(index).toContain('href="/cases/shock-pressure-flow"');
  });
});
