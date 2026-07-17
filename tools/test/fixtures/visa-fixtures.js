/*
 * visa-fixtures.js - hand-worked eligibility scenarios and synthetic rules
 * ---------------------------------------------------------------------------
 * Two things live here:
 *
 *   1. makeRule / makeCriterion / testFigures - builders for SYNTHETIC
 *      verified rules, used to pin engine mechanics (tri-state, anyOf,
 *      lawyer-route, draft gating) without depending on the real visa data.
 *
 *   2. scenarios - hand-worked expectations against the REAL spine rules
 *      (digital nomad + non-lucrative), evaluated with includeDrafts (the
 *      real rules are draft until Olivia verifies them). The arithmetic for
 *      every threshold is stated in a comment: a human worked the number,
 *      the engine must reproduce it. If the SMI or IPREM figure changes,
 *      re-work these BY HAND in the same commit (see tools/TOOLS-NOTES.md,
 *      same discipline as the ITP fixtures).
 *
 * Threshold arithmetic used below (2026 figures, both draft):
 *   SMI monthly    1,221.00
 *     DNV floor    200%           = 2,442.00 / month
 *     +1 dependant +75%  (915.75) = 3,357.75 / month
 *     +2 dependants +25% (305.25) = 3,663.00 / month
 *   IPREM monthly    600.00
 *     NLV floor    400%           = 2,400.00 / month
 *     +1 dependant +100% (600.00) = 3,000.00 / month
 *     savings, 12 months, alone   = 28,800.00
 *     savings, 12 months, 1 dep   = 36,000.00
 * ---------------------------------------------------------------------------
 */

'use strict';

const OFFICIAL_URL = 'https://www.inclusion.gob.es/test-fixture';

function provenance(status) {
  return {
    effectiveFrom: '2025-01-01',
    reviewBy: '2030-01-01',
    source: { url: OFFICIAL_URL, title: 'test fixture source', accessed: '2026-07-06' },
    note: 'synthetic test fixture',
    status: status || 'verified',
  };
}

// A synthetic criterion: pass overrides on top of a verified boolean base.
function makeCriterion(overrides) {
  return Object.assign(
    {
      id: 'visa.synthetic.criterion',
      type: 'healthInsurance',
      value: true,
      label: 'synthetic criterion',
    },
    provenance(),
    overrides || {}
  );
}

// A synthetic rule: verified, applies to everyone non-EEA, one criterion
// unless overridden.
function makeRule(overrides) {
  return Object.assign(
    {
      id: 'visa.synthetic',
      label: 'Synthetic visa',
      officialName: 'Visado sintético',
      summary: 'A synthetic rule for engine tests.',
      applicability: { uk: 'applies', us: 'applies', 'eea-swiss': 'not-needed', other: 'applies' },
      criteria: [makeCriterion()],
      nextSteps: ['synthetic step'],
    },
    provenance(),
    overrides || {}
  );
}

// The one figure synthetic threshold criteria reference: a round 1,000/month
// so every threshold is mental arithmetic (multiple 2 -> 2,000; +0.5 first
// dependant -> 2,500; 12 months -> 24,000 / 30,000).
const testFigures = [
  Object.assign(
    {
      id: 'income-refs.test-monthly',
      label: 'test monthly reference',
      region: 'national',
      unit: 'eur-per-month',
      value: 1000,
    },
    provenance()
  ),
];

const conditionTypes = {
  askable: [
    'minIncomeMultiple',
    'minSavingsMultiple',
    'remoteEmployeeOfForeignCompany',
    'maxSpanishClientsSharePercent',
    'employmentRelationshipMonths',
    'universityDegree',
    'professionalExperienceYears',
    'healthInsurance',
    'cleanCriminalRecord',
    'noWorkInSpain',
    'medicalCertificate',
    'admittedToStudies',
    'jobOfferInSpain',
    'familyMemberSpanishResident',
    'yearsLivingInSpain',
    'innovativeBusinessProject',
  ],
  lawyerRoute: [
    'arraigoVariantAssessment',
    'familyDependencyProof',
    'sponsorMeansAndHousing',
    'exceptionalCircumstances',
  ],
};

// Answers that satisfy every real digital-nomad criterion, single applicant.
const dnvSatisfied = {
  nationality: 'us',
  remoteEmployeeOfForeignCompany: true,
  employmentRelationshipMonths: 12,
  universityDegree: true,
  monthlyIncome: 3000, // > 2,442.00 floor
  dependants: 0,
  healthInsurance: true,
  cleanCriminalRecord: true,
};

// Answers that satisfy every real non-lucrative criterion via the savings
// leg, single applicant.
const nlvSatisfied = {
  nationality: 'uk',
  savings: 28800, // exactly 400% x 600 x 12
  dependants: 0,
  noWorkInSpain: true,
  healthInsurance: true,
  cleanCriminalRecord: true,
  medicalCertificate: true,
};

/*
 * Hand-worked scenarios against the REAL spine (run with includeDrafts).
 * expected.outcome is checked exactly; expected.missing (when present) must
 * equal the rule's missingInputs; expected.failed likewise.
 */
const scenarios = [
  {
    name: 'DNV: everything satisfied, single applicant -> eligible',
    visa: 'visa.digital-nomad',
    answers: dnvSatisfied,
    expected: { outcome: 'eligible' },
  },
  {
    name: 'DNV: income exactly on the 2,442.00 floor (200% x 1,221) -> eligible (at-or-over)',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, { monthlyIncome: 2442 }),
    expected: { outcome: 'eligible' },
  },
  {
    name: 'DNV: a cent under the floor (2,441.99) -> not-eligible',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, { monthlyIncome: 2441.99 }),
    expected: { outcome: 'not-eligible', failed: ['visa.digital-nomad.income'] },
  },
  {
    name: 'DNV: 1 dependant raises the bar to 3,357.75 (2,442 + 915.75); 3,357.75 -> eligible',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, { monthlyIncome: 3357.75, dependants: 1 }),
    expected: { outcome: 'eligible' },
  },
  {
    name: 'DNV: 3,357.74 with 1 dependant -> not-eligible',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, { monthlyIncome: 3357.74, dependants: 1 }),
    expected: { outcome: 'not-eligible', failed: ['visa.digital-nomad.income'] },
  },
  {
    name: 'DNV: 2 dependants -> 3,663.00 (2,442 + 915.75 + 305.25); 3,663 -> eligible',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, { monthlyIncome: 3663, dependants: 2 }),
    expected: { outcome: 'eligible' },
  },
  {
    name: 'DNV: income above the floor but dependants unanswered -> need-more-info, never eligible',
    visa: 'visa.digital-nomad',
    answers: (function () {
      const a = Object.assign({}, dnvSatisfied, { monthlyIncome: 100000 });
      delete a.dependants;
      return a;
    })(),
    expected: { outcome: 'need-more-info', missing: ['dependants'] },
  },
  {
    name: 'DNV: income below the floor with dependants unanswered -> not-eligible (the bar only rises)',
    visa: 'visa.digital-nomad',
    answers: (function () {
      const a = Object.assign({}, dnvSatisfied, { monthlyIncome: 2000 });
      delete a.dependants;
      return a;
    })(),
    expected: { outcome: 'not-eligible' },
  },
  {
    name: 'DNV: employee no, but self-employed with 20% Spanish clients (at the cap) -> eligible',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, {
      remoteEmployeeOfForeignCompany: false,
      spanishClientsSharePercent: 20,
    }),
    expected: { outcome: 'eligible' },
  },
  {
    name: 'DNV: employee no, self-employed 21% Spanish clients -> not-eligible (anyOf both fail)',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, {
      remoteEmployeeOfForeignCompany: false,
      spanishClientsSharePercent: 21,
    }),
    expected: { outcome: 'not-eligible' },
  },
  {
    name: 'DNV: no degree but 3 years experience -> eligible (the anyOf alternative)',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, {
      universityDegree: false,
      professionalExperienceYears: 3,
    }),
    expected: { outcome: 'eligible' },
  },
  {
    name: 'DNV: no degree, 2 years experience -> not-eligible',
    visa: 'visa.digital-nomad',
    answers: Object.assign({}, dnvSatisfied, {
      universityDegree: false,
      professionalExperienceYears: 2,
    }),
    expected: { outcome: 'not-eligible' },
  },
  {
    name: 'NLV: savings route exactly on 28,800 (400% x 600 x 12), alone -> eligible',
    visa: 'visa.non-lucrative',
    answers: nlvSatisfied,
    expected: { outcome: 'eligible' },
  },
  {
    name: 'NLV: 36,000 with 1 dependant (28,800 + 600 x 12) -> eligible',
    visa: 'visa.non-lucrative',
    answers: Object.assign({}, nlvSatisfied, { savings: 36000, dependants: 1 }),
    expected: { outcome: 'eligible' },
  },
  {
    name: 'NLV: 35,999 with 1 dependant -> need-more-info (monthly income could still qualify)',
    visa: 'visa.non-lucrative',
    answers: Object.assign({}, nlvSatisfied, { savings: 35999, dependants: 1 }),
    expected: { outcome: 'need-more-info', missing: ['monthlyIncome'] },
  },
  {
    name: 'NLV: income route, 2,400.00 monthly alone (400% x 600) -> eligible',
    visa: 'visa.non-lucrative',
    answers: (function () {
      const a = Object.assign({}, nlvSatisfied, { monthlyIncome: 2400 });
      delete a.savings;
      return a;
    })(),
    expected: { outcome: 'eligible' },
  },
  {
    name: 'NLV: both means legs fail (2,399.99 income, 28,799 savings) -> not-eligible',
    visa: 'visa.non-lucrative',
    answers: Object.assign({}, nlvSatisfied, { monthlyIncome: 2399.99, savings: 28799 }),
    expected: { outcome: 'not-eligible' },
  },
  {
    name: 'NLV: intends to work in Spain -> not-eligible however good the means',
    visa: 'visa.non-lucrative',
    answers: Object.assign({}, nlvSatisfied, { noWorkInSpain: false }),
    expected: { outcome: 'not-eligible', failed: ['visa.non-lucrative.no-work'] },
  },

  // --- the six delegated visas: encoding pins -------------------------------
  {
    name: 'Student: admitted, 600.00 monthly (100% x 600 IPREM), alone -> eligible',
    visa: 'visa.student',
    answers: {
      nationality: 'us',
      admittedToStudies: true,
      monthlyIncome: 600,
      dependants: 0,
      healthInsurance: true,
      cleanCriminalRecord: true,
      medicalCertificate: true,
    },
    expected: { outcome: 'eligible' },
  },
  {
    name: 'Student: 599.99 monthly, savings and medical certificate unanswered -> need-more-info',
    visa: 'visa.student',
    answers: {
      nationality: 'us',
      admittedToStudies: true,
      monthlyIncome: 599.99,
      dependants: 0,
      healthInsurance: true,
      cleanCriminalRecord: true,
    },
    expected: { outcome: 'need-more-info', missing: ['savings', 'medicalCertificate'] },
  },
  {
    name: 'Work permit: everything satisfied -> STILL need-more-info with the lawyer-route flag (the national employment test can never auto-grant)',
    visa: 'visa.work-employee',
    answers: {
      nationality: 'uk',
      jobOfferInSpain: true,
      universityDegree: true,
      cleanCriminalRecord: true,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'Family reunification: sponsor income 900.00 (150% x 600), applicant alone, all answered -> need-more-info via the housing lawyer-route, never eligible',
    visa: 'visa.family-reunification',
    answers: {
      nationality: 'other',
      familyMemberSpanishResident: true,
      monthlyIncome: 900,
      dependants: 0,
      healthInsurance: true,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'Family reunification: one extra member raises the bar to 1,200.00 (150% + 50% of 600); 1,199.99 -> not-eligible (the first:0.5 encoding fix)',
    visa: 'visa.family-reunification',
    answers: {
      nationality: 'other',
      familyMemberSpanishResident: true,
      monthlyIncome: 1199.99,
      dependants: 1,
      healthInsurance: true,
    },
    expected: { outcome: 'not-eligible', failed: ['visa.family-reunification.means'] },
  },
  {
    name: 'Arraigo: under two years but a family tie -> stays open as need-more-info with the lawyer route (the anyOf fix)',
    visa: 'visa.arraigo',
    answers: {
      nationality: 'other',
      yearsLivingInSpain: 1,
      familyMemberSpanishResident: true,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'Arraigo: under two years and no family tie -> not-eligible',
    visa: 'visa.arraigo',
    answers: {
      nationality: 'other',
      yearsLivingInSpain: 1,
      familyMemberSpanishResident: false,
    },
    expected: { outcome: 'not-eligible' },
  },
  {
    name: 'Arraigo: three years in Spain -> need-more-info, never eligible (variant assessment is a lawyer route)',
    visa: 'visa.arraigo',
    answers: {
      nationality: 'other',
      yearsLivingInSpain: 3,
      familyMemberSpanishResident: false,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'Entrepreneur: project, 600.00 monthly (100% x 600 IPREM, corrected 2026-07-14), alone, compliant -> eligible',
    visa: 'visa.entrepreneur',
    answers: {
      nationality: 'us',
      innovativeBusinessProject: true,
      monthlyIncome: 600,
      dependants: 0,
      healthInsurance: true,
      cleanCriminalRecord: true,
    },
    expected: { outcome: 'eligible' },
  },
  {
    name: 'Entrepreneur: project, 599.99 monthly (below the corrected 100% x 600 bar), savings unanswered -> need-more-info',
    visa: 'visa.entrepreneur',
    answers: {
      nationality: 'us',
      innovativeBusinessProject: true,
      monthlyIncome: 599.99,
      dependants: 0,
      healthInsurance: true,
      cleanCriminalRecord: true,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'Blue Card: job offer + degree + clean record, salary is a lawyer-route -> need-more-info, never eligible',
    visa: 'visa.blue-card',
    answers: {
      nationality: 'uk',
      jobOfferInSpain: true,
      universityDegree: true,
      cleanCriminalRecord: true,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'Family of a Spanish national: family tie answered, relationship is a lawyer-route -> need-more-info, never eligible',
    visa: 'visa.familiar-espanol',
    answers: {
      nationality: 'us',
      familyMemberSpanishResident: true,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'Self-employed (autonomo): clean record answered, viability is a lawyer-route -> need-more-info, never eligible',
    visa: 'visa.self-employed',
    answers: {
      nationality: 'uk',
      cleanCriminalRecord: true,
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'EU family member: relationship is a lawyer-route -> need-more-info, never eligible',
    visa: 'visa.eu-family-member',
    answers: {
      nationality: 'us',
    },
    expected: { outcome: 'need-more-info' },
  },
  {
    name: 'EU registration: EEA citizen working in Spain -> eligible (the one route that evaluates for eea-swiss)',
    visa: 'visa.eu-registration',
    answers: { nationality: 'eea-swiss', jobOfferInSpain: true },
    expected: { outcome: 'eligible' },
  },
  {
    name: 'EU registration: not-applicable for a UK citizen (post-Brexit third country)',
    visa: 'visa.eu-registration',
    answers: { nationality: 'uk' },
    expected: { outcome: 'not-applicable' },
  },
];

module.exports = {
  makeRule,
  makeCriterion,
  provenance,
  testFigures,
  conditionTypes,
  scenarios,
  dnvSatisfied,
  nlvSatisfied,
};
