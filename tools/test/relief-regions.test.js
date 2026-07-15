/*
 * relief-regions.test.js - hand-worked smoke tests for the six regions
 * appended to tools/legal-data/itp-reliefs.js (Andalucia, Comunidad
 * Valenciana, Madrid, Illes Balears, Canarias, Region de Murcia).
 *
 * Run all tests from the repo root:   node --test "tools/test/[star-star]/[star].test.js"
 * (the real glob is tools/test then a double-star then a single-star.test.js;
 * spelled out here to avoid closing this block comment early)
 *
 * Same setup pattern as tools/test/reliefs.test.js section 1: run against
 * the REAL spine with { includeDrafts: true }, since these rules are all
 * status 'draft' until Olivia verifies them. Every expected total is
 * hand-worked from the standard rates in tools/legal-data/itp.js and the
 * relief's own value/bandCap/bands, stated in a comment above the
 * assertion, never copied from a first test run.
 *
 * Standard rates used below (tools/legal-data/itp.js, read 2026-07-05):
 *   Andalucia:            7% flat resale
 *   Comunidad Valenciana:  9%/11% whole cliff at EUR 1,000,000 resale
 *   Madrid:               6% flat resale; national IVA 10%
 *   Illes Balears:        8-13% marginal scale (8% to EUR 400,000)
 *   Canarias:             6.5% flat resale
 *   Region de Murcia:     7.75% flat resale
 *
 * Age-boundary coverage: Andalucia, Comunidad Valenciana and Illes Balears
 * have clean inclusive:false age rules (35, 35, 36) and get a literal
 * age-boundary test. Madrid's only age-gated rule (depopulation) also
 * requires ruralDepopulatedArea, a permanent lawyer-route condition that can
 * never auto-grant regardless of age, so Madrid's third scenario
 * demonstrates the priorHomeSaleWindow withholding instead. Canarias and
 * Murcia's age-gated rules use INCLUSIVE maxAge by design (the task keeps
 * them inclusive), so their third scenarios demonstrate the cumulative
 * stack (Canarias) and the savings-income cap boundary (Murcia) instead of
 * a strict age cliff.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ELSCalc = require('../../js/calc-engine.js');
const spine = require('../legal-data/index.js');

const realData = { regions: spine.regions, figures: spine.allFigures(), reliefs: spine.allReliefs() };

function calc(inputs) {
  const r = ELSCalc.calculatePersonalisedITP(realData, inputs, { includeDrafts: true });
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  return r;
}

// --- Andalucia (standard resale 7%) -------------------------------------------

test('Andalucia A1: clear qualify, general habitual rate beats standard', () => {
  // 6% x 140,000 = 8,400; standard 7% x 140,000 = 9,800; saving 1,400
  const r = calc({
    region: 'andalucia',
    price: 140000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 40,
      disability: 'none',
      largeFamily: false,
      singleParentFamily: false,
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 8400);
  assert.equal(r.standard.total, 9800);
  assert.equal(r.comparison.saving, 1400);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id),
    ['itp.andalucia.general-habitual']
  );
  assert.equal(r.otherSituationHint, true);
});

test('Andalucia A2: over both value caps, standard-only', () => {
  // price 260,000 is over the 150k cap (general/under-35) AND the 250k cap
  // (disability/large-family) -> every rate rule fails on value; standard
  // 7% x 260,000 = 18,200
  const r = calc({
    region: 'andalucia',
    price: 260000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 30,
      disability: 'none',
      largeFamily: false,
      singleParentFamily: false,
    },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.personalised, null);
  assert.equal(r.standard.total, 18200);
});

test('Andalucia A3: MANDATORY age boundary, exactly 35 fails under-35 but keeps the general rate', () => {
  // under-35 rule is inclusive:false, so age 35 fails it (must NOT get 3.5%
  // = 4,900). The general-habitual rule has no age condition, so it still
  // applies: 6% x 140,000 = 8,400, NOT the standard 7% = 9,800 either.
  const r = calc({
    region: 'andalucia',
    price: 140000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 35,
      disability: 'none',
      largeFamily: false,
      singleParentFamily: false,
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 8400);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id),
    ['itp.andalucia.general-habitual']
  );
});

// --- Comunidad Valenciana (standard resale 9%/11% whole cliff at 1M) ---------

test('Valencia V1: clear qualify, cheapest of the two qualifying young rates wins', () => {
  // Both itp.valenciana.young-under35-over180k (8%, no value floor) and
  // itp.valenciana.young-under35-under180k (6%, needs <=180k) qualify at
  // 170,000; the engine picks the cheapest: 6% x 170,000 = 10,200 beats
  // 8% x 170,000 = 13,600. Standard 9% x 170,000 = 15,300; saving 5,100.
  const r = calc({
    region: 'comunidad-valenciana',
    price: 170000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 30,
      firstHome: true,
      ownsOtherHome: false,
      income: 25000,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 10200);
  assert.equal(r.standard.total, 15300);
  assert.equal(r.comparison.saving, 5100);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id),
    ['itp.valenciana.young-under35-under180k']
  );
});

test('Valencia V2: over the income cap, standard-only', () => {
  // income 60,000 fails both young rules' 30,000 EUR cap; family anyOf
  // fails (both false); disability fails ('none'); VPO and gender-violence
  // are lawyer-route only. Standard 9% x 200,000 = 18,000.
  const r = calc({
    region: 'comunidad-valenciana',
    price: 200000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 30,
      firstHome: true,
      ownsOtherHome: false,
      income: 60000,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
    },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.personalised, null);
  assert.equal(r.standard.total, 18000); // 9% x 200,000
});

test('Valencia V3: age boundary, exactly 35 fails both young rules, falls to standard', () => {
  // Both young rules use maxAge 35 with inclusive:false, so age 35 fails
  // both; no other Valencia relief matches this profile -> standard-only
  // at 9% x 170,000 = 15,300.
  const r = calc({
    region: 'comunidad-valenciana',
    price: 170000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 35,
      firstHome: true,
      ownsOtherHome: false,
      income: 25000,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
    },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.standard.total, 15300);
});

// --- Madrid (standard resale 6%; graduated AJD base 0.4/0.5/0.75%) -----------

test('Madrid M1: clear qualify, large-family rate has no value cap', () => {
  // large-family-rate qualifies (priorHomeSaleWindow satisfied via
  // ownsOtherHome: false); habitual-residence-bonif fails its 250k cap.
  // 4% x 400,000 = 16,000; standard 6% x 400,000 = 24,000; saving 8,000.
  const r = calc({
    region: 'madrid',
    price: 400000,
    propertyType: 'resale',
    buyer: { mainHome: true, largeFamily: true, ownsOtherHome: false },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 16000);
  assert.equal(r.standard.total, 24000);
  assert.equal(r.comparison.saving, 8000);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id),
    ['itp.madrid.large-family-rate']
  );
});

test('Madrid M2: over the 250k cap with no large family, standard-only', () => {
  // 10% bonif fails its value cap; large-family fails (not large family);
  // depopulation fails age (40, not <35) and is lawyer-route besides.
  // Standard 6% x 300,000 = 18,000.
  const r = calc({
    region: 'madrid',
    price: 300000,
    propertyType: 'resale',
    buyer: { mainHome: true, largeFamily: false, age: 40 },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.standard.total, 18000);
});

test('Madrid M3: priorHomeSaleWindow withheld, graduated base + 10% bonif still apply', () => {
  // Graduated base qualifies (habitual residence): whole band, 150,000 is
  // over 120k and up to 180k -> 0.5% x 150,000 = 750.
  // 10% bonif qualifies (value under 250k) and stacks: 750 - 75 = 675.
  // 95% large-family bonif is WITHHELD: priorHomeSaleWindow is unknown
  // while the buyer owns another home (ownsOtherHome: true).
  // IVA 10% x 150,000 = 15,000. Personalised total 15,000 + 675 = 15,675.
  // Standard AJD 0.75% x 150,000 = 1,125; standard total 15,000 + 1,125 = 16,125.
  // Saving 450.
  const r = calc({
    region: 'madrid',
    price: 150000,
    propertyType: 'new-build',
    buyer: { mainHome: true, largeFamily: true, ownsOtherHome: true, age: 40 },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 15675);
  assert.equal(r.standard.total, 16125);
  assert.equal(r.comparison.saving, 450);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id).sort(),
    ['ajd.madrid.habitual-residence-bonif', 'ajd.madrid.newbuild-value-graduated-rate']
  );
  assert.ok(r.missingInputs.includes('priorHomeSaleWindow'));
});

// --- Illes Balears (standard resale 8-13% marginal scale) --------------------

test('Balears B1: clear qualify, under the bandCap and the island cap', () => {
  // price 200,000 is under both the 270,151.20 bandCap and the
  // Mallorca/Menorca 331,859.70 eligibility cap, so the flat 4% applies:
  // 4% x 200,000 = 8,000. Standard marginal scale: all of 200,000 sits in
  // the first 8% band (up to 400,000) -> 8% x 200,000 = 16,000. Saving 8,000.
  const r = calc({
    region: 'baleares',
    price: 200000,
    propertyType: 'resale',
    island: 'mallorca-menorca',
    buyer: {
      mainHome: true,
      ownsOtherHome: false,
      age: 40,
      firstHome: false,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
      income: 60000,
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 8000);
  assert.equal(r.standard.total, 16000);
  assert.equal(r.comparison.saving, 8000);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id),
    ['itp.balears.habitual-4pc']
  );
});

test('Balears B2: island-cap split at 340,000, Mallorca fails, Ibiza qualifies', () => {
  // Mallorca/Menorca cap is 331,859.70: 340,000 is over it -> standard-only,
  // standard 8% x 340,000 = 27,200.00.
  const mallorca = calc({
    region: 'baleares',
    price: 340000,
    propertyType: 'resale',
    island: 'mallorca-menorca',
    buyer: {
      mainHome: true,
      ownsOtherHome: false,
      age: 40,
      firstHome: false,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
      income: 60000,
    },
  });
  assert.equal(mallorca.reliefStatus, 'standard-only');
  assert.equal(mallorca.standard.total, 27200);

  // Ibiza/Formentera cap is 378,212: 340,000 qualifies. Band split:
  // 4% x 270,151.20 = 10,806.048 -> rounds to 10,806.05.
  // standard-scale excess = (8% x 340,000) - (8% x 270,151.20)
  //   = 27,200.00 - 21,612.096 -> 21,612.10 = 5,587.90
  // total 10,806.05 + 5,587.90 = 16,393.95
  const ibiza = calc({
    region: 'baleares',
    price: 340000,
    propertyType: 'resale',
    island: 'ibiza-formentera',
    buyer: {
      mainHome: true,
      ownsOtherHome: false,
      age: 40,
      firstHome: false,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
      income: 60000,
    },
  });
  assert.equal(ibiza.reliefStatus, 'relief-applied');
  assert.equal(ibiza.personalised.total, 16393.95);
  assert.equal(ibiza.standard.total, 27200);
});

test('Balears B3: age boundary, exactly 36 fails under-36 but keeps the general 4% rate', () => {
  // under36-first-home-2pc is inclusive:false, so age 36 fails it (must
  // NOT get 2% = 4,000). habitual-4pc has no age condition, so it still
  // applies: 4% x 200,000 = 8,000, not 4,000 and not the standard 16,000.
  const r = calc({
    region: 'baleares',
    price: 200000,
    propertyType: 'resale',
    island: 'mallorca-menorca',
    buyer: {
      mainHome: true,
      ownsOtherHome: false,
      age: 36,
      firstHome: true,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
      income: 60000,
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 8000);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id),
    ['itp.balears.habitual-4pc']
  );
});

// --- Canarias (standard resale 6.5%) ------------------------------------------

test('Canarias C1: clear qualify, 5% rate beats standard', () => {
  // 5% x 180,000 = 9,000; standard 6.5% x 180,000 = 11,700; saving 2,700.
  const r = calc({
    region: 'canarias',
    price: 180000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      ownsOtherHome: false,
      age: 50,
      firstHome: false,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
      income: 60000,
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 9000);
  assert.equal(r.standard.total, 11700);
  assert.equal(r.comparison.saving, 2700);
});

test('Canarias C2: inclusive age boundary at exactly 40, stacks with the 20% bonificacion', () => {
  // under40-bonificacion-20pct uses INCLUSIVE maxAge 40, so an
  // exactly-40 buyer MUST still qualify. 5% x 180,000 = 9,000, then 20%
  // off = -1,800 -> 7,200; effectiveRate 4. Saving 11,700 - 7,200 = 4,500.
  const r = calc({
    region: 'canarias',
    price: 180000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      ownsOtherHome: false,
      age: 40,
      firstHome: true,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
      income: 30000,
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 7200);
  assert.equal(r.personalised.effectiveRate, 4);
  assert.equal(r.comparison.saving, 4500);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id).sort(),
    ['itp.canarias.habitual-residence-5pct', 'itp.canarias.under40-bonificacion-20pct']
  );
});

test('Canarias C3: over the 5% rule value cap, the 20% bonificacion has no base to stack on', () => {
  // 250,000 fails the 5% rule's 200k cap; the 20% bonificacion only
  // stacksOn that rule, which is not available as a base -> standard-only,
  // standard 6.5% x 250,000 = 16,250.
  const r = calc({
    region: 'canarias',
    price: 250000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      ownsOtherHome: false,
      age: 30,
      firstHome: true,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
      income: 30000,
    },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.standard.total, 16250);
});

// --- Region de Murcia (standard resale 7.75%) --------------------------------

test('Murcia Mu1: clear qualify, young-under-40 rate beats standard', () => {
  // 3% x 200,000 = 6,000; standard 7.75% x 200,000 = 15,500; saving 9,500.
  const r = calc({
    region: 'murcia',
    price: 200000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 38,
      income: 30000,
      savingsIncome: 1000,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
    },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.personalised.total, 6000);
  assert.equal(r.standard.total, 15500);
  assert.equal(r.comparison.saving, 9500);
  assert.deepEqual(
    r.personalised.appliedReliefs.map((a) => a.id),
    ['itp.murcia.young-under40-resale']
  );
});

test('Murcia Mu2: strict income boundary, exactly 40,000 fails the general income cap', () => {
  // maxIncome is inclusive:false, so income exactly 40,000 fails it.
  // Nothing else qualifies -> standard-only at 7.75% x 200,000 = 15,500.
  const r = calc({
    region: 'murcia',
    price: 200000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 38,
      income: 40000,
      savingsIncome: 1000,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
    },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.standard.total, 15500);
});

test('Murcia Mu3: savings-cap boundary, exactly 1,800 still qualifies, 1,801 fails', () => {
  // maxSavingsIncome is inclusive (no inclusive:false flag), so 1,800
  // itself passes: 3% x 200,000 = 6,000, same as Mu1.
  const atCap = calc({
    region: 'murcia',
    price: 200000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 38,
      income: 30000,
      savingsIncome: 1800,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
    },
  });
  assert.equal(atCap.reliefStatus, 'relief-applied');
  assert.equal(atCap.personalised.total, 6000);

  const overCap = calc({
    region: 'murcia',
    price: 200000,
    propertyType: 'resale',
    buyer: {
      mainHome: true,
      age: 38,
      income: 30000,
      savingsIncome: 1801,
      largeFamily: false,
      singleParentFamily: false,
      disability: 'none',
    },
  });
  assert.equal(overCap.reliefStatus, 'standard-only');
  assert.equal(overCap.standard.total, 15500);
});

// --- aboveValueCap: honest "above the value limit" signal ---------------------
// Built exactly like the shipped page: VERIFIED rules only, region-available.
// Drives the UI's "above this region's value limit, so the standard rate
// applies" message so an over-cap main-home buyer is not left with a bare
// standard rate and no reason.
const verifiedData = (function () {
  const figs = spine.allFigures().filter((f) => f.status === 'verified');
  const rel = spine.allReliefs().filter((r) => r.status === 'verified');
  const ar = Object.keys(spine.regions).filter((r) => figs.find((f) => f.id === `itp.${r}.resale`));
  const regions = {};
  ar.forEach((r) => (regions[r] = spine.regions[r]));
  return {
    regions,
    figures: figs.filter((f) => f.region === 'national' || ar.includes(f.region)),
    reliefs: rel.filter((r) => ar.includes(r.region)),
  };
})();

function calcV(inputs) {
  const r = ELSCalc.calculatePersonalisedITP(verifiedData, inputs);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  return r;
}

test('aboveValueCap: Andalucia main home over the 150k/250k caps flags the value limit', () => {
  const r = calcV({
    region: 'andalucia', price: 350000, propertyType: 'resale',
    buyer: { mainHome: true, age: 30, firstHome: true, ownsOtherHome: false, income: 20000, disability: 'none', largeFamily: false, singleParentFamily: false },
  });
  assert.equal(r.reliefStatus, 'standard-only');
  assert.equal(r.aboveValueCap, true);
});

test('aboveValueCap: Andalucia under the cap applies a relief, no cap flag', () => {
  const r = calcV({
    region: 'andalucia', price: 140000, propertyType: 'resale',
    buyer: { mainHome: true, age: 30, firstHome: true, ownsOtherHome: false, income: 20000, disability: 'none', largeFamily: false, singleParentFamily: false },
  });
  assert.equal(r.reliefStatus, 'relief-applied');
  assert.equal(r.aboveValueCap, false);
});

test('aboveValueCap: Catalunya (no property-value cap) never flags the value limit', () => {
  const r = calcV({
    region: 'catalunya', price: 900000, propertyType: 'resale',
    buyer: { mainHome: true, age: 50, firstHome: false, ownsOtherHome: true, income: 90000, disability: 'none', largeFamily: false, singleParentFamily: false },
  });
  assert.equal(r.aboveValueCap, false);
});

test('aboveValueCap: a not-main-home purchase stays unavailable and sets no cap flag', () => {
  const r = calcV({ region: 'andalucia', price: 350000, propertyType: 'resale', buyer: { mainHome: false } });
  assert.equal(r.reliefStatus, 'reliefs-unavailable');
  assert.equal(r.aboveValueCap, false);
});
