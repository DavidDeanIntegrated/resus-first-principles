import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Computed display for diagram SVGs.
 *
 * The repo's test runner is Vitest on Node. Playwright is not a dependency and
 * is not installed in CI (scripts/shoot.mjs uses playwright-core locally and is
 * not part of the suite). This applies the case page's svg class lists to the
 * stylesheet's display rules, including media, which is the cascade that sets
 * computed display.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

interface Mode {
  name: string;
  screen: boolean;
  print: boolean;
  width: number;
}

interface ElementSnap {
  tag: string;
  classes: string[];
  attrs: Record<string, string>;
}

interface DisplayRule {
  media: string | null;
  selector: string;
  display: string;
  important: boolean;
  body: string;
  order: number;
  specificity: number;
}

const modes: Mode[] = [
  { name: '390 screen', screen: true, print: false, width: 390 },
  { name: '1440 screen', screen: true, print: false, width: 1440 },
  { name: 'print', screen: false, print: true, width: 1100 },
];

describe('diagram variant display', () => {
  const css = readFileSync(join(repoRoot, 'src/styles/global.css'), 'utf8');
  const html = readFileSync(join(repoRoot, 'dist/cases/adult-cardiac-arrest/index.html'), 'utf8');
  const rules = displayRules(css);
  const figures = diagramFigures(html);

  it('shows exactly one svg per diagram at 1440 screen, 390 screen, and print', () => {
    expect(figures.map((figure) => figure.id)).toContain('reversible-cause-overlap');

    for (const figure of figures) {
      expect(figure.svgs.length, figure.id).toBeGreaterThan(0);
      for (const mode of modes) {
        const visible = figure.svgs.filter(
          (svg) => resolvedDisplay(svg, figure.ancestors, rules, mode) !== 'none',
        );
        expect(visible, `${figure.id} at ${mode.name}`).toHaveLength(1);
      }
    }

    const dual = figures.filter((figure) => {
      const names = new Set(figure.svgs.flatMap((svg) => svg.classes));
      return names.has('diagram-screen') && names.has('diagram-print');
    });
    expect(dual.map((figure) => figure.id)).toEqual(
      expect.arrayContaining(['pressure-gradient', 'reversible-cause-overlap']),
    );

    for (const figure of dual) {
      expect(visibleClass(figure, rules, modes[0]!), `${figure.id} at ${modes[0]!.name}`).toBe('diagram-screen');
      expect(visibleClass(figure, rules, modes[1]!), `${figure.id} at ${modes[1]!.name}`).toBe('diagram-print');
      expect(visibleClass(figure, rules, modes[2]!), `${figure.id} at ${modes[2]!.name}`).toBe('diagram-print');
    }

    const wide = rules.find(
      (rule) =>
        rule.media === 'screen and (min-width: 701px)' && rule.selector === '.diagram svg.diagram-print',
    );
    expect(wide?.display).toBe('block');
    expect(wide?.body).toContain('max-width: 664px');
    expect(wide?.body).toContain('margin-inline: auto');
  });

  it('gives the visible svg an accessible name and description at every width and in print', () => {
    for (const figure of figures) {
      for (const mode of modes) {
        const visible = figure.svgs.filter(
          (svg) => resolvedDisplay(svg, figure.ancestors, rules, mode) !== 'none',
        );
        for (const svg of visible) {
          const where = `${figure.id} at ${mode.name}`;
          expect(svg.attrs['aria-hidden'], where).toBeUndefined();
          expect(['img', 'group'], where).toContain(svg.attrs.role);
          const labelId = svg.attrs['aria-labelledby'];
          const name = labelId
            ? new RegExp(`<title id="${labelId}">([^<]+)</title>`).exec(html)?.[1]
            : svg.attrs['aria-label'];
          expect(name?.trim().length ?? 0, where).toBeGreaterThan(0);
          const descId = svg.attrs['aria-describedby'];
          if (descId) expect(html, where).toContain(`<desc id="${descId}">`);
        }
      }
    }
  });
});

function visibleClass(
  figure: { svgs: ElementSnap[]; ancestors: ElementSnap[] },
  rules: DisplayRule[],
  mode: Mode,
): string {
  const visible = figure.svgs.filter((svg) => resolvedDisplay(svg, figure.ancestors, rules, mode) !== 'none');
  return visible[0]?.classes.join(' ') ?? '';
}

function diagramFigures(html: string): Array<{ id: string; ancestors: ElementSnap[]; svgs: ElementSnap[] }> {
  const figures: Array<{ id: string; ancestors: ElementSnap[]; svgs: ElementSnap[] }> = [];
  for (const match of html.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/g)) {
    const attrs = attributes(match[1] ?? '');
    const classes = (attrs.class ?? '').split(/\s+/).filter(Boolean);
    if (!classes.includes('diagram')) continue;
    const ancestors = [{ tag: 'figure', classes, attrs }];
    const svgs = [...(match[2] ?? '').matchAll(/<svg\b([^>]*)>/g)].map((svg) => ({
      tag: 'svg',
      classes: (attributes(svg[1] ?? '').class ?? '').split(/\s+/).filter(Boolean),
      attrs: attributes(svg[1] ?? ''),
    }));
    figures.push({ id: attrs['data-diagram'] ?? '', ancestors, svgs });
  }
  return figures;
}

function attributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/g)) {
    attrs[(match[1] ?? '').toLowerCase()] = match[2] ?? '';
  }
  return attrs;
}

function displayRules(css: string): DisplayRule[] {
  const rules: DisplayRule[] = [];
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), null, rules);
  for (const rule of rules) {
    if (/svg|diagram-screen|diagram-print/.test(rule.selector) && /[>+~:]/.test(rule.selector)) {
      throw new Error(`Unsupported diagram display selector: ${rule.selector}`);
    }
  }
  return rules;
}

function walk(css: string, media: string | null, rules: DisplayRule[]): void {
  let index = 0;
  while (index < css.length) {
    while (index < css.length && /\s/.test(css[index] ?? '')) index += 1;
    if (index >= css.length) return;
    const brace = css.indexOf('{', index);
    if (brace === -1) return;
    const prelude = css.slice(index, brace).trim();
    let depth = 1;
    let cursor = brace + 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    const body = css.slice(brace + 1, cursor - 1);
    if (prelude.startsWith('@media')) {
      walk(body, prelude.replace(/^@media\s*/, '').trim(), rules);
    } else if (!prelude.startsWith('@')) {
      const display = declarationDisplay(body);
      if (display) {
        for (const selector of prelude.split(',').map((part) => part.trim()).filter(Boolean)) {
          rules.push({
            media,
            selector,
            display: display.value,
            important: display.important,
            body,
            order: rules.length,
            specificity: specificity(selector),
          });
        }
      }
    }
    index = cursor;
  }
}

function declarationDisplay(body: string): { value: string; important: boolean } | null {
  const match = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(body);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  return {
    value: raw.replace(/\s*!important\s*$/, '').trim(),
    important: /!important\s*$/.test(raw),
  };
}

function specificity(selector: string): number {
  const ids = selector.match(/#[A-Za-z0-9_-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[A-Za-z0-9_-]+/g)?.length ?? 0;
  const attributes = selector.match(/\[[^\]]+\]/g)?.length ?? 0;
  const pseudos = selector.match(/:[A-Za-z-]+/g)?.length ?? 0;
  const tags = selector
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[.#:][A-Za-z0-9_-]+/g, ' ')
    .split(/[\s>+~]+/)
    .filter((part) => part.length > 0 && part !== '*').length;
  return ids * 100 + (classes + attributes + pseudos) * 10 + tags;
}

function mediaMatches(query: string | null, mode: Mode): boolean {
  if (query === null) return true;
  if (query.includes(',')) throw new Error(`Unsupported media list: ${query}`);
  const screen = /\bscreen\b/.test(query);
  const print = /\bprint\b/.test(query);
  if (screen && !mode.screen) return false;
  if (print && !mode.print) return false;
  if (/prefers-reduced-motion/.test(query)) return false;
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (min?.[1] && mode.width < Number(min[1])) return false;
  if (max?.[1] && mode.width > Number(max[1])) return false;
  return true;
}

function resolvedDisplay(element: ElementSnap, ancestors: ElementSnap[], rules: DisplayRule[], mode: Mode): string {
  let best: DisplayRule | null = null;
  for (const rule of rules) {
    if (!mediaMatches(rule.media, mode)) continue;
    if (!selectorMatches(rule.selector, element, ancestors)) continue;
    if (!best || beats(rule, best)) best = rule;
  }
  return best?.display ?? 'inline';
}

function beats(rule: DisplayRule, best: DisplayRule): boolean {
  if (rule.important !== best.important) return rule.important;
  if (rule.specificity !== best.specificity) return rule.specificity > best.specificity;
  return rule.order > best.order;
}

function selectorMatches(selector: string, element: ElementSnap, ancestors: ElementSnap[]): boolean {
  if (/[>+~:]/.test(selector)) return false;
  const parts = selector.split(/\s+/).filter(Boolean);
  const target = parts[parts.length - 1];
  if (!target || !compoundMatches(target, element)) return false;
  let ancestorIndex = ancestors.length - 1;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) return false;
    let found = false;
    for (let cursor = ancestorIndex; cursor >= 0; cursor -= 1) {
      const ancestor = ancestors[cursor];
      if (ancestor && compoundMatches(part, ancestor)) {
        found = true;
        ancestorIndex = cursor - 1;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function compoundMatches(compound: string, element: ElementSnap): boolean {
  let rest = compound;
  let matched = false;
  while (rest.length > 0) {
    if (rest.startsWith('.')) {
      const token = /^\.([A-Za-z0-9_-]+)/.exec(rest);
      if (!token?.[1] || !element.classes.includes(token[1])) return false;
      rest = rest.slice(token[0].length);
    } else if (rest.startsWith('[')) {
      const token = /^\[([A-Za-z0-9_-]+)="([^"]*)"\]/.exec(rest);
      if (!token?.[1] || element.attrs[token[1]] !== token[2]) return false;
      rest = rest.slice(token[0].length);
    } else {
      const token = /^[A-Za-z][A-Za-z0-9-]*/.exec(rest);
      if (!token?.[0] || element.tag !== token[0].toLowerCase()) return false;
      rest = rest.slice(token[0].length);
    }
    matched = true;
  }
  return matched;
}
