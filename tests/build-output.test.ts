import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
    expect(casePage).not.toContain('<div class="answer">');
    expect(casePage).toContain('id="reference-aha-2025-bls"');
    expect(casePage).toContain('When a pulse returns, leave 100% oxygen on until SpO2 or PaO2 is reliably measured');
    expect(casePage).toContain('href="#principle-coronary-cerebral-perfusion"');
    expect(casePage).toContain('href="#principle-post-rosc-physiology"');
    expect(casePage).not.toContain('PLACEHOLDER FIXTURE');
    expect(casePage).not.toContain('api.openai.com');
    expect(casePage).not.toContain('fonts.googleapis.com');
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
    expect(gradient.toLowerCase()).not.toContain('mm');

    expect(timeline).toContain('role="img"');
    expect(timeline).toContain('<title');
    expect(timeline).toContain('<desc');
    expect(timeline).toContain('<figcaption');
    expect(timeline).toContain('Schematic, not measured data');
    expect(timeline).toContain('Each block is one compression.');
    expect(timeline.toLowerCase()).not.toContain('mm');

    expect(section(casePage, 'principle-early-defibrillation')).not.toContain('data-diagram');
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
