import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asParagraphs, splitLead } from '../src/lib/prose.ts';
import type { CaseDocument } from '../src/lib/schema.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('splitLead', () => {
  it('keeps every word of the committed explanations', () => {
    const document = JSON.parse(
      readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8'),
    ) as CaseDocument;

    for (const principle of document.principles) {
      const narrative = principle.explanation ?? principle.body;
      if (!narrative) {
        throw new Error(`principle ${principle.id} has neither explanation nor body`);
      }
      const paragraphs = asParagraphs(narrative);
      const { lead, rest } = splitLead(paragraphs[0] ?? '');
      const rebuilt = [rest ? `${lead} ${rest}` : lead, ...paragraphs.slice(1)].join(' ');
      expect(rebuilt.replace(/\s+/g, ' ')).toBe(paragraphs.join(' ').replace(/\s+/g, ' '));
      expect(lead.length).toBeGreaterThan(0);
    }
  });
});