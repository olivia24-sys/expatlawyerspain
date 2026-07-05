#!/usr/bin/env node
/*
 * validate-legal-data.js - the gate on the legal-data spine
 * ---------------------------------------------------------------------------
 * Run from the repo root:   node tools/validate-legal-data.js
 * Freshness check (CI/cron): node tools/validate-legal-data.js --check
 * Verification worklist:     node tools/validate-legal-data.js --list
 *
 * What it enforces, figure by figure:
 *   - every required field present and well-formed (see rules below)
 *   - a source URL (https), source title and accessed date - an unsourced
 *     figure CANNOT enter the spine, the run fails
 *   - a review-by date after the effective date
 *   - value XOR bands, band thresholds strictly ascending, last band open
 *   - a figure may only be status 'verified' if its source URL is an
 *     OFFICIAL tax-authority host (officialSourceHosts in legal-data/index.js)
 *
 * Freshness (this IS the content-freshness guard):
 *   - default run: figures past their reviewBy date are listed as STALE
 *     (warning only, exit 0 if otherwise valid)
 *   - --check: stale figures make the run exit 1, so a cron or CI step
 *     can flag them the day they lapse
 *
 * Drafts never fail validation (draft data must be committable). The page
 * build script (build-tool-pages.js) is what refuses to ship drafts.
 * ---------------------------------------------------------------------------
 */

'use strict';

const spine = require('./legal-data/index.js');

const checkMode = process.argv.includes('--check');
const listMode = process.argv.includes('--list');

const errors = [];
const stale = [];
const drafts = [];
const nonOfficialDrafts = [];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function bad(fig, msg) {
  errors.push(`${fig && fig.id ? fig.id : '(figure with no id)'}: ${msg}`);
}

// --- domain-level checks ------------------------------------------------------

const domainKeys = Object.keys(spine.domains);
for (const key of domainKeys) {
  const d = spine.domains[key];
  if (!d || typeof d !== 'object') {
    errors.push(`domain "${key}": does not export an object.`);
    continue;
  }
  if (d.domain !== key) {
    errors.push(`domain "${key}": its "domain" field is "${d.domain}" - they must match.`);
  }
  if (!d.domainLabel || typeof d.domainLabel !== 'string') {
    errors.push(`domain "${key}": missing a domainLabel.`);
  }
  if (!Array.isArray(d.figures) || d.figures.length === 0) {
    errors.push(`domain "${key}": has no figures array.`);
  }
}

// --- figure-level checks ------------------------------------------------------

const figures = spine.allFigures();
const seenIds = new Set();
const today = new Date().toISOString().slice(0, 10);

for (const f of figures) {
  // id
  if (!f.id || typeof f.id !== 'string') {
    bad(f, 'missing an id.');
    continue;
  }
  if (seenIds.has(f.id)) bad(f, 'duplicate id - ids must be globally unique.');
  seenIds.add(f.id);
  if (!f.id.startsWith(f.domain + '.')) {
    bad(f, `id must start with its domain prefix "${f.domain}.".`);
  }

  // label / region / unit
  if (!f.label || typeof f.label !== 'string') bad(f, 'missing a label.');
  if (!f.region || !(f.region in spine.regions)) {
    bad(f, `region "${f.region}" is not in the canonical region list (legal-data/index.js).`);
  }
  if (!f.unit || !spine.units.includes(f.unit)) {
    bad(f, `unit "${f.unit}" is not in the unit list (legal-data/index.js).`);
  }

  // value XOR bands
  const hasValue = 'value' in f && f.value !== undefined && f.value !== null;
  const hasBands = 'bands' in f && f.bands !== undefined && f.bands !== null;
  if (hasValue === hasBands) {
    bad(f, 'must have exactly one of "value" (flat) or "bands" (progressive).');
  }
  if (hasValue) {
    if (typeof f.value !== 'number' || !Number.isFinite(f.value)) {
      bad(f, '"value" must be a finite number.');
    } else if (f.unit === 'percent' && (f.value < 0 || f.value > 100)) {
      bad(f, 'a percent value must be between 0 and 100.');
    }
  }
  if (hasBands) {
    if (!Array.isArray(f.bands) || f.bands.length < 2) {
      bad(f, '"bands" must be an array of at least 2 bands (a single band is a flat value).');
    } else {
      let prev = 0;
      f.bands.forEach((b, i) => {
        const last = i === f.bands.length - 1;
        if (last) {
          if (b.upTo !== null) bad(f, `the last band's upTo must be null (open-ended), got ${b.upTo}.`);
        } else if (typeof b.upTo !== 'number' || !Number.isFinite(b.upTo) || b.upTo <= prev) {
          bad(f, `band ${i + 1}: thresholds must be finite and strictly ascending (upTo ${b.upTo} after ${prev}).`);
        } else {
          prev = b.upTo;
        }
        if (typeof b.rate !== 'number' || !Number.isFinite(b.rate) || b.rate < 0 || b.rate > 100) {
          bad(f, `band ${i + 1}: rate must be a finite number between 0 and 100, got ${b.rate}.`);
        }
      });
    }
    if (f.bandType !== 'marginal' && f.bandType !== 'whole') {
      bad(f, `banded figures need bandType 'marginal' or 'whole', got "${f.bandType}".`);
    }
  } else if (f.bandType) {
    bad(f, 'bandType only makes sense on a banded figure.');
  }

  // dates
  if (!isIsoDate(f.effectiveFrom)) bad(f, `effectiveFrom "${f.effectiveFrom}" is not a valid ISO date.`);
  if (!isIsoDate(f.reviewBy)) {
    bad(f, `reviewBy "${f.reviewBy}" is not a valid ISO date.`);
  } else if (isIsoDate(f.effectiveFrom) && f.reviewBy <= f.effectiveFrom) {
    bad(f, `reviewBy (${f.reviewBy}) must be after effectiveFrom (${f.effectiveFrom}).`);
  }

  // source - THE rule. No source, no entry.
  const s = f.source;
  if (!s || typeof s !== 'object') {
    bad(f, 'missing its source - a figure cannot enter the spine without { url, title, accessed }.');
  } else {
    if (!s.url || typeof s.url !== 'string' || !s.url.startsWith('https://')) {
      bad(f, 'source.url must be a non-empty https:// URL.');
    }
    if (!s.title || typeof s.title !== 'string') bad(f, 'source.title is missing.');
    if (!isIsoDate(s.accessed)) bad(f, `source.accessed "${s && s.accessed}" is not a valid ISO date.`);
  }

  // note
  if (!f.note || typeof f.note !== 'string' || !f.note.trim()) {
    bad(f, 'missing its note - say what the figure is, what changed, and any edge cases.');
  }
  if ('userNote' in f && (typeof f.userNote !== 'string' || !f.userNote.trim())) {
    bad(f, 'userNote, when present, must be a non-empty string.');
  }

  // status + the official-source rule
  if (f.status !== 'draft' && f.status !== 'verified') {
    bad(f, `status must be 'draft' or 'verified', got "${f.status}".`);
  }
  const official = s && s.url ? spine.isOfficialSourceUrl(s.url) : false;
  if (f.status === 'verified' && !official) {
    bad(
      f,
      `is marked 'verified' but its source (${s && s.url}) is not an official tax-authority host. ` +
        'Only AEAT / regional hacienda pages verify a figure. Re-source it, or add the official host to officialSourceHosts in legal-data/index.js if a region is genuinely missing.'
    );
  }
  if (f.status === 'draft') {
    drafts.push(f);
    if (s && s.url && !official) nonOfficialDrafts.push(f);
  }

  // freshness
  if (isIsoDate(f.reviewBy) && f.reviewBy < today) stale.push(f);
}

// --- report -------------------------------------------------------------------

console.log(`\n  legal-data spine: ${figures.length} figures across ${domainKeys.length} domain(s) [${domainKeys.join(', ')}]`);

if (errors.length) {
  console.error('\n  REJECTED - fix these before the spine can be used:\n');
  for (const e of errors) console.error('   ✗ ' + e);
  console.error(`\n  ${errors.length} error(s).\n`);
  process.exit(1);
}

if (stale.length) {
  console.log('\n  STALE - past their review-by date, re-check against the source:\n');
  for (const f of stale) {
    console.log(`   ! ${f.id}  (review by ${f.reviewBy})  ${f.source.url}`);
  }
}

if (nonOfficialDrafts.length) {
  console.log('\n  NON-OFFICIAL SOURCE - these drafts cite a secondary site and need an official source before they can ever be verified:\n');
  for (const f of nonOfficialDrafts) console.log(`   ! ${f.id}  ${f.source.url}`);
}

if (drafts.length) {
  console.log(`\n  ${drafts.length} figure(s) awaiting Olivia's verification (status: draft).`);
  if (listMode) {
    console.log('\n  Verification worklist - check each against its source, then set status: \'verified\':\n');
    for (const f of drafts) {
      const v = f.bands
        ? f.bands.map((b) => `${b.rate}%${b.upTo ? ` to €${b.upTo.toLocaleString('en-GB')}` : ' above'}`).join(', ') + ` (${f.bandType})`
        : `${f.value}${f.unit === 'percent' ? '%' : ' ' + f.unit}`;
      console.log(`   □ ${f.id}`);
      console.log(`     ${v}  effective ${f.effectiveFrom}`);
      console.log(`     ${f.source.url}\n`);
    }
  }
}

if (checkMode && stale.length) {
  console.error(`\n  --check: ${stale.length} stale figure(s). Failing so the staleness gets fixed.\n`);
  process.exit(1);
}

console.log('\n  spine OK.\n');
