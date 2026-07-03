// Admin read/export layer for the lead-capture system (Cloudflare Pages Function).
//
// Catch-all under /api/admin. Serves a self-contained HTML console (no data in the
// shell) plus two authenticated data endpoints (JSON + CSV). Read-only: this file
// never writes to D1. No secrets or PII live in this file.
//
// Routes:
//   GET /api/admin[/]        -> HTML console (no auth; contains zero lead data)
//   GET /api/admin/leads.json -> auth; filtered lead list as JSON
//   GET /api/admin/leads.csv  -> auth; same filters, CSV download
//   anything else            -> 404;  non-GET -> 405
//
// Auth: Authorization: Bearer <token>, compared constant-time to env.ADMIN_TOKEN.
// If ADMIN_TOKEN is unset we fail closed (503). The token lives only in the
// operator's browser localStorage and is never placed in a URL.

import { tokensMatch, adminHeaders, escapeHtml } from '../../_lib/util.js';

// Allowed enum values — user-supplied filters are validated against these and any
// unknown value is silently dropped, so only these strings ever reach the SQL.
const ENVIRONMENTS = ['production', 'preview', 'backfill'];
const FLAGS = ['none', 'duplicate', 'suspected_spam', 'not_relevant'];
const STATUSES = [
  'new', 'routed', 'firm_responded', 'consultation_booked',
  'closed_won', 'closed_no_response', 'closed_other',
];
// Preview rows are excluded unless explicitly requested (hard product requirement).
const DEFAULT_ENVIRONMENTS = ['production', 'backfill'];
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
  }

  // params.path is undefined for /api/admin, else an array of path segments.
  const segments = Array.isArray(params.path) ? params.path : [];

  if (segments.length === 0) {
    return new Response(PAGE_HTML, {
      status: 200,
      headers: adminHeaders({ 'Content-Type': 'text/html; charset=utf-8' }),
    });
  }

  if (segments.length === 1 && segments[0] === 'leads.json') {
    return withAuth(request, env, () => leadsJson(request, env));
  }
  if (segments.length === 1 && segments[0] === 'leads.csv') {
    return withAuth(request, env, () => leadsCsv(request, env));
  }

  return json({ error: 'not found' }, 404);
}

// --- Auth ------------------------------------------------------------------

async function withAuth(request, env, handler) {
  if (!env.ADMIN_TOKEN) return json({ error: 'admin disabled' }, 503);
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!(await tokensMatch(token, env.ADMIN_TOKEN))) {
    return json({ error: 'unauthorized' }, 401);
  }
  return handler();
}

// --- Filters (shared by JSON + CSV) ----------------------------------------

// Parse a comma list, keep only values present in `allowed`.
function parseEnum(param, allowed) {
  if (param == null) return null;
  const picked = param.split(',').map(s => s.trim()).filter(v => allowed.includes(v));
  return picked.length ? picked : null;
}

// Build a parameterised WHERE clause. Only `?` placeholders touch user input;
// column names and IN-list widths come from validated enums, never raw strings.
function buildQuery(url) {
  const envs = parseEnum(url.searchParams.get('environment'), ENVIRONMENTS) || DEFAULT_ENVIRONMENTS;
  const flags = parseEnum(url.searchParams.get('flag'), FLAGS);
  const statuses = parseEnum(url.searchParams.get('status'), STATUSES);

  let limit = parseInt(url.searchParams.get('limit') || '', 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const clauses = [];
  const binds = [];
  const addIn = (col, values) => {
    clauses.push(`l.${col} IN (${values.map(() => '?').join(', ')})`);
    binds.push(...values);
  };
  addIn('environment', envs);
  if (flags) addIn('flag', flags);
  if (statuses) addIn('status', statuses);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `
    SELECT l.id, l.submitted_at, l.environment, l.name, l.email, l.specialty,
           l.region, l.named_firm, f.name AS assigned_firm_name, l.heard_about_us,
           l.message, l.flag, l.flag_reason, l.status, l.routed_at,
           l.firm_first_response_at, l.escalated, l.closed_at, l.notes,
           l.source, l.page_url, l.anonymised_at
    FROM leads l
    LEFT JOIN firms f ON f.id = l.assigned_firm_id
    ${where}
    ORDER BY l.submitted_at DESC
    LIMIT ?`;
  binds.push(limit);
  return { sql, binds };
}

// --- JSON endpoint ---------------------------------------------------------

async function leadsJson(request, env) {
  const { sql, binds } = buildQuery(new URL(request.url));
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const leads = results || [];
  return json({ leads, count: leads.length }, 200);
}

// --- CSV endpoint ----------------------------------------------------------

// Column order mirrors the manual tracker xlsx, then appends extras.
const CSV_COLUMNS = [
  ['Date', r => (r.submitted_at || '').slice(0, 10)],
  ['Name', r => r.name],
  ['Email', r => r.email],
  ['City / Region', r => r.region],
  ['Specialty', r => r.specialty],
  ['Enquiry', r => r.message],
  ['Firm sent to', r => r.assigned_firm_name],
  ['Firm responded?', r => (r.firm_first_response_at ? 'Yes' : r.routed_at ? 'Awaiting' : '-')],
  ['Status', r => r.status],
  ['Flag', r => r.flag],
  ['Notes', r => r.notes],
  ['Id', r => r.id],
  ['Environment', r => r.environment],
  ['Source', r => r.source],
  ['Heard about us', r => r.heard_about_us],
  ['Named firm', r => r.named_firm],
  ['Page URL', r => r.page_url],
];

// CSV-quote a cell and guard against spreadsheet formula injection.
function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise leading formula triggers
  return `"${s.replaceAll('"', '""')}"`;
}

async function leadsCsv(request, env) {
  const { sql, binds } = buildQuery(new URL(request.url));
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const rows = results || [];
  const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map(([, fn]) => csvCell(fn(r))).join(','));
  }
  return new Response(lines.join('\r\n'), {
    status: 200,
    headers: adminHeaders({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="els-leads.csv"',
    }),
  });
}

// --- Helpers ---------------------------------------------------------------

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: adminHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...extra }),
  });
}

// --- The console page ------------------------------------------------------
// Self-contained: inline CSS + JS, no external resources. The shell carries no
// lead data; everything is fetched client-side with the Bearer token. Rendering
// is textContent/setAttribute only — no data ever becomes HTML markup.

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ELS Leads — Admin</title>
<style>
  :root{
    --navy:#133356; --terracotta:#C94F1A; --cream:#FAF5ED; --sand:#F0E6DB;
    --border:#E2DCD2; --ink:#190F0C; --clay:#705F57; --green:#386D50;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--cream);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:14px;line-height:1.4}
  header{background:var(--navy);color:#fff;padding:14px 20px;display:flex;
    align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
  header h1{margin:0;font-size:17px;font-weight:600}
  header h1 span{color:var(--sand);font-weight:400}
  .btn{background:var(--terracotta);color:#fff;border:none;border-radius:6px;
    padding:8px 14px;font-size:13px;cursor:pointer;font-weight:600}
  .btn:hover{filter:brightness(1.06)}
  .btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff}
  .btn.subtle{background:var(--sand);color:var(--navy)}
  main{padding:20px;max-width:1400px;margin:0 auto}
  .card{background:#fff;border:1px solid var(--border);border-radius:10px;
    padding:24px;max-width:420px;margin:60px auto}
  .card h2{margin:0 0 6px;font-size:16px;color:var(--navy)}
  .card p{margin:0 0 16px;color:var(--clay);font-size:13px}
  .card input{width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;
    font-size:14px;margin-bottom:12px}
  .card .btn{width:100%}
  .toolbar{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px}
  .toolbar label{display:flex;flex-direction:column;font-size:12px;color:var(--clay);gap:4px}
  .toolbar select{padding:7px 8px;border:1px solid var(--border);border-radius:6px;
    background:#fff;font-size:13px;min-width:150px}
  .count{margin-left:auto;color:var(--clay);font-size:13px;align-self:center}
  .table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--border);border-radius:10px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  th{background:var(--sand);color:var(--navy);font-weight:600;position:sticky;top:0;white-space:nowrap}
  td{max-width:280px}
  tr:last-child td{border-bottom:none}
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;
    font-weight:600;white-space:nowrap}
  .chip-none{background:var(--sand);color:var(--clay)}
  .chip-duplicate{background:#EDE3F5;color:#5A3E7A}
  .chip-suspected_spam{background:#FBE4DC;color:var(--terracotta)}
  .chip-not_relevant{background:#EDEDED;color:#555}
  .chip-new{background:#DCEAF5;color:var(--navy)}
  .chip-routed{background:#E4EEDD;color:var(--green)}
  .chip-firm_responded{background:#E4EEDD;color:var(--green)}
  .chip-consultation_booked{background:#D7EDE0;color:var(--green)}
  .chip-closed_won{background:var(--green);color:#fff}
  .chip-closed_no_response{background:#F3E2DC;color:var(--terracotta)}
  .chip-closed_other{background:#EDEDED;color:#555}
  .chip-default{background:var(--sand);color:var(--clay)}
  .state{padding:40px;text-align:center;color:var(--clay)}
  .state.error{color:var(--terracotta)}
  .hidden{display:none}
</style>
</head>
<body>
<header>
  <h1>ELS Leads <span>— Admin</span></h1>
  <button id="signout" class="btn ghost hidden">Sign out</button>
</header>
<main>
  <section id="auth-card" class="card hidden">
    <h2>Admin token</h2>
    <p id="auth-note">Stored only in this browser.</p>
    <input id="token-input" type="password" autocomplete="off" placeholder="Paste admin token">
    <button id="token-save" class="btn">Save &amp; load</button>
  </section>

  <section id="console" class="hidden">
    <div class="toolbar">
      <label>Environment
        <select id="f-env">
          <option value="production,backfill" selected>Real leads (production + backfill)</option>
          <option value="preview">Preview/test only</option>
          <option value="production,preview,backfill">All</option>
        </select>
      </label>
      <label>Flag
        <select id="f-flag">
          <option value="">All</option>
          <option value="none">none</option>
          <option value="duplicate">duplicate</option>
          <option value="suspected_spam">suspected_spam</option>
          <option value="not_relevant">not_relevant</option>
        </select>
      </label>
      <label>Status
        <select id="f-status">
          <option value="">All</option>
          <option value="new">new</option>
          <option value="routed">routed</option>
          <option value="firm_responded">firm_responded</option>
          <option value="consultation_booked">consultation_booked</option>
          <option value="closed_won">closed_won</option>
          <option value="closed_no_response">closed_no_response</option>
          <option value="closed_other">closed_other</option>
        </select>
      </label>
      <button id="refresh" class="btn subtle">Refresh</button>
      <button id="download" class="btn subtle">Download CSV</button>
      <span id="count" class="count"></span>
    </div>
    <div id="state" class="state">Loading…</div>
    <div id="table-wrap" class="table-wrap hidden">
      <table>
        <thead><tr id="head-row"></tr></thead>
        <tbody id="body"></tbody>
      </table>
    </div>
  </section>
</main>
<script>
(function () {
  'use strict';
  var TOKEN_KEY = 'els_admin_token';
  var COLUMNS = ['Date','Name','Email','Region','Specialty','Firm sent to','Flag','Status','Message','Notes'];
  var FLAG_CLASSES = { none:'chip-none', duplicate:'chip-duplicate',
    suspected_spam:'chip-suspected_spam', not_relevant:'chip-not_relevant' };
  var STATUS_CLASSES = { new:'chip-new', routed:'chip-routed', firm_responded:'chip-firm_responded',
    consultation_booked:'chip-consultation_booked', closed_won:'chip-closed_won',
    closed_no_response:'chip-closed_no_response', closed_other:'chip-closed_other' };

  var el = function (id) { return document.getElementById(id); };
  var token = null;

  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function showAuth(note) {
    token = null;
    el('auth-note').textContent = note || 'Stored only in this browser.';
    el('token-input').value = '';
    el('auth-card').classList.remove('hidden');
    el('console').classList.add('hidden');
    el('signout').classList.add('hidden');
  }
  function showConsole() {
    el('auth-card').classList.add('hidden');
    el('console').classList.remove('hidden');
    el('signout').classList.remove('hidden');
  }

  function initAuth() {
    el('token-save').addEventListener('click', function () {
      var v = el('token-input').value.trim();
      if (!v) return;
      token = v; setToken(v); showConsole(); loadLeads();
    });
    el('signout').addEventListener('click', function () { clearToken(); showAuth(); });
    el('refresh').addEventListener('click', loadLeads);
    el('download').addEventListener('click', downloadCsv);
    el('f-env').addEventListener('change', loadLeads);
    el('f-flag').addEventListener('change', loadLeads);
    el('f-status').addEventListener('change', loadLeads);

    token = getToken();
    if (token) { showConsole(); loadLeads(); } else { showAuth(); }
  }

  // Build query string from the current filter selections.
  function applyFilters() {
    var p = new URLSearchParams();
    p.set('environment', el('f-env').value);
    if (el('f-flag').value) p.set('flag', el('f-flag').value);
    if (el('f-status').value) p.set('status', el('f-status').value);
    return p.toString();
  }

  function setState(msg, isError) {
    var s = el('state');
    s.textContent = msg;
    s.className = 'state' + (isError ? ' error' : '');
    s.classList.remove('hidden');
    el('table-wrap').classList.add('hidden');
  }

  function loadLeads() {
    if (!token) { showAuth(); return; }
    setState('Loading…', false);
    el('count').textContent = '';
    fetch('/api/admin/leads.json?' + applyFilters(), {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function (res) {
      if (res.status === 401) { clearToken(); showAuth('That token was wrong or has been rotated. Enter the current one.'); return null; }
      if (!res.ok) throw new Error('Request failed (' + res.status + ')');
      return res.json();
    }).then(function (data) {
      if (!data) return;
      renderTable(data.leads || []);
      el('count').textContent = (data.count || 0) + ' lead' + (data.count === 1 ? '' : 's');
    }).catch(function (err) {
      setState('Could not load leads: ' + err.message, true);
    });
  }

  function renderTable(leads) {
    var head = el('head-row');
    head.textContent = '';
    COLUMNS.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c;
      head.appendChild(th);
    });
    var body = el('body');
    body.textContent = '';
    if (!leads.length) { setState('No leads match these filters.', false); return; }
    leads.forEach(function (lead) { body.appendChild(renderRow(lead)); });
    el('state').classList.add('hidden');
    el('table-wrap').classList.remove('hidden');
  }

  // textContent / setAttribute ONLY. No lead field is ever concatenated into HTML.
  function renderRow(lead) {
    var tr = document.createElement('tr');
    textCell(tr, (lead.submitted_at || '').slice(0, 10));
    textCell(tr, lead.name);
    textCell(tr, lead.email);
    textCell(tr, lead.region);
    textCell(tr, lead.specialty);
    textCell(tr, lead.assigned_firm_name);
    chipCell(tr, lead.flag, FLAG_CLASSES);
    chipCell(tr, lead.status, STATUS_CLASSES);
    truncCell(tr, lead.message);
    truncCell(tr, lead.notes);
    return tr;
  }

  function textCell(tr, value) {
    var td = document.createElement('td');
    td.textContent = value == null ? '' : String(value);
    tr.appendChild(td);
  }

  function chipCell(tr, value, classMap) {
    var td = document.createElement('td');
    if (value) {
      var span = document.createElement('span');
      // Class comes from a fixed whitelist, never from the raw value.
      span.className = 'chip ' + (classMap[value] || 'chip-default');
      span.textContent = String(value);
      td.appendChild(span);
    }
    tr.appendChild(td);
  }

  function truncCell(tr, value) {
    var td = document.createElement('td');
    var full = value == null ? '' : String(value);
    var shown = full.length > 120 ? full.slice(0, 120) + '…' : full;
    td.textContent = shown;
    if (full.length > 120) td.setAttribute('title', full);
    tr.appendChild(td);
  }

  // Fetch CSV as a blob with the Bearer header; the token never enters a URL.
  function downloadCsv() {
    if (!token) { showAuth(); return; }
    fetch('/api/admin/leads.csv?' + applyFilters(), {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function (res) {
      if (res.status === 401) { clearToken(); showAuth('That token was wrong or has been rotated. Enter the current one.'); return null; }
      if (!res.ok) throw new Error('Download failed (' + res.status + ')');
      return res.blob();
    }).then(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'els-leads.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch(function (err) {
      setState('Could not download CSV: ' + err.message, true);
    });
  }

  initAuth();
})();
</script>
</body>
</html>`;
