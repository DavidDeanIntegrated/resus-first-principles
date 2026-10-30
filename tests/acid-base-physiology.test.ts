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
const acceptedDraftSha256 = 'c9bbe481d15efbda8fecaab6c0963acb68e7ce3bfba045d9e9249d722c348064';

/** sha256 of the Atelier attachments. The chapter id is the Atelier stem. */
const attachmentSha256: Record<string, string> = {
  'fig-r8-01-two-routes.svg': '8e00c8be14c3de03c0d961047850a3fcfa580665ac7ec3be483957491226e564',
  'fig-r8-01-two-routes-print.svg': '9eac7885ae22cd0ba89e595c4849935c1f98ebb4cd443e83b21a66174f6a8cd8',
  'fig-r8-01-two-routes.inline.html': 'a6cc0491bc47d43e605883aa4bec2977eead51ade6351e87beb5a63228aadc7e',
  'fig-r8-02-expected-vs-observed.svg': '03ce2ebef720bc2b5bf94b835b6768a172db62dc85ce10b0904881a6f5c02f10',
  'fig-r8-02-expected-vs-observed-print.svg': '475e81d9a852adbf205e551725a38a0f692c881468c3fb5937a8afd1c23a9a01',
  'fig-r8-02-expected-vs-observed.inline.html': '38197f925416286fe925f7adf86f940f7f972d621a9ec4518b699084483d56d3',
  'fig-r8-03-anion-gap-bookkeeping.svg': '33ea9095deb75781f2376c0bdded0897e0c625a311071880199a1178ceb24a7e',
  'fig-r8-03-anion-gap-bookkeeping-print.svg': '1a885bc9a94cec1868cae85913b304f4cd4a5e4db22612758ded5864986ce504',
  'fig-r8-03-anion-gap-bookkeeping.inline.html': '6a5a6dbb93abd1c748fbcbe3db8287ac3290b605e53b0344565b0c8feb471570',
  'fig-r8-04-renal-bicarbonate.svg': '47205123bdb8854a39801602cb7f02e8798b47473dc5cec9a43828f01cfeb261',
  'fig-r8-04-renal-bicarbonate-print.svg': '0d3fcaf9ff9d4e7d7c706e8f7a55c4cc5f5517e5b4aa441b33b4e0b263176ab5',
  'fig-r8-04-renal-bicarbonate.inline.html': 'a4751c576ad0328ce5151dd6c7da6b27e0ea1e1be5906ba7e9f5f01ca42d23d1',
};

const placements: Record<string, string> = {
  'fig-r8-01-two-routes': 'acid-sources',
  'fig-r8-02-expected-vs-observed': 'expected-compensation',
  'fig-r8-03-anion-gap-bookkeeping': 'anion-gap',
  'fig-r8-04-renal-bicarbonate': 'reclamation',
};

const twoRoutesAlt =
  "Schematic of acid handling, not to scale. Carbon dioxide from metabolism, about 15,000 millimoles a day, and nonvolatile acid, about 50 to 100 millimoles of hydrogen ion a day, enter the extracellular fluid. Inside, two reversible reactions drawn with two-way arrows: carbon dioxide and water forming carbonic acid, hydrogen ion and bicarbonate; and hydrogen ion binding to hemoglobin, proteins and phosphate. A note says buffering binds hydrogen ions reversibly, the acid stays in the body and buffer base is used up. A red-cell inset shows carbon dioxide entering, hydrogen ion binding to hemoglobin and bicarbonate leaving in exchange for chloride. A note shows lactate and ketoacid anions being metabolized back to bicarbonate. Only two arrows leave the body: carbon dioxide exhaled by the lungs in minutes, and ammonium and titratable acid in urine over hours to days, drawn dashed, with new bicarbonate returned to the blood. A corner note reads: pH 7.40 to 7.10 doubles hydrogen ion concentration, from about 40 to about 80 nanomoles per liter.";

const expectedVsObservedAlt =
  "Illustrative values. Two compact cards and one main panel. Patient 1, toxic alcohol: bicarbonate 8; Winter's formula expects a PaCO2 of 18 to 22; observed 20 is inside; pH about 7.22. A second marker shows that at a PaCO2 of 40, holding bicarbonate at 8 by assumption, pH would be about 6.92, or about 7.02 allowing a little acute buffering. Patient 2, opioid: PaCO2 rose from 40 to 70 over minutes; the acute rule expects bicarbonate about 27 and the chronic rule about 34.5; observed 27, consistent with an acute rise but not excluding chronic retention with a new metabolic acidosis; pH about 7.21. Patient 3, in five steps: pH 7.40, PaCO2 40 and bicarbonate 24 are all in range; the anion gap without potassium is 24 against an assumed baseline of 10, a rise of 14; one-for-one, bicarbonate would have fallen to about 10, but it is 24, so bicarbonate has been added; low chloride and low potassium fit vomiting; on a pH axis, the ketoacidosis alone would give about 7.26 and the alkalosis alone about 7.52, and together they give the observed 7.40.";

const renalBicarbonateAlt =
  "Two tubule-cell panels, urine side on the left and blood on the right, illustrative values. Panel 1, reclamation: about 4,300 millimoles of bicarbonate are filtered daily. The cell secretes a hydrogen ion in exchange for sodium; in the lumen it combines with filtered bicarbonate to form carbonic acid, then carbon dioxide and water; carbon dioxide enters the cell and re-forms hydrogen ion and bicarbonate; bicarbonate crosses to the blood and the hydrogen ion is secreted again, drawn as a loop labeled recycled. Nothing leaves in urine; net acid excreted is zero. Panel 2, new bicarbonate: secreted hydrogen ion binds filtered phosphate, leaving in urine as titratable acid, and glutamine metabolism yields ammonium, which leaves in urine, each with a new bicarbonate sent to the blood. A note says ammonium counts only if excreted. A box notes that free hydrogen ion at urine pH 4.5 is only about 0.03 millimoles per liter, about 0.05 millimoles a day, roughly one fifteen-hundredth of a 70 millimole load. A footer reads: net acid excretion equals ammonium plus titratable acid minus urinary bicarbonate; it runs continuously, and after a sustained acid load it begins to rise within hours and takes days to reach full strength.";

const anionGapAlt =
  "Paired stacked columns of cations and anions, schematic and not to scale, under the formula gap equals sodium minus chloride plus bicarbonate, calculated without potassium. Sodium stands against chloride, bicarbonate and unmeasured anions, with albumin the largest part of the unmeasured block. Four variants: normal; low albumin, where the baseline gap shrinks and can hide an added acid, with the example of a gap of 10 at albumin 2.0 against a normal 4.0 adjusting to 15; gap acidosis, where lactate, ketones or toxic alcohol acids take the place of bicarbonate and the gap widens; and chloride gain or bicarbonate loss, labeled gap normal: bicarbonate lost or diluted, chloride takes its place in the arithmetic. In that panel, bicarbonate is lost or diluted and chloride takes its place in the arithmetic; chloride does not push bicarbonate out. Renal dysfunction is noted as able to do both. A small timeline shows the osmolar gap high early and the anion gap rising later in toxic alcohol poisoning. The albumin adjustment corrects the baseline only.";

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
      { section: 'reclamation', id: 'fig-r8-04-renal-bicarbonate' },
      { section: 'expected-compensation', id: 'fig-r8-02-expected-vs-observed' },
      { section: 'anion-gap', id: 'fig-r8-03-anion-gap-bookkeeping' },
    ]);
    for (const figure of attached) expect(placements[figure.id]).toBe(figure.section);
    expect(attached.map((figure) => figure.caption)).toEqual([
      "Buffers hold acid reversibly; the lungs and kidneys set the balance; metabolism can undo organic acids.",
      "Reclaiming filtered bicarbonate prevents loss; acid leaving on urinary buffers is how the kidney makes new bicarbonate",
      "The same pH, different states: compare compensation with what is expected (illustrative values; the pH of 6.92 holds bicarbonate at 8 by assumption)",
      "The anion gap is bookkeeping, and albumin fills most of it",
    ]);
    expect(attached.map((figure) => figure.alt)).toEqual([twoRoutesAlt, renalBicarbonateAlt, expectedVsObservedAlt, anionGapAlt]);
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
