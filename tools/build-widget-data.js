#!/usr/bin/env node
/*
 * build-widget-data.js - generates the public read-API dataset for embeds.
 * ---------------------------------------------------------------------------
 * Run from the repo root:   node tools/build-widget-data.js
 * Check only (no writing):  node tools/build-widget-data.js --check
 *
 * Reads the LIVE firm listings by parsing lawyers.html (via the shared
 * tools/lib/parse-firms.js - the same source of truth the money pages use)
 * and writes functions/_lib/widget-firms-data.js, the data module served by
 * the /v1 read-only API (functions/v1/[[path]].js).
 *
 * THE NO-PII RULE IS STRUCTURAL AND BELT-AND-BRACES:
 *   - structural: lawyers.html contains only public directory copy, and this
 *     script copies nothing but the allowlisted fields below;
 *   - belt-and-braces: before writing, the serialised dataset is scanned for
 *     email- and phone-shaped strings and the build FAILS if any is found.
 * Firm contact emails live only in D1 and can never reach this module.
 *
 * Versioning:
 *   - dataset_version = sha256 of the canonical dataset JSON (first 12 hex).
 *   - generated_at is stamped ONLY when the content hash changes, so the
 *     script is idempotent and --check has no false drift.
 *
 * Directory content changes (firms added/removed/edited) are data, not
 * contract: re-run this script after any lawyers.html change (same habit as
 * build-money-pages.js - both are on the publish checklist).
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFirms } = require('./lib/parse-firms.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'functions', '_lib', 'widget-firms-data.js');
const SITE = 'https://expatlawyerspain.com';

const checkOnly = process.argv.includes('--check');

function die(msg) {
  console.error('\n  ERROR: ' + msg + '\n');
  process.exit(1);
}

// lawyers.html text is HTML-escaped in source; the JSON API ships plain text.
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Same slug algorithm as build-money-pages.js slugId() - one identifier style
// across the repo.
function slugId(text) {
  return String(text)
    .toLowerCase()
    .replace(/&amp;|&/g, 'and')
    .replace(/[’'"()：:,.?]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- build the dataset (field allowlist - nothing else can pass) -------------

function buildDataset() {
  const firms = parseFirms({ root: ROOT, die }).map((f) => {
    const name = decodeEntities(f.name);
    return {
      slug: slugId(f.name),
      name,
      location: decodeEntities(f.location),
      cities: f.cities,
      specialties: f.specialties,
      languages: f.langs,
      languages_text: decodeEntities(f.langsText),
      description: decodeEntities(f.desc),
      rating: f.rating ? { score: Number(f.rating.score), count: Number(f.rating.count) } : null,
      verified: f.verified,
      directory_url: `${SITE}/lawyers`,
      // The href is HTML-escaped in source (&amp;); a JSON API must ship the
      // real URL or the second query param would parse as "amp;city".
      enquiry_url: SITE + decodeEntities(f.enquiry),
    };
  });

  const uniqueSorted = (xs) => Array.from(new Set(xs)).sort();
  const dataset = {
    firms,
    cities: uniqueSorted(firms.flatMap((f) => f.cities)),
    specialties: uniqueSorted(firms.flatMap((f) => f.specialties)),
    languages: uniqueSorted(firms.flatMap((f) => f.languages)),
  };

  const slugs = new Set(dataset.firms.map((f) => f.slug));
  if (slugs.size !== dataset.firms.length) die('duplicate firm slugs in the dataset - two firms slugify identically.');

  return dataset;
}

// --- belt-and-braces PII scan ------------------------------------------------

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
// 9+ digit runs allowing typical phone separators - long enough to skip
// ratings, counts and years.
const PHONE_RE = /\+?\d[\d\s().\-]{7,}\d/;

function scanForPII(json) {
  if (EMAIL_RE.test(json)) die(`PII scan failed: an email-shaped string is in the dataset (${json.match(EMAIL_RE)[0]}).`);
  const phone = json.match(PHONE_RE);
  if (phone) die(`PII scan failed: a phone-shaped string is in the dataset (${phone[0]}).`);
}

// --- write (idempotent; generated_at only moves when content moves) ----------

function main() {
  const dataset = buildDataset();
  const canonical = JSON.stringify(dataset);
  scanForPII(canonical);

  const hash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 12);

  let prevHash = null;
  let prevGeneratedAt = null;
  if (fs.existsSync(OUT)) {
    const prev = fs.readFileSync(OUT, 'utf8');
    prevHash = (prev.match(/dataset_version: '([0-9a-f]{12})'/) || [])[1] || null;
    prevGeneratedAt = (prev.match(/generated_at: '([^']+)'/) || [])[1] || null;
  }

  if (prevHash === hash) {
    console.log(`  =  ${path.relative(ROOT, OUT)} (no change, dataset ${hash})`);
    return;
  }

  if (checkOnly) {
    console.error(`  ~  ${path.relative(ROOT, OUT)} WOULD CHANGE (dataset ${prevHash || 'none'} -> ${hash})`);
    console.error('\n  Run: node tools/build-widget-data.js\n');
    process.exit(1);
  }

  const generatedAt = new Date().toISOString();
  const body = `// GENERATED by tools/build-widget-data.js - DO NOT EDIT BY HAND.
// Source of truth: lawyers.html (via tools/lib/parse-firms.js).
// Public directory data only - the generator PII-scans every build.
// eslint-disable-next-line
export const DATASET = {
  dataset_version: '${hash}',
  generated_at: '${generatedAt}',
  data: ${JSON.stringify(dataset, null, 2)},
};
`;
  fs.writeFileSync(OUT, body);
  console.log(`  W  ${path.relative(ROOT, OUT)} (${dataset.firms.length} firms, dataset ${hash}, was ${prevHash || 'none'}${prevGeneratedAt ? `, prev stamp ${prevGeneratedAt}` : ''})`);
}

main();
