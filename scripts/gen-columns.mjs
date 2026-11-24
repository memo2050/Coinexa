// Generates the COLUMNS map inside entityQuery.js (browser and functions copies)
// from the schema migration, so writes silently drop fields that are not real
// columns, the way Base44's schemaless entities did.
//   node scripts/gen-columns.mjs          → rewrite both copies
//   node scripts/gen-columns.mjs --check  → exit 1 if either copy is out of date
import { readFileSync, writeFileSync } from 'node:fs';

const schema = readFileSync('supabase/migrations/20261123000001_schema.sql', 'utf8');
const columns = {};
for (const match of schema.matchAll(/create table public\.(\w+) \(\n([\s\S]*?)\n\);/g)) {
  const [, table, body] = match;
  columns[table] = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[a-z_][a-z0-9_]* /.test(line) && !/^(constraint|primary|unique|check|foreign)\b/.test(line))
    .map((line) => line.split(/\s+/)[0]);
}

const block =
  '// BEGIN GENERATED COLUMNS (scripts/gen-columns.mjs — do not edit by hand)\n' +
  'export const COLUMNS = {\n' +
  Object.entries(columns)
    .map(([table, cols]) => `  ${table}: new Set(${JSON.stringify(cols)}),`)
    .join('\n') +
  '\n};\n// END GENERATED COLUMNS';

const files = ['src/api/entityQuery.js', 'supabase/functions/_shared/entityQuery.js'];
const check = process.argv.includes('--check');
let stale = false;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const re = /\/\/ BEGIN GENERATED COLUMNS[\s\S]*?\/\/ END GENERATED COLUMNS/;
  if (!re.test(source)) throw new Error(`${file}: generated COLUMNS markers missing`);
  const next = source.replace(re, block);
  if (next !== source) {
    stale = true;
    if (!check) writeFileSync(file, next);
  }
}
if (check && stale) {
  console.error('COLUMNS map is out of date: run node scripts/gen-columns.mjs');
  process.exit(1);
}
console.log(`columns: ${Object.keys(columns).length} tables${check ? ' (up to date)' : ''}`);
