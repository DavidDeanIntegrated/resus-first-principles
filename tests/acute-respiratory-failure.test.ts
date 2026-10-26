import { existsSync, readFileSync } from 'node:fs';
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
import {
  respiratoryFigureIds,
  respiratoryFigureText,
  respiratorySvg,
  type RespiratoryFigureId,
} from '../src/lib/respiratory-figures.ts';
import { caseSchema, declaredDiagramIds } from '../src/lib/schema.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const placements: Record<RespiratoryFigureId, string> = {
  'r1-four-mechanisms': 'other-mechanisms',
  'r1-alveolar-ventilation': 'alveolar-ventilation',
  'r1-load-capacity': 'load-capacity',
};

describe('acute respiratory failure chapter', () => {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, 'src/content/cases/acute-respiratory-failure.json'), 'utf8'),
  );
  const parsed = caseSchema.safeParse(raw);

  it('is a draft chapter with its own diagram ids', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.slug).toBe('acute-respiratory-failure');
    expect(document.title).toBe('Acute Respiratory Failure: Getting Oxygen In and Carbon Dioxide Out');
    expect(document.contentStatus).toBe('draft');
    expect(document.strict).toBe(true);
    expect(document.diagrams).toEqual([...respiratoryFigureIds]);
    expect([...declaredDiagramIds(document)]).toEqual([...respiratoryFigureIds]);
    expect(chapterRobots(document.contentStatus)).toBe('noindex');
    expect(hasNarration(document.slug)).toBe(false);
  });

  it('attaches each figure to the section its drawing belongs to, keeping the SVG title and description', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const attached = parsed.data.principles.flatMap((principle) => {
      if (!principle.diagram || typeof principle.diagram === 'string') return [];
      return [{ section: principle.id, ...principle.diagram }];
    });
    expect(attached.map((figure) => figure.id)).toEqual([
      'r1-alveolar-ventilation',
      'r1-four-mechanisms',
      'r1-load-capacity',
    ]);
    for (const figure of attached) {
      expect(placements[figure.id as RespiratoryFigureId]).toBe(figure.section);
      const text = respiratoryFigureText(figure.id as RespiratoryFigureId);
      expect(figure.caption).toBe(text.title);
      expect(figure.alt).toBe(text.description);
    }
    const mechanisms = parsed.data.principles.find((principle) => principle.id === 'other-mechanisms');
    expect(mechanisms?.title).toBe('Diffusion limitation and low inspired oxygen');
    expect(mechanisms?.table?.caption).toContain('four mechanisms of hypoxaemia');
    const ventilation = parsed.data.principles.find((principle) => principle.id === 'alveolar-ventilation');
    expect(ventilation?.workedExample?.id).toBe('same-ve-example');
  });

  it('wraps each drawing as a screen SVG and a print SVG without changing its words', () => {
    for (const id of respiratoryFigureIds) {
      const text = respiratoryFigureText(id);
      const screen = respiratorySvg(id, 'screen');
      const print = respiratorySvg(id, 'print');
      for (const svg of [screen, print]) {
        expect(svg).toContain(`>${text.title}</title>`);
        expect(svg).toContain(`>${text.description}</desc>`);
        expect(svg).toContain('role="img"');
        expect(svg).not.toContain('DejaVu');
        expect(svg).toContain('var(--f-text)');
      }
      expect(screen).toContain('class="diagram-screen"');
      expect(print).toContain('class="diagram-print"');
      expect(screen).toContain(`aria-labelledby="${id}-screen-`);
      expect(screen).toContain(`aria-describedby="${id}-screen-`);
      expect(print).toContain(`aria-labelledby="${id}-print-`);
      expect(print).toContain(`aria-describedby="${id}-print-`);
      const screenIds = [...screen.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      const printIds = [...print.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      expect(new Set(screenIds).size).toBe(screenIds.length);
      expect(new Set([...screenIds, ...printIds]).size).toBe(screenIds.length + printIds.length);
    }
  });

  it('is excluded from the production build', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    const production = [{ slug: document.slug, contentStatus: document.contentStatus }];
    expect(isBuiltChapter(document.contentStatus, {})).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'production' })).toBe(false);
    expect(isBuiltChapter(document.contentStatus, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(false);
    expect(includeChapter(document.contentStatus, 'route', {})).toBe(false);
    expect(includeChapter(document.contentStatus, 'index', {})).toBe(false);
    expect(includeChapter(document.contentStatus, 'sitemap', { VERCEL_ENV: 'preview' })).toBe(false);
    expect(chaptersForBuild(production, {}).map((entry) => entry.slug)).toEqual([]);
    expect(chaptersForDiscovery(production)).toEqual([]);
    expect(isBuiltChapter(document.contentStatus, { VERCEL_ENV: 'preview' })).toBe(true);
    expect(
      isBuiltChapter(document.contentStatus, {
        WORKERS_CI: '1',
        WORKERS_CI_BRANCH: 'cursor/acute-respiratory-failure-4e66',
      }),
    ).toBe(true);

    const page = join(repoRoot, 'dist/cases/acute-respiratory-failure/index.html');
    expect(existsSync(page)).toBe(false);
    const index = readFileSync(join(repoRoot, 'dist/index.html'), 'utf8');
    expect(index).not.toContain('/cases/acute-respiratory-failure');
    expect(index).not.toContain('Acute Respiratory Failure');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
    expect(index).toContain('href="/cases/shock-pressure-flow"');
  });
});
