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
      status: 'draft',
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
      status: 'draft',
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
      status: 'draft',
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
          value: 30000,
          basis:
            'sum of IRPF taxable bases minus the personal and family minimum of family-unit members. UNCONFIRMED whether this cap was raised to 36,000 EUR',
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
        'Disability in the buyer OR a family-unit member, degree 65% or more. The 30,000 EUR income cap needs primary-text confirmation (needs-my-eyes HIGH item 5) before this rule can be verified.',
      status: 'draft',
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
      status: 'draft',
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
      status: 'draft',
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
      status: 'draft',
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
  ],
};
