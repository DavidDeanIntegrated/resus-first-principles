import { z } from 'zod';
import { markdownHrefs } from './markdown.ts';
import { asParagraphs } from './prose.ts';
import { anchorIds, sectionTree } from './sections.ts';

const idSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use a lowercase slug of letters, numbers, and single hyphens',
  );

const textSchema = z.string().trim().min(1);

/** One paragraph, or several paragraphs rendered as separate `<p>` elements. */
export const proseSchema = z.union([textSchema, z.array(textSchema).min(1)]);

export const questionKindSchema = z.enum([
  'prediction',
  'transfer',
  'evidence-boundary',
  'insufficient-information',
]);

const refsSchema = z.array(idSchema).min(1);

/** Parts a strict question must include. `conclusion` is deprecated and is not one of them. */
export const answerPartKeys = ['causalChain', 'assumption', 'misconception'] as const;

export type AnswerPartKey = (typeof answerPartKeys)[number];

export const questionSchema = z.object({
  id: idSchema,
  kind: questionKindSchema.optional(),
  prompt: textSchema,
  answer: proseSchema,
  reasoning: proseSchema.optional(),
  conclusion: proseSchema.optional(),
  causalChain: proseSchema.optional(),
  assumption: proseSchema.optional(),
  misconception: proseSchema.optional(),
  missingData: proseSchema.optional(),
  refs: refsSchema.optional(),
});

export const causeCategorySchema = z.enum([
  'filling',
  'obstruction',
  'contractility-electrical',
  'oxygen-content',
]);

export const causeExampleSchema = z.object({
  id: idSchema,
  vignette: proseSchema,
  reasoning: proseSchema,
  causeIds: z.array(idSchema).min(1).optional(),
});

export const causeSchema = z.object({
  id: idSchema,
  name: textSchema,
  category: causeCategorySchema,
  failure: proseSchema,
  rhythm: proseSchema,
  causalChain: proseSchema,
  compressions: proseSchema,
  fix: proseSchema,
  bedside: proseSchema,
  mimics: proseSchema.optional(),
  limits: proseSchema,
  examples: z.array(causeExampleSchema).min(1),
  refs: refsSchema.optional(),
});

export const diagramIdSchema = z.enum(['pressure-gradient', 'compression-pause']);

export const workedExampleSchema = z.object({
  id: idSchema,
  title: textSchema,
  body: z.array(textSchema).min(1),
});

export const principleSchema = z.object({
  id: idSchema,
  parentId: idSchema.optional(),
  title: textSchema,
  explanation: proseSchema.optional(),
  body: z.array(textSchema).min(1).optional(),
  refs: refsSchema.optional(),
  questions: z.array(questionSchema).default([]),
  causes: z.array(causeSchema).min(1).optional(),
  diagram: diagramIdSchema.optional(),
  workedExample: workedExampleSchema.optional(),
});

export const treatmentStepSchema = z.object({
  id: idSchema,
  title: textSchema,
  action: textSchema,
  why: textSchema,
  principleIds: z.array(idSchema).min(1),
  refs: refsSchema.optional(),
});

export const referenceSchema = z.object({
  id: idSchema,
  label: textSchema,
  url: z.url(),
  note: textSchema.optional(),
});

export interface StrictContentIssue {
  path: (string | number)[];
  message: string;
}

type StrictQuestion = {
  id: string;
  kind?: z.infer<typeof questionKindSchema>;
  conclusion?: z.infer<typeof proseSchema>;
  causalChain?: z.infer<typeof proseSchema>;
  assumption?: z.infer<typeof proseSchema>;
  misconception?: z.infer<typeof proseSchema>;
  missingData?: z.infer<typeof proseSchema>;
};

type StrictExample = {
  id: string;
  causeIds?: string[];
};

type StrictCause = {
  id: string;
  examples: StrictExample[];
  refs?: string[];
};

type StrictPrinciple = {
  id: string;
  parentId?: string;
  questions?: StrictQuestion[];
  causes?: StrictCause[];
};

/** Rules for a future content pass. Not applied unless the case sets `strict: true` or validate is run with `--strict`. */
export function strictContentIssues(value: {
  principles: StrictPrinciple[];
  references?: { id: string }[];
}): StrictContentIssue[] {
  const issues: StrictContentIssue[] = [];
  const referenceIds = new Set((value.references ?? []).map((reference) => reference.id));
  const knownCauseIds = new Set<string>();
  value.principles.forEach((principle) => {
    principle.causes?.forEach((cause) => knownCauseIds.add(cause.id));
  });

  value.principles.forEach((principle, index) => {
    (principle.questions ?? []).forEach((question, questionIndex) => {
      if (!question.kind) {
        issues.push({
          path: ['principles', index, 'questions', questionIndex, 'kind'],
          message: `Question "${question.id}" needs a kind (prediction, transfer, evidence-boundary, or insufficient-information)`,
        });
      }
      if (question.kind === 'insufficient-information' && question.missingData == null) {
        issues.push({
          path: ['principles', index, 'questions', questionIndex, 'missingData'],
          message: `Question "${question.id}" needs missingData`,
        });
      }
      for (const key of answerPartKeys) {
        if (question[key] == null) {
          issues.push({
            path: ['principles', index, 'questions', questionIndex, key],
            message: `Question "${question.id}" needs ${key}`,
          });
        }
      }
    });

    principle.causes?.forEach((cause, causeIndex) => {
      if (cause.examples.length < 2) {
        issues.push({
          path: ['principles', index, 'causes', causeIndex, 'examples'],
          message: `Cause "${cause.id}" needs at least 2 examples`,
        });
      }
      cause.examples.forEach((example, exampleIndex) => {
        const linked = new Set<string>();
        example.causeIds?.forEach((causeId, causeIdIndex) => {
          if (!knownCauseIds.has(causeId)) {
            issues.push({
              path: [
                'principles',
                index,
                'causes',
                causeIndex,
                'examples',
                exampleIndex,
                'causeIds',
                causeIdIndex,
              ],
              message: `Example "${example.id}" links unknown cause "${causeId}"`,
            });
          }
          if (linked.has(causeId)) {
            issues.push({
              path: [
                'principles',
                index,
                'causes',
                causeIndex,
                'examples',
                exampleIndex,
                'causeIds',
                causeIdIndex,
              ],
              message: `Example "${example.id}" links cause "${causeId}" more than once`,
            });
          }
          linked.add(causeId);
        });
      });
      const seenRefs = new Set<string>();
      cause.refs?.forEach((refId, refIndex) => {
        if (!referenceIds.has(refId)) {
          issues.push({
            path: ['principles', index, 'causes', causeIndex, 'refs', refIndex],
            message: `Unknown reference "${refId}"`,
          });
        }
        if (seenRefs.has(refId)) {
          issues.push({
            path: ['principles', index, 'causes', causeIndex, 'refs', refIndex],
            message: `Duplicate reference "${refId}"`,
          });
        }
        seenRefs.add(refId);
      });
    });
  });

  for (const root of sectionTree(value.principles)) {
    const members = [root.item, ...root.children.map((child) => child.item)];
    const questions = members.flatMap((member) => member.questions ?? []);
    if (questions.length === 0) continue;
    const rootIndex = value.principles.findIndex((principle) => principle.id === root.item.id);
    if (!questions.some((question) => question.kind === 'prediction')) {
      issues.push({
        path: ['principles', rootIndex, 'questions'],
        message: `Principle "${root.item.id}" needs at least one prediction question`,
      });
    }
    if (!questions.some((question) => question.kind === 'transfer')) {
      issues.push({
        path: ['principles', rootIndex, 'questions'],
        message: `Principle "${root.item.id}" needs at least one transfer question`,
      });
    }
  }

  return issues;
}

/** Strict mode reports these, but they do not fail validation. `answer` is canonical. */
export function deprecatedConclusionWarnings(value: {
  principles: ReadonlyArray<{ questions?: ReadonlyArray<{ id: string; conclusion?: unknown }> }>;
}): StrictContentIssue[] {
  const issues: StrictContentIssue[] = [];
  value.principles.forEach((principle, index) => {
    (principle.questions ?? []).forEach((question, questionIndex) => {
      if (question.conclusion != null) {
        issues.push({
          path: ['principles', index, 'questions', questionIndex, 'conclusion'],
          message: `Question "${question.id}" uses deprecated conclusion; answer is canonical`,
        });
      }
    });
  });
  return issues;
}

export const caseSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    slug: idSchema,
    title: textSchema,
    summary: textSchema,
    contentStatus: z.enum(['placeholder', 'published']),
    strict: z.boolean().optional(),
    reviewNote: textSchema.optional(),
    references: z.array(referenceSchema).min(1).optional(),
    principles: z.array(principleSchema).min(1),
    treatmentApproach: z.array(treatmentStepSchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (value.id !== value.slug) {
      ctx.addIssue({
        code: 'custom',
        message: 'id must match slug',
        path: ['id'],
      });
    }

    if (
      value.contentStatus === 'placeholder' &&
      !`${value.title}\n${value.summary}`.toUpperCase().includes('PLACEHOLDER')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Placeholder cases must include the word PLACEHOLDER in the title or summary',
        path: ['summary'],
      });
    }

    const principleIds = new Set<string>();
    const questionIds = new Set<string>();
    const causeIds = new Set<string>();
    const exampleIds = new Set<string>();
    const workedExampleIds = new Set<string>();

    value.principles.forEach((principle, index) => {
      if (principleIds.has(principle.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate principle id "${principle.id}"`,
          path: ['principles', index, 'id'],
        });
      }
      principleIds.add(principle.id);

      if (principle.explanation == null && principle.body == null) {
        ctx.addIssue({
          code: 'custom',
          message: `Section "${principle.id}" needs explanation or body`,
          path: ['principles', index, 'body'],
        });
      }

      if (principle.workedExample) {
        if (workedExampleIds.has(principle.workedExample.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate worked example id "${principle.workedExample.id}"`,
            path: ['principles', index, 'workedExample', 'id'],
          });
        }
        workedExampleIds.add(principle.workedExample.id);
      }

      principle.causes?.forEach((cause, causeIndex) => {
        if (causeIds.has(cause.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate cause id "${cause.id}"`,
            path: ['principles', index, 'causes', causeIndex, 'id'],
          });
        }
        causeIds.add(cause.id);
        cause.examples.forEach((example, exampleIndex) => {
          if (exampleIds.has(example.id)) {
            ctx.addIssue({
              code: 'custom',
              message: `Duplicate example id "${example.id}"`,
              path: ['principles', index, 'causes', causeIndex, 'examples', exampleIndex, 'id'],
            });
          }
          exampleIds.add(example.id);
        });
      });

      principle.questions.forEach((question, questionIndex) => {
        if (questionIds.has(question.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate question id "${question.id}"`,
            path: ['principles', index, 'questions', questionIndex, 'id'],
          });
        }
        questionIds.add(question.id);

        const hasPart =
          answerPartKeys.some((key) => question[key] != null) || question.conclusion != null;
        if (question.reasoning == null && !hasPart) {
          ctx.addIssue({
            code: 'custom',
            message: `Question "${question.id}" needs reasoning or an answer part`,
            path: ['principles', index, 'questions', questionIndex, 'reasoning'],
          });
        }
      });
    });

    value.principles.forEach((principle, index) => {
      if (!principle.parentId) return;
      if (principle.parentId === principle.id || !principleIds.has(principle.parentId)) {
        ctx.addIssue({
          code: 'custom',
          message: principleIds.has(principle.parentId)
            ? `Section "${principle.id}" cannot be its own parent`
            : `Section "${principle.id}" parent "${principle.parentId}" does not resolve`,
          path: ['principles', index, 'parentId'],
        });
        return;
      }
      const parent = value.principles.find((item) => item.id === principle.parentId);
      if (parent?.parentId) {
        ctx.addIssue({
          code: 'custom',
          message: `Section "${principle.id}" is nested more than one level. Only a top-level part and its subsections are allowed`,
          path: ['principles', index, 'parentId'],
        });
      }
    });

    const stepIds = new Set<string>();
    value.treatmentApproach.forEach((step, index) => {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate treatment step id "${step.id}"`,
          path: ['treatmentApproach', index, 'id'],
        });
      }
      stepIds.add(step.id);

      const linked = new Set<string>();
      step.principleIds.forEach((principleId, principleIndex) => {
        if (!principleIds.has(principleId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Treatment step "${step.id}" links unknown principle "${principleId}"`,
            path: ['treatmentApproach', index, 'principleIds', principleIndex],
          });
        }
        if (linked.has(principleId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Treatment step "${step.id}" links principle "${principleId}" more than once`,
            path: ['treatmentApproach', index, 'principleIds', principleIndex],
          });
        }
        linked.add(principleId);
      });
    });

    const referenceIds = new Set<string>();
    (value.references ?? []).forEach((reference, index) => {
      if (referenceIds.has(reference.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate reference id "${reference.id}"`,
          path: ['references', index, 'id'],
        });
      }
      referenceIds.add(reference.id);
    });

    const checkRefs = (refs: string[] | undefined, path: (string | number)[]) => {
      if (!refs) return;
      const seen = new Set<string>();
      refs.forEach((refId, refIndex) => {
        if (!referenceIds.has(refId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown reference "${refId}"`,
            path: [...path, refIndex],
          });
        }
        if (seen.has(refId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate reference "${refId}"`,
            path: [...path, refIndex],
          });
        }
        seen.add(refId);
      });
    };

    value.principles.forEach((principle, index) => {
      checkRefs(principle.refs, ['principles', index, 'refs']);
      principle.questions.forEach((question, questionIndex) => {
        checkRefs(question.refs, ['principles', index, 'questions', questionIndex, 'refs']);
      });
      principle.causes?.forEach((cause, causeIndex) => {
        checkRefs(cause.refs, ['principles', index, 'causes', causeIndex, 'refs']);
      });
    });
    value.treatmentApproach.forEach((step, index) => {
      checkRefs(step.refs, ['treatmentApproach', index, 'refs']);
    });

    const anchors = anchorIds(value);
    const checkLinks = (paragraphs: string[] | undefined, path: (string | number)[]) => {
      paragraphs?.forEach((paragraph, paragraphIndex) => {
        markdownHrefs(paragraph).forEach((href) => {
          if (href.startsWith('#')) {
            const anchor = href.slice(1);
            if (!anchors.has(anchor)) {
              ctx.addIssue({
                code: 'custom',
                message: `Unknown anchor "${anchor}"`,
                path: [...path, paragraphIndex],
              });
            }
            return;
          }
          if (!/^https?:\/\//.test(href)) {
            ctx.addIssue({
              code: 'custom',
              message: `Link "${href}" must be an http(s) URL or a #anchor`,
              path: [...path, paragraphIndex],
            });
          }
        });
      });
    };

    value.principles.forEach((principle, index) => {
      if (principle.explanation != null) {
        checkLinks(asParagraphs(principle.explanation), ['principles', index, 'explanation']);
      }
      checkLinks(principle.body, ['principles', index, 'body']);
      checkLinks(principle.workedExample?.body, ['principles', index, 'workedExample', 'body']);
    });

    if (value.strict) {
      for (const issue of strictContentIssues(value)) {
        ctx.addIssue({
          code: 'custom',
          message: issue.message,
          path: issue.path,
        });
      }
    }
  });

export type Prose = z.infer<typeof proseSchema>;
export type QuestionKind = z.infer<typeof questionKindSchema>;
export type Question = z.infer<typeof questionSchema>;
export type CauseCategory = z.infer<typeof causeCategorySchema>;
export type CauseExample = z.infer<typeof causeExampleSchema>;
export type Cause = z.infer<typeof causeSchema>;
export type DiagramId = z.infer<typeof diagramIdSchema>;
export type WorkedExample = z.infer<typeof workedExampleSchema>;
export type Principle = z.infer<typeof principleSchema>;
export type TreatmentStep = z.infer<typeof treatmentStepSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type CaseDocument = z.infer<typeof caseSchema>;
