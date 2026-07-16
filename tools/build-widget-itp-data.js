#!/usr/bin/env node
/*
 * build-widget-itp-data.js - generates the verified-only ITP spine slice
 * for the embeddable widget (widgets/v1/itp-calculator).
 * ---------------------------------------------------------------------------
 * Run from the repo root:   node tools/build-widget-itp-data.js
 * Check only (no writing):  node tools/build-widget-itp-data.js --check
 *
 * This mirrors the verified-only gate in tools/build-tool-pages.js exactly,
 * reusing the same spine APIs (tools/legal-data/index.js) - but unlike that
 * script, this one has NO --allow-draft mode at all. The widget module ships
 * to third-party sites embedding the calculator; it must never be able to
 * carry a draft figure or relief rule, even for local preview.
 *
 * What it does, in order:
 *   1. Runs tools/validate-legal-data.js - a spine that fails validation
 *      never reaches the widget.
 *   2. Loads the legal-data spine and keeps VERIFIED figures and reliefs
 *      only (same filter as build-tool-pages.js's production path).
 *   3. Belt-and-braces: scans the built embed object for any non-verified
 *      status before writing anything, and refuses if found.
 *   4. Writes widgets/v1/itp-calculator-data.js: a plain external JS module
 *      that sets window.ELS_LEGAL_DATA_ITP (the spine slice) and
 *      window.ELS_ITP_COPY (the refine/relief copy from tool-pages-data.js).
 *
 * No figure is ever hardcoded here: everything comes from tools/legal-data/.
 * See tools/TOOLS-NOTES.md for the guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const toolPagesData = require('./tool-pages-data.js');
const spine = require('./legal-data/index.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'widgets', 'v1', 'itp-calculator-data.js');

const checkOnly = process.argv.includes('--check');

function die(msg) {
  console.error('\n  ERROR: ' + msg + '\n');
  process.exit(1);
}

// This module never carries drafts, under any flag - not even for local
// preview. Refuse loudly rather than silently ignoring the flag.
if (process.argv.includes('--allow-draft')) {
  die(
    'the widget ITP data module never carries drafts, so --allow-draft is not ' +
      'supported here. Use tools/build-tool-pages.js --allow-draft to preview ' +
      'draft figures on the site pages instead.'
  );
}

// --- 1. validate the spine, then load the shippable (verified-only) figures --

try {
  execFileSync('node', [path.join(__dirname, 'validate-legal-data.js')], { stdio: 'pipe' });
} catch (e) {
  die('the legal-data spine failed validation - fix it first:\n' + (e.stdout || '') + (e.stderr || ''));
}

const allItp = spine.allFigures().filter((f) => f.domain === 'itp');
const shippable = allItp.filter((f) => f.status === 'verified');

const allItpReliefs = spine.allReliefs().filter((r) => r.domain === 'itp');
const shippableReliefs = allItpReliefs.filter((r) => r.status === 'verified');

// Strip the internal maintenance note (and domain, which is a spine-side
// bookkeeping field) before anything reaches the widget.
function publicFigure(f) {
  const { note, domain, ...pub } = f;
  return pub;
}
function publicRelief(r) {
  const { note, domain, ...pub } = r;
  return pub;
}

function fig(id) {
  return shippable.find((f) => f.id === id) || null;
}

// Regions offered = regions with a shippable (verified) resale figure, in
// label order.
const availableRegions = Object.keys(spine.regions)
  .filter((r) => fig(`itp.${r}.resale`))
  .sort((a, b) => spine.regions[a].localeCompare(spine.regions[b]));

if (availableRegions.length === 0) {
  die(
    'no VERIFIED ITP resale figures yet, so there is nothing the widget may ship. ' +
      'Olivia flips figures draft -> verified in tools/legal-data/itp.js after checking ' +
      'each official source. This generator never falls back to drafts - there is no ' +
      '--allow-draft mode for the widget data module.'
  );
}

const embeddedRegions = {};
for (const r of availableRegions) embeddedRegions[r] = spine.regions[r];

const embedded = {
  regions: embeddedRegions,
  figures: shippable
    .filter((f) => f.region === 'national' || availableRegions.includes(f.region))
    .map(publicFigure),
  reliefs: shippableReliefs
    .filter((r) => availableRegions.includes(r.region))
    .map(publicRelief),
};
// No draftPreview flag exists in this generator's output, ever.

// --- 2. hard no-draft refusal (belt-and-braces, beyond the filter above) -----

const nonVerified = [...embedded.figures, ...embedded.reliefs].filter((x) => x.status !== 'verified');
if (nonVerified.length > 0) {
  die(
    `belt-and-braces check failed: ${nonVerified.length} embedded entr${
      nonVerified.length === 1 ? 'y is' : 'ies are'
    } not status "verified" (${nonVerified.map((x) => `${x.id}:${x.status}`).join(', ')}). ` +
      'This must never happen - the filters above should have already excluded them. Refusing to write.'
  );
}

// --- 3. refine copy (the personalisation UI text) ----------------------------

const refine = toolPagesData.pages && toolPagesData.pages.itp && toolPagesData.pages.itp.refine;
if (!refine) {
  die('tools/tool-pages-data.js is missing pages.itp.refine - the widget needs that copy block.');
}

// --- 4. build the output module -----------------------------------------------

// </ escaped so figure/copy text can never terminate the script block.
const embedJson = JSON.stringify(embedded).replace(/</g, '\\u003c');
const refineJson = JSON.stringify(refine).replace(/</g, '\\u003c');

const body = `/* AUTO-GENERATED by tools/build-widget-itp-data.js — do not edit by hand.
 * Verified-only ITP spine slice + refine copy for the embeddable widget
 * (widgets/v1/itp-calculator). Regenerate: node tools/build-widget-itp-data.js
 * Drift check: node tools/build-widget-itp-data.js --check
 */
window.ELS_LEGAL_DATA_ITP = ${embedJson};
window.ELS_ITP_COPY = ${refineJson};
`;

// --- 5. write / check ----------------------------------------------------------

function main() {
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  const rel = path.relative(ROOT, OUT);

  console.log(
    `  spine: ${allItp.length} ITP figures, ${shippable.length} verified, ${availableRegions.length} region(s): ${availableRegions.join(', ')}`
  );
  console.log(
    `  reliefs: ${allItpReliefs.length} ITP relief rules, ${embedded.reliefs.length} verified and region-available (embedded)`
  );
  console.log(`  embedded: ${embedded.figures.length} figures, ${embedded.reliefs.length} reliefs`);

  if (prev === body) {
    console.log(`  =  ${rel} (no change)`);
    return;
  }

  if (checkOnly) {
    console.log(`  ~  ${rel} WOULD CHANGE`);
    process.exit(1);
  }

  fs.writeFileSync(OUT, body);
  console.log(`  +  ${rel} written`);
}

main();
