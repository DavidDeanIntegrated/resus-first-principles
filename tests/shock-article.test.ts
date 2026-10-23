import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { anchorIds } from '../src/lib/sections.ts';
import { caseSchema, diagramIdSchema } from '../src/lib/schema.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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

  it('maps sources through refs and leaves no inline markers in the prose', () => {
    if (!parsed.success) return;
    const prose = JSON.stringify(parsed.data.principles);
    expect(prose).not.toContain('[source:');
    expect(prose).not.toContain('SOURCE NEEDED');
    const cited = new Set<string>();
    for (const principle of parsed.data.principles) {
      for (const id of principle.refs ?? []) cited.add(id);
      for (const cause of principle.causes ?? []) for (const id of cause.refs ?? []) cited.add(id);
      for (const question of principle.questions) for (const id of question.refs ?? []) cited.add(id);
    }
    const signals = parsed.data.principles.find((principle) => principle.id === 'signals');
    const signalsText = (signals?.body ?? []).join('\n');
    expect(signalsText).toContain('where severe grades were associated with later kidney injury;');
    expect(signalsText).toContain(
      'severe tricuspid regurgitation can distort its hepatic venous waveform regardless of volume status.',
    );
    const fluid = parsed.data.principles.find((principle) => principle.id === 'fluid-responsiveness');
    expect(fluid?.refs).toEqual(['ssc-2026']);
    const plr = parsed.data.principles.find((principle) => principle.id === 'plr-dynamic');
    expect(plr?.refs).toContain('monnet-teboul-2015-abstract');
    expect(plr?.body?.join('\n')).toContain('more than about 10 percent');
    const conference = parsed.data.references?.find((reference) => reference.id === 'monnet-teboul-2015-abstract');
    expect(conference?.label).toContain('(conference abstract)');
    const vexUs = parsed.data.references?.find((reference) => reference.id === 'beaubien-souligny-2020');
    expect(vexUs?.label).toContain('development of the venous excess ultrasound grading system');
    expect(vexUs?.label).not.toMatch(/validation/i);
    expect(vexUs?.note).toMatch(/Access: abstract or summary only/);
    expect(vexUs?.url).toBe('https://doi.org/10.1186/s13089-020-00163-w');
    const antit = parsed.data.references?.find((reference) => reference.id === 'antit-2025');
    expect(antit?.label).toBe(
      'Antit S, Romdhane S, Mtiri I, Zakhama L. The Role of Venous Excess Ultrasound Score in Optimizing Acute Heart Failure Diagnosis and Prognosis. Journal of the Saudi Heart Association. 2025;37(1):10',
    );
    expect(antit?.note).toBe(
      'Access: extracted passage read (hepatic-vein Doppler limitation in tricuspid regurgitation). Supports only the tricuspid regurgitation clause.',
    );
    expect(antit?.url).toBe('https://doi.org/10.37616/2212-5043.1422');
    expect(signals?.refs).toContain('antit-2025');
    const fig3 = parsed.data.principles.find((principle) => principle.id === 'fluid-responsiveness');
    const fig3Alt = fig3?.diagram && typeof fig3.diagram !== 'string' ? fig3.diagram.alt : '';
    expect(fig3Alt).toContain('labelled Rising congestion risk');
    expect(fig3Alt).not.toContain('where congestion begins');
    const fig2 = parsed.data.principles.find(
      (principle) => principle.diagram && typeof principle.diagram !== 'string' && principle.diagram.id === 'shock-pressure-flow',
    );
    const fig2Alt = fig2?.diagram && typeof fig2.diagram !== 'string' ? fig2.diagram.alt : '';
    expect(fig2Alt).toBe(
      'Two side-by-side tubes, each labelled with the same pressure difference of 55 millimetres of mercury from inlet to outlet. The left tube is wider, labelled resistance 11 mm Hg·min per litre, with a thick arrow labelled flow 5 litres per minute. The right tube is narrower, labelled resistance 22 mm Hg·min per litre, with a thin arrow labelled flow 2.5 litres per minute. Below each, the equation 55 = 5 × 11 and 55 = 2.5 × 22. Values are marked illustrative.',
    );
    const foulon = parsed.data.references?.find((reference) => reference.id === 'foulon-2018');
    expect(foulon?.label).toContain('Ann Transl Med. 2018;6(Suppl 1):S25');
    expect(foulon?.url).toBe('https://doi.org/10.21037/atm.2018.09.27');
    const sunagawa = parsed.data.references?.find((reference) => reference.id === 'sunagawa-2017');
    expect(sunagawa?.label.startsWith('Sunagawa K. ')).toBe(true);
    expect(sunagawa?.url).toBe('https://doi.org/10.1007/s12576-017-0533-0');
    expect(parsed.data.references?.some((reference) => reference.id.includes('guyton'))).toBe(false);
    expect([...(parsed.data.references ?? [])].every((reference) => cited.has(reference.id))).toBe(true);
    for (const reference of parsed.data.references ?? []) {
      expect(reference.note ?? '').toMatch(/Access:/);
      if (reference.id === 'cain-1977' || reference.id === 'ronco-1993') {
        expect(reference.note).toBe('Access: existing repo reference; not re-read in S7.');
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
    expect(html).not.toContain('Figure in progress');
    expect(html).not.toContain('[source:');
    expect(html).not.toContain('SOURCE NEEDED');
    expect(html).toContain('labelled Rising congestion risk');
    expect(html).toContain('One circulation, several pressure gradients.</title>');
    expect(html).toContain('Similar pressure, different flow.</title>');
    expect(html).toContain('A fluid response is not the whole decision.</title>');
    for (const id of ['shock-circulation-gradients', 'shock-pressure-flow', 'shock-fluid-response']) {
      expect(html).toContain(`id="${id}-screen-title"`);
      expect(html).toContain(`id="${id}-screen-desc"`);
      expect(html).toContain(`id="${id}-print-title"`);
      expect(html).toContain(`id="${id}-print-desc"`);
      if (id !== 'shock-fluid-response') expect(html).toContain(`id="${id}-screen-ah"`);
      if (id !== 'shock-fluid-response') expect(html).toContain(`id="${id}-print-ah"`);
      if (id !== 'shock-fluid-response') expect(html).toContain(`url(#${id}-screen-ah)`);
      if (id !== 'shock-fluid-response') expect(html).toContain(`url(#${id}-print-ah)`);
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
