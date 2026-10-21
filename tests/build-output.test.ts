import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { causeMechanismGroups, overlapCaption } from '../src/lib/cause-mechanisms.ts';
import { etco2Caption, oxygenDeliveryCaption } from '../src/lib/figure-copy.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function readDist(path: string): string {
  return readFileSync(join(repoRoot, 'dist', path), 'utf8');
}

describe('static build output', () => {
  it('renders the case index and the adult cardiac arrest case', () => {
    const index = readDist('index.html');
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');

    expect(index).toContain('Resus First Principles');
    expect(index).toContain('Adult cardiac arrest');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');
    expect(index).not.toContain('PLACEHOLDER FIXTURE');

    expect(casePage).toContain('Compressions make a gradient, and the gradient makes the flow');
    expect(casePage).toContain('Predict: a compressor is pushing to a good depth but leaning on the chest between compressions');
    expect(casePage).toContain('Coronary flow falls, even though each push looks deep');
    expect(casePage).toContain('Incomplete release keeps intrathoracic and right atrial pressure elevated');
    expect(casePage).toContain('<div class="answer">');
    expect(casePage.indexOf('<div class="answer">')).toBeGreaterThan(casePage.indexOf('<details>'));
    expect(casePage).not.toContain('>Conclusion<');
    expect(casePage).toContain('id="reference-aha-2025-bls"');
    expect(casePage).toContain('When a pulse returns, leave 100% oxygen on until SpO2 or PaO2 is reliably measured');
    expect(casePage).toContain('href="#principle-coronary-cerebral-perfusion"');
    expect(casePage).toContain('href="#principle-post-rosc-physiology"');
    expect(casePage).toContain('aria-label="Contents"');
    expect(casePage).toContain('aria-label="Management overview"');
    expect(casePage).toContain('href="#step-start-compressions"');
    expect(casePage).toContain('href="#step-post-rosc-care"');
    expect(casePage).not.toContain('PLACEHOLDER FIXTURE');
    expect(casePage).not.toContain('api.openai.com');
    expect(casePage).not.toContain('fonts.googleapis.com');
    expect(casePage).toContain(
      'Source-checked against AHA 2025; not yet independently physician-reviewed.',
    );
    expect(casePage).toContain('class="cause-nav"');
    expect(casePage).toContain('id="cause-hypovolemia"');
    expect(casePage).toContain('id="question-wide-slow-pea-unknown"');
    const gap = casePage.slice(casePage.indexOf('id="question-wide-slow-pea-unknown"'));
    const gapDetails = gap.indexOf('<details>');
    expect(gapDetails).toBeGreaterThan(-1);
    expect(gap.slice(0, gapDetails)).not.toContain('Missing data');
    expect(gap.slice(gapDetails)).toContain('>Missing data<');
    expect(casePage).toContain('Commit to an answer before revealing.');
    expect(casePage).toContain('Reveal answer');
    expect(casePage).toContain('<details>');
    expect(casePage).not.toContain('>Correct<');
    expect(casePage).not.toContain('<details open');
    expect(casePage).toContain('/fonts/Fraunces-latin.woff2');
    expect(casePage).toContain('/fonts/Literata-latin.woff2');
  });

  it('renders both primer diagrams inside the principles they explain', () => {
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');
    const perfusion = section(casePage, 'principle-coronary-cerebral-perfusion');
    const pauses = section(casePage, 'principle-minimize-interruptions');
    const gradient = figure(perfusion, 'pressure-gradient');
    const timeline = figure(pauses, 'compression-pause');

    expect(gradient).toContain('role="img"');
    expect(gradient).toContain('<title');
    expect(gradient).toContain('<desc');
    expect(gradient).toContain('<figcaption');
    expect(gradient).toContain('Coronary perfusion pressure is the gap');
    expect(gradient).toContain('Aortic diastolic pressure');
    expect(gradient).toContain('Right atrial pressure');
    expect(gradient).toContain('>Pause<');
    expect(gradient).toContain('Ineffective compressions');
    expect(gradient).toContain('No compressions.');
    expect(gradient).toContain('Gap collapses');
    expect(gradient).toContain('Compressions continue.');
    expect(gradient).toContain('or both.');
    expect(gradient).toContain('how narrow depends on how ineffective they are');
    expect(gradient).not.toContain('Pause or ineffective');
    expect(gradient).toContain('divided by resistance');
    expect(gradient.toLowerCase()).not.toContain('mm');
    expect(gradient).not.toMatch(/\d+\s*(mmHg|seconds|second|ms)\b/i);

    expect(timeline).toContain('role="img"');
    expect(timeline).toContain('<title');
    expect(timeline).toContain('<desc');
    expect(timeline).toContain('<figcaption');
    expect(timeline).toContain('Schematic, not measured data');
    expect(timeline).toContain('diagram-ramp');
    expect(timeline).toContain('Continuous rise, not a counted run.');
    expect(timeline).toContain('The rise is continuous');
    expect(timeline).not.toContain('Each block is one compression.');
    expect(timeline).not.toContain('diagram-block');
    expect(timeline).toContain('When they pause, it falls.');
    expect(timeline).not.toContain('quickly');
    expect(timeline).not.toContain('several');
    expect(timeline.toLowerCase()).not.toContain('mm');
    expect(timeline).not.toMatch(/\d+\s*(mmHg|seconds|second|ms)\b/i);

    expect(section(casePage, 'principle-early-defibrillation')).not.toContain('data-diagram');
  });

  it('renders the oxygen, end-tidal CO2, and reversible-cause figures beside their principles', () => {
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');
    const source = readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8');
    const names = causeNames(source);

    const ventilation = section(casePage, 'principle-oxygenation-without-hyperventilation');
    const causes = section(casePage, 'principle-reversible-causes');
    const oxygen = figure(ventilation, 'oxygen-delivery');
    const etco2 = figure(ventilation, 'etco2-determinants');
    const overlap = figure(causes, 'reversible-cause-overlap');

    expect(ventilation.indexOf('data-diagram="oxygen-delivery"')).toBeLessThan(
      ventilation.indexOf('data-diagram="etco2-determinants"'),
    );
    const reversibleAt = casePage.indexOf('id="principle-reversible-causes"');
    const overlapAt = casePage.indexOf('data-diagram="reversible-cause-overlap"', reversibleAt);
    const causeListAt = casePage.indexOf('class="causes"', reversibleAt);
    expect(overlapAt).toBeGreaterThan(reversibleAt);
    expect(overlapAt).toBeLessThan(causeListAt);
    expect(casePage.indexOf('id="cause-hypovolemia"', reversibleAt)).toBeGreaterThan(overlapAt);
    expect(section(casePage, 'principle-coronary-cerebral-perfusion')).not.toContain('oxygen-delivery');
    expect(section(casePage, 'principle-early-defibrillation')).not.toContain('etco2-determinants');

    expect(oxygen).toContain('role="img"');
    expect(oxygen).toContain('id="diagram-oxygen-delivery-title"');
    expect(oxygen).toContain('id="diagram-oxygen-delivery-desc"');
    expect(oxygen).toContain(oxygenDeliveryCaption);
    expect(visibleText(oxygen)).toContain('Flow');
    expect(visibleText(oxygen)).toContain('multiplied by');
    expect(visibleText(oxygen)).toContain('Arterial oxygen content');
    expect(visibleText(oxygen)).toContain('Hemoglobin');
    expect(visibleText(oxygen)).toContain('Saturation');
    expect(visibleText(oxygen)).toContain('Dissolved oxygen');
    expect(visibleText(oxygen)).not.toMatch(/\d/);

    expect(etco2).toContain('role="img"');
    expect(etco2).toContain('id="diagram-etco2-determinants-title"');
    expect(etco2).toContain('id="diagram-etco2-determinants-desc"');
    expect(etco2).toContain(etco2Caption);
    const etco2Words = visibleText(etco2);
    expect(etco2Words).toContain('CO2 production');
    expect(etco2Words).toContain('Pulmonary blood flow');
    expect(etco2Words).toContain('Ventilation');
    expect(etco2Words).toContain('Drugs such as epinephrine');
    expect(etco2Words).toContain('for reasons other than flow.');
    expect(etco2Words.replaceAll('CO2', '')).not.toMatch(/\d/);
    expect(etco2Words.toLowerCase()).not.toMatch(/rise|fall|increas|decreas|higher|lower|mmhg|%/);

    expect(overlap).toContain('role="group"');
    expect(overlap).toContain('id="diagram-reversible-cause-overlap-title"');
    expect(overlap).toContain('id="diagram-reversible-cause-overlap-desc"');
    expect(overlap).toContain(overlapCaption(names));
    for (const group of causeMechanismGroups) {
      expect(visibleText(overlap)).toContain(group.label);
      for (const id of group.causeIds) {
        const name = names[id];
        expect(name, id).toBeTruthy();
        expect(overlap).toContain(`href="#cause-${id}"`);
        expect(overlap).toContain(`aria-label="${name}"`);
      }
    }
    const grouped = new Set<string>(causeMechanismGroups.flatMap((group) => group.causeIds));
    for (const id of Object.keys(names)) expect(grouped.has(id), id).toBe(true);
    expect(visibleText(overlap)).not.toMatch(/\d/);
  });
});

function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('<section', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

function figure(html: string, diagram: string): string {
  const start = html.indexOf(`data-diagram="${diagram}"`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('</figure>', start);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

function visibleText(html: string): string {
  return [...html.matchAll(/>([^<]+)</g)].map((match) => match[1] ?? '').join(' ');
}

function causeNames(source: string): Record<string, string> {
  const document = JSON.parse(source) as {
    principles: Array<{ causes?: Array<{ id: string; name: string }> }>;
  };
  const names: Record<string, string> = {};
  for (const principle of document.principles) {
    for (const cause of principle.causes ?? []) names[cause.id] = cause.name;
  }
  return names;
}
