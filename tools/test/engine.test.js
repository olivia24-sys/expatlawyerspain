/*
 * engine.test.js - unit tests for js/calc-engine.js
 * Run all tests from the repo root:   node --test tools/test/
 * Zero dependencies: node:test + node:assert (Node 20+).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ELSCalc = require('../../js/calc-engine.js');
const spine = require('../legal-data/index.js');
const fixtures = require('./fixtures/itp-fixtures.js');

// The engine receives the same shape the page embeds: regions + figures.
// Tests run against the full spine (drafts included) - fixtures lock the
// maths, not real-law correctness; that is Olivia's verification pass.
const data = { regions: spine.regions, figures: spine.allFigures() };

// --- fixtures: every worked example must reproduce exactly -------------------

test('fixtures reproduce to the cent', async (t) => {
  for (const fx of fixtures) {
    await t.test(fx.name, () => {
      const r = ELSCalc.calculateITP(data, fx.inputs);
      assert.equal(r.ok, true, `expected ok result, got ${JSON.stringify(r)}`);
      assert.equal(r.total, fx.expected.total, 'total');
      assert.equal(r.effectiveRate, fx.expected.effectiveRate, 'effectiveRate');
      assert.equal(r.lines.length, fx.expected.lineCount, 'lineCount');
      // The printed breakdown must sum to the total, to the cent.
      const sum = r.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
      assert.equal(sum, Math.round(r.total * 100), 'lines sum to total');
    });
  }
});

// --- band maths ---------------------------------------------------------------

test('applyBands marginal: slices are taxed independently', () => {
  const bands = [
    { upTo: 100, rate: 10 },
    { upTo: null, rate: 20 },
  ];
  const r = ELSCalc.applyBands(bands, 'marginal', 150);
  assert.equal(r.total, 10 + 10); // 100@10% + 50@20%
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[1].taxableBase, 50);
});

test('applyBands whole: one rate picked by the total, applied to everything', () => {
  const bands = [
    { upTo: 100, rate: 10 },
    { upTo: null, rate: 20 },
  ];
  const r = ELSCalc.applyBands(bands, 'whole', 150);
  assert.equal(r.total, 30); // 150 @ 20%
  assert.equal(r.steps.length, 1);
});

test('applyBands whole: boundary value takes the lower band', () => {
  const bands = [
    { upTo: 100, rate: 10 },
    { upTo: null, rate: 20 },
  ];
  assert.equal(ELSCalc.applyBands(bands, 'whole', 100).total, 10);
});

test('applyFlatRate', () => {
  const r = ELSCalc.applyFlatRate(6, 500000);
  assert.equal(r.total, 30000);
  assert.equal(r.steps.length, 1);
});

test('malformed band data throws (build bug, must fail loudly)', () => {
  assert.throws(() => ELSCalc.applyBands([{ upTo: 100, rate: 10 }], 'marginal', 50)); // 1 band
  assert.throws(() =>
    ELSCalc.applyBands([{ upTo: 100, rate: 10 }, { upTo: 50, rate: 20 }], 'marginal', 200)
  ); // descending
  assert.throws(() =>
    ELSCalc.applyBands([{ upTo: 100, rate: 10 }, { upTo: null, rate: 20 }], 'progressive', 50)
  ); // bad bandType
});

// --- the result contract ---------------------------------------------------------

test('resale result shows the working: lines, figures, sources', () => {
  const r = ELSCalc.calculateITP(data, { region: 'catalunya', price: 1000000, propertyType: 'resale' });
  assert.equal(r.ok, true);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.regionLabel, 'Catalunya');
  for (const line of r.lines) {
    assert.ok(line.label.length > 0);
    assert.equal(line.figureId, 'itp.catalunya.resale');
  }
  assert.equal(r.figuresUsed.length, 1);
  assert.ok(r.figuresUsed[0].source.url.startsWith('https://'));
  assert.ok(r.figuresUsed[0].reviewBy);
  // Catalunya carries the large-holder caveat as a user-facing note.
  assert.ok(r.notes.length >= 1);
});

test('new-build result uses IVA + AJD figures, never ITP', () => {
  const r = ELSCalc.calculateITP(data, { region: 'madrid', price: 300000, propertyType: 'new-build' });
  assert.equal(r.ok, true);
  const ids = r.figuresUsed.map((f) => f.id);
  assert.deepEqual(ids, ['itp.national.new-build-iva', 'itp.madrid.new-build-ajd']);
  assert.ok(!ids.some((id) => id.endsWith('.resale')));
  assert.ok(r.lines[0].label.startsWith('IVA'));
  assert.ok(r.lines[1].label.startsWith('AJD'));
});

// --- error paths: bad input returns { ok: false }, never throws -------------------

test('unknown region', () => {
  const r = ELSCalc.calculateITP(data, { region: 'atlantis', price: 100000, propertyType: 'resale' });
  assert.deepEqual(r, { ok: false, error: 'unknown-region' });
});

test('region without a resale figure yet', () => {
  const r = ELSCalc.calculateITP(data, { region: 'galicia', price: 100000, propertyType: 'resale' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'figure-missing');
  assert.equal(r.missing, 'itp.galicia.resale');
});

test('region without an AJD figure: new-build says which figure is missing', () => {
  const r = ELSCalc.calculateITP(data, { region: 'catalunya', price: 100000, propertyType: 'new-build' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'figure-missing');
  assert.equal(r.missing, 'itp.catalunya.new-build-ajd');
});

test('new-build in IGIC/IPSI territories refuses to apply mainland IVA', () => {
  for (const region of ['canarias', 'ceuta', 'melilla']) {
    const r = ELSCalc.calculateITP(data, { region, price: 300000, propertyType: 'new-build' });
    assert.equal(r.ok, false, region);
    assert.equal(r.error, 'iva-not-applicable', region);
  }
});

test('invalid price', () => {
  for (const price of [0, -5, NaN, Infinity, '300000', undefined]) {
    const r = ELSCalc.calculateITP(data, { region: 'madrid', price, propertyType: 'resale' });
    assert.deepEqual(r, { ok: false, error: 'invalid-price' }, `price=${price}`);
  }
});

test('invalid property type', () => {
  const r = ELSCalc.calculateITP(data, { region: 'madrid', price: 100000, propertyType: 'off-plan' });
  assert.deepEqual(r, { ok: false, error: 'invalid-property-type' });
});

// --- formatting helper -----------------------------------------------------------

test('fmtEUR', () => {
  assert.equal(ELSCalc.fmtEUR(600000), '€600,000');
  assert.equal(ELSCalc.fmtEUR(60000.11), '€60,000.11');
  assert.equal(ELSCalc.fmtEUR(7407.41), '€7,407.41');
});
