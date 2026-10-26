# Resus First Principles

Static teaching pages for resuscitation topic modules. Each topic module breaks the pathology into first principles of its pathophysiology, asks questions that target those principles (with the reasoning behind each answer), and explains the treatment approach with the why behind each step tied back to a principle.

Content is written ahead of time and committed as files. The site only renders those files. Version 1 is the adult cardiac arrest topic module, written for study against the 2025 American Heart Association adult basic life support, advanced life support, and post–cardiac arrest care guidelines. It is not a clinical protocol.

## Stack

- [Astro](https://astro.build) static output (`output: 'static'`). There is no server adapter.
- No backend, accounts, database, or analytics.
- The site is live at [https://resus-first-principles.vercel.app/](https://resus-first-principles.vercel.app/). Vercel auto-deploys from `main`. The `dist/` directory is the same static HTML.
- Styles live in one file, `src/styles/global.css`, with tokens at the top.

## Type and layout

The topic module page is the annotated primer. It renders the topic module schema through components in `src/components/`. There is no second content model.

- `PrincipleHeader.astro` — roman numeral from file order, title, and the first sentence of `explanation` (or of `body`, when `explanation` is omitted) as the italic summary. The remainder is the prose under the rule. `body`, when set, is additional paragraphs and may contain inline markdown. Anchor id is `principle-{id}`.
- `Contents.astro` — contents list from `parentId`. Top-level parts keep the roman numerals; subsections are a nested list under their part. Targets stay `#principle-{id}`. On a narrow page the list is a sticky Contents disclosure. From 900px it stays open in the margin. Script highlights the current part and subsection and leaves only that part’s subsections expanded. The Hs and Ts jump list keeps the margin while that section is on screen.
- `QuestionCard.astro` — question label, optional `kind`, and `prompt` as the stem. A line above the control says "Commit to an answer before revealing." The revealed text stays inside a native `<details>` / `<summary>` labelled "Reveal answer" (keyboard accessible). There is no "Correct" label. `answer` is the canonical revealed text. Optional `causalChain`, `assumption`, and `misconception` render under that reveal, in that order, ahead of the reasoning. `conclusion` is deprecated and is not rendered. Optional `missingData` renders inside that reveal, labeled Missing data in the same small caps as the other revealed parts, so it stays hidden until the learner opens the answer. Questions are optional. When a part has any, they sit in one closed disclosure after that part's subsections, labelled "Questions for this part (n)".
- `CauseList.astro` — when a principle has `causes`, one section after the explanation. A jump list groups causes by `category`. On a narrow page it is one sticky row of 44px links, fading into the paper at the right edge where the row continues; from 900px it sticks in the margin beside the causes. Each cause is an anchored sub-heading (`#cause-{id}`) with small-caps field labels, then worked examples. Each example shows the vignette, the reasoning, and one chip per `causeIds` entry. Cause and example anchors use `scroll-margin` so they clear the sticky list.
- `ManagementOverview.astro` — the treatment overview, generated from `treatmentApproach` as links to `#step-{id}`.
- `Explanation.astro` — the "why" inset and a "Builds on" link back to that question's principle.
- `TreatmentStep.astro` — step number, `title`, `action`, `why`, and one `PrincipleChip.astro` pill per `principleIds` entry. Each pill links to `#principle-{id}`.

Fraunces (headings, numerals, question stems) and Literata (body, labels) are self-hosted Latin `woff2` subsets in `public/fonts/`, with `font-display: swap` and a Georgia fallback. Their SIL Open Font License texts are `public/fonts/OFL-Fraunces.txt` and `public/fonts/OFL-Literata.txt`.

Tokens in `:root` are the paper palette, a 4px spacing scale (`--s1` through `--s9`), the type scale, and `--measure: 66ch`. Base CSS is for a 390px-wide page. The only layout breakpoint is `900px`, where the topic module page becomes a margin column plus a 52rem reading column. Margin notes are hidden below that breakpoint and are not essential. Tap targets for controls are at least 44px.

## Content schema

Topic module files live in `src/content/cases/*.json`. The filename must be `{slug}.json`.

Each topic module has:

- `schemaVersion` (`1`), `id`, `slug`, `title`, `summary`, optional `shareDescription` (share-card and meta description, at most 160 characters; the page still shows `summary`, and uses `summary` for the meta description when `shareDescription` is omitted), and `contentStatus` (`placeholder`, `draft`, or `published`)
- optional `strict` (`true` turns on the stricter question rules below for that file)
- optional `reviewNote` (string), rendered as a review line under the case title
- optional `references`: `{ id, label, url, note? }`. `url` is an absolute URL. `note` is optional.
- optional `diagrams`: the diagram ids this chapter's sections may use. Omit it on adult cardiac arrest and shock; those two chapters already declare their ids in `chapterDiagramRegistry` (`src/lib/schema.ts`)
- `principles`: `id`, `title`, optional `parentId` (another principle id; only one level of nesting), optional `explanation`, optional `body` (an array of paragraphs; inline markdown is allowed), optional `diagram` (a string id, or `{ id, caption, alt }`, and the id must be declared for this chapter), optional `refs` (reference ids), optional `questions`, optional `causes`, and optional `workedExample`
- a section needs `explanation` or `body` (or both)
- each question: `id`, `prompt`, `answer`, optional `reasoning`, optional `kind` (`prediction`, `transfer`, `evidence-boundary`, or `insufficient-information`), deprecated optional `conclusion`, optional `causalChain`, `assumption`, `misconception`, optional `missingData`, and optional `refs`
- each worked example: `id` (anchor `#worked-example-{id}`), `title`, and `body` (an array of paragraphs; inline markdown is allowed)
- each cause: `id` (anchor `#cause-{id}`), `name`, `category` (`filling`, `obstruction`, `contractility-electrical`, or `oxygen-content`), `failure`, `rhythm`, `causalChain`, `compressions`, `fix`, `bedside`, optional `mimics`, `limits`, `examples`, and optional `refs`
- each example: `id`, `vignette`, `reasoning`, and optional `causeIds` (ids of coexisting causes)
- `treatmentApproach`: ordered steps with `id`, `title`, `action`, `why`, `principleIds` pointing at principle ids, and optional `refs`

`explanation`, `body`, `answer`, `reasoning`, `conclusion`, `causalChain`, `assumption`, `misconception`, `missingData`, worked-example `body`, and every cause text field (`failure`, `rhythm`, `causalChain`, `compressions`, `fix`, `bedside`, `mimics`, `limits`, plus example `vignette` and `reasoning`) are either one string or an array of strings, except `body` and worked-example `body`, which are always an array of strings. Each array entry is one paragraph. A string stays a single paragraph. The first sentence of a principle `explanation` is still the italic summary; further sentences and later array entries are the prose under the rule. When `explanation` is omitted, that summary is the first sentence of `body`. Inline markdown in `body` may use `` `code` ``, `*emphasis*`, `**strong**`, and links to `http(s)` URLs or to an anchor this page renders (`#principle-{id}`, `#cause-{id}`, `#question-{id}`, `#example-{id}`, `#worked-example-{id}`, `#step-{id}`, `#reference-{id}`).

`parentId` must name another principle in the same file, and that principle must itself be a top-level part. A part and its subsections are the two supported levels. The contents list is generated from that hierarchy. There is no separate management-overview field: the overview is the `treatmentApproach` steps, in the same order, linking to `#step-{id}`.

`refs` on a principle, question, cause, or step must name ids from that topic module's `references`. The page renders them as superscript links to a References list at the bottom. The list items link out to `url`.

A placeholder topic module must include the word `PLACEHOLDER` in the title or summary. Published topic modules set `contentStatus` to `published`. The adult cardiac arrest file is published study content.

A `draft` is valid content that is not part of the public site. Preview builds include it in the chapter routes and the home listing, and the page is `noindex`. Production builds omit it from routes and the listing. A draft is also omitted from any sitemap, feed, or search index. This site does not emit those three; `includeChapter` in `src/lib/publish.ts` is the gate.

The gate runs at build time, and an unclear signal is production. Vercel sets `VERCEL_ENV` to `preview` or `production` (production deploys from `main`; this repo has no `vercel.json`). Cloudflare Workers Builds injects `WORKERS_CI=1` and `WORKERS_CI_BRANCH`, not an environment name. `wrangler.jsonc` enables Worker Previews with an empty `previews` block, and the production branch is `main`. A Workers build is a preview only when that branch is set and is not `main`. Local builds and GitHub Actions set neither variable, so they are production builds. If the signals disagree, the build is production.

Adult cardiac arrest declares `pressure-gradient` and `compression-pause` (plain strings; the caption lives in the component). Shock declares `shock-circulation-gradients`, `shock-pressure-flow`, and `shock-fluid-response` (each section entry keeps `caption` and `alt`). A section whose diagram id is not declared for its chapter fails validation. Another chapter sets `diagrams` to its own ids instead of extending the shared enum.

`src/lib/schema.ts` is the Zod schema. `npm run validate` checks every topic module against it, including principle links and reference ids. `astro build` runs that check first (`prebuild`) and the Astro content collection validates the same schema again, so a malformed file fails the build and CI.

### Strict question shape

`kind` and the answer parts are optional on the base schema. Questions themselves are optional. The strict rules apply only to parts that have at least one question, on the part or on one of its subsections. They fail a topic module when any of those questions lacks a `kind` or any of `causalChain`, `assumption`, and `misconception`, or when that part lacks at least one `prediction` question and one `transfer` question among the part and its subsections. `evidence-boundary` and `insufficient-information` count as neither. An `insufficient-information` question also needs `missingData`. `conclusion` is still accepted and is not required. When strict rules run, each question that still has `conclusion` is reported as a warning (`answer` is canonical) and does not fail the check. Each cause needs at least two examples, every `causeIds` entry must name a cause in the topic module, and every `refs` entry must name a reference. The adult cardiac arrest topic module sets `"strict": true`.

CI runs both checks:

- `npm run validate` enforces strict rules only for a topic module that sets `"strict": true`.
- `npm run validate:strict` applies the rules to every topic module even when `strict` is omitted.

## Scripts

```sh
npm install
npm run validate
npm run validate:strict
npm run build
npm test
npm run check:no-models
npm run dev
```

`npm test` reads `dist/`, so run `npm run build` before it. CI does that.

## No runtime model calls and no paid dependencies

Generation of future topic module content happens outside this site. The running site, the build, and CI must not call a model, ship a model SDK, or spend money on an API.

`npm run check:no-models` (`scripts/check-no-model-calls.mjs`) fails the build when the repository contains any of the following:

- **Model or LLM SDKs and API clients** in `package.json` dependency fields, lockfiles, Python manifests, or `import` / `require` specifiers. The denylist covers the OpenAI client, Anthropic client, `@ai-sdk/*`, the `ai` package, LangChain, xAI and Grok clients, and Google Generative AI clients (`@google/generative-ai`, `@google/genai`), plus the matching Python package names. The exact list is `scripts/model-call-denylist.mjs`.
- **API-key-shaped secrets**, including OpenAI-style `sk-` keys, xAI-style keys, Google API-style keys, and assigned `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / similar values.
- **Calls to model endpoints**, meaning an HTTP client call (`fetch`, axios, and the other clients the script recognizes) or a `baseURL` assignment aimed at a hosted model API such as `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, or `api.x.ai`.

Mentioning a package name in this README is allowed. Importing the package, depending on it, committing a key, or calling the endpoint is not. CI runs this check on every pull request and on every push to `main`. A failing check fails the workflow.

Dependencies of this repo are the static-site toolchain only (Astro, Zod, TypeScript, Vitest). Do not add paid APIs, paid analytics, accounts, or a database.
