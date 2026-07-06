/*
 * tools/legal-data/visas.js - visa eligibility rules (the first eligibility domain)
 * ---------------------------------------------------------------------------
 * The rules behind the visa checker (/spain-visa-checker). This is an
 * ELIGIBILITY domain, not a figures domain: instead of numbers it holds
 * decision rules ("who qualifies for what"), evaluated tri-state by
 * js/eligibility-engine.js. The engine is general; visas are only its
 * first face. A future process-checklist or any other eligibility tool
 * adds its own domain file with this same shape and reuses the engine
 * without touching it.
 *
 * THE SHAPE - one rule per visa:
 *   id             unique dot-path, must start with "visa."
 *   label          human name, British English (rendered on the page)
 *   officialName   the Spanish official name (rendered once, as a gloss)
 *   summary        one user-facing sentence: who this visa is for. Must
 *                  pass els-brand-voice.md.
 *   applicability  per nationality group (see nationalityGroups in
 *                  index.js): 'applies' | 'not-needed' | 'not-applicable'.
 *                  'not-needed'    - this person does not need this route
 *                                    (EEA/Swiss citizens and most visas)
 *                  'not-applicable'- this route does not exist for them
 *                                    (EU registration for non-EEA)
 *   applicabilityNotes  OPTIONAL { group: sentence } user-facing notes
 *                  where a group needs one honest line (e.g. the
 *                  EEA 'not-needed' explanation).
 *   criteria       AND-list of criterion objects (below). Wrap genuine
 *                  legal alternatives in { anyOf: [criterion, ...] } -
 *                  see the anyOf gotcha in tools/RELIEFS-NOTES.md; the
 *                  same rule applies here.
 *   nextSteps      user-facing array: what applying actually involves,
 *                  in order. Brand voice; no urgency language.
 *   userNote       OPTIONAL user-facing caveat rendered with this visa's
 *                  result, danger-direction only.
 *   effectiveFrom / reviewBy / source / note / status
 *                  rule-level provenance, same discipline as every figure:
 *                  the source covers the visa's existence, its
 *                  applicability map and its nextSteps.
 *
 * EACH CRITERION carries its own provenance (the kickoff rule: every
 * criterion has a source URL, a review date and a status):
 *   id             unique dot-path under the visa id
 *   type           a key from eligibilityConditionTypes in index.js.
 *                  'askable' types map to a checker question; 'lawyerRoute'
 *                  types are never asked - a rule carrying one never
 *                  auto-grants, it surfaces as "a lawyer can confirm".
 *   value          number for numeric types, true for boolean types
 *                  (a criterion never conditions on absence)
 *   inclusive      OPTIONAL, numeric types: at-or-over/under (true,
 *                  default) vs strictly over/under (false)
 *   figureId / multiple / dependants
 *                  minIncomeMultiple and minSavingsMultiple only:
 *                  the threshold is figure value x multiple, never a
 *                  hardcoded euro amount. dependants OPTIONAL:
 *                  { first, additional } extra multiples per family
 *                  member joining the applicant.
 *   months         minSavingsMultiple only: how many months of the
 *                  monthly threshold the lump sum must cover.
 *   basis          income/savings types: what counts (gross/net, whose)
 *   label          user-facing requirement line, British English. NEVER
 *                  contains a euro amount - the engine computes those
 *                  from the figure so they update themselves.
 *   effectiveFrom / reviewBy / source / note / userNote? / status
 *                  same provenance discipline as figures.
 *
 * SHIP GATE: a visa renders on the production page only when the rule
 * itself AND every criterion AND every referenced income figure are all
 * status 'verified'. One draft anywhere keeps the whole visa off the page
 * (a half-checked checklist is worse than none). The engine independently
 * ignores drafts at evaluation time - belt and braces, as with reliefs.
 *
 * EXCLUDED, deliberately:
 *   - Golden visa: abolished 3 April 2025 (Ley 1/2025). Never add it.
 *   - Asylum/refugee routes: never a checker outcome; wrong tool for it.
 *
 * VERIFICATION 2026-07-06: nothing verified yet. The two rules below
 * (digital nomad, non-lucrative) are Fable's exemplar entries - the
 * schema quality bar - drafted from the official UGE and consular pages
 * cited on each line. The remaining visas (student, work permit, family
 * reunification, arraigo, entrepreneur, EU registration) are researched
 * and added as draft by a delegated session against this same shape.
 * ---------------------------------------------------------------------------
 */

'use strict';

module.exports = {
  domain: 'visa',
  domainLabel: 'Spanish visas and residence routes: eligibility rules',
  rules: [
    // --- Digital nomad visa ---------------------------------------------------
    {
      id: 'visa.digital-nomad',
      label: 'Digital nomad visa',
      officialName: 'Visado de residencia por teletrabajo de carácter internacional',
      summary:
        'For people who work remotely for companies or clients outside Spain and want to live here while they do it.',
      applicability: {
        uk: 'applies',
        us: 'applies',
        'eea-swiss': 'not-needed',
        other: 'applies',
      },
      applicabilityNotes: {
        'eea-swiss':
          'EEA and Swiss citizens can live and work remotely from Spain without a visa. You register as an EU resident instead.',
      },
      criteria: [
        {
          anyOf: [
            {
              id: 'visa.digital-nomad.remote-employee',
              type: 'remoteEmployeeOfForeignCompany',
              value: true,
              label: 'You are employed by a company outside Spain and work for it remotely',
              effectiveFrom: '2023-01-12',
              source: {
                url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
                title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-07-06',
              note:
                'Employee route: remote work exclusively by digital means for a company located outside Spain. Created by Ley 28/2022 (the startups law) amending Ley 14/2013. The employer must not be a Spanish company.',
              status: 'draft',
            },
            {
              id: 'visa.digital-nomad.self-employed-foreign-clients',
              type: 'maxSpanishClientsSharePercent',
              value: 20,
              label:
                'You are self-employed for clients outside Spain, with Spanish clients making up no more than 20% of your work',
              effectiveFrom: '2023-01-12',
              source: {
                url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
                title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-07-06',
              note:
                'Self-employed route: professionals may work for Spanish clients up to 20% of their total activity. The 20% cap is the UGE-stated limit; confirm the current FAQ wording when verifying.',
              status: 'draft',
            },
          ],
        },
        {
          id: 'visa.digital-nomad.relationship-3-months',
          type: 'employmentRelationshipMonths',
          value: 3,
          label:
            'You have worked with your employer or main clients for at least three months before applying',
          effectiveFrom: '2023-01-12',
          source: {
            url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
            title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'A real, existing relationship of at least 3 months with the employer (or the client base, for the self-employed) at the date of application, and the company must have been operating for at least 1 year. The 1-year company age is folded into this criterion note rather than asked separately: it is the employer\'s fact, not the applicant\'s, and the checker asks people about themselves.',
          status: 'draft',
        },
        {
          anyOf: [
            {
              id: 'visa.digital-nomad.degree',
              type: 'universityDegree',
              value: true,
              label: 'You hold a university degree or recognised professional qualification',
              effectiveFrom: '2023-01-12',
              source: {
                url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
                title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-07-06',
              note:
                'Graduate or postgraduate of a university, vocational training, or business school of recognised prestige - the alternative to 3 years\' experience.',
              status: 'draft',
            },
            {
              id: 'visa.digital-nomad.experience',
              type: 'professionalExperienceYears',
              value: 3,
              label: 'Or you have at least three years’ professional experience in your field',
              effectiveFrom: '2023-01-12',
              source: {
                url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
                title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-07-06',
              note: 'Minimum 3 years\' professional experience as the alternative to a qualification.',
              status: 'draft',
            },
          ],
        },
        {
          id: 'visa.digital-nomad.income',
          type: 'minIncomeMultiple',
          figureId: 'income-refs.smi-monthly',
          multiple: 2,
          dependants: { first: 0.75, additional: 0.25 },
          basis: 'gross monthly income from the remote work, evidenced by contract and payslips or invoices',
          label: 'Your income is at least 200% of the Spanish minimum wage',
          effectiveFrom: '2023-01-12',
          source: {
            url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
            title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-02-28',
          note:
            'Means: 200% of the monthly SMI for the applicant, plus 75% of the SMI for the first family member and 25% for each further member. OPEN QUESTION carried on the SMI figure (income-refs.smi-monthly): whether UGE applies 200% of the 14-payment monthly SMI or of the annualised monthly average (higher). Settle both together when verifying. reviewBy tracks the SMI\'s own annual revision.',
          userNote:
            'The income floor moves every year with the Spanish minimum wage, and the authorities have at times read it against a higher annualised figure. Treat the number shown as the minimum, and budget a margin above it.',
          status: 'draft',
        },
        {
          id: 'visa.digital-nomad.health-insurance',
          type: 'healthInsurance',
          value: true,
          label: 'You have full health cover valid in Spain, public or from an insurer authorised to operate here',
          effectiveFrom: '2023-01-12',
          source: {
            url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
            title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Public or private health insurance with an entity authorised to operate in Spain. Applicants who remain in their home social-security system under a coordination agreement (e.g. a UK A1-equivalent or US totalisation certificate) meet this through that coverage - the anyOf is not modelled because either path answers the same question: real health cover in Spain.',
          status: 'draft',
        },
        {
          id: 'visa.digital-nomad.criminal-record',
          type: 'cleanCriminalRecord',
          value: true,
          label: 'You have no criminal record in the countries you have lived in over the last two years',
          effectiveFrom: '2023-01-12',
          source: {
            url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
            title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Certificate of no criminal record for the last 2 years of residence, plus a sworn declaration covering 5 years. The checker asks the plain 2-year question; the 5-year declaration is procedural and lives in nextSteps territory, not eligibility.',
          status: 'draft',
        },
      ],
      nextSteps: [
        'Apply either from Spain (to the UGE, on a tourist stay, for a 3-year residence permit) or from your country at the Spanish consulate (for a 1-year visa you later convert).',
        'Gather the work evidence first: contract or client agreements, three months of payslips or invoices, and your employer’s registration documents.',
        'Sort the social security piece early. It is the slowest document and the most common reason applications stall.',
        'Once approved, you can add the Beckham tax regime application within six months of registering as resident.',
      ],
      userNote:
        'Approval is never automatic. The UGE examines the work relationship and the social security position case by case, and paperwork from some countries takes months to legalise.',
      effectiveFrom: '2023-01-12',
      source: {
        url: 'https://www.inclusion.gob.es/web/unidadgrandesempresas/teletrabajadores',
        title: 'UGE: Residencia para teletrabajadores de carácter internacional (Ley 28/2022, BOE-A-2022-21739)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'Created by Ley 28/2022 (startups law) as the international teleworker residence route within Ley 14/2013. Rule-level source covers existence, the non-EEA applicability map and the application routes in nextSteps. Law text: https://www.boe.es/buscar/act.php?id=BOE-A-2022-21739.',
      status: 'draft',
    },

    // --- Non-lucrative visa -----------------------------------------------------
    {
      id: 'visa.non-lucrative',
      label: 'Non-lucrative visa',
      officialName: 'Visado de residencia no lucrativa',
      summary:
        'For people who can support themselves without working in Spain, typically retirees or those living on savings and passive income.',
      applicability: {
        uk: 'applies',
        us: 'applies',
        'eea-swiss': 'not-needed',
        other: 'applies',
      },
      applicabilityNotes: {
        'eea-swiss':
          'EEA and Swiss citizens do not need a visa to retire or live in Spain. You register as an EU resident instead.',
      },
      criteria: [
        {
          anyOf: [
            {
              id: 'visa.non-lucrative.income',
              type: 'minIncomeMultiple',
              figureId: 'income-refs.iprem-monthly',
              multiple: 4,
              dependants: { first: 1, additional: 1 },
              basis:
                'regular monthly income (pensions, rent, dividends, other passive income), evidenced over the last months',
              label: 'Your regular income is at least 400% of the IPREM each month',
              effectiveFrom: '2011-06-30',
              source: {
                url: 'https://www.inclusion.gob.es/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-no-lucrativa',
                title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal no lucrativa (hoja informativa)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-01-31',
              note:
                '400% of the monthly IPREM for the applicant plus 100% of the IPREM per dependent family member, per month. effectiveFrom marks the RD 557/2011 reglamento era; the requirement carries into the current reglamento (RD 1155/2024, in force 20 May 2025) - confirm the article number against the new text when verifying. reviewBy tracks the IPREM\'s annual budget-law review.',
              status: 'draft',
            },
            {
              id: 'visa.non-lucrative.savings',
              type: 'minSavingsMultiple',
              figureId: 'income-refs.iprem-monthly',
              multiple: 4,
              months: 12,
              dependants: { first: 1, additional: 1 },
              basis: 'cash savings or readily available funds, evidenced by bank statements or certificates',
              label: 'Or you hold savings covering that amount for the first year',
              effectiveFrom: '2011-06-30',
              source: {
                url: 'https://www.inclusion.gob.es/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-no-lucrativa',
                title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal no lucrativa (hoja informativa)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-01-31',
              note:
                'Consulates accept a lump sum covering the first year in place of monthly income: 400% IPREM x 12 months for the applicant, plus 100% x 12 per dependant. Same provenance caveat as the income leaf: confirm against RD 1155/2024 and the applicant\'s consulate page when verifying (consulate practice varies on evidence, not on the amount).',
              status: 'draft',
            },
          ],
        },
        {
          id: 'visa.non-lucrative.no-work',
          type: 'noWorkInSpain',
          value: true,
          label: 'You will not work or run a business in Spain while on this visa',
          effectiveFrom: '2011-06-30',
          source: {
            url: 'https://www.inclusion.gob.es/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-no-lucrativa',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal no lucrativa (hoja informativa)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'The defining condition: no lucrative activity in Spain, employed or self-employed. Whether remote work for foreign employers is compatible is legally contested and consulate-dependent - that question routes to the digital nomad visa instead, and the userNote below says so plainly.',
          userNote:
            'If you plan to keep working remotely for an employer abroad, the non-lucrative visa is the wrong fit on most consulates’ reading. Look at the digital nomad visa instead.',
          status: 'draft',
        },
        {
          id: 'visa.non-lucrative.health-insurance',
          type: 'healthInsurance',
          value: true,
          label: 'You have full private health cover with an insurer authorised to operate in Spain',
          effectiveFrom: '2011-06-30',
          source: {
            url: 'https://www.inclusion.gob.es/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-no-lucrativa',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal no lucrativa (hoja informativa)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Public or private insurance with an authorised entity. In practice consulates require comprehensive private cover without co-payments for NLV applicants (they are outside the Spanish system on arrival); UK S1 holders (state pensioners) can meet it through the S1 - noted for the retiree audience.',
          status: 'draft',
        },
        {
          id: 'visa.non-lucrative.criminal-record',
          type: 'cleanCriminalRecord',
          value: true,
          label: 'You have no criminal record in the countries you have lived in over the last five years',
          effectiveFrom: '2011-06-30',
          source: {
            url: 'https://www.inclusion.gob.es/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-no-lucrativa',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal no lucrativa (hoja informativa)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Criminal record certificate from countries of residence in the last 5 years. NOTE the asymmetry with the digital nomad visa\'s 2-year certificate: the checker asks these as two differently-worded questions and must never merge them.',
          status: 'draft',
        },
        {
          id: 'visa.non-lucrative.medical-certificate',
          type: 'medicalCertificate',
          value: true,
          label: 'You can obtain a medical certificate confirming no disease of public-health concern',
          effectiveFrom: '2011-06-30',
          source: {
            url: 'https://www.inclusion.gob.es/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-no-lucrativa',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal no lucrativa (hoja informativa)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'A doctor\'s certificate per the 2005 International Health Regulations. Nearly everyone can obtain one; it is asked so the result honestly lists everything the consulate will ask for, and because a rare "no" answer must not show eligible.',
          status: 'draft',
        },
      ],
      nextSteps: [
        'Apply at the Spanish consulate covering where you live. You cannot apply from inside Spain.',
        'Build the means evidence first: bank statements, pension letters or investment income going back several months, translated and apostilled where the consulate asks.',
        'Arrange the health policy before you apply, dated to cover your arrival.',
        'The first permit runs one year. Renewals run two years each and expect you to have actually lived in Spain, which also makes you a Spanish tax resident.',
      ],
      userNote:
        'Living in Spain more than 183 days a year makes you a Spanish tax resident, and the renewal pattern assumes you do. Factor the tax position in before you apply, not after.',
      effectiveFrom: '2011-06-30',
      source: {
        url: 'https://www.inclusion.gob.es/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-no-lucrativa',
        title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal no lucrativa (hoja informativa)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'The classic passive-means residence route under LO 4/2000 and its reglamento. effectiveFrom marks the RD 557/2011 era; the current reglamento is RD 1155/2024 (in force 20 May 2025) - re-pin the article references to the new text when verifying. Consular pages (e.g. exteriores.gob.es New York/Chicago NLV pages) carry the applicant-facing requirements list.',
      status: 'draft',
    },
  ],
};
