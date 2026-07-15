// Admin read + write layer for the lead-capture system (Cloudflare Pages Function).
//
// Catch-all under /api/admin. Serves a self-contained HTML console (no data in the
// shell) plus authenticated data + mutation endpoints. No secrets or PII live here.
//
// Routes:
//   GET  /api/admin[/]                        -> HTML console (no auth; zero lead data)
//   GET  /api/admin/leads.json                -> auth; filtered lead list (+ routings)
//   GET  /api/admin/leads.csv                 -> auth; same filters, CSV download
//   GET  /api/admin/firms.json                -> auth; firm registry for the routing UI
//   POST /api/admin/leads/:id/fields          -> auth; edit name/email/phone/message/notes/flag
//   POST /api/admin/leads/:id/status          -> auth; funnel status transition
//   POST /api/admin/leads/:id/route           -> auth; route/re-route (appends a ledger row)
//   POST /api/admin/routings/:id/outcome      -> auth; record a routing attempt's outcome
//   POST /api/admin/leads/:id/archive         -> auth; soft-archive with a validated reason
//   POST /api/admin/leads/:id/unarchive       -> auth; clear the archive (fully reversible)
//   anything else                             -> 404
//
// Auth: Authorization: Bearer <token>, compared constant-time to env.ADMIN_TOKEN.
// If ADMIN_TOKEN is unset we fail closed (503). The token lives only in the
// operator's browser localStorage and is never placed in a URL. Every mutation is
// validated server-side and applied via env.DB.batch() (implicit transaction). All
// funnel logic lives in ../../_lib/leads.js so a future firm-facing view can reuse it.

import { tokensMatch, adminHeaders, clip } from '../../_lib/util.js';
import {
  STATUSES, FLAGS, ROUTING_OUTCOMES, EDITABLE_FIELDS, ARCHIVE_REASONS,
  validateTransition, looksLikeEmail,
  statusSideEffects, routeSideEffects, routingOutcomePatch, responseLeadPatch,
  archivePatch, unarchivePatch,
  resolvePrincipal, applyScope,
  readLead, readOpenRouting, readRouting, attachRoutings,
} from '../../_lib/leads.js';

// Allowed filter enums — user-supplied filters are validated against these and any
// unknown value is silently dropped, so only these strings ever reach the SQL.
const ENVIRONMENTS = ['production', 'preview', 'backfill'];
// Preview rows are excluded unless explicitly requested (hard product requirement).
const DEFAULT_ENVIRONMENTS = ['production', 'backfill'];
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const MAX_BODY_BYTES = 16 * 1024;

// Per-field caps for the editable-fields endpoint (mirror the capture limits).
const FIELD_MAX = { name: 200, email: 320, phone: 60, message: 5000, notes: 5000, flag_reason: 500 };

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;
  const segments = Array.isArray(params.path) ? params.path : [];

  // Public shell — the only unauthenticated route (carries no lead data).
  if (segments.length === 0) {
    if (method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
    return new Response(PAGE_HTML, {
      status: 200,
      headers: adminHeaders({ 'Content-Type': 'text/html; charset=utf-8' }),
    });
  }

  // --- Authenticated reads (GET) ---
  if (segments.length === 1 && segments[0] === 'leads.json') {
    if (method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
    return withAuth(request, env, () => leadsJson(request, env));
  }
  if (segments.length === 1 && segments[0] === 'leads.csv') {
    if (method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
    return withAuth(request, env, () => leadsCsv(request, env));
  }
  if (segments.length === 1 && segments[0] === 'firms.json') {
    if (method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
    return withAuth(request, env, () => firmsJson(env));
  }

  // --- Authenticated writes (POST) ---
  if (segments.length === 3 && segments[0] === 'leads') {
    if (method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'POST' });
    const id = segments[1];
    const action = segments[2];
    if (action === 'fields') return withAuth(request, env, () => updateFields(request, env, id));
    if (action === 'status') return withAuth(request, env, () => updateStatus(request, env, id));
    if (action === 'route')  return withAuth(request, env, () => routeLead(request, env, id));
    if (action === 'archive')   return withAuth(request, env, () => archiveLead(request, env, id));
    if (action === 'unarchive') return withAuth(request, env, () => unarchiveLead(request, env, id));
  }
  if (segments.length === 3 && segments[0] === 'routings' && segments[2] === 'outcome') {
    if (method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'POST' });
    return withAuth(request, env, () => updateRoutingOutcome(request, env, segments[1]));
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

// Build a parameterised query. Only `?` placeholders touch user input; column names
// and IN-list widths come from validated enums, never raw strings. The console does
// flag/status/firm/etc. filtering client-side, so only `environment` gates the fetch.
function buildQuery(url) {
  const envs = parseEnum(url.searchParams.get('environment'), ENVIRONMENTS) || DEFAULT_ENVIRONMENTS;

  let limit = parseInt(url.searchParams.get('limit') || '', 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const placeholders = envs.map(() => '?').join(', ');
  const sql = `
    SELECT l.id, l.submitted_at, l.environment, l.name, l.email, l.phone, l.specialty,
           l.region, l.named_firm, l.named_firm_id, l.assigned_firm_id,
           f.name AS assigned_firm_name, l.heard_about_us, l.message, l.flag, l.flag_reason,
           l.status, l.routed_at, l.firm_first_response_at, l.escalation_due_at,
           l.escalated, l.closed_at, l.notes, l.source, l.page_url, l.updated_at,
           l.anonymised_at, l.archived_at, l.archive_reason
    FROM leads l
    LEFT JOIN firms f ON f.id = l.assigned_firm_id
    WHERE l.environment IN (${placeholders})
    ORDER BY l.submitted_at DESC
    LIMIT ?`;
  return { sql, binds: [...envs, limit] };
}

// --- JSON endpoint ---------------------------------------------------------

async function leadsJson(request, env) {
  const { sql, binds } = buildQuery(new URL(request.url));
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const leads = results || [];
  await attachRoutings(env, leads);
  const now = new Date().toISOString();
  for (const l of leads) {
    // A routed lead past its SLA with no logged response is overdue.
    l.overdue = !!(l.escalation_due_at && l.escalation_due_at < now
      && l.status === 'routed' && !l.firm_first_response_at);
  }
  return json({ leads, count: leads.length }, 200);
}

// --- Firms endpoint (routing dropdown) -------------------------------------

async function firmsJson(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, is_listed FROM firms ORDER BY name COLLATE NOCASE ASC'
  ).all();
  return json({ firms: results || [] }, 200);
}

// --- CSV endpoint ----------------------------------------------------------

const nthFirm = (r, n) => (r.routings && r.routings[n] ? r.routings[n].firm_name : '');
const nthOutcome = (r, n) => (r.routings && r.routings[n] ? r.routings[n].outcome : '');

// Column order mirrors the manual tracker xlsx, then appends the funnel extras.
const CSV_COLUMNS = [
  ['Date', r => (r.submitted_at || '').slice(0, 10)],
  ['Name', r => r.name],
  ['Email', r => r.email],
  ['Phone', r => r.phone],
  ['City / Region', r => r.region],
  ['Specialty', r => r.specialty],
  ['Enquiry', r => r.message],
  ['Firm requested', r => r.named_firm],
  ['1st firm', r => nthFirm(r, 0)],
  ['1st outcome', r => nthOutcome(r, 0)],
  ['2nd firm', r => nthFirm(r, 1)],
  ['2nd outcome', r => nthOutcome(r, 1)],
  ['3rd firm', r => nthFirm(r, 2)],
  ['3rd outcome', r => nthOutcome(r, 2)],
  ['Current firm', r => r.assigned_firm_name],
  ['Status', r => r.status],
  ['Flag', r => r.flag],
  ['Notes', r => r.notes],
  ['Id', r => r.id],
  ['Environment', r => r.environment],
  ['Source', r => r.source],
  ['Heard about us', r => r.heard_about_us],
  ['Page URL', r => r.page_url],
  // Archived rows stay in the export (it is the full backstop); these two
  // columns are how you tell them apart.
  ['Archived at', r => r.archived_at],
  ['Archive reason', r => r.archive_reason],
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
  await attachRoutings(env, rows);
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

// --- Write handlers --------------------------------------------------------

// Safe JSON body read with a size guard. Returns { body } or { error }.
async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return { error: 'payload too large' };
  try {
    const body = JSON.parse(raw || '{}');
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return { error: 'invalid body' };
    return { body };
  } catch {
    return { error: 'invalid json' };
  }
}

// Build a parameterised UPDATE from a patch object. Column names come only from
// trusted patch/where keys (built here from whitelists + known columns), never
// from raw request keys.
function buildUpdate(env, table, patch, where) {
  const setKeys = Object.keys(patch);
  const whereKeys = Object.keys(where);
  const setSql = setKeys.map(k => `${k} = ?`).join(', ');
  const whereSql = whereKeys.map(k => `${k} = ?`).join(' AND ');
  const binds = [...setKeys.map(k => patch[k]), ...whereKeys.map(k => where[k])];
  return env.DB.prepare(`UPDATE ${table} SET ${setSql} WHERE ${whereSql}`).bind(...binds);
}

// Load the lead, enforce scope. Returns { lead } or { response } (an error to return).
async function requireLead(request, env, id) {
  const principal = resolvePrincipal(request, env);
  const lead = await readLead(env, id);
  if (!lead) return { response: json({ error: 'not found' }, 404) };
  if (!applyScope(principal, lead)) return { response: json({ error: 'forbidden' }, 403) };
  return { lead };
}

// POST /leads/:id/fields — edit an allow-list of core fields.
async function updateFields(request, env, id) {
  const got = await requireLead(request, env, id);
  if (got.response) return got.response;

  const { body, error } = await readBody(request);
  if (error) return json({ error }, 400);

  const patch = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    if (key === 'flag') {
      if (!FLAGS.includes(body.flag)) return json({ error: 'invalid flag' }, 422);
      patch.flag = body.flag;
      continue;
    }
    let value = clip(body[key], FIELD_MAX[key] || 500);
    if (key === 'email') {
      if (value && !looksLikeEmail(value)) return json({ error: 'invalid email' }, 422);
      value = value.toLowerCase();
    }
    patch[key] = value === '' ? null : value;
  }
  if (!Object.keys(patch).length) return json({ error: 'no editable fields provided' }, 400);

  patch.updated_at = new Date().toISOString();
  const res = await buildUpdate(env, 'leads', patch, { id }).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: 'conflict' }, 409);
  return json({ ok: true, lead: await readLead(env, id) }, 200);
}

// POST /leads/:id/status — funnel transition (routed/firm_responded excluded here).
async function updateStatus(request, env, id) {
  const got = await requireLead(request, env, id);
  if (got.response) return got.response;
  const lead = got.lead;

  const { body, error } = await readBody(request);
  if (error) return json({ error }, 400);

  const toStatus = body.status;
  if (!STATUSES.includes(toStatus)) return json({ error: 'invalid status' }, 422);
  if (toStatus === lead.status) return json({ ok: true, lead }, 200); // no-op
  if (!validateTransition(lead.status, toStatus)) {
    return json({ error: `transition ${lead.status} -> ${toStatus} not allowed` }, 422);
  }

  const now = new Date().toISOString();
  const { lead: patch, closePending } = statusSideEffects(lead, toStatus, now);

  // Optional free-text reason is appended to notes (nowhere else to store it).
  const reason = clip(body.reason, 500);
  if (reason) {
    const stamp = `[${now.slice(0, 10)}] status -> ${toStatus}: ${reason}`;
    patch.notes = lead.notes ? `${lead.notes}\n${stamp}` : stamp;
  }

  // Optimistic lock: the leads UPDATE only lands if the status is still what we read.
  const stmts = [buildUpdate(env, 'leads', patch, { id, status: lead.status })];
  if (closePending) {
    const open = await readOpenRouting(env, id);
    if (open) {
      stmts.push(env.DB.prepare(
        `UPDATE lead_routings SET outcome = 'silent', escalated_to_next = 0 WHERE id = ? AND outcome = 'pending'`
      ).bind(open.id));
    }
  }

  const results = await env.DB.batch(stmts);
  if (!results[0].meta || results[0].meta.changes !== 1) {
    return json({ error: 'conflict — the lead changed, reload and retry' }, 409);
  }
  const updated = await readLead(env, id);
  await attachRoutings(env, [updated]);
  return json({ ok: true, lead: updated }, 200);
}

// POST /leads/:id/route — route/re-route; appends a ledger row, never overwrites.
async function routeLead(request, env, id) {
  const got = await requireLead(request, env, id);
  if (got.response) return got.response;
  const lead = got.lead;

  const { body, error } = await readBody(request);
  if (error) return json({ error }, 400);

  const firmId = Number(body.firm_id);
  if (!Number.isInteger(firmId) || firmId <= 0) return json({ error: 'invalid firm_id' }, 422);
  const firm = await env.DB.prepare('SELECT id FROM firms WHERE id = ?').bind(firmId).first();
  if (!firm) return json({ error: 'unknown firm' }, 422);

  const closeOutcome = body.close_previous_outcome || 'silent';
  if (closeOutcome !== 'silent' && closeOutcome !== 'declined') {
    return json({ error: 'invalid close_previous_outcome' }, 422);
  }

  const now = new Date().toISOString();
  const open = await readOpenRouting(env, id);
  const stmts = [];

  // Resolve the previous open attempt (it never responded → silent by default).
  if (open) {
    stmts.push(env.DB.prepare(
      `UPDATE lead_routings SET outcome = ?, escalated_to_next = 1 WHERE id = ? AND outcome = 'pending'`
    ).bind(closeOutcome, open.id));
  }
  // Append the new attempt.
  stmts.push(env.DB.prepare(
    `INSERT INTO lead_routings (lead_id, firm_id, routed_at, outcome, escalated_to_next)
     VALUES (?, ?, ?, 'pending', 0)`
  ).bind(id, firmId, now));
  // Update the lead's current-firm + funnel snapshot.
  stmts.push(buildUpdate(env, 'leads', routeSideEffects(lead, firmId, now), { id }));

  await env.DB.batch(stmts);
  const updated = await readLead(env, id);
  await attachRoutings(env, [updated]);
  return json({ ok: true, lead: updated }, 200);
}

// POST /routings/:id/outcome — record an attempt's outcome; responded advances the lead.
async function updateRoutingOutcome(request, env, routingId) {
  const rid = Number(routingId);
  if (!Number.isInteger(rid) || rid <= 0) return json({ error: 'invalid routing id' }, 400);
  const routing = await readRouting(env, rid);
  if (!routing) return json({ error: 'not found' }, 404);

  const got = await requireLead(request, env, routing.lead_id);
  if (got.response) return got.response;
  const lead = got.lead;

  const { body, error } = await readBody(request);
  if (error) return json({ error }, 400);

  const outcome = body.outcome;
  if (!ROUTING_OUTCOMES.includes(outcome)) return json({ error: 'invalid outcome' }, 422);
  const escalatedToNext = body.escalated_to_next ? 1 : 0;
  if (outcome === 'responded' && escalatedToNext) {
    return json({ error: 'a responded attempt cannot be escalated to next' }, 422);
  }

  const now = new Date().toISOString();
  const rPatch = routingOutcomePatch(routing, { outcome, escalatedToNext, now });
  if ('notes' in body) rPatch.notes = clip(body.notes, 2000) || null;

  const stmts = [buildUpdate(env, 'lead_routings', rPatch, { id: rid })];
  if (outcome === 'responded') {
    stmts.push(buildUpdate(env, 'leads', responseLeadPatch(lead, now), { id: lead.id }));
  } else {
    stmts.push(buildUpdate(env, 'leads', { updated_at: now }, { id: lead.id }));
  }

  await env.DB.batch(stmts);
  const updated = await readLead(env, lead.id);
  await attachRoutings(env, [updated]);
  return json({ ok: true, lead: updated }, 200);
}

// POST /leads/:id/archive — manual soft-hide with a validated reason. Never a
// delete: status, closed_at and the routing ledger are untouched, so unarchive
// restores the lead exactly as it was.
async function archiveLead(request, env, id) {
  const got = await requireLead(request, env, id);
  if (got.response) return got.response;
  const lead = got.lead;

  const { body, error } = await readBody(request);
  if (error) return json({ error }, 400);

  if (!ARCHIVE_REASONS.includes(body.reason)) return json({ error: 'invalid archive reason' }, 422);
  if (lead.archived_at) return json({ ok: true, lead: await withRoutings(env, lead) }, 200); // already archived — no-op

  const res = await buildUpdate(env, 'leads', archivePatch(new Date().toISOString(), body.reason), { id }).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: 'conflict' }, 409);
  return json({ ok: true, lead: await withRoutings(env, await readLead(env, id)) }, 200);
}

// POST /leads/:id/unarchive — clear the archive columns (reversal of the above).
async function unarchiveLead(request, env, id) {
  const got = await requireLead(request, env, id);
  if (got.response) return got.response;
  const lead = got.lead;

  const { error } = await readBody(request); // body is unused but still size-guarded
  if (error) return json({ error }, 400);

  if (!lead.archived_at) return json({ ok: true, lead: await withRoutings(env, lead) }, 200); // not archived — no-op

  const res = await buildUpdate(env, 'leads', unarchivePatch(new Date().toISOString()), { id }).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: 'conflict' }, 409);
  return json({ ok: true, lead: await withRoutings(env, await readLead(env, id)) }, 200);
}

// Attach routings to a single lead and return it (response-shape helper).
async function withRoutings(env, lead) {
  await attachRoutings(env, [lead]);
  return lead;
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
// is textContent/setAttribute only — no lead field is ever concatenated into HTML.

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ELS Leads - Admin</title>
<style>
  :root{
    --navy:#133356; --terracotta:#C94F1A; --cream:#FAF5ED; --sand:#F0E6DB;
    --border:#E2DCD2; --ink:#190F0C; --clay:#705F57; --green:#386D50;
    --controls-h:0px;
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
  .btn:disabled{opacity:.5;cursor:default}
  .btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff}
  .btn.subtle{background:var(--sand);color:var(--navy)}
  .btn.sm{padding:5px 10px;font-size:12px}
  main{padding:20px;max-width:1500px;margin:0 auto}
  .card{background:#fff;border:1px solid var(--border);border-radius:10px;
    padding:24px;max-width:420px;margin:60px auto}
  .card h2{margin:0 0 6px;font-size:16px;color:var(--navy)}
  .card p{margin:0 0 16px;color:var(--clay);font-size:13px}
  .card input{width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;
    font-size:14px;margin-bottom:12px}
  .card .btn{width:100%}

  /* Sticky controls block (toolbar + advanced + chips) */
  .controls{position:sticky;top:0;z-index:6;background:var(--cream);
    padding-bottom:10px;margin-bottom:6px}
  .toolbar{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
  .toolbar label,.adv label{display:flex;flex-direction:column;font-size:12px;color:var(--clay);gap:4px}
  .toolbar input,.toolbar select,.adv input,.adv select{padding:7px 8px;border:1px solid var(--border);
    border-radius:6px;background:#fff;font-size:13px}
  .toolbar select,.adv select{min-width:140px}
  #search{min-width:200px}
  .adv{display:none;gap:10px;flex-wrap:wrap;margin-top:10px;padding:12px;
    background:var(--sand);border-radius:8px}
  .adv.open{display:flex}
  .count{color:var(--clay);font-size:13px;align-self:center;white-space:nowrap}
  .count b{color:var(--navy)}
  .count-wrap{margin-left:auto;display:flex;align-items:center;gap:10px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .fchip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--border);
    border-radius:999px;padding:3px 6px 3px 10px;font-size:12px;color:var(--navy)}
  .fchip button{border:none;background:var(--sand);color:var(--clay);border-radius:999px;
    width:18px;height:18px;line-height:1;cursor:pointer;font-size:12px}
  .fchip.clear{cursor:pointer;background:var(--sand)}

  /* Tabs */
  .tabs{display:flex;gap:6px;margin-bottom:14px}
  .tab-btn{background:#fff;border:1px solid var(--border);color:var(--navy);border-radius:8px;
    padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
  .tab-btn:hover{background:var(--sand)}
  .tab-btn.active{background:var(--navy);color:#fff;border-color:var(--navy)}

  /* Summary strip + trend cards share the metric-card look */
  .summary-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
  .trend-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
  .metric-card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 16px}
  .metric-card .num{font-size:24px;font-weight:700;color:var(--navy);line-height:1.15}
  .metric-card .label{font-size:12px;color:var(--clay);margin-top:4px}
  .metric-card .sub{font-size:11px;color:var(--clay);margin-top:2px}
  @media (max-width:900px){ .summary-strip{grid-template-columns:repeat(2,1fr)} .trend-cards{grid-template-columns:1fr} }
  @media (max-width:520px){ .summary-strip{grid-template-columns:1fr} }

  /* Actions cell */
  td.actions-cell{white-space:nowrap}
  .actions-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .icon-btn{background:var(--sand);border:1px solid var(--border);color:var(--navy);border-radius:6px;
    width:26px;height:26px;line-height:1;cursor:pointer;font-size:13px;padding:0}
  .icon-btn:hover{background:var(--border)}
  .archive-select{padding:5px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#fff}

  /* Archived rows */
  tr.archived-row{opacity:.55}
  .chip-archived{background:#E5E1D8;color:var(--clay)}

  /* Trends view */
  .chart-wrap{background:#fff;border:1px solid var(--border);border-radius:10px;padding:20px 20px 10px;overflow-x:auto}
  .chart{display:flex;align-items:flex-end;gap:14px;min-height:220px;border-bottom:2px solid var(--border)}
  .chart-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:44px}
  .chart-count{font-size:12px;font-weight:700;color:var(--navy)}
  .chart-delta{font-size:11px;min-height:14px;margin-top:2px}
  .chart-delta.up{color:var(--green)}
  .chart-delta.down{color:var(--terracotta)}
  .bar{width:28px;background:var(--navy);border-radius:4px 4px 0 0;margin-top:4px}
  .chart-label{font-size:11px;color:var(--clay);margin-top:8px;white-space:nowrap}
  .chart-note{margin-top:14px;font-size:12px;color:var(--clay)}

  .table-wrap{overflow:auto;background:#fff;border:1px solid var(--border);border-radius:10px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  th{background:var(--sand);color:var(--navy);font-weight:600;position:sticky;top:0;
    white-space:nowrap;z-index:4}
  td{max-width:240px}
  td.msg{max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  tbody tr.lead-row{cursor:pointer}
  tbody tr.lead-row:hover{background:#FBF7F0}
  tbody tr.lead-row.open{background:#F5EFE6}
  tr.overdue td.rownum{box-shadow:inset 3px 0 0 var(--terracotta)}
  .rownum{color:var(--clay);font-variant-numeric:tabular-nums}
  .firm-cell{white-space:nowrap}
  .muted{color:var(--clay)}
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;
    font-weight:600;white-space:nowrap}
  .chip-none{background:var(--sand);color:var(--clay)}
  .chip-duplicate{background:#EDE3F5;color:#5A3E7A}
  .chip-suspected_spam{background:#FBE4DC;color:var(--terracotta)}
  .chip-not_relevant{background:#EDEDED;color:#555}
  .chip-new{background:#DCEAF5;color:var(--navy)}
  .chip-routed{background:#EAE6D5;color:#7a6a1a}
  .chip-firm_responded{background:#E4EEDD;color:var(--green)}
  .chip-consultation_booked{background:#D7EDE0;color:var(--green)}
  .chip-closed_won{background:var(--green);color:#fff}
  .chip-closed_no_response{background:#F3E2DC;color:var(--terracotta)}
  .chip-closed_other{background:#EDEDED;color:#555}
  .chip-pending{background:#EAE6D5;color:#7a6a1a}
  .chip-responded{background:var(--green);color:#fff}
  .chip-silent{background:#F3E2DC;color:var(--terracotta)}
  .chip-declined{background:#EDEDED;color:#555}
  .chip-default{background:var(--sand);color:var(--clay)}
  .tag-overdue{background:var(--terracotta);color:#fff;padding:1px 7px;border-radius:999px;font-size:10px;
    font-weight:700;margin-left:6px;text-transform:uppercase;letter-spacing:.03em}

  /* Drawer */
  tr.drawer-row td{background:#FBF7F0;padding:0}
  .drawer{padding:18px 20px;display:grid;grid-template-columns:1fr 1fr;gap:22px}
  .drawer section{min-width:0}
  .drawer h3{margin:0 0 10px;font-size:13px;color:var(--navy);text-transform:uppercase;letter-spacing:.04em}
  .drawer .meta{grid-column:1 / -1;color:var(--clay);font-size:12px;display:flex;gap:14px;flex-wrap:wrap;
    border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:2px}
  .drawer .meta code{background:var(--sand);padding:1px 6px;border-radius:4px;color:var(--ink)}
  .field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
  .field label{font-size:12px;color:var(--clay)}
  .field input,.field textarea,.field select{padding:7px 8px;border:1px solid var(--border);
    border-radius:6px;font-size:13px;font-family:inherit;background:#fff;width:100%}
  .field textarea{resize:vertical;min-height:52px}
  .row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}
  .savenote{font-size:12px;color:var(--green)}
  .savenote.err{color:var(--terracotta)}
  .hist{list-style:none;margin:8px 0 0;padding:0}
  .hist li{border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#fff}
  .hist .line1{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .hist .when{color:var(--clay);font-size:12px}
  .hist .acts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
  .state{padding:40px;text-align:center;color:var(--clay)}
  .state.error{color:var(--terracotta)}
  .hidden{display:none}
  @media (max-width:760px){ .drawer{grid-template-columns:1fr} }
</style>
</head>
<body>
<header>
  <h1>ELS Leads <span>- Admin</span></h1>
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
    <div class="tabs" id="tabs">
      <button class="tab-btn" type="button" data-tab="all">All time</button>
      <button class="tab-btn" type="button" data-tab="month">This month</button>
      <button class="tab-btn" type="button" data-tab="trends">Trends</button>
    </div>
    <div class="summary-strip" id="summary-strip"></div>
    <div class="controls" id="controls">
      <div class="toolbar">
        <label>Search name / email
          <input id="search" type="search" placeholder="Type to filter…" autocomplete="off">
        </label>
        <label>Status
          <select id="f-status"><option value="">All statuses</option></select>
        </label>
        <label>Firm
          <select id="f-firm"><option value="">All firms</option></select>
        </label>
        <button id="more" class="btn subtle" type="button">More filters ▾</button>
        <button id="refresh" class="btn subtle">Refresh</button>
        <button id="download" class="btn subtle">Download CSV</button>
        <div class="count-wrap">
          <button id="archived-toggle" class="btn subtle sm" type="button">View archived (0)</button>
          <span id="count" class="count"></span>
        </div>
      </div>
      <div class="adv" id="adv">
        <label>Region <select id="f-region"><option value="">All</option></select></label>
        <label>Specialty <select id="f-specialty"><option value="">All</option></select></label>
        <label>How heard <select id="f-heard"><option value="">All</option></select></label>
        <label>Flag
          <select id="f-flag">
            <option value="">All</option>
            <option value="none">none</option>
            <option value="duplicate">duplicate</option>
            <option value="suspected_spam">suspected_spam</option>
            <option value="not_relevant">not_relevant</option>
          </select>
        </label>
        <label>Environment
          <select id="f-env">
            <option value="production,backfill" selected>Real leads (production + backfill)</option>
            <option value="preview">Preview/test only</option>
            <option value="production,preview,backfill">All</option>
          </select>
        </label>
      </div>
      <div class="chips" id="chips"></div>
    </div>
    <div id="state" class="state">Loading…</div>
    <div id="table-wrap" class="table-wrap hidden">
      <table>
        <thead><tr id="head-row"></tr></thead>
        <tbody id="body"></tbody>
      </table>
    </div>
    <div id="trends-view" class="trends-view hidden"></div>
  </section>
</main>
<script>
(function () {
  'use strict';
  var TOKEN_KEY = 'els_admin_token';
  var COLUMNS = ['#','Date','Name','Email','Region','Specialty','Firm requested','1st firm','2nd firm','3rd firm','Status','How heard','Message','Flag','Actions'];
  var LAUNCH_MONTH = '2026-04';
  var ARCHIVE_REASON_LABELS = { out_of_scope:'out of scope', duplicate:'duplicate',
    specialty_paused:'specialty paused', other:'other' };
  var FLAG_CLASSES = { none:'chip-none', duplicate:'chip-duplicate',
    suspected_spam:'chip-suspected_spam', not_relevant:'chip-not_relevant' };
  var STATUS_CLASSES = { new:'chip-new', routed:'chip-routed', firm_responded:'chip-firm_responded',
    consultation_booked:'chip-consultation_booked', closed_won:'chip-closed_won',
    closed_no_response:'chip-closed_no_response', closed_other:'chip-closed_other' };
  var OUTCOME_CLASSES = { pending:'chip-pending', responded:'chip-responded',
    silent:'chip-silent', declined:'chip-declined' };
  var STATUS_LABELS = { new:'New', routed:'Routed', firm_responded:'Firm responded',
    consultation_booked:'Consultation booked', closed_won:'Closed — won',
    closed_no_response:'Closed — no response', closed_other:'Closed — other' };
  // Mirrors TRANSITIONS in functions/_lib/leads.js — keep in sync. Targets Olivia
  // may set directly; 'routed'/'firm_responded' are produced by Route / Log response.
  var TRANSITIONS = {
    new: ['closed_no_response','closed_other'],
    routed: ['consultation_booked','closed_won','closed_no_response','closed_other','new'],
    firm_responded: ['consultation_booked','closed_won','closed_other','closed_no_response'],
    consultation_booked: ['closed_won','closed_other'],
    closed_won: ['new','consultation_booked'],
    closed_no_response: ['new','consultation_booked'],
    closed_other: ['new','consultation_booked']
  };

  var el = function (id) { return document.getElementById(id); };
  var token = null;
  var allLeads = [];   // last fetched set (env-scoped)
  var firms = [];      // firm registry for the routing dropdown
  var openId = null;   // currently expanded lead id
  var activeTab = 'all';       // 'all' | 'month' | 'trends'
  var showArchived = false;    // archived rows hidden by default
  var archiveEditId = null;    // lead id whose Actions cell is showing the archive-reason picker

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
      token = v; setToken(v); showConsole(); boot();
    });
    el('signout').addEventListener('click', function () { clearToken(); showAuth(); });
    el('refresh').addEventListener('click', loadLeads);
    el('download').addEventListener('click', downloadCsv);
    el('f-env').addEventListener('change', loadLeads);
    el('more').addEventListener('click', function () {
      el('adv').classList.toggle('open'); syncTableHeight();
    });
    ['search','f-status','f-firm','f-region','f-specialty','f-heard','f-flag'].forEach(function (id) {
      var ev = id === 'search' ? 'input' : 'change';
      el(id).addEventListener(ev, render);
    });
    el('tabs').addEventListener('click', function (e) {
      var target = e.target;
      if (target.tagName !== 'BUTTON') return;
      var tab = target.getAttribute('data-tab');
      if (!tab || tab === activeTab) return;
      activeTab = tab;
      archiveEditId = null;
      render();
    });
    el('archived-toggle').addEventListener('click', function () {
      showArchived = !showArchived;
      render();
    });
    window.addEventListener('resize', syncTableHeight);

    token = getToken();
    if (token) { showConsole(); boot(); } else { showAuth(); }
  }

  // First load after auth: fetch firms once, then leads.
  function boot() { loadFirms(); loadLeads(); }

  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { 'Authorization': 'Bearer ' + token });
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) {
        clearToken();
        showAuth('That token was wrong or has been rotated. Enter the current one.');
        return Promise.reject(new Error('unauthorized'));
      }
      return res;
    });
  }

  function postJson(url, payload) {
    return authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function loadFirms() {
    authFetch('/api/admin/firms.json').then(function (res) { return res.json(); })
      .then(function (data) { firms = (data && data.firms) || []; })
      .catch(function () {});
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
    var p = new URLSearchParams();
    p.set('environment', el('f-env').value);
    authFetch('/api/admin/leads.json?' + p.toString())
      .then(function (res) {
        if (!res.ok) throw new Error('Request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        allLeads = (data && data.leads) || [];
        populateDynamicFilters();
        render();
      })
      .catch(function (err) {
        if (err && err.message === 'unauthorized') return;
        setState('Could not load leads: ' + err.message, true);
      });
  }

  // Populate the value-derived filter dropdowns from the fetched data.
  function distinct(key) {
    var set = {};
    allLeads.forEach(function (l) { var v = l[key]; if (v) set[v] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }
  function fillSelect(id, values, labelFn) {
    var sel = el(id);
    var keep = sel.value;
    // Rebuild option list, preserving the first (All) option.
    while (sel.options.length > 1) sel.remove(1);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = labelFn ? labelFn(v) : v;
      sel.appendChild(o);
    });
    // Restore selection if still present.
    sel.value = keep;
    if (sel.value !== keep) sel.value = '';
  }
  function firmNamesFromData() {
    var set = {};
    allLeads.forEach(function (l) {
      if (l.named_firm) set[l.named_firm] = true;
      if (l.assigned_firm_name) set[l.assigned_firm_name] = true;
      (l.routings || []).forEach(function (r) { if (r.firm_name) set[r.firm_name] = true; });
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }
  function populateDynamicFilters() {
    fillSelect('f-status', STATUSES_PRESENT(), function (v) { return STATUS_LABELS[v] || v; });
    fillSelect('f-firm', firmNamesFromData());
    fillSelect('f-region', distinct('region'));
    fillSelect('f-specialty', distinct('specialty'));
    fillSelect('f-heard', distinct('heard_about_us'));
  }
  function STATUSES_PRESENT() {
    var order = ['new','routed','firm_responded','consultation_booked','closed_won','closed_no_response','closed_other'];
    var present = {};
    allLeads.forEach(function (l) { if (l.status) present[l.status] = true; });
    return order.filter(function (s) { return present[s]; });
  }

  function currentFilters() {
    return {
      search: el('search').value.trim().toLowerCase(),
      status: el('f-status').value,
      firm: el('f-firm').value,
      region: el('f-region').value,
      specialty: el('f-specialty').value,
      heard: el('f-heard').value,
      flag: el('f-flag').value
    };
  }
  function firmMatches(lead, name) {
    if (lead.named_firm === name) return true;
    if (lead.assigned_firm_name === name) return true;
    return (lead.routings || []).some(function (r) { return r.firm_name === name; });
  }
  function applyClientFilters(leads, f) {
    return leads.filter(function (l) {
      if (f.status && l.status !== f.status) return false;
      if (f.flag && l.flag !== f.flag) return false;
      if (f.region && l.region !== f.region) return false;
      if (f.specialty && l.specialty !== f.specialty) return false;
      if (f.heard && l.heard_about_us !== f.heard) return false;
      if (f.firm && !firmMatches(l, f.firm)) return false;
      if (f.search) {
        var hay = ((l.name || '') + ' ' + (l.email || '')).toLowerCase();
        if (hay.indexOf(f.search) === -1) return false;
      }
      return true;
    });
  }

  // Which calendar month ("This month" tab) or full set ("All time" / "Trends" base).
  function tabScope(leads) {
    if (activeTab !== 'month') return leads;
    var ym = new Date().toISOString().slice(0, 7);
    return leads.filter(function (l) { return (l.submitted_at || '').slice(0, 7) === ym; });
  }

  function updateTabsUI() {
    var btns = el('tabs').querySelectorAll('.tab-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = (btns[i].getAttribute('data-tab') === activeTab) ? 'tab-btn active' : 'tab-btn';
    }
  }

  function metricCard(bigText, label, subText) {
    var card = document.createElement('div'); card.className = 'metric-card';
    var num = document.createElement('div'); num.className = 'num'; num.textContent = bigText;
    var lbl = document.createElement('div'); lbl.className = 'label'; lbl.textContent = label;
    card.appendChild(num); card.appendChild(lbl);
    if (subText) {
      var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = subText;
      card.appendChild(sub);
    }
    return card;
  }

  // Summary strip is computed from the active tab's scope only, ignoring the
  // ad-hoc search/status/firm filters. Returns the archived count (reused by
  // the "View archived" toggle so the two numbers stay consistent).
  function renderSummaryStrip(scoped) {
    var box = el('summary-strip');
    box.textContent = '';
    var nonArchived = scoped.filter(function (l) { return !l.archived_at; });
    var unique = nonArchived.filter(function (l) { return l.flag !== 'duplicate'; }).length;
    var total = nonArchived.length;
    var awaiting = nonArchived.filter(function (l) { return l.status === 'routed' && !l.firm_first_response_at; }).length;
    var overdue = nonArchived.filter(function (l) { return l.overdue; }).length;
    var closedWon = nonArchived.filter(function (l) { return l.status === 'closed_won'; }).length;
    var archived = scoped.filter(function (l) { return !!l.archived_at; }).length;

    box.appendChild(metricCard(String(unique), 'Unique leads', unique + ' unique · ' + total + ' total'));
    box.appendChild(metricCard(String(awaiting), 'Awaiting firm', null));
    box.appendChild(metricCard(String(overdue), 'Overdue', null));
    box.appendChild(metricCard(String(closedWon), 'Closed won', null));
    box.appendChild(metricCard(String(archived), 'Archived', null));
    return archived;
  }

  function updateArchivedToggle(n) {
    var btn = el('archived-toggle');
    btn.textContent = (showArchived ? 'Hide archived (' : 'View archived (') + n + ')';
  }

  function render() {
    updateTabsUI();

    if (activeTab === 'trends') {
      el('summary-strip').classList.add('hidden');
      el('controls').classList.add('hidden');
      el('state').classList.add('hidden');
      el('table-wrap').classList.add('hidden');
      renderTrendsView();
      syncTableHeight();
      return;
    }

    el('trends-view').classList.add('hidden');
    el('summary-strip').classList.remove('hidden');
    el('controls').classList.remove('hidden');

    var scoped = tabScope(allLeads);
    var archivedInScope = renderSummaryStrip(scoped);
    updateArchivedToggle(archivedInScope);

    var f = currentFilters();
    var filtered = applyClientFilters(scoped, f);
    var rows = showArchived ? filtered : filtered.filter(function (l) { return !l.archived_at; });
    renderChips(f);
    renderTable(rows);
    // Archived rows never count as unique, even when "View archived" shows them.
    var unique = rows.filter(function (l) { return l.flag !== 'duplicate' && !l.archived_at; }).length;
    el('count').innerHTML = '';
    var b1 = document.createElement('b'); b1.textContent = unique;
    var b2 = document.createElement('b'); b2.textContent = rows.length;
    el('count').appendChild(b1);
    el('count').appendChild(document.createTextNode(' unique · '));
    el('count').appendChild(b2);
    el('count').appendChild(document.createTextNode(' shown'));
    syncTableHeight();
  }

  // --- Trends tab ------------------------------------------------------------

  function monthsSinceLaunch() {
    var now = new Date();
    var curY = now.getUTCFullYear(), curM = now.getUTCMonth() + 1;
    var parts = LAUNCH_MONTH.split('-');
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    var months = [];
    while (y < curY || (y === curY && m <= curM)) {
      months.push(y + '-' + (m < 10 ? '0' + m : String(m)));
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months;
  }

  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthLabel(ym, prevYear) {
    var parts = ym.split('-');
    var y = parts[0], mIdx = parseInt(parts[1], 10) - 1;
    var name = MONTH_NAMES[mIdx];
    if (mIdx === 0 || y !== prevYear) return name + ' ' + y;
    return name;
  }

  // "+18%" / "−7%" — a plain "0%" when there is no change.
  function formatPct(x) {
    var pct = Math.round(x * 100);
    if (pct === 0) return '0%';
    return (pct > 0 ? '+' : '−') + Math.abs(pct) + '%';
  }

  function renderTrendsView() {
    var container = el('trends-view');
    container.classList.remove('hidden');
    container.textContent = '';

    var months = monthsSinceLaunch();
    var counts = months.map(function (ym) {
      return allLeads.filter(function (l) {
        return !l.archived_at && l.flag !== 'duplicate' && (l.submitted_at || '').slice(0, 7) === ym;
      }).length;
    });

    var totalUnique = counts.reduce(function (a, b) { return a + b; }, 0);
    var deltas = [];
    for (var i = 1; i < counts.length; i++) {
      if (counts[i - 1] > 0) deltas.push((counts[i] - counts[i - 1]) / counts[i - 1]);
    }
    var avgGrowthText = '—';
    if (deltas.length >= 2) {
      var sum = 0;
      for (var di = 0; di < deltas.length; di++) sum += deltas[di];
      avgGrowthText = formatPct(sum / deltas.length);
    }

    var bestIdx = 0;
    for (var j = 1; j < counts.length; j++) { if (counts[j] > counts[bestIdx]) bestIdx = j; }
    var bestText = counts.length ? (monthLabel(months[bestIdx], null) + ' · ' + counts[bestIdx]) : '—';

    var cardsWrap = document.createElement('div'); cardsWrap.className = 'trend-cards';
    cardsWrap.appendChild(metricCard(String(totalUnique), 'Leads since launch', null));
    cardsWrap.appendChild(metricCard(avgGrowthText, 'Average monthly growth', null));
    cardsWrap.appendChild(metricCard(bestText, 'Best month', null));
    container.appendChild(cardsWrap);

    var chartWrap = document.createElement('div'); chartWrap.className = 'chart-wrap';
    var chart = document.createElement('div'); chart.className = 'chart';
    var maxCount = counts.reduce(function (a, b) { return Math.max(a, b); }, 0);
    var prevYear = null;
    months.forEach(function (ym, idx) {
      var col = document.createElement('div'); col.className = 'chart-col';

      var countLbl = document.createElement('div'); countLbl.className = 'chart-count';
      countLbl.textContent = String(counts[idx]);
      col.appendChild(countLbl);

      var deltaLbl = document.createElement('div'); deltaLbl.className = 'chart-delta';
      if (idx > 0 && counts[idx - 1] > 0) {
        var pct = (counts[idx] - counts[idx - 1]) / counts[idx - 1];
        deltaLbl.textContent = formatPct(pct);
        deltaLbl.className += (pct >= 0 ? ' up' : ' down');
      }
      col.appendChild(deltaLbl);

      var bar = document.createElement('div'); bar.className = 'bar';
      var h = maxCount > 0 ? Math.round((counts[idx] / maxCount) * 160) : 0;
      bar.style.height = Math.max(2, h) + 'px';
      col.appendChild(bar);

      var lbl = document.createElement('div'); lbl.className = 'chart-label';
      lbl.textContent = monthLabel(ym, prevYear);
      prevYear = ym.split('-')[0];
      col.appendChild(lbl);

      chart.appendChild(col);
    });
    chartWrap.appendChild(chart);
    container.appendChild(chartWrap);

    var note = document.createElement('div'); note.className = 'chart-note';
    note.textContent = 'Unique leads per month. The picture fills out as more months of data arrive.';
    container.appendChild(note);
  }

  var ENV_LABELS = { 'production,backfill':'Real leads', 'preview':'Preview/test', 'production,preview,backfill':'All environments' };
  function renderChips(f) {
    var box = el('chips');
    box.textContent = '';
    var active = [];
    if (f.search) active.push({ id: 'search', label: 'search: ' + f.search });
    if (f.status) active.push({ id: 'f-status', label: 'status: ' + (STATUS_LABELS[f.status] || f.status) });
    if (f.firm) active.push({ id: 'f-firm', label: 'firm: ' + f.firm });
    if (f.region) active.push({ id: 'f-region', label: 'region: ' + f.region });
    if (f.specialty) active.push({ id: 'f-specialty', label: 'specialty: ' + f.specialty });
    if (f.heard) active.push({ id: 'f-heard', label: 'how heard: ' + f.heard });
    if (f.flag) active.push({ id: 'f-flag', label: 'flag: ' + f.flag });
    var env = el('f-env').value;
    if (env !== 'production,backfill') active.push({ id: 'f-env', label: 'env: ' + (ENV_LABELS[env] || env), reload: true });

    active.forEach(function (a) {
      var chip = document.createElement('span'); chip.className = 'fchip';
      chip.appendChild(document.createTextNode(a.label));
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '×';
      x.setAttribute('aria-label', 'Remove ' + a.label);
      x.addEventListener('click', function () {
        if (a.id === 'f-env') { el('f-env').value = 'production,backfill'; loadLeads(); return; }
        el(a.id).value = '';
        render();
      });
      chip.appendChild(x);
      box.appendChild(chip);
    });
    if (active.length > 1) {
      var clr = document.createElement('span'); clr.className = 'fchip clear';
      clr.textContent = 'Clear all';
      clr.addEventListener('click', clearAllFilters);
      box.appendChild(clr);
    }
  }
  function clearAllFilters() {
    ['search','f-status','f-firm','f-region','f-specialty','f-heard','f-flag'].forEach(function (id) { el(id).value = ''; });
    var envChanged = el('f-env').value !== 'production,backfill';
    el('f-env').value = 'production,backfill';
    if (envChanged) loadLeads(); else render();
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
    leads.forEach(function (lead, i) {
      body.appendChild(renderRow(lead, i + 1));
      if (lead.id === openId) body.appendChild(buildDrawer(lead));
    });
    el('state').classList.add('hidden');
    el('table-wrap').classList.remove('hidden');
  }

  // textContent / setAttribute ONLY. No lead field is ever concatenated into HTML.
  function renderRow(lead, num) {
    var tr = document.createElement('tr');
    tr.className = 'lead-row' + (lead.id === openId ? ' open' : '') + (lead.overdue ? ' overdue' : '')
      + (lead.archived_at ? ' archived-row' : '');
    tr.addEventListener('click', function () { toggleDrawer(lead.id); });

    var numTd = document.createElement('td');
    numTd.className = 'rownum';
    numTd.textContent = String(num);
    tr.appendChild(numTd);

    textCell(tr, (lead.submitted_at || '').slice(0, 10));
    textCell(tr, lead.name);
    textCell(tr, lead.email);
    textCell(tr, lead.region);
    textCell(tr, lead.specialty);
    firmRequestedCell(tr, lead);
    routingCell(tr, lead, 0);
    routingCell(tr, lead, 1);
    routingCell(tr, lead, 2);
    statusCell(tr, lead);
    textCell(tr, lead.heard_about_us);
    truncCell(tr, lead.message);
    chipCell(tr, lead.flag, FLAG_CLASSES);
    actionsCell(tr, lead);
    return tr;
  }

  function textCell(tr, value) {
    var td = document.createElement('td');
    td.textContent = value == null ? '' : String(value);
    tr.appendChild(td);
  }
  function firmRequestedCell(tr, lead) {
    var td = document.createElement('td');
    td.className = 'firm-cell';
    if (lead.named_firm) td.textContent = String(lead.named_firm);
    else { td.textContent = '—'; td.className += ' muted'; }
    tr.appendChild(td);
  }
  // The n-th routing attempt: firm name + outcome chip (responded shows green).
  function routingCell(tr, lead, n) {
    var td = document.createElement('td');
    td.className = 'firm-cell';
    var r = (lead.routings || [])[n];
    if (r) {
      td.appendChild(document.createTextNode((r.firm_name || ('firm #' + r.firm_id)) + ' '));
      var span = document.createElement('span');
      span.className = 'chip ' + (OUTCOME_CLASSES[r.outcome] || 'chip-default');
      span.textContent = r.outcome === 'responded' ? 'picked up' : r.outcome;
      td.appendChild(span);
    } else {
      td.textContent = '';
    }
    tr.appendChild(td);
  }
  function chipCell(tr, value, classMap) {
    var td = document.createElement('td');
    if (value) {
      var span = document.createElement('span');
      span.className = 'chip ' + (classMap[value] || 'chip-default');
      span.textContent = String(value);
      td.appendChild(span);
    }
    tr.appendChild(td);
  }
  function statusCell(tr, lead) {
    var td = document.createElement('td');
    var span = document.createElement('span');
    span.className = 'chip ' + (STATUS_CLASSES[lead.status] || 'chip-default');
    span.textContent = STATUS_LABELS[lead.status] || lead.status;
    td.appendChild(span);
    if (lead.overdue) {
      var od = document.createElement('span'); od.className = 'tag-overdue'; od.textContent = 'overdue';
      td.appendChild(od);
    }
    if (lead.archived_at) {
      var ac = document.createElement('span'); ac.className = 'chip chip-archived';
      ac.style.marginLeft = '6px';
      ac.textContent = 'archived: ' + (ARCHIVE_REASON_LABELS[lead.archive_reason] || lead.archive_reason || 'unknown');
      td.appendChild(ac);
    }
    tr.appendChild(td);
  }
  function truncCell(tr, value) {
    var td = document.createElement('td');
    td.className = 'msg';
    var full = value == null ? '' : String(value);
    td.textContent = full;
    if (full) td.setAttribute('title', full);
    tr.appendChild(td);
  }

  // Always-visible row actions: route/edit open the drawer, archive/unarchive
  // mutate the lead. The cell swallows clicks so they never toggle the row's drawer.
  function actionsCell(tr, lead) {
    var td = document.createElement('td');
    td.className = 'actions-cell';
    td.addEventListener('click', function (e) { e.stopPropagation(); });
    if (archiveEditId === lead.id) td.appendChild(buildArchiveConfirm(lead));
    else td.appendChild(buildActionButtons(lead));
    tr.appendChild(td);
  }

  function buildActionButtons(lead) {
    var wrap = document.createElement('div'); wrap.className = 'actions-row';

    var routeBtn = document.createElement('button'); routeBtn.type = 'button'; routeBtn.className = 'icon-btn';
    routeBtn.textContent = '→';
    routeBtn.setAttribute('aria-label', 'Route to firm'); routeBtn.setAttribute('title', 'Route to firm');
    routeBtn.addEventListener('click', function (e) { e.stopPropagation(); openId = lead.id; render(); });
    wrap.appendChild(routeBtn);

    var editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'icon-btn';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', 'Edit lead'); editBtn.setAttribute('title', 'Edit lead');
    editBtn.addEventListener('click', function (e) { e.stopPropagation(); openId = lead.id; render(); });
    wrap.appendChild(editBtn);

    if (lead.archived_at) {
      var unBtn = document.createElement('button'); unBtn.type = 'button'; unBtn.className = 'icon-btn';
      unBtn.textContent = '↩';
      unBtn.setAttribute('aria-label', 'Unarchive'); unBtn.setAttribute('title', 'Unarchive');
      unBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!window.confirm('Unarchive this lead?')) return;
        postJson('/api/admin/leads/' + encodeURIComponent(lead.id) + '/unarchive', {}).then(function (r) {
          if (r.ok) { loadLeads(); return; }
          window.alert((r.data && r.data.error) ? r.data.error : ('Failed (' + r.status + ')'));
        });
      });
      wrap.appendChild(unBtn);
    } else {
      var arcBtn = document.createElement('button'); arcBtn.type = 'button'; arcBtn.className = 'icon-btn';
      arcBtn.textContent = '⨯';
      arcBtn.setAttribute('aria-label', 'Archive'); arcBtn.setAttribute('title', 'Archive');
      arcBtn.addEventListener('click', function (e) { e.stopPropagation(); archiveEditId = lead.id; render(); });
      wrap.appendChild(arcBtn);
    }
    return wrap;
  }

  var ARCHIVE_REASON_OPTIONS = [
    ['out_of_scope', 'out of scope'],
    ['duplicate', 'duplicate'],
    ['specialty_paused', 'specialty paused'],
    ['other', 'other']
  ];
  function buildArchiveConfirm(lead) {
    var wrap = document.createElement('div'); wrap.className = 'actions-row';
    var sel = document.createElement('select'); sel.className = 'archive-select';
    ARCHIVE_REASON_OPTIONS.forEach(function (pair) {
      var o = document.createElement('option'); o.value = pair[0]; o.textContent = pair[1];
      sel.appendChild(o);
    });
    var note = document.createElement('span'); note.className = 'savenote';

    var confirmBtn = document.createElement('button'); confirmBtn.type = 'button'; confirmBtn.className = 'btn sm';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      confirmBtn.disabled = true; note.className = 'savenote'; note.textContent = 'Saving…';
      postJson('/api/admin/leads/' + encodeURIComponent(lead.id) + '/archive', { reason: sel.value })
        .then(function (r) {
          if (r.ok) { archiveEditId = null; loadLeads(); return; }
          confirmBtn.disabled = false;
          note.className = 'savenote err';
          note.textContent = (r.data && r.data.error) ? r.data.error : ('Failed (' + r.status + ')');
        });
    });

    var cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'btn sm subtle';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      archiveEditId = null;
      render();
    });

    wrap.appendChild(sel); wrap.appendChild(confirmBtn); wrap.appendChild(cancelBtn); wrap.appendChild(note);
    return wrap;
  }

  function toggleDrawer(id) { openId = (openId === id) ? null : id; render(); }

  // --- Edit drawer ---------------------------------------------------------
  function buildDrawer(lead) {
    var tr = document.createElement('tr');
    tr.className = 'drawer-row';
    var td = document.createElement('td');
    td.setAttribute('colspan', String(COLUMNS.length));
    var wrap = document.createElement('div');
    wrap.className = 'drawer';

    // Meta line
    var meta = document.createElement('div'); meta.className = 'meta';
    meta.appendChild(metaBit('id', lead.id));
    meta.appendChild(metaBit('submitted', (lead.submitted_at || '').slice(0, 16).replace('T', ' ')));
    meta.appendChild(metaBit('environment', lead.environment));
    meta.appendChild(metaBit('source', lead.source));
    if (lead.updated_at) meta.appendChild(metaBit('updated', (lead.updated_at || '').slice(0, 16).replace('T', ' ')));
    wrap.appendChild(meta);

    wrap.appendChild(detailsSection(lead));
    wrap.appendChild(funnelSection(lead));

    td.appendChild(wrap);
    tr.appendChild(td);
    return tr;
  }
  function metaBit(label, value) {
    var s = document.createElement('span');
    s.appendChild(document.createTextNode(label + ' '));
    var c = document.createElement('code'); c.textContent = value == null ? '—' : String(value);
    s.appendChild(c);
    return s;
  }
  function field(labelText, inputEl) {
    var f = document.createElement('div'); f.className = 'field';
    var l = document.createElement('label'); l.textContent = labelText;
    f.appendChild(l); f.appendChild(inputEl);
    return f;
  }
  function input(value) { var i = document.createElement('input'); i.type = 'text'; i.value = value == null ? '' : String(value); return i; }
  function textarea(value) { var t = document.createElement('textarea'); t.value = value == null ? '' : String(value); return t; }

  // Details: name / email / phone / message / notes + flag -> /fields
  function detailsSection(lead) {
    var sec = document.createElement('section');
    var h = document.createElement('h3'); h.textContent = 'Details'; sec.appendChild(h);
    var name = input(lead.name), email = input(lead.email), phone = input(lead.phone);
    var msg = textarea(lead.message), notes = textarea(lead.notes);
    var flag = document.createElement('select');
    ['none','duplicate','suspected_spam','not_relevant'].forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v;
      if ((lead.flag || 'none') === v) o.selected = true; flag.appendChild(o);
    });
    sec.appendChild(field('Name', name));
    sec.appendChild(field('Email', email));
    sec.appendChild(field('Phone', phone));
    sec.appendChild(field('Enquiry message', msg));
    sec.appendChild(field('Notes', notes));
    sec.appendChild(field('Flag', flag));
    var note = document.createElement('span'); note.className = 'savenote';
    var save = document.createElement('button'); save.className = 'btn sm'; save.textContent = 'Save details';
    save.addEventListener('click', function () {
      save.disabled = true; note.className = 'savenote'; note.textContent = 'Saving…';
      postJson('/api/admin/leads/' + encodeURIComponent(lead.id) + '/fields', {
        name: name.value, email: email.value, phone: phone.value,
        message: msg.value, notes: notes.value, flag: flag.value
      }).then(function (r) { afterWrite(r, note, save, 'Saved.'); });
    });
    var acts = document.createElement('div'); acts.className = 'row-actions';
    acts.appendChild(save); acts.appendChild(note);
    sec.appendChild(acts);
    return sec;
  }

  // Funnel: status transition + routing (reassign + history)
  function funnelSection(lead) {
    var sec = document.createElement('section');
    var h = document.createElement('h3'); h.textContent = 'Funnel'; sec.appendChild(h);

    // Current status
    var cur = document.createElement('div'); cur.style.marginBottom = '10px';
    cur.appendChild(document.createTextNode('Status: '));
    var cchip = document.createElement('span');
    cchip.className = 'chip ' + (STATUS_CLASSES[lead.status] || 'chip-default');
    cchip.textContent = STATUS_LABELS[lead.status] || lead.status;
    cur.appendChild(cchip);
    if (lead.overdue) { var od = document.createElement('span'); od.className = 'tag-overdue'; od.textContent = 'overdue'; cur.appendChild(od); }
    sec.appendChild(cur);

    // Status change (only the human-settable targets for this status)
    var targets = TRANSITIONS[lead.status] || [];
    if (targets.length) {
      var sel = document.createElement('select');
      var ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Change status to…'; sel.appendChild(ph);
      targets.forEach(function (t) {
        var o = document.createElement('option'); o.value = t; o.textContent = STATUS_LABELS[t] || t; sel.appendChild(o);
      });
      var reason = input(''); reason.placeholder = 'Optional note';
      var snote = document.createElement('span'); snote.className = 'savenote';
      var sbtn = document.createElement('button'); sbtn.className = 'btn sm'; sbtn.textContent = 'Update status';
      sbtn.addEventListener('click', function () {
        var to = sel.value;
        if (!to) { snote.className = 'savenote err'; snote.textContent = 'Pick a status.'; return; }
        if (to.indexOf('closed_') === 0 && !window.confirm('Close this lead as "' + (STATUS_LABELS[to] || to) + '"?')) return;
        sbtn.disabled = true; snote.className = 'savenote'; snote.textContent = 'Saving…';
        postJson('/api/admin/leads/' + encodeURIComponent(lead.id) + '/status', { status: to, reason: reason.value })
          .then(function (r) { afterWrite(r, snote, sbtn, 'Updated.'); });
      });
      var srow = document.createElement('div'); srow.className = 'row-actions';
      srow.appendChild(sel); srow.appendChild(reason); srow.appendChild(sbtn); srow.appendChild(snote);
      sec.appendChild(srow);
    }

    // Requested firm (read-only source data)
    var req = document.createElement('div'); req.style.margin = '12px 0 4px'; req.className = 'muted';
    req.textContent = 'Requested by enquirer: ' + (lead.named_firm || '— (general enquiry)');
    sec.appendChild(req);

    // Route / re-route
    var firmSel = document.createElement('select');
    var fph = document.createElement('option'); fph.value = ''; fph.textContent = 'Choose a firm…'; firmSel.appendChild(fph);
    firms.forEach(function (fm) {
      var o = document.createElement('option'); o.value = String(fm.id);
      o.textContent = fm.name + (fm.is_listed ? '' : ' (unlisted)');
      firmSel.appendChild(o);
    });
    var hasOpen = (lead.routings || []).some(function (r) { return r.outcome === 'pending'; });
    var prevSel = document.createElement('select');
    ['silent','declined'].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = 'previous → ' + v; prevSel.appendChild(o); });
    prevSel.style.display = hasOpen ? '' : 'none';
    var rnote = document.createElement('span'); rnote.className = 'savenote';
    var rbtn = document.createElement('button'); rbtn.className = 'btn sm';
    rbtn.textContent = hasOpen ? 'Re-route' : 'Route';
    rbtn.addEventListener('click', function () {
      if (!firmSel.value) { rnote.className = 'savenote err'; rnote.textContent = 'Choose a firm.'; return; }
      rbtn.disabled = true; rnote.className = 'savenote'; rnote.textContent = 'Saving…';
      postJson('/api/admin/leads/' + encodeURIComponent(lead.id) + '/route',
        { firm_id: Number(firmSel.value), close_previous_outcome: prevSel.value })
        .then(function (r) { afterWrite(r, rnote, rbtn, 'Routed.'); });
    });
    var rrow = document.createElement('div'); rrow.className = 'row-actions'; rrow.style.marginTop = '8px';
    rrow.appendChild(firmSel); rrow.appendChild(prevSel); rrow.appendChild(rbtn); rrow.appendChild(rnote);
    sec.appendChild(rrow);

    // History ledger
    var routings = lead.routings || [];
    if (routings.length) {
      var hh = document.createElement('div'); hh.className = 'muted'; hh.style.margin = '12px 0 0';
      hh.textContent = 'Routing history (' + routings.length + ')';
      sec.appendChild(hh);
      var ul = document.createElement('ul'); ul.className = 'hist';
      routings.forEach(function (r, i) { ul.appendChild(historyItem(lead, r, i + 1)); });
      sec.appendChild(ul);
    }
    return sec;
  }

  function historyItem(lead, r, n) {
    var li = document.createElement('li');
    var line = document.createElement('div'); line.className = 'line1';
    var idx = document.createElement('strong'); idx.textContent = '#' + n + ' ' + (r.firm_name || ('firm #' + r.firm_id));
    line.appendChild(idx);
    var oc = document.createElement('span'); oc.className = 'chip ' + (OUTCOME_CLASSES[r.outcome] || 'chip-default'); oc.textContent = r.outcome;
    line.appendChild(oc);
    var when = document.createElement('span'); when.className = 'when';
    when.textContent = 'routed ' + (r.routed_at || '').slice(0, 10) + (r.first_response_at ? ' · replied ' + r.first_response_at.slice(0, 10) : '');
    line.appendChild(when);
    li.appendChild(line);

    if (r.outcome === 'pending') {
      var acts = document.createElement('div'); acts.className = 'acts';
      var note = document.createElement('span'); note.className = 'savenote';
      [['Log response','responded'],['Mark silent','silent'],['Mark declined','declined']].forEach(function (pair) {
        var b = document.createElement('button'); b.className = 'btn sm subtle'; b.textContent = pair[0];
        b.addEventListener('click', function () {
          b.disabled = true; note.className = 'savenote'; note.textContent = 'Saving…';
          postJson('/api/admin/routings/' + encodeURIComponent(r.id) + '/outcome', { outcome: pair[1] })
            .then(function (res) { afterWrite(res, note, b, 'Saved.'); });
        });
        acts.appendChild(b);
      });
      acts.appendChild(note);
      li.appendChild(acts);
    }
    return li;
  }

  // Shared post-write handler: show error, or reload keeping the drawer open.
  function afterWrite(r, note, btn, okMsg) {
    if (r.ok) {
      note.className = 'savenote'; note.textContent = okMsg || 'Saved.';
      loadLeads(); // refresh from D1; drawer re-opens via openId
      return;
    }
    if (btn) btn.disabled = false;
    note.className = 'savenote err';
    note.textContent = (r.data && r.data.error) ? r.data.error : ('Failed (' + r.status + ')');
  }

  // Size the table's scroll area to the remaining viewport so its header stays
  // frozen (sticky top:0 within table-wrap) and the toolbar stays above it.
  function syncTableHeight() {
    var tw = el('table-wrap');
    if (!tw || tw.classList.contains('hidden')) return;
    var top = tw.getBoundingClientRect().top;
    tw.style.maxHeight = Math.max(240, window.innerHeight - top - 20) + 'px';
  }

  function downloadCsv() {
    if (!token) { showAuth(); return; }
    var p = new URLSearchParams(); p.set('environment', el('f-env').value);
    authFetch('/api/admin/leads.csv?' + p.toString())
      .then(function (res) { if (!res.ok) throw new Error('Download failed (' + res.status + ')'); return res.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'els-leads.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(function (err) {
        if (err && err.message === 'unauthorized') return;
        setState('Could not download CSV: ' + err.message, true);
      });
  }

  initAuth();
})();
</script>
</body>
</html>`;
