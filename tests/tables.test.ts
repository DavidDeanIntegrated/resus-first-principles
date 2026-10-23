import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import SectionFrame from '../src/components/SectionFrame.astro';
import { caseSchema, type CaseDocument, type Principle } from '../src/lib/schema.ts';

function placeholderCase(): CaseDocument {
  return {
    schemaVersion: 1,
    id: 'sample-case',
    slug: 'sample-case',
    title: 'Sample PLACEHOLDER',
    summary: 'PLACEHOLDER summary.',
    contentStatus: 'placeholder',
    principles: [
      {
        id: 'part',
        title: 'Part',
        body: ['Intro.'],
        questions: [
          {
            id: 'q1',
            prompt: 'Prompt.',
            answer: 'Answer.',
            reasoning: 'Reason.',
          },
        ],
      },
    ],
    treatmentApproach: [
      {
        id: 'step',
        title: 'Step',
        action: 'Act.',
        why: 'Why.',
        principleIds: ['part'],
      },
    ],
  };
}

describe('data tables', () => {
  it('accepts one header row and matching markdown cells', () => {
    const document = placeholderCase();
    const principle = document.principles[0];
    if (!principle) throw new Error('missing principle');
    principle.table = {
      caption: 'Sample table',
      header: ['Name', 'Note'],
      rows: [
        ['Volume', 'Less **return**'],
        ['Tone', 'See [the part](#principle-part)'],
      ],
    };
    expect(caseSchema.safeParse(document).success).toBe(true);
  });

  it('rejects a row whose cell count differs from the header', () => {
    const document = placeholderCase();
    const principle = document.principles[0];
    if (!principle) throw new Error('missing principle');
    principle.table = {
      caption: 'Sample table',
      header: ['Name', 'Note'],
      rows: [['Volume']],
    };
    const parsed = caseSchema.safeParse(document);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes('header has 2'))).toBe(true);
  });

  it('rejects a table link that is not an anchor or http(s) URL', () => {
    const document = placeholderCase();
    const principle = document.principles[0];
    if (!principle) throw new Error('missing principle');
    principle.table = {
      caption: 'Sample table',
      header: ['Name'],
      rows: [['[bad](javascript:alert(1))']],
    };
    const parsed = caseSchema.safeParse(document);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message.includes('http(s) URL or a #anchor'))).toBe(true);
  });

  it('renders one caption, one header row, and markdown cells inside a horizontal scroller', async () => {
    const principle: Principle = {
      id: 'mechanisms',
      title: 'Four mechanisms',
      body: ['Intro.'],
      questions: [],
      table: {
        caption: 'Four mechanisms',
        header: ['Mechanism', 'Note'],
        rows: [
          ['Volume', 'Less **return**'],
          ['Tone', 'A <b>tag</b>'],
        ],
      },
    };
    const container = await AstroContainer.create();
    const html = await container.renderToString(SectionFrame, {
      props: {
        principle,
        numeral: 'VI',
        causeNames: {},
        referenceNumbers: new Map(),
      },
    });

    expect(html).toContain('class="data-table-scroll"');
    expect(html).toContain('<caption>Four mechanisms</caption>');
    const table = html.slice(html.indexOf('<table>'), html.indexOf('</table>'));
    expect(table.match(/<thead>/g)).toHaveLength(1);
    expect(table.match(/<th scope="col"/g)).toHaveLength(2);
    expect(table.match(/<tbody>/g)).toHaveLength(1);
    expect(table.match(/<tr>/g)).toHaveLength(3);
    expect(table).toContain('<strong>return</strong>');
    expect(table).toContain('&lt;b&gt;');
    expect(table).not.toContain('<b>');
    expect(table).not.toContain('<script');
  });
});
