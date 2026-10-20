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

    expect(casePage).toContain('Coronary and cerebral perfusion depend on compressions');
    expect(casePage).toContain('During CPR, coronary perfusion pressure is judged in the relaxation phase between compressions');
    expect(casePage).toContain('Incomplete recoil leaves right atrial pressure high');
    expect(casePage).toContain('The compression generates aortic pressure, but the coronary gradient is aortic pressure minus right atrial pressure');
    expect(casePage).toContain('When a pulse returns, leave 100% oxygen on until SpO2 or PaO2 is reliably measured');
    expect(casePage).toContain('href="#principle-coronary-cerebral-perfusion"');
    expect(casePage).toContain('href="#principle-post-rosc-physiology"');
    expect(casePage).not.toContain('PLACEHOLDER FIXTURE');
    expect(casePage).not.toContain('api.openai.com');
    expect(casePage).not.toContain('fonts.googleapis.com');
    expect(casePage).toContain('Why this answer');
    expect(casePage).toContain('>Correct<');
    expect(casePage).toContain('<details open');
    expect(casePage).toContain('/fonts/Fraunces-latin.woff2');
    expect(casePage).toContain('/fonts/Literata-latin.woff2');
  });
});
