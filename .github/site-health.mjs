// Daily deep health check of a live site. Run by .github/workflows/site-health.yml.
//
//   node scripts/site-health.mjs [--config .github/site-health.json] [--out report.md]
//
// Site-specific settings live in the config file (all optional except "site"):
//   {
//     "site": "https://www.example.com",          canonical origin; SITE_URL env overrides it
//     "sitemap": "/sitemap.xml",                  sitemap or sitemap index
//     "maxPages": 300,                            cap on sitemap pages fetched
//     "slowMs": 3000,                             pages slower than this are reported
//     "certWarnDays": 21,
//     "notFoundStatus": [404, 410],               acceptable statuses for an unknown URL
//     "skipRedirects": ["https://www.example.com/"],  host variants not to check (e.g. handled by a canonical tag)
//     "files": [ { "path": "/llms.txt", "minLength": 200 }, { "path": "/kb/index.json", "json": true } ],
//     "probes": [ { "name": "lead API", "method": "POST", "path": "/api/lead", "body": "{}",
//                   "contentType": "application/json", "expect": [400], "hints": { "503": "why" } } ]
//   }
//
// Always checks: robots.txt (the `User-agent: *` group must not block the site; per-bot blocks such as AI
// training crawlers are fine), the sitemap, every sitemap page (200, same host, not noindex), real 404s,
// http/apex/www redirects to the canonical origin, and TLS expiry. Probes must be side-effect free.
// Writes a Markdown report and exits 1 when anything fails.

import tls from 'node:tls';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

const arg = (name, fallback = '') => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const configPath = arg('--config', '.github/site-health.json');
const outFile = arg('--out');
const cfg = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};

const SITE = (process.env.SITE_URL || cfg.site || '').replace(/\/$/, '');
if (!SITE) { console.error(`No site URL: set "site" in ${configPath} or SITE_URL.`); process.exit(2); }
const HOST = new URL(SITE).hostname;
const APEX = HOST.replace(/^www\./, '');
const SLOW_MS = cfg.slowMs ?? 3000;
const CERT_WARN_DAYS = cfg.certWarnDays ?? 21;
const MAX_PAGES = cfg.maxPages ?? 300;
const NOT_FOUND = cfg.notFoundStatus ?? [404, 410];
const TIMEOUT_MS = 20000;
const UA = 'SiteHealthCheck/1.1 (+https://github.com/features/actions)';

const results = []; // { group, name, ok, detail }
const record = (group, name, ok, detail = '') => results.push({ group, name, ok, detail });

async function get(url, { method = 'GET', body, headers = {}, redirect = 'follow' } = {}) {
  const started = Date.now();
  const res = await fetch(url, { method, body, redirect, headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  return { res, text, ms: Date.now() - started };
}

async function check(group, name, fn) {
  try {
    const out = await fn();
    record(group, name, out.ok, out.detail);
  } catch (e) {
    record(group, name, false, e.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : String(e.cause?.code || e.message));
  }
}

// Follows redirects by hand so loops and wrong targets are visible.
async function redirectChain(start, maxHops = 5) {
  const hops = [];
  let url = start;
  for (let i = 0; i <= maxHops; i++) {
    const { res } = await get(url, { redirect: 'manual' });
    hops.push(`${res.status} ${url}`);
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) return { final: url, status: res.status, hops };
    const next = new URL(loc, url).href;
    if (next === url || hops.some((h) => h.endsWith(` ${next}`))) return { final: next, status: res.status, hops, loop: true };
    url = next;
  }
  return { final: url, status: 0, hops, tooMany: true };
}

function certDaysLeft(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return reject(new Error('no certificate'));
      resolve({ days: Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000), authorized: socket.authorized, error: socket.authorizationError });
    });
    socket.on('timeout', () => socket.destroy(new Error('TLS timeout')));
    socket.on('error', reject);
  });
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await fn(queue.shift()); }));
}

// robots.txt: true if the group that applies to generic crawlers disallows the whole site.
function blocksEveryone(robots) {
  let agents = [], inRules = false, blocked = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const [, key, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'user-agent') { if (inRules) { agents = []; inRules = false; } agents.push(value); }
    else if (key === 'disallow' || key === 'allow') { inRules = true; if (key === 'disallow' && value === '/' && agents.includes('*')) blocked = true; }
  }
  return blocked;
}

// 1. robots.txt and sitemap.
let robotsText = '';
await check('Crawler files', '/robots.txt', async () => {
  const { res, text, ms } = await get(`${SITE}/robots.txt`);
  robotsText = text;
  if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
  if (blocksEveryone(text)) return { ok: false, detail: '`User-agent: *` is blocked from the whole site (Disallow: /)' };
  return { ok: true, detail: `${ms} ms` };
});

const sitemapPath = cfg.sitemap || (/^sitemap:\s*(\S+)/im.exec(robotsText)?.[1] ? new URL(/^sitemap:\s*(\S+)/im.exec(robotsText)[1]).pathname : '/sitemap.xml');
let urls = [];
await check('Crawler files', sitemapPath, async () => {
  const { res, text } = await get(SITE + sitemapPath);
  if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
  const locs = (t) => [...t.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (text.includes('<sitemapindex')) {
    const children = locs(text).slice(0, 25);
    for (const child of children) {
      try { urls.push(...locs((await get(child)).text)); } catch {}
    }
    return { ok: urls.length > 0, detail: `index of ${children.length} sitemaps, ${urls.length} URLs` };
  }
  if (!text.includes('<urlset')) return { ok: false, detail: 'not a urlset or sitemapindex' };
  urls = locs(text);
  return { ok: urls.length > 0, detail: `${urls.length} URLs` };
});

for (const f of cfg.files || []) {
  await check('Crawler files', f.path, async () => {
    const { res, text, ms } = await get(SITE + f.path);
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
    if (f.minLength && text.trim().length < f.minLength) return { ok: false, detail: `only ${text.trim().length} characters` };
    if (f.json) { try { JSON.parse(text); } catch { return { ok: false, detail: 'invalid JSON' }; } }
    return { ok: true, detail: `${ms} ms` };
  });
}

// 2. Every page in the sitemap (same host only, capped).
const pages = [...new Set(urls)].filter((u) => { try { return new URL(u).hostname === HOST; } catch { return false; } });
const skipped = urls.length && pages.length < new Set(urls).size ? new Set(urls).size - pages.length : 0;
if (skipped) record('Pages', 'sitemap hosts', false, `${skipped} sitemap URL(s) point to a different host than ${HOST}`);
const slow = [];
await pool(pages.slice(0, MAX_PAGES), 6, (url) =>
  check('Pages', new URL(url).pathname + new URL(url).search, async () => {
    const { res, text, ms } = await get(url);
    if (ms > SLOW_MS) slow.push(`${new URL(url).pathname} (${ms} ms)`);
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
    if (new URL(res.url).hostname !== HOST) return { ok: false, detail: `redirected off-site to ${res.url}` };
    if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(text)) return { ok: false, detail: 'listed in sitemap but marked noindex' };
    return { ok: true, detail: `${ms} ms` };
  }),
);
if (pages.length > MAX_PAGES) record('Pages', 'page cap', true, `checked ${MAX_PAGES} of ${pages.length} pages`);
record('Performance', `pages slower than ${SLOW_MS} ms`, slow.length <= Math.max(2, pages.length * 0.05), slow.length ? slow.slice(0, 15).join(', ') : `0 of ${Math.min(pages.length, MAX_PAGES)}`);

// 3. Unknown pages must not return 200 (a "soft 404").
await check('Pages', 'unknown URL handling', async () => {
  const { res } = await get(`${SITE}/health-check-missing-page-${Date.now()}`);
  return { ok: NOT_FOUND.includes(res.status), detail: `HTTP ${res.status}` };
});

// 4. Every way of typing the address must land on the canonical origin.
const variants = new Set([`http://${HOST}/`, `https://${APEX}/`, `http://${APEX}/`, `https://www.${APEX}/`, `http://www.${APEX}/`]);
for (const start of variants) {
  if (start === `${SITE}/` || (cfg.skipRedirects || []).includes(start)) continue;
  await check('Redirects', start, async () => {
    const chain = await redirectChain(start);
    if (chain.loop) return { ok: false, detail: `redirect loop: ${chain.hops.join(' -> ')} -> ${chain.final}` };
    if (chain.tooMany) return { ok: false, detail: `too many redirects: ${chain.hops.join(' -> ')}` };
    const landed = new URL(chain.final).origin === new URL(SITE).origin && chain.status === 200;
    return { ok: landed, detail: landed ? `${chain.hops.length - 1} hop(s)` : `ends at ${chain.final} (HTTP ${chain.status})` };
  });
}

// 5. TLS certificates.
for (const host of new Set([HOST, APEX])) {
  await check('TLS', host, async () => {
    const { days, authorized, error } = await certDaysLeft(host);
    if (!authorized) return { ok: false, detail: `certificate not trusted: ${error}` };
    return { ok: days >= CERT_WARN_DAYS, detail: `expires in ${days} days` };
  });
}

// 6. Side-effect-free probes of APIs and forms.
for (const p of cfg.probes || []) {
  await check('API', p.name || p.path, async () => {
    const { res, text, ms } = await get(SITE + p.path, { method: p.method || 'GET', body: p.body, headers: p.contentType ? { 'content-type': p.contentType } : {} });
    if ((p.expect || [200]).includes(res.status)) return { ok: true, detail: `${ms} ms` };
    const hint = p.hints?.[res.status];
    return { ok: false, detail: `HTTP ${res.status}${hint ? `: ${hint}` : `: ${text.slice(0, 120).replace(/\s+/g, ' ')}`}` };
  });
}

// Report.
const failed = results.filter((r) => !r.ok);
const groups = [...new Set(results.map((r) => r.group))];
const lines = [
  `## Site health: ${failed.length ? `${failed.length} problem(s)` : 'all checks passed'}`,
  '',
  `${SITE} checked ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC. ${results.length} checks, ${pages.length} sitemap pages.`,
  '',
];
if (failed.length) {
  lines.push('### Failing', '', '| Area | Check | Detail |', '|---|---|---|');
  for (const r of failed) lines.push(`| ${r.group} | \`${r.name}\` | ${r.detail.replace(/\|/g, '\\|')} |`);
  lines.push('');
}
lines.push('### Summary', '', '| Area | Passed |', '|---|---|');
for (const g of groups) {
  const rs = results.filter((r) => r.group === g);
  lines.push(`| ${g} | ${rs.filter((r) => r.ok).length} / ${rs.length} |`);
}
const report = lines.join('\n') + '\n';

console.log(report);
if (outFile) writeFileSync(outFile, report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
process.exit(failed.length ? 1 : 0);
