import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkRepository, formatCheckReport } from '../scripts/check-no-model-calls.mjs';
import { FORBIDDEN_PACKAGES, MODEL_HOSTS } from '../scripts/model-call-denylist.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), 'resus-ac2-'));
}

function write(root: string, path: string, contents: string) {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, contents);
}

describe('AC2 no-model-calls check', () => {
  it('reports this repository as clean', () => {
    const result = checkRepository(repoRoot);
    expect(result.findings, formatCheckReport(result)).toEqual([]);
    expect(formatCheckReport(result)).toContain('Result: CLEAN');
    expect(result.filesScanned).toBeGreaterThan(5);
  });

  it('fails when package.json depends on a model SDK', () => {
    const root = tempRepo();
    write(
      root,
      'package.json',
      JSON.stringify({ dependencies: { openai: '^4.0.0' } }, null, 2),
    );
    const result = checkRepository(root);
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.kind === 'dependency')).toBe(true);
  });

  it('fails when a lockfile installs a scoped model SDK', () => {
    const root = tempRepo();
    write(root, 'package-lock.json', '{\n  "node_modules/@ai-sdk/openai": {}\n}\n');
    const result = checkRepository(root);
    expect(result.findings.some((finding) => finding.message.includes('@ai-sdk/openai'))).toBe(true);
  });

  it('fails on an import of a model client and ignores unrelated packages', () => {
    const root = tempRepo();
    const clientPackage = FORBIDDEN_PACKAGES.find((name) => name.startsWith('anth') && !name.includes('/'));
    if (!clientPackage) throw new Error('denylist is missing the expected client package');
    const source = [
      'import client from ',
      JSON.stringify(clientPackage),
      ';\nimport records from "airtable";\n',
    ].join('');
    write(root, 'src/page.ts', source);
    const result = checkRepository(root);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain(clientPackage);
  });

  it('fails on a fetch to a model endpoint', () => {
    const root = tempRepo();
    const host = MODEL_HOSTS[0];
    write(root, 'src/call.ts', `const response = await fetch("https://${host}/v1/responses");\n`);
    const result = checkRepository(root);
    expect(result.findings.some((finding) => finding.kind === 'endpoint')).toBe(true);
  });

  it('allows an ordinary fetch and a host mentioned without a call', () => {
    const root = tempRepo();
    const host = MODEL_HOSTS[0];
    write(root, 'src/ok.ts', 'await fetch("https://example.com/cases.json");\n');
    write(root, 'notes.md', `Vendor host ${host} is forbidden when called.\n`);
    const result = checkRepository(root);
    expect(result.ok).toBe(true);
  });

  it('fails when a file contains an API-key-shaped secret', () => {
    const root = tempRepo();
    const secret = ['sk', 'proj', 'a'.repeat(24)].join('-');
    const assignment = ['OPENAI', 'API_KEY'].join('_');
    write(root, '.env', `${assignment}=${JSON.stringify(secret)}\n`);
    const result = checkRepository(root);
    expect(result.findings.some((finding) => finding.kind === 'secret')).toBe(true);
  });

  it('exits 0 for this repository when run as the CI script', () => {
    const result = spawnSync(process.execPath, [join(repoRoot, 'scripts/check-no-model-calls.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Result: CLEAN');
    expect(result.status).toBe(0);
  });
});
