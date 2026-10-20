import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatValidationReport, validateContentDirectory } from '../src/lib/validate-content.ts';

const directory = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../src/content/cases/', import.meta.url));

const result = validateContentDirectory(directory);
console.log(formatValidationReport(result));
process.exit(result.ok ? 0 : 1);
