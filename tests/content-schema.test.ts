import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseSchema, type CaseDocument } from '../src/lib/schema.ts';
import { validateContentDirectory } from '../src/lib/validate-content.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const contentDirectory = join(repoRoot, 'src/content/cases');

function placeholderCase(overrides: Record<string, unknown> = {}): CaseDocument {
  return {
    schemaVersion: 1,
    id: 'adult-cardiac-arrest',
    slug: 'adult-cardiac-arrest',
    title: 'Adult cardiac arrest (PLACEHOLDER)',
    summary: 'PLACEHOLDER FIXTURE. Not clinical content.',
    contentStatus: 'placeholder',
    principles: [
      {
        id: 'principle-placeholder-1',
        title: 'PLACEHOLDER principle',
        explanation: 'PLACEHOLDER explanation.',
        questions: [
          {
            id: 'question-placeholder-1',
            prompt: 'PLACEHOLDER prompt.',
            answer: 'PLACEHOLDER answer.',
            reasoning: 'PLACEHOLDER reasoning.',
          },
        ],
      },
    ],
    treatmentApproach: [
      {
        id: 'step-placeholder-1',
        title: 'PLACEHOLDER step',
        action: 'PLACEHOLDER action.',
        why: 'PLACEHOLDER why.',
        principleIds: ['principle-placeholder-1'],
      },
    ],
    ...overrides,
  } as CaseDocument;
}

describe('case schema', () => {
  it('accepts the committed adult cardiac arrest placeholder', () => {
    const result = validateContentDirectory(contentDirectory);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toHaveLength(1);
    const document = result.cases[0]?.document;
    expect(document?.slug).toBe('adult-cardiac-arrest');
    expect(document?.contentStatus).toBe('placeholder');
    expect(document?.summary.toUpperCase()).toContain('PLACEHOLDER');
    expect(document?.principles[0]?.questions[0]).toMatchObject({
      prompt: expect.any(String),
      answer: expect.any(String),
      reasoning: expect.any(String),
    });
    for (const step of document?.treatmentApproach ?? []) {
      for (const principleId of step.principleIds) {
        expect(document?.principles.some((principle) => principle.id === principleId)).toBe(true);
      }
    }
  });

  it('accepts a published case that is not marked as a placeholder', () => {
    const parsed = caseSchema.safeParse(
      placeholderCase({
        contentStatus: 'published',
        title: 'Example case',
        summary: 'A non-placeholder shape used only to prove the schema allows published cases.',
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a missing question reasoning field', () => {
    const document = placeholderCase();
    const question = document.principles[0]?.questions[0];
    if (!question) throw new Error('fixture missing question');
    delete (question as { reasoning?: string }).reasoning;
    const parsed = caseSchema.safeParse(document);
    expect(parsed.success).toBe(false);
  });

  it('rejects a treatment step that links an unknown principle', () => {
    const parsed = caseSchema.safeParse(
      placeholderCase({
        treatmentApproach: [
          {
            id: 'step-placeholder-1',
            title: 'PLACEHOLDER step',
            action: 'PLACEHOLDER action.',
            why: 'PLACEHOLDER why.',
            principleIds: ['missing-principle'],
          },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes('unknown principle'))).toBe(true);
  });

  it('rejects duplicate principle ids', () => {
    const document = placeholderCase();
    const principle = document.principles[0];
    if (!principle) throw new Error('fixture missing principle');
    document.principles.push(structuredClone(principle));
    const parsed = caseSchema.safeParse(document);
    expect(parsed.success).toBe(false);
  });

  it('rejects a placeholder that is not clearly marked', () => {
    const parsed = caseSchema.safeParse(
      placeholderCase({
        title: 'Adult cardiac arrest',
        summary: 'A case summary without the required marker.',
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it('fails the directory validator when a case file is malformed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'resus-content-'));
    const document = placeholderCase();
    delete (document as { treatmentApproach?: unknown }).treatmentApproach;
    writeFileSync(join(directory, 'adult-cardiac-arrest.json'), JSON.stringify(document));
    const result = validateContentDirectory(directory);
    expect(result.ok).toBe(false);
  });

  it('fails when the filename does not match the slug', () => {
    const directory = mkdtempSync(join(tmpdir(), 'resus-content-'));
    writeFileSync(join(directory, 'wrong-name.json'), JSON.stringify(placeholderCase()));
    const result = validateContentDirectory(directory);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.includes('filename must be'))).toBe(true);
  });

  it('returns a failing exit code from the validate script', () => {
    const directory = mkdtempSync(join(tmpdir(), 'resus-content-'));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'not-json.json'), '{');
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(repoRoot, 'scripts/validate-content.ts'), directory],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Content validation: FAIL');
  });
});
