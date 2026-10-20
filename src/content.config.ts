import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { caseSchema } from './lib/schema.ts';

const cases = defineCollection({
  loader: glob({
    pattern: '*.json',
    base: './src/content/cases',
    generateId: ({ entry }) => entry.replace(/\.json$/i, ''),
  }),
  schema: caseSchema,
});

export const collections = { cases };
