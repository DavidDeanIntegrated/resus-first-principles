import { getCollection } from 'astro:content';
import { join } from 'node:path';
import { isBuiltChapter } from './publish.ts';
import { validateContentDirectory } from './validate-content.ts';

export async function loadCases() {
  // Astro bundles this module during the build, so locate content from the project root.
  const directory = join(process.cwd(), 'src/content/cases');
  const result = validateContentDirectory(directory);
  if (!result.ok) {
    throw new Error(
      `Case content failed schema validation.\n${result.errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  const cases = await getCollection('cases');
  for (const entry of cases) {
    if (entry.id !== entry.data.slug || entry.data.id !== entry.data.slug) {
      throw new Error(
        `Case "${entry.id}" does not match slug "${entry.data.slug}". Name the file ${entry.data.slug}.json and set id to that slug.`,
      );
    }
  }

  // Routes and the home listing both use this list. Drafts stay out of a production build.
  return cases
    .filter((entry) => isBuiltChapter(entry.data.contentStatus))
    .sort((a, b) => a.data.title.localeCompare(b.data.title));
}
