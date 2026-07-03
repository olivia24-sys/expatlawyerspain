// POST /api/lead — lead-capture ingest (Cloudflare Pages Function).
//
// Fired as a fire-and-forget beacon from the enquiry form on submit, ALONGSIDE
// (never instead of) the native Formspree POST. If this endpoint is down the
// user notices nothing and the Formspree email still arrives — D1 is a subset
// of the Formspree inbox by design.
//
// Behaviour contract (see FABLE-NOTES-lead-capture.md in the ops dir):
// - Suspicious submissions are STORED with flag='suspected_spam', never dropped.
// - Hard rejection only for: wrong method, oversized/malformed payloads, per-IP floods.
// - Idempotent on submission_id (double-clicks / beacon retries insert once).
// - Same email within 48h => flag='duplicate' (row still stored).
// - Never stores raw IPs — only SHA-256(ip + IP_HASH_SALT).
// - The Turnstile token is accepted but deliberately NOT redeemed here: tokens are
//   single-use and Formspree may verify them; redeeming would break the email path.

import { clip, hasLinkLikeText, sha256Hex, environmentFor, isAllowedOrigin } from '../_lib/util.js';

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_MAX = 5; // submissions per IP hash per window
const RATE_LIMIT_WINDOW = "-10 minutes";
const DUPLICATE_WINDOW = "-48 hours";
const MIN_FILL_MS = 3000; // mirrors the client-side spam guard

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    // --- Parse + size guard -------------------------------------------------
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) return new Response(null, { status: 400 });
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 400 });

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (typeof body !== 'object' || body === null) return new Response(null, { status: 400 });

    // --- Extract + normalise ------------------------------------------------
    const name = clip(body.name, 200);
    const email = clip(body.email, 320).toLowerCase();
    const message = clip(body.message, 5000);
    const specialty = clip(body.specialty, 200);
    const region = clip(body.region, 200);
    const namedFirm = clip(body.lawyer, 200); // hidden 'lawyer' prefill field
    const heardAboutUs = clip(body.heard_about_us, 200);
    const pageUrl = clip(body.page_url, 500);
    const utmSource = clip(body.utm_source, 200);
    const utmMedium = clip(body.utm_medium, 200);
    const utmCampaign = clip(body.utm_campaign, 200);
    const honeypot = clip(body.gotcha, 500);
    const msSinceLoad = Number.isFinite(Number(body.ms_since_load)) ? Number(body.ms_since_load) : null;
    // Client-generated idempotency key; a UUID fallback keeps bot posts storable.
    const submissionId = /^[A-Za-z0-9-]{8,64}$/.test(String(body.submission_id || ''))
      ? String(body.submission_id)
      : crypto.randomUUID();

    // A row with no identity and no message is unusable — reject, don't store.
    if (!name && !email && !message) return new Response(null, { status: 400 });

    // --- Request context ----------------------------------------------------
    const url = new URL(request.url);
    const environment = environmentFor(url.hostname);
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ipHash = ip && env.IP_HASH_SALT ? await sha256Hex(`${ip}${env.IP_HASH_SALT}`) : null;
    const country = (request.cf && request.cf.country) || null;
    const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';

    // --- Flood guard (the only case a plausible lead is turned away) --------
    if (ipHash) {
      const recent = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ?1 AND created_at > datetime('now', ?2)`
      ).bind(ipHash, RATE_LIMIT_WINDOW).first();
      if (recent && recent.n >= RATE_LIMIT_MAX) return new Response(null, { status: 429 });
    }

    // --- Spam signals: flag, never drop -------------------------------------
    const signals = [];
    if (honeypot) signals.push('honeypot_filled');
    if (msSinceLoad !== null && msSinceLoad < MIN_FILL_MS) signals.push('submitted_too_fast');
    if (hasLinkLikeText(message)) signals.push('link_in_message');
    if (!isAllowedOrigin(origin)) signals.push('unexpected_origin');

    let flag = 'none';
    let flagReason = null;
    if (signals.length > 0) {
      flag = 'suspected_spam';
      flagReason = `Automatic: ${signals.join(', ')}`;
    } else if (email) {
      // datetime() normalises the stored ISO8601 'T'/'Z' format so the comparison
      // is against SQLite's own clock format, not a raw string compare.
      const dup = await env.DB.prepare(
        `SELECT 1 FROM leads WHERE email = ?1 AND environment = ?2 AND datetime(submitted_at) > datetime('now', ?3) LIMIT 1`
      ).bind(email, environment, DUPLICATE_WINDOW).first();
      if (dup) {
        flag = 'duplicate';
        flagReason = 'Automatic: same email within 48h';
      }
    }

    // --- Resolve the user-selected firm to the registry ---------------------
    let namedFirmId = null;
    if (namedFirm) {
      const firm = await env.DB.prepare(
        `SELECT id FROM firms WHERE name = ?1 COLLATE NOCASE LIMIT 1`
      ).bind(namedFirm).first();
      if (firm) namedFirmId = firm.id;
    }

    // --- Store (idempotent on submission_id) --------------------------------
    await env.DB.prepare(
      `INSERT INTO leads (
         id, submission_id, environment, submitted_at,
         name, email, message, specialty, region,
         named_firm, named_firm_id, source, heard_about_us, page_url,
         utm_source, utm_medium, utm_campaign,
         flag, flag_reason, spam_signals, ip_hash, country
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
       ON CONFLICT(submission_id) DO NOTHING`
    ).bind(
      crypto.randomUUID(), submissionId, environment, new Date().toISOString(),
      name || null, email || null, message || null, specialty || null, region || null,
      namedFirm || null, namedFirmId, 'website_form', heardAboutUs || null, pageUrl || null,
      utmSource || null, utmMedium || null, utmCampaign || null,
      flag, flagReason, signals.length ? JSON.stringify(signals) : null, ipHash, country
    ).run();

    return new Response(null, { status: 204 });
  } catch (err) {
    // The page never reads this response; log for the Pages dashboard and fail quietly.
    console.error('lead-capture ingest failed:', err && err.message);
    return new Response(null, { status: 500 });
  }
}

// Only POST is exported: with onRequest present it would shadow onRequestPost
// (verified against wrangler pages dev), and Pages returns its own response for
// other methods on this route.
