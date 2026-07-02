# Money pages (specialty pillar pages) — how they work

*(Blog listing pages have their own notes: `tools/FABLE-NOTES.md`. Different
generator, different surface — don't mix them up.)*

## What this is

The "money pages" are the directory-style landing pages that target the
searches with commercial intent — currently the 4 national specialty pillars:

- `/immigration-lawyers-spain`
- `/property-lawyers-spain`
- `/tax-lawyers-spain`
- `/wills-inheritance-lawyers-spain`

Each page carries a **live firm table** (every verified firm listed for that
specialty, with coverage, languages and Google rating), specific legal facts,
a "when do you actually need a lawyer?" section, a link to `/how-we-verify`,
and cluster links (sibling pillars, the `/lawyers` filters, related guides).

Two files make them:

- **`money-pages-data.js`** — the approved page list plus each page's copy.
  This is the only file you edit.
- **`build-money-pages.js`** — reads that file **and the live `lawyers.html`
  listings**, then rewrites the pages and keeps `sitemap.xml`, `llms.txt`,
  `llms-full.txt` and the `/lawyers` sidebar links in sync.

The firm tables are **not** stored anywhere — they are rebuilt from
`lawyers.html` every run. Remove a firm from `/lawyers`, re-run the script,
and it disappears from every money page too. No frozen snapshots.

## How to run it

From the repo root (the `website` folder):

```
node tools/build-money-pages.js
```

To see what *would* change without writing anything:

```
node tools/build-money-pages.js --check
```

(Node only, no npm install, no dependencies.)

**Run it whenever a firm is added to or removed from `lawyers.html`** — that's
what keeps the firm tables honest. It's safe to run any time; if nothing
changed it says "no change" on every line.

## How to add a new money page (e.g. a city page, later)

> Only add pages on the approved list in `decisions.md`. The whole point of
> this setup is that it can't mass-produce thin pages.

1. Open `tools/money-pages-data.js` and copy an existing entry in `pages`.
2. Give it a `slug` (the URL), the `specialty` it filters firms by, a title
   (keep it ≤ 60 characters), meta description, and the content sections —
   written in the brand voice (`els-brand-voice.md`), with real facts, real
   numbers, real form names. No boilerplate.
3. Run `node tools/build-money-pages.js`.
4. Commit and push. The sitemap, `llms.txt`, `llms-full.txt` and the
   `/lawyers` sidebar update themselves.

A city page will additionally need the script to filter firms by
`data-city` as well as `data-specialty` — that's a ~5-line change in
`build-money-pages.js` where it does `firms.filter(...)`; the data file
would gain a `city` field on the page entry.

## The safety rails (why the script sometimes refuses)

- **`page … has only N verified firm(s) … minimum 2`** — the page's specialty
  no longer has 2+ firms on `/lawyers`. The page is deliberately NOT built:
  below 2 firms it would be a thin stub, and that search intent should route
  to the enquiry form instead. Don't lower the threshold; add firms.
- **`only found N firm cards in lawyers.html`** — the `/lawyers` card markup
  changed shape and the parser no longer recognises it. Fix the parser
  (`parseFirms()` in `build-money-pages.js`), don't work around it.
- **`missing the managed … block markers`** — someone deleted the
  `<!-- money-pages:… -->` comment markers in `sitemap.xml`, `llms.txt`,
  `llms-full.txt` or `lawyers.html`. Restore the pair of marker lines; the
  script only ever writes between them.

Nothing is written until every check passes — a failed run leaves all files
exactly as they were.

## What it deliberately does NOT do

- It never builds a page that isn't in `money-pages-data.js` (approved list
  only — never "all combinations").
- It never touches blog posts, blog listing pages, the homepage, URLs, slugs
  or any SEO tag outside its own pages and marker blocks.
- It never invents firm data — everything in the firm tables comes from
  `lawyers.html` at the moment you run it.

## Sanity checks

- Run it twice: the second run must say `no change` everywhere. If it doesn't,
  someone hand-edited a generated page — let the script win and check the diff.
- `git diff` before pushing shows exactly what changed.
- After deploy, the pages are at `expatlawyerspain.com/<slug>` (clean URLs,
  no `.html`, same as the rest of the site).
