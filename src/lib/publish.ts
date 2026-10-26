import type { ContentStatus } from './schema.ts';

/**
 * Draft chapters render on preview builds only.
 *
 * Production is the default. A build counts as a preview only when a platform
 * variable says so, and a conflict is treated as production.
 *
 * Vercel (this repo deploys production from `main`; there is no vercel.json):
 * `VERCEL_ENV=preview` is a preview deployment and `VERCEL_ENV=production` is
 * production. `development` and any other value are not previews.
 *
 * Cloudflare Workers Builds (see `wrangler.jsonc`: an empty `previews` block
 * turns on Worker Previews, and the top level of that file is production).
 * Builds inject `WORKERS_CI=1` and `WORKERS_CI_BRANCH`. They do not inject an
 * environment name. The production branch for this repo is `main`. A Workers
 * build is a preview only when `WORKERS_CI=1` and `WORKERS_CI_BRANCH` is set to
 * some other branch. A missing branch is production.
 *
 * Local `npm run build` and GitHub Actions set neither signal, so they are
 * production builds and omit drafts.
 */
export const productionBranch = 'main';

export type BuildEnv = Record<string, string | undefined>;

export type PublicSurface = 'route' | 'index' | 'sitemap' | 'feed' | 'search';

export function isPreviewBuild(env: BuildEnv = process.env): boolean {
  const vercel = env.VERCEL_ENV;
  const vercelProduction = vercel === 'production';
  const vercelPreview = vercel === 'preview';

  const workersCi = env.WORKERS_CI === '1';
  const branch = env.WORKERS_CI_BRANCH?.trim() ?? '';
  const workersProduction = workersCi && branch === productionBranch;
  const workersPreview = workersCi && branch.length > 0 && branch !== productionBranch;

  if (vercelProduction || workersProduction) return false;
  if (vercelPreview || workersPreview) return true;
  return false;
}

/**
 * Where a chapter is emitted.
 *
 * `placeholder` and `published` are unchanged: they stay on every surface.
 * A `draft` is on preview routes and the preview chapter index only. It is
 * never on a production build, and it is never in a sitemap, feed, or search
 * index (this site does not emit those; callers must use this function).
 * Draft pages that do render are `noindex` (`chapterRobots`).
 */
export function includeChapter(
  status: ContentStatus,
  surface: PublicSurface,
  env: BuildEnv = process.env,
): boolean {
  if (status !== 'draft') return true;
  if (surface === 'sitemap' || surface === 'feed' || surface === 'search') return false;
  return isPreviewBuild(env);
}

/** Routes and the chapter index. Both follow the same rule. */
export function isBuiltChapter(status: ContentStatus, env: BuildEnv = process.env): boolean {
  return includeChapter(status, 'route', env);
}

export function chaptersForBuild<T extends { contentStatus: ContentStatus }>(
  chapters: readonly T[],
  env: BuildEnv = process.env,
): T[] {
  return chapters.filter((chapter) => isBuiltChapter(chapter.contentStatus, env));
}

/** Sitemap, feed, and search index. Drafts are always excluded. */
export function chaptersForDiscovery<T extends { contentStatus: ContentStatus }>(
  chapters: readonly T[],
): T[] {
  return chapters.filter((chapter) => includeChapter(chapter.contentStatus, 'sitemap'));
}

/** `noindex` on a draft page. Published and placeholder pages stay indexable. */
export function chapterRobots(status: ContentStatus): 'noindex' | null {
  return status === 'draft' ? 'noindex' : null;
}

/** `noindex` on a listing that includes a draft, so the draft title is not indexed. */
export function listingRobots(statuses: readonly ContentStatus[]): 'noindex' | null {
  return statuses.some((status) => chapterRobots(status) != null) ? 'noindex' : null;
}
