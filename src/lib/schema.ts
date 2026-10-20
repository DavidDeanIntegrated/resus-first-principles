import { z } from 'zod';

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

export const questionKindSchema = z.enum(['prediction', 'transfer', 'evidence-boundary']);

const refsSchema = z.array(idSchema).min(1);

export const answerPartKeys = ['conclusion', 'causalChain', 'assumption', 'misconception'] as const;

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
  refs: refsSchema.optional(),
});

export const principleSchema = z.object({
  id: idSchema,
  title: textSchema,
  explanation: proseSchema,
  refs: refsSchema.optional(),
  questions: z.array(questionSchema).min(1),
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
};

type StrictPrinciple = {
  id: string;
  questions: StrictQuestion[];
};

/** Rules for a future content pass. Not applied unless the case sets `strict: true` or validate is run with `--strict`. */
export function strictContentIssues(value: { principles: StrictPrinciple[] }): StrictContentIssue[] {
  const issues: StrictContentIssue[] = [];

  value.principles.forEach((principle, index) => {
    let hasPrediction = false;
    let hasTransfer = false;

    principle.questions.forEach((question, questionIndex) => {
      if (question.kind === 'prediction') hasPrediction = true;
      if (question.kind === 'transfer') hasTransfer = true;
      if (!question.kind) {
        issues.push({
          path: ['principles', index, 'questions', questionIndex, 'kind'],
          message: `Question "${question.id}" needs a kind (prediction, transfer, or evidence-boundary)`,
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

    if (!hasPrediction) {
      issues.push({
        path: ['principles', index, 'questions'],
        message: `Principle "${principle.id}" needs at least one prediction question`,
      });
    }
    if (!hasTransfer) {
      issues.push({
        path: ['principles', index, 'questions'],
        message: `Principle "${principle.id}" needs at least one transfer question`,
      });
    }
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

    value.principles.forEach((principle, index) => {
      if (principleIds.has(principle.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate principle id "${principle.id}"`,
          path: ['principles', index, 'id'],
        });
      }
      principleIds.add(principle.id);

      principle.questions.forEach((question, questionIndex) => {
        if (questionIds.has(question.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate question id "${question.id}"`,
            path: ['principles', index, 'questions', questionIndex, 'id'],
          });
        }
        questionIds.add(question.id);

        const hasPart = answerPartKeys.some((key) => question[key] != null);
        if (question.reasoning == null && !hasPart) {
          ctx.addIssue({
            code: 'custom',
            message: `Question "${question.id}" needs reasoning or an answer part`,
            path: ['principles', index, 'questions', questionIndex, 'reasoning'],
          });
        }
      });
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
    });
    value.treatmentApproach.forEach((step, index) => {
      checkRefs(step.refs, ['treatmentApproach', index, 'refs']);
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
export type Principle = z.infer<typeof principleSchema>;
export type TreatmentStep = z.infer<typeof treatmentStepSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type CaseDocument = z.infer<typeof caseSchema>;
