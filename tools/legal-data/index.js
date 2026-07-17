/*
 * tools/legal-data/index.js - THE LEGAL-DATA SPINE (entry point)
 * ---------------------------------------------------------------------------
 * One structured source of truth for Spain's legal figures: tax rates,
 * thresholds, official fees. Every ELS surface that shows a figure (the
 * calculators, and over time the money pages and blog fact-checks) reads
 * from here. No figure is ever hardcoded inside a calculator or a page.
 *
 * THE ONE RULE: a figure cannot enter the spine without a source URL,
 * an effective date, a review-by date and a note. tools/validate-legal-data.js
 * enforces it and rejects anything unsourced.
 *
 * A figure can only be marked status: 'verified' when its source is an
 * OFFICIAL tax-authority page (AEAT or a regional hacienda / agencia
 * tributaria - see officialSourceHosts below). Law-firm blogs and
 * aggregators are never a verifying source; a figure that only appears on
 * a secondary site stays 'draft'.
 *
 * Domain files (one per topic) live next to this file: itp.js today,
 * beckham.js / visa-fees.js etc. later. Add the require() below when you
 * add one. See tools/TOOLS-NOTES.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const domains = {
  itp: require('./itp.js'),
  'income-refs': require('./income-refs.js'),
};

// Relief rules (v2, the personalised calculator): reduced rates and
// bonifications keyed to a buyer's circumstances. Same one rule, same
// draft/verified gate as figures. See itp-reliefs.js for the shape.
const reliefDomains = {
  itp: require('./itp-reliefs.js'),
};

// Condition vocabulary for relief rules. 'askable' types map to a calculator
// input; 'lawyerRoute' types are never asked - a verified rule carrying one
// only ever surfaces as the "other situation? a lawyer can confirm" path.
const reliefConditionTypes = {
  askable: [
    'maxAge',
    'habitualResidence',
    'firstHome',
    'noPriorPropertyOwnership',
    'maxIncome',
    'maxHouseholdIncome',
    'maxSavingsIncome',
    'maxPropertyValue',
    'disability',
    'largeFamily',
    'singleParentFamily',
    'priorRegionResidenceYears',
    'mortgageLtvMin',
  ],
  lawyerRoute: [
    'vpoProtectedHousing',
    'genderViolenceVictim',
    'ruralDepopulatedArea',
    'terrorismVictim',
    'priorHomeSaleWindow',
  ],
};

const reliefTracks = ['resale', 'newbuild-ajd', 'newbuild-igic'];

// Eligibility domains (the decision engine, js/eligibility-engine.js):
// rule sets evaluated tri-state against a person's answers. Visas today;
// a process-checklist or any future eligibility tool adds a domain file
// with the same shape. See visas.js for the full field documentation.
const eligibilityDomains = {
  visa: require('./visas.js'),
};

// Condition vocabulary for eligibility criteria. 'askable' types map to a
// checker question; 'lawyerRoute' types are never asked - a rule carrying
// one never auto-grants, it surfaces as "a lawyer can confirm" + CTA.
// Keep in sync with CRITERION_KINDS in js/eligibility-engine.js.
const eligibilityConditionTypes = {
  askable: [
    'minIncomeMultiple', // answers.monthlyIncome (+ answers.dependants)
    'minSavingsMultiple', // answers.savings (+ answers.dependants)
    'remoteEmployeeOfForeignCompany',
    'maxSpanishClientsSharePercent', // answers.spanishClientsSharePercent
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
    'blueCardSalaryAssessment', // Blue Card salary threshold (annual, 1.4x INE avg, moves) - employer/lawyer confirms
    'spanishNationalFamilyAssessment', // exact relationship to a Spanish citizen - lawyer confirms
    'selfEmployedBusinessViability', // autonomo business-plan viability, association report - lawyer confirms
    'euCitizenFamilyAssessment', // relationship to an EEA/Swiss citizen exercising free movement - lawyer confirms
  ],
};

// Nationality groups the checker gates on. Rules differ materially between
// them (post-Brexit UK is a third country; EEA/Swiss citizens need no visa
// at all). Labels are user-facing.
const nationalityGroups = {
  uk: 'UK citizen',
  us: 'US citizen',
  'eea-swiss': 'EU, EEA or Swiss citizen',
  other: 'Another nationality',
};

// Applicability states a visa rule may declare per nationality group.
const applicabilityStates = ['applies', 'not-needed', 'not-applicable'];

// Balearic island groups for the island-differentiated eligibility caps
// (maxPropertyValue byIsland). Labels are user-facing.
const balearicIslands = {
  'mallorca-menorca': 'Mallorca or Menorca',
  'ibiza-formentera': 'Ibiza or Formentera',
};

// Canonical region keys. A figure's `region` must be one of these.
// Labels are the user-facing English names rendered on pages.
const regions = {
  andalucia: 'Andalucía',
  aragon: 'Aragón',
  asturias: 'Asturias',
  baleares: 'Balearic Islands',
  canarias: 'Canary Islands',
  cantabria: 'Cantabria',
  'castilla-la-mancha': 'Castilla-La Mancha',
  'castilla-y-leon': 'Castilla y León',
  catalunya: 'Catalunya',
  'comunidad-valenciana': 'Valencia (Comunitat Valenciana)',
  extremadura: 'Extremadura',
  galicia: 'Galicia',
  madrid: 'Madrid',
  murcia: 'Murcia',
  navarra: 'Navarra',
  'pais-vasco': 'Basque Country',
  'la-rioja': 'La Rioja',
  ceuta: 'Ceuta',
  melilla: 'Melilla',
  national: 'National (state-wide)',
};

// Units a figure's `value` / band `rate` can be expressed in.
const units = ['percent', 'eur', 'eur-per-month'];

// Hosts that count as an OFFICIAL source. A figure may only be
// status: 'verified' if its source.url host is (a subdomain of) one of
// these. Extend the list when a new region's official agency is added -
// never add a law firm, news site or aggregator.
const officialSourceHosts = [
  'agenciatributaria.gob.es', // AEAT (national)
  'agenciatributaria.es',
  'boe.es', // state law gazette
  'inclusion.gob.es', // Ministerio de Inclusión (extranjería / UGE - visa rules)
  'migraciones.gob.es', // Secretaría de Estado de Migraciones
  'exteriores.gob.es', // MAEC - consular visa pages
  'administracion.gob.es', // Punto de Acceso General (official procedures)
  'borm.es', // Murcia official gazette (regional law texts)
  'atc.gencat.cat', // Catalunya
  'gencat.cat',
  'comunidad.madrid', // Madrid
  'juntadeandalucia.es', // Andalucía
  'agenciatributariadeandalucia.es',
  'gva.es', // Valencia
  'atv.gva.es',
  'caib.es', // Balearic Islands
  'atib.es',
  'gobiernodecanarias.org', // Canary Islands
  'carm.es', // Murcia
  'aragon.es',
  'asturias.es',
  'cantabria.es',
  'castillalamancha.es',
  'jcyl.es', // Castilla y León
  'juntaex.es', // Extremadura
  'atriga.gal', // Galicia
  'xunta.gal',
  'navarra.es',
  'euskadi.eus', // Basque Country
  'araba.eus',
  'bizkaia.eus',
  'gipuzkoa.eus',
  'larioja.org',
  'ceuta.es',
  'melilla.es',
];

function isOfficialSourceUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return officialSourceHosts.some((h) => host === h || host.endsWith('.' + h));
}

// Every figure across every domain, with `domain` stamped on.
function allFigures() {
  return Object.values(domains).flatMap((d) =>
    (d.figures || []).map((f) => ({ ...f, domain: d.domain }))
  );
}

// Look one figure up by id (or undefined).
function getFigure(id) {
  return allFigures().find((f) => f.id === id);
}

// Every relief rule across every relief domain, with `domain` stamped on.
function allReliefs() {
  return Object.values(reliefDomains).flatMap((d) =>
    (d.reliefs || []).map((r) => ({ ...r, domain: d.domain }))
  );
}

// Look one relief up by id (or undefined).
function getRelief(id) {
  return allReliefs().find((r) => r.id === id);
}

// Every eligibility rule across every eligibility domain, `domain` stamped on.
function allEligibilityRules() {
  return Object.values(eligibilityDomains).flatMap((d) =>
    (d.rules || []).map((r) => ({ ...r, domain: d.domain }))
  );
}

// Look one eligibility rule up by id (or undefined).
function getEligibilityRule(id) {
  return allEligibilityRules().find((r) => r.id === id);
}

module.exports = {
  version: 3,
  regions,
  units,
  domains,
  reliefDomains,
  reliefConditionTypes,
  reliefTracks,
  balearicIslands,
  eligibilityDomains,
  eligibilityConditionTypes,
  nationalityGroups,
  applicabilityStates,
  officialSourceHosts,
  isOfficialSourceUrl,
  allFigures,
  getFigure,
  allReliefs,
  getRelief,
  allEligibilityRules,
  getEligibilityRule,
};
