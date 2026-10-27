import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { airwayFigureIds, airwayFigureText, airwaySvg } from '../src/lib/airway-figures.ts';
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

const placements: Record<string, string> = {
  'fig-r2-02-what-intubation-removes': 'pda-what-changes',
  'fig-r2-01-apnoea-clock': 'o2-clock',
  'shock-circulation-gradients': 'hypotension',
  'fig-r2-03-rv-spiral': 'rv-perfusion',
};

describe('physiologically difficult airway chapter', () => {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, 'src/content/cases/physiologically-difficult-airway.json'), 'utf8'),
  );
  const parsed = caseSchema.safeParse(raw);

  it('is a published chapter with its own diagram ids and no narration', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.slug).toBe('physiologically-difficult-airway');
    expect(document.contentStatus).toBe('published');
    expect(document.strict).toBe(true);
    expect(document.diagrams).toEqual([
      'fig-r2-02-what-intubation-removes',
      'fig-r2-01-apnoea-clock',
      'shock-circulation-gradients',
      'fig-r2-03-rv-spiral',
    ]);
    expect([...declaredDiagramIds(document)]).toEqual(document.diagrams);
    expect(chapterRobots(document.contentStatus)).toBeNull();
    expect(hasNarration(document.slug)).toBe(false);
  });

  it('places each declared figure on the section named in the chapter', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const attached = parsed.data.principles.flatMap((principle) => {
      if (!principle.diagram || typeof principle.diagram === 'string') return [];
      return [{ section: principle.id, id: principle.diagram.id }];
    });
    expect(attached).toEqual([
      { section: 'pda-what-changes', id: 'fig-r2-02-what-intubation-removes' },
      { section: 'o2-clock', id: 'fig-r2-01-apnoea-clock' },
      { section: 'hypotension', id: 'shock-circulation-gradients' },
      { section: 'rv-perfusion', id: 'fig-r2-03-rv-spiral' },
    ]);
    for (const figure of attached) expect(placements[figure.id]).toBe(figure.section);
  });

  it('wraps each new drawing as its own screen SVG and print SVG', () => {
    for (const id of airwayFigureIds) {
      const screen = airwaySvg(id, 'screen');
      const print = airwaySvg(id, 'print');
      const screenText = airwayFigureText(id, 'screen');
      const printText = airwayFigureText(id, 'print');
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
      const screenTitle = `${id}-screen-title`;
      const screenDesc = `${id}-screen-desc`;
      const printTitle = `${id}-print-title`;
      const printDesc = `${id}-print-desc`;
      expect(screen).toContain(`aria-labelledby="${screenTitle}"`);
      expect(screen).toContain(`aria-describedby="${screenDesc}"`);
      expect(print).toContain(`aria-labelledby="${printTitle}"`);
      expect(print).toContain(`aria-describedby="${printDesc}"`);
      expect(screen).toContain(`id="${id}-screen-ah"`);
      expect(print).toContain(`id="${id}-print-ah"`);
      expect(print).not.toContain('var(--fig-');
      expect(print).not.toContain('prefers-color-scheme');
      expect(print).toContain('fill:#172d38');
      expect(screen).toContain('var(--fig-ink');
      expect(screen).toContain('prefers-color-scheme:dark');
    }
  });

  it('reuses the Shock circulation figure instead of copying its SVG', () => {
    const shock = readFileSync(
      join(repoRoot, 'src/components/diagrams/ShockCirculationGradients.astro'),
      'utf8',
    );
    expect(shock).toContain('data-diagram="shock-circulation-gradients"');
    expect(shock.match(/<svg\b/g)).toHaveLength(2);
    expect(shock).toContain('class="diagram-screen"');
    expect(shock).toContain('class="diagram-print"');
    expect(shock).toContain('aria-labelledby="shock-circulation-gradients-screen-title"');
    expect(shock).toContain('aria-labelledby="shock-circulation-gradients-print-title"');
    const diagram = readFileSync(join(repoRoot, 'src/components/PrincipleDiagram.astro'), 'utf8');
    expect(diagram).toContain("'shock-circulation-gradients': ShockCirculationGradients");
    const assets = readdirSync(join(repoRoot, 'src/assets/diagrams'));
    expect(assets.some((name) => name.includes('shock-circulation'))).toBe(false);
    expect(assets.some((name) => name.startsWith('fig-r2-'))).toBe(true);
    expect((airwayFigureIds as readonly string[]).includes('shock-circulation-gradients')).toBe(false);
  });

  it('is included in the production build', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    const status = document.contentStatus;
    const production = [{ slug: document.slug, contentStatus: document.contentStatus }];
    expect(isBuiltChapter(status, {})).toBe(true);
    expect(isBuiltChapter(status, { VERCEL_ENV: 'production' })).toBe(true);
    expect(isBuiltChapter(status, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(true);
    expect(includeChapter(status, 'route', {})).toBe(true);
    expect(includeChapter(status, 'index', {})).toBe(true);
    expect(includeChapter(status, 'sitemap', { VERCEL_ENV: 'preview' })).toBe(true);
    expect(chaptersForBuild(production, {}).map((entry) => entry.slug)).toEqual([
      'physiologically-difficult-airway',
    ]);
    expect(chaptersForDiscovery(production).map((entry) => entry.slug)).toEqual([
      'physiologically-difficult-airway',
    ]);

    const page = join(repoRoot, 'dist/cases/physiologically-difficult-airway/index.html');
    expect(existsSync(page)).toBe(true);
    const index = readFileSync(join(repoRoot, 'dist/index.html'), 'utf8');
    expect(index).toContain('/cases/physiologically-difficult-airway');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
    expect(index).toContain('href="/cases/shock-pressure-flow"');
  });
});
