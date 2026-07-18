#!/usr/bin/env node
/*
 * build-widget-visa-data.js - generates the verified-only visa-eligibility
 * spine slice + copy for the embeddable widget (widgets/v1/visa-checker).
 * ---------------------------------------------------------------------------
 * Run from the repo root:   node tools/build-widget-visa-data.js
 * Check only (no writing):  node tools/build-widget-visa-data.js --check
 * Local screenshot preview:  node tools/build-widget-visa-data.js --draft-local
 *
 * This is the visa-checker counterpart of tools/build-widget-itp-data.js and
 * reuses the same spine APIs (tools/legal-data/index.js) and the exact embed
 * shape that tools/build-tool-pages.js writes for the standalone
 * /spain-visa-checker page, so the frame and the page evaluate identically.
 *
 * WHAT IT WRITES: widgets/v1/visa-checker-data.js - a plain external JS module
 * that sets window.ELS_ELIGIBILITY_VISA (the shippable rule slice + the income
 * figures those rules reference + conditionTypes + nationalityGroups) and
 * window.ELS_VISA_COPY (the checker copy deck from tool-pages-data.js).
 *
 * DRAFT DISCIPLINE (the whole point):
 *   - The DEFAULT build embeds VERIFIED rules and figures only, exactly like
 *     the ITP widget module. A rule ships only via
 *     ELSEligibility.isRuleShippable (rule + every criterion + every referenced
 *     figure verified). With nothing verified yet it writes an EMPTY rule set
 *     (rules: []), which the frame renders as the honest "no routes yet" empty
 *     state - never a draft "you qualify". Unlike the ITP module it does not
 *     die on empty, because the visa checker is designed to launch route by
 *     route as Olivia verifies; an empty-but-valid module is a legitimate
 *     interim state and avoids a 404 on the frame's data <script>.
 *   - --draft-local writes ALL rules with draftPreview: true, for LOCAL
 *     cross-origin screenshot testing ONLY. It is never committed and never
 *     deployed: tools/test/widget-framework.test.mjs fails if a committed
 *     visa-checker-data.js carries draftPreview or any non-verified status.
 *     After a preview screenshot, delete the file (it rebuilds at verification).
 *   - There is deliberately NO --allow-draft alias; the flag is named
 *     --draft-local so no one confuses it with a shippable build.
 *
 * No figure is ever hardcoded here: everything comes from tools/legal-data/.
 * See tools/VISA-ENGINE-NOTES.md for the guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const toolPagesData = require('./tool-pages-data.js');
const spine = require('./legal-data/index.js');
const eligibilityEngine = require('../js/eligibility-engine.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'widgets', 'v1', 'visa-checker-data.js');

const checkOnly = process.argv.includes('--check');
const draftLocal = process.argv.includes('--draft-local');

function die(msg) {
  console.error('\n  ERROR: ' + msg + '\n');
  process.exit(1);
}

if (process.argv.includes('--allow-draft')) {
  die(
    'there is no --allow-draft here. A shippable widget module never carries ' +
      'drafts. For a LOCAL screenshot preview only, use --draft-local (it writes ' +
      'draftPreview: true and must never be committed or deployed).'
  );
}

// --- 1. validate the spine, then load the shippable rules --------------------

try {
  execFileSync('node', [path.join(__dirname, 'validate-legal-data.js')], { stdio: 'pipe' });
} catch (e) {
  die('the legal-data spine failed validation - fix it first:\n' + (e.stdout || '') + (e.stderr || ''));
}

// Strip the internal note/domain, mirroring build-tool-pages.js exactly.
function publicFigure(f) {
  const { note, domain, ...pub } = f;
  return pub;
}
function publicCriterion(c) {
  if (c && Array.isArray(c.anyOf)) return { ...c, anyOf: c.anyOf.map(publicCriterion) };
  const { note, ...pub } = c;
  return pub;
}
function publicEligibilityRule(r) {
  const { note, domain, criteria, ...pub } = r;
  return { ...pub, criteria: (criteria || []).map(publicCriterion) };
}

const allIncomeRefFigures = spine.allFigures().filter((f) => f.domain === 'income-refs');
const allVisaRules = spine.allEligibilityRules().filter((r) => r.domain === 'visa');

const incomeRefsById = {};
for (const f of allIncomeRefFigures) incomeRefsById[f.id] = f;

// Verified-only unless --draft-local. isRuleShippable is the single source of
// truth (rule + every criterion + every referenced figure verified) - never
// reimplemented here.
const shippableVisaRules = draftLocal
  ? allVisaRules
  : allVisaRules.filter((r) => eligibilityEngine.isRuleShippable(r, incomeRefsById));

// Only the income-reference figures actually referenced by a shipping rule's
// criteria (anyOf leaves included, and display figures like the Blue Card INE
// figure, which carry figureId too) are embedded - never the whole domain.
function visaLeafCriteria(rule) {
  const out = [];
  (rule.criteria || []).forEach((c) => {
    if (c && Array.isArray(c.anyOf)) c.anyOf.forEach((l) => out.push(l));
    else out.push(c);
  });
  return out;
}
const usedIncomeRefIds = new Set();
for (const r of shippableVisaRules) {
  for (const c of visaLeafCriteria(r)) {
    if (c && c.figureId) usedIncomeRefIds.add(c.figureId);
  }
}
const shippableIncomeRefFigures = allIncomeRefFigures.filter((f) => usedIncomeRefIds.has(f.id));

const embedded = {
  rules: shippableVisaRules.map(publicEligibilityRule),
  figures: shippableIncomeRefFigures.map(publicFigure),
  conditionTypes: spine.eligibilityConditionTypes,
  nationalityGroups: spine.nationalityGroups,
};
if (draftLocal) embedded.draftPreview = true;

// --- 2. hard no-draft refusal (belt-and-braces) unless --draft-local ---------

if (!draftLocal) {
  const nonVerified = [];
  embedded.rules.forEach((r) => {
    if (r.status !== 'verified') nonVerified.push(`${r.id}:${r.status}`);
    visaLeafCriteria(r).forEach((c) => {
      if (c && c.status !== 'verified') nonVerified.push(`${c.id}:${c.status}`);
    });
  });
  embedded.figures.forEach((f) => {
    if (f.status !== 'verified') nonVerified.push(`${f.id}:${f.status}`);
  });
  if (nonVerified.length > 0) {
    die(
      `belt-and-braces check failed: ${nonVerified.length} embedded entr${
        nonVerified.length === 1 ? 'y is' : 'ies are'
      } not status "verified" (${nonVerified.join(', ')}). ` +
        'The isRuleShippable filter should have excluded them. Refusing to write.'
    );
  }
}

// --- 3. copy (the checker copy deck) -----------------------------------------

const visaPage = toolPagesData.pages && toolPagesData.pages.visa;
const checker = visaPage && visaPage.checker;
if (!checker) {
  die('tools/tool-pages-data.js is missing pages.visa.checker - the widget needs that copy block.');
}

// --- 4. build the output module ----------------------------------------------

// </ escaped so rule/copy text can never terminate the script block.
const embedJson = JSON.stringify(embedded).replace(/</g, '\\u003c');
const copyJson = JSON.stringify({ checker }).replace(/</g, '\\u003c');

const banner = draftLocal
  ? `/* !!! DRAFT-LOCAL PREVIEW BUILD (draftPreview: true) - NOT SHIPPABLE. !!!
 * Built with --draft-local for a LOCAL cross-origin screenshot only. It
 * embeds UNVERIFIED draft rules. DELETE this file before committing; the
 * widget-framework test suite fails if a committed copy carries draftPreview.
 */\n`
  : `/* AUTO-GENERATED by tools/build-widget-visa-data.js - do not edit by hand.
 * Verified-only visa-eligibility spine slice + copy for the embeddable widget
 * (widgets/v1/visa-checker). Regenerate: node tools/build-widget-visa-data.js
 * Drift check: node tools/build-widget-visa-data.js --check
 */\n`;

const body = `${banner}window.ELS_ELIGIBILITY_VISA = ${embedJson};
window.ELS_VISA_COPY = ${copyJson};
`;

// --- 5. write / check --------------------------------------------------------

function main() {
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  const rel = path.relative(ROOT, OUT);

  console.log(
    `  visas: ${allVisaRules.length} visa rules, ${shippableVisaRules.length} ${
      draftLocal ? 'embedded (DRAFT-LOCAL PREVIEW - not shippable)' : 'shippable (verified only)'
    }`
  );
  console.log(`  embedded: ${embedded.rules.length} rules, ${embedded.figures.length} income figure(s)`);
  if (!draftLocal && embedded.rules.length === 0) {
    console.log('  note: 0 verified visas - writing the honest empty module (the frame shows the "no routes yet" state).');
  }

  if (prev === body) {
    console.log(`  =  ${rel} (no change)`);
    return;
  }
  if (checkOnly) {
    console.log(`  ~  ${rel} WOULD CHANGE`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, body);
  console.log(`  +  ${rel} written${draftLocal ? ' (DRAFT-LOCAL - delete before committing)' : ''}`);
}

main();
