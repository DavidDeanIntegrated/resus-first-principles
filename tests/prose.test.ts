import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splitLead } from '../src/lib/prose.ts';
import type { CaseDocument } from '../src/lib/schema.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('splitLead', () => {
  it('keeps every word of the committed explanations', () => {
    const document = JSON.parse(
      readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8'),
    ) as CaseDocument;

    for (const principle of document.principles) {
      const { lead, rest } = splitLead(principle.explanation);
      const rebuilt = rest ? `${lead} ${rest}` : lead;
      expect(rebuilt.replace(/\s+/g, ' ')).toBe(principle.explanation.replace(/\s+/g, ' '));
      expect(lead.length).toBeGreaterThan(0);
    }
  });
});