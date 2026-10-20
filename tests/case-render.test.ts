import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
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
    expect(html.indexOf('The direct answer.')).toBeGreaterThan(html.indexOf('<details>'));
    expect(html.indexOf('Because of the mechanism.')).toBeGreaterThan(html.indexOf('<details>'));
    expect(html).toContain('<p>The direct answer.</p>');
    expect(html).toContain('<p>A second paragraph of the answer.</p>');
    const order = ['Conclusion', 'Causal chain', 'Assumption', 'Misconception', 'The reasoning'].map(
      (label) => html.indexOf(label),
    );
    expect(order.every((index) => index > html.indexOf('<details>'))).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('href="#reference-source-one"');
    expect(html).toContain('>2<');
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

  it('does not run the strict validator in CI', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).not.toContain('validate:strict');
    expect(workflow).toContain('npm run validate');
  });
});
