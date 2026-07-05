/*
 * itp-fixtures.js - worked examples the engine must reproduce exactly
 * ---------------------------------------------------------------------------
 * Each fixture is a hand-worked calculation: inputs, the expected total to
 * the cent, the expected effective rate and the number of breakdown lines.
 *
 * WHAT THESE PROVE (and what they don't): fixtures lock the ENGINE'S MATHS
 * against the figures currently in the spine. They do NOT prove the figures
 * match real law - that is Olivia's verification pass (draft -> verified).
 * When a figure changes after verification, re-work the affected fixtures
 * by hand and update them in the same commit.
 *
 * Regions whose figures are still draft are exercised through the seed
 * figures; add one fixture per region as its figures land.
 * ---------------------------------------------------------------------------
 */

'use strict';

module.exports = [
  // --- Catalunya: banded, marginal (each rate taxes its own slice) ----------
  {
    name: 'Catalunya resale €400,000 sits entirely in the first band',
    inputs: { region: 'catalunya', price: 400000, propertyType: 'resale' },
    expected: { total: 40000, effectiveRate: 10, lineCount: 1 },
  },
  {
    name: 'Catalunya resale €600,000 exactly - boundary stays inside band 1',
    inputs: { region: 'catalunya', price: 600000, propertyType: 'resale' },
    expected: { total: 60000, effectiveRate: 10, lineCount: 1 },
  },
  {
    name: 'Catalunya resale €600,001 - 11% applies to €1 only (marginal, not whole)',
    inputs: { region: 'catalunya', price: 600001, propertyType: 'resale' },
    expected: { total: 60000.11, effectiveRate: 10, lineCount: 2 },
  },
  {
    name: 'Catalunya resale €1,000,000 - three bands: 60,000 + 33,000 + 12,000',
    inputs: { region: 'catalunya', price: 1000000, propertyType: 'resale' },
    expected: { total: 105000, effectiveRate: 10.5, lineCount: 3 },
  },
  {
    name: 'Catalunya resale €2,000,000 - all four bands: 60,000 + 33,000 + 72,000 + 65,000',
    inputs: { region: 'catalunya', price: 2000000, propertyType: 'resale' },
    expected: { total: 230000, effectiveRate: 11.5, lineCount: 4 },
  },

  // --- Madrid: flat rate ------------------------------------------------------
  {
    name: 'Madrid resale €500,000 at flat 6%',
    inputs: { region: 'madrid', price: 500000, propertyType: 'resale' },
    expected: { total: 30000, effectiveRate: 6, lineCount: 1 },
  },

  // --- New build: IVA + AJD, never ITP ----------------------------------------
  {
    name: 'Madrid new-build €300,000 - IVA €30,000 + AJD 0.75% €2,250',
    inputs: { region: 'madrid', price: 300000, propertyType: 'new-build' },
    expected: { total: 32250, effectiveRate: 10.75, lineCount: 2 },
  },

  // --- Comunidad Valenciana: banded, WHOLE (a cliff, not tranches) -------------
  // One rate is picked by the total and applied to the ENTIRE price.
  {
    name: 'Valencia resale €650,000 pays 9% on the whole price',
    inputs: { region: 'comunidad-valenciana', price: 650000, propertyType: 'resale' },
    expected: { total: 58500, effectiveRate: 9, lineCount: 1 },
  },
  {
    name: 'Valencia resale €1,000,000 exactly stays at 9% (whole)',
    inputs: { region: 'comunidad-valenciana', price: 1000000, propertyType: 'resale' },
    expected: { total: 90000, effectiveRate: 9, lineCount: 1 },
  },
  {
    name: 'Valencia resale €1,000,001 - the 11% cliff taxes the WHOLE price',
    inputs: { region: 'comunidad-valenciana', price: 1000001, propertyType: 'resale' },
    expected: { total: 110000.11, effectiveRate: 11, lineCount: 1 },
  },

  // --- Illes Balears: banded, marginal (five bands) ----------------------------
  {
    name: 'Balears resale €700,000 - 32,000 + 18,000 + 10,000 (the ATIB-style worked example)',
    inputs: { region: 'baleares', price: 700000, propertyType: 'resale' },
    expected: { total: 60000, effectiveRate: 8.57, lineCount: 3 },
  },

  // --- Flat-rate regions -------------------------------------------------------
  {
    name: 'Andalucía resale €300,000 at flat 7%',
    inputs: { region: 'andalucia', price: 300000, propertyType: 'resale' },
    expected: { total: 21000, effectiveRate: 7, lineCount: 1 },
  },
  {
    name: 'Canary Islands resale €400,000 at flat 6.5%',
    inputs: { region: 'canarias', price: 400000, propertyType: 'resale' },
    expected: { total: 26000, effectiveRate: 6.5, lineCount: 1 },
  },
  {
    name: 'Murcia resale €200,000 at flat 7.75%',
    inputs: { region: 'murcia', price: 200000, propertyType: 'resale' },
    expected: { total: 15500, effectiveRate: 7.75, lineCount: 1 },
  },

  // --- New build: Canarias pays IGIC (not IVA) + AJD ---------------------------
  {
    name: 'Canary Islands new-build €300,000 - IGIC 7% €21,000 + AJD 1% €3,000',
    inputs: { region: 'canarias', price: 300000, propertyType: 'new-build' },
    expected: { total: 24000, effectiveRate: 8, lineCount: 2 },
  },
  {
    name: 'Catalunya new-build €300,000 - IVA €30,000 + AJD 1.5% €4,500',
    inputs: { region: 'catalunya', price: 300000, propertyType: 'new-build' },
    expected: { total: 34500, effectiveRate: 11.5, lineCount: 2 },
  },

  // --- Rounding: integer-cents maths, half-up per line ------------------------
  {
    name: 'Madrid resale €123,456.78 - 6% = €7,407.41 (rounded half-up to the cent)',
    inputs: { region: 'madrid', price: 123456.78, propertyType: 'resale' },
    expected: { total: 7407.41, effectiveRate: 6, lineCount: 1 },
  },
];
