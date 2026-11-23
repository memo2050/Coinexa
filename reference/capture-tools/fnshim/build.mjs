import { rolldown } from '/home/claude/coinexa-run/node_modules/rolldown/dist/index.mjs';
const names = ['usageSummary','manageOrganization','adminOverview','adminAgents','adminRuns','adminUsage','adminCustomers','adminBilling','adminActivity'];
for (const n of names) {
  const b = await rolldown({ input: `/home/claude/coinexa-run/base44/functions/${n}/entry.ts`, platform: 'node',
    resolve: { alias: { 'npm:@base44/sdk@0.8.54': '/home/claude/scripts/fnshim/sdk-shim.mjs', 'base44:runtime': '/home/claude/scripts/fnshim/runtime-shim.mjs' } } });
  await b.write({ file: `/home/claude/scripts/fnshim/out/${n}.mjs`, format: 'esm' });
}
console.log('built', names.length);
