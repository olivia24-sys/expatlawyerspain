/*
 * relief-fixtures.js - hand-worked personalised-calculator examples
 * ---------------------------------------------------------------------------
 * Same discipline as itp-fixtures.js: every expected number was worked by
 * hand (calculator + paper), never copied from test output. If a rate or
 * rule changes, re-work the affected fixture yourself in the same commit.
 *
 * These run against the REAL spine rules with { includeDrafts: true },
 * because the launch rules are status 'draft' until Olivia verifies them.
 * They lock the MATHS and the evaluator behaviour, not legal correctness -
 * that is Olivia's verification pass (tools/RELIEFS-NOTES.md).
 *
 * Shape: { name, inputs: { region, price, propertyType, island?, buyer },
 *          expected: { reliefStatus, total?, saving?, appliedIds?,
 *                      missingInputs?, otherSituationHint? } }
 * `total` is the personalised total when a relief applies, and is omitted
 * for standard-only outcomes (the standard total is itp-fixtures' job).
 */

'use strict';

module.exports = [
  {
    // Catalunya resale €350,000: standard = 10% x 350,000 = €35,000.
    // Young-buyer 5% -> €17,500. Family/disability rules stay 'potential'
    // (their inputs unanswered) so their types appear in missingInputs.
    name: 'catalunya young buyer qualifies: 5% instead of the 10-13% scale',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: { mainHome: true, age: 30, income: 30000 },
    },
    expected: {
      reliefStatus: 'relief-applied',
      total: 17500,
      saving: 17500,
      appliedIds: ['itp.catalunya.young-buyer'],
      missingInputs: ['disability', 'largeFamily', 'singleParentFamily'],
      otherSituationHint: true, // VPO + gender-violence rules exist, never asked
    },
  },
  {
    // Same buyer but income above every Catalan cap: nothing applies.
    name: 'catalunya over-income young buyer stays on the standard scale',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: {
        mainHome: true,
        age: 30,
        income: 40000,
        largeFamily: false,
        singleParentFamily: false,
        disability: 'none',
      },
    },
    expected: {
      reliefStatus: 'standard-only',
      missingInputs: [],
      otherSituationHint: true,
    },
  },
  {
    // Large family, 50 years old, income under the €36,000 household cap.
    name: 'catalunya large family qualifies at any age',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: { mainHome: true, age: 50, income: 30000, largeFamily: true },
    },
    expected: {
      reliefStatus: 'relief-applied',
      total: 17500,
      saving: 17500,
      appliedIds: ['itp.catalunya.large-family'],
    },
  },
  {
    // Single parent, same maths as large family.
    name: 'catalunya single-parent family qualifies',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: { mainHome: true, age: 40, income: 25000, singleParentFamily: true },
    },
    expected: {
      reliefStatus: 'relief-applied',
      total: 17500,
      appliedIds: ['itp.catalunya.single-parent-family'],
    },
  },
  {
    // Disability 65%+ with household income at the (unconfirmed) €30,000 cap.
    name: 'catalunya disability 65%+ qualifies under the 30,000 cap',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: { mainHome: true, age: 45, income: 30000, disability: '65plus' },
    },
    expected: {
      reliefStatus: 'relief-applied',
      total: 17500,
      appliedIds: ['itp.catalunya.disability'],
    },
  },
  {
    // Disability declared as 33-64%: strictly below the Catalan 65%
    // threshold, so the condition definitively fails - standard rate.
    name: 'catalunya disability 33-64% does not meet the 65% threshold',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: {
        mainHome: true,
        age: 45,
        income: 25000,
        disability: '33to64',
        largeFamily: false,
        singleParentFamily: false,
      },
    },
    expected: {
      reliefStatus: 'standard-only',
    },
  },
  {
    // New-build €300,000: standard = IVA 10% (€30,000) + AJD 1.5% (€4,500)
    // = €34,500. Young-buyer 100% AJD bonification wipes the AJD line;
    // IVA stays - reliefs never touch the national IVA.
    name: 'catalunya new-build: young buyer AJD wiped to zero, IVA intact',
    inputs: {
      region: 'catalunya',
      price: 300000,
      propertyType: 'new-build',
      buyer: { mainHome: true, age: 30, income: 30000 },
    },
    expected: {
      reliefStatus: 'relief-applied',
      total: 30000,
      saving: 4500,
      appliedIds: ['itp.catalunya.young-buyer-newbuild-ajd'],
    },
  },
  {
    // Holiday home: the gate closes everything, standard rate only.
    name: 'catalunya holiday home: reliefs unavailable, no questions asked',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: { mainHome: false, age: 30, income: 30000 },
    },
    expected: {
      reliefStatus: 'reliefs-unavailable',
      missingInputs: [],
    },
  },
  {
    // No refine answers at all: instant standard number, missingInputs
    // tells the UI which questions could change it.
    name: 'catalunya with no refine answers: standard number, asks listed',
    inputs: {
      region: 'catalunya',
      price: 350000,
      propertyType: 'resale',
      buyer: {},
    },
    expected: {
      reliefStatus: 'standard-only',
      missingInputs: [
        'disability',
        'habitualResidence',
        'largeFamily',
        'maxAge',
        'maxHouseholdIncome',
        'maxIncome',
        'singleParentFamily',
      ],
      otherSituationHint: true,
    },
  },
];
