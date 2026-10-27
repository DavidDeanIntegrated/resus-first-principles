import { stripInlineMarkdown } from './markdown.ts';
import { asParagraphs, type ProseText } from './prose.ts';
import type { CaseDocument } from './schema.ts';

export const wordsPerMinute = 230;

/** Words a reader reads: link labels count, link targets and markdown marks do not. */
export function countWords(text: string): number {
  return stripInlineMarkdown(text)
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function proseWords(text: ProseText | undefined): number {
  return text == null ? 0 : asParagraphs(text).reduce((sum, paragraph) => sum + countWords(paragraph), 0);
}

/**
 * Prose a reader reads on a chapter page: section text, worked examples, causes, question
 * prompts and answers, and treatment steps. Figures, tables, references, citation marks,
 * question kinds and the review note are left out.
 */
export function chapterWords(chapter: CaseDocument): number {
  let words = proseWords(chapter.title) + proseWords(chapter.summary);
  for (const principle of chapter.principles) {
    words += proseWords(principle.title) + proseWords(principle.explanation) + proseWords(principle.body);
    if (principle.workedExample) {
      words += proseWords(principle.workedExample.title) + proseWords(principle.workedExample.body);
    }
    for (const cause of principle.causes ?? []) {
      words +=
        proseWords(cause.name) +
        proseWords(cause.failure) +
        proseWords(cause.rhythm) +
        proseWords(cause.causalChain) +
        proseWords(cause.compressions) +
        proseWords(cause.fix) +
        proseWords(cause.bedside) +
        proseWords(cause.mimics) +
        proseWords(cause.limits);
      for (const example of cause.examples) {
        words += proseWords(example.vignette) + proseWords(example.reasoning);
      }
    }
    for (const question of principle.questions) {
      words +=
        proseWords(question.prompt) +
        proseWords(question.answer) +
        proseWords(question.reasoning) +
        proseWords(question.causalChain) +
        proseWords(question.assumption) +
        proseWords(question.misconception) +
        proseWords(question.missingData);
    }
  }
  for (const step of chapter.treatmentApproach) {
    words += proseWords(step.title) + proseWords(step.action) + proseWords(step.why);
  }
  return words;
}

/** Whole minutes at about 230 words per minute, never less than one. */
export function readingMinutes(chapter: CaseDocument): number {
  return Math.max(1, Math.round(chapterWords(chapter) / wordsPerMinute));
}

/** The ABC grouping the home index shows beside each chapter. */
const systemLabels: Readonly<Record<string, string>> = {
  'physiologically-difficult-airway': 'Airway',
  'acute-respiratory-failure': 'Breathing',
  'cardiogenic-pulmonary-edema': 'Breathing',
  'shock-pressure-flow': 'Circulation',
  'septic-shock': 'Circulation',
  'adult-cardiac-arrest': 'Arrest',
};

export const systemOrder = ['Airway', 'Breathing', 'Circulation', 'Arrest'] as const;

export function systemLabel(slug: string): string | undefined {
  return systemLabels[slug];
}
