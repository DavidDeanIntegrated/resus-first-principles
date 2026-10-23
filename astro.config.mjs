// @ts-check
import { defineConfig } from 'astro/config';

// Static HTML only. Do not add a server adapter, analytics, or a deployment target here.
// `site` is the one canonical origin. The apex host does not redirect to www.
export default defineConfig({
  site: 'https://www.resusfirstprinciples.io',
  output: 'static',
});
