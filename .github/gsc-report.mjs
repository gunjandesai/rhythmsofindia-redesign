// Google Search Console opportunities report for the site-doctor agent (docs/agents/site-doctor.md).
//
//   GSC_SERVICE_ACCOUNT_JSON='{...}' node .github/gsc-report.mjs [--days 28]
//
// Env:
//   GSC_SERVICE_ACCOUNT_JSON  service-account key JSON (the account must be added as a user on the property)
//   GSC_SITE                  property, default sc-domain:desaiinfo.net (use https://www.desaiinfo.net/ for a URL-prefix property)
//
// Prints Markdown: top pages, "striking distance" queries (average position 5-40), and pages whose
// click-through rate is low for their position. No dependencies: signs the OAuth JWT with node:crypto.

import { createSign } from 'node:crypto';

const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.log('GSC_SERVICE_ACCOUNT_JSON is not set: skipping Search Console data.');
  process.exit(0);
}
const key = JSON.parse(raw);
const SITE = process.env.GSC_SITE || 'sc-domain:desaiinfo.net';
const dIdx = process.argv.indexOf('--days');
const DAYS = dIdx > -1 ? Number(process.argv[dIdx + 1]) : 28;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token request failed: ${json.error} ${json.error_description || ''}`);
  return json.access_token;
}

const iso = (d) => d.toISOString().slice(0, 10);
const end = new Date(Date.now() - 3 * 86400000); // GSC data lags 2-3 days
const start = new Date(end.getTime() - (DAYS - 1) * 86400000);

const token = await accessToken();
async function query(dimensions, rowLimit = 1000) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions, rowLimit }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Search Analytics query failed: ${json.error?.message || res.status}`);
  return json.rows || [];
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const pos = (n) => n.toFixed(1);
const path = (u) => u.replace(/^https?:\/\/[^/]+/, '') || '/';
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

// Rough expected CTR by position, used only to flag outliers worth a better title/description.
const expectedCtr = (p) => (p <= 1.5 ? 0.25 : p <= 3 ? 0.12 : p <= 5 ? 0.06 : p <= 10 ? 0.025 : 0.01);

const [pages, queryPage] = await Promise.all([query(['page']), query(['query', 'page'], 5000)]);
const totals = pages.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });

const out = [
  `## Search Console: ${SITE}, ${iso(start)} to ${iso(end)}`,
  '',
  `${totals.clicks} clicks, ${totals.impressions} impressions across ${pages.length} pages.`,
  '',
  '### Top pages by impressions',
  '',
  table(['Page', 'Clicks', 'Impr.', 'CTR', 'Avg pos.'], pages.sort((a, b) => b.impressions - a.impressions).slice(0, 25).map((r) => [path(r.keys[0]), r.clicks, r.impressions, pct(r.ctr), pos(r.position)])),
  '',
  '### Striking-distance queries (avg position 5-40, 5+ impressions)',
  '',
  'Best levers: put the exact query in the H2s, summary, FAQ, metaTitle or description of the ranking page, or link to it from related pages.',
  '',
  table(['Query', 'Ranking page', 'Impr.', 'Avg pos.'], queryPage.filter((r) => r.position >= 5 && r.position <= 40 && r.impressions >= 5).sort((a, b) => b.impressions - a.impressions).slice(0, 40).map((r) => [r.keys[0], path(r.keys[1]), r.impressions, pos(r.position)])),
  '',
  '### Low CTR for position (title/description rewrite candidates, 30+ impressions)',
  '',
  table(['Page', 'Impr.', 'CTR', 'Expected', 'Avg pos.'], pages.filter((r) => r.impressions >= 30 && r.ctr < expectedCtr(r.position) / 2).sort((a, b) => b.impressions - a.impressions).slice(0, 15).map((r) => [path(r.keys[0]), r.impressions, pct(r.ctr), pct(expectedCtr(r.position)), pos(r.position)])),
  '',
];
console.log(out.join('\n'));
