import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatValidationReport, validateContentDirectory } from '../src/lib/validate-content.ts';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const positional = args.filter((arg) => !arg.startsWith('-'));
const directory = positional[0]
  ? resolve(positional[0])
  : fileURLToPath(new URL('../src/content/cases/', import.meta.url));

const result = validateContentDirectory(directory, { strict });
console.log(formatValidationReport(result));
process.exit(result.ok ? 0 : 1);
