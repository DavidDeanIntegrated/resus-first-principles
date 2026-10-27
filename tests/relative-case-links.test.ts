import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseSchema } from '../src/lib/schema.ts';
import { safeHref } from '../src/lib/markdown.ts';

const shockPath = fileURLToPath(new URL('../src/content/cases/shock-pressure-flow.json', import.meta.url));

function withLink(href: string) {
  const doc = JSON.parse(readFileSync(shockPath, 'utf8'));
  doc.principles[0].body = [...doc.principles[0].body, `See [the other chapter](${href}).`];
  return caseSchema.safeParse(doc);
}

describe('relative cross-chapter links', () => {
  it('accepts a root-relative /cases/<slug> link with or without an anchor', () => {
    expect(safeHref('/cases/septic-shock#principle-where-fluid-goes')).toBe('/cases/septic-shock#principle-where-fluid-goes');
    expect(safeHref('/cases/physiologically-difficult-airway')).toBe('/cases/physiologically-difficult-airway');
    expect(withLink('/cases/septic-shock#principle-where-fluid-goes').success).toBe(true);
    expect(withLink('/cases/physiologically-difficult-airway').success).toBe(true);
  });

  it.each([
    '/etc/passwd',
    '//evil.example/cases/x',
    '/cases/Bad_Slug',
    '/cases/septic-shock#bad.anchor',
    '/cases/septic-shock/extra/path',
    'cases/septic-shock',
    '/cases/',
  ])('rejects the bad relative link %s', (href) => {
    expect(safeHref(href)).toBeNull();
    const result = withLink(href);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes(`Link "${href}"`))).toBe(true);
    }
  });
});
