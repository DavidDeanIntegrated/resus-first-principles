import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cardiogenicFigureIds,
  cardiogenicFigureStem,
  cardiogenicFigureText,
  cardiogenicInlineFile,
  cardiogenicSvg,
  cardiogenicSvgSource,
  type CardiogenicFigureId,
} from '../src/lib/cardiogenic-figures.ts';
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

/** Accepted draft (sha256). The chapter file differs only by the three diagram ids below. */
const acceptedDraftSha256 = '950d2026136f77650992322f1e2a50d61179833124782b7980aa3f50ef5296f5';

const idRemap: Record<CardiogenicFigureId, string> = {
  'r4-three-flooded-lungs': 'fig-r4-01-three-flooded-lungs',
  'r4-pressure-volume': 'fig-r4-02-pressure-volume',
  'r4-pleural-pressure': 'fig-r4-03-pleural-pressure',
};

/** sha256 of the Atelier attachments, in chapter-id file names. */
const attachmentSha256: Record<string, string> = {
  'r4-three-flooded-lungs.svg': 'fb4e7efa3d0abe575589a3e9ad98556d3e0725ea22cc4f625d959f788a330fd1',
  'r4-three-flooded-lungs-print.svg': 'c3826a9f0f32558425fe763a31a7425059b2a5d8418dd0d3be599c7f4278a71d',
  'r4-three-flooded-lungs.inline.html': '7772e6cdf10fe6eda2e8432ea7d4b9bf42b6f0eb7729391b6fc7e2945f0f2817',
  'r4-pressure-volume.svg': '364ac4b5697f8c78dd14fd56cc7bc312ecb8388c9064121743f1ba91b4437757',
  'r4-pressure-volume-print.svg': 'ff10ad11ffdd0f85d7461f92e9099e8d5a3447cbf94301737d2a37c44e1bc4a5',
  'r4-pressure-volume.inline.html': 'b906b58f8ac12dd9c091b8055854a9fecf37439d9f5f1f44e4a0b8f5343c1a47',
  'r4-pleural-pressure.svg': 'f8d5a9a22fde2af6d1f51b663c3a5c3cd4f862f3ea4c41578869b846422d28a6',
  'r4-pleural-pressure-print.svg': '02886d5fc79676006c5035f8be70b083aadc0e56343a1ec93e51ad818eaa8378',
  'r4-pleural-pressure.inline.html': '5fe757686f65eb62b321900cb2ce2f403dd8e1772d96b0afd67b4f7391ff3ac5',
};

const placements: Record<string, string> = {
  'r4-three-flooded-lungs': 'three-profiles',
  'r4-pressure-volume': 'diastolic-stiffness',
  'r4-pleural-pressure': 'work-of-breathing',
};

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('cardiogenic pulmonary edema chapter', () => {
  const chapterPath = join(repoRoot, 'src/content/cases/cardiogenic-pulmonary-edema.json');
  const rawText = readFileSync(chapterPath, 'utf8');
  const raw = JSON.parse(rawText);
  const parsed = caseSchema.safeParse(raw);

  it('is a draft chapter with its own diagram ids and no narration', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.slug).toBe('cardiogenic-pulmonary-edema');
    expect(document.title).toBe('Acute Cardiogenic Pulmonary Edema: Pressure Behind the Failing Left Heart');
    expect(document.contentStatus).toBe('draft');
    expect(document.strict).toBe(true);
    expect(document.diagrams).toEqual([
      'r4-three-flooded-lungs',
      'r4-pressure-volume',
      'r4-pleural-pressure',
    ]);
    expect([...declaredDiagramIds(document)]).toEqual(document.diagrams);
    expect(chapterRobots(document.contentStatus)).toBe('noindex');
    expect(hasNarration(document.slug)).toBe(false);
    expect(rawText).not.toContain('audio');
  });

  it('keeps the accepted draft wording, with only the three figure ids renamed', () => {
    let restored = rawText;
    for (const id of cardiogenicFigureIds) {
      const stem = idRemap[id];
      expect(cardiogenicFigureStem(id)).toBe(stem);
      expect(rawText.split(id)).toHaveLength(3);
      restored = restored.replaceAll(id, stem);
    }
    expect(sha256(restored)).toBe(acceptedDraftSha256);
  });

  it('places each declared figure on the section named in the chapter', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const attached = parsed.data.principles.flatMap((principle) => {
      if (!principle.diagram || typeof principle.diagram === 'string') return [];
      return [{ section: principle.id, id: principle.diagram.id, caption: principle.diagram.caption }];
    });
    expect(attached.map(({ section, id }) => ({ section, id }))).toEqual([
      { section: 'three-profiles', id: 'r4-three-flooded-lungs' },
      { section: 'diastolic-stiffness', id: 'r4-pressure-volume' },
      { section: 'work-of-breathing', id: 'r4-pleural-pressure' },
    ]);
    for (const figure of attached) expect(placements[figure.id]).toBe(figure.section);
    expect(attached[0]?.caption.startsWith('Figure 1 (proposal). Same lungs, three circulations.')).toBe(true);
    expect(
      attached[1]?.caption.startsWith(
        'Figure 2 (proposal). Diastolic pressure-volume curves for a compliant and a stiff ventricle.',
      ),
    ).toBe(true);
    expect(
      attached[2]?.caption.startsWith(
        'Figure 3 (proposal). Left ventricular transmural pressure during labored spontaneous breathing',
      ),
    ).toBe(true);
    const opening = parsed.data.principles.find((principle) => principle.id === 'three-profiles');
    expect(opening?.title).toBe('The three patients side by side');
    const stiffness = parsed.data.principles.find((principle) => principle.id === 'diastolic-stiffness');
    expect(stiffness?.title).toBe('A stiff ventricle');
    const breathing = parsed.data.principles.find((principle) => principle.id === 'work-of-breathing');
    expect(breathing?.title).toBe('How breathing hard loads the left ventricle');
  });

  it('stores each Atelier drawing byte-for-byte', () => {
    const assetDir = join(repoRoot, 'src/assets/diagrams');
    for (const [name, digest] of Object.entries(attachmentSha256)) {
      expect(sha256(readFileSync(join(assetDir, name)))).toBe(digest);
    }
    for (const id of cardiogenicFigureIds) {
      expect(sha256(readFileSync(cardiogenicInlineFile(id)))).toBe(attachmentSha256[`${id}.inline.html`]);
      expect(sha256(cardiogenicSvgSource(id, 'screen'))).toBe(attachmentSha256[`${id}.svg`]);
      expect(sha256(cardiogenicSvgSource(id, 'print'))).toBe(attachmentSha256[`${id}-print.svg`]);
    }
  });

  it('wraps each new drawing as its own screen SVG and print SVG', () => {
    for (const id of cardiogenicFigureIds) {
      const screen = cardiogenicSvg(id, 'screen');
      const print = cardiogenicSvg(id, 'print');
      const screenText = cardiogenicFigureText(id, 'screen');
      const printText = cardiogenicFigureText(id, 'print');
      const stem = cardiogenicFigureStem(id);
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
    const figure = readFileSync(join(repoRoot, 'src/components/diagrams/CardiogenicFigure.astro'), 'utf8');
    expect(figure).toContain('data-diagram={id}');
    expect(figure).toContain("cardiogenicSvg(id, 'screen')");
    expect(figure).toContain("cardiogenicSvg(id, 'print')");
    const diagram = readFileSync(join(repoRoot, 'src/components/PrincipleDiagram.astro'), 'utf8');
    expect(diagram).toContain('<CardiogenicFigure id={diagramId} caption={caption} alt={alt} />');
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
        WORKERS_CI_BRANCH: 'cursor/cardiogenic-pulmonary-edema-d884',
      }),
    ).toBe(true);

    const page = join(repoRoot, 'dist/cases/cardiogenic-pulmonary-edema/index.html');
    expect(existsSync(page)).toBe(false);
    const index = readFileSync(join(repoRoot, 'dist/index.html'), 'utf8');
    expect(index).not.toContain('/cases/cardiogenic-pulmonary-edema');
    expect(index).not.toContain('Acute Cardiogenic Pulmonary Edema');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
    expect(index).toContain('href="/cases/shock-pressure-flow"');
  });
});
