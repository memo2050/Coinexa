// Fails if the browser and server copies of the entity query translator differ.
import { readFileSync } from 'node:fs';
const a = readFileSync(new URL('../src/api/entityQuery.js', import.meta.url), 'utf8');
const b = readFileSync(new URL('../supabase/functions/_shared/entityQuery.js', import.meta.url), 'utf8');
if (a !== b) { console.error('src/api/entityQuery.js and supabase/functions/_shared/entityQuery.js differ'); process.exit(1); }
console.log('entityQuery.js copies are identical');
