/*
 * tools/legal-data/itp-reliefs.js - reduced-rate and bonification rules (v2)
 * ---------------------------------------------------------------------------
 * The relief rules behind the personalised ITP calculator: the reduced or
 * bonified rate a private buyer of a residential property qualifies for
 * based on their circumstances. Standard rates live in itp.js; everything
 * here is the DISCOUNT. Research source and per-region verification
 * worklist: aios/context/els/els-itp-reduced-rates-research-2026-07.md.
 *
 * THE SAME ONE RULE AS itp.js: no rule enters without { source, effectiveFrom,
 * reviewBy, note }, and a rule may only be status 'verified' when its source
 * is an official tax-authority host. tools/validate-legal-data.js enforces
 * it. The production build ships verified rules only, and the engine
 * independently ignores drafts (belt and braces): a draft rule can NEVER
 * produce a "you likely qualify".
 *
 * RULE SHAPE (all enforced by the validator):
 *   id            unique dot-path. Relief ids may start 'itp.', 'ajd.' or
 *                 'igic.' (kept verbatim from the research file).
 *   label         human label, British English, rendered on results
 *   region        a key from regions in index.js
 *   appliesTo     which tax line the relief modifies:
 *                 'resale' (ITP) | 'newbuild-ajd' (AJD) | 'newbuild-igic'
 *                 (IGIC, Canary Islands). IVA is national and never relieved.
 *   result        exactly ONE of:
 *                 { type: 'rate', value }                 replaces the standard rate
 *                 { type: 'rate', value, bandCap }        reduced rate on the first
 *                     bandCap euros; the standard scale continues above it
 *                     (Illes Balears structure)
 *                 { type: 'rate', bands, bandType }       same band shape as itp.js
 *                     figures (Madrid's value-graduated AJD base, a 'whole' cliff)
 *                 { type: 'deduction', value }            % off the tax quota
 *                     (a bonificacion; 100 means the quota goes to zero)
 *                 { type: 'exempt' }                      no tax due (no value field)
 *   conditions    AND-list of { type, value, ... }. Wrap genuine alternatives
 *                 in { anyOf: [cond, ...] } - the research file flattens some
 *                 OR-groups into AND-lists with a note; transcribe those as
 *                 anyOf or the rule can never match. Condition types:
 *
 *                 ASKED IN THE CALCULATOR (tri-state: satisfied / failed /
 *                 unknown - unknown NEVER grants):
 *                   maxAge                 { value, inclusive? } inclusive
 *                                          defaults true (age <= value); set
 *                                          inclusive: false where the law says
 *                                          strictly under (Andalucia under-35,
 *                                          Balears under-36/under-30)
 *                   habitualResidence      { value: true } main home the buyer
 *                                          will live in
 *                   firstHome              { value: true } first habitual home
 *                   noPriorPropertyOwnership { value: true } does not hold 50%+
 *                                          of another dwelling
 *                   maxIncome              { value, basis, inclusive? } per-buyer
 *                                          income cap; basis is rendered verbatim
 *                   maxHouseholdIncome     { value, basis, inclusive? } household cap
 *                   maxSavingsIncome       { value, basis, inclusive? } separate
 *                                          savings-base cap (Murcia)
 *                   maxPropertyValue       { value } or { byIsland: {...} }
 *                                          (byIsland only for baleares: the
 *                                          island-differentiated eligibility caps;
 *                                          a plain value is NEVER island-raised)
 *                   disability             { value: 33 | 65 | null } minimum
 *                                          degree; null = legal disability with
 *                                          no stated %
 *                   largeFamily            { value: true } familia numerosa
 *                   singleParentFamily     { value: true } familia monoparental
 *                   priorRegionResidenceYears { value: 3 } prior habitual
 *                                          residence in the region (Balears
 *                                          100% bonification hard gate)
 *                   mortgageLtvMin         { value: 60 } mortgage at least this
 *                                          % of appraised value (Balears hard gate)
 *
 *                 NOT ASKED - a rule carrying one of these routes the buyer to
 *                 the "other situation? a lawyer can confirm" path instead of
 *                 ever auto-granting:
 *                   vpoProtectedHousing, genderViolenceVictim,
 *                   ruralDepopulatedArea, terrorismVictim, priorHomeSaleWindow
 *                 (priorHomeSaleWindow, Madrid large-family: engine treats it
 *                 as satisfied when the buyer owns no other home, unknown
 *                 otherwise - a buyer still holding a prior home needs the
 *                 lawyer to confirm the 2-year sale window.)
 *
 *   combinesWith  'exclusive'  - the buyer takes the single most favourable
 *                               qualifying option (decided by computed euros)
 *                 'cumulative' - stacks: a cumulative deduction applies on top
 *                               of its base (Canarias 20% on the 5% rate,
 *                               Madrid bonificaciones on the graduated base)
 *   stacksOn      OPTIONAL, cumulative deductions only: rule ids (or
 *                 'standard') this may stack on. Absent = any base.
 *   incompatibleWith OPTIONAL: rule ids this can never combine with
 *                 (Madrid 10% vs 95% AJD bonificaciones)
 *   effectiveFrom / reviewBy / source / note / userNote / status
 *                 exactly as itp.js. All rules start 'draft'; Olivia flips to
 *                 'verified' after checking the official source, see
 *                 tools/RELIEFS-NOTES.md.
 *
 * DELIBERATELY OMITTED (decision 2026-07-05): Andalucia's professional-
 * reseller 2% (business buyers, not private) and the temporary 2026
 * storm-damage reliefs (expire 31 Dec 2026, decree-scoped). Do not add them.
 * ---------------------------------------------------------------------------
 */

'use strict';

module.exports = {
  domain: 'itp',
  reliefs: [
    // --- Catalunya (reference region, wired end-to-end in v2) ----------------
    // Structural facts (research 2026-07): the Catalan reduced ITP rates have
    // NO property-value cap and NO first-home / prior-ownership test. The
    // universal gate is income cap + habitual residence. Do not import
    // conditions the law does not contain.
    {
      id: 'itp.catalunya.young-buyer',
      label: 'Young buyer (35 or under), main home',
      region: 'catalunya',
      appliesTo: 'resale',
      result: { type: 'rate', value: 5 },
      conditions: [
        { type: 'maxAge', value: 35 },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 36000,
          basis:
            'sum of general and savings IRPF taxable base minus the personal and family minimum, last IRPF return',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-27',
      source: {
        url: 'https://www.boe.es/ccaa/dogc/2025/9379/f00001-00028.pdf',
        title: 'Decret llei 5/2025 (DOGC 9379), art. 641-5 TR',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Age raised 32 to 35 by DL 5/2025. No property-value cap and no first-home rule in Catalan law. Habitual residence: occupy within 12 months, live there 3 years.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.large-family',
      label: 'Large family (familia numerosa), main home',
      region: 'catalunya',
      appliesTo: 'resale',
      result: { type: 'rate', value: 5 },
      conditions: [
        { type: 'largeFamily', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 36000,
          basis:
            'sum of IRPF taxable bases minus the personal and family minimum of all family-unit members, plus 14,000 EUR per child above the large-family minimum',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2023-03-18',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2024-6951',
        title: 'Decreto Legislativo 1/2024, art. 641-2 TR (BOE consolidated)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Familia numerosa per Ley 40/2003. Not applicable to bare ownership.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.single-parent-family',
      label: 'Single-parent family (familia monoparental), main home',
      region: 'catalunya',
      appliesTo: 'resale',
      result: { type: 'rate', value: 5 },
      conditions: [
        { type: 'singleParentFamily', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 36000,
          basis:
            'sum of IRPF taxable bases minus the personal and family minimum of family-unit members, plus 14,000 EUR per child above the special-category minimum',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2023-03-18',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2024-6951',
        title: 'Decreto Legislativo 1/2024, art. 641-3 TR (BOE consolidated)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Familia monoparental. Was 30,000 EUR plus 12,000 per child before 18 Mar 2023.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.disability',
      label: 'Disability (65% or more in the family unit), main home',
      region: 'catalunya',
      appliesTo: 'resale',
      result: { type: 'rate', value: 5 },
      conditions: [
        { type: 'disability', value: 65 },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 36000,
          basis:
            'sum of general and savings IRPF taxable bases minus the personal and family minimum of the family unit, last IRPF return',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-03-15',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2024-6951',
        title: 'Decreto Legislativo 1/2024, art. 641-4 TR (BOE consolidated)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Disability in the buyer OR a family-unit member, degree 65% or more. Income cap 36,000 EUR (whole family unit) confirmed against art. 641-4 of the consolidated Codi Tributari (BOE-A-2024-6951, last mod 25 Mar 2026); the earlier 30,000 EUR figure belonged to unrelated IRPF provisions.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.gender-violence-victim',
      label: 'Gender-violence victim, main home',
      region: 'catalunya',
      appliesTo: 'resale',
      result: { type: 'rate', value: 5 },
      conditions: [
        { type: 'genderViolenceVictim', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 36000,
          basis:
            'sum of general and savings IRPF taxable base minus the personal and family minimum, last IRPF return',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-27',
      source: {
        url: 'https://www.boe.es/ccaa/dogc/2025/9379/f00001-00028.pdf',
        title: 'Decret llei 5/2025 (DOGC 9379), art. 641-5 bis TR',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'New in DL 5/2025. Victim status per Llei 5/2008; the purchase must arise from the need to change residence. Not asked in the calculator: routes to the other-situation lawyer path.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.vpo-protected-housing',
      label: 'Officially protected housing (VPO), resale',
      region: 'catalunya',
      appliesTo: 'resale',
      result: { type: 'rate', value: 7 },
      conditions: [{ type: 'vpoProtectedHousing', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-03-15',
      source: {
        url: 'https://www.boe.es/ccaa/dogc/2025/9379/f00001-00028.pdf',
        title: 'Decret llei 5/2025, art. 641-1.2 TR',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Flat 7% for officially protected housing resale, against the 10-13% general scale. Not asked in the calculator: routes to the other-situation lawyer path.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.young-buyer-newbuild-ajd',
      label: 'Young buyer (35 or under), new-build AJD wiped to zero',
      region: 'catalunya',
      appliesTo: 'newbuild-ajd',
      result: { type: 'deduction', value: 100 },
      conditions: [
        { type: 'maxAge', value: 35 },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 36000,
          basis:
            'sum of general and savings IRPF taxable base minus the personal and family minimum, last IRPF return',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-27',
      source: {
        url: 'https://www.boe.es/ccaa/dogc/2025/9379/f00001-00028.pdf',
        title: 'Decret llei 5/2025, art. 642-6 TR',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        '100% bonification of the AJD gradual quota (from 1.5% to nothing) on a VAT-subject first transfer. IVA at 10% still applies and the result must keep saying so.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.vpo-newbuild-ajd',
      label: 'Officially protected housing (VPO), new-build AJD',
      region: 'catalunya',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [{ type: 'vpoProtectedHousing', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-03-15',
      source: {
        url: 'https://atc.gencat.cat/es/tributs/itpajd/ajd/tarifes-tipus/',
        title: 'ATC, tarifes AJD (code AAH)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'UNCONFIRMED against the primary article text (the ATC live page is JS-rendered). 0.1% AJD for declared protected housing. Not asked in the calculator: other-situation path.',
      status: 'draft',
    },

    // --- Andalucia ------------------------------------------------------------
    // Structural facts (research 2026-07): Andalucia gives REDUCED RATES (not
    // quota bonificaciones), gated by a property-value cap + habitual
    // residence + demographic category. There is NO income cap and NO
    // first-home test in this region. Excluded deliberately (see header):
    // itp.andalucia.professional-reseller (business buyers, not private) and
    // the two temporary 2026 storm-damage reliefs.
    {
      id: 'itp.andalucia.general-habitual',
      label: 'Main home up to 150,000 EUR, general reduced rate',
      region: 'andalucia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 6 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'maxPropertyValue is the valor de referencia or declared value, not the price.',
      status: 'verified',
    },
    {
      id: 'itp.andalucia.under35',
      label: 'Young buyer (under 35), main home',
      region: 'andalucia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3.5 },
      conditions: [
        { type: 'maxAge', value: 35, inclusive: false },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Strictly under 35. Married or registered couple: at least one partner under 35, whole base gets the rate.',
      status: 'verified',
    },
    {
      id: 'itp.andalucia.disability',
      label: 'Disability, main home',
      region: 'andalucia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3.5 },
      conditions: [
        { type: 'disability', value: 33 },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Disability of the buyer or a family-unit member. Degree 33%+ confirmed: Ley 5/2021 (BOE-A-2021-17915) art. 3 defines "persona con discapacidad" as grado igual o superior al 33 por ciento; the 3.5% rate and 250,000 EUR cap sit in art. 43.1.c, which is silent on the degree that art. 3 fixes.',
      status: 'verified',
    },
    {
      id: 'itp.andalucia.large-family',
      label: 'Large family (familia numerosa), main home',
      region: 'andalucia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3.5 },
      conditions: [
        { type: 'largeFamily', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Familia numerosa per Ley 40/2003.',
      status: 'verified',
    },
    {
      id: 'itp.andalucia.domestic-violence',
      label: 'Domestic-violence victim, main home',
      region: 'andalucia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3.5 },
      conditions: [
        { type: 'genderViolenceVictim', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Andalucia wording is the broader "violencia domestica". Not asked in the calculator: routes to the other-situation lawyer path.',
      status: 'draft',
    },
    {
      id: 'itp.andalucia.terrorism-victim',
      label: 'Terrorism victim, main home',
      region: 'andalucia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3.5 },
      conditions: [
        { type: 'terrorismVictim', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'New condition type terrorismVictim, not in the base vocabulary. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },
    {
      id: 'itp.andalucia.depopulated-municipality',
      label: 'Depopulated municipality, main home',
      region: 'andalucia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3.5 },
      conditions: [
        { type: 'ruralDepopulatedArea', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Municipality under 3,000 inhabitants per the annual BOJA list: the engine must pick the right list for the transfer year. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },
    {
      id: 'ajd.andalucia.under35',
      label: 'Young buyer (under 35), new-build AJD',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.3 },
      conditions: [
        { type: 'maxAge', value: 35, inclusive: false },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Couple: one partner must be under 35.',
      status: 'verified',
    },
    {
      id: 'ajd.andalucia.general-over35',
      label: 'General buyer (35 or over), new-build AJD',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 1 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'General 1% (versus the standard 1.2%) for a main home up to 150,000 EUR where no lower rate applies.',
      status: 'verified',
    },
    {
      id: 'ajd.andalucia.disability',
      label: 'Disability, new-build AJD',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [
        { type: 'disability', value: 33 },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Degree 33%+ per Ley 5/2021 (BOE-A-2021-17915) art. 3 (grado igual o superior al 33 por ciento); the 0.1% rate and 250,000 EUR cap sit in art. 50.1.c. New-build mirror of the resale disability rule.',
      status: 'verified',
    },
    {
      id: 'ajd.andalucia.large-family',
      label: 'Large family (familia numerosa), new-build AJD',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [
        { type: 'largeFamily', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Familia numerosa, new-build mirror of the resale relief. No note in the source beyond the rate itself.',
      status: 'verified',
    },
    {
      id: 'ajd.andalucia.domestic-violence',
      label: 'Domestic-violence victim, new-build AJD',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.3 },
      conditions: [
        { type: 'genderViolenceVictim', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'New-build mirror of the resale domestic-violence relief. No note in the source beyond the rate itself.',
      status: 'draft',
    },
    {
      id: 'ajd.andalucia.terrorism-victim',
      label: 'Terrorism victim, new-build AJD',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.3 },
      conditions: [
        { type: 'terrorismVictim', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'New condition type terrorismVictim, new-build mirror of the resale relief.',
      status: 'draft',
    },
    {
      id: 'ajd.andalucia.depopulated-municipality',
      label: 'Depopulated municipality, new-build AJD',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.3 },
      conditions: [
        { type: 'ruralDepopulatedArea', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 150000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2021-10-27',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Municipality under 3,000 per the annual list, new-build mirror of the resale relief.',
      status: 'draft',
    },
    {
      id: 'ajd.andalucia.vpo-exemption',
      label: 'Officially protected housing (VPO), new-build AJD exempt',
      region: 'andalucia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'exempt' },
      conditions: [{ type: 'vpoProtectedHousing', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2018-01-01',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/atrian/areas/informacion-tributaria/impuestos/preguntas-frecuentes/impuestos-transmisiones-actos/beneficios.html',
        title: 'Beneficios fiscales TP y AJD, Junta de Andalucia',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'AJD exemption on the first transfer of a qualified VPO. effectiveFrom is approximate. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },

    // --- Comunidad Valenciana --------------------------------------------------
    // Structural facts (research 2026-07): every buyer category splits on the
    // 180,000 EUR value line (a higher reduced rate above it, a lower one at
    // or below it). The income cap applies only to young-under-35, large or
    // single-parent family, and gender-violence; VPO and disability carry NO
    // income cap. Disability nuance (physical/sensory 65%+ OR
    // intellectual/mental 33%+) is modelled here as a flat disability-65
    // condition per the coordinator's conservative ruling: this under-grants
    // 33-64% intellectual/mental buyers (they resolve unknown, never yes),
    // which is the safe direction. The AJD 0.1% relief is a single flat rate
    // for any habitual-home acquisition with no caps at all.
    {
      id: 'itp.valenciana.young-under35-over180k',
      label: 'Young buyer (under 35), first main home, over 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 8 },
      conditions: [
        { type: 'maxAge', value: 35, inclusive: false },
        { type: 'firstHome', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 30000,
          basis:
            'sum of general and savings IRPF base liquidable (not base imponible), per acquirer, individual return; 47,000 EUR joint. Art. 4.Cuatro Ley 13/1997 (categoria general).',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Value over 180,000 EUR. Art. 13.Dos.2 Ley 13/1997. Clave TU4.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.young-under35-under180k',
      label: 'Young buyer (under 35), first main home, up to 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 6 },
      conditions: [
        { type: 'maxAge', value: 35, inclusive: false },
        { type: 'firstHome', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 180000 },
        {
          type: 'maxHouseholdIncome',
          value: 30000,
          basis: 'sum of general and savings IRPF base liquidable (not base imponible), per acquirer; 47,000 EUR joint. Art. 4.Cuatro Ley 13/1997.',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Art. 13.Tres.1. Clave TJ8.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.vpo-general-first-over180k',
      label: 'Officially protected housing (VPO general regime), first main home, over 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 8 },
      conditions: [
        { type: 'vpoProtectedHousing', value: 'regimen general' },
        { type: 'firstHome', value: true },
        { type: 'habitualResidence', value: true },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'No income limit. Art. 13.Dos.1. Clave TO0.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.vpo-general-first-under180k',
      label: 'Officially protected housing (VPO general regime), first main home, up to 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 6 },
      conditions: [
        { type: 'vpoProtectedHousing', value: 'regimen general' },
        { type: 'firstHome', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 180000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'No income limit. Art. 13.Tres.2. Clave TG8.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.vpo-especial-first-over180k',
      label: 'Officially protected housing (VPO special regime), first main home, over 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 4 },
      conditions: [
        { type: 'vpoProtectedHousing', value: 'regimen especial' },
        { type: 'firstHome', value: true },
        { type: 'habitualResidence', value: true },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'No income limit. Art. 13.Cuatro.1.1. Clave TU8.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.vpo-especial-first-under180k',
      label: 'Officially protected housing (VPO special regime), first main home, up to 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3 },
      conditions: [
        { type: 'vpoProtectedHousing', value: 'regimen especial' },
        { type: 'firstHome', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 180000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'No income limit. Art. 13.Cinco.1. Clave TE8.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.large-family-single-parent-over180k',
      label: 'Large or single-parent family, main home, over 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 4 },
      conditions: [
        {
          anyOf: [
            { type: 'largeFamily', value: true },
            { type: 'singleParentFamily', value: true },
          ],
        },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 30000,
          basis:
            'general and savings IRPF base liquidable (not base imponible), per acquirer; 47,000 EUR joint (categoria general); 35,000 individual / 58,000 EUR joint special category. Art. 4.Cuatro Ley 13/1997.',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Large family or single-parent family, either qualifies. Art. 13.Cuatro.1.2. Clave TU9.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.large-family-single-parent-under180k',
      label: 'Large or single-parent family, main home, up to 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3 },
      conditions: [
        {
          anyOf: [
            { type: 'largeFamily', value: true },
            { type: 'singleParentFamily', value: true },
          ],
        },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 180000 },
        {
          type: 'maxHouseholdIncome',
          value: 30000,
          basis: 'general and savings IRPF base liquidable (not base imponible), per acquirer; 47,000 EUR joint (categoria general); 35,000/58,000 EUR special category. Art. 4.Cuatro Ley 13/1997.',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Art. 13.Cinco.2. Clave TF8.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.disability-over180k',
      label: 'Disability, main home, over 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 4 },
      conditions: [
        { type: 'disability', value: 65 },
        { type: 'habitualResidence', value: true },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'No income limit. Applies only to the acquirer\'s own share. Ley 13/1997 art. 13.Cuatro.1.3 (amended by Ley 5/2025 art. 29, in force 1 Jun 2025): any disability 65% or more, OR intellectual or mental disability 33% or more recognised permanently. Modelled as a flat disability-65 condition (sign-off #3): deliberately under-grants a 33-64% intellectual or mental buyer rather than risk a wrong "you qualify" (calculator asks disability in bands none/33-64/65+, see RELIEFS-NOTES.md). Clave TU7.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.disability-under180k',
      label: 'Disability, main home, up to 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3 },
      conditions: [
        { type: 'disability', value: 65 },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 180000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'No income limit. Same disability wording as the over-180k rule (Ley 13/1997 art. 13.Cinco.3, per Ley 5/2025): any disability 65% or more, OR intellectual or mental 33% or more recognised permanently; modelled as flat disability-65, an accepted under-grant (sign-off #3). Clave TD8.',
      status: 'verified',
    },
    {
      id: 'itp.valenciana.gender-violence-over180k',
      label: 'Gender-violence victim, main home, over 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 4 },
      conditions: [
        { type: 'genderViolenceVictim', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 30000,
          basis: 'per acquirer, individual; 47,000 EUR joint',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Applies only to her share. Accreditation per Ley 7/2012. Not asked in the calculator: other-situation lawyer path. Art. 13.Cuatro.1.4. Clave TUV.',
      status: 'draft',
    },
    {
      id: 'itp.valenciana.gender-violence-under180k',
      label: 'Gender-violence victim, main home, up to 180,000 EUR',
      region: 'comunidad-valenciana',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3 },
      conditions: [
        { type: 'genderViolenceVictim', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 180000 },
        {
          type: 'maxHouseholdIncome',
          value: 30000,
          basis: 'per acquirer, individual; 47,000 EUR joint',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-06-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Applies only to her share. Not asked in the calculator: other-situation lawyer path. Art. 13.Cinco.4. Clave TV8.',
      status: 'draft',
    },
    {
      id: 'itp.valenciana.ajd-habitual-dwelling',
      label: 'Habitual dwelling, new-build AJD',
      region: 'comunidad-valenciana',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [{ type: 'habitualResidence', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://atv.gva.es/es/itpajd',
        title: 'ITPAJD, claves de tarifa modelo 600 (ATV)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Flat 0.1% AJD on the acquisition of a habitual dwelling. No value, income or sub-category caps. Art. 14.Uno.a. Clave DA1.',
      status: 'verified',
    },

    // --- Madrid -----------------------------------------------------------------
    // Structural facts (research 2026-07): the 250,000 EUR value cap applies
    // ONLY to the 10%/100% habitual-residence and depopulation
    // bonificaciones. It does NOT apply to the 4% large-family ITP rate or
    // the 95% large-family AJD bonificacion, which carry no value cap at
    // all: a common aggregator error, do not add a cap to those two rules.
    // Madrid has no disability, single-parent, gender-violence, first-home
    // or income-based ITP/AJD relief (delivered through IRPF instead). The
    // new-build AJD track composes two layers: a value-graduated BASE rate
    // (0.4/0.5/0.75%, a whole-value cliff, conditioned on habitual
    // residence) and then a bonificacion (10/95/100%) applied on the
    // resulting quota, hence combinesWith 'cumulative' and stacksOn on the
    // three AJD bonificaciones. The graduated base rule itself keeps
    // combinesWith 'exclusive': it is a rate-type result and rate rules are
    // base options in the engine regardless of their own combinesWith value,
    // so this does not block the bonificaciones stacking onto it.
    {
      id: 'itp.madrid.habitual-residence-bonif',
      label: 'Habitual residence, 10% bonification off the quota',
      region: 'madrid',
      appliesTo: 'resale',
      result: { type: 'deduction', value: 10 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://www.comunidad.madrid/atencion-contribuyente/transmisiones-patrimoniales-onerosas',
        title: 'Transmisiones Patrimoniales Onerosas, Comunidad de Madrid',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Art. 30-bis. 10% off the quota, effective circa 5.4% on the standard 6%. maxPropertyValue includes annexes plus up to two garages and a storeroom. Clawback if the habitual-residence conditions are later breached (occupy within 12 months, reside 3 years). Incompatible with the art. 29 large-family 4% rate; both are exclusive so the engine takes the better one.',
      status: 'verified',
    },
    {
      id: 'itp.madrid.depopulation-young-bonif',
      label: 'Depopulated municipality, young buyer, 100% bonification',
      region: 'madrid',
      appliesTo: 'resale',
      result: { type: 'deduction', value: 100 },
      conditions: [
        { type: 'maxAge', value: 35, inclusive: false },
        { type: 'habitualResidence', value: true },
        { type: 'ruralDepopulatedArea', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-11-29',
      source: {
        url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-3303',
        title: 'Ley 5/2024 (Comunidad de Madrid), BOE-A-2025-3303',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Art. 30-bis.1. Municipality under 2,500 inhabitants at 1 January of the prior year (INE). Alternative to the 10% bonification. Not asked in the calculator: routes to the other-situation lawyer path (ruralDepopulatedArea is never askable).',
      status: 'draft',
    },
    {
      id: 'itp.madrid.large-family-rate',
      label: 'Large family (familia numerosa), main home, reduced rate',
      region: 'madrid',
      appliesTo: 'resale',
      result: { type: 'rate', value: 4 },
      conditions: [
        { type: 'largeFamily', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'priorHomeSaleWindow', value: 2 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-4451',
        title: 'Decreto Legislativo 1/2010 as amended by Ley 6/2018, art. 29 TR',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'NO property-value cap and NO surface condition (aggregator-error trap: do not add a 250,000 EUR cap here). Confirmed against Decreto Legislativo 1/2010 art. 29 (BOE consolidated, last mod 29 Dec 2025): only large-family + habitual + prior-home-sale conditions, no euro cap. A prior owned habitual home must be sold within 2 years before or after (waived for a contiguous merge); modelled as priorHomeSaleWindow, satisfied only when the buyer owns no other home, unknown otherwise. A buyer still holding a prior home needs the lawyer to confirm the sale window.',
      status: 'verified',
    },
    {
      id: 'ajd.madrid.habitual-residence-bonif',
      label: 'Habitual residence, 10% AJD bonification off the quota',
      region: 'madrid',
      appliesTo: 'newbuild-ajd',
      result: { type: 'deduction', value: 10 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'cumulative',
      stacksOn: ['ajd.madrid.newbuild-value-graduated-rate'],
      incompatibleWith: ['ajd.madrid.large-family-bonif'],
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://www.comunidad.madrid/atencion-contribuyente/actos-juridicos-documentados',
        title: 'Actos Juridicos Documentados, Comunidad de Madrid',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Art. 38-bis. 10% off the AJD quota, value cap 250,000 EUR, confirmed against DLeg 1/2010 art. 38 bis. Applies to the AJD quota after the value-graduated base rate. Incompatible with the 95% large-family AJD bonification.',
      status: 'verified',
    },
    {
      id: 'ajd.madrid.depopulation-young-bonif',
      label: 'Depopulated municipality, young buyer, 100% AJD bonification',
      region: 'madrid',
      appliesTo: 'newbuild-ajd',
      result: { type: 'deduction', value: 100 },
      conditions: [
        { type: 'maxAge', value: 35, inclusive: false },
        { type: 'habitualResidence', value: true },
        { type: 'ruralDepopulatedArea', value: true },
        { type: 'maxPropertyValue', value: 250000 },
      ],
      combinesWith: 'cumulative',
      stacksOn: ['ajd.madrid.newbuild-value-graduated-rate'],
      effectiveFrom: '2024-11-29',
      source: {
        url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-3303',
        title: 'Ley 5/2024 (Comunidad de Madrid), BOE-A-2025-3303',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Art. 38-bis.1. Not asked in the calculator: routes to the other-situation lawyer path (ruralDepopulatedArea is never askable).',
      status: 'draft',
    },
    {
      id: 'ajd.madrid.large-family-bonif',
      label: 'Large family (familia numerosa), 95% AJD bonification',
      region: 'madrid',
      appliesTo: 'newbuild-ajd',
      result: { type: 'deduction', value: 95 },
      conditions: [
        { type: 'largeFamily', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'priorHomeSaleWindow', value: 2 },
      ],
      combinesWith: 'cumulative',
      stacksOn: ['ajd.madrid.newbuild-value-graduated-rate'],
      incompatibleWith: ['ajd.madrid.habitual-residence-bonif'],
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-4451',
        title: 'Decreto Legislativo 1/2010, art. 38-ter TR',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'No value cap (aggregator-error trap, same as the resale large-family rate); confirmed against DLeg 1/2010 art. 38 ter (95% bonification, no euro cap). Prior-home-sale-within-2-years condition, modelled as priorHomeSaleWindow. Incompatible with the 10% AJD bonification.',
      status: 'verified',
    },
    {
      id: 'ajd.madrid.newbuild-value-graduated-rate',
      label: 'New-build value-graduated base rate, AJD',
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
        errorDeSalto: true,
      },
      conditions: [{ type: 'habitualResidence', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://www.comunidad.madrid/atencion-contribuyente/actos-juridicos-documentados',
        title: 'Actos Juridicos Documentados, Comunidad de Madrid',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'BASE rate schedule for a new build bought by a private individual as their habitual residence; the 10/95/100% bonificaciones then apply on the resulting quota (see stacksOn on each). Modelled as base-rate lookup then bonificacion. combinesWith is exclusive because a rate-type result is a base option in its own right; the engine treats any qualifying rate rule as a legitimate base regardless of its own combinesWith value, so this does not stop the three bonificaciones stacking on top via stacksOn. Rates and thresholds confirmed against DLeg 1/2010 art. 32 (whole-value brackets 0.4/0.5/0.75% at 120,000/180,000 EUR). Art. 37 error-de-salto smoothing is modelled (errorDeSalto: true): just above each threshold the quota rises by no more than the value did, so 120,001 EUR pays 481.00 not 600.01 and 180,001 EUR pays 901.00 not 1,350.01 (smoothing zones 120,000 to 120,121 and 180,000 to 180,453 EUR).',
      status: 'verified',
    },
    {
      id: 'ajd.madrid.vpo-rate',
      label: 'Officially protected housing (VPO), reduced base AJD',
      region: 'madrid',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.2 },
      conditions: [{ type: 'vpoProtectedHousing', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://www.comunidad.madrid/atencion-contribuyente/actos-juridicos-documentados',
        title: 'Actos Juridicos Documentados, Comunidad de Madrid',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'VPO not qualifying for the AJD exemption, useful surface up to 90 square metres (raised for large families). Set exclusive for consistency with the other rate-type Madrid rules: it is a base option, and the engine keys stacking off stacksOn ids, which never name this rule, so no stacking behaviour changes either way. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },

    // --- Illes Balears -----------------------------------------------------------
    // Structural facts (research 2026-07): two separate roles of the figure
    // 270,151.20 EUR must never be conflated. (1) RATE BAND: every reduced
    // rate below applies only to the first 270,151.20 EUR of the base
    // (result.bandCap); the standard scale continues on the excess. (2)
    // ELIGIBILITY CAP: since 2026 this is island-differentiated for the
    // reduced-rate rules (331,859.70 EUR Mallorca or Menorca, 378,212 EUR
    // Ibiza or Formentera, condition.maxPropertyValue.byIsland), EXCEPT the
    // three 100% bonifications and ajd.balears.first-home-1pc, which keep a
    // FIXED eligibility cap of 270,151.20 EUR that is never island-raised.
    // The 100% bonifications also carry two hard gates with no vocabulary
    // type until now: at least 3 years' prior habitual residence in the
    // Balearics (priorRegionResidenceYears) and a mortgage of at least 60%
    // of the appraised value (mortgageLtvMin).
    {
      id: 'itp.balears.habitual-4pc',
      label: 'General habitual home, reduced rate',
      region: 'baleares',
      appliesTo: 'resale',
      result: { type: 'rate', value: 4, bandCap: 270151.2 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        {
          type: 'maxPropertyValue',
          byIsland: { 'mallorca-menorca': 331859.7, 'ibiza-formentera': 378212 },
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=16198&lang=es',
        title: 'ATIB, Tipos de gravamen del ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        '4% on the first 270,151.20 EUR; the excess is taxed at the general 8%+ scale. The eligibility cap is island-differentiated since 2026 (378,212 EUR Ibiza or Formentera); this is a DIFFERENT figure from the 270,151.20 EUR rate band, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.balears.under36-first-home-2pc',
      label: 'Young buyer (under 36), first home, reduced rate',
      region: 'baleares',
      appliesTo: 'resale',
      result: { type: 'rate', value: 2, bandCap: 270151.2 },
      conditions: [
        { type: 'maxAge', value: 36, inclusive: false },
        { type: 'firstHome', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        {
          type: 'maxPropertyValue',
          byIsland: { 'mallorca-menorca': 331859.7, 'ibiza-formentera': 378212 },
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=16198&lang=es',
        title: 'ATIB, Tipos de gravamen del ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        '2% on the first 270,151.20 EUR; 8% on the excess. Age strictly under 36. Eligibility cap island-differentiated, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.balears.disability-2pc',
      label: 'Disability, reduced rate',
      region: 'baleares',
      appliesTo: 'resale',
      result: { type: 'rate', value: 2, bandCap: 270151.2 },
      conditions: [
        { type: 'disability', value: null },
        { type: 'habitualResidence', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        {
          type: 'maxPropertyValue',
          byIsland: { 'mallorca-menorca': 331859.7, 'ibiza-formentera': 378212 },
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=16198&lang=es',
        title: 'ATIB, Tipos de gravamen del ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Trigger is entitlement to the IRPF disability minimum for ascendants or descendants, not a headline degree percentage (disability degree UNCONFIRMED, hence the null value). Distinct from the 100% bonification, which needs 33% or more. Eligibility cap island-differentiated, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.balears.large-single-parent-family-2pc',
      label: 'Large or single-parent family, reduced rate',
      region: 'baleares',
      appliesTo: 'resale',
      result: { type: 'rate', value: 2, bandCap: 270151.2 },
      conditions: [
        {
          anyOf: [
            { type: 'largeFamily', value: true },
            { type: 'singleParentFamily', value: true },
          ],
        },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 350000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=16198&lang=es',
        title: 'ATIB, Tipos de gravamen del ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Large family or single-parent family, either qualifies. 2% on the first 270,151.20 EUR, 8% on the excess. Eligibility cap is a plain 350,000 EUR (not island-differentiated); the single-parent GENERAL category is capped at 270,151.20 EUR instead, a nuance not separately modelled here. The 2026 reform ties the general cap to the island order plus 15%: verify the operative figure before flipping to verified.',
      status: 'draft',
    },
    {
      id: 'itp.balears.under30-100pc-bonification',
      label: 'Young buyer (under 30), first main home, full bonification',
      region: 'baleares',
      appliesTo: 'resale',
      result: { type: 'deduction', value: 100 },
      conditions: [
        { type: 'maxAge', value: 30, inclusive: false },
        { type: 'firstHome', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 270151.2 },
        { type: 'maxIncome', value: 52800, basis: 'IRPF total taxable base, individual taxation' },
        { type: 'maxHouseholdIncome', value: 84480, basis: 'IRPF total taxable base, joint taxation' },
        { type: 'priorRegionResidenceYears', value: 3 },
        { type: 'mortgageLtvMin', value: 60 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=16198&lang=es',
        title: 'ATIB, Tipos de gravamen del ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Also requires at least 3 years of prior habitual residence in the Balearics and a mortgage of at least 60% of the appraised value: both modelled as hard gates with no vocabulary type until this pass. Value cap is FIXED at 270,151.20 EUR, never island-raised, unlike the reduced-rate rules above. Self-assessment is still required even at zero tax due. Both maxIncome (individual) and maxHouseholdIncome (joint) are kept as AND conditions per the research; a joint filer who has only answered one of the two income questions is deliberately under-granted rather than guessed at.',
      status: 'draft',
    },
    {
      id: 'itp.balears.disability33-100pc-bonification',
      label: 'Disability (33% or more), first main home, full bonification',
      region: 'baleares',
      appliesTo: 'resale',
      result: { type: 'deduction', value: 100 },
      conditions: [
        { type: 'disability', value: 33 },
        { type: 'firstHome', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 270151.2 },
        { type: 'maxIncome', value: 52800, basis: 'IRPF total taxable base, individual taxation' },
        { type: 'maxHouseholdIncome', value: 84480, basis: 'IRPF total taxable base, joint taxation' },
        { type: 'priorRegionResidenceYears', value: 3 },
        { type: 'mortgageLtvMin', value: 60 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2024-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=16198&lang=es',
        title: 'ATIB, Tipos de gravamen del ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Same package as the under-30 bonification: also needs at least 3 years of prior Balearic residence and a mortgage of at least 60% of appraised value. Fixed 270,151.20 EUR cap, never island-raised. Both income caps kept as AND, same deliberate under-grant for joint filers noted on the sibling rule.',
      status: 'draft',
    },
    {
      id: 'itp.balears.price-limited-housing-50pc',
      label: 'Price-limited housing (HPL), 50% bonification',
      region: 'baleares',
      appliesTo: 'resale',
      result: { type: 'deduction', value: 50 },
      conditions: [{ type: 'vpoProtectedHousing', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-06-14',
      source: {
        url: 'https://atib.es/General/Novedad.aspx?idTexto=16987&idTipoTexto=1&lang=es',
        title: 'ATIB, medidas fiscales Ley 4/2026',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'HPL is vivienda de precio limitado (art. 2 Ley 3/2024). Combination rules with the reduced rates are UNCONFIRMED, so this is set exclusive conservatively. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },
    {
      id: 'ajd.balears.first-home-1pc',
      label: 'First main home, new-build AJD reduced rate',
      region: 'baleares',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 1, bandCap: 270151.2 },
      conditions: [
        { type: 'firstHome', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'maxPropertyValue', value: 270151.2 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-06-14',
      source: {
        url: 'https://atib.es/General/Novedad.aspx?idTexto=16987&idTipoTexto=1&lang=es',
        title: 'ATIB, medidas fiscales Ley 4/2026',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'New-build first transfer. Supersedes the pre-2026 AJD 1.2% relief. 1% on the first 270,151.20 EUR, 1.5% on the excess. Eligibility cap is FIXED at 270,151.20 EUR, never island-raised (same fixed-cap role as the 100% bonifications, a different role from the byIsland reduced-rate rules above).',
      status: 'draft',
    },
    {
      id: 'ajd.balears.collectives-0-5pc',
      label: 'Qualifying collectives, new-build AJD reduced rate',
      region: 'baleares',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.5, bandCap: 270151.2 },
      conditions: [
        {
          anyOf: [
            { type: 'maxAge', value: 36, inclusive: false },
            { type: 'disability', value: null },
            { type: 'largeFamily', value: true },
            { type: 'singleParentFamily', value: true },
          ],
        },
        { type: 'firstHome', value: true },
        { type: 'maxPropertyValue', value: 270151.2 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-06-14',
      source: {
        url: 'https://atib.es/General/Novedad.aspx?idTexto=16987&idTipoTexto=1&lang=es',
        title: 'ATIB, medidas fiscales Ley 4/2026',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Qualifying collectives (under 36, disability, large family or single-parent family) are ALTERNATIVES, not all required: modelled as an anyOf. 0.5% on the first 270,151.20 EUR, 1.5% on the excess. The large/single-parent cap is tied to the island order plus 15%, not separately modelled here.',
      status: 'draft',
    },
    {
      id: 'ajd.balears.under30-disability33-100pc-bonification',
      label: 'Young buyer (under 30) or disability (33% or more), new-build AJD full bonification',
      region: 'baleares',
      appliesTo: 'newbuild-ajd',
      result: { type: 'deduction', value: 100 },
      conditions: [
        {
          anyOf: [
            { type: 'maxAge', value: 30, inclusive: false },
            { type: 'disability', value: 33 },
          ],
        },
        { type: 'firstHome', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'maxPropertyValue', value: 270151.2 },
        { type: 'maxIncome', value: 52800, basis: 'IRPF total taxable base, individual taxation' },
        { type: 'maxHouseholdIncome', value: 84480, basis: 'IRPF total taxable base, joint taxation' },
        { type: 'priorRegionResidenceYears', value: 3 },
        { type: 'mortgageLtvMin', value: 60 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-06-14',
      source: {
        url: 'https://atib.es/General/Novedad.aspx?idTexto=16987&idTipoTexto=1&lang=es',
        title: 'ATIB, medidas fiscales Ley 4/2026',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'New-build mirror of the ITP 100% bonification. Under 30 or disability 33% or more are alternatives, modelled as an anyOf. Also needs at least 3 years of prior Balearic residence and a mortgage of at least 60% of appraised value.',
      status: 'draft',
    },
    {
      id: 'ajd.balears.price-tasada-limited-housing-50pc',
      label: 'Price-set or price-limited housing, new-build AJD 50% bonification',
      region: 'baleares',
      appliesTo: 'newbuild-ajd',
      result: { type: 'deduction', value: 50 },
      conditions: [{ type: 'vpoProtectedHousing', value: true }],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-06-14',
      source: {
        url: 'https://atib.es/General/Novedad.aspx?idTexto=16987&idTipoTexto=1&lang=es',
        title: 'ATIB, medidas fiscales Ley 4/2026',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Vivienda de precio tasado (art. 1.4 Ley 5/2008) or HPL (art. 2 Ley 3/2024). First transfer is VAT plus AJD. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },

    // --- Canarias ----------------------------------------------------------------
    // Structural facts (research 2026-07): STALE OFFICIAL GUIDE WARNING. The
    // 2026 thresholds below (age up to 40, value caps 200k/300k/400k, income
    // 46,455 EUR) come from Ley 9/2025 (in force 1 Jan 2026) via KPMG tax
    // alerts; the official ATC guide PDF still prints the OLD figures (35
    // years, 150,000 EUR, 24,000 EUR) because it predates the reform. Rate
    // values are official; the THRESHOLD NUMBERS need Olivia's confirmation
    // against BOC 29/12/2025 before any of these ten rules can be verified.
    // The under-40 and gender-violence bonificaciones stack on the 5% rate
    // (cumulative, stacksOn), not on the standard 6.5%. New builds pay IGIC
    // (not AJD) as the main new-build tax.
    {
      id: 'itp.canarias.habitual-residence-5pct',
      label: 'Habitual residence, reduced rate',
      region: 'canarias',
      appliesTo: 'resale',
      result: { type: 'rate', value: 5 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'maxPropertyValue', value: 200000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Guia ITP y AJD, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Standard resale ITP is 6.5%. Value cap raised from 150,000 to 200,000 EUR by Ley 9/2025 (300,000/400,000 EUR for large families elsewhere in the scheme). Not the owner, bare owner or usufructuary of another home, or transfers it within 2 years. Multiple buyers: sum of bases must stay under the cap. 2026 THRESHOLD UNCONFIRMED against the stale official guide, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.large-family-1pct',
      label: 'Large family (familia numerosa), habitual home, reduced rate',
      region: 'canarias',
      appliesTo: 'resale',
      result: { type: 'rate', value: 1 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'largeFamily', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 46455,
          basis: 'family income; plus 18,200 EUR per additional child',
        },
        { type: 'maxPropertyValue', value: 300000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Guia ITP y AJD, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Value cap is 300,000 EUR general, 400,000 EUR for the special-category large family (not separately modelled). 2026 THRESHOLD UNCONFIRMED against the stale official guide, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.single-parent-1pct',
      label: 'Single-parent family (familia monoparental), habitual home, reduced rate',
      region: 'canarias',
      appliesTo: 'resale',
      result: { type: 'rate', value: 1 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'singleParentFamily', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 46455,
          basis: 'family income; plus 6,825 EUR per person giving right to the minimo familiar',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Guia ITP y AJD, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Income limit raised from 24,000 to 46,455 EUR by Ley 9/2025. 2026 THRESHOLD UNCONFIRMED against the stale official guide, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.disability-1pct',
      label: 'Disability, habitual home, reduced rate',
      region: 'canarias',
      appliesTo: 'resale',
      result: { type: 'rate', value: 1 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'disability', value: null },
        {
          type: 'maxHouseholdIncome',
          value: 46455,
          basis: 'family income; plus 6,825 EUR per minimo-familiar person',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Guia ITP y AJD, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Disability degree UNCONFIRMED: DL 1/2009 art. 33 says "condicion legal de persona con discapacidad" without a stated percentage, hence the null value. Also applies if a minimo-familiar person has the disability. 2026 THRESHOLD UNCONFIRMED against the stale official guide, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.vpo-protected-0pct',
      label: 'Officially protected housing (VPO), first habitual home, zero rate',
      region: 'canarias',
      appliesTo: 'resale',
      result: { type: 'rate', value: 0 },
      conditions: [
        { type: 'vpoProtectedHousing', value: true },
        { type: 'firstHome', value: true },
        { type: 'habitualResidence', value: true },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2018-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Guia ITP y AJD, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Vivienda protegida, first habitual home. effectiveFrom is approximate. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.under40-bonificacion-20pct',
      label: 'Young buyer (up to 40), 20% bonification off the quota',
      region: 'canarias',
      appliesTo: 'resale',
      result: { type: 'deduction', value: 20 },
      conditions: [
        { type: 'maxAge', value: 40 },
        { type: 'firstHome', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 46455,
          basis: 'base imponible general del IRPF (casilla 415), per buyer, not summed',
        },
      ],
      combinesWith: 'cumulative',
      stacksOn: ['itp.canarias.habitual-residence-5pct'],
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Guia ITP y AJD, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        '20% off the quota on top of the 5% rate, effective circa 4%. Age raised from under-35 to up to 40, income from 24,000 to 46,455 EUR. Non-residents cannot apply (no Spanish IRPF base). 2026 THRESHOLD UNCONFIRMED against the stale official guide, see the region header above.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.gender-violence-bonificacion-20pct',
      label: 'Gender-violence victim, 20% bonification off the quota',
      region: 'canarias',
      appliesTo: 'resale',
      result: { type: 'deduction', value: 20 },
      conditions: [
        { type: 'genderViolenceVictim', value: true },
        { type: 'habitualResidence', value: true },
      ],
      combinesWith: 'cumulative',
      stacksOn: ['itp.canarias.habitual-residence-5pct'],
      effectiveFrom: '2018-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Guia ITP y AJD, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        '20% off the quota on top of the 5% rate. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },
    {
      id: 'igic.canarias.newbuild-habitual-5pct',
      label: 'New-build habitual home, reduced IGIC',
      region: 'canarias',
      appliesTo: 'newbuild-igic',
      result: { type: 'rate', value: 5 },
      conditions: [
        { type: 'habitualResidence', value: true },
        { type: 'noPriorPropertyOwnership', value: true },
        { type: 'maxPropertyValue', value: 200000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://assets.kpmg.com/content/dam/kpmgsites/es/pdf/2026/01/tax-alert-cambios-tipos-igic-2026.pdf.coredownload.inline.pdf',
        title: 'Cambios en los tipos del IGIC para 2026, KPMG (citing Ley 9/2025 / DL 1/2025)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'General IGIC is 7%. Reduced 5% for a developer first delivery of a habitual home; base cap raised from 150,000 to 200,000 EUR. LAW-FIRM SOURCE: the official DL 1/2025 article text was not machine-readable via fetch, so this cites KPMG directly rather than the ATC guide, unlike the other Canarias rules above. 2026 THRESHOLD UNCONFIRMED against the stale official guide, see the region header above.',
      status: 'draft',
    },
    {
      id: 'igic.canarias.newbuild-habitual-superreduced-3pct',
      label: 'New-build habitual home, special groups, super-reduced IGIC',
      region: 'canarias',
      appliesTo: 'newbuild-igic',
      result: { type: 'rate', value: 3 },
      conditions: [
        { type: 'habitualResidence', value: true },
        {
          anyOf: [
            { type: 'maxAge', value: 40 },
            { type: 'largeFamily', value: true },
            { type: 'disability', value: null },
            { type: 'singleParentFamily', value: true },
            { type: 'genderViolenceVictim', value: true },
          ],
        },
        {
          type: 'maxHouseholdIncome',
          value: 46455,
          basis: 'family income; plus 15,315 EUR joint taxation',
        },
        { type: 'maxPropertyValue', value: 200000 },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://assets.kpmg.com/content/dam/kpmgsites/es/pdf/2026/01/tax-alert-cambios-tipos-igic-2026.pdf.coredownload.inline.pdf',
        title: 'Cambios en los tipos del IGIC para 2026, KPMG',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Super-reduced 3% for special groups, under 40 or large family or disability or single-parent or gender-violence victim: any ONE qualifies, modelled as an anyOf (income and value caps always apply outside it). One alternative, genderViolenceVictim, is a lawyer-route type, but because it sits inside an anyOf the rule can still auto-grant via the other alternatives; this matches the engine\'s anyOf semantics and needs no special handling. LAW-FIRM SOURCE, same caveat as the sibling 5% rule. Verify per-group wording against DL 1/2025.',
      status: 'draft',
    },
    {
      id: 'igic.canarias.newbuild-vpo-0pct',
      label: 'Officially protected housing (VPO), new-build IGIC exempt rate',
      region: 'canarias',
      appliesTo: 'newbuild-igic',
      result: { type: 'rate', value: 0 },
      conditions: [
        { type: 'vpoProtectedHousing', value: true },
        { type: 'habitualResidence', value: true },
        { type: 'firstHome', value: true },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2020-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/en/w/igic-impuesto-general-indirecto-canario-',
        title: 'IGIC, Agencia Tributaria Canaria',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Tipo cero IGIC for vivienda protegida as a sole or first habitual home, including one parking space and annexes. Modelled as a rate-0 result rather than exempt, since an exempt result carries no value key in this schema. effectiveFrom is approximate. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },

    // --- Region de Murcia ---------------------------------------------------------
    // Structural facts (research 2026-07): young and disability reliefs carry
    // NO property-value cap and NO first-home test in the current text; the
    // OLD 150,000 EUR value cap was removed and needs Olivia's confirmation
    // against the live consolidated Article 6 text (the single most
    // consequential Murcia flag). Income basis is IRPF base imponible
    // general minus the minimo personal y familiar (prior year), STRICTLY
    // under the cap, plus a SEPARATE base imponible del ahorro cap of up to
    // 1,800 EUR (inclusive). No single-parent, gender-violence or
    // depopulated-area ITP/AJD relief exists in Murcia.
    {
      id: 'itp.murcia.young-under40-resale',
      label: 'Young buyer (up to 40), habitual home, reduced rate',
      region: 'murcia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3 },
      conditions: [
        { type: 'maxAge', value: 40 },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 40000,
          inclusive: false,
          basis: 'IRPF base imponible general minus minimo personal y familiar, prior year',
        },
        {
          type: 'maxSavingsIncome',
          value: 1800,
          basis: 'IRPF base imponible del ahorro, prior year',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/documents/20632/1675724/TRIBUTOS+CEDIDOS+Y+PROPIOS.pdf/be1014f0-3bcb-4759-9cdf-f3a15d80c2be',
        title: 'ATRM, cuadro-resumen medidas tributarias CARM (TPO parrafo 6)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'No property-value cap and no first-home or no-prior-ownership test in the current text (the old 150,000 EUR cap was removed): confirm against the live consolidated Article 6, this is the single most consequential Murcia flag.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.large-family-resale',
      label: 'Large family (familia numerosa), habitual home, reduced rate',
      region: 'murcia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3 },
      conditions: [
        { type: 'largeFamily', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 44000,
          inclusive: false,
          basis:
            'sum of IRPF base imponible general minus minimo personal y familiar of all occupants, prior year, plus 6,000 EUR per child above the large-family minimum',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/faqs-itpajd',
        title: 'ATRM, FAQs ITPAJD (Q25)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'A second habitual home is allowed if the prior home was sold within 2 years before or after AND the new useful area is more than 10% larger; must be stated in the deed (not separately modelled).',
      status: 'draft',
    },
    {
      id: 'itp.murcia.disability-65-resale',
      label: 'Disability (65% or more), habitual home, reduced rate',
      region: 'murcia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 3 },
      conditions: [
        { type: 'disability', value: 65 },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 40000,
          inclusive: false,
          basis: 'IRPF base imponible general minus minimo personal y familiar, prior year',
        },
        {
          type: 'maxSavingsIncome',
          value: 1800,
          basis: 'IRPF base imponible del ahorro, prior year',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/faqs-itpajd',
        title: 'ATRM, FAQs ITPAJD (Q24)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Disability degree 65% or more.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.vpo-regimen-especial-resale',
      label: 'Officially protected housing (special regime), reduced rate',
      region: 'murcia',
      appliesTo: 'resale',
      result: { type: 'rate', value: 4 },
      conditions: [{ type: 'vpoProtectedHousing', value: 'proteccion oficial de regimen especial' }],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/faqs-itpajd',
        title: 'ATRM, FAQs ITPAJD (Q19)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Special-regime protected housing only. No income or age condition. Not asked in the calculator: other-situation lawyer path.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.young-under40-newbuild-ajd',
      label: 'Young buyer (up to 40), new-build AJD reduced rate',
      region: 'murcia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [
        { type: 'maxAge', value: 40 },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 40000,
          inclusive: false,
          basis: 'IRPF base imponible general minus minimo personal y familiar, prior year',
        },
        {
          type: 'maxSavingsIncome',
          value: 1800,
          basis: 'IRPF base imponible del ahorro, prior year',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/faqs-itpajd',
        title: 'ATRM, FAQs ITPAJD (Q26)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'First-copy deed of a dwelling acquisition (AJD cuota gradual). The cuadro-resumen prints the savings cap as "up to 18,000 EUR"; treated as a typo for 1,800 EUR, matching the FAQ and the sibling reliefs.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.large-family-newbuild-ajd',
      label: 'Large family (familia numerosa), new-build AJD reduced rate',
      region: 'murcia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [
        { type: 'largeFamily', value: true },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxHouseholdIncome',
          value: 44000,
          inclusive: false,
          basis:
            'sum of IRPF base imponible general minus minimo personal y familiar of all occupants, prior year, plus 6,000 EUR per child above the large-family minimum',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/faqs-itpajd',
        title: 'ATRM, FAQs ITPAJD (Q28)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Second-habitual-home rule identical to the resale large-family relief.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.disability-65-newbuild-ajd',
      label: 'Disability (65% or more), new-build AJD reduced rate',
      region: 'murcia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [
        { type: 'disability', value: 65 },
        { type: 'habitualResidence', value: true },
        {
          type: 'maxIncome',
          value: 40000,
          inclusive: false,
          basis: 'IRPF base imponible general minus minimo personal y familiar, prior year',
        },
        {
          type: 'maxSavingsIncome',
          value: 1800,
          basis: 'IRPF base imponible del ahorro, prior year',
        },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/faqs-itpajd',
        title: 'ATRM, FAQs ITPAJD (Q27)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'Disability degree 65% or more.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.plan-vivienda-joven-newbuild-ajd',
      label: 'Young Housing Plan, first transfer, new-build AJD reduced rate',
      region: 'murcia',
      appliesTo: 'newbuild-ajd',
      result: { type: 'rate', value: 0.1 },
      conditions: [
        { type: 'maxAge', value: 40 },
        { type: 'vpoProtectedHousing', value: 'Plan de Vivienda Joven de la Region de Murcia' },
      ],
      combinesWith: 'exclusive',
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/documents/20632/1675724/TRIBUTOS+CEDIDOS+Y+PROPIOS.pdf/be1014f0-3bcb-4759-9cdf-f3a15d80c2be',
        title: 'ATRM, cuadro-resumen (AJD parrafo 3)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'First transfer under the regional Young Housing Plan, requires an IVS certificate (not separately modelled). Niche. Not asked in the calculator: other-situation lawyer path (vpoProtectedHousing is never askable), so this rule can never auto-grant despite the askable maxAge condition.',
      status: 'draft',
    },
  ],
};
