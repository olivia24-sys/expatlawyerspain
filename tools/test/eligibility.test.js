/*
 * eligibility.test.js - the visa/eligibility engine's correctness invariants
 * Run all tests from the repo root:   node --test tools/test/
 *
 * What is pinned here, in order of importance:
 *   1. NO FALSE POSITIVE: a missing or unknown answer can never produce
 *      'eligible'. Proven by an exhaustive tri-state sweep over the real
 *      digital-nomad rule against an independent naive oracle written from
 *      the spec (not from the engine).
 *   2. Draft gating at both layers: draft rules/criteria/figures are never
 *      evaluated in production mode; a verified rule is held back by one
 *      draft criterion or one draft figure.
 *   3. The nationality gate: nothing is asked and nothing is hinted before
 *      nationality; EEA/Swiss short-circuits to 'not-needed'; UK is a third
 *      country (post-Brexit) and never inherits the EEA path.
 *   4. Lawyer-route conditions cap a rule at 'need-more-info' forever.
 *   5. Threshold maths to the cent, dependant uplifts included, and the
 *      hand-worked boundary fixtures in fixtures/visa-fixtures.js.
 *   6. One rejecting validator case per new eligibility validation rule.
 *
 * These prove the ENGINE. They do not prove the visa rules match real law -
 * that is Olivia's draft-to-verified pass against the official sources.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const E = require('../../js/eligibility-engine.js');
const spine = require('../legal-data/index.js');
const fx = require('./fixtures/visa-fixtures.js');

const DRAFTS = { includeDrafts: true };

function realData() {
  return {
    rules: spine.allEligibilityRules(),
    figures: spine.allFigures(),
    conditionTypes: spine.eligibilityConditionTypes,
  };
}

function synthData(rules, figures) {
  return {
    rules: rules,
    figures: figures || fx.testFigures,
    conditionTypes: fx.conditionTypes,
  };
}

function resultFor(res, visaId) {
  const r = res.results.find((x) => x.id === visaId);
  assert.ok(r, `no result for ${visaId}`);
  return r;
}

// --- 5 + fixtures: hand-worked scenarios against the real spine ------------------

for (const s of fx.scenarios) {
  test(`scenario: ${s.name}`, () => {
    const res = E.checkEligibility(realData(), s.answers, DRAFTS);
    assert.equal(res.ok, true);
    const r = resultFor(res, s.visa);
    assert.equal(r.outcome, s.expected.outcome);
    if (s.expected.missing) assert.deepEqual(r.missingInputs, s.expected.missing);
    if (s.expected.failed) assert.deepEqual(r.failed, s.expected.failed);
  });
}

// --- 1: the no-false-positive sweep ------------------------------------------------
/*
 * Exhaustively enumerate tri-state answer combinations for the real
 * digital-nomad rule: every relevant answer key takes a satisfying value, a
 * failing value, or is absent. 3^9 = 19,683 combinations. For each, an
 * independent naive oracle (written from the visa's documented requirements,
 * not from the engine) computes the expected outcome; the engine must agree
 * exactly. In particular: 'eligible' requires every AND-entry to be
 * EXPLICITLY satisfied - no combination with a decisive answer missing may
 * ever come out eligible.
 */
test('no-false-positive sweep: DNV, 3^9 tri-state combinations vs naive oracle', () => {
  const data = realData();
  // [satisfying, failing, absent] per answer key
  const axes = {
    remoteEmployeeOfForeignCompany: [true, false, undefined],
    spanishClientsSharePercent: [20, 21, undefined],
    employmentRelationshipMonths: [3, 2, undefined],
    universityDegree: [true, false, undefined],
    professionalExperienceYears: [3, 2, undefined],
    monthlyIncome: [3663, 2441.99, undefined], // 3,663 covers up to 2 dependants
    dependants: [0, 2, undefined], // both real values can satisfy with income 3,663
    healthInsurance: [true, false, undefined],
    cleanCriminalRecord: [true, false, undefined],
  };
  const keys = Object.keys(axes);

  // The naive oracle, straight from the spec. Tri-state per criterion:
  // 'y' | 'n' | 'u'.
  function oracle(a) {
    const tri = (v) => (v === true ? 'y' : v === false ? 'n' : 'u');
    const num = (v, min) => (typeof v !== 'number' ? 'u' : v >= min ? 'y' : 'n');
    const numMax = (v, max) => (typeof v !== 'number' ? 'u' : v <= max ? 'y' : 'n');
    const anyOf = (parts) => (parts.includes('y') ? 'y' : parts.includes('u') ? 'u' : 'n');

    // income: floor 2,442.00; bar 2,442 + 915.75 (first) + 305.25 each further
    let income;
    if (typeof a.monthlyIncome !== 'number') income = 'u';
    else if (a.monthlyIncome < 2442) income = 'n';
    else if (typeof a.dependants !== 'number') income = 'u';
    else {
      const bar = 2442 + (a.dependants >= 1 ? 915.75 : 0) + (a.dependants > 1 ? 305.25 * (a.dependants - 1) : 0);
      income = a.monthlyIncome >= bar ? 'y' : 'n';
    }

    const entries = [
      anyOf([tri(a.remoteEmployeeOfForeignCompany), numMax(a.spanishClientsSharePercent, 20)]),
      num(a.employmentRelationshipMonths, 3),
      anyOf([tri(a.universityDegree), num(a.professionalExperienceYears, 3)]),
      income,
      tri(a.healthInsurance),
      tri(a.cleanCriminalRecord),
    ];
    if (entries.includes('n')) return 'not-eligible';
    if (entries.includes('u')) return 'need-more-info';
    return 'eligible';
  }

  let combos = 0;
  let eligibleCount = 0;
  const counters = new Array(keys.length).fill(0);
  for (;;) {
    const answers = { nationality: 'uk' };
    keys.forEach((k, i) => {
      const v = axes[k][counters[i]];
      if (v !== undefined) answers[k] = v;
    });

    const res = E.checkEligibility(data, answers, DRAFTS);
    const r = res.results.find((x) => x.id === 'visa.digital-nomad');
    const expected = oracle(answers);
    assert.equal(
      r.outcome,
      expected,
      `combo ${JSON.stringify(answers)}: engine says ${r.outcome}, oracle says ${expected}`
    );
    if (r.outcome === 'eligible') eligibleCount++;
    combos++;

    // odometer
    let i = 0;
    while (i < keys.length) {
      counters[i]++;
      if (counters[i] < 3) break;
      counters[i] = 0;
      i++;
    }
    if (i === keys.length) break;
  }
  assert.equal(combos, Math.pow(3, keys.length));
  // sanity: the sweep visits genuine eligible combinations too
  assert.ok(eligibleCount > 0, 'sweep never reached an eligible combination - axes are wrong');
});

// --- 2: draft gating -----------------------------------------------------------------

test('production mode evaluates zero rules while everything is draft (the real spine today)', () => {
  const res = E.checkEligibility(realData(), { nationality: 'uk' });
  assert.equal(res.ok, true);
  assert.equal(res.results.length, 0);
});

test('a draft rule never ships; includeDrafts is the only way in', () => {
  const rule = fx.makeRule({ status: 'draft' });
  assert.equal(E.shippableRules(synthData([rule])).length, 0);
  assert.equal(E.shippableRules(synthData([rule]), DRAFTS).length, 1);
});

test('a verified rule is held back by ONE draft criterion', () => {
  const rule = fx.makeRule({
    criteria: [fx.makeCriterion(), fx.makeCriterion({ id: 'visa.synthetic.second', type: 'cleanCriminalRecord', status: 'draft' })],
  });
  assert.equal(E.shippableRules(synthData([rule])).length, 0);
});

test('a verified rule is held back by a draft criterion inside an anyOf', () => {
  const rule = fx.makeRule({
    criteria: [
      {
        anyOf: [
          fx.makeCriterion({ id: 'visa.synthetic.a', type: 'universityDegree' }),
          fx.makeCriterion({ id: 'visa.synthetic.b', type: 'professionalExperienceYears', value: 3, status: 'draft' }),
        ],
      },
    ],
  });
  assert.equal(E.shippableRules(synthData([rule])).length, 0);
});

test('a verified rule is held back by a draft referenced figure', () => {
  const draftFig = Object.assign({}, fx.testFigures[0], { status: 'draft' });
  const rule = fx.makeRule({
    criteria: [
      fx.makeCriterion({
        id: 'visa.synthetic.means',
        type: 'minIncomeMultiple',
        value: undefined,
        figureId: 'income-refs.test-monthly',
        multiple: 2,
        basis: 'test',
      }),
    ],
  });
  assert.equal(E.shippableRules(synthData([rule], [draftFig])).length, 0);
  assert.equal(E.shippableRules(synthData([rule], fx.testFigures)).length, 1);
});

// --- 3: the nationality gate -----------------------------------------------------------

test('before nationality: every rule is need-more-info asking ONLY for nationality, whatever else was answered', () => {
  const answers = Object.assign({}, fx.dnvSatisfied);
  delete answers.nationality;
  const res = E.checkEligibility(realData(), answers, DRAFTS);
  for (const r of res.results) {
    assert.equal(r.outcome, 'need-more-info');
    assert.deepEqual(r.missingInputs, ['nationality']);
  }
  assert.deepEqual(res.missingInputs, ['nationality']);
});

test('EEA/Swiss short-circuits: every visa route is not-needed with its honest note; only EU registration evaluates', () => {
  const res = E.checkEligibility(realData(), { nationality: 'eea-swiss' }, DRAFTS);
  for (const r of res.results) {
    if (r.id === 'visa.eu-registration') {
      assert.notEqual(r.outcome, 'not-needed');
      assert.notEqual(r.outcome, 'not-applicable');
    } else {
      assert.equal(r.outcome, 'not-needed');
      assert.ok(r.applicabilityNote, `${r.id} needs its honest EEA note`);
    }
  }
});

test('UK is a third country: the visa routes evaluate for uk, and EU registration is not-applicable', () => {
  const res = E.checkEligibility(realData(), { nationality: 'uk' }, DRAFTS);
  for (const r of res.results) {
    if (r.id === 'visa.eu-registration') {
      assert.equal(r.outcome, 'not-applicable');
    } else if (r.applicability === 'applies') {
      // an evaluated route: some tri-state outcome, never the EEA shortcut
      assert.ok(['eligible', 'not-eligible', 'need-more-info'].includes(r.outcome), `${r.id}: ${r.outcome}`);
    } else {
      // e.g. arraigo declares uk 'not-needed' (an irregular-status route that
      // rarely fits visa-holding nationals) - allowed, but must carry a note
      assert.equal(r.outcome, 'not-needed');
      assert.ok(r.applicabilityNote, `${r.id} needs a note explaining why uk is ${r.applicability}`);
    }
  }
  // the core third-country point: DNV and NLV genuinely evaluate for uk
  assert.equal(resultFor(res, 'visa.digital-nomad').outcome, 'need-more-info');
  assert.equal(resultFor(res, 'visa.non-lucrative').outcome, 'need-more-info');
});

test('not-applicable rules surface as not-applicable, not as failures', () => {
  const rule = fx.makeRule({ applicability: { uk: 'not-applicable', us: 'applies', 'eea-swiss': 'applies', other: 'applies' } });
  const res = E.checkEligibility(synthData([rule]), { nationality: 'uk' });
  assert.equal(res.results[0].outcome, 'not-applicable');
});

test('an unknown nationality value returns ok:false, never throws, never evaluates', () => {
  const res = E.checkEligibility(realData(), { nationality: 'france' }, DRAFTS);
  assert.deepEqual(res, { ok: false, error: 'unknown-nationality' });
});

// --- 4: lawyer-route conditions ---------------------------------------------------------

test('a lawyer-route condition caps the rule at need-more-info even with every askable answer satisfied', () => {
  const rule = fx.makeRule({
    criteria: [
      fx.makeCriterion(),
      fx.makeCriterion({ id: 'visa.synthetic.lawyer', type: 'arraigoVariantAssessment' }),
    ],
  });
  const res = E.checkEligibility(synthData([rule]), { nationality: 'uk', healthInsurance: true });
  const r = res.results[0];
  assert.equal(r.outcome, 'need-more-info');
  assert.equal(r.lawyerRoute, true);
  assert.deepEqual(r.missingInputs, []); // nothing left to ASK - only a lawyer can confirm
});

test('a hard no still beats the lawyer route: failed is failed', () => {
  const rule = fx.makeRule({
    criteria: [
      fx.makeCriterion(),
      fx.makeCriterion({ id: 'visa.synthetic.lawyer', type: 'arraigoVariantAssessment' }),
    ],
  });
  const res = E.checkEligibility(synthData([rule]), { nationality: 'uk', healthInsurance: false });
  assert.equal(res.results[0].outcome, 'not-eligible');
});

test('an unrecognised future condition type evaluates unknown forever and never grants', () => {
  const rule = fx.makeRule({
    criteria: [fx.makeCriterion({ id: 'visa.synthetic.future', type: 'someFutureType' })],
  });
  const res = E.checkEligibility(synthData([rule]), { nationality: 'uk', someFutureType: true });
  const r = res.results[0];
  assert.equal(r.outcome, 'need-more-info');
  assert.equal(r.lawyerRoute, true); // not in the registry -> treated as lawyer-route
});

// --- 5: threshold maths ---------------------------------------------------------------

test('computeThreshold: dependant uplifts to the cent (SMI 1,221 x 0.75 = 915.75)', () => {
  const figures = { 'income-refs.smi-monthly': { id: 'income-refs.smi-monthly', label: 'SMI', unit: 'eur-per-month', value: 1221, status: 'draft' } };
  const criterion = {
    id: 'x.y.z',
    type: 'minIncomeMultiple',
    figureId: 'income-refs.smi-monthly',
    multiple: 2,
    dependants: { first: 0.75, additional: 0.25 },
  };
  assert.equal(E.computeThreshold(criterion, figures, 0).monthly, 2442);
  assert.equal(E.computeThreshold(criterion, figures, 1).monthly, 3357.75);
  assert.equal(E.computeThreshold(criterion, figures, 2).monthly, 3663);
  assert.equal(E.computeThreshold(criterion, figures, undefined).monthly, null);
  assert.equal(E.computeThreshold(criterion, figures, undefined).monthlyFloor, 2442);
});

test('computeThreshold: savings totals multiply months exactly (400% x 600 x 12 = 28,800)', () => {
  const figures = { 'income-refs.iprem-monthly': { id: 'income-refs.iprem-monthly', label: 'IPREM', unit: 'eur-per-month', value: 600, status: 'draft' } };
  const criterion = {
    id: 'x.y.z',
    type: 'minSavingsMultiple',
    figureId: 'income-refs.iprem-monthly',
    multiple: 4,
    months: 12,
    dependants: { first: 1, additional: 1 },
  };
  const t0 = E.computeThreshold(criterion, figures, 0);
  assert.equal(t0.total, 28800);
  const t1 = E.computeThreshold(criterion, figures, 1);
  assert.equal(t1.total, 36000);
});

test('a dangling figureId at evaluation time throws (build bug, must fail loudly)', () => {
  const rule = fx.makeRule({
    criteria: [
      fx.makeCriterion({
        id: 'visa.synthetic.means',
        type: 'minIncomeMultiple',
        value: undefined,
        figureId: 'income-refs.does-not-exist',
        multiple: 2,
        basis: 'test',
      }),
    ],
  });
  assert.throws(
    () => E.checkEligibility(synthData([rule]), { nationality: 'uk', monthlyIncome: 5000 }, DRAFTS),
    /references missing figure/
  );
});

test('a missing applicability entry for the answered nationality throws (data bug)', () => {
  const rule = fx.makeRule({ applicability: { us: 'applies', 'eea-swiss': 'not-needed', other: 'applies' } });
  assert.throws(
    () => E.checkEligibility(synthData([rule]), { nationality: 'uk' }),
    /no applicability entry/
  );
});

// --- 6: validator rejections, one per new eligibility rule ------------------------------
/*
 * Same staging approach as validate.test.js: run the real validator as a
 * child process against a temp spine whose visas.js is replaced by the
 * mutation under test. The itp figures stay golden (one real figure) so
 * figure checks stay quiet; income-refs.js is staged verbatim so threshold
 * criteria can resolve.
 */
const REPO = path.join(__dirname, '..', '..');

function runValidatorWithVisas(visaRules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'els-elig-test-'));
  const legalDir = path.join(dir, 'legal-data');
  fs.mkdirSync(legalDir);
  fs.copyFileSync(path.join(REPO, 'tools', 'legal-data', 'index.js'), path.join(legalDir, 'index.js'));
  fs.copyFileSync(path.join(REPO, 'tools', 'legal-data', 'income-refs.js'), path.join(legalDir, 'income-refs.js'));
  const golden = JSON.parse(JSON.stringify(spine.getFigure('itp.catalunya.resale')));
  delete golden.domain;
  fs.writeFileSync(
    path.join(legalDir, 'itp.js'),
    'module.exports = ' + JSON.stringify({ domain: 'itp', domainLabel: 'test', figures: [golden] }, null, 2) + ';\n'
  );
  fs.writeFileSync(path.join(legalDir, 'itp-reliefs.js'), "module.exports = { domain: 'itp', reliefs: [] };\n");
  fs.writeFileSync(
    path.join(legalDir, 'visas.js'),
    'module.exports = ' + JSON.stringify({ domain: 'visa', domainLabel: 'test', rules: visaRules }, null, 2) + ';\n'
  );
  fs.copyFileSync(path.join(REPO, 'tools', 'validate-legal-data.js'), path.join(dir, 'validate-legal-data.js'));
  try {
    const out = execFileSync('node', [path.join(dir, 'validate-legal-data.js')], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function expectVisaRejected(rule, fragment, name) {
  test(`validator: ${name}`, () => {
    const { code, out } = runValidatorWithVisas([rule]);
    assert.equal(code, 1, `expected exit 1\n${out}`);
    assert.match(out, /REJECTED/);
    assert.match(out, fragment);
  });
}

test('validator: the golden synthetic rule passes clean (the mutations below fail for their own reason)', () => {
  const { code, out } = runValidatorWithVisas([fx.makeRule()]);
  assert.equal(code, 0, out);
});

expectVisaRejected(
  fx.makeRule({ applicability: { uk: 'applies', us: 'applies', other: 'applies' } }),
  /missing nationality group "eea-swiss"/,
  'a missing nationality group in applicability is rejected'
);

expectVisaRejected(
  fx.makeRule({ applicability: { uk: 'maybe', us: 'applies', 'eea-swiss': 'not-needed', other: 'applies' } }),
  /must be one of applies \/ not-needed \/ not-applicable/,
  'an unknown applicability state is rejected'
);

expectVisaRejected(
  fx.makeRule({ applicability: { uk: 'not-needed', us: 'not-needed', 'eea-swiss': 'not-needed', other: 'not-applicable' } }),
  /applies to no nationality group/,
  'a rule that applies to nobody is rejected'
);

expectVisaRejected(
  fx.makeRule({ criteria: [fx.makeCriterion({ type: 'madeUpType' })] }),
  /not in the vocabulary/,
  'an out-of-vocabulary condition type is rejected'
);

expectVisaRejected(
  fx.makeRule({
    criteria: [
      fx.makeCriterion({
        id: 'visa.synthetic.means',
        type: 'minIncomeMultiple',
        value: 2000,
        figureId: 'income-refs.iprem-monthly',
        multiple: 4,
        basis: 'test',
      }),
    ],
  }),
  /never carries a value of its own/,
  'a threshold criterion with a hardcoded value is rejected'
);

expectVisaRejected(
  fx.makeRule({
    criteria: [
      fx.makeCriterion({
        id: 'visa.synthetic.means',
        type: 'minIncomeMultiple',
        value: undefined,
        figureId: 'income-refs.nope',
        multiple: 4,
        basis: 'test',
      }),
    ],
  }),
  /does not resolve to any figure/,
  'a dangling figureId is rejected'
);

expectVisaRejected(
  fx.makeRule({
    criteria: [
      fx.makeCriterion({
        id: 'visa.synthetic.means',
        type: 'minIncomeMultiple',
        value: undefined,
        figureId: 'itp.catalunya.resale',
        multiple: 4,
        basis: 'test',
      }),
    ],
  }),
  /must be eur-per-month/,
  'a threshold anchored to a non-monthly figure is rejected'
);

expectVisaRejected(
  fx.makeRule({
    criteria: [
      fx.makeCriterion({
        id: 'visa.synthetic.means',
        type: 'minSavingsMultiple',
        value: undefined,
        figureId: 'income-refs.iprem-monthly',
        multiple: 4,
        basis: 'test',
      }),
    ],
  }),
  /needs a positive months count/,
  'minSavingsMultiple without months is rejected'
);

expectVisaRejected(
  fx.makeRule({ criteria: [fx.makeCriterion({ label: 'income of €2,442 a month' })] }),
  /must not contain euro amounts/,
  'a euro amount hardcoded in a criterion label is rejected'
);

expectVisaRejected(
  fx.makeRule({ criteria: [fx.makeCriterion({ id: 'other.prefix.criterion' })] }),
  /must start with their rule's id/,
  'a criterion id outside its rule id is rejected'
);

expectVisaRejected(
  fx.makeRule({
    criteria: [fx.makeCriterion(), fx.makeCriterion({ type: 'cleanCriminalRecord' })],
  }),
  /duplicate id/,
  'duplicate criterion ids are rejected'
);

expectVisaRejected(
  fx.makeRule({
    criteria: [
      {
        anyOf: [
          { anyOf: [fx.makeCriterion({ id: 'visa.synthetic.a' }), fx.makeCriterion({ id: 'visa.synthetic.b', type: 'cleanCriminalRecord' })] },
          fx.makeCriterion({ id: 'visa.synthetic.c', type: 'universityDegree' }),
        ],
      },
    ],
  }),
  /cannot nest/,
  'nested anyOf groups are rejected'
);

expectVisaRejected(
  fx.makeRule({ criteria: [{ anyOf: [fx.makeCriterion()] }] }),
  /at least 2 alternatives/,
  'a single-entry anyOf is rejected'
);

expectVisaRejected(fx.makeRule({ criteria: [] }), /non-empty criteria array/, 'empty criteria are rejected');

expectVisaRejected(fx.makeRule({ nextSteps: [] }), /non-empty nextSteps array/, 'empty nextSteps are rejected');

expectVisaRejected(
  fx.makeRule({ criteria: [fx.makeCriterion({ source: undefined })] }),
  /missing its source/,
  'a criterion without a source is rejected'
);

expectVisaRejected(
  (() => {
    const c = fx.makeCriterion({
      source: { url: 'https://www.some-law-blog.example/visa', title: 'blog', accessed: '2026-07-06' },
      status: 'verified',
    });
    return fx.makeRule({ criteria: [c] });
  })(),
  /not an official tax-authority host/,
  "a criterion marked 'verified' with a non-official source is rejected"
);

expectVisaRejected(
  fx.makeRule({ summary: '' }),
  /missing its user-facing summary/,
  'a missing summary is rejected'
);
