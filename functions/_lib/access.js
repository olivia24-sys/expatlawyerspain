// Cloudflare Access JWT verification + firm principal resolution.
//
// The firm portal (/api/portal/*) sits behind a Cloudflare Access application
// (One-Time PIN login). Access injects a signed JWT in the
// Cf-Access-Jwt-Assertion header. This module verifies that JWT fully —
// signature (RS256 against the team's published JWKS), issuer, audience,
// expiry — and then maps the authenticated email to a firm via the
// firm_users table.
//
// The server-side verification here is LOAD-BEARING, not belt-and-braces:
// the production deployment is also reachable on the *.pages.dev alias where
// the domain-scoped Access app does not run, so this header must be treated
// as attacker-controlled until every check below has passed. Never trust the
// plain Cf-Access-Authenticated-User-Email header; never skip a claim check
// "because Access already ran".
//
// Fail-closed rules:
//   - ACCESS_TEAM_DOMAIN / ACCESS_AUD unset        -> 503 (portal disabled)
//   - missing / malformed / unverified JWT          -> 401
//   - verified identity with no active firm_users   -> 403
//
// ACCESS_JWKS_INLINE (base64 of a JWKS JSON) exists ONLY so the local test
// harness can sign its own tokens; it is honoured solely for localhost
// requests and must never be set in the Cloudflare dashboard.

const JWKS_TTL_MS = 6 * 60 * 60 * 1000; // 6h; Access rotates keys ~6-weekly
const CLOCK_SKEW_S = 60;

// Module-scope cache survives between requests on a warm isolate.
let jwksCache = { keys: null, fetchedAt: 0, source: '' };

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** Import every RS256 signing key from a JWKS document, keyed by kid. */
async function importJwks(jwks) {
  const keys = new Map();
  for (const jwk of jwks.keys || []) {
    if (jwk.kty !== 'RSA') continue;
    if (jwk.alg && jwk.alg !== 'RS256') continue;
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keys.set(jwk.kid || '', key);
    } catch {
      // Skip unimportable keys; verification will 401 if none match.
    }
  }
  return keys;
}

/** Fetch (or read from cache) the verification keys. Returns Map<kid, CryptoKey>. */
async function getKeys(env, requestHostname, { forceRefresh = false } = {}) {
  const inline = env.ACCESS_JWKS_INLINE && isLocalHostname(requestHostname)
    ? env.ACCESS_JWKS_INLINE
    : null;
  const source = inline ? `inline:${inline.length}` : `team:${env.ACCESS_TEAM_DOMAIN}`;

  const fresh = jwksCache.keys
    && jwksCache.source === source
    && (Date.now() - jwksCache.fetchedAt) < JWKS_TTL_MS;
  if (fresh && !forceRefresh) return jwksCache.keys;

  let jwks;
  if (inline) {
    jwks = JSON.parse(atob(inline));
  } else {
    const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`jwks fetch ${res.status}`);
    jwks = await res.json();
  }
  const keys = await importJwks(jwks);
  jwksCache = { keys, fetchedAt: Date.now(), source };
  return keys;
}

/**
 * Verify the Access JWT on a request. Returns the verified payload claims or
 * null (any failure whatsoever). Never throws.
 */
export async function verifyAccessJwt(request, env) {
  try {
    const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = b64urlToJson(parts[0]);
    if (header.alg !== 'RS256') return null; // no alg negotiation, ever

    const hostname = new URL(request.url).hostname;
    let keys = await getKeys(env, hostname);
    let key = keys.get(header.kid || '');
    if (!key) {
      // Unknown kid: one forced refetch handles mid-cache key rotation.
      keys = await getKeys(env, hostname, { forceRefresh: true });
      key = keys.get(header.kid || '');
      if (!key) return null;
    }

    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), data
    );
    if (!valid) return null;

    const claims = b64urlToJson(parts[1]);
    const nowS = Math.floor(Date.now() / 1000);

    if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(env.ACCESS_AUD)) return null;
    if (typeof claims.exp !== 'number' || claims.exp < nowS - CLOCK_SKEW_S) return null;
    if (typeof claims.nbf === 'number' && claims.nbf > nowS + CLOCK_SKEW_S) return null;
    if (typeof claims.email !== 'string' || !claims.email.includes('@')) return null;

    return claims;
  } catch {
    return null;
  }
}

/**
 * Resolve the firm principal for a portal request.
 * Returns { principal: { kind:'firm', firmId, email, firmName } }
 * or      { status, error } for the caller to turn into a response.
 */
export async function resolveFirmPrincipal(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { status: 503, error: 'portal disabled' };
  }

  const claims = await verifyAccessJwt(request, env);
  if (!claims) return { status: 401, error: 'unauthorized' };

  // Entitlement is decided HERE, not by Access alone: a valid Access login
  // whose email has no active firm_users row gets 403. This is what makes
  // revocation hold even if the Access policy drifts.
  const row = await env.DB.prepare(
    `SELECT fu.firm_id, fu.is_active, f.name AS firm_name
     FROM firm_users fu JOIN firms f ON f.id = fu.firm_id
     WHERE fu.email = ?1 LIMIT 1`
  ).bind(claims.email).first();

  if (!row || !row.is_active) return { status: 403, error: 'no portal access' };

  return {
    principal: {
      kind: 'firm',
      firmId: row.firm_id,
      email: claims.email,
      firmName: row.firm_name,
    },
  };
}
