import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { anchorIds } from '../src/lib/sections.ts';
import { caseSchema, diagramIdSchema } from '../src/lib/schema.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const markerRefs: Record<string, readonly string[]> = {
  'Cecconi 2014; Vincent & De Backer 2013': ['cecconi-2014', 'vincent-de-backer-2013'],
  "Persichini 2022; Guyton's venous return curves (J Physiol Sci 2017)": ['persichini-2022', 'sunagawa-2017'],
  'NCBI Bookshelf, Control of Cardiac Output, Venous Return': ['ncbi-nbk54476'],
  'Repessé 2015': ['repesse-2015'],
  'Persichini 2022': ['persichini-2022'],
  'SSC 2026, statement 49 rationale; Monnet & Teboul meta-analysis abstract': [
    'ssc-2026',
    'monnet-teboul-2015-abstract',
  ],
  'Monnet & Teboul 2015, five rules': ['monnet-teboul-2015'],
  'Monnet, Marik & Teboul 2016; Monnet & Teboul meta-analysis abstract': [
    'monnet-marik-teboul-2016',
    'monnet-teboul-2015-abstract',
  ],
  PMC7333095: ['minini-2020'],
  'De Backer 2005; Yang & Du 2014; Michard, Chemla & Teboul 2015': [
    'de-backer-2005',
    'yang-du-2014',
    'michard-2015',
  ],
  'StatPearls, Oxygen Transport; StatPearls, Partial Pressure of Oxygen': [
    'statpearls-oxygen-transport',
    'statpearls-partial-pressure-oxygen',
  ],
  'cain-1977; ronco-1993, existing repo references': ['cain-1977', 'ronco-1993'],
  'Garcia-Alvarez, Marik & Bellomo 2014; Suetrong & Walley 2016; Kushimoto 2016': [
    'garcia-alvarez-2014',
    'suetrong-2016',
    'kushimoto-2016',
  ],
  'Persichini 2012, existing repo reference; Foulon & De Backer 2018': ['persichini-2012', 'foulon-2018'],
  'Persichini 2012': ['persichini-2012'],
  'SSC 2026, statements 13 and 14': ['ssc-2026'],
  'CLOVERS 2023; CLASSIC 2022; SEPSISPAM 2014; 65 trial 2020': [
    'clovers-2023',
    'classic-2022',
    'sepsispam-2014',
    'lamontagne-2020',
  ],
  'SSC 2026, statement 52; ANDROMEDA-SHOCK-2 2025': ['ssc-2026', 'andromeda-shock-2-2025'],
  'SSC 2026, statement 51': ['ssc-2026'],
  'ESICM 2025, abstract': ['esicm-2025'],
  'Beaubien-Souligny 2020, development of the venous excess ultrasound grading system': [
    'beaubien-souligny-2020',
  ],
};

describe('shock article integration', () => {
  const raw = JSON.parse(readFileSync(join(repoRoot, 'src/content/cases/shock-pressure-flow.json'), 'utf8'));
  const parsed = caseSchema.safeParse(raw);

  it('keeps the module a placeholder and validates', () => {
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.contentStatus).toBe('placeholder');
    expect(parsed.data.slug).toBe('shock-pressure-flow');
    expect(parsed.data.strict).toBe(true);
    expect(`${parsed.data.title}\n${parsed.data.summary}`).toContain('PLACEHOLDER');
  });

  it('stores the mechanisms table with the manuscript cell text', () => {
    if (!parsed.success) return;
    const principle = parsed.data.principles.find((item) => item.id === 'mechanisms-table');
    expect(principle?.table?.header).toEqual([
      'Mechanism',
      'Dominant disturbance',
      'Expected findings, with qualifications',
      'Important unknowns',
    ]);
    expect(principle?.table?.rows).toEqual([
      [
        'Reduced circulating volume (hypovolemic, hemorrhagic)',
        'Less stressed volume, so lower mean systemic filling pressure and less venous return; in hemorrhage, also less oxygen content',
        'Cool skin, flat neck veins, small hyperdynamic ventricles on echo; tachycardia may be blunted by age, drugs, or pacing; early hemoglobin may not yet have fallen',
        'Ongoing loss rate; how much is lost versus redistributed; tolerance of further volume',
      ],
      [
        'Altered vascular tone and distribution (distributive)',
        'Low arterial resistance and venodilation that moves volume into unstressed vessels; maldistributed microvascular flow',
        'Warm skin and wide pulse pressure are common but not universal; output may be high, normal, or low; capillary leak can add true volume loss',
        'Actual cardiac output; coexisting myocardial depression; how much of the problem is tone versus volume',
      ],
      [
        'Impaired pump function (cardiogenic)',
        'Ventricle cannot eject an adequate stroke volume at tolerable filling pressures',
        'Raised venous pressure, crackles, cool peripheries are typical but not required; ejection fraction may be preserved in some forms',
        'Which ventricle is limiting; ischemic versus other causes; tolerance of preload and afterload changes',
      ],
      [
        'Obstruction',
        'Flow is blocked in the circuit, outside the myocardium: pulmonary embolism, tamponade, tension pneumothorax',
        'Raised venous pressure with small, underfilled left heart; a dilated right ventricle with pulmonary embolism; tamponade compresses the heart from outside the chambers',
        'Degree of obstruction; how quickly it can be relieved; how much the right ventricle has failed',
      ],
    ]);
    expect(principle?.body?.some((paragraph) => paragraph.startsWith('**'))).toBe(false);
  });

  it('restores the three figure entries and registers their ids', () => {
    if (!parsed.success) return;
    const diagrams = parsed.data.principles.flatMap((principle) =>
      principle.diagram && typeof principle.diagram !== 'string' ? [principle.diagram] : [],
    );
    expect(diagrams.map((diagram) => diagram.id)).toEqual([
      'shock-circulation-gradients',
      'shock-pressure-flow',
      'shock-fluid-response',
    ]);
    for (const diagram of diagrams) {
      expect(diagramIdSchema.options).toContain(diagram.id);
      expect(diagram.caption.startsWith('Figure ')).toBe(true);
      expect(diagram.alt.length).toBeGreaterThan(0);
    }
    const prose = JSON.stringify(parsed.data.principles);
    expect(prose).not.toContain('[FIGURE:');
  });

  it('maps every source marker, including VExUS as development only', () => {
    if (!parsed.success) return;
    const referenceIds = new Set((parsed.data.references ?? []).map((reference) => reference.id));
    const cited = new Set<string>();
    const unmapped: string[] = [];
    for (const principle of parsed.data.principles) {
      const text = [...(principle.body ?? []), ...(principle.workedExample?.body ?? [])].join('\n');
      for (const match of text.matchAll(/\[(source: [^\]]+|SOURCE NEEDED:[^\]]+)\]/g)) {
        const token = match[1] ?? '';
        if (token.startsWith('SOURCE NEEDED:')) {
          unmapped.push(token);
          continue;
        }
        const key = token.replace(/^source:\s*/, '');
        const ids = markerRefs[key];
        expect(ids, key).toBeTruthy();
        for (const id of ids ?? []) {
          expect(principle.refs, key).toContain(id);
          expect(referenceIds.has(id), id).toBe(true);
          cited.add(id);
        }
      }
    }
    expect(unmapped).toEqual([]);
    expect(JSON.stringify(parsed.data.principles)).not.toMatch(/validation/i);
    const vexUs = parsed.data.references?.find((reference) => reference.id === 'beaubien-souligny-2020');
    expect(vexUs?.label).toContain('development of the venous excess ultrasound grading system');
    expect(vexUs?.label).not.toMatch(/validation/i);
    expect(vexUs?.note ?? '').not.toMatch(/validation/i);
    expect(vexUs?.url).toBe('https://doi.org/10.1186/s13089-020-00163-w');
    const foulon = parsed.data.references?.find((reference) => reference.id === 'foulon-2018');
    expect(foulon?.label).toContain('Ann Transl Med. 2018;6(Suppl 1):S25');
    expect(foulon?.url).toBe('https://doi.org/10.21037/atm.2018.09.27');
    const sunagawa = parsed.data.references?.find((reference) => reference.id === 'sunagawa-2017');
    expect(sunagawa?.label.startsWith('Sunagawa K. ')).toBe(true);
    expect(sunagawa?.url).toBe('https://doi.org/10.1007/s12576-017-0533-0');
    expect(parsed.data.references?.some((reference) => reference.id.includes('guyton'))).toBe(false);
    expect([...(parsed.data.references ?? [])].every((reference) => cited.has(reference.id))).toBe(true);
    for (const reference of parsed.data.references ?? []) {
      if (reference.id === 'cain-1977' || reference.id === 'ronco-1993') {
        expect(reference.note).toBeUndefined();
      } else {
        expect(reference.note ?? '').toMatch(/Access:/);
      }
    }
  });
});

describe('shock page build', () => {
  it('renders the table and three placeholder figures without publishing the module', () => {
    const html = readFileSync(join(repoRoot, 'dist/cases/shock-pressure-flow/index.html'), 'utf8');
    expect(html).toContain('PLACEHOLDER FIXTURE');
    expect(html).toContain('class="data-table-scroll"');
    expect(html).toContain('<caption>Four mechanisms</caption>');
    expect(html).toContain('Expected findings, with qualifications');
    expect(html).toContain('data-diagram="shock-circulation-gradients"');
    expect(html).toContain('data-diagram="shock-pressure-flow"');
    expect(html).toContain('data-diagram="shock-fluid-response"');
    expect(html).toContain('Figure in progress');
    for (const id of ['shock-circulation-gradients', 'shock-pressure-flow', 'shock-fluid-response']) {
      expect(html).toContain(`id="${id}-screen-title"`);
      expect(html).toContain(`id="${id}-screen-desc"`);
      expect(html).toContain(`id="${id}-print-title"`);
      expect(html).toContain(`id="${id}-print-desc"`);
      expect(html).toContain(`id="${id}-screen-ah"`);
      expect(html).toContain(`id="${id}-print-ah"`);
      expect(html).toContain(`url(#${id}-screen-ah)`);
      expect(html).toContain(`url(#${id}-print-ah)`);
    }
    expect(html).not.toMatch(/\b(?:fill|stroke)\s*=\s*["'][^"']*#[0-9A-Fa-f]{3,8}/i);
  });
});

describe('cardiac arrest anchors stay derivable from its module', () => {
  it('does not add shock links to the cardiac arrest module', () => {
    const arrest = JSON.parse(
      readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8'),
    );
    expect(JSON.stringify(arrest)).not.toContain('shock-pressure-flow');
    expect(anchorIds(arrest).size).toBeGreaterThan(0);
  });
});
