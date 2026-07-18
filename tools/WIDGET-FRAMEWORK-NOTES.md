# Embeddable widget framework — how it works and how to extend it

*(Blog listing pages have their own notes: `tools/FABLE-NOTES.md`. Money
pages have their own notes: `tools/FABLE-NOTES-money-pages.md`. Different
generators, different surfaces, don't mix them up.)*

## 1. What this is

Partner sites (other Spain-focused blogs, expat forums, relocation
consultants) paste a small snippet onto their own page and get an isolated
ELS widget rendered inside it, for example a live directory of English
speaking lawyers filtered to their city or specialty. In return ELS gets two
things: a crawlable backlink from the anchor tag inside the snippet itself
(the iframe the loader mounts earns nothing for SEO, see the architecture
note below), and referral traffic through the widget's own links, each
carrying a UTM set stamped with that partner's own `data-partner` value so
performance per partner is visible in GA4. The whole thing is read-only: no
partner site can write anything back to ELS, and no personal data ever
reaches a partner's page.

## 2. Architecture map

Four layers, plus the snippet that lives on the partner's page:

```
lawyers.html  (source of truth: the live /lawyers directory page)
      |
      v
tools/lib/parse-firms.js   (the ONE parser, shared with build-money-pages.js)
      |
      v
tools/build-widget-data.js  (allowlists fields, PII-scans, hashes)
      |
      v
functions/_lib/widget-firms-data.js   (generated data module)
      |
      v
functions/v1/[[path]].js    (the public read-only /v1 API, Cloudflare Pages Function)
      |
      v
widgets/v1/firm-directory.html/.js/.css  (the frame: fetches /v1/firms, renders it)
      ^
      | <iframe src="https://expatlawyerspain.com/widgets/v1/firm-directory?...">
      |
embed/v1.js  (the loader, <script async src="...">, lives on the partner's page)
      ^
      | mounts the iframe into
      |
<div class="els-widget" data-els-widget="firm-directory" ...>   <- on the PARTNER'S page
  <a href="https://expatlawyerspain.com/lawyers">Find English-speaking lawyers...</a>
</div>
```

Say this plainly because it's easy to get backwards: the iframe itself earns
ELS no backlink at all. Search engines do not follow or credit links inside
an iframe document sitting on someone else's domain from the host page's own
authority. The backlink comes from the anchor tag that sits in the
partner's own HTML, inside the `.els-widget` div, before the loader touches
it. The loader replaces that fallback anchor with the mounted iframe plus its
own "Powered by ExpatLawyerSpain" attribution link, which is also a real
link sitting in the host page's DOM (see section 4). Both the original
snippet anchor and the attribution link matter for SEO; the iframe's
contents do not.

## 3. The v1 API contract (FROZEN)

Lives in `functions/v1/[[path]].js`, a Cloudflare Pages Function catch-all
under `/v1/*`. Reads only from the generated `widget-firms-data.js` module —
no D1, no secrets, nothing dynamic per request.

**Routes:**

- `GET /v1/firms` — the firm list. Filters (all optional, all query params):
  - `city` — must match one of the dataset's known city slugs or is ignored
  - `specialty` — same, against known specialties
  - `lang` — same, against known languages
  - `limit` — integer 1 to 100. Non-numeric, negative or zero values are
    ignored (full set returned); values over 100 are capped to 100
- `GET /v1/meta` — the enums (`cities`, `specialties`, `languages`) plus
  `firm_count`, so a widget or a partner integration can build its own
  filter UI without hardcoding the list.
- `OPTIONS` on either route — CORS preflight, `204`.
- Anything else — `404`. Any method other than `GET`/`OPTIONS` — `405` with
  an `Allow: GET, OPTIONS` header.

**Envelope (frozen shape; the values below are illustrative, e.g. `rating`
is `null` for firms with no Google rating in `lawyers.html`):**

```json
{
  "ok": true,
  "api_version": 1,
  "dataset_version": "7a4e54b77668",
  "generated_at": "2026-07-06T15:01:27.169Z",
  "data": {
    "total": 2,
    "firms": [
      {
        "slug": "link-lawyers",
        "name": "Link Lawyers",
        "location": "Barcelona",
        "cities": ["barcelona"],
        "specialties": ["property", "family", "business", "wills"],
        "languages": ["english", "spanish", "french"],
        "languages_text": "English · Spanish · French",
        "description": "Barcelona law firm supporting international clients...",
        "rating": { "score": 4.8, "count": 120 },
        "verified": true,
        "directory_url": "https://expatlawyerspain.com/lawyers",
        "enquiry_url": "https://expatlawyerspain.com/?firm=Link%20Lawyers&city=barcelona#contact-form"
      }
    ]
  }
}
```

`/v1/meta`'s `data` is `{ cities, specialties, languages, firm_count }`
instead of `{ total, firms }` — same envelope, different `data` shape per
route.

**Error shape:** `{ "ok": false, "error": "<message>" }`, no `data` key.

**Headers on every response:** `Content-Type: application/json; charset=utf-8`,
`X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex`,
`Access-Control-Allow-Origin: *` (plus `Allow-Methods: GET, OPTIONS` and
`Allow-Headers: Content-Type`), and never an
`Access-Control-Allow-Credentials` header. Success responses carry
`Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`;
error responses carry `Cache-Control: no-store`.

## 4. The partner snippet + loader contract (FROZEN)

The exact snippet a partner pastes:

```html
<div class="els-widget" data-els-widget="firm-directory"
     data-city="barcelona" data-specialty="property" data-partner="your-name">
  <a href="https://expatlawyerspain.com/lawyers">
    Find English-speaking lawyers in Spain | ExpatLawyerSpain</a>
</div>
<script async src="https://expatlawyerspain.com/embed/v1.js"></script>
```

**`data-*` attributes on the container** (all optional except
`data-els-widget`):

- `data-els-widget` — which widget frame to mount, e.g. `firm-directory`.
  Validated against `/^[a-z0-9-]{1,64}$/`; anything else and the loader
  silently does nothing with that container.
- `data-city`, `data-specialty`, `data-lang` — passed straight through as
  query params to the frame URL, truncated to 100 characters each.
- `data-partner` — the partner's own identifier, becomes `utm_campaign` on
  every outbound link the frame renders.

**What the loader does** (`embed/v1.js`, ES5 on purpose so it runs on any
partner site however old): on `DOMContentLoaded` (or immediately if the
document has already loaded), it scans for `.els-widget[data-els-widget]`
containers, and for each unmounted one it builds the frame URL from
`https://expatlawyerspain.com/widgets/v1/<widget>?<params>` (the origin is
actually derived from the loader script's own `src`, so the same file works
unmodified on production, Cloudflare previews, and local dev), replaces the
container's contents with a sandboxed `<iframe>` plus a "Powered by
ExpatLawyerSpain" attribution `<a>` that stays in the host page's own DOM,
and marks the container `data-els-mounted="1"` so re-running `rescan()`
never double-mounts.

**postMessage protocol** (frame to loader only, never the reverse):

| type | payload | loader action |
|---|---|---|
| `els:ready` | `{ els: 1, type: 'els:ready' }` | none today (reserved for future use) |
| `els:resize` | `{ els: 1, type: 'els:resize', height: <number> }` | clamps height to 100 to 4000px and sets the iframe's `style.height` |

Every message must carry `els: 1` (the protocol version) or it is ignored.
Unknown `type` values are ignored, not errors, which is what lets the
contract grow later.

**The sandbox model:** the iframe carries
`sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"` —
deliberately **without** `allow-same-origin`. `allow-forms` is present because a
widget that calculates on native form submission (the ITP calculator) never
fires its `submit` handler in a sandbox that omits it — the browser aborts the
submission before the event, so Calculate does nothing when embedded. It is
additive and safe: it only grants a capability, breaks no existing embedder, and
the frame CSP still carries `form-action 'none'` so a submission cannot navigate
or exfiltrate (the widgets `preventDefault()` anyway). Because `allow-same-origin` is
omitted, the browser treats the frame's origin as opaque, so every
`postMessage` from inside it legitimately arrives at the loader with
`event.origin === "null"`. That means the loader cannot authenticate
messages by origin string alone (a `"null"` origin is not distinguishing).
Instead it authenticates by **`event.source` binding**: it only acts on a
message whose `event.source` is the `contentWindow` of an iframe it itself
mounted. An attacker's own window can never produce that reference.

The reason `allow-same-origin` stays off is not paranoia for its own sake:
if a widget frame were ever compromised by an XSS bug and it also carried
`allow-same-origin`, it would execute with the real `https://expatlawyerspain.com`
origin in the sandbox, meaning it could reach same-origin `localStorage` —
which is exactly where the admin console keeps its auth token. Keeping the
sandbox origin opaque means even a compromised widget frame has nothing of
ELS's to steal.

## 5. Never-break-embedders rules

- **Frozen URLs:** `/embed/v1.js`, everything under `/widgets/v1/*`, and
  everything under `/v1/*`. A partner pasted these once and will never come
  back to update them; they must keep working indefinitely.
- **Additive-only within v1:** never remove, rename, or retype a field in
  the API envelope, a query param, a `data-*` attribute, or a postMessage
  `type`. Unknown fields, params, attributes and message types are ignored
  by both sides on purpose, specifically so that an old snippet or an old
  cached loader can never start failing when the framework grows.
- **A breaking change means a new `/v2` shipped alongside `/v1`**, never a
  replacement of it. `/v1` keeps running unmodified.
- **`/v1` stays maintained for at least 12 months after any `/v2` ships**,
  and is never removed while any known partner still uses it. Contact
  partners directly before ever sunsetting a version — don't just let it
  quietly break.
- **Directory content changes are data, not contract.** Adding, removing or
  editing a firm in `lawyers.html` and re-running the generator is normal
  operation, not a breaking change, even though the JSON payload changes.
- **The loader is edge-cached up to one hour** (`Cache-Control: public,
  max-age=3600` on `/embed/*`, see `_headers`). A fix to `embed/v1.js` is
  not instant on partner pages; budget up to an hour for it to roll out
  everywhere.

## 6. Security invariants

1. **No PII reaches the public dataset, structurally and belt-and-braces.**
   `build-widget-data.js` only ever copies an explicit field allowlist out of
   `parseFirms()`'s output (never firm contact emails, which live only in
   D1), and then scans the serialised JSON for email- and phone-shaped
   strings and refuses to write if either pattern matches. Enforced in
   `tools/build-widget-data.js` (the generator) and re-checked in
   `tools/test/widget-framework.test.mjs` (the "no email- or phone-shaped
   strings" tests, both against the dataset module and against live API
   responses).
2. **The API is GET-only, CORS-open, credential-free.** `Access-Control-Allow-Origin: *`
   with no `Access-Control-Allow-Credentials` header ever. Enforced in
   `functions/v1/[[path]].js` and tested in `widget-framework.test.mjs`
   ("CORS: open origin, GET-only, and NEVER allow-credentials").
3. **No SQL on the public path.** The `/v1` function reads only the
   generated, static `widget-firms-data.js` module; there is no database
   query anywhere between a request and a response on this path.
4. **Rendering is `textContent`-only; the CSP on `/widgets/*` is enforced,
   not report-only.** `widgets/v1/firm-directory.js` never uses `innerHTML`,
   `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or `new
   Function` — checked by a static scan in `widget-framework.test.mjs`
   ("widget frame JS: textContent-only rendering, no dangerous sinks"). The
   CSP itself is enforced (not report-only) in `_headers` under
   `/widgets/*`: `default-src 'none'; script-src 'self'; style-src 'self';
   img-src 'self' data:; connect-src 'self'`, with no `unsafe-inline`
   anywhere.
5. **`X-Frame-Options: DENY` everywhere except `/widgets/*`.** The global
   `/*` block in `_headers` sets `X-Frame-Options: DENY` for the whole site;
   only the `/widgets/*` block detaches it (`! X-Frame-Options`) and replaces
   it with `frame-ancestors *` inside its own CSP, because `/widgets/*` is
   the only path on the site that is meant to be iframed by anyone. **Order
   in `_headers` is load-bearing**: Cloudflare Pages applies header rules
   top to bottom, and `!` only detaches a header set by an *earlier* rule —
   so the `/widgets/*` block must physically come after the `/*` block in
   the file, or the detach does nothing and embedding silently breaks. This
   was verified live on `wrangler pages dev` on 2026-07-06: with
   `/widgets/*` listed first, `X-Frame-Options: DENY` leaked through anyway.
   There is a matching note in `_headers` itself for the day the site's
   global CSP flips from report-only to enforced: at that point add
   `! Content-Security-Policy` to the `/widgets/*` block too, or `/widgets/*`
   ends up governed by the intersection of both CSPs instead of its own.
6. **postMessage source binding.** The loader only acts on a message whose
   `event.source` is the `contentWindow` of an iframe it mounted itself; see
   section 4 for the full reasoning. Tested in `widget-framework.test.mjs`
   ("loader message handling: wrong origin and wrong source are BOTH
   rejected").
7. **The loader touches nothing outside its own containers.** It only ever
   reads and writes inside elements matching `.els-widget[data-els-widget]`,
   never anything else on the host page, and it never throws an uncaught
   error into the host page (every entry point is wrapped in try/catch).
8. **Rate limiting is edge cache plus a Cloudflare WAF rule.** The `/v1/*`
   cache headers absorb most repeat traffic at Cloudflare's edge, but the
   actual rate-limit backstop is a WAF rule that has to be added by hand in
   the Cloudflare dashboard at deploy time — see the deploy runbook, section
   9. It does not exist yet as code; there is nothing to grep for.

## 6b. Widgets on this framework so far

- **`firm-directory`** — the original: fetches the read-only `/v1/firms` API.
- **`itp-calculator`** — bundles its verified data as a static
  `/widgets/v1/itp-calculator-data.js` module (no API); calc-engine.js evaluates.
- **`visa-checker`** (added 2026-07-18, DRAFT-GATED) — the eligibility engine as a
  widget. Same static-data-module pattern as the ITP widget: no `/v1` route,
  `tools/build-widget-visa-data.js` writes `widgets/v1/visa-checker-data.js`
  (verified-only; `--draft-local` writes `draftPreview` for a local screenshot
  only, never committed). Frame `widgets/v1/visa-checker.{html,js,css}` derives
  from `js/visa-checker.js`. **It ships EMPTY until Olivia verifies >=1 visa rule**
  (the builder writes an empty module at 0 verified rather than dying, so the frame
  data script never 404s; the frame renders the honest "no routes yet" state). The
  standalone `/spain-visa-checker` page + its sitemap/llms entries + the pre-staged
  blog cluster-links all light up together at verification. See
  `tools/VISA-ENGINE-NOTES.md`. A `visa-checker` verified-only tripwire in the test
  suite fails if a `--draft-local` build is ever committed.

## 7. How to add a new widget on this framework

Worked example: adding `/widgets/v1/itp-calculator`.

1. **Copy the frame pattern**, not just the filenames. Under `widgets/v1/`
   you need three files following the same shape as `firm-directory.html`,
   `.js` and `.css`:
   - The HTML loads its CSS with a `<link>` and its JS with `<script defer
     src="...">` — no inline `<script>`, no inline `<style>`, no `style="`
     attributes anywhere, and it carries `<meta name="robots"
     content="noindex">`.
   - The JS renders only via `document.createElement` / `textContent` /
     `setAttribute` — never `innerHTML` or any of its cousins, because the
     CSP on `/widgets/*` allows no inline anything and the test suite scans
     for these sinks specifically.
   - On boot (and again after data loads) it posts `{ els: 1, type:
     'els:ready' }` once, and posts `{ els: 1, type: 'els:resize', height:
     <number> }` whenever its content height might have changed (on load,
     and debounced on window resize) — copy `postToParent`, `postResize`,
     `postReadyOnce` and `onResize` from `firm-directory.js` more or less
     unchanged.
   - It reads its own query params with `URLSearchParams` and appends the
     ELS UTM set (`utm_source=els-widget&utm_medium=embed&utm_campaign=<partner>`)
     to every outbound link, exactly like `appendUtm()` does — pull the
     `partner` param from its own query string.
2. **If it needs new data**, add a new route to `functions/v1/[[path]].js`
   additively (a new `segments[0] === 'itp-calculator-data'` branch, say) or,
   if the data doesn't belong in the existing firms dataset, add a new
   generator module under `functions/_lib/` following the same pattern as
   `widget-firms-data.js` (field-allowlisted, PII-scanned, hashed,
   idempotent). Never repurpose or reshape the existing `firms`/`meta`
   routes to shoehorn new data in.
3. **The loader needs no changes at all.** `embed/v1.js` builds the frame
   URL generically from `data-els-widget`, validated against
   `/^[a-z0-9-]{1,64}$/` — `data-els-widget="itp-calculator"` just works the
   moment the frame files exist at `/widgets/v1/itp-calculator`.
4. **Add tests** to `tools/test/widget-framework.test.mjs`: static checks on
   the new frame's HTML/JS (no inline anything, `textContent` used, no
   dangerous sinks — copy the existing `firm-directory` static tests and
   point them at the new files) plus tests for any new API route you added,
   following the same pattern as the existing `/v1/firms` and `/v1/meta`
   tests (envelope shape, hostile-filter handling, headers).
5. **Run `node --test tools/test/widget-framework.test.mjs`** and fix
   anything red before moving on.
6. **Test cross-origin locally** — see section 8, this is not optional for a
   new widget since same-origin testing can hide sandbox and postMessage
   bugs that only show up across two real origins.
7. **Update this document** — add the new widget to the architecture map if
   it changes the shape of things, and note anything about it that a future
   session would otherwise have to rediscover.

## 8. Local testing and the runbooks

**Unit and contract tests:**

```
node --test tools/test/widget-framework.test.mjs
```

**Regenerate the dataset** after any change to `lawyers.html`:

```
node tools/build-widget-data.js
```

Check for drift without writing (same habit as the money pages generator,
add to the publish checklist):

```
node tools/build-widget-data.js --check
```

**Cross-origin end-to-end testing.** Same-origin testing in a single dev
server cannot catch every sandbox/postMessage bug, because the whole point
of the loader's origin check is behaviour that only appears when the parent
page and the widget frame are on genuinely different origins. To test that
for real:

1. Serve the site itself with `wrangler pages dev` using the `els-widgets`
   launch config already defined in `.claude/launch.json` (port 8788).
2. Serve a second, separate origin hosting a plain partner-style HTML page
   with the snippet pasted in, pointed at `http://localhost:8788/embed/v1.js`
   — any static file server on a different port works, since a different
   port counts as a different origin for this purpose.
3. Load the partner page and confirm the widget mounts, resizes, and its
   links carry the right UTM params.

`/embed-demo.html` (unlinked, noindexed, ships with the site) is the
**same-origin** demo instead — useful for a quick visual check of the
widget itself, but it does not exercise the cross-origin path and should not
be treated as a substitute for step 1 to 3 above.

**Cloudflare preview quirk:** branch previews sit behind the Access OTP
gate, which blocks the kind of anonymous cross-origin fetch a real partner
page would make. That means the **local** wrangler + second-origin harness
above is the primary way to verify cross-origin behaviour before merging —
the hosted preview cannot stand in for it here.

## 9. Deploy runbook (for Olivia, first deploy only)

This framework is dormant until merged and deployed; it does nothing on the
live site before that. Before or at the first real deploy:

1. **Security review sign-off** — someone other than whoever wrote it reads
   sections 3 to 6 of this document against the actual code once more before
   it goes live.
2. **Add a Cloudflare WAF rate-limiting rule for `/v1/*`** in the Cloudflare
   dashboard. This does not exist as code or config anywhere in the repo —
   it has to be added by hand. Suggested starting point: around 100
   requests per 10 seconds per IP, block for 10 seconds on breach. Tune from
   there once real traffic patterns are visible.
3. **Purge the widget assets from the Cloudflare cache.** The widget
   JS/CSS/HTML are unversioned and `/widgets/*` now carries
   `Cache-Control: public, max-age=0, must-revalidate` — but a copy cached
   under an older rule can still be served until it is flushed, so a fresh
   deploy can otherwise go on serving stale code. In the Cloudflare dashboard →
   Caching → **Purge Custom URLs**, purge (or Purge Everything):
   - `https://expatlawyerspain.com/widgets/v1/itp-calculator`
   - `https://expatlawyerspain.com/widgets/v1/itp-calculator.js`
   - `https://expatlawyerspain.com/widgets/v1/itp-calculator.css`
   - `https://expatlawyerspain.com/widgets/v1/widget.css`
   - `https://expatlawyerspain.com/widgets/v1/itp-calculator-data.js`
   - `https://expatlawyerspain.com/js/calc-engine.js` (shared with the on-site
     page; sits outside `/widgets/*` so the header rule does not cover it, but
     it changes rarely — purge it when it does)
   - `https://expatlawyerspain.com/embed/v1.js`
4. **After deploy, verify with curl:**
   - `curl -s https://expatlawyerspain.com/v1/firms` returns the JSON
     envelope and the response includes `Access-Control-Allow-Origin: *`.
   - `curl -sI https://expatlawyerspain.com/widgets/v1/itp-calculator` shows
     **no** `X-Frame-Options` header, the strict enforced
     `Content-Security-Policy` (incl. `font-src 'self'` and `form-action
     'none'`), and `Cache-Control: public, max-age=0, must-revalidate`.
   - `curl -sI https://expatlawyerspain.com/` still shows
     `X-Frame-Options: DENY`.
5. **Walk `/embed-demo` and `/embed-itp` on production** in a real browser and
   confirm the widget renders, resizes, and its links work. For the ITP
   calculator, in a **fresh/incognito** context (no cache-buster) confirm the
   running JS is fresh — it contains "See if you qualify" and NOT "Refine your
   result on the full" — and that **Calculate computes inside the cross-origin
   sandboxed embed** (the `allow-forms` path), not only on the standalone frame.
6. **When a real partner embeds the widget**, hand them the snippet from
   section 4 with their own `data-partner` value filled in, and once it's
   live check GA4 for traffic tagged `utm_campaign=<partner>` to confirm
   attribution is actually flowing.

## 10. Known limitations and honest flags

- **No per-firm profile pages.** Every firm's `directory_url` in the API
  points at the general `/lawyers` page, not at an individual profile —
  there's nothing to link to per-firm yet.
- **Dataset regeneration is manual.** Editing `lawyers.html` does not
  automatically update `widget-firms-data.js`; someone has to remember to
  run `node tools/build-widget-data.js` afterwards. The `--check` flag
  guards against silently shipping drift, but only if it's actually run —
  add it to the publish checklist alongside the money-pages equivalent.
- **The 4 firm-scoring write-suite failures on this branch are expected.**
  Firm responsiveness scoring lives on the separate, unmerged
  `firm-scoring` branch; any test failures here that reference scoring
  writes are pre-existing and unrelated to the widget framework.
- **`embed-demo.html` ships unlinked and noindexed.** It is a real file in
  the deployed site (not a dev-only artefact) but nothing links to it and it
  carries `noindex, nofollow`, so it doesn't show up anywhere by accident.
