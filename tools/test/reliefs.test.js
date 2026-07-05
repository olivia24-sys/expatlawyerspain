/*
 * reliefs.test.js - unit tests for the v2 relief evaluator (js/calc-engine.js)
 * Run all tests from the repo root:   node --test tools/test/
 *
 * Two layers:
 *   1. Catalunya fixtures against the REAL spine rules (includeDrafts: true,
 *      because launch rules are draft until Olivia verifies them).
 *   2. Synthetic rules that pin the engine mechanics and the three hard
 *      structures: Balears (island caps + first-€270,151.20 band), Madrid
 *      (graduated AJD base + bonificación layers), Canarias (20% stacked on
 *      the 5% rate). Synthetic rules are marked 'verified' so they exercise
 *      the default path; the draft-gate test proves drafts stay dead.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ELSCalc = require('../../js/calc-engine.js');
const spine = require('../legal-data/index.js');
const fixtures = require('./fixtures/relief-fixtures.js');

const baseData = { regions: spine.regions, figures: spine.allFigures() };
const realData = { ...baseData, reliefs: spine.allReliefs() };

function withReliefs(reliefs) {
  return { ...baseData, reliefs };
}
function calc(data, inputs, opts) {
  const r = ELSCalc.calculatePersonalisedITP(data, inputs, opts);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  return r;
}
// Minimal synthetic rule; only fields the ENGINE reads (the validator guards
// the full shape on real rules).
function rule(over) {
  return {
    id: 'itp.test.rule',
    label: 'test relief',
    region: 'catalunya',
    appliesTo: 'resale',
    result: { type: 'rate', value: 5 },
    conditions: [{ type: 'habitualResidence', value: true }],
    combinesWith: 'exclusive',
    status: 'verified',
    ...over,
  };
}

// --- 1. Catalunya fixtures (real spine rules) ---------------------------------

test('relief fixtures reproduce to the cent', async (t) => {
  for (const fx of fixtures) {
    await t.test(fx.name, () => {
      const r = calc(realData, fx.inputs, { includeDrafts: true });
      assert.equal(r.reliefStatus, fx.expected.reliefStatus, 'reliefStatus');
      if ('total' in fx.expected) {
        assert.equal(r.personalised.total, fx.expected.total, 'personalised total');
        assert.equal(r.comparison.yourTotal, fx.expected.total, 'comparison.yourTotal');
        assert.equal(r.comparison.standardTotal, r.standard.total, 'comparison.standardTotal');
        // the printed personalised breakdown must sum to the total, to the cent
        const sum = r.personalised.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
        assert.equal(sum, Math.round(r.personalised.total * 100), 'lines sum to total');
      } else {
        assert.equal(r.personalised, null, 'no personalised result expected');
        assert.equal(r.comparison, null, 'no comparison expected');
      }
      if ('saving' in fx.expected) assert.equal(r.comparison.saving, fx.expected.saving, 'saving');
      if ('appliedIds' in fx.expected) {
        assert.deepEqual(
          r.personalised.appliedReliefs.map((a) => a.id).sort(),
          fx.expected.appliedIds.slice().sort(),
          'appliedReliefs'
        );
      }
      if ('missingInputs' in fx.expected) {
        assert.deepEqual(r.missingInputs, fx.expected.missingInputs, 'missingInputs');
      }
      if ('otherSituationHint' in fx.expected) {
        assert.equal(r.otherSituationHint, fx.expected.otherSituationHint, 'otherSituationHint');
      }
      // the standard result is always the untouched v1 contract
      assert.deepEqual(r.standard, ELSCalc.calculateITP(baseData, fx.inputs), 'standard untouched');
    });
  }
});

// --- 2. the draft gate ----------------------------------------------------------

test('a draft rule NEVER applies, even when every condition is met', () => {
  const draft = rule({ status: 'draft' });
  const inputs = { region: 'catalunya', price: 350000, propertyType: 'resale', buyer: { mainHome: true } };
  const withoutOpts = calc(withReliefs([draft]), inputs);
  assert.equal(withoutOpts.reliefStatus, 'standard-only');
  assert.equal(withoutOpts.personalised, null);
  // includeDrafts is the TEST-ONLY escape hatch and must flip the outcome
  const withOpts = calc(withReliefs([draft]), inputs, { includeDrafts: true });
  assert.equal(withOpts.reliefStatus, 'relief-applied');
});

test('no verified rules for the region: standard-only, no gate message', () => {
  const inputs = { region: 'madrid', price: 350000, propertyType: 'resale', buyer: { mainHome: false } };
  const r = calc(withReliefs([]), inputs);
  assert.equal(r.reliefStatus, 'standard-only'); // not 'reliefs-unavailable': there is nothing to miss
});

// --- 3. tri-state conditions: unknown NEVER grants --------------------------------

test('every askable condition type withholds on unknown and reports itself', () => {
  const cases = [
    { cond: { type: 'maxAge', value: 35 }, buyer: {} },
    { cond: { type: 'firstHome', value: true }, buyer: {} },
    { cond: { type: 'noPriorPropertyOwnership', value: true }, buyer: {} },
    { cond: { type: 'maxIncome', value: 36000, basis: 'x' }, buyer: {} },
    { cond: { type: 'maxIncome', value: 36000, basis: 'x' }, buyer: { income: 20000, noSpanishIncomeTax: true } },
    { cond: { type: 'maxHouseholdIncome', value: 36000, basis: 'x' }, buyer: {} },
    { cond: { type: 'maxSavingsIncome', value: 1800, basis: 'x' }, buyer: {} },
    { cond: { type: 'disability', value: 65 }, buyer: {} },
    { cond: { type: 'largeFamily', value: true }, buyer: {} },
    { cond: { type: 'singleParentFamily', value: true }, buyer: {} },
    { cond: { type: 'priorRegionResidenceYears', value: 3 }, buyer: {} },
    { cond: { type: 'mortgageLtvMin', value: 60 }, buyer: {} },
  ];
  for (const c of cases) {
    const r = calc(
      withReliefs([rule({ conditions: [{ type: 'habitualResidence', value: true }, c.cond] })]),
      { region: 'catalunya', price: 350000, propertyType: 'resale', buyer: { mainHome: true, ...c.buyer } }
    );
    assert.equal(r.reliefStatus, 'standard-only', `${c.cond.type} must withhold on unknown`);
    assert.ok(r.missingInputs.includes(c.cond.type), `${c.cond.type} must be reported as missing`);
  }
});

test('lawyer-route conditions never grant and never ask, only hint', () => {
  for (const type of ['vpoProtectedHousing', 'genderViolenceVictim', 'ruralDepopulatedArea', 'terrorismVictim']) {
    const r = calc(withReliefs([rule({ conditions: [{ type, value: true }] })]), {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: { mainHome: true },
    });
    assert.equal(r.reliefStatus, 'standard-only', type);
    assert.deepEqual(r.missingInputs, [], `${type} must not become a question`);
    assert.equal(r.otherSituationHint, true, `${type} must set the hint`);
  }
});

test('maxAge boundaries: inclusive by default, strict when inclusive:false', () => {
  const at35 = { region: 'catalunya', price: 100000, propertyType: 'resale', buyer: { mainHome: true, age: 35 } };
  const inclusive = rule({ conditions: [{ type: 'maxAge', value: 35 }] });
  const strict = rule({ conditions: [{ type: 'maxAge', value: 35, inclusive: false }] });
  assert.equal(calc(withReliefs([inclusive]), at35).reliefStatus, 'relief-applied', '35 passes <=35');
  assert.equal(calc(withReliefs([strict]), at35).reliefStatus, 'standard-only', '35 fails <35');
});

test('mainHome: false closes the gate when reliefs exist', () => {
  const r = calc(withReliefs([rule({})]), {
    region: 'catalunya',
    price: 350000,
    propertyType: 'resale',
    buyer: { mainHome: false, age: 20 },
  });
  assert.equal(r.reliefStatus, 'reliefs-unavailable');
  assert.equal(r.personalised, null);
  assert.deepEqual(r.missingInputs, []);
});

test('anyOf: one satisfied alternative is enough; all-failed fails', () => {
  const anyOfRule = rule({
    conditions: [
      { type: 'habitualResidence', value: true },
      { anyOf: [{ type: 'largeFamily', value: true }, { type: 'singleParentFamily', value: true }] },
    ],
  });
  const base = { region: 'catalunya', price: 100000, propertyType: 'resale' };
  const single = calc(withReliefs([anyOfRule]), { ...base, buyer: { mainHome: true, largeFamily: false, singleParentFamily: true } });
  assert.equal(single.reliefStatus, 'relief-applied');
  const neither = calc(withReliefs([anyOfRule]), { ...base, buyer: { mainHome: true, largeFamily: false, singleParentFamily: false } });
  assert.equal(neither.reliefStatus, 'standard-only');
  const unknown = calc(withReliefs([anyOfRule]), { ...base, buyer: { mainHome: true, largeFamily: false } });
  assert.equal(unknown.reliefStatus, 'standard-only');
  assert.ok(unknown.missingInputs.includes('singleParentFamily'));
});

// --- 4. exclusive resolution: cheapest by euros, not by nominal rate ---------------

test('a lower nominal rate with a band cap can lose to a higher flat rate', () => {
  // Balears standard scale: 8% to 400k, 9% to 600k...
  // 3% on the first 100,000 then standard above = 3,000 + (50,000 - 8,000) = 45,000
  // 6% flat on 600,000 = 36,000  -> the 6% "worse-looking" rate wins.
  const capped = rule({ id: 'itp.test.capped', region: 'baleares', result: { type: 'rate', value: 3, bandCap: 100000 } });
  const flat = rule({ id: 'itp.test.flat', region: 'baleares', result: { type: 'rate', value: 6 } });
  const r = calc(withReliefs([capped, flat]), {
    region: 'baleares',
    price: 600000,
    propertyType: 'resale',
    buyer: { mainHome: true },
  });
  assert.equal(r.personalised.total, 36000);
  assert.deepEqual(r.personalised.appliedReliefs.map((a) => a.id), ['itp.test.flat']);
});

test('deterministic: identical inputs give identical results, ties break by id', () => {
  const a = rule({ id: 'itp.test.aaa' });
  const b = rule({ id: 'itp.test.bbb' }); // same 5% result - a genuine tie
  const inputs = { region: 'catalunya', price: 350000, propertyType: 'resale', buyer: { mainHome: true } };
  const r1 = calc(withReliefs([b, a]), inputs);
  const r2 = calc(withReliefs([a, b]), inputs);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1.personalised.appliedReliefs.map((x) => x.id), ['itp.test.aaa']);
});

// --- 5. Illes Balears: island caps + the first-€270,151.20 band --------------------

const BALEARS_CAP = 270151.2;
const balearsReduced = rule({
  id: 'itp.test.balears-4pc',
  region: 'baleares',
  result: { type: 'rate', value: 4, bandCap: BALEARS_CAP },
  conditions: [
    { type: 'habitualResidence', value: true },
    { type: 'noPriorPropertyOwnership', value: true },
    { type: 'maxPropertyValue', byIsland: { 'mallorca-menorca': 331859.7, 'ibiza-formentera': 378212 } },
  ],
});
const balears100 = rule({
  id: 'itp.test.balears-under30-100pc',
  region: 'baleares',
  result: { type: 'deduction', value: 100 },
  conditions: [
    { type: 'maxAge', value: 30, inclusive: false },
    { type: 'firstHome', value: true },
    { type: 'noPriorPropertyOwnership', value: true },
    { type: 'habitualResidence', value: true },
    { type: 'maxPropertyValue', value: BALEARS_CAP }, // FIXED cap - never island-raised
    { type: 'maxIncome', value: 52800, basis: 'IRPF total taxable base, individual' },
    { type: 'priorRegionResidenceYears', value: 3 },
    { type: 'mortgageLtvMin', value: 60 },
  ],
});
const fullBalearsBuyer = {
  mainHome: true,
  age: 28,
  firstHome: true,
  ownsOtherHome: false,
  income: 40000,
  priorRegionResidenceYears: 3,
  mortgageLtvPercent: 60,
};

test('balears band: 4% on the first 270,151.20, standard scale above', () => {
  // reduced: 4% x 270,151.20 = 10,806.05 (rounded half-up per line)
  // standard 8% x 300,000 = 24,000.00; 8% x 270,151.20 = 21,612.10
  // excess = 2,387.90 -> total 13,193.95
  const r = calc(withReliefs([balearsReduced]), {
    region: 'baleares',
    price: 300000,
    propertyType: 'resale',
    island: 'mallorca-menorca',
    buyer: { mainHome: true, ownsOtherHome: false },
  });
  assert.equal(r.personalised.total, 13193.95);
  assert.equal(r.standard.total, 24000);
  assert.equal(r.comparison.saving, 10806.05);
  assert.equal(r.personalised.lines.length, 2, 'reduced portion + standard excess');
});

test('balears island caps: 350,000 passes in Ibiza, fails in Mallorca', () => {
  const inputs = (island) => ({
    region: 'baleares',
    price: 350000,
    propertyType: 'resale',
    island,
    buyer: { mainHome: true, ownsOtherHome: false },
  });
  const ibiza = calc(withReliefs([balearsReduced]), inputs('ibiza-formentera'));
  // 4% x 270,151.20 = 10,806.05; standard 8% x 350,000 = 28,000.00 minus
  // 8% x 270,151.20 = 21,612.10 -> excess 6,387.90 -> total 17,193.95
  assert.equal(ibiza.personalised.total, 17193.95);
  const mallorca = calc(withReliefs([balearsReduced]), inputs('mallorca-menorca'));
  assert.equal(mallorca.reliefStatus, 'standard-only', '350k is over the Mallorca/Menorca cap');
});

test('balears: missing island answer means no relief, not a guess', () => {
  const r = calc(withReliefs([balearsReduced]), {
    region: 'baleares',
    price: 300000,
    propertyType: 'resale',
    buyer: { mainHome: true, ownsOtherHome: false },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.ok(r.missingInputs.includes('maxPropertyValue'));
});

test('balears 100% bonification keeps its FIXED cap - never island-raised', () => {
  // €300,000 in Mallorca: under the island cap (331,859.70) so the 4% band
  // rate applies, but OVER the fixed €270,151.20 cap so the 100%
  // bonification must NOT - the single highest-risk confusion in the data.
  const r = calc(withReliefs([balearsReduced, balears100]), {
    region: 'baleares',
    price: 300000,
    propertyType: 'resale',
    island: 'mallorca-menorca',
    buyer: fullBalearsBuyer,
  });
  assert.equal(r.personalised.total, 13193.95, 'the 4% band result, not zero');
  assert.deepEqual(r.personalised.appliedReliefs.map((a) => a.id), ['itp.test.balears-4pc']);
});

test('balears 100% bonification: qualifies under the fixed cap -> zero tax', () => {
  const r = calc(withReliefs([balearsReduced, balears100]), {
    region: 'baleares',
    price: 250000,
    propertyType: 'resale',
    island: 'mallorca-menorca',
    buyer: fullBalearsBuyer,
  });
  assert.equal(r.personalised.total, 0);
  assert.equal(r.comparison.saving, 20000); // standard 8% x 250,000
  assert.deepEqual(r.personalised.appliedReliefs.map((a) => a.id), ['itp.test.balears-under30-100pc']);
});

test('balears hard gates: residence years and mortgage LTV each block alone', () => {
  const base = {
    region: 'baleares',
    price: 250000,
    propertyType: 'resale',
    island: 'mallorca-menorca',
  };
  for (const missing of ['priorRegionResidenceYears', 'mortgageLtvPercent']) {
    const buyer = { ...fullBalearsBuyer };
    delete buyer[missing];
    const r = calc(withReliefs([balears100]), { ...base, buyer });
    assert.equal(r.reliefStatus, 'standard-only', `unanswered ${missing} must withhold`);
    const failBuyer = { ...fullBalearsBuyer, [missing]: 0 };
    const rf = calc(withReliefs([balears100]), { ...base, buyer: failBuyer });
    assert.equal(rf.reliefStatus, 'standard-only', `failed ${missing} must withhold`);
  }
});

// --- 6. Madrid: graduated AJD base, then bonificación on the quota ------------------

const madridBase = rule({
  id: 'ajd.test.madrid-graduated',
  region: 'madrid',
  appliesTo: 'newbuild-ajd',
  result: {
    type: 'rate',
    bands: [
      { upTo: 120000, rate: 0.4 },
      { upTo: 180000, rate: 0.5 },
      { upTo: null, rate: 0.75 },
    ],
    bandType: 'whole',
  },
  conditions: [{ type: 'habitualResidence', value: true }],
});
const madrid10 = rule({
  id: 'ajd.test.madrid-10pc',
  region: 'madrid',
  appliesTo: 'newbuild-ajd',
  result: { type: 'deduction', value: 10 },
  conditions: [
    { type: 'habitualResidence', value: true },
    { type: 'maxPropertyValue', value: 250000 },
  ],
  combinesWith: 'cumulative',
  stacksOn: ['ajd.test.madrid-graduated'],
  incompatibleWith: ['ajd.test.madrid-95pc'],
});
const madrid95 = rule({
  id: 'ajd.test.madrid-95pc',
  region: 'madrid',
  appliesTo: 'newbuild-ajd',
  result: { type: 'deduction', value: 95 },
  conditions: [
    { type: 'largeFamily', value: true },
    { type: 'habitualResidence', value: true },
    { type: 'priorHomeSaleWindow', value: 2 },
    // deliberately NO maxPropertyValue: the aggregator-error trap
  ],
  combinesWith: 'cumulative',
  stacksOn: ['ajd.test.madrid-graduated'],
  incompatibleWith: ['ajd.test.madrid-10pc'],
});
const MADRID_RULES = [madridBase, madrid10, madrid95];

test('madrid two layers: €150k new build -> 0.5% base -> 10% off -> 0.45% effective', () => {
  // IVA 10% x 150,000 = 15,000. AJD: whole-band 0.5% x 150,000 = 750,
  // then 10% off the quota = -75 -> 675. Total 15,675 (standard 16,125).
  const r = calc(withReliefs(MADRID_RULES), {
    region: 'madrid',
    price: 150000,
    propertyType: 'new-build',
    buyer: { mainHome: true, largeFamily: false },
  });
  assert.equal(r.standard.total, 16125);
  assert.equal(r.personalised.total, 15675);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id).sort(),
    ['ajd.test.madrid-10pc', 'ajd.test.madrid-graduated']
  );
});

test('madrid graduated band boundaries are a whole-value cliff', () => {
  const at = (price) =>
    calc(withReliefs(MADRID_RULES), {
      region: 'madrid',
      price,
      propertyType: 'new-build',
      buyer: { mainHome: true, largeFamily: false },
    });
  // AJD components: 0.4% x 120,000 = 480 (minus 10% -> 432)
  const r120 = at(120000);
  assert.equal(r120.personalised.total, 12000 + 432);
  // one euro more crosses the cliff: 0.5% x 120,001 = 600.01 (minus 10% = 60.00 -> 540.01)
  const r120plus = at(120001);
  assert.equal(r120plus.personalised.total, 12000.1 + 540.01);
});

test('madrid large family: 95% beats 10%, they never stack, and NO value cap', () => {
  // €150k large family: 750 base -> 95% off = -712.50 -> 37.50; total 15,037.50
  const r = calc(withReliefs(MADRID_RULES), {
    region: 'madrid',
    price: 150000,
    propertyType: 'new-build',
    buyer: { mainHome: true, largeFamily: true, ownsOtherHome: false },
  });
  assert.equal(r.personalised.total, 15037.5);
  // €600k large family: the 10% bonif fails its €250k cap, the 95% has no cap.
  // Base 0.75% x 600,000 = 4,500 -> 95% off -> 225. IVA 60,000. Total 60,225.
  const big = calc(withReliefs(MADRID_RULES), {
    region: 'madrid',
    price: 600000,
    propertyType: 'new-build',
    buyer: { mainHome: true, largeFamily: true, ownsOtherHome: false },
  });
  assert.equal(big.personalised.total, 60225);
});

test('madrid priorHomeSaleWindow: owning another home withholds (lawyer confirms), never auto-grants', () => {
  const r = calc(withReliefs(MADRID_RULES), {
    region: 'madrid',
    price: 150000,
    propertyType: 'new-build',
    buyer: { mainHome: true, largeFamily: true, ownsOtherHome: true },
  });
  // 95% withheld (sale-window unknowable here) -> falls back to base + 10%
  assert.equal(r.personalised.total, 15675);
});

// --- 7. Canarias: 20% bonificación stacked on the 5% rate ---------------------------

const canarias5 = rule({
  id: 'itp.test.canarias-5pc',
  region: 'canarias',
  result: { type: 'rate', value: 5 },
  conditions: [
    { type: 'habitualResidence', value: true },
    { type: 'noPriorPropertyOwnership', value: true },
    { type: 'maxPropertyValue', value: 200000 },
  ],
});
const canarias20 = rule({
  id: 'itp.test.canarias-under40-20pc',
  region: 'canarias',
  result: { type: 'deduction', value: 20 },
  conditions: [
    { type: 'maxAge', value: 40 },
    { type: 'firstHome', value: true },
    { type: 'noPriorPropertyOwnership', value: true },
    { type: 'habitualResidence', value: true },
    { type: 'maxIncome', value: 46455, basis: 'base imponible general del IRPF, per buyer' },
  ],
  combinesWith: 'cumulative',
  stacksOn: ['itp.test.canarias-5pc'],
});
const canariasBuyer = { mainHome: true, age: 35, firstHome: true, ownsOtherHome: false, income: 30000 };

test('canarias stack: 5% rate then 20% off the quota -> 4% effective', () => {
  // 5% x 180,000 = 9,000 -> 20% off = -1,800 -> 7,200 (standard 6.5% = 11,700)
  const r = calc(withReliefs([canarias5, canarias20]), {
    region: 'canarias',
    price: 180000,
    propertyType: 'resale',
    buyer: canariasBuyer,
  });
  assert.equal(r.standard.total, 11700);
  assert.equal(r.personalised.total, 7200);
  assert.equal(r.personalised.effectiveRate, 4);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id).sort(),
    ['itp.test.canarias-5pc', 'itp.test.canarias-under40-20pc']
  );
});

test('canarias: the 20% bonificación does NOT apply on the standard 6.5% base', () => {
  // €250,000 breaks the 5% rule's value cap; the bonificación only stacks on
  // the 5% base, so nothing applies at all.
  const r = calc(withReliefs([canarias5, canarias20]), {
    region: 'canarias',
    price: 250000,
    propertyType: 'resale',
    buyer: canariasBuyer,
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.personalised, null);
});

// --- 8. result types and misc mechanics ---------------------------------------------

test('exempt result: zero tax, labelled as exempt', () => {
  const r = calc(withReliefs([rule({ result: { type: 'exempt' } })]), {
    region: 'catalunya',
    price: 350000,
    propertyType: 'resale',
    buyer: { mainHome: true },
  });
  assert.equal(r.personalised.total, 0);
  assert.match(r.personalised.lines[0].label, /exempt/);
});

test('an exclusive deduction applies alone on the standard quota', () => {
  const d = rule({ id: 'ajd.test.excl-100', appliesTo: 'newbuild-ajd', result: { type: 'deduction', value: 100 } });
  const r = calc(withReliefs([d]), {
    region: 'catalunya',
    price: 300000,
    propertyType: 'new-build',
    buyer: { mainHome: true },
  });
  // IVA 30,000 + AJD (1.5% = 4,500, then -100%) = 30,000
  assert.equal(r.personalised.total, 30000);
  const ivaLine = r.personalised.lines.find((l) => /IVA/.test(l.label));
  assert.ok(ivaLine && ivaLine.amount === 30000, 'IVA line untouched');
});

test('a relief that cannot beat the standard quota is not applied', () => {
  // "reduced" 12% is worse than Catalunya's standard on a cheap flat
  const worse = rule({ result: { type: 'rate', value: 12 } });
  const r = calc(withReliefs([worse]), {
    region: 'catalunya',
    price: 100000,
    propertyType: 'resale',
    buyer: { mainHome: true },
  });
  assert.equal(r.reliefStatus, 'standard-only');
});
