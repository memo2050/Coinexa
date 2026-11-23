const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const DATA = JSON.parse(fs.readFileSync('/home/claude/scripts/data.json'));
const FONTS = '/home/claude/scripts/tools/node_modules/@fontsource/';
const OUT = process.env.OUT || '/home/claude/stage0/export-screens';
const ONLY = process.env.ONLY; const PROBE = !!process.env.PROBE;
const ORG = '6af6222b39a767b855bf2c2d';
const USER = { id:'6ae24c563e67d1221bba9b23', email:'ramyusa2030@gmail.com', full_name:'Hossam', role:'admin', organization_ids:[ORG], created_date:'2026-10-29T00:00:00Z' };
const fontCss = () => {
  const f=[['Inter','inter',[300,400,500,600]],['Space Grotesk','space-grotesk',[400,500,600,700]]];
  return f.flatMap(([fam,dir,ws])=>ws.map(w=>`@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:block;src:url(https://fonts.gstatic.com/local/${dir}/${dir}-latin-${w}-normal.woff2) format('woff2');}`)).join('\n');
};
const PUBLIC = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms', '/page-that-does-not-exist'];
const PRIVATE = ['/agents','/agents/new','/agents/6ae80131e1a9a3089746f706','/tasks','/inbox','/usage','/security-check','/billing/success','/admin','/admin/agents','/admin/runs','/admin/usage','/admin/customers','/admin/billing','/admin/reports','/admin/activity'];
const VIEWS = [['desktop',1440,900],['tablet',820,1180],['mobile',390,844]];
const unhandled = new Set();
const HANDLERS = {};
async function loadFunctions() {
  globalThis.__STORE = JSON.parse(JSON.stringify(DATA)); globalThis.__STORE.User = [USER]; globalThis.__USER = USER;
  let current; globalThis.Deno = { serve: (h) => { HANDLERS[current] = typeof h === 'function' ? h : h.handler; }, env: { get: () => undefined } };
  for (const f of fs.readdirSync('/home/claude/scripts/fnshim/out')) { current = f.replace('.mjs',''); const m = await import('/home/claude/scripts/fnshim/out/'+f); if (m.default) HANDLERS[current] = typeof m.default === 'function' ? m.default : m.default.fetch; }
}
function entityResp(url, method) {
  const m = url.pathname.match(/\/entities\/([^/]+)(?:\/([^/]+))?/); if (!m) return null;
  const [, name, sub] = m;
  if (name === 'User' && sub === 'me') return USER;
  const rows = DATA[name] || (name==='User' ? [USER] : []);
  const qs = url.searchParams.get('q'); let q = null; try { q = qs && JSON.parse(qs); } catch {}
  const match = (x) => !q || Object.entries(q).every(([k,v]) => v && typeof v==='object' ? (Array.isArray(v.$in) ? v.$in.includes(x[k]) : true) : (Array.isArray(x[k]) ? x[k].includes(v) : x[k]===v));
  let r = rows.filter(match);
  const sort = url.searchParams.get('sort'); if (sort) { const d = sort.startsWith('-')?-1:1, k = sort.replace(/^[-+]/,''); r = [...r].sort((a,b)=>a[k]>b[k]?d:a[k]<b[k]?-d:0); }
  const lim = Number(url.searchParams.get('limit')); if (lim) r = r.slice(0, lim);
  if (sub === 'count') return { count: rows.filter(match).length };
  if (sub === 'v2') return { items: r, next_cursor: null };
  if (sub) return rows.find(x => x.id === sub) || {};
  if (method !== 'GET') return rows[0] || {};
  return r;
}
async function setup(ctx, signedIn, log) {
  if (signedIn) await ctx.addInitScript(() => { localStorage.setItem('base44_access_token','stage0-reference-only'); });
  await ctx.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.host === 'fonts.googleapis.com') return route.fulfill({ contentType:'text/css', body: fontCss() });
    if (url.host === 'fonts.gstatic.com' && url.pathname.startsWith('/local/')) { const [, , dir, file] = url.pathname.split('/'); return route.fulfill({ contentType:'font/woff2', body: fs.readFileSync(FONTS+dir+'/files/'+file) }); }
    if (url.host !== 'localhost:4173') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let body = {};
    if (url.pathname.includes('public-settings')) body = { id:'stage0', public_settings:{ auth_config:{} } };
    else if (url.pathname.includes('/analytics/')) body = {};
    else if (url.pathname.includes('/functions/')) {
      const fn = url.pathname.split('/functions/')[1]; const h = HANDLERS[fn];
      if (!h) { unhandled.add('fn '+fn); return route.fulfill({ status:500, contentType:'application/json', body:'{"error":"no handler"}' }); }
      const res = await h(new Request('http://local/'+fn, { method:'POST', headers:{ 'content-type':'application/json', authorization:'Bearer x' }, body: req.postData() || '{}' }));
      return route.fulfill({ status: res.status, contentType:'application/json', body: await res.text() });
    }
    else { const e = entityResp(url, req.method()); if (e !== null) body = e; else { unhandled.add(req.method()+' '+url.pathname); log.push(url.pathname); body = {}; } }
    if (!signedIn && url.pathname.endsWith('/entities/User/me')) return route.fulfill({ status:401, contentType:'application/json', body:'{"message":"unauthorized"}' });
    return route.fulfill({ contentType:'application/json', body: JSON.stringify(body) });
  });
}
(async () => {
  await loadFunctions();
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome' });
  const report = [];
  for (const [vname,w,h] of VIEWS) {
    if (ONLY && !ONLY.split(',').includes(vname)) continue;
    for (const [signed, pages] of [[false,PUBLIC],[true,PRIVATE]]) {
      const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1, reducedMotion:'no-preference' });
      const log = []; await setup(ctx, signed, log);
      for (const pg of pages) {
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', e => errs.push(e.message.slice(0,160)));
        await p.goto('http://localhost:4173'+pg, { waitUntil:'networkidle' }).catch(()=>{});
        await p.waitForTimeout(1200);
        const H = await p.evaluate(() => document.documentElement.scrollHeight);
        for (let y=0; y<H; y+=Math.floor(h*0.6)) { await p.evaluate(yy=>window.scrollTo(0,yy), y); await p.waitForTimeout(120); }
        await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(900);
        const finalUrl = new URL(p.url()).pathname;
        const name = (pg==='/'?'home':pg.slice(1).replace(/\//g,'_')).replace('6ae80131e1a9a3089746f706','detail-nadia');
        const file = `${vname}/${signed?'app':'public'}__${name}.png`;
        fs.mkdirSync(path.join(OUT,vname),{recursive:true});
        if (!PROBE) await p.screenshot({ path: path.join(OUT,file), fullPage:true });
        report.push({ view:vname, page:pg, landed:finalUrl, file: PROBE?null:file, errors:errs });
        await p.close();
      }
      await ctx.close();
    }
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, PROBE?'probe.json':'report.json'), JSON.stringify({ report, unhandled:[...unhandled] }, null, 1));
  console.log('unhandled:', [...unhandled].join('\n'));
  report.filter(r=>r.errors.length || r.landed!==r.page).forEach(r=>console.log(r.view, r.page, '->', r.landed, r.errors.join(' || ')));
})();
