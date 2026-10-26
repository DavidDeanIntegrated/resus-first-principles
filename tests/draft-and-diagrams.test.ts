import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  chaptersForBuild,
  chaptersForDiscovery,
  chapterRobots,
  includeChapter,
  isPreviewBuild,
  listingRobots,
  type BuildEnv,
  type PublicSurface,
} from '../src/lib/publish.ts';
import {
  caseSchema,
  chapterDiagramRegistry,
  declaredDiagramIds,
  diagramIdSchema,
  type CaseDocument,
  type ContentStatus,
} from '../src/lib/schema.ts';
import { validateContentDirectory } from '../src/lib/validate-content.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const contentDirectory = join(repoRoot, 'src/content/cases');
const surfaces = ['route', 'index', 'sitemap', 'feed', 'search'] as const satisfies readonly PublicSurface[];

function chapter(overrides: Record<string, unknown> = {}): CaseDocument {
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

function withDiagram(diagram: unknown, overrides: Record<string, unknown> = {}) {
  const base = chapter();
  const principle = base.principles[0];
  if (!principle) throw new Error('fixture missing principle');
  return chapter({
    ...overrides,
    principles: [{ ...principle, diagram }],
  });
}

describe('draft chapters on preview builds only', () => {
  const productionEnvs: BuildEnv[] = [
    {},
    { VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'development' },
    { VERCEL_ENV: 'staging' },
    { WORKERS_CI: '1' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: '  main  ' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: '' },
    { WORKERS_CI_BRANCH: 'feature' },
    { CI: 'true' },
    { VERCEL_ENV: 'production', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'feature' },
    { VERCEL_ENV: 'preview', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
  ];
  const previewEnvs: BuildEnv[] = [
    { VERCEL_ENV: 'preview' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'cursor/draft-status-diagram-ids-fcca' },
  ];

  it('treats an unclear build as production and a platform preview as preview', () => {
    for (const env of productionEnvs) expect(isPreviewBuild(env), JSON.stringify(env)).toBe(false);
    for (const env of previewEnvs) expect(isPreviewBuild(env), JSON.stringify(env)).toBe(true);
  });

  it('excludes a draft from production and includes it on preview routes and the index', () => {
    const chapters: { slug: string; contentStatus: ContentStatus }[] = [
      { slug: 'adult-cardiac-arrest', contentStatus: 'published' },
      { slug: 'shock-pressure-flow', contentStatus: 'published' },
      { slug: 'future-chapter', contentStatus: 'draft' },
      { slug: 'old-placeholder', contentStatus: 'placeholder' },
    ];

    for (const env of productionEnvs) {
      expect(chaptersForBuild(chapters, env).map((entry) => entry.slug)).toEqual([
        'adult-cardiac-arrest',
        'shock-pressure-flow',
        'old-placeholder',
      ]);
      for (const surface of ['route', 'index'] as const) {
        expect(includeChapter('draft', surface, env)).toBe(false);
        expect(includeChapter('published', surface, env)).toBe(true);
        expect(includeChapter('placeholder', surface, env)).toBe(true);
      }
    }

    for (const env of previewEnvs) {
      expect(chaptersForBuild(chapters, env).map((entry) => entry.slug)).toEqual([
        'adult-cardiac-arrest',
        'shock-pressure-flow',
        'future-chapter',
        'old-placeholder',
      ]);
      expect(includeChapter('draft', 'route', env)).toBe(true);
      expect(includeChapter('draft', 'index', env)).toBe(true);
    }
  });

  it('keeps a draft out of the sitemap, feeds, and search index', () => {
    const chapters: { slug: string; contentStatus: ContentStatus }[] = [
      { slug: 'adult-cardiac-arrest', contentStatus: 'published' },
      { slug: 'future-chapter', contentStatus: 'draft' },
      { slug: 'old-placeholder', contentStatus: 'placeholder' },
    ];
    const visible = ['adult-cardiac-arrest', 'old-placeholder'];
    for (const env of [...productionEnvs, ...previewEnvs]) {
      for (const surface of ['sitemap', 'feed', 'search'] as const) {
        expect(includeChapter('draft', surface, env)).toBe(false);
        expect(
          chapters.filter((entry) => includeChapter(entry.contentStatus, surface, env)).map((entry) => entry.slug),
        ).toEqual(visible);
      }
    }
    expect(chaptersForDiscovery(chapters).map((entry) => entry.slug)).toEqual(visible);
  });

  it('marks a rendered draft noindex and leaves published pages indexable', () => {
    expect(chapterRobots('draft')).toBe('noindex');
    expect(chapterRobots('published')).toBeNull();
    expect(chapterRobots('placeholder')).toBeNull();
    expect(listingRobots(['published', 'draft'])).toBe('noindex');
    expect(listingRobots(['published', 'placeholder'])).toBeNull();
  });

  it('accepts a draft that is not marked as a placeholder', () => {
    const parsed = caseSchema.safeParse(
      chapter({
        id: 'future-chapter',
        slug: 'future-chapter',
        contentStatus: 'draft',
        title: 'Future chapter',
        summary: 'A chapter that is not ready for the public site.',
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.contentStatus).toBe('draft');
  });
});

describe('per-chapter diagram ids', () => {
  it('leaves the published chapters and their diagram ids unchanged', () => {
    const result = validateContentDirectory(contentDirectory);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases.map((entry) => entry.document.slug).sort()).toEqual([
      'adult-cardiac-arrest',
      'septic-shock',
      'shock-pressure-flow',
    ]);
    const published = new Set(['adult-cardiac-arrest', 'shock-pressure-flow']);
    for (const entry of result.cases) {
      if (!published.has(entry.document.slug)) continue;
      const document = entry.document;
      expect(document.contentStatus).toBe('published');
      expect(document.diagrams).toBeUndefined();
      const used = document.principles.flatMap((principle) => {
        if (!principle.diagram) return [];
        return [typeof principle.diagram === 'string' ? principle.diagram : principle.diagram.id];
      });
      expect(new Set(used)).toEqual(new Set(declaredDiagramIds(document)));
      expect([...declaredDiagramIds(document)]).toEqual([
        ...chapterDiagramRegistry[document.slug as keyof typeof chapterDiagramRegistry],
      ]);
      for (const surface of surfaces) {
        expect(includeChapter(document.contentStatus, surface, {})).toBe(true);
        expect(includeChapter(document.contentStatus, surface, { VERCEL_ENV: 'preview' })).toBe(true);
      }
    }

    const arrest = JSON.parse(readFileSync(join(contentDirectory, 'adult-cardiac-arrest.json'), 'utf8'));
    const shock = JSON.parse(readFileSync(join(contentDirectory, 'shock-pressure-flow.json'), 'utf8'));
    expect(caseSchema.safeParse(arrest).success).toBe(true);
    expect(caseSchema.safeParse(shock).success).toBe(true);
  });

  it('accepts a diagram id declared for that chapter', () => {
    const parsed = caseSchema.safeParse(
      withDiagram('starling-curve', {
        id: 'future-chapter',
        slug: 'future-chapter',
        contentStatus: 'draft',
        title: 'Future chapter',
        summary: 'A chapter that is not ready for the public site.',
        diagrams: ['starling-curve'],
      }),
    );
    expect(parsed.success).toBe(true);
    expect(diagramIdSchema.safeParse('starling-curve').success).toBe(false);

    const withCaption = caseSchema.safeParse(
      withDiagram(
        { id: 'starling-curve', caption: 'A chapter figure.', alt: 'A curve of stroke volume against filling.' },
        {
          id: 'future-chapter',
          slug: 'future-chapter',
          contentStatus: 'draft',
          title: 'Future chapter',
          summary: 'A chapter that is not ready for the public site.',
          diagrams: ['starling-curve'],
        },
      ),
    );
    expect(withCaption.success).toBe(true);
  });

  it('rejects a diagram id that the chapter does not declare', () => {
    const undeclared = caseSchema.safeParse(
      withDiagram('other-curve', {
        id: 'future-chapter',
        slug: 'future-chapter',
        contentStatus: 'draft',
        title: 'Future chapter',
        summary: 'A chapter that is not ready for the public site.',
        diagrams: ['starling-curve'],
      }),
    );
    expect(undeclared.success).toBe(false);
    if (!undeclared.success) {
      expect(undeclared.error.issues.some((issue) => issue.message.includes('not declared'))).toBe(true);
    }

    const knownElsewhere = caseSchema.safeParse(
      withDiagram('pressure-gradient', {
        id: 'shock-pressure-flow',
        slug: 'shock-pressure-flow',
        contentStatus: 'published',
        title: 'Example case',
        summary: 'A non-placeholder shape used only to prove chapter diagram lists.',
      }),
    );
    expect(knownElsewhere.success).toBe(false);
    if (!knownElsewhere.success) {
      expect(knownElsewhere.error.issues.some((issue) => issue.message.includes('not declared'))).toBe(true);
    }
  });

  it('keeps the existing shock and cardiac arrest diagram shapes', () => {
    for (const id of chapterDiagramRegistry['shock-pressure-flow']) {
      expect(diagramIdSchema.options).toContain(id);
    }
    for (const id of chapterDiagramRegistry['adult-cardiac-arrest']) {
      expect(diagramIdSchema.options).toContain(id);
    }

    const shockString = caseSchema.safeParse(
      withDiagram('shock-pressure-flow', {
        id: 'shock-pressure-flow',
        slug: 'shock-pressure-flow',
        contentStatus: 'published',
        title: 'Example case',
        summary: 'A non-placeholder shape used only to prove chapter diagram lists.',
      }),
    );
    expect(shockString.success).toBe(false);
    if (!shockString.success) {
      expect(shockString.error.issues.some((issue) => issue.message.includes('caption and alt'))).toBe(true);
    }

    const arrestObject = caseSchema.safeParse(
      withDiagram(
        { id: 'pressure-gradient', caption: 'Caption.', alt: 'Alt.' },
        {
          id: 'adult-cardiac-arrest',
          slug: 'adult-cardiac-arrest',
          contentStatus: 'placeholder',
        },
      ),
    );
    expect(arrestObject.success).toBe(false);
    if (!arrestObject.success) {
      expect(arrestObject.error.issues.some((issue) => issue.message.includes('caption lives in the component'))).toBe(
        true,
      );
    }
  });
});
