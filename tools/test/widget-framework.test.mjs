// Widget framework test suite - API contract + security invariants.
// Zero dependencies, plain `node --test`:
//   node --test tools/test/widget-framework.test.mjs
//
// These tests LOCK THE v1 CONTRACT (envelope keys, routes, headers) and the
// security invariants (no PII, CORS shape, sandbox/origin checks, header
// scoping, no-innerHTML rendering). If a change makes one fail, that change
// is probably breaking embedders - see tools/WIDGET-FRAMEWORK-NOTES.md
// before "fixing" the test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const require = createRequire(import.meta.url);

const { onRequest } = await import(path.join(ROOT, 'functions/v1/[[path]].js'));
const { DATASET } = await import(path.join(ROOT, 'functions/_lib/widget-firms-data.js'));

async function call(pathSegments, url, method = 'GET') {
  const res = await onRequest({ request: new Request(url, { method }), params: { path: pathSegments } });
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers),
    body: res.status === 204 ? null : await res.json(),
  };
}

// ---------------------------------------------------------------------------
// The frozen v1 envelope
// ---------------------------------------------------------------------------

test('v1 envelope: exact top-level keys, frozen', async () => {
  const r = await call(['firms'], 'https://x/v1/firms');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['api_version', 'data', 'dataset_version', 'generated_at', 'ok']);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.api_version, 1);
  assert.match(r.body.dataset_version, /^[0-9a-f]{12}$/);
  assert.ok(!Number.isNaN(Date.parse(r.body.generated_at)));
});

test('v1/firms: data shape { total, firms } and full dataset by default', async () => {
  const r = await call(['firms'], 'https://x/v1/firms');
  assert.deepEqual(Object.keys(r.body.data).sort(), ['firms', 'total']);
  assert.equal(r.body.data.total, DATASET.data.firms.length);
  assert.equal(r.body.data.firms.length, r.body.data.total);
  assert.ok(r.body.data.total >= 25, 'expected 25+ firms (lawyers.html invariant)');
});

test('v1/firms: each firm carries exactly the allowlisted public fields', async () => {
  const allowed = [
    'cities', 'description', 'directory_url', 'enquiry_url', 'languages',
    'languages_text', 'location', 'name', 'rating', 'slug', 'specialties', 'verified',
  ];
  const r = await call(['firms'], 'https://x/v1/firms');
  for (const firm of r.body.data.firms) {
    assert.deepEqual(Object.keys(firm).sort(), allowed, `unexpected fields on ${firm.slug}`);
    assert.ok(firm.directory_url.startsWith('https://expatlawyerspain.com'));
    assert.ok(firm.enquiry_url.startsWith('https://expatlawyerspain.com'));
    // URLs must be real URLs, not HTML-escaped attribute text.
    assert.ok(!firm.enquiry_url.includes('&amp;'), `HTML-escaped ampersand in ${firm.slug} enquiry_url`);
  }
});

test('v1/meta: enums + firm_count, consistent with firms', async () => {
  const r = await call(['meta'], 'https://x/v1/meta');
  assert.deepEqual(Object.keys(r.body.data).sort(), ['cities', 'firm_count', 'languages', 'specialties']);
  assert.equal(r.body.data.firm_count, DATASET.data.firms.length);
  for (const key of ['cities', 'specialties', 'languages']) {
    const xs = r.body.data[key];
    assert.ok(Array.isArray(xs) && xs.length > 0);
    assert.deepEqual(xs, [...new Set(xs)].sort(), `${key} must be sorted + unique`);
  }
});

// ---------------------------------------------------------------------------
// Filters: valid, hostile, unknown - never an error
// ---------------------------------------------------------------------------

test('filters: valid values filter, and every returned firm matches', async () => {
  const r = await call(['firms'], 'https://x/v1/firms?city=barcelona&specialty=property');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.total > 0);
  for (const f of r.body.data.firms) {
    assert.ok(f.cities.includes('barcelona'));
    assert.ok(f.specialties.includes('property'));
  }
});

test('filters: hostile + unknown values are ignored, never an error', async () => {
  const hostile = [
    'city=%3Cscript%3Ealert(1)%3C/script%3E',
    "city=';DROP TABLE firms;--",
    'specialty=__proto__',
    'lang=constructor',
    'city=' + encodeURIComponent('a'.repeat(10000)),
    'unknown_param=whatever',
  ].join('&');
  const r = await call(['firms'], `https://x/v1/firms?${hostile}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, DATASET.data.firms.length, 'hostile filters must be dropped, not applied');
});

test('filters: limit caps results, hostile limit ignored', async () => {
  let r = await call(['firms'], 'https://x/v1/firms?limit=3');
  assert.equal(r.body.data.firms.length, 3);
  assert.equal(r.body.data.total, DATASET.data.firms.length, 'total reports the pre-limit count');
  r = await call(['firms'], 'https://x/v1/firms?limit=999999');
  assert.ok(r.body.data.firms.length <= 100, 'limit hard-capped at 100');
  for (const bad of ['-1', '0', 'abc', '1e9', '3.5']) {
    r = await call(['firms'], `https://x/v1/firms?limit=${bad}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.firms.length, DATASET.data.firms.length, `limit=${bad} must be ignored`);
  }
});

// ---------------------------------------------------------------------------
// Routing + methods
// ---------------------------------------------------------------------------

test('unknown routes 404 with the error envelope', async () => {
  for (const segs of [[], ['nope'], ['firms', 'extra'], ['admin']]) {
    const r = await call(segs, 'https://x/v1/' + segs.join('/'));
    assert.equal(r.status, 404);
    assert.deepEqual(Object.keys(r.body).sort(), ['error', 'ok']);
    assert.equal(r.body.ok, false);
  }
});

test('non-GET is 405 with Allow; OPTIONS preflight is 204', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const r = await call(['firms'], 'https://x/v1/firms', method);
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.allow, 'GET, OPTIONS');
  }
  const r = await call(['firms'], 'https://x/v1/firms', 'OPTIONS');
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], '*');
  assert.equal(r.headers['access-control-allow-methods'], 'GET, OPTIONS');
});

// ---------------------------------------------------------------------------
// Response headers: CORS, cache, hygiene
// ---------------------------------------------------------------------------

test('CORS: open origin, GET-only, and NEVER allow-credentials', async () => {
  for (const segs of [['firms'], ['meta']]) {
    const r = await call(segs, 'https://x/v1/' + segs[0]);
    assert.equal(r.headers['access-control-allow-origin'], '*');
    assert.equal(r.headers['access-control-allow-credentials'], undefined,
      'ACAO * with credentials would be a security hole; must never be set');
  }
});

test('success responses are edge-cacheable; errors are not', async () => {
  const okRes = await call(['firms'], 'https://x/v1/firms');
  assert.match(okRes.headers['cache-control'], /public/);
  assert.match(okRes.headers['cache-control'], /s-maxage=3600/);
  assert.match(okRes.headers['cache-control'], /stale-while-revalidate/);
  const err = await call(['nope'], 'https://x/v1/nope');
  assert.equal(err.headers['cache-control'], 'no-store');
});

test('hygiene headers on every response', async () => {
  for (const segs of [['firms'], ['meta'], ['nope']]) {
    const r = await call(segs, 'https://x/v1/' + segs[0]);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-robots-tag'], 'noindex');
    if (r.status !== 204) assert.match(r.headers['content-type'], /application\/json/);
  }
});

// ---------------------------------------------------------------------------
// THE no-PII invariant (belt-and-braces on top of the generator's own scan)
// ---------------------------------------------------------------------------

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const PHONE_RE = /\+?\d[\d\s().\-]{7,}\d/;

// The scans target the DATA payload; envelope metadata (generated_at is an
// ISO timestamp) would false-positive the phone pattern.
test('no email- or phone-shaped strings in the dataset module', () => {
  const json = JSON.stringify(DATASET.data);
  assert.ok(!EMAIL_RE.test(json), `email-like string in dataset: ${JSON.stringify((json.match(EMAIL_RE) || [])[0])}`);
  assert.ok(!PHONE_RE.test(json), `phone-like string in dataset: ${JSON.stringify((json.match(PHONE_RE) || [])[0])}`);
});

test('no email- or phone-shaped strings in any API response', async () => {
  for (const url of ['https://x/v1/firms', 'https://x/v1/meta', 'https://x/v1/firms?city=barcelona']) {
    const segs = [url.split('/v1/')[1].split('?')[0]];
    const r = await call(segs, url);
    const json = JSON.stringify(r.body.data);
    assert.ok(!EMAIL_RE.test(json), `email-like string in ${url}`);
    assert.ok(!PHONE_RE.test(json), `phone-like string in ${url}`);
  }
});

// ---------------------------------------------------------------------------
// Shared parser (the money pages and the widget dataset must never drift)
// ---------------------------------------------------------------------------

test('shared parser: 25+ firms, all required fields, desc additive', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { parseFirms } = require(path.join(ROOT, 'tools/lib/parse-firms.js'));
  const firms = parseFirms({ root: ROOT });
  assert.ok(firms.length >= 25);
  for (const f of firms) {
    for (const field of ['html', 'name', 'location', 'cities', 'specialties', 'langs', 'langsText', 'desc', 'enquiry']) {
      assert.ok(f[field] != null && String(f[field]).length > 0, `firm ${f.name}: missing ${field}`);
    }
  }
});

test('generated dataset is current (no drift vs lawyers.html)', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync('node', [path.join(ROOT, 'tools/build-widget-data.js'), '--check'], { stdio: 'pipe' });
});

// ---------------------------------------------------------------------------
// Loader: pure helpers + the postMessage origin/source security check
// ---------------------------------------------------------------------------

// Minimal fake-DOM harness: just enough of the API surface embed/v1.js uses.
function fakeElement(tag) {
  const el = {
    tagName: tag,
    style: {},
    attributes: {},
    children: [],
    firstChild: null,
    textContent: '',
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    appendChild(c) { this.children.push(c); this.firstChild = this.children[0]; return c; },
    removeChild(c) {
      this.children = this.children.filter((x) => x !== c);
      this.firstChild = this.children[0] || null;
      return c;
    },
  };
  if (tag === 'iframe') el.contentWindow = { fake: 'contentWindow:' + Math.random() };
  return el;
}

function loadLoader({ containers = [], scriptSrc = 'https://expatlawyerspain.com/embed/v1.js' } = {}) {
  const listeners = {};
  const fakeWindow = {
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const fakeDocument = {
    readyState: 'complete',
    currentScript: { src: scriptSrc },
    createElement: fakeElement,
    querySelectorAll(sel) {
      if (sel === '.els-widget[data-els-widget]') return containers;
      return [];
    },
    addEventListener(type, fn) { (listeners['doc:' + type] = listeners['doc:' + type] || []).push(fn); },
  };
  const src = read('embed/v1.js');
  const ctx = { window: fakeWindow, document: fakeDocument };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { window: fakeWindow, document: fakeDocument, listeners };
}

test('loader: pure helpers behave (config parsing, URL building, validation)', () => {
  const { window: w } = loadLoader();
  const t = w.ELSWidget.__test;

  const el = fakeElement('div');
  el.setAttribute('data-els-widget', 'firm-directory');
  el.setAttribute('data-city', 'barcelona');
  el.setAttribute('data-partner', 'a&b partner');
  const cfg = t.readConfig(el);
  assert.equal(cfg.widget, 'firm-directory');
  assert.match(cfg.query, /city=barcelona/);
  assert.match(cfg.query, /partner=a%26b%20partner/, 'attribute values must be URL-encoded');
  assert.equal(
    t.frameSrc('https://expatlawyerspain.com', cfg),
    'https://expatlawyerspain.com/widgets/v1/firm-directory?' + cfg.query
  );

  // Hostile widget names are rejected outright (path injection).
  for (const bad of ['../admin', 'Firm Directory', 'x/y', '', 'a'.repeat(65)]) {
    const e = fakeElement('div');
    e.setAttribute('data-els-widget', bad);
    assert.equal(t.readConfig(e), null, `widget name ${JSON.stringify(bad)} must be rejected`);
  }

  // Message validation: protocol-versioned objects only.
  assert.equal(t.validMessage({ els: 1, type: 'els:resize' }), true);
  assert.equal(t.validMessage({ els: 2, type: 'els:resize' }), false);
  assert.equal(t.validMessage({ type: 'els:resize' }), false);
  assert.equal(t.validMessage('els:resize'), false);
  assert.equal(t.validMessage(null), false);

  // Height clamping.
  assert.equal(t.clampHeight(500), 500);
  assert.equal(t.clampHeight(5), 100);
  assert.equal(t.clampHeight(999999), 4000);
  assert.equal(t.clampHeight('NaN'), null);
  assert.equal(t.clampHeight(Infinity), null);
});

test('loader: origin is derived from the script src (works on previews/local)', () => {
  const { window: w } = loadLoader({ scriptSrc: 'http://localhost:8788/embed/v1.js' });
  const t = w.ELSWidget.__test;
  assert.equal(t.scriptOrigin({ currentScript: { src: 'http://localhost:8788/embed/v1.js' } }), 'http://localhost:8788');
  assert.equal(t.scriptOrigin({ currentScript: null, querySelectorAll: () => [] }), 'https://expatlawyerspain.com');
});

test('loader mounts: sandbox without allow-same-origin, attribution link in host DOM', () => {
  const container = fakeElement('div');
  container.setAttribute('data-els-widget', 'firm-directory');
  container.setAttribute('data-city', 'barcelona');
  const fallback = fakeElement('a');
  container.appendChild(fallback);

  loadLoader({ containers: [container] });

  assert.equal(container.getAttribute('data-els-mounted'), '1');
  const iframe = container.children.find((c) => c.tagName === 'iframe');
  assert.ok(iframe, 'iframe mounted');
  assert.equal(iframe.attributes.sandbox, 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms');
  // allow-forms is required so form-submission widgets (the ITP calculator) fire
  // their submit handler when embedded; additive and safe.
  assert.ok(iframe.attributes.sandbox.includes('allow-forms'), 'sandbox must include allow-forms');
  assert.ok(!iframe.attributes.sandbox.includes('allow-same-origin'), 'sandbox must NOT include allow-same-origin');
  assert.match(iframe.attributes.src, /^https:\/\/expatlawyerspain\.com\/widgets\/v1\/firm-directory\?city=barcelona$/);
  const attribution = container.children.find((c) => c.tagName === 'p');
  assert.ok(attribution, 'attribution stays in the host DOM');
  const link = attribution.children[0];
  assert.equal(link.attributes.href, 'https://expatlawyerspain.com');
  assert.equal(link.attributes.rel, 'noopener');
});

test('loader message handling: wrong origin and wrong source are BOTH rejected', () => {
  const container = fakeElement('div');
  container.setAttribute('data-els-widget', 'firm-directory');
  const { window: w, listeners } = loadLoader({ containers: [container] });
  const iframe = container.children.find((c) => c.tagName === 'iframe');
  const onMessage = listeners.message[0];
  const startHeight = iframe.style.height;
  const resize = (h) => ({ els: 1, type: 'els:resize', height: h });

  // The acceptance rule: opaque sandbox origin ("null") or the widget origin.
  const t = w.ELSWidget.__test;
  assert.equal(t.acceptableOrigin('null'), true, 'sandboxed frames post with origin "null"');
  assert.equal(t.acceptableOrigin('https://expatlawyerspain.com'), true);
  assert.equal(t.acceptableOrigin('https://evil.example'), false);
  assert.equal(t.acceptableOrigin(''), false);

  // Acceptable origin, WRONG source (an attacker window cannot resize a
  // widget it does not own; source binding is the authenticating check).
  onMessage({ origin: 'null', source: { fake: 'other' }, data: resize(1234) });
  assert.equal(iframe.style.height, startHeight, 'wrong source must be ignored');

  // Wrong origin, right source shape.
  onMessage({ origin: 'https://evil.example', source: iframe.contentWindow, data: resize(1234) });
  assert.equal(iframe.style.height, startHeight, 'wrong origin must be ignored');

  // Unversioned / malformed payloads.
  onMessage({ origin: 'null', source: iframe.contentWindow, data: 'resize:1234' });
  onMessage({ origin: 'null', source: iframe.contentWindow, data: { type: 'els:resize', height: 1234 } });
  assert.equal(iframe.style.height, startHeight, 'malformed messages must be ignored');

  // The genuine article works (opaque origin + bound source), clamped.
  onMessage({ origin: 'null', source: iframe.contentWindow, data: resize(1234) });
  assert.equal(iframe.style.height, '1234px');
  onMessage({ origin: 'null', source: iframe.contentWindow, data: resize(999999) });
  assert.equal(iframe.style.height, '4000px', 'heights are clamped');
  // Same-origin messages also accepted (future unsandboxed widget frames).
  onMessage({ origin: 'https://expatlawyerspain.com', source: iframe.contentWindow, data: resize(500) });
  assert.equal(iframe.style.height, '500px');
});

test('loader is idempotent: double-boot and rescan never double-mount', () => {
  const container = fakeElement('div');
  container.setAttribute('data-els-widget', 'firm-directory');
  const { window: w } = loadLoader({ containers: [container] });
  w.ELSWidget.rescan();
  w.ELSWidget.rescan();
  const iframes = container.children.filter((c) => c.tagName === 'iframe');
  assert.equal(iframes.length, 1, 'exactly one iframe after repeated scans');
});

// ---------------------------------------------------------------------------
// _headers scoping: only /widgets/* is embeddable; the rest of the site
// keeps DENY. (Parses the _headers file's rule blocks.)
// ---------------------------------------------------------------------------

function headerBlocks() {
  const text = read('_headers');
  const blocks = {};
  let current = null;
  for (const line of text.split('\n')) {
    if (/^\S/.test(line) && !line.startsWith('#')) {
      current = line.trim();
      blocks[current] = [];
    } else if (current && /^\s+\S/.test(line)) {
      blocks[current].push(line.trim());
    }
  }
  return blocks;
}

test('_headers: global DENY intact; /widgets/* detaches it and adds a strict CSP', () => {
  const blocks = headerBlocks();

  assert.ok(blocks['/*'].includes('X-Frame-Options: DENY'), 'global X-Frame-Options: DENY must stay');

  const w = blocks['/widgets/*'];
  assert.ok(w, '/widgets/* block must exist');
  assert.ok(w.includes('! X-Frame-Options'), '/widgets/* must detach X-Frame-Options');
  const csp = w.find((l) => l.startsWith('Content-Security-Policy:'));
  assert.ok(csp, '/widgets/* must carry an ENFORCED CSP');
  assert.match(csp, /frame-ancestors \*/);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  // The widget frame loads the self-hosted brand fonts from /fonts/; without an
  // explicit font-src, default-src 'none' would block them.
  assert.match(csp, /font-src 'self'/, 'widget CSP must allow first-party fonts');
  assert.ok(!csp.includes('unsafe-inline'), 'widget CSP must not allow inline script/style');
  assert.ok(w.some((l) => l.startsWith('X-Robots-Tag: noindex')), '/widgets/* must be noindexed');

  // Widget assets are unversioned, so they must always revalidate or a deploy
  // gets stuck behind a stale edge/browser cache. Origin-authoritative, no
  // version stamp to forget.
  const widgetCache = w.find((l) => l.startsWith('Cache-Control:'));
  assert.ok(widgetCache, '/widgets/* must set Cache-Control');
  assert.match(widgetCache, /max-age=0/, '/widgets/* Cache-Control must be max-age=0');
  assert.match(widgetCache, /must-revalidate/, '/widgets/* Cache-Control must require revalidation');

  assert.ok(blocks['/embed/*'], '/embed/* cache block must exist');
  assert.ok(blocks['/embed/*'].some((l) => l.startsWith('Cache-Control:')));

  // ORDER IS LOAD-BEARING: "!" only detaches headers attached by an EARLIER
  // rule, so /widgets/* must come after /*. Verified live on wrangler pages
  // dev (2026-07-06): with /widgets/* first, X-Frame-Options: DENY leaked
  // through and embedding was silently impossible.
  const text = read('_headers');
  assert.ok(text.indexOf('\n/*') < text.indexOf('/widgets/*'), '/widgets/* must come AFTER /* in _headers');
});

// ---------------------------------------------------------------------------
// Widget frame files: static security review (no inline handlers, no
// innerHTML-family rendering, CSP-compatible)
// ---------------------------------------------------------------------------

test('widget frame HTML: no inline script/style/handlers, noindexed', () => {
  const html = read('widgets/v1/firm-directory.html');
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'no inline <script> blocks');
  assert.ok(!/<style[\s>]/i.test(html), 'no inline <style> blocks');
  assert.ok(!/\son\w+\s*=/i.test(html), 'no inline event handlers');
  assert.ok(!/style\s*=\s*"/i.test(html), 'no style= attributes (CSP style-src self)');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!/https?:\/\/(?!expatlawyerspain\.com)/.test(html.replace(/<!--[\s\S]*?-->/g, '')),
    'no third-party URLs in the frame HTML');
});

// Comments may (should) WARN about the forbidden sinks, so strip them before
// scanning; the ban applies to code.
function stripComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('widget frame JS: textContent-only rendering, no dangerous sinks', () => {
  const js = stripComments(read('widgets/v1/firm-directory.js'));
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.ok(!js.includes(sink), `forbidden sink in firm-directory.js: ${sink}`);
  }
  assert.ok(js.includes('textContent'), 'rendering must use textContent');
  assert.ok(js.includes("els: 1"), 'postMessage payloads must carry the protocol version');
});

test('loader JS: no dangerous sinks either', () => {
  const js = stripComments(read('embed/v1.js'));
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(']) {
    assert.ok(!js.includes(sink), `forbidden sink in embed/v1.js: ${sink}`);
  }
});

// ---------------------------------------------------------------------------
// itp-calculator widget: static security review + data-parity + engine
// contract. Same rules as firm-directory above, plus the parity guarantee
// that the widget's data module is byte-identical to what the live
// itp-calculator-spain.html page embeds (they must never drift).
// ---------------------------------------------------------------------------

test('itp-calculator frame HTML: no inline script/style/handlers, noindexed', () => {
  const html = read('widgets/v1/itp-calculator.html');
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'no inline <script> blocks');
  assert.ok(!/<style[\s>]/i.test(html), 'no inline <style> blocks');
  assert.ok(!/\son\w+\s*=/i.test(html), 'no inline event handlers');
  assert.ok(!/style\s*=\s*"/i.test(html), 'no style= attributes (CSP style-src self)');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!/https?:\/\/(?!expatlawyerspain\.com)/.test(html.replace(/<!--[\s\S]*?-->/g, '')),
    'no third-party URLs in the frame HTML');
});

test('itp-calculator frame HTML: functional H1, no in-frame attribution (loader supplies it)', () => {
  const html = read('widgets/v1/itp-calculator.html');
  // The header logo/wordmark was replaced by a functional title.
  assert.match(html, /<h1 class="itp-title">/, 'functional H1 present');
  assert.ok(!/els-header/.test(html), 'no ELS logo header');
  // The frame carries NO attribution/footer link of its own: the single, crawlable
  // "Powered by ExpatLawyerSpain" backlink is injected by the loader into the host
  // page's DOM. A link inside this noindex sandboxed frame would not be crawlable,
  // so it is not repeated here (and would otherwise duplicate on every embed).
  assert.ok(!/els-footer-link/.test(html), 'no in-frame directory link');
  assert.ok(!/els-powered-link/.test(html), 'no in-frame Powered by link');
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/Powered by/i.test(markup), 'no visible "Powered by" text in the frame');
  assert.ok(!/Free directory/i.test(markup), 'no in-frame directory line');
});

test('itp-calculator frame JS: textContent-only rendering, no dangerous sinks', () => {
  const js = stripComments(read('widgets/v1/itp-calculator.js'));
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.ok(!js.includes(sink), `forbidden sink in itp-calculator.js: ${sink}`);
  }
  assert.ok(js.includes('textContent'), 'rendering must use textContent');
  assert.ok(js.includes('els: 1'), 'postMessage payloads must carry the protocol version');
  // Resize fix: the load-time re-post and the body observer must both be present.
  assert.ok(/addEventListener\(\s*'load'\s*,\s*postResize/.test(js), 're-posts els:resize on window load');
  assert.ok(js.includes('ResizeObserver'), 'observes body height for reflow');
  // Web-font reflow: the frame now loads Fraunces + Libre Franklin, so it must
  // re-post its height once the faces settle (font-display: swap reflows late).
  assert.ok(js.includes('document.fonts.ready'), 're-posts height once web fonts settle');
});

test('itp-calculator widget CSS: brand fonts self-hosted first-party, no third-party fetches', () => {
  const css = read('widgets/v1/widget.css') + '\n' + read('widgets/v1/itp-calculator.css');
  // The brand faces are declared and pulled ONLY from first-party /fonts/.
  assert.match(css, /@font-face/, 'brand @font-face declared');
  assert.match(css, /url\(\s*['"]?\/fonts\/[^)'"]*\.woff2/, 'fonts served first-party from /fonts/');
  // No third-party stylesheet/font fetch. url() must never point at an http(s)
  // origin; data: URIs are fine (the xmlns inside an SVG data URI is not a fetch
  // and never sits directly after "url(").
  assert.ok(!/url\(\s*['"]?https?:/i.test(css), 'no third-party url() in widget CSS');
  assert.ok(!/@import/.test(css), 'no @import in widget CSS');
});

// ---------------------------------------------------------------------------
// Partner-facing single-widget demo page (embed-itp.html). Additive: it shows
// ONLY the ITP calculator as a partner would embed it. Must stay noindexed,
// first-party, and use the frozen loader.
// ---------------------------------------------------------------------------

test('embed-itp demo page: noindex, ITP-only, first-party, frozen loader', () => {
  const html = read('embed-itp.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/, 'demo page noindexed');
  // The live embed is present and is the ITP calculator.
  assert.match(html, /<div class="els-widget" data-els-widget="itp-calculator"/, 'live ITP embed present');
  // Every widget reference on the page (live embed + the snippet shown) is the
  // ITP calculator: no firm-directory, no second widget.
  const widgets = html.match(/data-els-widget="[^"]*"/g) || [];
  assert.ok(widgets.length >= 1, 'has at least the ITP widget reference');
  assert.ok(widgets.every((w) => w === 'data-els-widget="itp-calculator"'),
    'every widget reference is the ITP calculator (no firm-directory)');
  // Uses the frozen loader, and nothing third-party (ignoring comments).
  assert.match(html, /src="\/embed\/v1\.js"/, 'loads the frozen /embed/v1.js loader');
  assert.ok(!/https?:\/\/(?!expatlawyerspain\.com)/.test(html.replace(/<!--[\s\S]*?-->/g, '')),
    'no third-party URLs on the demo page');
});

test('itp-calculator data module: verified-only, no drafts, no draftPreview', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read('widgets/v1/itp-calculator-data.js'), sandbox);
  const data = sandbox.window.ELS_LEGAL_DATA_ITP;

  assert.ok(data && typeof data === 'object', 'ELS_LEGAL_DATA_ITP must be an object');
  assert.ok(Array.isArray(data.figures), 'figures must be an array');
  assert.ok(Array.isArray(data.reliefs), 'reliefs must be an array');
  assert.ok(data.regions && typeof data.regions === 'object', 'regions must be an object');
  assert.ok(data.figures.length > 0, 'figures must not be empty');
  assert.ok(data.reliefs.length > 0, 'reliefs must not be empty');

  for (const f of data.figures) {
    assert.equal(f.status, 'verified', `figure ${f.id} has status ${JSON.stringify(f.status)}, expected 'verified'`);
  }
  for (const r of data.reliefs) {
    assert.equal(r.status, 'verified', `relief ${r.id} has status ${JSON.stringify(r.status)}, expected 'verified'`);
  }
  assert.ok(!('draftPreview' in data), 'production data module must not carry draftPreview');

  const copy = sandbox.window.ELS_ITP_COPY;
  assert.ok(copy && typeof copy === 'object', 'ELS_ITP_COPY must be an object');
  assert.ok(Object.keys(copy).length > 0, 'ELS_ITP_COPY must have at least one key');
});

test('itp-calculator data module is byte-identical to the live ITP page payload', () => {
  const page = read('itp-calculator-spain.html');
  const pageDataMatch = page.match(/window\.ELS_LEGAL_DATA_ITP = ([\s\S]*?);<\/script>/);
  const pageCopyMatch = page.match(/window\.ELS_ITP_COPY = ([\s\S]*?);<\/script>/);
  assert.ok(pageDataMatch, 'could not find window.ELS_LEGAL_DATA_ITP assignment in itp-calculator-spain.html');
  assert.ok(pageCopyMatch, 'could not find window.ELS_ITP_COPY assignment in itp-calculator-spain.html');

  const mod = read('widgets/v1/itp-calculator-data.js');
  const modDataMatch = mod.match(/window\.ELS_LEGAL_DATA_ITP = ([\s\S]*?);\nwindow\.ELS_ITP_COPY/);
  const modCopyMatch = mod.match(/window\.ELS_ITP_COPY = ([\s\S]*?);\n?$/);
  assert.ok(modDataMatch, 'could not find window.ELS_LEGAL_DATA_ITP assignment in widgets/v1/itp-calculator-data.js');
  assert.ok(modCopyMatch, 'could not find window.ELS_ITP_COPY assignment in widgets/v1/itp-calculator-data.js');

  assert.equal(modDataMatch[1], pageDataMatch[1], 'widget data module has drifted from the live ITP page payload');
  assert.equal(modCopyMatch[1], pageCopyMatch[1], 'widget copy has drifted from the live ITP page payload');
});

test('itp-calculator engine parity: the widget data drives the engine correctly', () => {
  const engine = require(path.join(ROOT, 'js/calc-engine.js'));
  const sandbox = { window: {} };
  vm.runInNewContext(read('widgets/v1/itp-calculator-data.js'), sandbox);
  const data = sandbox.window.ELS_LEGAL_DATA_ITP;

  const region = data.regions.catalunya ? 'catalunya' : Object.keys(data.regions)[0];

  const std = engine.calculateITP(data, { region, price: 350000, propertyType: 'resale' });
  assert.equal(std.ok, true);
  assert.ok(std.total > 0, 'standard total must be positive');
  assert.ok(std.total < 350000 * 0.2, 'standard total should sanity-check under 20% of price');
  assert.ok(std.effectiveRate > 0, 'effective rate must be positive');
  assert.ok(Array.isArray(std.lines) && std.lines.length >= 1, 'must show at least one working line');
  assert.ok(std.figuresUsed.length >= 1, 'must cite at least one figure used');

  const pers = engine.calculatePersonalisedITP(data, {
    region, price: 350000, propertyType: 'resale', island: null, buyer: {},
  });
  assert.equal(pers.ok, true);
  assert.equal(pers.standard.total, std.total, 'personalised standard calc must match the plain calc');

  // A holiday-home buyer (mainHome: false) never gets an auto-granted relief.
  const holiday = engine.calculatePersonalisedITP(data, {
    region, price: 350000, propertyType: 'resale', island: null, buyer: { mainHome: false },
  });
  assert.ok(['reliefs-unavailable', 'standard-only'].includes(holiday.reliefStatus),
    `holiday-home buyer got unexpected reliefStatus ${JSON.stringify(holiday.reliefStatus)}`);
});
