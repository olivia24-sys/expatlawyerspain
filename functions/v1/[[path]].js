// ELS public read-only API, version 1 (Cloudflare Pages Function).
//
// Catch-all under /v1. Serves SAFE public directory data only - the dataset
// is generated at build time from lawyers.html by tools/build-widget-data.js
// (field-allowlisted + PII-scanned; no D1, no secrets, no PII on this path,
// structurally). Primary consumer: the embeddable widget frames under
// /widgets/v1/*; open to any third-party reader by design (the same data is
// public on /lawyers).
//
// Routes (the FROZEN v1 contract - see tools/WIDGET-FRAMEWORK-NOTES.md):
//   GET /v1/firms  -> firm list; filters: city, specialty, lang, limit
//   GET /v1/meta   -> city/specialty/language enums + dataset version
//   OPTIONS        -> CORS preflight (204)
//   anything else  -> 404; non-GET/OPTIONS -> 405
//
// NEVER-BREAK-EMBEDDERS RULES for this file:
//   - the response envelope { ok, api_version, dataset_version, generated_at,
//     data } is frozen; changes within v1 are ADDITIVE ONLY (new fields, new
//     params). Never remove, rename or retype anything.
//   - unknown query params and unknown filter values are ignored, never an
//     error, so an old snippet can never start failing.
//   - a breaking change means a NEW /v2 function alongside this one.
//
// CORS is open (`*`) deliberately: GET-only, credential-free, PII-free.
// Caching is aggressive so the edge absorbs traffic; a Cloudflare WAF
// rate-limit rule on /v1/* is the deploy-time backstop (runbook step).

import { DATASET } from '../_lib/widget-firms-data.js';

const API_VERSION = 1;
const LIMIT_MAX = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function baseHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    ...CORS_HEADERS,
    ...extra,
  };
}

function ok(data, cacheSeconds) {
  return new Response(
    JSON.stringify({
      ok: true,
      api_version: API_VERSION,
      dataset_version: DATASET.dataset_version,
      generated_at: DATASET.generated_at,
      data,
    }),
    {
      status: 200,
      headers: baseHeaders({
        'Cache-Control': `public, max-age=300, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`,
      }),
    }
  );
}

function fail(error, status, extra = {}) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: baseHeaders({ 'Cache-Control': 'no-store', ...extra }),
  });
}

// Filter params are validated against the dataset's own enums; anything
// unknown is silently ignored (house pattern - only known values ever apply).
function pickEnum(url, name, allowed) {
  const raw = url.searchParams.get(name);
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return allowed.includes(value) ? value : null;
}

function pickLimit(url) {
  const raw = url.searchParams.get('limit');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (n < 1) return null;
  return Math.min(n, LIMIT_MAX);
}

export async function onRequest(context) {
  const { request, params } = context;
  const method = request.method;
  const segments = Array.isArray(params.path) ? params.path : [];

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders() });
  }
  if (method !== 'GET') {
    return fail('method not allowed', 405, { Allow: 'GET, OPTIONS' });
  }

  const d = DATASET.data;

  if (segments.length === 1 && segments[0] === 'firms') {
    const url = new URL(request.url);
    const city = pickEnum(url, 'city', d.cities);
    const specialty = pickEnum(url, 'specialty', d.specialties);
    const lang = pickEnum(url, 'lang', d.languages);
    const limit = pickLimit(url);

    let firms = d.firms;
    if (city) firms = firms.filter((f) => f.cities.includes(city));
    if (specialty) firms = firms.filter((f) => f.specialties.includes(specialty));
    if (lang) firms = firms.filter((f) => f.languages.includes(lang));
    const total = firms.length;
    if (limit) firms = firms.slice(0, limit);

    return ok({ total, firms }, 3600);
  }

  if (segments.length === 1 && segments[0] === 'meta') {
    return ok(
      {
        cities: d.cities,
        specialties: d.specialties,
        languages: d.languages,
        firm_count: d.firms.length,
      },
      3600
    );
  }

  return fail('not found', 404);
}
