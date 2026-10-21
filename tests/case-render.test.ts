import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import CauseList from '../src/components/CauseList.astro';
import Contents from '../src/components/Contents.astro';
import ManagementOverview from '../src/components/ManagementOverview.astro';
import QuestionCard from '../src/components/QuestionCard.astro';
import ReferenceList from '../src/components/ReferenceList.astro';
import SectionPart from '../src/components/SectionPart.astro';

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
    expect(html).toContain('The direct answer.');
    expect(html).toContain('A second paragraph of the answer.');
    expect(html).not.toContain('>Conclusion<');
    expect(html.indexOf('The direct answer.')).toBeGreaterThan(html.indexOf('<details>'));
    expect(html.indexOf('Because of the mechanism.')).toBeGreaterThan(html.indexOf('<details>'));
    const order = ['The direct answer.', 'Why', 'Assumption', 'Common misconception', 'The reasoning'].map(
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

  it('renders a two-level contents list and keeps cause anchors addressable', async () => {
    const container = await AstroContainer.create();
    const partIds = [
      'orientation',
      'normal-circulation',
      'cpr-circulation',
      'electrical-mechanical',
      'ventilation',
      'monitoring',
      'reversible-causes',
      'treatment',
      'after-rosc',
      'limits',
    ];
    const html = await container.renderToString(Contents, {
      props: {
        sections: [
          ...partIds.map((id) => ({ id, title: `PLACEHOLDER ${id}` })),
          { id: 'compression-mechanics', title: 'PLACEHOLDER subsection', parentId: 'cpr-circulation' },
        ],
      },
    });

    let previous = -1;
    for (const id of partIds) {
      const at = html.indexOf(`href="#principle-${id}"`);
      expect(at).toBeGreaterThan(previous);
      previous = at;
    }
    const parent = html.indexOf('href="#principle-cpr-circulation"');
    const child = html.indexOf('href="#principle-compression-mechanics"');
    const nextRoot = html.indexOf('href="#principle-electrical-mechanical"');
    expect(parent).toBeLessThan(child);
    expect(child).toBeLessThan(nextRoot);
    expect(html.slice(parent, nextRoot)).toContain('<ol>');
  });

  it('renders optional questions after a subsection and keeps the cause anchor', async () => {
    const container = await AstroContainer.create();
    const cause = {
      id: 'bleed',
      name: 'PLACEHOLDER bleed',
      category: 'filling' as const,
      failure: 'PLACEHOLDER failure.',
      rhythm: 'PLACEHOLDER rhythm.',
      causalChain: 'PLACEHOLDER chain.',
      compressions: 'PLACEHOLDER compressions.',
      fix: 'PLACEHOLDER fix.',
      bedside: 'PLACEHOLDER bedside.',
      limits: 'PLACEHOLDER limits.',
      examples: [
        {
          id: 'bleed-one',
          vignette: 'PLACEHOLDER vignette.',
          reasoning: 'PLACEHOLDER example reasoning.',
        },
      ],
    };
    const html = await container.renderToString(SectionPart, {
      props: {
        principle: {
          id: 'cpr-circulation',
          title: 'PLACEHOLDER circulation',
          explanation: 'PLACEHOLDER explanation.',
          questions: [],
          causes: [cause],
        },
        subsections: [
          {
            id: 'compression-mechanics',
            parentId: 'cpr-circulation',
            title: 'PLACEHOLDER subsection',
            body: ['PLACEHOLDER subsection paragraph.'],
            questions: [
              {
                id: 'q-sample',
                prompt: 'PLACEHOLDER prompt.',
                answer: 'PLACEHOLDER answer.',
                reasoning: 'PLACEHOLDER reasoning.',
              },
            ],
          },
        ],
        numeral: 'III',
        numerals: { 'cpr-circulation': 'III', 'compression-mechanics': 'IV' },
        partNumber: 3,
        causeNames: { bleed: 'PLACEHOLDER bleed' },
        referenceNumbers: new Map(),
      },
    });

    const childAt = html.indexOf('id="principle-compression-mechanics"');
    const questionAt = html.indexOf('id="question-q-sample"');
    expect(html.indexOf('id="cause-bleed"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="cause-bleed"')).toBeLessThan(childAt);
    expect(questionAt).toBeGreaterThan(childAt);
    expect(html.indexOf('<details>')).toBeGreaterThan(childAt);
    expect(html).not.toContain('<details open');
    expect(html).toContain('Question 3.1');
    expect(html).toContain('PLACEHOLDER answer.');
  });

  it('links the management overview at the same steps', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ManagementOverview, {
      props: {
        steps: [
          { id: 'start-compressions', title: 'PLACEHOLDER compressions' },
          { id: 'post-rosc-care', title: 'PLACEHOLDER after ROSC' },
        ],
      },
    });
    expect(html).toContain('aria-label="Management overview"');
    expect(html).toContain('href="#step-start-compressions"');
    expect(html).toContain('href="#step-post-rosc-care"');
    expect(html.indexOf('href="#step-start-compressions"')).toBeLessThan(
      html.indexOf('href="#step-post-rosc-care"'),
    );
  });
});
