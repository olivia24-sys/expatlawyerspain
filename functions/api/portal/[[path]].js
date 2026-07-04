// Firm portal (Cloudflare Pages Function) — catch-all under /api/portal.
//
// Each verified firm logs in via Cloudflare Access (One-Time PIN) and can see
// and update ONLY its own leads. Isolation is enforced at the data layer:
//   1. the list query is WHERE assigned_firm_id = ?  (bound to the verified
//      principal, with an explicit column whitelist — never SELECT *),
//   2. single-lead actions re-check ownership via applyScope and return 404
//      (not 403) out of scope, so another firm's lead ids are never confirmed,
//   3. the principal itself comes from the verified Access JWT + an active
//      firm_users row (see _lib/access.js) — the UI is never the boundary.
//
// Firms act through EVENTS, not a raw status dropdown, so portal writes flow
// through the exact same funnel machine as the admin console and the status
// can never disagree with the lead_routings ledger:
//   contacted            -> the admin Log-response path (routing 'responded')
//   consultation_booked  -> validateTransition + statusSideEffects
//   won                  -> "        -> closed_won
//   lost                 -> "        -> closed_other
//   note                 -> lead_events row only
// Every event appends a lead_events audit row (actor + timestamp) in the same
// env.DB.batch() as the funnel write. lead_events is append-only: no UPDATE
// or DELETE path exists anywhere.
//
// Routes:
//   GET  /api/portal[/]                    -> HTML console (no data in shell;
//                                             Access gates it at the edge)
//   GET  /api/portal/leads.json            -> this firm's leads + own events
//   POST /api/portal/leads/:id/events      -> ledger-safe firm action
//   anything else                          -> 404
//
// /api/admin is untouched by this file. Admin Bearer tokens are not accepted
// here; firm JWTs are not accepted there.

import { adminHeaders, clip, environmentFor } from '../../_lib/util.js';
import {
  validateTransition, statusSideEffects, routingOutcomePatch, responseLeadPatch,
  applyScope, readLead, readOpenRouting,
} from '../../_lib/leads.js';
import { resolveFirmPrincipal } from '../../_lib/access.js';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_NOTE = 2000;
const LIST_LIMIT = 500;

// Firm event -> target lead status for the milestone events. 'contacted' and
// 'note' are handled separately ('contacted' goes through the routing ledger,
// exactly like the admin Log-response action).
const EVENT_STATUS = {
  consultation_booked: 'consultation_booked',
  won: 'closed_won',
  lost: 'closed_other',
};
const EVENT_TYPES = ['contacted', 'consultation_booked', 'won', 'lost', 'note'];

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;
  const segments = Array.isArray(params.path) ? params.path : [];

  // Console shell — carries zero lead data; Access gates it at the edge and
  // every data fetch it makes re-verifies the JWT server-side anyway.
  if (segments.length === 0) {
    if (method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
    return new Response(PAGE_HTML, {
      status: 200,
      headers: adminHeaders({ 'Content-Type': 'text/html; charset=utf-8' }),
    });
  }

  if (segments.length === 1 && segments[0] === 'leads.json') {
    if (method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
    return withFirm(request, env, principal => leadsJson(request, env, principal));
  }

  if (segments.length === 3 && segments[0] === 'leads' && segments[2] === 'events') {
    if (method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'POST' });
    return withFirm(request, env, principal => postEvent(request, env, principal, segments[1]));
  }

  return json({ error: 'not found' }, 404);
}

// --- Auth ------------------------------------------------------------------

async function withFirm(request, env, handler) {
  const got = await resolveFirmPrincipal(request, env);
  if (!got.principal) return json({ error: got.error }, got.status);
  return handler(got.principal);
}

// The shared Production/Preview D1 makes environment pinning part of the
// isolation boundary: firms on the live domain must never see preview test
// rows, and preview deployments must never expose production PII. Decided
// server-side from the hostname — never client-selectable.
function allowedEnvironments(url) {
  return environmentFor(url.hostname) === 'production'
    ? ['production', 'backfill']
    : ['preview'];
}

// --- Reads -------------------------------------------------------------------

async function leadsJson(request, env, principal) {
  const envs = allowedEnvironments(new URL(request.url));
  const placeholders = envs.map(() => '?').join(', ');

  // Explicit column whitelist. Deliberately absent: ip_hash, spam_signals,
  // utm_*, notes (Olivia's), flag/flag_reason, heard_about_us, page_url,
  // source, named_firm*, escalation fields, environment, country,
  // submission_id. Spam-flagged leads are excluded outright.
  const { results } = await env.DB.prepare(
    `SELECT id, submitted_at, name, email, phone, specialty, region, message,
            status, routed_at, firm_first_response_at, closed_at, anonymised_at,
            updated_at
     FROM leads
     WHERE assigned_firm_id = ?1
       AND flag != 'suspected_spam'
       AND environment IN (${placeholders})
     ORDER BY submitted_at DESC
     LIMIT ${LIST_LIMIT}`
  ).bind(principal.firmId, ...envs).all();

  const leads = results || [];
  await attachOwnEvents(env, principal, leads);
  return json({ firm: principal.firmName, leads, count: leads.length }, 200);
}

// Attach this firm's own events to each lead. Other firms' history and any
// admin-actor events stay invisible by construction (WHERE firm_id + actor).
async function attachOwnEvents(env, principal, leads) {
  if (!leads.length) return leads;
  const ids = leads.map(l => l.id);
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT lead_id, event_type, note, actor_email, created_at
     FROM lead_events
     WHERE firm_id = ?1 AND actor_type = 'firm' AND lead_id IN (${placeholders})
     ORDER BY created_at ASC, id ASC`
  ).bind(principal.firmId, ...ids).all();

  const byLead = new Map();
  for (const e of (results || [])) {
    if (!byLead.has(e.lead_id)) byLead.set(e.lead_id, []);
    byLead.get(e.lead_id).push(e);
  }
  for (const l of leads) l.events = byLead.get(l.id) || [];
  return leads;
}

// --- Writes ------------------------------------------------------------------

// Load + scope a lead for this firm. Out of scope, wrong environment, or
// simply missing all look identical from the outside: 404. Never 403 — a firm
// must not be able to confirm that another firm's lead id exists.
async function requireOwnLead(request, env, principal, id) {
  const lead = await readLead(env, id);
  if (!lead) return { response: json({ error: 'not found' }, 404) };
  if (!applyScope(principal, lead)) return { response: json({ error: 'not found' }, 404) };
  if (lead.flag === 'suspected_spam') return { response: json({ error: 'not found' }, 404) };
  const envs = allowedEnvironments(new URL(request.url));
  if (!envs.includes(lead.environment)) return { response: json({ error: 'not found' }, 404) };
  return { lead };
}

async function postEvent(request, env, principal, id) {
  const got = await requireOwnLead(request, env, principal, id);
  if (got.response) return got.response;
  const lead = got.lead;

  const { body, error } = await readBody(request);
  if (error) return json({ error }, 400);

  const type = body.type;
  if (!EVENT_TYPES.includes(type)) return json({ error: 'invalid event type' }, 422);
  const note = clip(body.note, MAX_NOTE) || null;
  const now = new Date().toISOString();

  const eventInsert = env.DB.prepare(
    `INSERT INTO lead_events (lead_id, firm_id, actor_type, actor_email, event_type, note, created_at)
     VALUES (?1, ?2, 'firm', ?3, ?4, ?5, ?6)`
  ).bind(lead.id, principal.firmId, principal.email, type, note, now);

  if (type === 'note') {
    if (!note) return json({ error: 'note text required' }, 422);
    await eventInsert.run();
    return refreshed(env, principal, lead.id);
  }

  if (type === 'contacted') {
    // The admin Log-response path, verbatim: resolve the open routing attempt
    // to 'responded' and advance the lead. The ledger stays the single source
    // of truth for firm-response facts.
    const open = await readOpenRouting(env, lead.id);
    if (!open) return json({ error: 'no open routing attempt for this lead' }, 409);
    // Belt + braces: the open attempt must be THIS firm's. assigned_firm_id
    // and the open routing can only diverge mid-re-route; refuse to write
    // another firm's ledger row no matter what.
    if (open.firm_id !== principal.firmId) {
      return json({ error: 'lead is being reassigned, contact ELS' }, 409);
    }
    if (open.outcome !== 'pending') return json({ error: 'already recorded' }, 409);

    const stmts = [
      buildUpdate(env, 'lead_routings',
        routingOutcomePatch(open, { outcome: 'responded', escalatedToNext: false, now }),
        { id: open.id, outcome: 'pending' }),
      buildUpdate(env, 'leads', responseLeadPatch(lead, now), { id: lead.id }),
      eventInsert,
    ];
    await env.DB.batch(stmts);
    return refreshed(env, principal, lead.id);
  }

  // Milestone events: consultation_booked / won / lost -> the same guarded
  // funnel machine the admin console uses. routed / firm_responded stay
  // structurally unreachable from here (HUMAN_SETTABLE + TRANSITIONS).
  const toStatus = EVENT_STATUS[type];
  if (lead.status === toStatus) return refreshed(env, principal, lead.id); // idempotent double-click
  if (!validateTransition(lead.status, toStatus)) {
    return json({ error: `cannot record '${type}' while the lead is '${lead.status}'` }, 422);
  }

  const { lead: patch, closePending } = statusSideEffects(lead, toStatus, now);
  // Optimistic lock: the UPDATE only lands if the status is still what we read.
  const stmts = [buildUpdate(env, 'leads', patch, { id: lead.id, status: lead.status })];
  if (closePending) {
    const open = await readOpenRouting(env, lead.id);
    // A pending attempt by ANOTHER firm is not this firm's to resolve — only
    // auto-close our own (mirrors the admin behaviour otherwise).
    if (open && open.firm_id === principal.firmId) {
      stmts.push(env.DB.prepare(
        `UPDATE lead_routings SET outcome = 'silent', escalated_to_next = 0
         WHERE id = ? AND outcome = 'pending'`
      ).bind(open.id));
    }
  }
  stmts.push(eventInsert);

  const results = await env.DB.batch(stmts);
  if (!results[0].meta || results[0].meta.changes !== 1) {
    return json({ error: 'conflict, the lead changed, reload and retry' }, 409);
  }
  return refreshed(env, principal, lead.id);
}

// Return the updated lead through the SAME whitelist as the list read (a
// write response must never leak columns the read hides).
async function refreshed(env, principal, leadId) {
  const lead = await env.DB.prepare(
    `SELECT id, submitted_at, name, email, phone, specialty, region, message,
            status, routed_at, firm_first_response_at, closed_at, anonymised_at,
            updated_at
     FROM leads WHERE id = ?1`
  ).bind(leadId).first();
  const wrapped = [lead];
  await attachOwnEvents(env, principal, wrapped);
  return json({ ok: true, lead: wrapped[0] }, 200);
}

// --- Small frozen helpers (deliberate copies of the admin versions; keeping
// --- the admin file at a zero-line diff outweighs DRY here) ------------------

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

function buildUpdate(env, table, patch, where) {
  const setKeys = Object.keys(patch);
  const whereKeys = Object.keys(where);
  const setSql = setKeys.map(k => `${k} = ?`).join(', ');
  const whereSql = whereKeys.map(k => `${k} = ?`).join(' AND ');
  const binds = [...setKeys.map(k => patch[k]), ...whereKeys.map(k => where[k])];
  return env.DB.prepare(`UPDATE ${table} SET ${setSql} WHERE ${whereSql}`).bind(...binds);
}

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: adminHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...extra }),
  });
}

// --- The console page --------------------------------------------------------
// Self-contained: inline CSS + JS, no external resources. The shell carries no
// lead data; everything is fetched client-side and the Access cookie rides
// along automatically. Rendering is textContent/setAttribute/createElement
// only — no lead field is ever concatenated into HTML.

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ExpatLawyerSpain Firm Portal</title>
<style>
  :root{
    --navy:#133356; --terracotta:#C94F1A; --cream:#FAF5ED; --sand:#F0E6DB;
    --border:#E2DCD2; --ink:#190F0C; --clay:#705F57; --green:#386D50;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--cream);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:14px;line-height:1.45}
  header{background:var(--navy);color:#fff;padding:14px 20px;display:flex;
    align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 16px}
  header .title{display:flex;flex-direction:column;gap:2px}
  header h1{margin:0;font-size:16px;font-weight:600}
  header .firm{color:var(--sand);font-size:13px}
  header a.logout{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.5);
    border-radius:6px;padding:6px 12px;font-size:13px}
  header a.logout:hover{background:rgba(255,255,255,.1)}
  header a.logout:focus-visible{outline:2px solid #fff;outline-offset:2px}
  main{padding:20px;max-width:720px;margin:0 auto}
  .state{padding:60px 20px;text-align:center;color:var(--clay)}
  .state.error{color:var(--terracotta)}
  .state .btn{margin-top:14px}
  .btn{background:var(--terracotta);color:#fff;border:none;border-radius:6px;
    padding:9px 14px;font-size:13px;cursor:pointer;font-weight:600;font-family:inherit}
  .btn:hover{filter:brightness(1.06)}
  .btn:disabled{opacity:.5;cursor:default}
  .btn:focus-visible{outline:2px solid var(--navy);outline-offset:2px}
  .btn.subtle{background:var(--sand);color:var(--navy)}
  .btn.sm{padding:6px 11px;font-size:12px}
  .card{background:#fff;border:1px solid var(--border);border-radius:10px;
    padding:18px 20px;margin-bottom:16px}
  .card .top{display:flex;justify-content:space-between;align-items:flex-start;
    gap:12px;flex-wrap:wrap}
  .card h2{margin:0;font-size:16px;color:var(--navy)}
  .card .sub{color:var(--clay);font-size:12px;margin-top:3px}
  .chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;
    font-weight:600;white-space:nowrap}
  .chip-new,.chip-routed{background:#DCEAF5;color:var(--navy)}
  .chip-firm_responded{background:#E4EEDD;color:var(--green)}
  .chip-consultation_booked{background:#D7EDE0;color:var(--green)}
  .chip-closed_won{background:var(--green);color:#fff}
  .chip-closed_no_response,.chip-closed_other{background:#EDEDED;color:#555}
  .chip-default{background:var(--sand);color:var(--clay)}
  .contact{margin:10px 0;display:flex;gap:14px;flex-wrap:wrap;font-size:13px}
  .contact a{color:var(--navy)}
  .message{white-space:pre-wrap;color:var(--ink);margin:10px 0;padding:10px 12px;
    background:var(--sand);border-radius:8px;font-size:13px}
  .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .closed-note{color:var(--clay);font-size:13px;margin-top:10px}
  .hist{list-style:none;margin:12px 0 0;padding:10px 0 0;border-top:1px solid var(--border)}
  .hist li{font-size:12px;color:var(--clay);margin-bottom:6px;display:flex;gap:8px;flex-wrap:wrap}
  .hist .ev{color:var(--ink);font-weight:600}
  .hist .note{color:var(--clay)}
  .note-block{margin-top:12px;border-top:1px solid var(--border);padding-top:12px}
  .note-block label{display:block;font-size:12px;color:var(--clay);margin-bottom:4px}
  .note-block textarea{width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;
    font-size:13px;font-family:inherit;resize:vertical;min-height:44px}
  .note-block textarea:focus-visible{outline:2px solid var(--navy);outline-offset:1px}
  .note-row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
  .savenote{font-size:12px;color:var(--green)}
  .savenote.err{color:var(--terracotta)}
  .hidden{display:none}
</style>
</head>
<body>
<header>
  <div class="title">
    <h1>ExpatLawyerSpain: Firm portal</h1>
    <span class="firm" id="firm-name"></span>
  </div>
  <a class="logout" href="/cdn-cgi/access/logout">Log out</a>
</header>
<main>
  <div id="state" class="state">Loading your leads…</div>
  <div id="list" class="hidden"></div>
</main>
<script>
(function () {
  'use strict';

  var STATUS_LABELS = {
    routed: 'New, awaiting your reply',
    firm_responded: 'Contacted',
    consultation_booked: 'Consultation booked',
    closed_won: 'Won',
    closed_other: 'Closed',
    closed_no_response: 'Closed (no response)',
    new: 'New'
  };
  var STATUS_CLASSES = {
    routed: 'chip-routed', firm_responded: 'chip-firm_responded',
    consultation_booked: 'chip-consultation_booked', closed_won: 'chip-closed_won',
    closed_other: 'chip-closed_other', closed_no_response: 'chip-closed_no_response',
    new: 'chip-new'
  };
  var EVENT_LABELS = {
    contacted: 'Contacted lead', consultation_booked: 'Consultation booked',
    won: 'Marked won', lost: 'Marked lost / not pursuing', note: 'Note'
  };
  // Milestone buttons available per current status: [label, event type, needsConfirm].
  var STATUS_ACTIONS = {
    routed: [
      ['I\\u2019ve contacted this lead', 'contacted', false],
      ['Consultation booked', 'consultation_booked', false],
      ['Won', 'won', true],
      ['Lost / not pursuing', 'lost', true]
    ],
    firm_responded: [
      ['Consultation booked', 'consultation_booked', false],
      ['Won', 'won', true],
      ['Lost / not pursuing', 'lost', true]
    ],
    consultation_booked: [
      ['Won', 'won', true],
      ['Lost / not pursuing', 'lost', true]
    ]
  };

  var el = function (id) { return document.getElementById(id); };
  var listEl = el('list');
  var stateEl = el('state');
  var leadsById = {};

  function setState(msg, isError) {
    stateEl.textContent = '';
    var p = document.createElement('p');
    p.textContent = msg;
    stateEl.appendChild(p);
    stateEl.className = 'state' + (isError ? ' error' : '');
    stateEl.classList.remove('hidden');
    listEl.classList.add('hidden');
  }

  function setStateWithButton(msg, buttonLabel, onClick) {
    setState(msg, true);
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = buttonLabel;
    btn.addEventListener('click', onClick);
    stateEl.appendChild(btn);
  }

  function load() {
    setState('Loading your leads…', false);
    fetch('/api/portal/leads.json', { credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 401) {
          setStateWithButton('Your session has expired. Reload the page to log in again.',
            'Reload', function () { window.location.reload(); });
          return null;
        }
        if (res.status === 403) {
          setState('This account doesn\\u2019t have portal access. Contact ELS.', true);
          return null;
        }
        if (!res.ok) throw new Error('request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        el('firm-name').textContent = data.firm || '';
        renderList(data.leads || []);
      })
      .catch(function () {
        setStateWithButton('Something went wrong loading your leads. Please try again.',
          'Retry', load);
      });
  }

  function renderList(leads) {
    leadsById = {};
    listEl.textContent = '';
    if (!leads.length) {
      setState('No leads yet. When ELS routes an enquiry to you, it appears here.', false);
      return;
    }
    leads.forEach(function (lead) {
      leadsById[lead.id] = lead;
      listEl.appendChild(buildCard(lead));
    });
    stateEl.classList.add('hidden');
    listEl.classList.remove('hidden');
  }

  function replaceCard(lead) {
    leadsById[lead.id] = lead;
    var old = document.getElementById('lead-' + cssEscape(String(lead.id)));
    var fresh = buildCard(lead);
    if (old && old.parentNode) old.parentNode.replaceChild(fresh, old);
  }

  function cssEscape(s) {
    return s.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function buildCard(lead) {
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'lead-' + cssEscape(String(lead.id));

    var top = document.createElement('div');
    top.className = 'top';

    var left = document.createElement('div');
    var h2 = document.createElement('h2');
    var isAnon = !!lead.anonymised_at || !lead.name;
    h2.textContent = isAnon ? 'Anonymised lead' : lead.name;
    left.appendChild(h2);
    var sub = document.createElement('div');
    sub.className = 'sub';
    var bits = [];
    bits.push((lead.submitted_at || '').slice(0, 10));
    if (lead.specialty) bits.push(lead.specialty);
    if (lead.region) bits.push(lead.region);
    sub.textContent = bits.join(' \\u00b7 ');
    left.appendChild(sub);
    top.appendChild(left);

    var chip = document.createElement('span');
    chip.className = 'chip ' + (STATUS_CLASSES[lead.status] || 'chip-default');
    chip.textContent = STATUS_LABELS[lead.status] || lead.status;
    top.appendChild(chip);

    card.appendChild(top);

    if (!isAnon && (lead.email || lead.phone)) {
      var contact = document.createElement('div');
      contact.className = 'contact';
      if (lead.email) {
        var mail = document.createElement('a');
        mail.href = 'mailto:' + lead.email;
        mail.textContent = lead.email;
        contact.appendChild(mail);
      }
      if (lead.phone) {
        var tel = document.createElement('a');
        tel.href = 'tel:' + lead.phone;
        tel.textContent = lead.phone;
        contact.appendChild(tel);
      }
      card.appendChild(contact);
    }

    if (lead.message) {
      var msg = document.createElement('div');
      msg.className = 'message';
      msg.textContent = lead.message;
      card.appendChild(msg);
    }

    var errNote = document.createElement('div');
    errNote.className = 'savenote err hidden';

    var actionTypes = STATUS_ACTIONS[lead.status];
    if (actionTypes) {
      var actions = document.createElement('div');
      actions.className = 'actions';
      actionTypes.forEach(function (a) {
        var label = a[0], type = a[1], needsConfirm = a[2];
        var btn = document.createElement('button');
        btn.className = 'btn' + (type === 'won' || type === 'lost' ? '' : ' subtle');
        btn.textContent = label;
        btn.addEventListener('click', function () {
          if (needsConfirm) {
            var verb = type === 'won' ? 'mark this lead as won' : 'mark this lead as lost / not pursuing';
            var extra = '';
            if (type === 'lost') {
              extra = window.prompt('Optional note about why this lead was lost (leave blank to skip):', '') || '';
            }
            if (!window.confirm('Are you sure you want to ' + verb + '?')) return;
            sendEvent(lead.id, type, extra, [btn], errNote);
            return;
          }
          sendEvent(lead.id, type, '', [btn], errNote);
        });
        actions.appendChild(btn);
      });
      card.appendChild(actions);
    } else {
      var closedNote = document.createElement('div');
      closedNote.className = 'closed-note';
      closedNote.textContent = 'This lead is closed.';
      card.appendChild(closedNote);
    }

    card.appendChild(errNote);

    if (lead.events && lead.events.length) {
      var hist = document.createElement('ul');
      hist.className = 'hist';
      lead.events.forEach(function (ev) {
        var li = document.createElement('li');
        var when = document.createElement('span');
        when.textContent = (ev.created_at || '').slice(0, 10);
        li.appendChild(when);
        var label = document.createElement('span');
        label.className = 'ev';
        label.textContent = EVENT_LABELS[ev.event_type] || ev.event_type;
        li.appendChild(label);
        if (ev.note) {
          var note = document.createElement('span');
          note.className = 'note';
          note.textContent = ev.note;
          li.appendChild(note);
        }
        hist.appendChild(li);
      });
      card.appendChild(hist);
    }

    // Add-note control - always available.
    var noteBlock = document.createElement('div');
    noteBlock.className = 'note-block';
    var noteLabel = document.createElement('label');
    var noteId = 'note-' + cssEscape(String(lead.id));
    noteLabel.setAttribute('for', noteId);
    noteLabel.textContent = 'Add a note';
    noteBlock.appendChild(noteLabel);
    var textarea = document.createElement('textarea');
    textarea.id = noteId;
    noteBlock.appendChild(textarea);
    var noteRow = document.createElement('div');
    noteRow.className = 'note-row';
    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn sm subtle';
    saveBtn.textContent = 'Save note';
    var noteMsg = document.createElement('span');
    noteMsg.className = 'savenote';
    saveBtn.addEventListener('click', function () {
      var text = textarea.value.trim();
      if (!text) { noteMsg.className = 'savenote err'; noteMsg.textContent = 'Write a note first.'; return; }
      sendEvent(lead.id, 'note', text, [saveBtn], noteMsg);
    });
    noteRow.appendChild(saveBtn);
    noteRow.appendChild(noteMsg);
    noteBlock.appendChild(noteRow);
    card.appendChild(noteBlock);

    return card;
  }

  function sendEvent(leadId, type, note, buttons, msgEl) {
    buttons.forEach(function (b) { b.disabled = true; });
    msgEl.className = 'savenote';
    msgEl.textContent = 'Saving\\u2026';
    msgEl.classList.remove('hidden');

    var payload = { type: type };
    if (note) payload.note = note;

    fetch('/api/portal/leads/' + encodeURIComponent(leadId) + '/events', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (r) {
        if (r.ok && r.data && r.data.lead) {
          replaceCard(r.data.lead);
          return;
        }
        buttons.forEach(function (b) { b.disabled = false; });
        msgEl.className = 'savenote err';
        msgEl.classList.remove('hidden');
        msgEl.textContent = (r.data && r.data.error) ? r.data.error : ('Failed (' + r.status + ')');
      })
      .catch(function () {
        buttons.forEach(function (b) { b.disabled = false; });
        msgEl.className = 'savenote err';
        msgEl.classList.remove('hidden');
        msgEl.textContent = 'Network error. Please try again.';
      });
  }

  load();
})();
</script>
</body>
</html>`;
