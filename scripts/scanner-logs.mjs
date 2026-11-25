// Recent securityScan requests (HTTP status) and refusal reasons from Supabase logs.
// Public repository: emails are replaced and the last part of any address is masked.
// Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
const ref = process.env.SUPABASE_PROJECT_REF;
const start = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
const end = new Date().toISOString();
const mask = (s) => String(s).replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.x').replace(/[\w.+-]+@[\w.-]+/g, '<email>').replace(/\s+/g, ' ').slice(0, 300);

async function q(sql) {
  const url = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`);
  url.searchParams.set('sql', sql);
  url.searchParams.set('iso_timestamp_start', start);
  url.searchParams.set('iso_timestamp_end', end);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    console.log(`log query failed (${res.status}): ${mask(JSON.stringify(j.error || j.message || j)).slice(0, 200)}`);
    return [];
  }
  return (j.result || []).reverse();
}

// Column names of the unified logs table (printed once; no values).
const probe = await q('select * from logs limit 1');
if (probe[0]) console.log('log columns:', Object.keys(probe[0]).join(', '));

const time = (ts) => {
  const n = Number(ts);
  const d = Number.isFinite(n) ? new Date(n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000) : new Date(String(ts).replace(' ', 'T') + (String(ts).endsWith('Z') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 19) + 'Z';
};
console.log('== securityScan requests (method | status) ==');
const reqs = await q("select timestamp, event_message from logs where source_name = 'function_edge_logs' and event_message like '%/securityScan%' order by timestamp desc limit 100");
console.log(`${reqs.length} requests`);
for (const r of reqs) console.log(time(r.timestamp), mask(String(r.event_message).split('|').slice(0, 2).join('|')));
console.log('\n== securityScan refusals and errors ==');
const logs = await q("select timestamp, event_message from logs where source_name = 'function_logs' and event_message like '%securityScan%' order by timestamp desc limit 100");
console.log(`${logs.length} lines`);
for (const r of logs) console.log(time(r.timestamp), mask(r.event_message));
