import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { causeMechanismGroups, overlapCaption } from '../src/lib/cause-mechanisms.ts';
import { physiologyFigures } from '../src/lib/physiology-figures.ts';

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
    expect(casePage).toContain('Coronary flow is likely to fall even though each push looks deep');
    expect(casePage).toContain('In a pig study, incomplete recoil lowered relaxation-phase aortic pressure');
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
    expect(gradient).toContain('Relaxation-phase aortic pressure');
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

  it('renders the six physiology figures once, in place of the simpler oxygen and capnography drawings', () => {
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');
    expect(casePage).not.toContain('data-diagram="oxygen-delivery"');
    expect(casePage).not.toContain('data-diagram="etco2-determinants"');
    expect(casePage).not.toContain('Oxygen delivery is shown as flow multiplied by arterial oxygen content.');
    expect(casePage).not.toContain('End-tidal CO2 is shown as a reading that reflects CO2 production');

    const partTwo = section(casePage, 'principle-normal-circulation');
    expect(partTwo.indexOf('During CPR the first factor is the limiting one.')).toBeLessThan(
      partTwo.indexOf('data-diagram="01-oxygen-delivery"'),
    );
    expect(partTwo.indexOf('data-diagram="01-oxygen-delivery"')).toBeLessThan(
      partTwo.indexOf('Held constant in these predictions'),
    );

    const afterShock = section(casePage, 'principle-after-shock');
    expect(afterShock.indexOf('Two mechanisms look the same on a single rhythm check.')).toBeLessThan(
      afterShock.indexOf('data-diagram="02-after-the-shock"'),
    );
    expect(afterShock.indexOf('data-diagram="02-after-the-shock"')).toBeLessThan(
      afterShock.indexOf('id="question-resume-after-shock"'),
    );

    const ventilation = section(casePage, 'principle-oxygenation-without-hyperventilation');
    expect(ventilation.indexOf('Every positive-pressure breath is also a circulatory event.')).toBeLessThan(
      ventilation.indexOf('data-diagram="03-two-pressure-gradients"'),
    );
    expect(ventilation.indexOf('data-diagram="03-two-pressure-gradients"')).toBeLessThan(
      ventilation.indexOf('The airway state determines the rhythm of breathing.'),
    );
    expect(ventilation).not.toContain('01-oxygen-delivery');
    expect(ventilation).not.toContain('05-reading-capnography');

    const trapping = section(casePage, 'principle-peri-intubation');
    expect(trapping.indexOf('Gas trapping adds a fourth mechanism.')).toBeLessThan(
      trapping.indexOf('data-diagram="04-gas-trapping"'),
    );
    expect(trapping.indexOf('data-diagram="04-gas-trapping"')).toBeLessThan(
      trapping.indexOf('What remains uncertain'),
    );

    const monitoring = section(casePage, 'principle-monitoring');
    expect(monitoring.indexOf('Because the number has so many inputs')).toBeLessThan(
      monitoring.indexOf('data-diagram="05-reading-capnography"'),
    );
    expect(monitoring.indexOf('data-diagram="05-reading-capnography"')).toBeLessThan(
      monitoring.indexOf('class="part-questions"'),
    );

    const afterRosc = section(casePage, 'principle-post-rosc-physiology');
    expect(afterRosc.indexOf('The limit of the model')).toBeLessThan(
      afterRosc.indexOf('data-diagram="06-after-rosc"'),
    );
    expect(casePage.indexOf('data-diagram="06-after-rosc"')).toBeLessThan(
      casePage.indexOf('id="principle-rosc-hemodynamics"'),
    );

    const perfusion = section(casePage, 'principle-coronary-cerebral-perfusion');
    const coronary = figure(perfusion, 'coronary-circuit');
    const pairs = figure(perfusion, 'pressure-pairs');
    const release = figure(perfusion, 'compression-release');
    expect(perfusion.indexOf('The heart is a muscle that never rests in health')).toBeLessThan(
      perfusion.indexOf('data-diagram="coronary-circuit"'),
    );
    expect(perfusion.indexOf('data-diagram="coronary-circuit"')).toBeLessThan(
      perfusion.indexOf('That path explains why two pressures'),
    );
    expect(perfusion.indexOf('With that picture in place, the equation')).toBeLessThan(
      perfusion.indexOf('data-diagram="pressure-pairs"'),
    );
    expect(perfusion.indexOf('data-diagram="pressure-pairs"')).toBeLessThan(
      perfusion.indexOf('Phase matters for a second reason'),
    );
    expect(perfusion.indexOf('Phase matters for a second reason')).toBeLessThan(
      perfusion.indexOf('data-diagram="compression-release"'),
    );
    expect(perfusion.indexOf('data-diagram="compression-release"')).toBeLessThan(
      perfusion.indexOf('For the heart, the gradient that matters'),
    );
    expect(perfusion.indexOf('For the heart, the gradient that matters')).toBeLessThan(
      perfusion.indexOf('data-diagram="pressure-gradient"'),
    );
    expect(perfusion.indexOf('data-diagram="pressure-gradient"')).toBeLessThan(
      perfusion.indexOf('The model has limits'),
    );
    expect(coronary).toContain('role="img"');
    expect(coronary).toContain('id="diagram-coronary-circuit-wide-title"');
    expect(coronary).toContain('id="diagram-coronary-circuit-stack-title"');
    expect(coronary).toContain('id="diagram-coronary-circuit-wide-desc"');
    expect(coronary).toContain('class="diagram-wide"');
    expect(coronary).toContain('class="diagram-stack"');
    expect(coronary).toContain('Aortic pressure');
    expect(coronary).toContain('during release');
    expect(coronary).toContain('Right atrial pressure');
    expect(coronary).toContain('difference between these two points');
    expect(coronary).toContain('= coronary perfusion pressure');
    expect(coronary).toContain('A smaller share drains by small veins');
    expect(coronary).toContain(
      'The coronary circuit. Blood enters the coronary arteries at the aortic root (①), crosses the heart muscle through progressively smaller vessels, and drains mostly through the coronary sinus into the right atrium (②). Coronary perfusion pressure is the difference between the pressures at ① and ②, read at the same moment in the release phase of compression. It is a pressure difference, not a pressure at any single point and not a measure of flow. Schematic, not to scale. In studies, these pressures are measured by catheters in or near these sites.',
    );
    expect(coronary).toContain('Marker 1 at the aortic root shows aortic pressure here.');
    expect(coronary).toContain('Marker 2 at the right atrium shows right atrial pressure here.');
    expect(coronary).not.toContain('where aortic pressure is measured');
    expect(coronary).not.toContain('where right atrial pressure is measured');
    expect(coronary).toContain(
      'the difference between the two, measured at the same moment, between compressions.',
    );
    expect(coronary.toLowerCase()).not.toContain('mmhg');
    expect(pairs).toContain('role="img"');
    expect(pairs).toContain('Two pressures and the difference between them');
    expect(pairs).toContain('zeroed at the level of the right atrium');
    expect(pairs).toContain('hypothetical, above those usually measured in human CPR');
    expect(pairs).toContain('Data as table');
    expect(pairs).toContain('35 &minus; 10 = 25&nbsp;mm&nbsp;Hg');
    expect(pairs).toContain('35 &minus; 25 = 10&nbsp;mm&nbsp;Hg');
    expect(pairs).toContain('50 &minus; 40 = 10&nbsp;mm&nbsp;Hg');
    expect(pairs).toContain('class="diagram-wide"');
    expect(pairs).toContain('class="diagram-stack"');
    expect(pairs.toLowerCase()).not.toContain('diastolic');
    expect(pairs.toLowerCase()).not.toContain('worse');
    expect(release).toContain('role="img"');
    expect(release).toContain('forward coronary flow is small');
    expect(release).toContain('the coronary bed fills mainly now');
    expect(release).toContain('Pause: no compression, aortic pressure decays');
    expect(release).toContain('Read here');
    expect(release).toContain('Data as table');
    expect(release.toLowerCase()).not.toContain('diastolic');
    expect(section(casePage, 'principle-coronary-cerebral-perfusion')).toContain('data-diagram="pressure-gradient"');
    expect(section(casePage, 'principle-minimize-interruptions')).toContain('data-diagram="compression-pause"');
    expect(section(casePage, 'principle-coronary-cerebral-perfusion')).not.toContain('oxygen-delivery');
    expect(section(casePage, 'principle-early-defibrillation')).not.toContain('etco2-determinants');

    for (const spec of physiologyFigures) {
      const needle = `data-diagram="${spec.id}"`;
      const at = casePage.indexOf(needle);
      expect(at, spec.id).toBeGreaterThan(-1);
      expect(casePage.indexOf(needle, at + needle.length), spec.id).toBe(-1);
      const block = figure(casePage, spec.id);
      expect(block).toContain('role="img"');
      expect(block).toContain(`aria-label="${spec.alt}"`);
      expect(block).toContain(`aria-label="${spec.scrollLabel}"`);
      expect(block).toContain('class="diagram-scroll"');
      expect(block).toContain('role="region"');
      expect(block).toContain('tabindex="0"');
      expect(block).toContain(spec.caption);
      expect(block).toContain('class="field-label"');
      expect(block).toContain('>Sources<');
      for (const url of spec.sources) {
        expect(block).toContain(`href="${url}"`);
        expect(block).toContain(`>${url}<`);
      }
      expect(block).toContain('viewBox="');
      const root = block.match(/<svg\b[^>]*>/)?.[0] ?? '';
      expect(root, spec.id).not.toMatch(/\swidth="/);
      expect(root, spec.id).not.toMatch(/\sheight="/);
      expect(block).not.toContain('DejaVu');
      expect(block).toContain('Fraunces');
      expect(block).toContain('Literata');
    }

    const oxygen = figure(casePage, '01-oxygen-delivery');
    expect(oxygen).toContain('>1020<');
    expect(oxygen).toContain('>306<');
    expect(oxygen).toContain('>324<');
  });

  it('adds CPR mechanics subheads and a cycle table without changing the prose', () => {
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');
    const mechanics = section(casePage, 'principle-cpr-mechanics');
    const how = mechanics.indexOf('<h3 class="prose-subhead">How a compression moves blood</h3>');
    const release = mechanics.indexOf('<h3 class="prose-subhead">Release</h3>');
    const five = mechanics.indexOf('<h3 class="prose-subhead">Five variables, one cycle</h3>');
    const arithmetic = 'An illustrative calculation, from the guideline numbers rather than from measurement';
    const caption =
      'These figures show the arithmetic of the cycle, not targets, and they do not say how much flow occurs in each phase.';
    expect(how).toBeGreaterThan(-1);
    expect(how).toBeLessThan(mechanics.indexOf('A compression moves blood by raising pressure'));
    expect(release).toBeGreaterThan(how);
    expect(release).toBeLessThan(mechanics.indexOf('Release is the other half of the cycle'));
    expect(five).toBeGreaterThan(release);
    expect(five).toBeLessThan(mechanics.indexOf('The compression variables are not independent dials.'));
    expect(mechanics.indexOf(arithmetic)).toBeLessThan(mechanics.indexOf('class="cycle-arithmetic"'));
    expect(mechanics.indexOf('class="cycle-arithmetic"')).toBeLessThan(
      mechanics.indexOf('Ventilation acts on the same chest.'),
    );
    expect(mechanics).toContain('At 100 compressions per minute each cycle lasts 0.6 seconds; at 120 per minute, 0.5 seconds.');
    expect(mechanics).toContain(
      'the release phase available for refilling and coronary filling is about 0.3 seconds at the lower rate and about 0.25 seconds at the upper.',
    );
    expect(mechanics.split(caption).length - 1).toBe(2);
    const table = mechanics.slice(
      mechanics.indexOf('class="cycle-arithmetic"'),
      mechanics.indexOf('</figure>', mechanics.indexOf('class="cycle-arithmetic"')),
    );
    const css = readFileSync(join(repoRoot, 'src/styles/global.css'), 'utf8');
    expect(css).toMatch(/\.cycle-arithmetic table\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
    expect(table).toContain('>100/min<');
    expect(table).toContain('>0.6 s<');
    expect(table).toContain('>about 0.3 s<');
    expect(table).toContain('>120/min<');
    expect(table).toContain('>0.5 s<');
    expect(table).toContain('>about 0.25 s<');
    expect(table).toContain(caption);
  });

  it('sets the oxygen formulas on centred display lines without changing the prose', () => {
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');
    const css = readFileSync(join(repoRoot, 'src/styles/global.css'), 'utf8');
    const source = readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8');
    const partTwo = section(casePage, 'principle-normal-circulation');
    const cao = 'CaO2 ≈ (1.34 × Hb × SaO2) + (0.003 × PaO2)';
    const do2 = 'DO2 = CO × CaO2';
    const deliverySentence = `Oxygen delivery is the product of cardiac output and arterial oxygen content (${do2}).`;
    const unitSentence =
      'DO2 in mL O2 per minute equals CO in L/min times CaO2 in mL/dL times 10.';

    expect(source).toContain(cao);
    expect(source).toContain(deliverySentence);
    expect(source).toContain(unitSentence);
    expect(partTwo.split(cao).length - 1).toBe(2);
    expect(partTwo.split(do2).length - 1).toBe(2);
    expect(partTwo).toContain(`<p class="equation">${cao}</p>`);
    expect(partTwo).toContain(`<p class="equation">${do2}</p>`);
    expect(partTwo).toContain('Content describes the blood, not the patient');
    expect(partTwo).toContain(unitSentence);
    expect(partTwo.indexOf(cao)).toBeLessThan(partTwo.indexOf(`<p class="equation">${cao}</p>`));
    expect(partTwo.indexOf(`<p class="equation">${cao}</p>`)).toBeLessThan(
      partTwo.indexOf('Content describes the blood, not the patient'),
    );
    expect(partTwo.indexOf(deliverySentence)).toBeLessThan(partTwo.indexOf(`<p class="equation">${do2}</p>`));
    expect(partTwo.indexOf(`<p class="equation">${do2}</p>`)).toBeLessThan(partTwo.indexOf(unitSentence));
    expect(partTwo.indexOf(unitSentence)).toBeLessThan(
      partTwo.indexOf('During CPR the first factor is the limiting one.'),
    );

    const rule = css.match(/\.prose \.equation\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(rule).toContain('text-align: center');
    expect(rule).toContain('font-variant-numeric: tabular-nums');
    expect(rule).toContain('"tnum" 1');
  });

  it('renders the reversible-cause figure beside its principle', () => {
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');
    const source = readFileSync(join(repoRoot, 'src/content/cases/adult-cardiac-arrest.json'), 'utf8');
    const names = causeNames(source);
    const causes = section(casePage, 'principle-reversible-causes');
    const overlap = figure(causes, 'reversible-cause-overlap');

    const reversibleAt = casePage.indexOf('id="principle-reversible-causes"');
    const overlapAt = casePage.indexOf('data-diagram="reversible-cause-overlap"', reversibleAt);
    const causeListAt = casePage.indexOf('class="causes"', reversibleAt);
    expect(overlapAt).toBeGreaterThan(reversibleAt);
    expect(overlapAt).toBeLessThan(causeListAt);
    expect(casePage.indexOf('id="cause-hypovolemia"', reversibleAt)).toBeGreaterThan(overlapAt);

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
