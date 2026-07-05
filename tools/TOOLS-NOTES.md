# Calculator tools and the legal-data spine: how they work

*(Blog listing pages have their own notes: `tools/FABLE-NOTES.md`. Money
pages too: `tools/FABLE-NOTES-money-pages.md`. This file covers the
calculators and the legal figures behind them.)*

## What this is

One data spine (`tools/legal-data/`) holds every legal figure the site
publishes, each with its source and dates; one pure engine
(`js/calc-engine.js`) does all the maths; and the calculator pages (starting
with `/itp-calculator-spain`) read only from the spine, so no rate is ever
typed into a page by hand. The one rule: no figure enters the spine without
a source URL, an effective date, a review-by date and a note. The validator
(`tools/validate-legal-data.js`) enforces that rule and rejects anything
unsourced.

## The daily commands

All from the repo root (the `website` folder). Node only, no npm install.

| What you want | Command |
| --- | --- |
| Validate the spine | `node tools/validate-legal-data.js` |
| Your verification worklist | `node tools/validate-legal-data.js --list` |
| Freshness check (fails on stale) | `node tools/validate-legal-data.js --check` |
| Run the tests | `node --test "tools/test/**/*.test.js"` |
| Rebuild the calculator pages | `node tools/build-tool-pages.js` |
| See what the build would change | `node tools/build-tool-pages.js --check` |
| Local preview with draft figures | `node tools/build-tool-pages.js --allow-draft` |

`--allow-draft` builds the page with unverified draft figures so you can see
it locally before verifying anything. It stamps a red warning banner on the
page and a noindex tag. NEVER merge an `--allow-draft` build; rebuild without
the flag first.

## How to update a figure when a rate changes

Every figure lives in `tools/legal-data/itp.js` (future topics get their own
file next to it). When a region changes a rate:

1. Open `tools/legal-data/itp.js` and find the figure by its id, e.g.
   `itp.madrid.resale`.
2. Update the `value` (flat rates) or the `bands` (tiered scales).
3. Update `effectiveFrom` to the date the new rate takes effect.
4. Update `source.accessed` to today, and `source.url` if the page moved.
5. Push `reviewBy` out to the next sensible re-check date.
6. Rewrite the `note` to say what changed and why.
7. Set `status`. If you have read the official tax-authority page yourself
   and the figure matches, `'verified'`. If not, `'draft'`, and it will sit
   on your worklist until you have.
8. Run the three checks:

```
node tools/validate-legal-data.js
node --test "tools/test/**/*.test.js"
node tools/build-tool-pages.js
```

If a test fails, a fixture in `tools/test/fixtures/itp-fixtures.js` still
expects the old rate. That is the fixtures doing their job. Re-work the
affected fixture by hand: take its input price, apply the new rate yourself
(calculator and paper is fine), and update `total`, `effectiveRate` and
`lineCount` to the numbers you worked out. Do that in the same commit as the
rate change, so the fixtures always match the spine. Never change a fixture
to whatever the test output says without checking the sum yourself; the
whole point is that a human worked the example.

## Draft to verified: your workflow

Every figure lands in the spine as `status: 'draft'`, however good the
research was. Only you flip a figure to `'verified'`, and only after you
have opened the official tax-authority page and seen the number with your
own eyes. The production build refuses drafts: a region whose resale figure
is still draft simply does not appear in the calculator or the rate table,
so a visitor can never be shown an unchecked number.

Your worklist, with each figure's value and source link ready to click:

```
node tools/validate-legal-data.js --list
```

The official-source rule: a figure can only be `'verified'` when its source
URL is on the `officialSourceHosts` list in `tools/legal-data/index.js`.
That list is AEAT, the BOE and the regional haciendas only. Law-firm blogs
and aggregator sites never verify anything; a figure that only appears on a
secondary site stays draft, and the validator will tell you so. If a
region's genuine official agency is missing from the list, add its host
there; never add anything else.

## The freshness guard

Every figure carries a `reviewBy` date, the date by which someone must
re-check it against its source. The default validator run lists figures past
that date as STALE but still passes. `--check` turns stale into a hard
failure (exit code 1), which is the hook for a future cron job: the day a
figure lapses, the check fails and the staleness gets fixed. When you
re-check a stale figure, update `source.accessed` and push `reviewBy`
forward, even if the rate itself did not change.

## Adding a new figure, or a whole new topic

A new figure in an existing topic: copy a similar figure in
`tools/legal-data/itp.js`, give it a unique id starting with the domain
prefix (`itp.`), and fill in every field. The comment at the top of that
file documents the whole field shape: id, label, region, unit, value or
bands, effectiveFrom, source, reviewBy, note, optional userNote, status.
The validator will name anything you miss.

A new topic (say Beckham-regime figures): create
`tools/legal-data/beckham.js` with the same shape as `itp.js` (a `domain`,
a `domainLabel` and a `figures` array), then add one line to the `domains`
object in `tools/legal-data/index.js`:

```js
beckham: require('./beckham.js'),
```

Run the validator and it now checks the new file too.

## Adding a new calculator

This is a Claude Code job, not a hand edit, but the shape is fixed and worth
knowing so you can ask for it precisely:

1. Figures first: a domain file in `tools/legal-data/`, validated, and on
   your worklist.
2. Fixtures and tests before any page: hand-worked examples in
   `tools/test/fixtures/`, exercised by a test like
   `tools/test/engine.test.js`.
3. A new function in `js/calc-engine.js`, modelled on `calculateITP`. It
   must return the same result contract: `{ ok, total, effectiveRate,
   lines, figuresUsed, notes }`, so every calculator "shows the working"
   the same way. Bad user input returns `{ ok: false }`; it never throws.
4. A page entry in `tools/tool-pages-data.js` (copy the `itp` entry; that
   file holds copy only, never rate numbers).
5. A UI wiring file like `js/itp-calculator.js`: no maths, no figures, it
   only reads the form, calls the engine and renders the result.
6. `node tools/build-tool-pages.js` builds the page and keeps the sitemap
   and llms files in sync.

## What the tests prove, and what they do not

The fixtures in `tools/test/fixtures/itp-fixtures.js` are hand-worked
examples the engine must reproduce to the cent, including band boundaries
and rounding. They prove the MATHS: that the engine applies the figures in
the spine correctly, in the browser and in Node alike. They do NOT prove the
figures match real law. That is your verification pass, draft to verified,
against the official sources. The tests deliberately run against the full
spine, drafts included, so the maths is locked down before you verify.

## If it breaks

| Message | What it means |
| --- | --- |
| `REJECTED` from the validator | A figure is missing or malformed. The message names the figure id and the exact field. Fix that field in the domain file and re-run. |
| `no VERIFIED ITP resale figures yet` on build | Not a bug. It is the draft gate: nothing is verified, so there is nothing a production build may ship. Verify figures, or use `--allow-draft` for a local look. |
| `--check` exits 1 with STALE figures | A figure is past its `reviewBy` date. Re-check it against its source, update `source.accessed` and `reviewBy`. |
| `missing the managed ... block markers` | Someone deleted the `<!-- tool-pages:start -->` / `<!-- tool-pages:end -->` marker lines in `sitemap.xml`, `llms.txt` or `llms-full.txt`. Restore the pair; the build only writes between them. |
| A fixture test fails after a rate change | Expected. Re-work that fixture by hand to the new rate, same commit (see the update section above). |
| A region is missing from the calculator | Its resale figure is not verified. Check `node tools/validate-legal-data.js --list`; verifying the figure and rebuilding brings the region back. |

Nothing is written until every check passes; a failed run leaves all files
exactly as they were.

## What it deliberately does NOT do

- No reduced rates. Young buyers, VPO, large families, disability and
  depopulation discounts all exist and are recorded in the figures' notes,
  but the calculator only computes each region's general rate.
- Catalunya's 20% rate for large holders and whole-building purchases is
  never calculated. It is surfaced as a caveat on Catalunya resale results,
  and the figure itself sits in the spine for the record.
- No new-build calculation for the Canary Islands, Ceuta or Melilla.
  Mainland IVA does not exist there (IGIC and IPSI instead); the engine
  refuses to apply it rather than compute a wrong number. Their IGIC/IPSI
  figures exist as drafts, and their new-build mode goes live when those are
  verified and the engine gains that branch.
