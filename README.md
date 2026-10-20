# Resus First Principles

Static teaching pages for resuscitation cases. Each case breaks the pathology into first principles of its pathophysiology, asks questions that target those principles (with the reasoning behind each answer), and explains the treatment approach with the why behind each step tied back to a principle.

Content is written ahead of time and committed as files. The site only renders those files. Version 1 has a single case slot, adult cardiac arrest, and the committed file is a **placeholder fixture**, not clinical content.

## Stack

- [Astro](https://astro.build) static output (`output: 'static'`). There is no server adapter.
- No backend, accounts, database, or analytics.
- No deployment is configured. The `dist/` directory is plain HTML that a free static host such as GitHub Pages or Vercel can serve later.
- Styles live in one file, `src/styles/global.css`, with tokens at the top.

## Content schema

Case files live in `src/content/cases/*.json`. The filename must be `{slug}.json`.

Each case has:

- `schemaVersion` (`1`), `id`, `slug`, `title`, `summary`, and `contentStatus` (`placeholder` or `published`)
- `principles`: id, title, `explanation` (the pathophysiology first-principles writeup), and `questions`
- each question: `prompt`, `answer`, and `reasoning`
- `treatmentApproach`: ordered steps with `action`, `why`, and `principleIds` pointing at principle ids

A placeholder case must include the word `PLACEHOLDER` in the title or summary. The adult cardiac arrest file is that fixture. Do not add real clinical teaching in this repository until a later content change says so.

`src/lib/schema.ts` is the Zod schema. `npm run validate` checks every case file against it, including principle links. `astro build` runs that check first (`prebuild`) and the Astro content collection validates the same schema again, so a malformed file fails the build and CI.

## Scripts

```sh
npm install
npm run validate
npm run build
npm test
npm run check:no-models
npm run dev
```

`npm test` reads `dist/`, so run `npm run build` before it. CI does that.

## No runtime model calls and no paid dependencies

Generation of future case content happens outside this site. The running site, the build, and CI must not call a model, ship a model SDK, or spend money on an API.

`npm run check:no-models` (`scripts/check-no-model-calls.mjs`) fails the build when the repository contains any of the following:

- **Model or LLM SDKs and API clients** in `package.json` dependency fields, lockfiles, Python manifests, or `import` / `require` specifiers. The denylist covers the OpenAI client, Anthropic client, `@ai-sdk/*`, the `ai` package, LangChain, xAI and Grok clients, and Google Generative AI clients (`@google/generative-ai`, `@google/genai`), plus the matching Python package names. The exact list is `scripts/model-call-denylist.mjs`.
- **API-key-shaped secrets**, including OpenAI-style `sk-` keys, xAI-style keys, Google API-style keys, and assigned `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / similar values.
- **Calls to model endpoints**, meaning an HTTP client call (`fetch`, axios, and the other clients the script recognizes) or a `baseURL` assignment aimed at a hosted model API such as `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, or `api.x.ai`.

Mentioning a package name in this README is allowed. Importing the package, depending on it, committing a key, or calling the endpoint is not. CI runs this check on every pull request and on every push to `main`. A failing check fails the workflow.

Dependencies of this repo are the static-site toolchain only (Astro, Zod, TypeScript, Vitest). Do not add paid APIs, paid analytics, accounts, or a database.
