import { z } from 'zod';

const idSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use a lowercase slug of letters, numbers, and single hyphens',
  );

const textSchema = z.string().trim().min(1);

export const questionSchema = z.object({
  id: idSchema,
  prompt: textSchema,
  answer: textSchema,
  reasoning: textSchema,
});

export const principleSchema = z.object({
  id: idSchema,
  title: textSchema,
  explanation: textSchema,
  questions: z.array(questionSchema).min(1),
});

export const treatmentStepSchema = z.object({
  id: idSchema,
  title: textSchema,
  action: textSchema,
  why: textSchema,
  principleIds: z.array(idSchema).min(1),
});

export const caseSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    slug: idSchema,
    title: textSchema,
    summary: textSchema,
    contentStatus: z.enum(['placeholder', 'published']),
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
  });

export type Question = z.infer<typeof questionSchema>;
export type Principle = z.infer<typeof principleSchema>;
export type TreatmentStep = z.infer<typeof treatmentStepSchema>;
export type CaseDocument = z.infer<typeof caseSchema>;
