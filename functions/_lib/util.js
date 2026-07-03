// Shared helpers for the ELS lead-capture Pages Functions.
// No secrets and no PII live in this file. See FABLE-NOTES-lead-capture.md (ops dir).

/** Trim a value to a string and cap its length. Non-strings become ''. */
export function clip(value, max) {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** Same heuristic the site's client-side spam guard uses (js/main.js). */
export function hasLinkLikeText(value) {
  const text = String(value || '').toLowerCase();
  return /(https?:\/\/|www\.|\b[a-z0-9.-]+\.(com|net|org|io|es|co|uk|info|biz|ru|cn|xyz)\b)/i.test(text);
}

/** SHA-256 of a string, hex-encoded. */
export async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time-ish token comparison: hash both sides first so length and
 * content differences don't shortcut the comparison.
 */
export async function tokensMatch(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string' || !expected) return false;
  const [a, b] = await Promise.all([sha256Hex(presented), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Headers for every admin response: never cached, never indexed. */
export function adminHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
}

/** HTML-escape untrusted text for safe interpolation into markup. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 'production' when served from the live domain, otherwise 'preview'. */
export function environmentFor(hostname) {
  return hostname === 'expatlawyerspain.com' || hostname === 'www.expatlawyerspain.com'
    ? 'production'
    : 'preview';
}

/** Origins allowed to feed the lead endpoint. */
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { protocol, hostname } = new URL(origin);
    // wrangler pages dev serves plain http; everything real is https-only.
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (protocol !== 'https:') return false;
    return (
      hostname === 'expatlawyerspain.com' ||
      hostname === 'www.expatlawyerspain.com' ||
      hostname.endsWith('.expatlawyerspain-96m.pages.dev')
    );
  } catch {
    return false;
  }
}
