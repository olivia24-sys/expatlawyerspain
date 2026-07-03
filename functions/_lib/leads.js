// Funnel state machine + shared constants for the lead admin write layer.
//
// Pure logic only — no DB calls, no secrets, no PII. The write handlers in
// functions/api/admin/[[path]].js stay thin (auth -> scope -> validate -> build
// patch -> write) by delegating every decision here, so the whole layer is unit
// testable and a future firm-facing view can reuse these functions verbatim.
//
// The one hard rule (see FABLE-NOTES-lead-admin.md): the lead_routings ledger is
// the single source of truth for firm-response facts. A lead can only reach
// 'routed' via the route action and 'firm_responded' via a routing outcome of
// 'responded'. Neither is ever settable through the raw /status endpoint, so the
// status and the ledger can never disagree.

// --- Shared enums (single source of truth; imported by the admin route) -----

export const STATUSES = [
  'new', 'routed', 'firm_responded', 'consultation_booked',
  'closed_won', 'closed_no_response', 'closed_other',
];

export const FLAGS = ['none', 'duplicate', 'suspected_spam', 'not_relevant'];

export const ROUTING_OUTCOMES = ['pending', 'responded', 'silent', 'declined'];

// Fields Olivia may edit directly: identity backfill for the oldest blank leads,
// ongoing notes, and the triage flag (flag-instead-of-delete).
export const EDITABLE_FIELDS = ['name', 'email', 'phone', 'message', 'notes', 'flag', 'flag_reason'];

// Service-level target: a routed firm is "overdue" this many days without a reply.
export const SLA_DAYS = 3;

// Statuses the /status endpoint is allowed to SET. 'routed' and 'firm_responded'
// are deliberately absent — they are produced only as side-effects of the route
// and routing-outcome actions, which also write the ledger.
const HUMAN_SETTABLE = ['new', 'consultation_booked', 'closed_won', 'closed_no_response', 'closed_other'];

// Allowed /status transitions (from -> [to]). Reaching 'routed'/'firm_responded'
// is owned by the route and routing-outcome actions, never this map.
export const TRANSITIONS = {
  new:                 ['closed_no_response', 'closed_other'],
  routed:              ['consultation_booked', 'closed_won', 'closed_no_response', 'closed_other', 'new'],
  firm_responded:      ['consultation_booked', 'closed_won', 'closed_other', 'closed_no_response'],
  consultation_booked: ['closed_won', 'closed_other'],
  // Reopen a closed lead to a human-settable active state (correction / re-engage).
  closed_won:          ['new', 'consultation_booked'],
  closed_no_response:  ['new', 'consultation_booked'],
  closed_other:        ['new', 'consultation_booked'],
};

export function isClosed(status) {
  return typeof status === 'string' && status.startsWith('closed_');
}

// --- Validation ------------------------------------------------------------

/** Is `to` a legal /status move from `from`? Same-status is not a move. */
export function validateTransition(from, to) {
  if (!STATUSES.includes(to)) return false;
  if (!HUMAN_SETTABLE.includes(to)) return false; // routed / firm_responded never here
  if (from === to) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

/** Lenient e-mail shape check (only used to reject obvious typos on edit). */
export function looksLikeEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || ''));
}

// --- Time helper -----------------------------------------------------------

/** ISO timestamp `days` after the given ISO instant. */
export function addDaysIso(iso, days) {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

// --- Pure side-effect builders (return field patches; no DB) ----------------

/**
 * Field patch for a /status change. Returns { lead, closePending } where
 * `lead` is the column patch for the leads row and `closePending` says whether
 * an open (pending) routing attempt should be resolved to 'silent' (the lead is
 * being closed while a firm attempt never resolved).
 */
export function statusSideEffects(lead, toStatus, now) {
  const patch = { status: toStatus, updated_at: now };

  if (isClosed(toStatus)) {
    if (!lead.closed_at) patch.closed_at = now;
  } else if (lead.closed_at) {
    patch.closed_at = null; // reopen
  }

  // Reaching a milestone that presumes a firm engaged backfills the lead-level
  // response timestamp if it was never set (e.g. won without logging a reply).
  if ((toStatus === 'consultation_booked' || toStatus === 'closed_won') && !lead.firm_first_response_at) {
    patch.firm_first_response_at = now;
  }

  return { lead: patch, closePending: isClosed(toStatus) };
}

/**
 * Field patch for the leads row when routing/re-routing to `firmId`. Never
 * downgrades an already-advanced status: only a brand-new lead flips to 'routed'.
 */
export function routeSideEffects(lead, firmId, now) {
  return {
    assigned_firm_id: firmId,
    routed_at: lead.routed_at || now,
    escalation_due_at: addDaysIso(now, SLA_DAYS),
    status: lead.status === 'new' ? 'routed' : lead.status,
    updated_at: now,
  };
}

/**
 * Column patch for an existing routing attempt when its outcome is recorded.
 * Used both by the route action (auto-closing the prior pending attempt) and by
 * the routing-outcome action. Immutable columns (firm_id, routed_at, lead_id)
 * are never touched — the ledger is append-only.
 */
export function routingOutcomePatch(routing, { outcome, escalatedToNext, now }) {
  const patch = { outcome, escalated_to_next: escalatedToNext ? 1 : 0 };
  if (outcome === 'responded' && !routing.first_response_at) {
    patch.first_response_at = now;
  }
  return patch;
}

/**
 * Lead-level patch when a routing attempt is marked 'responded': stamp the
 * first-response time if unset and advance the funnel forward only (a lead that
 * is already past firm_responded is not pulled back).
 */
export function responseLeadPatch(lead, now) {
  const patch = { updated_at: now };
  if (!lead.firm_first_response_at) patch.firm_first_response_at = now;
  if (lead.status === 'new' || lead.status === 'routed') patch.status = 'firm_responded';
  return patch;
}

// --- Principal / scope seams (firm view bolts on here) ----------------------

/**
 * Who is making this request. Today only the admin token exists (withAuth has
 * already validated it upstream). The firm-facing view will later return
 * { kind: 'firm', firmId } from its own auth without changing the handlers.
 */
export function resolvePrincipal(/* request, env */) {
  return { kind: 'admin' };
}

/**
 * May this principal act on this lead? A no-op for admin today; the seam where
 * the firm view will enforce ownership (lead.assigned_firm_id === firmId).
 */
export function applyScope(principal, lead) {
  if (principal && principal.kind === 'firm') {
    return !!lead && lead.assigned_firm_id === principal.firmId;
  }
  return true;
}

// --- Read helpers ----------------------------------------------------------

/** The full leads row for one id (or null). */
export function readLead(env, leadId) {
  return env.DB.prepare('SELECT * FROM leads WHERE id = ?1').bind(leadId).first();
}

/** The current open (pending) routing attempt for a lead, if any. */
export function readOpenRouting(env, leadId) {
  return env.DB.prepare(
    `SELECT * FROM lead_routings
     WHERE lead_id = ?1 AND outcome = 'pending'
     ORDER BY routed_at DESC, id DESC LIMIT 1`
  ).bind(leadId).first();
}

/** One routing attempt by id (or null). */
export function readRouting(env, routingId) {
  return env.DB.prepare('SELECT * FROM lead_routings WHERE id = ?1').bind(routingId).first();
}

/**
 * Attach a `routings` array (oldest first, with resolved firm name) to each
 * lead in place. One query for the whole page; values are bound, never
 * interpolated. Returns the same array for chaining.
 */
export async function attachRoutings(env, leads) {
  if (!leads.length) return leads;
  const ids = leads.map(l => l.id);
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT lr.id, lr.lead_id, lr.firm_id, lr.routed_at, lr.first_response_at,
            lr.outcome, lr.escalated_to_next, f.name AS firm_name
     FROM lead_routings lr
     LEFT JOIN firms f ON f.id = lr.firm_id
     WHERE lr.lead_id IN (${placeholders})
     ORDER BY lr.routed_at ASC, lr.id ASC`
  ).bind(...ids).all();

  const byLead = new Map();
  for (const r of (results || [])) {
    if (!byLead.has(r.lead_id)) byLead.set(r.lead_id, []);
    byLead.get(r.lead_id).push(r);
  }
  for (const l of leads) l.routings = byLead.get(l.id) || [];
  return leads;
}
