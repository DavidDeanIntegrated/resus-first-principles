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
        expect(svg.match(/<svg\b[^>]*>/)?.[0]).not.toContain('width=');
      }
      expect(screen).toContain('class="diagram-screen"');
      expect(print).toContain('class="diagram-print"');
      const screenTitle = screen.match(/\bid="([^"]*screen[^"]*)"/)?.[1];
      expect(screenTitle).toBeTruthy();
      const screenIds = [...screen.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      const printIds = [...print.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
      expect(new Set(screenIds).size).toBe(screenIds.length);
      expect(new Set([...screenIds, ...printIds]).size).toBe(screenIds.length + printIds.length);
      expect(screenIds.some((elementId) => elementId.includes('-screen-'))).toBe(true);
      expect(printIds.some((elementId) => elementId.includes('-print-'))).toBe(true);
      if (id === 'r1-four-mechanisms') {
        const screenLabel = `${id}-screen-rf1-title ${id}-screen-rf1-desc`;
        const printLabel = `${id}-print-rf1p-title ${id}-print-rf1p-desc`;
        expect(screen).toContain(`aria-labelledby="${screenLabel}"`);
        expect(print).toContain(`aria-labelledby="${printLabel}"`);
        expect(screen).not.toContain('aria-describedby');
        expect(print).not.toContain('aria-describedby');
        expect(screen).toContain(`id="${id}-screen-rf1-ah"`);
        expect(print).toContain(`id="${id}-print-rf1p-ah"`);
        expect(print).toContain('viewBox="0 0 700 766"');
        expect(screen).toContain('viewBox="0 0 360 1092"');
        expect(print).toContain('fill:#172d38');
        expect(print).toContain('fill:#ffffff');
        expect(print).not.toContain('var(--fig-');
        expect(print).not.toContain('prefers-color-scheme');
        expect(screen).toContain('var(--fig-ink');
        expect(screen).toContain('prefers-color-scheme:dark');
      } else {
        expect(screen).toContain(`aria-labelledby="${id}-screen-`);
        expect(screen).toContain(`aria-describedby="${id}-screen-`);
        expect(print).toContain(`aria-labelledby="${id}-print-`);
        expect(print).toContain(`aria-describedby="${id}-print-`);
      }
    }
  });

  it('relaxes print max-height only for the load-capacity figure', () => {
    const css = readFileSync(join(repoRoot, 'src/styles/global.css'), 'utf8');
    expect(css).toContain(`  .diagram svg.diagram-print {
    display: block !important;
    max-height: 7.6in;
  }`);
    expect(css).toContain(`.diagram[data-diagram="r1-load-capacity"] svg.diagram-print {
    max-height: 9.2in;
  }`);
    expect(css).not.toMatch(/data-diagram="shock-[^"]+"\] svg\.diagram-print/);
    expect(css).not.toMatch(/data-diagram="(?:coronary-circuit|pressure-pairs|compression-release|pressure-gradient)"\] svg\.diagram-print/);
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
