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
 *
 * v2: relief rules (tools/legal-data/itp-reliefs.js) are validated here too,
 * with the same provenance rules plus relief-specific shape checks: known
 * condition types only, exactly one well-formed result, stacksOn /
 * incompatibleWith ids must exist, byIsland caps only on baleares rules.
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

// --- relief-level checks (v2) ---------------------------------------------------

// Shared provenance rules: dates, source, note, status + the official-source
// gate. Identical discipline for figures and reliefs.
function checkProvenance(r) {
  if (!isIsoDate(r.effectiveFrom)) bad(r, `effectiveFrom "${r.effectiveFrom}" is not a valid ISO date.`);
  if (!isIsoDate(r.reviewBy)) {
    bad(r, `reviewBy "${r.reviewBy}" is not a valid ISO date.`);
  } else if (isIsoDate(r.effectiveFrom) && r.reviewBy <= r.effectiveFrom) {
    bad(r, `reviewBy (${r.reviewBy}) must be after effectiveFrom (${r.effectiveFrom}).`);
  }
  const s = r.source;
  if (!s || typeof s !== 'object') {
    bad(r, 'missing its source - nothing enters the spine without { url, title, accessed }.');
  } else {
    if (!s.url || typeof s.url !== 'string' || !s.url.startsWith('https://')) {
      bad(r, 'source.url must be a non-empty https:// URL.');
    }
    if (!s.title || typeof s.title !== 'string') bad(r, 'source.title is missing.');
    if (!isIsoDate(s.accessed)) bad(r, `source.accessed "${s && s.accessed}" is not a valid ISO date.`);
  }
  if (!r.note || typeof r.note !== 'string' || !r.note.trim()) {
    bad(r, 'missing its note.');
  }
  if ('userNote' in r && (typeof r.userNote !== 'string' || !r.userNote.trim())) {
    bad(r, 'userNote, when present, must be a non-empty string.');
  }
  if (r.status !== 'draft' && r.status !== 'verified') {
    bad(r, `status must be 'draft' or 'verified', got "${r.status}".`);
  }
  const official = s && s.url ? spine.isOfficialSourceUrl(s.url) : false;
  if (r.status === 'verified' && !official) {
    bad(r, `is marked 'verified' but its source (${s && s.url}) is not an official tax-authority host.`);
  }
  return official;
}

function checkBands(r, bands, bandType) {
  if (!Array.isArray(bands) || bands.length < 2) {
    bad(r, 'result bands must be an array of at least 2.');
    return;
  }
  let prev = 0;
  bands.forEach((b, i) => {
    const last = i === bands.length - 1;
    if (last) {
      if (b.upTo !== null) bad(r, `the last result band's upTo must be null, got ${b.upTo}.`);
    } else if (typeof b.upTo !== 'number' || !Number.isFinite(b.upTo) || b.upTo <= prev) {
      bad(r, `result band ${i + 1}: thresholds must be finite and strictly ascending.`);
    } else {
      prev = b.upTo;
    }
    if (typeof b.rate !== 'number' || !Number.isFinite(b.rate) || b.rate < 0 || b.rate > 100) {
      bad(r, `result band ${i + 1}: rate must be between 0 and 100.`);
    }
  });
  if (bandType !== 'marginal' && bandType !== 'whole') {
    bad(r, `banded results need bandType 'marginal' or 'whole', got "${bandType}".`);
  }
}

const reliefs = typeof spine.allReliefs === 'function' ? spine.allReliefs() : [];
const askableTypes = new Set(spine.reliefConditionTypes.askable);
const lawyerRouteTypes = new Set(spine.reliefConditionTypes.lawyerRoute);
const reliefIds = new Set(reliefs.map((r) => r.id));
const reliefDrafts = [];
const pctCap = (r, v, what) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
    bad(r, `${what} must be a number between 0 and 100, got ${v}.`);
  }
};

function checkCondition(r, c) {
  if (!c || typeof c !== 'object') return bad(r, 'condition is not an object.');
  if (Array.isArray(c.anyOf)) {
    if (c.anyOf.length < 2) return bad(r, 'an anyOf group needs at least 2 alternatives.');
    if (Object.keys(c).length !== 1) return bad(r, 'an anyOf group must contain only anyOf.');
    return c.anyOf.forEach((inner) => {
      if (inner && Array.isArray(inner.anyOf)) return bad(r, 'anyOf groups cannot nest.');
      checkCondition(r, inner);
    });
  }
  const t = c.type;
  if (!askableTypes.has(t) && !lawyerRouteTypes.has(t)) {
    return bad(r, `condition type "${t}" is not in the vocabulary (legal-data/index.js reliefConditionTypes).`);
  }
  switch (t) {
    case 'maxAge':
    case 'priorRegionResidenceYears':
    case 'priorHomeSaleWindow':
      if (typeof c.value !== 'number' || !Number.isFinite(c.value) || c.value <= 0) {
        bad(r, `${t} needs a positive numeric value.`);
      }
      break;
    case 'maxIncome':
    case 'maxHouseholdIncome':
    case 'maxSavingsIncome':
      if (typeof c.value !== 'number' || !Number.isFinite(c.value) || c.value <= 0) {
        bad(r, `${t} needs a positive numeric value.`);
      }
      if (!c.basis || typeof c.basis !== 'string' || !c.basis.trim()) {
        bad(r, `${t} needs a basis string - an income cap without its basis misleads.`);
      }
      break;
    case 'maxPropertyValue': {
      const hasVal = typeof c.value === 'number';
      const hasIsland = c.byIsland && typeof c.byIsland === 'object';
      if (hasVal === hasIsland) {
        bad(r, 'maxPropertyValue needs exactly one of value or byIsland.');
      }
      if (hasVal && (!Number.isFinite(c.value) || c.value <= 0)) {
        bad(r, 'maxPropertyValue value must be a positive number.');
      }
      if (hasIsland) {
        if (r.region !== 'baleares') bad(r, 'byIsland caps only exist for baleares rules.');
        const keys = Object.keys(c.byIsland);
        if (!keys.length) bad(r, 'byIsland must name at least one island group.');
        for (const k of keys) {
          if (!(k in spine.balearicIslands)) bad(r, `byIsland key "${k}" is not a known island group.`);
          if (typeof c.byIsland[k] !== 'number' || !Number.isFinite(c.byIsland[k]) || c.byIsland[k] <= 0) {
            bad(r, `byIsland["${k}"] must be a positive number.`);
          }
        }
      }
      break;
    }
    case 'disability':
      if (c.value !== null) pctCap(r, c.value, 'disability degree');
      break;
    case 'mortgageLtvMin':
      pctCap(r, c.value, 'mortgageLtvMin');
      break;
    case 'vpoProtectedHousing':
      if (c.value !== true && (typeof c.value !== 'string' || !c.value.trim())) {
        bad(r, 'vpoProtectedHousing value must be true or a sub-regime string.');
      }
      break;
    default:
      // boolean condition types
      if (c.value !== true) bad(r, `${t} value must be true (a relief never conditions on its absence).`);
  }
  if ('inclusive' in c && typeof c.inclusive !== 'boolean') {
    bad(r, `${t}: inclusive, when present, must be a boolean.`);
  }
}

const seenReliefIds = new Set();
for (const r of reliefs) {
  if (!r.id || typeof r.id !== 'string') {
    bad(r, 'missing an id.');
    continue;
  }
  if (seenReliefIds.has(r.id) || seenIds.has(r.id)) bad(r, 'duplicate id - ids must be globally unique.');
  seenReliefIds.add(r.id);
  if (!/^(itp|ajd|igic)\./.test(r.id)) {
    bad(r, 'relief ids must start with "itp.", "ajd." or "igic." (kept verbatim from the research file).');
  }

  if (!r.label || typeof r.label !== 'string') bad(r, 'missing a label.');
  if (!r.region || !(r.region in spine.regions)) {
    bad(r, `region "${r.region}" is not in the canonical region list.`);
  }
  if (!spine.reliefTracks.includes(r.appliesTo)) {
    bad(r, `appliesTo "${r.appliesTo}" must be one of ${spine.reliefTracks.join(' / ')}.`);
  }

  // result - exactly one well-formed shape
  const res = r.result;
  if (!res || typeof res !== 'object' || !['rate', 'deduction', 'exempt'].includes(res.type)) {
    bad(r, "result.type must be 'rate', 'deduction' or 'exempt'.");
  } else if (res.type === 'rate') {
    const hasVal = typeof res.value === 'number';
    const hasBands = 'bands' in res && res.bands != null;
    if (hasVal === hasBands) {
      bad(r, 'a rate result needs exactly one of value or bands.');
    }
    if (hasVal) {
      pctCap(r, res.value, 'rate result value');
      if ('bandCap' in res && (typeof res.bandCap !== 'number' || !Number.isFinite(res.bandCap) || res.bandCap <= 0)) {
        bad(r, 'bandCap must be a positive number.');
      }
    }
    if (hasBands) {
      if ('bandCap' in res) bad(r, 'bandCap and bands cannot combine.');
      checkBands(r, res.bands, res.bandType);
    }
  } else {
    if (res.type === 'deduction') pctCap(r, res.value, 'deduction result value');
    if (res.type === 'exempt' && ('value' in res || 'bands' in res)) {
      bad(r, 'an exempt result carries no value or bands - it means no tax due, full stop.');
    }
    if ('bandCap' in res) bad(r, 'bandCap only makes sense on a rate result.');
  }

  // conditions
  if (!Array.isArray(r.conditions) || r.conditions.length === 0) {
    bad(r, 'needs a non-empty conditions array - an unconditional relief is a standard rate, not a relief.');
  } else {
    r.conditions.forEach((c) => checkCondition(r, c));
  }

  // combination semantics
  if (r.combinesWith !== 'exclusive' && r.combinesWith !== 'cumulative') {
    bad(r, `combinesWith must be 'exclusive' or 'cumulative', got "${r.combinesWith}".`);
  }
  if ('stacksOn' in r) {
    if (r.combinesWith !== 'cumulative' || !res || res.type !== 'deduction') {
      bad(r, 'stacksOn only makes sense on a cumulative deduction.');
    } else if (!Array.isArray(r.stacksOn) || r.stacksOn.length === 0) {
      bad(r, 'stacksOn must be a non-empty array of rule ids (or "standard").');
    } else {
      for (const id of r.stacksOn) {
        if (id !== 'standard' && !reliefIds.has(id)) bad(r, `stacksOn id "${id}" does not exist.`);
      }
    }
  }
  if ('incompatibleWith' in r) {
    if (!Array.isArray(r.incompatibleWith) || r.incompatibleWith.length === 0) {
      bad(r, 'incompatibleWith must be a non-empty array of rule ids.');
    } else {
      for (const id of r.incompatibleWith) {
        if (!reliefIds.has(id)) bad(r, `incompatibleWith id "${id}" does not exist.`);
        if (id === r.id) bad(r, 'a rule cannot be incompatible with itself.');
      }
    }
  }

  checkProvenance(r);
  if (r.status === 'draft') reliefDrafts.push(r);
  if (isIsoDate(r.reviewBy) && r.reviewBy < today) stale.push(r);
}

// --- report -------------------------------------------------------------------

console.log(
  `\n  legal-data spine: ${figures.length} figures across ${domainKeys.length} domain(s) [${domainKeys.join(', ')}]` +
    (reliefs.length ? ` + ${reliefs.length} relief rule(s)` : '')
);

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

if (reliefDrafts.length) {
  console.log(`\n  ${reliefDrafts.length} relief rule(s) awaiting Olivia's verification (status: draft).`);
  if (listMode) {
    console.log("\n  Relief verification worklist - check each against its source, then set status: 'verified':\n");
    for (const r of reliefDrafts) {
      const res = r.result || {};
      const v =
        res.type === 'exempt'
          ? 'exempt (no tax due)'
          : res.type === 'deduction'
            ? `${res.value}% off the quota`
            : res.bands
              ? res.bands.map((b) => `${b.rate}%${b.upTo ? ` to €${b.upTo.toLocaleString('en-GB')}` : ' above'}`).join(', ') + ` (${res.bandType})`
              : `${res.value}%${res.bandCap ? ` on the first €${res.bandCap.toLocaleString('en-GB')}` : ''}`;
      console.log(`   □ ${r.id}  [${r.appliesTo}]`);
      console.log(`     ${v}  effective ${r.effectiveFrom}`);
      console.log(`     ${r.source.url}\n`);
    }
  }
}

if (checkMode && stale.length) {
  console.error(`\n  --check: ${stale.length} stale figure(s). Failing so the staleness gets fixed.\n`);
  process.exit(1);
}

console.log('\n  spine OK.\n');
