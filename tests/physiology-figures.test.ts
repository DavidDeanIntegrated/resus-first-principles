import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { figuresForPrinciple, inlineFiguresAfter } from '../src/lib/figure-placement.ts';
import {
  physiologyAnchorErrors,
  physiologyFigure,
  physiologyFigures,
  physiologySvgSource,
} from '../src/lib/physiology-figures.ts';
import { preparePhysiologySvg, recolorPhysiologySvg, svgText } from '../src/lib/physiology-svg.ts';
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
    expect(figuresForPrinciple('coronary-cerebral-perfusion')).toEqual([]);
    expect(
      inlineFiguresAfter('coronary-cerebral-perfusion', 'The heart is a muscle that never rests in health'),
    ).toEqual(['coronary-circuit']);
    expect(
      inlineFiguresAfter(
        'coronary-cerebral-perfusion',
        'With that picture in place, the equation is a short summary of it.',
      ),
    ).toEqual(['pressure-pairs']);
    expect(
      inlineFiguresAfter(
        'coronary-cerebral-perfusion',
        'Phase matters for a second reason, which has to do with the vessels themselves.',
      ),
    ).toEqual(['compression-release']);
    expect(
      inlineFiguresAfter(
        'coronary-cerebral-perfusion',
        'For the heart, the gradient that matters is coronary perfusion pressure',
      ),
    ).toEqual(['pressure-gradient']);
  });

  it('keeps the oxygen figure between the CPR paragraph and the held-constant paragraph', () => {
    const principle = document.principles.find((item) => item.id === 'normal-circulation');
    const paragraphs = principle?.body ?? [];
    const cpr = paragraphs.findIndex((paragraph) => paragraph.startsWith('During CPR the first factor'));
    const held = paragraphs.findIndex((paragraph) => paragraph.startsWith('Held constant in these predictions'));
    expect(cpr).toBeGreaterThanOrEqual(0);
    expect(held).toBeGreaterThan(cpr);
    const withFigures = paragraphs
      .map((paragraph, index) => [index, inlineFiguresAfter('normal-circulation', paragraph)] as const)
      .filter(([, figures]) => figures.length > 0);
    expect(withFigures).toEqual([[cpr, ['01-oxygen-delivery']]]);
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

  it('paints physiology figures from element role, not from the hex alone', () => {
    const sample = [
      '<rect fill="#172D38"/>',
      '<text fill="#172D38">Heading</text>',
      '<rect fill="#FFFFFF"/>',
      '<text fill="#FFFFFF">On callout</text>',
      '<rect fill="#DAE8E6"/>',
      '<text fill="#DAE8E6">Soft</text>',
      '<path fill="#526671" stroke="#087F82"/>',
    ].join('');
    expect(recolorPhysiologySvg(sample)).toBe(
      [
        '<rect fill="var(--fig-callout)"/>',
        '<text fill="var(--fig-ink)">Heading</text>',
        '<rect fill="var(--fig-panel)"/>',
        '<text fill="var(--fig-on-callout)">On callout</text>',
        '<rect fill="var(--fig-teal-tint)"/>',
        '<text fill="var(--fig-on-callout-soft)">Soft</text>',
        '<path fill="var(--fig-muted)" stroke="var(--fig-teal)"/>',
      ].join(''),
    );
    expect(() => recolorPhysiologySvg('<rect fill="#123456"/>')).toThrow(/123456/);

    const counts = new Map<string, number>();
    for (const figure of physiologyFigures) {
      const prepared = preparePhysiologySvg(physiologySvgSource(figure.file), `fig-${figure.id}`, figure.alt);
      expect(prepared, figure.id).not.toMatch(/\b(?:fill|stroke)\s*=\s*["'][^"']*#[0-9A-Fa-f]{3,8}/i);
      for (const match of prepared.matchAll(/\b(?:fill|stroke)="(var\(--fig-[a-z-]+\))"/g)) {
        const token = match[1] ?? '';
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(counts)).toEqual({
      'var(--fig-muted)': 114,
      'var(--fig-teal)': 59,
      'var(--fig-ink)': 32,
      'var(--fig-rule)': 29,
      'var(--fig-panel)': 23,
      'var(--fig-red)': 18,
      'var(--fig-canvas)': 6,
      'var(--fig-callout)': 5,
      'var(--fig-on-callout)': 5,
      'var(--fig-on-callout-soft)': 5,
      'var(--fig-gold)': 4,
      'var(--fig-red-tint)': 4,
      'var(--fig-teal-tint)': 4,
    });
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
