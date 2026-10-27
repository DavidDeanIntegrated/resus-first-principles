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

/** Accepted draft (sha256). The chapter file matches that draft byte for byte. */
const acceptedDraftSha256 = '69609810dd820cbf31779f6c18dd5927add0658d5280fe1d084b379a69e817dd';

const figureStems: Record<CardiogenicFigureId, string> = {
  'r4-three-flooded-lungs': 'fig-r4-01-three-flooded-lungs',
  'r4-pressure-chain': 'fig-r4-02a-pressure-chain',
  'r4-pressure-volume': 'fig-r4-02-pressure-volume',
  'r4-pleural-pressure': 'fig-r4-03-pleural-pressure',
};

/** sha256 of the Atelier attachments, in chapter-id file names. */
const attachmentSha256: Record<string, string> = {
  'r4-three-flooded-lungs.svg': 'c7f9224f1f96865e5a22a62916fe901de57b866f497000c96bae970ac7c5f322',
  'r4-three-flooded-lungs-print.svg': '940eafbf691ec5b1fc8fe3f860d37b7aa41eb86ee7968b4501aff27e7f611265',
  'r4-three-flooded-lungs.inline.html': '27a373beb4af0f7a8492251fa285f9d67507c9d32a69afadf9d5d2e13bc50e92',
  'r4-pressure-chain.svg': '2a4b6d7ef1fed44115801c903be301387b3c74fd39b899a2e8291c734007c319',
  'r4-pressure-chain-print.svg': 'a66b042e685b3e752f3ac5ad48f9609a3045629ae07f7c5955fc4ee9f11d340c',
  'r4-pressure-chain.inline.html': 'd55bab5b16e49f37ef2e4d61fc2940b0659305faa19869c2eae93fe9360caa4e',
  'r4-pressure-volume.svg': '7d12767502fa91a517d158b7b9ed3ac7256be126880dec44d4f775b2e33715c8',
  'r4-pressure-volume-print.svg': 'a008227c93b8c12012ea5a83d08cb05cb1d34308320ce3776580d97501f0ff15',
  'r4-pressure-volume.inline.html': 'e0892b9dc518cb98b4f69153ac65450b00196f6861e960706b78853aff1c3475',
  'r4-pleural-pressure.svg': 'f9385371c4778c6f88ee4f1b5f8a6f57998e6f1aca064a8a8fde3048c6b85c84',
  'r4-pleural-pressure-print.svg': '3518e75ce62c1c9ace6f658c2a279b789c682f754387bc5a664946bd9a668f30',
  'r4-pleural-pressure.inline.html': 'd5be60ecafbb88255b6ec9983e48868f765bcb353e2a73924c66942cdcfcba2c',
};

const placements: Record<string, string> = {
  'r4-three-flooded-lungs': 'three-profiles',
  'r4-pressure-chain': 'lap-pcap',
  'r4-pressure-volume': 'diastolic-stiffness',
  'r4-pleural-pressure': 'work-of-breathing',
};

const floodedLungsAlt =
  'Three overlapping circles, each drawn with a different outline style. The middle circle is labeled redistribution, Patient S, with MAP 150, weight change 0 kg and shock index 0.58, and the words sudden onset, high pressure, no recent weight gain. The left circle, labeled accumulation, Patient F, shows MAP 96 and weight change plus 6 kg, and overlaps the middle circle in a region labeled excess water plus a pressure surge. The right circle, labeled pump failure, Patient K, shows MAP 68, shock index 1.37 and lactate 5.0, and overlaps the middle circle in a region labeled flooded lungs and high afterload, with low forward flow. The left and right circles do not touch. Below the circles, a line says which problem dominates now is a bedside judgment, not a number, and a note says no recent weight gain does not prove normal body water, and a quick response to nitrates or CPAP does not prove redistribution alone. A tag says B-lines are a pattern consistent with increased density of the lung interstitium, from fluid or from thickening, and do not measure left atrial pressure or identify the cause. A footer says all three lungs hold fluid and the image cannot tell them apart.';

const pressureChainAlt =
  'A schematic chain of boxes from the left ventricle to the lung capillaries, with no values. A dashed line labeled pressure runs from the left ventricle toward the capillaries, and a separate thin solid line labeled blood flow runs the other way. Left ventricle: LVEDP, the pressure at the end of filling; a filling pressure is not a filling volume. A strip says mean left atrial pressure and LVEDP track reasonably closely with a normal valve, an organized atrial rhythm and a normally compliant atrium, and separate with a narrowed or substantially leaking mitral valve, a stiff or enlarged atrium, lost atrial rhythm, and the point in the cardiac cycle when the pressure is read. Left atrium: left atrial pressure changes through the cardiac cycle; a dashed marker says the wedge pressure estimates left atrial pressure under the right conditions, is not a direct measure of capillary pressure and is not interchangeable with LVEDP. Pulmonary veins: pressure just upstream of the atrium. Lung capillaries: pressure between pulmonary arterial and venous pressure, higher than left atrial pressure. An arrow says filtration rises with capillary pressure and leads to the interstitium, where lymph flow rises to match filtration, up to a limit. When filtration exceeds lymph capacity, fluid collects in three numbered stages: around the bronchovascular bundles, in the alveolar walls, and in the alveoli. A dotted box says the alveolar epithelium transports salt, water follows, and the lymphatics and the circulation remove it. A key says the wedge pressure estimates left atrial pressure, lung ultrasound and imaging see interstitial fluid, and neither measures capillary pressure directly.';

const pressureVolumeAlt =
  'A graph with ventricular volume on the horizontal axis and diastolic pressure on the vertical axis, without numbers. Two curves rise from left to right. The lower, flatter curve is labeled compliant ventricle. The upper, steeper curve is labeled stiff ventricle. On each curve, a short horizontal arrow shows the same small increase in volume, and a vertical arrow shows the resulting rise in pressure, which is small on the compliant curve and large on the stiff curve.';

const pleuralPressureAlt =
  'Two side-by-side drawings of a heart inside the chest, both at peak systole during inspiration and with the same systolic pressure. In the left drawing, labeled labored breathing, arrows point outward from the heart to show pleural pressure falling well below atmospheric, and a label reads higher transmural pressure. In the right drawing, labeled positive pressure, a flat baseline marked approximately zero shows pleural pressure near atmospheric at the same point in the breath, and a label reads lower transmural pressure. No other values are shown.';

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
      'r4-pressure-chain',
      'r4-pressure-volume',
      'r4-pleural-pressure',
    ]);
    expect([...declaredDiagramIds(document)]).toEqual(document.diagrams);
    expect(chapterRobots(document.contentStatus)).toBe('noindex');
    expect(hasNarration(document.slug)).toBe(false);
    expect(rawText).not.toContain('audio');
  });

  it('matches the accepted draft byte for byte', () => {
    expect(sha256(rawText)).toBe(acceptedDraftSha256);
    expect(rawText).not.toContain('Search Bot');
    expect(rawText).not.toContain('(proposal)');
    for (const id of cardiogenicFigureIds) {
      expect(cardiogenicFigureStem(id)).toBe(figureStems[id]);
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
      { section: 'three-profiles', id: 'r4-three-flooded-lungs' },
      { section: 'lap-pcap', id: 'r4-pressure-chain' },
      { section: 'diastolic-stiffness', id: 'r4-pressure-volume' },
      { section: 'work-of-breathing', id: 'r4-pleural-pressure' },
    ]);
    for (const figure of attached) expect(placements[figure.id]).toBe(figure.section);
    expect(attached[0]?.caption.startsWith('Figure 1. Same lungs, three circulations, and the ground between them.')).toBe(
      true,
    );
    expect(attached[1]?.caption.startsWith('Figure 2. From ventricle to capillary.')).toBe(true);
    expect(
      attached[2]?.caption.startsWith(
        'Figure 3. Diastolic pressure-volume curves for a compliant and a stiff ventricle.',
      ),
    ).toBe(true);
    expect(
      attached[3]?.caption.startsWith(
        'Figure 4. Left ventricular transmural pressure during labored spontaneous breathing',
      ),
    ).toBe(true);
    expect(attached.map((figure) => figure.alt)).toEqual([
      floodedLungsAlt,
      pressureChainAlt,
      pressureVolumeAlt,
      pleuralPressureAlt,
    ]);
    for (const reference of parsed.data.references ?? []) {
      const note = reference.note ?? '';
      expect(note).not.toMatch(/Search Bot/i);
      expect(note).not.toMatch(/check/i);
    }
    const opening = parsed.data.principles.find((principle) => principle.id === 'three-profiles');
    expect(opening?.title).toBe('The three patients side by side');
    const chain = parsed.data.principles.find((principle) => principle.id === 'lap-pcap');
    expect(chain?.title).toBe('From ventricle to capillary');
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
