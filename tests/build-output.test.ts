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
    expect(casePage).toContain('incomplete release keeps intrathoracic and right atrial pressure elevated');
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
});
