import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function readDist(path: string): string {
  return readFileSync(join(repoRoot, 'dist', path), 'utf8');
}

describe('static build output', () => {
  it('renders the case index and the placeholder case', () => {
    const index = readDist('index.html');
    const casePage = readDist('cases/adult-cardiac-arrest/index.html');

    expect(index).toContain('Resus First Principles');
    expect(index).toContain('Adult cardiac arrest (PLACEHOLDER)');
    expect(index).toContain('href="/cases/adult-cardiac-arrest"');

    expect(casePage).toContain('PLACEHOLDER FIXTURE');
    expect(casePage).toContain('PLACEHOLDER question prompt targeting principle one.');
    expect(casePage).toContain('PLACEHOLDER answer for principle one.');
    expect(casePage).toContain('PLACEHOLDER reasoning that will explain why this answer follows from principle one.');
    expect(casePage).toContain('PLACEHOLDER. This will explain why step two follows from both placeholder principles.');
    expect(casePage).toContain('href="#principle-principle-placeholder-1"');
    expect(casePage).toContain('href="#principle-principle-placeholder-2"');
    expect(casePage).not.toContain('api.openai.com');
  });
});
