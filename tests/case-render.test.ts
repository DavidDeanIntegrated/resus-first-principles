import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import CauseList from '../src/components/CauseList.astro';
import QuestionCard from '../src/components/QuestionCard.astro';
import ReferenceList from '../src/components/ReferenceList.astro';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('question reveal and references', () => {
  it('hides the answer, explanation, and optional parts behind Reveal answer', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(QuestionCard, {
      props: {
        id: 'sample',
        label: 'Question 1.1',
        kind: 'prediction',
        prompt: 'What happens next?',
        answer: ['The direct answer.', 'A second paragraph of the answer.'],
        reasoning: ['Because of the mechanism.', 'And the boundary of the evidence.'],
        conclusion: 'The conclusion.',
        causalChain: ['Cause.', 'Effect.'],
        assumption: 'The assumption.',
        misconception: 'The misconception.',
        marks: [{ id: 'source-one', n: 2 }],
        buildsOnHref: '#principle-sample',
        buildsOnNumeral: 'I',
        buildsOnTitle: 'Sample principle',
      },
    });

    expect(html).toContain('Commit to an answer before revealing.');
    expect(html).toContain('<summary>');
    expect(html).toContain('Reveal answer');
    expect(html).toContain('<details>');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('Correct');
    expect(html).toContain('Prediction');
    expect(html).toContain('class="q-kind"');
    expect(html).toContain('class="chevron"');
    expect(html).toContain('part-misconception');
    expect(html).not.toContain('The direct answer.');
    expect(html).not.toContain('A second paragraph of the answer.');
    expect(html.match(/The conclusion\./g)?.length).toBe(1);
    expect(html.indexOf('The conclusion.')).toBeGreaterThan(html.indexOf('<details>'));
    expect(html.indexOf('Because of the mechanism.')).toBeGreaterThan(html.indexOf('<details>'));
    const order = ['Conclusion', 'Why', 'Assumption', 'Common misconception', 'The reasoning'].map(
      (label) => html.indexOf(label),
    );
    expect(order.every((index) => index > html.indexOf('<details>'))).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('href="#reference-source-one"');
    expect(html).toContain('>2<');
  });

  it('keeps missing data hidden until the answer is revealed', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(QuestionCard, {
      props: {
        id: 'sample-gap',
        label: 'Question 1.2',
        kind: 'insufficient-information',
        prompt: 'Can you name the cause?',
        answer: 'Not from what is on the page.',
        missingData: 'The reading is missing.',
        conclusion: 'Not from what is on the page.',
        causalChain: 'The chain needs that reading.',
        assumption: 'Nothing else was measured.',
        misconception: 'Guessing fills the gap.',
        buildsOnHref: '#principle-sample',
        buildsOnNumeral: 'I',
        buildsOnTitle: 'Sample principle',
      },
    });

    const detailsAt = html.indexOf('<details>');
    const beforeReveal = html.slice(0, detailsAt);
    expect(detailsAt).toBeGreaterThan(-1);
    expect(html).not.toContain('<details open');
    expect(beforeReveal).not.toContain('The reading is missing.');
    expect(beforeReveal).not.toContain('Missing data');
    expect(html.indexOf('>Missing data<')).toBeGreaterThan(detailsAt);
    expect(html.indexOf('The reading is missing.')).toBeGreaterThan(detailsAt);
  });

  it('renders causes in one section with a category jump list', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CauseList, {
      props: {
        causeNames: { 'cause-fill': 'PLACEHOLDER filling', 'cause-block': 'PLACEHOLDER obstruction' },
        referenceNumbers: new Map([['source-one', 1]]),
        causes: [
          {
            id: 'cause-block',
            name: 'PLACEHOLDER obstruction',
            category: 'obstruction',
            failure: 'PLACEHOLDER failure.',
            rhythm: ['PLACEHOLDER rhythm.', 'PLACEHOLDER rhythm follow-up.'],
            causalChain: 'PLACEHOLDER chain.',
            compressions: 'PLACEHOLDER compressions.',
            fix: 'PLACEHOLDER fix.',
            bedside: 'PLACEHOLDER bedside.',
            mimics: 'PLACEHOLDER mimics.',
            limits: 'PLACEHOLDER limits.',
            refs: ['source-one'],
            examples: [
              {
                id: 'example-one',
                vignette: 'PLACEHOLDER vignette.',
                reasoning: 'PLACEHOLDER example reasoning.',
                causeIds: ['cause-fill'],
              },
            ],
          },
          {
            id: 'cause-fill',
            name: 'PLACEHOLDER filling',
            category: 'filling',
            failure: 'PLACEHOLDER failure.',
            rhythm: 'PLACEHOLDER rhythm.',
            causalChain: 'PLACEHOLDER chain.',
            compressions: 'PLACEHOLDER compressions.',
            fix: 'PLACEHOLDER fix.',
            bedside: 'PLACEHOLDER bedside.',
            limits: 'PLACEHOLDER limits.',
            examples: [
              {
                id: 'example-two',
                vignette: 'PLACEHOLDER second vignette.',
                reasoning: 'PLACEHOLDER second reasoning.',
              },
            ],
          },
        ],
      },
    });

    expect(html).toContain('class="cause-nav"');
    expect(html).toContain('class="field-label"');
    expect(html).toContain('class="chip"');
    expect(html).toContain('class="example"');
    expect(html.indexOf('>Filling<')).toBeLessThan(html.indexOf('>Obstruction<'));
    expect(html.indexOf('href="#cause-cause-fill"')).toBeLessThan(html.indexOf('href="#cause-cause-block"'));
    expect(html).toContain('id="cause-cause-block"');
    expect(html).toContain('id="example-example-one"');
    expect(html).toContain('PLACEHOLDER mimics.');
    expect(html).toContain('<p>PLACEHOLDER rhythm.</p>');
    expect(html).toContain('<p>PLACEHOLDER rhythm follow-up.</p>');
    expect(html).toContain('href="#cause-cause-fill"');
    expect(html).toContain('href="#reference-source-one"');
    expect(html.indexOf('id="cause-cause-block"')).toBeLessThan(html.indexOf('id="cause-cause-fill"'));
  });

  it('renders a reference list that the superscripts can target', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ReferenceList, {
      props: {
        references: [
          {
            id: 'source-one',
            label: 'Example source',
            url: 'https://example.com/source',
            note: 'Optional note.',
          },
        ],
      },
    });

    expect(html).toContain('id="reference-source-one"');
    expect(html).toContain('href="https://example.com/source"');
    expect(html).toContain('Example source');
    expect(html).toContain('Optional note.');
    expect(html).toContain('References');
  });

  it('renders the answer when a question has no conclusion', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(QuestionCard, {
      props: {
        id: 'sample-answer',
        label: 'Question 1.2',
        prompt: 'What happens next?',
        answer: 'The direct answer.',
        buildsOnHref: '#principle-sample',
        buildsOnNumeral: 'I',
        buildsOnTitle: 'Sample principle',
      },
    });

    expect(html.indexOf('The direct answer.')).toBeGreaterThan(html.indexOf('<details>'));
    expect(html).toContain('<div class="answer">');
    expect(html).not.toContain('>Conclusion<');
  });

  it('runs the strict validator in CI', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('npm run validate:strict');
    expect(workflow).toContain('npm run validate');
  });
});
