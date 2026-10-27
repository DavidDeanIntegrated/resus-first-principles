import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseSchema, type CaseDocument, type QuestionKind } from '../src/lib/schema.ts';
import { formatValidationReport, validateContentDirectory } from '../src/lib/validate-content.ts';

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
        causes: [
          {
            id: 'cause-placeholder',
            name: 'PLACEHOLDER cause',
            category: 'filling',
            failure: 'PLACEHOLDER failure.',
            rhythm: 'PLACEHOLDER rhythm.',
            causalChain: ['PLACEHOLDER chain.', 'PLACEHOLDER follow-up.'],
            compressions: 'PLACEHOLDER compressions.',
            fix: 'PLACEHOLDER fix.',
            bedside: 'PLACEHOLDER bedside.',
            limits: 'PLACEHOLDER limits.',
            examples: [
              {
                id: 'example-placeholder',
                vignette: 'PLACEHOLDER vignette.',
                reasoning: 'PLACEHOLDER example reasoning.',
              },
            ],
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
  it('accepts the committed adult cardiac arrest case', () => {
    const result = validateContentDirectory(contentDirectory);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases.map((entry) => entry.document.slug).sort()).toEqual([
      'acute-respiratory-failure',
      'adult-cardiac-arrest',
      'physiologically-difficult-airway',
      'septic-shock',
      'shock-pressure-flow',
    ]);
    const document = result.cases.find((entry) => entry.document.slug === 'adult-cardiac-arrest')?.document;
    expect(document?.slug).toBe('adult-cardiac-arrest');
    expect(document?.contentStatus).toBe('published');
    expect(document?.shareDescription).toBe(
      'Why compressions create flow, what a pause costs, and how the coronary pressure gradient decides whether the arrested heart can recover.',
    );
    expect(document?.shareDescription?.length).toBeLessThanOrEqual(160);
    expect(document?.title.toUpperCase()).not.toContain('PLACEHOLDER');
    expect(document?.principles.length).toBeGreaterThanOrEqual(5);
    for (const principle of document?.principles ?? []) {
      for (const question of principle.questions) {
        expect(question.prompt.length).toBeGreaterThan(0);
        const answer = typeof question.answer === 'string' ? question.answer : question.answer.join('');
        expect(answer.length).toBeGreaterThan(0);
        const reasoning =
          question.reasoning == null
            ? ''
            : typeof question.reasoning === 'string'
              ? question.reasoning
              : question.reasoning.join('');
        const hasPart = Boolean(
          question.conclusion || question.causalChain || question.assumption || question.misconception,
        );
        expect(reasoning.length > 0 || hasPart).toBe(true);
      }
    }
    expect(document?.reviewNote).toBe(
      'Source-checked against AHA 2025; not yet independently physician-reviewed.',
    );
    const causes = (document?.principles ?? []).flatMap((principle) => principle.causes ?? []);
    expect(causes).toHaveLength(11);
    expect(causes.reduce((count, cause) => count + cause.examples.length, 0)).toBeGreaterThanOrEqual(25);
    const report = formatValidationReport(result);
    expect(report).toContain('prediction=10');
    expect(report).toContain('transfer=9');
    expect(report).toContain('evidence-boundary=4');
    expect(report).toContain('insufficient-information=2');
    expect(report).toContain('causes=11');
    expect(report).toContain('examples=25');
    expect(report).toContain('questions=25');
    const conclusions = (document?.principles ?? [])
      .flatMap((principle) => principle.questions)
      .filter((question) => question.conclusion != null);
    expect(result.warnings).toHaveLength(conclusions.length);
    if (conclusions.length > 0) {
      expect(report).toContain('Warnings:');
      expect(report).toContain('uses deprecated conclusion; answer is canonical');
    }
    expect(document?.treatmentApproach.length).toBeGreaterThanOrEqual(1);
    for (const step of document?.treatmentApproach ?? []) {
      expect(step.principleIds.length).toBeGreaterThanOrEqual(1);
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

  it('accepts a share description of 160 characters and rejects a longer one', () => {
    expect(caseSchema.safeParse(placeholderCase()).success).toBe(true);
    expect(caseSchema.safeParse(placeholderCase({ shareDescription: 'a'.repeat(160) })).success).toBe(true);
    const parsed = caseSchema.safeParse(placeholderCase({ shareDescription: 'a'.repeat(161) }));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.path[0] === 'shareDescription')).toBe(true);
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

  it('accepts the optional diagram ids and rejects an unknown one', () => {
    const withDiagram = placeholderCase();
    const principle = withDiagram.principles[0];
    if (!principle) throw new Error('fixture missing principle');
    principle.diagram = 'pressure-gradient';
    expect(caseSchema.safeParse(withDiagram).success).toBe(true);

    const raw = {
      ...withDiagram,
      principles: [{ ...principle, diagram: 'made-up-curve' }],
    };
    const parsed = caseSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
  });

  it('keys the cardiac arrest diagrams to the principles they explain', () => {
    const result = validateContentDirectory(contentDirectory);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const document = result.cases.find((entry) => entry.document.slug === 'adult-cardiac-arrest')?.document;
    const diagrams = new Map(document?.principles.map((principle) => [principle.id, principle.diagram]));
    expect(diagrams.get('coronary-cerebral-perfusion')).toBe('pressure-gradient');
    expect(diagrams.get('minimize-interruptions')).toBe('compression-pause');
    for (const [id, diagram] of diagrams) {
      if (id === 'coronary-cerebral-perfusion' || id === 'minimize-interruptions') continue;
      expect(diagram, id).toBeUndefined();
    }
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

  it('accepts multi-paragraph prose and linked references', () => {
    const parsed = caseSchema.safeParse(
      placeholderCase({
        references: [
          {
            id: 'source-one',
            label: 'Example source',
            url: 'https://example.com/source',
            note: 'A note for the writer.',
          },
        ],
        principles: [
          {
            id: 'principle-placeholder-1',
            title: 'PLACEHOLDER principle',
            explanation: ['PLACEHOLDER first paragraph.', 'PLACEHOLDER second paragraph.'],
            refs: ['source-one'],
            questions: [
              {
                id: 'question-placeholder-1',
                prompt: 'PLACEHOLDER prompt.',
                answer: ['PLACEHOLDER answer paragraph.', 'PLACEHOLDER answer follow-up.'],
                reasoning: ['PLACEHOLDER reasoning paragraph.', 'PLACEHOLDER reasoning follow-up.'],
                conclusion: 'PLACEHOLDER conclusion.',
                causalChain: ['PLACEHOLDER cause.', 'PLACEHOLDER effect.'],
                assumption: 'PLACEHOLDER assumption.',
                misconception: 'PLACEHOLDER misconception.',
                kind: 'prediction',
                refs: ['source-one'],
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
            refs: ['source-one'],
          },
        ],
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a ref id that is not in references', () => {
    const parsed = caseSchema.safeParse(
      placeholderCase({
        principles: [
          {
            id: 'principle-placeholder-1',
            title: 'PLACEHOLDER principle',
            explanation: 'PLACEHOLDER explanation.',
            refs: ['missing-source'],
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
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes('Unknown reference'))).toBe(true);
  });

  it('rejects a duplicate reference id', () => {
    const parsed = caseSchema.safeParse(
      placeholderCase({
        references: [
          { id: 'source-one', label: 'First', url: 'https://example.com/a' },
          { id: 'source-one', label: 'Second', url: 'https://example.com/b' },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes('Duplicate reference id'))).toBe(true);
  });

  it('keeps question parts optional unless strict is set', () => {
    expect(caseSchema.safeParse(placeholderCase()).success).toBe(true);
    const strict = caseSchema.safeParse(placeholderCase({ strict: true }));
    expect(strict.success).toBe(false);
    if (strict.success) return;
    const messages = strict.error.issues.map((issue) => issue.message).join('\n');
    expect(messages).toContain('needs a kind');
    expect(messages).not.toContain('needs conclusion');
    expect(messages).toContain('needs causalChain');
    expect(messages).toContain('needs assumption');
    expect(messages).toContain('needs misconception');
    expect(messages).toContain('needs at least one prediction question');
    expect(messages).toContain('needs at least one transfer question');
  });

  it('accepts a strict topic module with both question kinds and all four parts', () => {
    const question = (id: string, kind: QuestionKind) => ({
      id,
      kind,
      prompt: 'PLACEHOLDER prompt.',
      answer: 'PLACEHOLDER answer.',
      reasoning: 'PLACEHOLDER reasoning.',
      conclusion: 'PLACEHOLDER conclusion.',
      causalChain: 'PLACEHOLDER chain.',
      assumption: 'PLACEHOLDER assumption.',
      misconception: 'PLACEHOLDER misconception.',
    });
    const parsed = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        principles: [
          {
            id: 'principle-placeholder-1',
            title: 'PLACEHOLDER principle',
            explanation: 'PLACEHOLDER explanation.',
            questions: [
              question('question-prediction', 'prediction'),
              question('question-transfer', 'transfer'),
              question('question-boundary', 'evidence-boundary'),
            ],
          },
        ],
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a strict principle that has no transfer question', () => {
    const parsed = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        principles: [
          {
            id: 'principle-placeholder-1',
            title: 'PLACEHOLDER principle',
            explanation: 'PLACEHOLDER explanation.',
            questions: [
              {
                id: 'question-prediction',
                kind: 'prediction',
                prompt: 'PLACEHOLDER prompt.',
                answer: 'PLACEHOLDER answer.',
                reasoning: 'PLACEHOLDER reasoning.',
                conclusion: 'PLACEHOLDER conclusion.',
                causalChain: 'PLACEHOLDER chain.',
                assumption: 'PLACEHOLDER assumption.',
                misconception: 'PLACEHOLDER misconception.',
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes('transfer question'))).toBe(true);
  });

  it('requires two examples, resolvable cause ids, and missingData only in strict mode', () => {
    const question = (id: string, kind: QuestionKind, extra: Record<string, unknown> = {}) => ({
      id,
      kind,
      prompt: 'PLACEHOLDER prompt.',
      answer: 'PLACEHOLDER answer.',
      reasoning: 'PLACEHOLDER reasoning.',
      conclusion: 'PLACEHOLDER conclusion.',
      causalChain: 'PLACEHOLDER chain.',
      assumption: 'PLACEHOLDER assumption.',
      misconception: 'PLACEHOLDER misconception.',
      ...extra,
    });
    const cause = (exampleCount: number, extra: Record<string, unknown> = {}) => ({
      id: 'cause-placeholder',
      name: 'PLACEHOLDER cause',
      category: 'obstruction',
      failure: 'PLACEHOLDER failure.',
      rhythm: 'PLACEHOLDER rhythm.',
      causalChain: 'PLACEHOLDER chain.',
      compressions: 'PLACEHOLDER compressions.',
      fix: 'PLACEHOLDER fix.',
      bedside: 'PLACEHOLDER bedside.',
      limits: 'PLACEHOLDER limits.',
      examples: Array.from({ length: exampleCount }, (_, index) => ({
        id: `example-${index + 1}`,
        vignette: 'PLACEHOLDER vignette.',
        reasoning: 'PLACEHOLDER example reasoning.',
        ...(index === 0 ? extra : {}),
      })),
    });
    const principles = (exampleCount: number, extra: Record<string, unknown> = {}) => [
      {
        id: 'principle-placeholder-1',
        title: 'PLACEHOLDER principle',
        explanation: 'PLACEHOLDER explanation.',
        questions: [
          question('question-prediction', 'prediction'),
          question('question-transfer', 'transfer'),
          question('question-gap', 'insufficient-information', { missingData: 'PLACEHOLDER missing.' }),
        ],
        causes: [cause(exampleCount, extra)],
      },
    ];

    expect(caseSchema.safeParse(placeholderCase({ principles: principles(1) })).success).toBe(true);

    const short = caseSchema.safeParse(placeholderCase({ strict: true, principles: principles(1) }));
    expect(short.success).toBe(false);
    if (!short.success) {
      expect(short.error.issues.some((issue) => issue.message.includes('at least 2 examples'))).toBe(true);
    }

    const unknownCause = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        principles: principles(2, { causeIds: ['missing-cause'] }),
      }),
    );
    expect(unknownCause.success).toBe(false);
    if (!unknownCause.success) {
      expect(unknownCause.error.issues.some((issue) => issue.message.includes('unknown cause'))).toBe(true);
    }

    const unknownRef = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        principles: [
          {
            ...principles(2)[0],
            causes: [{ ...cause(2), refs: ['missing-source'] }],
          },
        ],
      }),
    );
    expect(unknownRef.success).toBe(false);
    if (!unknownRef.success) {
      expect(unknownRef.error.issues.some((issue) => issue.message.includes('Unknown reference'))).toBe(true);
    }

    const ready = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        references: [{ id: 'source-one', label: 'Example source', url: 'https://example.com/source' }],
        principles: [
          {
            ...principles(2, { causeIds: ['cause-placeholder'] })[0],
            causes: [{ ...cause(2, { causeIds: ['cause-placeholder'] }), refs: ['source-one'] }],
          },
        ],
      }),
    );
    expect(ready.success).toBe(true);

    const missing = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        principles: [
          {
            id: 'principle-placeholder-1',
            title: 'PLACEHOLDER principle',
            explanation: 'PLACEHOLDER explanation.',
            questions: [
              question('question-prediction', 'prediction'),
              question('question-transfer', 'transfer'),
              question('question-gap', 'insufficient-information'),
            ],
          },
        ],
      }),
    );
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.some((issue) => issue.message.includes('needs missingData'))).toBe(true);
    }
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

  it('validate:strict fails an ordinary topic module and passes a complete one', () => {
    const directory = mkdtempSync(join(tmpdir(), 'resus-strict-'));
    const question = (id: string, kind: QuestionKind) => ({
      id,
      kind,
      prompt: 'PLACEHOLDER prompt.',
      answer: 'PLACEHOLDER answer.',
      reasoning: 'PLACEHOLDER reasoning.',
      conclusion: 'PLACEHOLDER conclusion.',
      causalChain: 'PLACEHOLDER chain.',
      assumption: 'PLACEHOLDER assumption.',
      misconception: 'PLACEHOLDER misconception.',
    });
    writeFileSync(join(directory, 'adult-cardiac-arrest.json'), JSON.stringify(placeholderCase()));
    const loose = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(repoRoot, 'scripts/validate-content.ts'), '--strict', directory],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    expect(loose.status).toBe(1);
    expect(loose.stdout).toContain('needs a kind');

    writeFileSync(
      join(directory, 'adult-cardiac-arrest.json'),
      JSON.stringify(
        placeholderCase({
          principles: [
            {
              id: 'principle-placeholder-1',
              title: 'PLACEHOLDER principle',
              explanation: 'PLACEHOLDER explanation.',
              questions: [
                question('question-prediction', 'prediction'),
                question('question-transfer', 'transfer'),
              ],
            },
          ],
        }),
      ),
    );
    const ready = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(repoRoot, 'scripts/validate-content.ts'), '--strict', directory],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    expect(ready.status).toBe(0);
    expect(ready.stdout).toContain('Content validation: PASS');
    expect(ready.stdout).toContain('uses deprecated conclusion; answer is canonical');
  });

  it('fits a two-level chapter without adding those parts to the published case', () => {
    const partIds = [
      'orientation',
      'normal-circulation',
      'cpr-circulation',
      'electrical-mechanical',
      'ventilation',
      'monitoring',
      'reversible-causes',
      'treatment',
      'after-rosc',
      'limits',
    ];
    const section = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      title: `PLACEHOLDER ${id}`,
      body: ['PLACEHOLDER paragraph.'],
      ...extra,
    });
    const cause = {
      id: 'bleed',
      name: 'PLACEHOLDER bleed',
      category: 'filling',
      failure: 'PLACEHOLDER failure.',
      rhythm: 'PLACEHOLDER rhythm.',
      causalChain: 'PLACEHOLDER chain.',
      compressions: 'PLACEHOLDER compressions.',
      fix: 'PLACEHOLDER fix.',
      bedside: 'PLACEHOLDER bedside.',
      limits: 'PLACEHOLDER limits.',
      examples: [
        {
          id: 'bleed-one',
          vignette: 'PLACEHOLDER vignette.',
          reasoning: 'PLACEHOLDER example reasoning.',
        },
      ],
    };
    const chapter = (principles: Record<string, unknown>[]) =>
      placeholderCase({
        principles,
        treatmentApproach: [
          {
            id: 'step-placeholder-1',
            title: 'PLACEHOLDER step',
            action: 'PLACEHOLDER action.',
            why: 'PLACEHOLDER why.',
            principleIds: ['treatment'],
          },
        ],
      });

    const principles = [
      ...partIds.map((id) =>
        section(
          id,
          id === 'reversible-causes'
            ? { causes: [cause], body: ['See [bleeding](#cause-bleed).'] }
            : id === 'limits'
              ? {
                  workedExample: {
                    id: 'limit-case',
                    title: 'PLACEHOLDER worked example',
                    body: ['PLACEHOLDER worked example paragraph.'],
                  },
                }
              : {},
        ),
      ),
      section('compression-mechanics', { parentId: 'cpr-circulation' }),
    ];
    const parsed = caseSchema.safeParse(chapter(principles));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.principles.map((principle) => principle.id)).toEqual([
      ...partIds,
      'compression-mechanics',
    ]);
    const subsection = parsed.data.principles.find((principle) => principle.id === 'compression-mechanics');
    expect(subsection?.questions).toEqual([]);

    const omitted = caseSchema.safeParse(
      chapter([
        ...partIds.map((id) => {
          const item = section(id) as { questions?: unknown };
          delete item.questions;
          return item;
        }),
      ]),
    );
    expect(omitted.success).toBe(true);

    const tooDeep = caseSchema.safeParse(
      chapter([
        ...principles,
        section('deeper-still', { parentId: 'compression-mechanics' }),
      ]),
    );
    expect(tooDeep.success).toBe(false);
    if (!tooDeep.success) {
      expect(tooDeep.error.issues.some((issue) => issue.message.includes('nested more than one level'))).toBe(
        true,
      );
    }

    const cycle = caseSchema.safeParse(
      chapter([
        section('orientation', { parentId: 'limits' }),
        section('limits', { parentId: 'orientation' }),
      ]),
    );
    expect(cycle.success).toBe(false);

    const missingParent = caseSchema.safeParse(
      chapter([section('orientation'), section('orphan', { parentId: 'missing-part' })]),
    );
    expect(missingParent.success).toBe(false);
    if (!missingParent.success) {
      expect(missingParent.error.issues.some((issue) => issue.message.includes('does not resolve'))).toBe(true);
    }

    const missingAnchor = caseSchema.safeParse(
      chapter([section('orientation', { body: ['See [a cause](#cause-missing).'] })]),
    );
    expect(missingAnchor.success).toBe(false);
    if (!missingAnchor.success) {
      expect(missingAnchor.error.issues.some((issue) => issue.message.includes('Unknown anchor'))).toBe(true);
    }

    const linkedExplanation = caseSchema.safeParse(
      chapter([
        ...partIds.map((id) =>
          section(
            id,
            id === 'cpr-circulation'
              ? {
                  explanation:
                    'Compressions replace the pump. See [the mechanics](#principle-cpr-mechanics).',
                }
              : {},
          ),
        ),
        section('cpr-mechanics', { parentId: 'cpr-circulation' }),
      ]),
    );
    expect(linkedExplanation.success).toBe(true);

    const missingExplanationAnchor = caseSchema.safeParse(
      chapter([
        section('orientation', {
          explanation: ['See [a later part](#principle-missing).'],
        }),
      ]),
    );
    expect(missingExplanationAnchor.success).toBe(false);
    if (!missingExplanationAnchor.success) {
      expect(
        missingExplanationAnchor.error.issues.some((issue) => issue.message.includes('Unknown anchor')),
      ).toBe(true);
    }

    const missingExplanationString = caseSchema.safeParse(
      chapter([
        section('orientation', {
          explanation: 'See [a later part](#principle-missing).',
        }),
      ]),
    );
    expect(missingExplanationString.success).toBe(false);
    if (!missingExplanationString.success) {
      expect(
        missingExplanationString.error.issues.some((issue) => issue.message.includes('Unknown anchor')),
      ).toBe(true);
    }

    const unsafeExplanationLink = caseSchema.safeParse(
      chapter([
        section('orientation', {
          explanation: 'See [bad](javascript:alert(1)).',
        }),
      ]),
    );
    expect(unsafeExplanationLink.success).toBe(false);
    if (!unsafeExplanationLink.success) {
      expect(
        unsafeExplanationLink.error.issues.some((issue) =>
          issue.message.includes('must be an http(s) URL or a #anchor'),
        ),
      ).toBe(true);
    }

    const noNarrative = caseSchema.safeParse(chapter([{ id: 'orientation', title: 'PLACEHOLDER orientation' }]));
    expect(noNarrative.success).toBe(false);

    const question = (id: string, kind: QuestionKind) => ({
      id,
      kind,
      prompt: 'PLACEHOLDER prompt.',
      answer: 'PLACEHOLDER answer.',
      causalChain: 'PLACEHOLDER chain.',
      assumption: 'PLACEHOLDER assumption.',
      misconception: 'PLACEHOLDER misconception.',
    });
    expect(
      caseSchema.safeParse(
        placeholderCase({
          strict: true,
          principles: [section('orientation')],
          treatmentApproach: [
            {
              id: 'step-placeholder-1',
              title: 'PLACEHOLDER step',
              action: 'PLACEHOLDER action.',
              why: 'PLACEHOLDER why.',
              principleIds: ['orientation'],
            },
          ],
        }),
      ).success,
    ).toBe(true);

    const childOnly = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        principles: [
          section('cpr-circulation'),
          section('compression-mechanics', {
            parentId: 'cpr-circulation',
            questions: [question('question-prediction', 'prediction')],
          }),
        ],
        treatmentApproach: [
          {
            id: 'step-placeholder-1',
            title: 'PLACEHOLDER step',
            action: 'PLACEHOLDER action.',
            why: 'PLACEHOLDER why.',
            principleIds: ['cpr-circulation'],
          },
        ],
      }),
    );
    expect(childOnly.success).toBe(false);
    if (!childOnly.success) {
      expect(childOnly.error.issues.some((issue) => issue.message.includes('transfer question'))).toBe(true);
    }

    const acrossThePart = caseSchema.safeParse(
      placeholderCase({
        strict: true,
        principles: [
          section('cpr-circulation', { questions: [question('question-transfer', 'transfer')] }),
          section('compression-mechanics', {
            parentId: 'cpr-circulation',
            questions: [question('question-prediction', 'prediction')],
          }),
        ],
        treatmentApproach: [
          {
            id: 'step-placeholder-1',
            title: 'PLACEHOLDER step',
            action: 'PLACEHOLDER action.',
            why: 'PLACEHOLDER why.',
            principleIds: ['cpr-circulation'],
          },
        ],
      }),
    );
    expect(acrossThePart.success).toBe(true);
  });
});
