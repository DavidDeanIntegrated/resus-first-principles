import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { caseSchema, questionKindSchema, strictContentIssues, type CaseDocument } from './schema.ts';

export interface ValidatedCaseFile {
  file: string;
  document: CaseDocument;
}

export interface ContentValidationSuccess {
  ok: true;
  directory: string;
  cases: ValidatedCaseFile[];
}

export interface ContentValidationFailure {
  ok: false;
  directory: string;
  errors: string[];
}

export type ContentValidationResult = ContentValidationSuccess | ContentValidationFailure;

function countContent(document: CaseDocument) {
  const kinds = {
    prediction: 0,
    transfer: 0,
    'evidence-boundary': 0,
    'insufficient-information': 0,
  };
  let questions = 0;
  let causes = 0;
  let examples = 0;
  for (const principle of document.principles) {
    questions += principle.questions.length;
    for (const question of principle.questions) {
      if (question.kind) kinds[question.kind] += 1;
    }
    for (const cause of principle.causes ?? []) {
      causes += 1;
      examples += cause.examples.length;
    }
  }
  return {
    principles: document.principles.length,
    questions,
    kinds,
    causes,
    examples,
    steps: document.treatmentApproach.length,
  };
}

function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export function validateContentDirectory(
  directory: string,
  options: { strict?: boolean } = {},
): ContentValidationResult {
  const root = resolve(directory);
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, directory: root, errors: [`Cannot read content directory: ${message}`] };
  }

  const jsonFiles = entries.filter((entry) => entry.endsWith('.json')).sort();
  const unexpected = entries.filter((entry) => {
    if (entry.startsWith('.')) return false;
    const path = join(root, entry);
    return statSync(path).isFile() && !entry.endsWith('.json');
  });

  const errors: string[] = unexpected.map(
    (entry) => `${entry}: only .json case files are allowed in the content directory`,
  );

  if (jsonFiles.length === 0) {
    errors.push('No case files found. Add at least one .json file.');
  }

  const cases: ValidatedCaseFile[] = [];

  for (const file of jsonFiles) {
    const path = join(root, file);
    const text = readFileSync(path, 'utf8');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${file}: invalid JSON (${message})`);
      continue;
    }

    const parsed = caseSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${file}: ${formatIssues(parsed.error)}`);
      continue;
    }

    if (options.strict && !parsed.data.strict) {
      const issues = strictContentIssues(parsed.data);
      if (issues.length > 0) {
        const detail = issues
          .map((issue) => {
            const path = issue.path.map(String).join('.') || '(root)';
            return `${path}: ${issue.message}`;
          })
          .join('; ');
        errors.push(`${file}: ${detail}`);
        continue;
      }
    }

    const expectedName = `${parsed.data.slug}.json`;
    if (file !== expectedName) {
      errors.push(`${file}: filename must be ${expectedName} so it matches the slug`);
      continue;
    }

    cases.push({ file, document: parsed.data });
  }

  if (errors.length > 0) {
    return { ok: false, directory: root, errors };
  }

  return { ok: true, directory: root, cases };
}

export function formatValidationReport(result: ContentValidationResult): string {
  const directory = relative(process.cwd(), result.directory) || result.directory;
  if (!result.ok) {
    const lines = [
      'Content validation: FAIL',
      `Directory: ${directory}`,
      ...result.errors.map((error) => `- ${error}`),
    ];
    return lines.join('\n');
  }

  const lines = [
    'Content validation: PASS',
    `Directory: ${directory}`,
    `Cases: ${result.cases.length}`,
    ...result.cases.map(({ file, document }) => {
      const counts = countContent(document);
      const kinds = questionKindSchema.options
        .map((kind) => `${kind}=${counts.kinds[kind]}`)
        .join(' ');
      return `- ${file} slug=${document.slug} status=${document.contentStatus} principles=${counts.principles} questions=${counts.questions} ${kinds} causes=${counts.causes} examples=${counts.examples} steps=${counts.steps}`;
    }),
  ];
  return lines.join('\n');
}
