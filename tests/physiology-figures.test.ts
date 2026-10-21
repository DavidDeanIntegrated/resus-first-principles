import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { figuresForPrinciple, groupParagraphs, inlineFiguresAfter } from '../src/lib/figure-placement.ts';
import {
  physiologyAnchorErrors,
  physiologyFigure,
  physiologyFigures,
  physiologySvgSource,
} from '../src/lib/physiology-figures.ts';
import { preparePhysiologySvg, svgText } from '../src/lib/physiology-svg.ts';
import { asParagraphs } from '../src/lib/prose.ts';
import type { CaseDocument } from '../src/lib/schema.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('physiology figure assets', () => {
  const document = JSON.parse(
    readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8'),
  ) as CaseDocument;
  const css = readFileSync(join(repoRoot, 'src/styles/global.css'), 'utf8');

  it('anchors each inline figure to exactly one chapter paragraph', () => {
    const ids = new Set(document.principles.map((principle) => principle.id));
    for (const figure of physiologyFigures) {
      expect(ids.has(figure.principleId), figure.id).toBe(true);
    }
    for (const principle of document.principles) {
      const paragraphs = [
        ...(principle.explanation ? asParagraphs(principle.explanation) : []),
        ...(principle.body ?? []),
      ];
      expect(physiologyAnchorErrors(principle.id, paragraphs)).toEqual([]);
    }
    expect(inlineFiguresAfter('normal-circulation', 'During CPR the first factor is the limiting one. Cardiac output')).toEqual([
      '01-oxygen-delivery',
    ]);
    expect(inlineFiguresAfter('oxygenation-without-hyperventilation', 'Every positive-pressure breath is also a circulatory event.')).toEqual([
      '03-two-pressure-gradients',
    ]);
    expect(figuresForPrinciple('oxygenation-without-hyperventilation')).toEqual([]);
    expect(figuresForPrinciple('monitoring')).toEqual(['05-reading-capnography']);
    expect(figuresForPrinciple('post-rosc-physiology')).toEqual(['06-after-rosc']);
    expect(figuresForPrinciple('reversible-causes')).toEqual(['reversible-cause-overlap']);
  });

  it('keeps the oxygen figure between the CPR paragraph and the held-constant paragraph', () => {
    const principle = document.principles.find((item) => item.id === 'normal-circulation');
    const paragraphs = principle?.body ?? [];
    const groups = groupParagraphs(
      paragraphs,
      (paragraph, index) => (index === 0 ? '' : paragraph),
      (paragraph) => inlineFiguresAfter('normal-circulation', paragraph),
    );
    expect(groups.map((group) => group.figures)).toEqual([['01-oxygen-delivery'], []]);
    expect(groups[0]?.paragraphs[0]).toMatch(/^During CPR the first factor/);
    expect(groups[1]?.paragraphs[0]).toMatch(/^Held constant in these predictions/);
  });

  it('changes only presentation in the SVG and keeps the drawn labels', () => {
    for (const figure of physiologyFigures) {
      const source = physiologySvgSource(figure.file);
      const prepared = preparePhysiologySvg(source, `fig-${figure.id}`, figure.alt);
      expect(svgText(prepared)).toEqual(svgText(source));
      const root = prepared.match(/<svg\b[^>]*>/)?.[0] ?? '';
      expect(root).toContain('viewBox="');
      expect(root).not.toMatch(/\swidth="/);
      expect(root).not.toMatch(/\sheight="/);
      expect(root).toContain(`aria-label="${figure.alt}"`);
      expect(prepared).not.toContain('DejaVu');
      expect(prepared).not.toContain('<title');
      expect(prepared).not.toContain('<desc');
      expect(prepared).toContain("font-family=\"'Fraunces', Georgia, serif\"");
      expect(prepared).toContain("font-family=\"'Literata', Georgia, serif\"");
      expect(prepared).not.toContain('id="arrow"');
      expect(prepared).not.toContain('url(#arrow)');
      if (source.includes('id="arrow"')) expect(prepared).toContain(`id="fig-${figure.id}-arrow"`);
    }
    const oxygen = preparePhysiologySvg(
      physiologySvgSource('01-oxygen-delivery.svg'),
      'fig-01-oxygen-delivery',
      physiologyFigure('01-oxygen-delivery').alt,
    );
    expect(oxygen).toContain('>1020<');
    expect(oxygen).toContain('>306<');
    expect(oxygen).toContain('>324<');
    expect(oxygen).toContain('viewBox="0 0 1080 940"');
  });

  it('scrolls dense figures on a narrow screen and keeps each figure on one printed page', () => {
    expect(css).toMatch(/\.diagram-scroll\s*\{[^}]*overflow-x:\s*auto/);
    const narrow = css.match(/@media screen and \(max-width:\s*700px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(narrow).toContain('width: 780px');
    expect(narrow).toContain('linear-gradient(to right, transparent, var(--paper))');
    const print = css.match(/@media print\s*\{([\s\S]*)\n\}/)?.[1] ?? '';
    expect(print).toContain('.diagram-physiology svg');
    expect(print).toContain('max-height: 6.6in');
    expect(print).toContain('break-inside: avoid');
    expect(print).toMatch(/\.diagram-frame,\s*\.diagram-scroll\s*\{[^}]*overflow:\s*visible/);
  });
});
