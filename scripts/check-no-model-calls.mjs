import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FORBIDDEN_PYPI_PACKAGES,
  MODEL_HOSTS,
  isForbiddenPackage,
  packageNameFromSpecifier,
} from './model-call-denylist.mjs';

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.astro',
  '.vercel',
  'node_modules',
  'dist',
  'coverage',
]);

const CODE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.mts',
  '.cts',
  '.astro',
  '.vue',
  '.svelte',
  '.html',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.py',
  '.txt',
]);

const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock']);

const FETCH_CALL = /\b(?:fetch|axios|got|undici|node-fetch)\s*\(|\bhttps?\.request\s*\(|\bbaseURL\s*[:=]/;

const SECRET_PATTERNS = [
  {
    name: 'openai-or-anthropic-style key',
    re: /\bsk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'xai-style key',
    re: /\bxai-[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: 'google-api-style key',
    re: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  },
  {
    name: 'assigned model API key',
    re: /\b(?:OPENAI|ANTHROPIC|XAI|GROK|GEMINI|GOOGLE_GENERATIVE_AI|GOOGLE_API)_API_KEY\s*[:=]\s*['"][^'"\n]{8,}['"]/g,
  },
];

const SPECIFIER_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * @typedef {object} Finding
 * @property {'dependency' | 'import' | 'secret' | 'endpoint'} kind
 * @property {string} file
 * @property {number | null} line
 * @property {string} message
 */

/**
 * @typedef {object} CheckResult
 * @property {boolean} ok
 * @property {string} root
 * @property {number} filesScanned
 * @property {Finding[]} findings
 */

/**
 * @param {string} root
 * @returns {CheckResult}
 */
export function checkRepository(root) {
  /** @type {Finding[]} */
  const findings = [];
  let filesScanned = 0;

  /**
   * @param {string} directory
   */
  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      const path = join(directory, entry);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (!stat.isFile()) continue;
      filesScanned += 1;
      scanFile(path, root, findings);
    }
  }

  walk(root);
  return { ok: findings.length === 0, root, filesScanned, findings };
}

/**
 * @param {string} path
 * @param {string} root
 * @param {Finding[]} findings
 */
function scanFile(path, root, findings) {
  const relativePath = relative(root, path).split(sep).join('/');
  let text;
  try {
    const buffer = readFileSync(path);
    if (buffer.includes(0)) return;
    text = buffer.toString('utf8');
  } catch {
    findings.push({
      kind: 'secret',
      file: relativePath,
      line: null,
      message: 'Could not read file while scanning for model calls and secrets',
    });
    return;
  }

  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base === 'package.json') {
    scanPackageJson(relativePath, text, findings);
  }
  if (LOCKFILES.has(base)) {
    scanLockfile(relativePath, text, findings);
  }
  if (base === 'requirements.txt' || base === 'pyproject.toml') {
    scanPythonManifest(relativePath, text, findings);
  }

  const extension = extensionOf(base);
  if (CODE_EXTENSIONS.has(extension) || base === 'package.json') {
    scanImports(relativePath, text, findings);
    scanEndpoints(relativePath, text, findings);
  }

  // Lockfile integrity hashes are high-entropy and can look like tokens.
  if (!LOCKFILES.has(base)) {
    scanSecrets(relativePath, text, findings);
  }
}

/**
 * @param {string} file
 * @param {string} text
 * @param {Finding[]} findings
 */
function scanPackageJson(file, text, findings) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    findings.push({
      kind: 'dependency',
      file,
      line: null,
      message: 'package.json is not valid JSON, so dependencies could not be checked',
    });
    return;
  }
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  for (const section of sections) {
    const deps = parsed?.[section];
    if (!deps || typeof deps !== 'object') continue;
    for (const name of Object.keys(deps)) {
      if (!isForbiddenPackage(name)) continue;
      findings.push({
        kind: 'dependency',
        file,
        line: lineOf(text, `"${name}"`),
        message: `${section} declares forbidden model SDK or API client "${name}"`,
      });
    }
  }
}

/**
 * @param {string} file
 * @param {string} text
 * @param {Finding[]} findings
 */
function scanLockfile(file, text, findings) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/node_modules\/((?:@[^/]+\/)?[^/"']+)/);
    if (!match) return;
    const name = match[1];
    if (!name || !isForbiddenPackage(name)) return;
    findings.push({
      kind: 'dependency',
      file,
      line: index + 1,
      message: `lockfile installs forbidden model SDK or API client "${name}"`,
    });
  });
}

/**
 * @param {string} file
 * @param {string} text
 * @param {Finding[]} findings
 */
function scanPythonManifest(file, text, findings) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) return;
    const name = trimmed.split(/[=<>\s\[]/, 1)[0]?.toLowerCase();
    if (!name || !FORBIDDEN_PYPI_PACKAGES.includes(name)) return;
    findings.push({
      kind: 'dependency',
      file,
      line: index + 1,
      message: `Python manifest declares forbidden model client "${name}"`,
    });
  });
}

/**
 * @param {string} file
 * @param {string} text
 * @param {Finding[]} findings
 */
function scanImports(file, text, findings) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    SPECIFIER_PATTERN.lastIndex = 0;
    let match;
    while ((match = SPECIFIER_PATTERN.exec(line)) !== null) {
      const specifier = match[1] || match[2] || match[3];
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes('://')) {
        continue;
      }
      const packageName = packageNameFromSpecifier(specifier);
      if (!isForbiddenPackage(packageName)) continue;
      findings.push({
        kind: 'import',
        file,
        line: index + 1,
        message: `imports forbidden model SDK or API client "${packageName}"`,
      });
    }
  });
}

/**
 * @param {string} file
 * @param {string} text
 * @param {Finding[]} findings
 */
function scanEndpoints(file, text, findings) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const host = MODEL_HOSTS.find((candidate) => line.includes(candidate));
    if (!host) return;
    const window = lines.slice(Math.max(0, index - 4), index + 3).join('\n');
    if (!FETCH_CALL.test(window)) return;
    findings.push({
      kind: 'endpoint',
      file,
      line: index + 1,
      message: `model endpoint call targeting ${host}`,
    });
  });
}

/**
 * @param {string} file
 * @param {string} text
 * @param {Finding[]} findings
 */
function scanSecrets(file, text, findings) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of SECRET_PATTERNS) {
      pattern.re.lastIndex = 0;
      if (!pattern.re.test(line)) continue;
      findings.push({
        kind: 'secret',
        file,
        line: index + 1,
        message: `API-key-shaped secret (${pattern.name})`,
      });
    }
  });
}

/**
 * @param {string} filename
 */
function extensionOf(filename) {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index);
}

/**
 * @param {string} text
 * @param {string} needle
 */
function lineOf(text, needle) {
  const index = text.indexOf(needle);
  if (index === -1) return null;
  return text.slice(0, index).split(/\r?\n/).length;
}

/**
 * @param {CheckResult} result
 */
export function formatCheckReport(result) {
  const kinds = [
    ['dependency', 'Dependency manifests'],
    ['import', 'SDK and API client imports'],
    ['secret', 'API-key-shaped secrets'],
    ['endpoint', 'Model endpoint calls'],
  ];
  const lines = [
    'AC2 no-model-calls check',
    `Root: ${result.root}`,
    `Files scanned: ${result.filesScanned}`,
  ];
  for (const [kind, label] of kinds) {
    const matches = result.findings.filter((finding) => finding.kind === kind);
    lines.push(matches.length === 0 ? `${label}: clean` : `${label}: ${matches.length} finding(s)`);
  }
  if (result.findings.length === 0) {
    lines.push('Result: CLEAN');
    return lines.join('\n');
  }
  lines.push('Findings:');
  for (const finding of result.findings) {
    const location = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
    lines.push(`- ${location}: ${finding.message}`);
  }
  lines.push('Result: FAIL');
  return lines.join('\n');
}

const entryHref = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';

if (import.meta.url === entryHref) {
  const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  const result = checkRepository(root);
  console.log(formatCheckReport(result));
  process.exit(result.ok ? 0 : 1);
}
