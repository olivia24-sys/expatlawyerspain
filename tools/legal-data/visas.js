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
                'Or you are self-employed for clients outside Spain, with Spanish clients making up no more than 20% of your work',
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

    // --- Student stay -----------------------------------------------------------
    {
      id: 'visa.student',
      label: 'Student visa',
      officialName: 'Estancia por estudios',
      summary:
        'For people admitted to a full-time course in Spain who want to live here while they study.',
      applicability: {
        uk: 'applies',
        us: 'applies',
        'eea-swiss': 'not-needed',
        other: 'applies',
      },
      applicabilityNotes: {
        'eea-swiss':
          'EEA and Swiss citizens do not need a student visa to study in Spain. If your course runs longer than three months you register as an EU resident instead.',
      },
      criteria: [
        {
          id: 'visa.student.admitted',
          type: 'admittedToStudies',
          value: true,
          label: 'You have been admitted to a full-time course at an authorised centre in Spain',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/estancia-por-estudios',
            title: 'Ministerio de Inclusión: Autorización de estancia por estudios (Hoja 1)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Admission to a public or private centre authorised in Spain, for a full-time course leading to a degree or certificate, with fees paid. Confirmed on Hoja 1 (RD 1155/2024 arts 34-36 and 52-58). The checker asks the plain admission question; whether the specific centre qualifies is procedural detail carried in nextSteps.',
          status: 'draft',
        },
        {
          anyOf: [
            {
              id: 'visa.student.income',
              type: 'minIncomeMultiple',
              figureId: 'income-refs.iprem-monthly',
              multiple: 1,
              dependants: { first: 0.75, additional: 0.5 },
              basis:
                'regular monthly funds to support the stay (own funds, family support or a grant), excluding course fees',
              label: 'You can show funds of at least 100% of the IPREM each month',
              effectiveFrom: '2025-05-20',
              source: {
                url: 'https://www.inclusion.gob.es/en/web/migraciones/w/estancia-por-estudios',
                title: 'Ministerio de Inclusión: Autorización de estancia por estudios (Hoja 1)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-01-31',
              note:
                'Hoja 1 states 100% of the monthly IPREM for the student, 75% of the IPREM for the first accompanying family member and 50% for each further member, with study costs excluded. Where accommodation is prepaid the means requirement is reduced accordingly. reviewBy tracks the IPREM annual revision.',
              status: 'draft',
            },
            {
              id: 'visa.student.savings',
              type: 'minSavingsMultiple',
              figureId: 'income-refs.iprem-monthly',
              multiple: 1,
              months: 12,
              dependants: { first: 0.75, additional: 0.5 },
              basis: 'savings or a grant covering the study period, evidenced by bank statements or an award letter',
              label: 'Or you hold savings or a grant covering that amount for the year',
              effectiveFrom: '2025-05-20',
              source: {
                url: 'https://www.inclusion.gob.es/en/web/migraciones/w/estancia-por-estudios',
                title: 'Ministerio de Inclusión: Autorización de estancia por estudios (Hoja 1)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-01-31',
              note:
                'A lump sum covering the stay is accepted in place of monthly funds: 100% IPREM x 12 for the student, plus 75% x 12 for the first family member and 50% x 12 per further member. The 12-month basis matches the typical one-year course; shorter courses scale down. Confirm the current wording on Hoja 1 when verifying.',
              status: 'draft',
            },
          ],
        },
        {
          id: 'visa.student.health-insurance',
          type: 'healthInsurance',
          value: true,
          label: 'You have health cover valid in Spain equivalent to the public health system',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/estancia-por-estudios',
            title: 'Ministerio de Inclusión: Autorización de estancia por estudios (Hoja 1)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Public or private insurance giving cover in Spain equivalent to the National Health System basic portfolio, for the whole stay. EU students on an EHIC/GHIC can meet this for shorter courses; longer courses usually need a full policy. Noted, not asked separately.',
          status: 'draft',
        },
        {
          id: 'visa.student.criminal-record',
          type: 'cleanCriminalRecord',
          value: true,
          label: 'You have no criminal record in the countries you have lived in over the last five years',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/estancia-por-estudios',
            title: 'Ministerio de Inclusión: Autorización de estancia por estudios (Hoja 1)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'A criminal record certificate covering Spain and countries of residence in the last 5 years is required where the stay exceeds six months. Short courses under six months do not need it, but the checker asks the broader question so a longer stay is covered.',
          status: 'draft',
        },
      ],
      nextSteps: [
        'Get your admission letter and proof of paid fees first. Nothing moves without it.',
        'Apply at the Spanish consulate covering where you live if you are outside Spain, or at the Immigration Office of the province where you will study if you are already here legally.',
        'Arrange health cover and, if you are staying more than six months, order your criminal record certificate early. It is the slowest document to legalise.',
        'Once here, a student stay can allow limited part-time work and can later be changed to a work or residence permit if you qualify.',
      ],
      userNote:
        'A student stay is not the same as residence. Time spent on it counts only partially towards long-term residence and citizenship, so check how it fits your longer plan before you commit.',
      effectiveFrom: '2025-05-20',
      source: {
        url: 'https://www.inclusion.gob.es/en/web/migraciones/w/estancia-por-estudios',
        title: 'Ministerio de Inclusión: Autorización de estancia por estudios (Hoja 1, RD 1155/2024)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'The long-stay study authorisation under LO 4/2000 (arts 25 bis, 33) and RD 1155/2024 (arts 34-36, 52-58, in force 20 May 2025). Rule-level source covers the route\'s existence, the non-EEA applicability map and the application steps. effectiveFrom marks the RD 1155/2024 coming-into-force date.',
      status: 'draft',
    },

    // --- Employed work permit ---------------------------------------------------
    {
      id: 'visa.work-employee',
      label: 'Work permit (employed)',
      officialName: 'Residencia temporal y trabajo por cuenta ajena',
      summary:
        'For people with a job offer from a Spanish employer who want to live and work here as an employee.',
      applicability: {
        uk: 'applies',
        us: 'applies',
        'eea-swiss': 'not-needed',
        other: 'applies',
      },
      applicabilityNotes: {
        'eea-swiss':
          'EEA and Swiss citizens can work in Spain without a permit. You register as an EU resident instead.',
      },
      criteria: [
        {
          id: 'visa.work-employee.job-offer',
          type: 'jobOfferInSpain',
          value: true,
          label: 'You have a firm job offer and signed contract from an employer in Spain',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-y-trabajo-por-cuenta-ajena-hi-16-',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal y trabajo por cuenta ajena (Hoja 12)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'A contract signed by employer and worker guaranteeing continuous activity for the permit\'s validity, paying at least the SMI (or the collective-agreement wage), is the core requirement (RD 1155/2024 arts 72-79; LO 4/2000 arts 36, 38, 40). The employer normally lodges the application. The checker asks the applicant\'s side of it: do you have the offer.',
          status: 'draft',
        },
        {
          id: 'visa.work-employee.qualifications',
          type: 'universityDegree',
          value: true,
          label: 'You hold the qualifications or registration the job legally requires',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-y-trabajo-por-cuenta-ajena-hi-16-',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal y trabajo por cuenta ajena (Hoja 12)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'RD 1155/2024 art 75 requires the worker to hold the training and professional qualification legally required for the role, recognised or homologated where the profession is regulated. Reuses the universityDegree askable type as the closest fit ("qualification the job requires"); many roles need no degree, so the label is worded around the job\'s own requirement rather than a degree as such. Flagged for Olivia in the notes file as an imperfect vocabulary match.',
          status: 'draft',
        },
        {
          id: 'visa.work-employee.criminal-record',
          type: 'cleanCriminalRecord',
          value: true,
          label: 'You have no criminal record in the countries you have lived in over the last five years',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-y-trabajo-por-cuenta-ajena-hi-16-',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal y trabajo por cuenta ajena (Hoja 12)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'No criminal record in Spain or in countries of residence over the last 5 years, for offences that exist under Spanish law (LO 4/2000 art 36). Same five-year window as the student and entrepreneur routes.',
          status: 'draft',
        },
        {
          id: 'visa.work-employee.labour-market',
          type: 'exceptionalCircumstances',
          value: true,
          label: 'The role passes the national employment test, usually by being on the shortage-occupation list',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-y-trabajo-por-cuenta-ajena-hi-16-',
            title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal y trabajo por cuenta ajena (Hoja 12)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'The situación nacional de empleo test: the post must appear on the SEPE quarterly catalogue of hard-to-fill occupations, OR the employer must prove no suitable candidate was found via a Public Employment Service report and an Empléate posting. This is the employer\'s hurdle and turns on a live catalogue plus labour-market evidence, so it is modelled as a lawyer-route condition rather than a yes/no the applicant can self-assess. It keeps this visa from ever auto-granting, which is the honest outcome given the test. Modelled with exceptionalCircumstances as the closest existing lawyerRoute type; flagged in the notes file (a dedicated nationalEmploymentSituation type would read better if Olivia wants one added).',
          status: 'draft',
        },
      ],
      nextSteps: [
        'The employer starts this, not you. They lodge the application in Spain and must show the post passes the national employment test.',
        'Get your qualifications recognised or homologated early if the job is a regulated profession. It is a common cause of delay.',
        'Order your criminal record certificate for the last five years and have it legalised or apostilled.',
        'Once the permit is approved in Spain, you collect the visa at the consulate, travel, and register for your TIE card and social security on arrival.',
      ],
      userNote:
        'The national employment test is the real filter here. Unless the role is on the shortage list, the employer has to prove they could not fill it locally, and many applications stall at exactly that point. A lawyer can tell you quickly whether your offer clears it.',
      effectiveFrom: '2025-05-20',
      source: {
        url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-inicial-de-residencia-temporal-y-trabajo-por-cuenta-ajena-hi-16-',
        title: 'Ministerio de Inclusión: Autorización inicial de residencia temporal y trabajo por cuenta ajena (Hoja 12, RD 1155/2024)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'The standard employed-work route under LO 4/2000 (arts 36, 38, 40) and RD 1155/2024 (arts 72-79, in force 20 May 2025). Employer-initiated. Rule-level source covers existence, the non-EEA applicability map and the process. This rule deliberately never auto-grants: the labour-market criterion is a lawyerRoute, so a matching applicant is always told a lawyer can confirm.',
      status: 'draft',
    },

    // --- Family reunification ----------------------------------------------------
    {
      id: 'visa.family-reunification',
      label: 'Family reunification',
      officialName: 'Reagrupación familiar',
      summary:
        'For close family of someone already legally resident in Spain who want to join them here.',
      applicability: {
        uk: 'applies',
        us: 'applies',
        'eea-swiss': 'not-needed',
        other: 'applies',
      },
      applicabilityNotes: {
        'eea-swiss':
          'Family of an EEA or Swiss citizen use the EU family-member route, not this one. This page is for joining a non-EU resident.',
      },
      criteria: [
        {
          id: 'visa.family-reunification.sponsor-resident',
          type: 'familyMemberSpanishResident',
          value: true,
          label: 'A close family member is legally resident in Spain and sponsoring you',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-de-residencia-temporal-por-reagrupacion-familiar',
            title: 'Ministerio de Inclusión: Autorización de residencia temporal por reagrupación familiar (Hoja 8)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'The sponsor must have lived legally in Spain for at least one year and be renewing for at least another (RD 1155/2024 art 65), with exceptions for long-term EU residents. Reunitable members: spouse or registered partner, children under 18 (or dependent adults), and dependent ascendants over 65 (arts 65-68). The one-year sponsor-residence rule is the sponsor\'s fact; the checker asks the applicant whether a qualifying resident is sponsoring them and carries the detail in nextSteps.',
          status: 'draft',
        },
        {
          id: 'visa.family-reunification.means',
          type: 'minIncomeMultiple',
          figureId: 'income-refs.iprem-monthly',
          multiple: 1.5,
          dependants: { first: 0.5, additional: 0.5 },
          basis: 'the sponsor\'s regular income, evidenced over the months before applying',
          label: 'The sponsor shows income of at least 150% of the IPREM for a two-person household',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-de-residencia-temporal-por-reagrupacion-familiar',
            title: 'Ministerio de Inclusión: Autorización de residencia temporal por reagrupación familiar (Hoja 8)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-01-31',
          note:
            'Hoja 8 (RD 1155/2024 arts 69-70): a household of two (sponsor plus one reunited member) needs 150% of the monthly IPREM, and each further member adds 50% of the IPREM. ENCODING: the checker\'s dependants answer counts family members joining BEYOND the applicant, and the 1.5 base already covers sponsor + applicant, so first AND additional are both 0.5 (each extra member adds 50%; a first:0 encoding would understate the bar for one extra member, a false-positive vector caught in the Fable review). A reduced test using the Ingreso Mínimo Vital applies where the unit includes minors: that alternative is NOT anchored to IPREM and is flagged for Olivia rather than modelled here. reviewBy tracks the IPREM annual revision.',
          userNote:
            'The income shown is the sponsor\'s, not yours, and it is the requirement authorities scrutinise most. Where children are being reunited a lower means test tied to the Minimum Vital Income can apply, so a lawyer can confirm which figure fits your family.',
          status: 'draft',
        },
        {
          id: 'visa.family-reunification.housing',
          type: 'sponsorMeansAndHousing',
          value: true,
          label: 'The sponsor has adequate housing for the family, confirmed by an official report',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-de-residencia-temporal-por-reagrupacion-familiar',
            title: 'Ministerio de Inclusión: Autorización de residencia temporal por reagrupación familiar (Hoja 8)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Adequate housing is proven by a report from the Autonomous Community or town hall dated no more than six months before applying (RD 1155/2024). It turns on a local inspection of the sponsor\'s home, not a fact the applicant can self-certify, so it is modelled as a lawyerRoute condition. This keeps the visa from auto-granting on income alone.',
          status: 'draft',
        },
        {
          id: 'visa.family-reunification.health-insurance',
          type: 'healthInsurance',
          value: true,
          label: 'The family has health cover in Spain, public or private',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-de-residencia-temporal-por-reagrupacion-familiar',
            title: 'Ministerio de Inclusión: Autorización de residencia temporal por reagrupación familiar (Hoja 8)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Health cover for the sponsor and each reunited member, met through the sponsor\'s social-security affiliation (a worker) or a private policy otherwise (RD 1155/2024). Asked as the plain health-cover question.',
          status: 'draft',
        },
      ],
      nextSteps: [
        'The sponsor already in Spain lodges this application, not the family member abroad.',
        'The sponsor gathers the housing report from their Autonomous Community or town hall and the income evidence first. Both are checked closely.',
        'Once the reunification permit is granted in Spain, each family member applies for the visa at the Spanish consulate covering where they live.',
        'On arrival, register for the TIE card. A reunited spouse or partner can usually apply to work.',
      ],
      userNote:
        'The whole application rests on the sponsor: their year of legal residence, their income and their housing. If any of those is borderline, sort it before the family member abroad books anything.',
      effectiveFrom: '2025-05-20',
      source: {
        url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-de-residencia-temporal-por-reagrupacion-familiar',
        title: 'Ministerio de Inclusión: Autorización de residencia temporal por reagrupación familiar (Hoja 8, RD 1155/2024)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'The general family reunification route under LO 4/2000 (arts 16-19) and RD 1155/2024 (arts 65-70, in force 20 May 2025), which reformed the means and housing rules. This is the non-EU route; family of EEA/Swiss citizens use the RD 240/2007 EU family-member card instead, as the applicabilityNote says. Rule-level source covers existence, applicability and process.',
      status: 'draft',
    },

    // --- Arraigo (in-Spain regularisation) --------------------------------------
    {
      id: 'visa.arraigo',
      label: 'Arraigo (residence through roots)',
      officialName: 'Arraigo (autorización por circunstancias excepcionales)',
      summary:
        'For people already living in Spain without a permit who may regularise their status through time spent, work, study or family ties here.',
      applicability: {
        uk: 'not-needed',
        us: 'not-needed',
        'eea-swiss': 'not-needed',
        other: 'applies',
      },
      applicabilityNotes: {
        uk: 'Arraigo is for people already in Spain without a permit and needing to regularise. Most UK citizens arrive legally on a visa route, so it rarely fits, but it is open to anyone here without status regardless of nationality.',
        us: 'Arraigo is for people already in Spain without a permit and needing to regularise. Most US citizens arrive legally on a visa route, so it rarely fits, but it is open to anyone here without status regardless of nationality.',
        'eea-swiss':
          'EEA and Swiss citizens never need arraigo. You have the right to reside and simply register as an EU resident.',
      },
      criteria: [
        {
          anyOf: [
            {
              id: 'visa.arraigo.years-in-spain',
              type: 'yearsLivingInSpain',
              value: 2,
              label: 'You have been living in Spain continuously for at least two years',
              effectiveFrom: '2025-05-20',
              source: {
                url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-residencia-temporal-por-circunstancias-excepcionales.-arraigo-social',
                title: 'Ministerio de Inclusión: Arraigo social (Hoja 28, RD 1155/2024)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-07-06',
              note:
                'RD 1155/2024 cut the general arraigo residence period from three years to two. Confirmed at two years continuous residence (absences under 90 days) for arraigo social (Hoja 28), sociolaboral (Hoja 29) and segunda oportunidad (Hoja 27). Sits in an anyOf with the family-tie leaf because arraigo familiar has NO minimum period: encoded as a lone AND-criterion, a "no" to two years would have marked the whole route not-eligible and hidden the family variant from exactly the people it exists for (caught in the Fable review).',
              status: 'draft',
            },
            {
              id: 'visa.arraigo.family-tie',
              type: 'familyMemberSpanishResident',
              value: true,
              label: 'Or a close family member is a Spanish citizen or legal resident',
              effectiveFrom: '2025-05-20',
              source: {
                url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-residencia-temporal-por-circunstancias-excepcionale-1',
                title: 'Ministerio de Inclusión: Arraigo familiar (Hoja 26, RD 1155/2024)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-07-06',
              note:
                'Arraigo familiar (Hoja 26): a qualifying family tie, principally to a Spanish citizen, with no minimum residence period. The askable familyMemberSpanishResident question is broader than the legal test (which turns on the exact relationship and, for some ties, citizenship rather than residence), which is safe here: a yes can never auto-grant because the variant-assessment lawyer-route below caps the whole route at need-more-info. Confirm the qualifying relationships against Hoja 26 when verifying.',
              status: 'draft',
            },
          ],
        },
        {
          id: 'visa.arraigo.variant-assessment',
          type: 'arraigoVariantAssessment',
          value: true,
          label: 'A lawyer confirms which arraigo route fits your exact situation',
          effectiveFrom: '2025-05-20',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-residencia-temporal-por-circunstancias-excepcionales.-arraigo-social',
            title: 'Ministerio de Inclusión: Arraigo social (Hoja 28, RD 1155/2024)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Post-RD 1155/2024 arraigo has five variants, each with its own test, and picking the right one is the whole game: social (2 years plus a social-integration report and means or a job, Hoja 28), sociolaboral (2 years plus one or more contracts totalling at least 20 hours a week at the SMI, Hoja 29), socioformativo (2 years plus enrolment in training tied to shortage occupations, Hoja 30), familiar (family tie to a Spanish citizen or resident, no fixed period, Hoja 26), and segunda oportunidad (2 years, for people who lost a prior permit, Hoja 27). These are deliberately NOT modelled as separate rules: the differences are fact-heavy and the wrong choice sinks the application, so the rule always routes to "a lawyer can confirm" via this lawyerRoute condition. The variant details live here and in nextSteps, not as askable questions.',
          status: 'draft',
        },
      ],
      nextSteps: [
        'Pull together proof of how long you have been in Spain: padrón registration, medical records, any document with a date and your name.',
        'Work out which arraigo fits. Social needs an integration report and means or a job offer, sociolaboral needs a real contract, socioformativo needs training enrolment, familiar needs a family tie. A lawyer matches your facts to the right one.',
        'Arraigo is filed from inside Spain at the Immigration Office, not at a consulate.',
        'Get the social-integration report from your Autonomous Community early where your route needs one. It takes time to issue.',
      ],
      userNote:
        'Arraigo is the route people most often get wrong on their own. The five variants each turn on different proof, and applying under the wrong one can lose you the chance. This is the point to get a lawyer, before you file anything.',
      effectiveFrom: '2025-05-20',
      source: {
        url: 'https://www.inclusion.gob.es/en/web/migraciones/w/autorizacion-residencia-temporal-por-circunstancias-excepcionales.-arraigo-social',
        title: 'Ministerio de Inclusión: Arraigo social (Hoja 28, RD 1155/2024)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'In-Spain regularisation through roots, reformed by RD 1155/2024 (in force 20 May 2025), which cut the residence period to two years and reshaped the variants. Applicability is "applies" only for the "other" group: this route is for people in Spain without status, which by definition excludes EEA/Swiss (who have the right to reside) and rarely fits UK/US citizens who typically arrive on a visa, though it is open to anyone here without a permit. Rule-level source is the arraigo social sheet; the five-variant detail sits on the criterion note and nextSteps. Modelled to always route to a lawyer, never auto-grant.',
      status: 'draft',
    },

    // --- Entrepreneur (Ley 14/2013) ---------------------------------------------
    {
      id: 'visa.entrepreneur',
      label: 'Entrepreneur visa',
      officialName: 'Residencia para emprendedores (Ley 14/2013)',
      summary:
        'For people starting an innovative business of special economic interest to Spain who want to live here to run it.',
      applicability: {
        uk: 'applies',
        us: 'applies',
        'eea-swiss': 'not-needed',
        other: 'applies',
      },
      applicabilityNotes: {
        'eea-swiss':
          'EEA and Swiss citizens can set up and run a business in Spain without this visa. You register as an EU resident instead.',
      },
      criteria: [
        {
          id: 'visa.entrepreneur.innovative-project',
          type: 'innovativeBusinessProject',
          value: true,
          label: 'Your business is innovative and of special economic interest to Spain',
          effectiveFrom: '2013-09-29',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/unidadgrandesempresas/emprendedores',
            title: 'UGE: Residencia para emprendedores (Ley 14/2013)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'The defining test (Ley 14/2013 arts 68-70): the activity must be innovative and of special economic interest to Spain, confirmed by a favourable report from ENISA, which assesses the business plan and the applicant\'s profile. There is no minimum investment or job-creation figure. The favourable report is a discretionary official assessment, so a matching applicant is genuinely at the report\'s mercy; the userNote says so.',
          status: 'draft',
        },
        {
          anyOf: [
            {
              id: 'visa.entrepreneur.income',
              type: 'minIncomeMultiple',
              figureId: 'income-refs.iprem-monthly',
              multiple: 2,
              dependants: { first: 0.75, additional: 0.25 },
              basis: 'regular funds to support yourself while the business establishes, separate from the business capital',
              label: 'You can support yourself and any family with funds of at least 200% of the IPREM each month',
              effectiveFrom: '2013-09-29',
              source: {
                url: 'https://www.inclusion.gob.es/en/web/unidadgrandesempresas/emprendedores',
                title: 'UGE: Residencia para emprendedores (Ley 14/2013)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-01-31',
              note:
                'Ley 14/2013 art 62 requires sufficient means for the applicant and family but does not fix a figure in the law. UGE practice mirrors the other Ley 14/2013 permits: about 200% of the monthly IPREM for the applicant, 75% for the first family member and 25% for each further member. THIS MULTIPLE IS UGE PRACTICE, NOT A STATUTORY FIGURE, and is flagged in the notes file for Olivia to confirm against the current UGE means guidance before verifying.',
              status: 'draft',
            },
            {
              id: 'visa.entrepreneur.savings',
              type: 'minSavingsMultiple',
              figureId: 'income-refs.iprem-monthly',
              multiple: 2,
              months: 12,
              dependants: { first: 0.75, additional: 0.25 },
              basis: 'savings covering your first year, separate from the business capital, evidenced by bank statements',
              label: 'Or you hold savings covering that amount for the first year',
              effectiveFrom: '2013-09-29',
              source: {
                url: 'https://www.inclusion.gob.es/en/web/unidadgrandesempresas/emprendedores',
                title: 'UGE: Residencia para emprendedores (Ley 14/2013)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-01-31',
              note:
                'A lump sum covering the first year is accepted in place of monthly means, on the same UGE practice as the income leaf (200% IPREM x 12 plus family additions). Same caveat: the multiple is UGE practice, not a figure in Ley 14/2013, and is flagged for Olivia to confirm.',
              status: 'draft',
            },
          ],
        },
        {
          id: 'visa.entrepreneur.health-insurance',
          type: 'healthInsurance',
          value: true,
          label: 'You have full health cover valid in Spain, public or private',
          effectiveFrom: '2013-09-29',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/unidadgrandesempresas/emprendedores',
            title: 'UGE: Residencia para emprendedores (Ley 14/2013)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'Public or private health insurance with an entity authorised to operate in Spain (Ley 14/2013 art 62). Same requirement as the digital nomad route, which sits under the same law.',
          status: 'draft',
        },
        {
          id: 'visa.entrepreneur.criminal-record',
          type: 'cleanCriminalRecord',
          value: true,
          label: 'You have no criminal record in the countries you have lived in over the last five years',
          effectiveFrom: '2013-09-29',
          source: {
            url: 'https://www.inclusion.gob.es/en/web/unidadgrandesempresas/emprendedores',
            title: 'UGE: Residencia para emprendedores (Ley 14/2013)',
            accessed: '2026-07-06',
          },
          reviewBy: '2027-07-06',
          note:
            'No criminal record in Spain or in countries of residence over the last 5 years (Ley 14/2013 art 62). Five-year window, matching the work and student routes.',
          status: 'draft',
        },
      ],
      nextSteps: [
        'Build the business plan first and get the favourable ENISA report. Without it the application does not proceed, and it is the part that takes real preparation.',
        'Apply either from Spain to the UGE (which resolves in about 20 working days) or at the Spanish consulate for the entry visa.',
        'Gather the means evidence and criminal record certificate in parallel with the report.',
        'Once approved, the entrepreneur residence is renewable and the family can be included in the same application.',
      ],
      userNote:
        'This visa lives or dies on the ENISA report. It is a genuine assessment of whether your business is innovative and useful to Spain, not a box-tick, and a weak plan is the usual reason for refusal. Get the plan right before anything else.',
      effectiveFrom: '2013-09-29',
      source: {
        url: 'https://www.inclusion.gob.es/en/web/unidadgrandesempresas/emprendedores',
        title: 'UGE: Residencia para emprendedores (Ley 14/2013, arts 62 and 68-70)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'The entrepreneur residence under Ley 14/2013 (arts 68-70, general requirements art 62), processed by the UGE. effectiveFrom is the law\'s entry into force. Law text: https://www.boe.es/buscar/act.php?id=BOE-A-2013-10074. Rule-level source covers existence, applicability and process. The means multiple is UGE practice rather than a statutory figure, flagged for verification.',
      status: 'draft',
    },

    // --- EU citizen registration (RD 240/2007) ----------------------------------
    {
      id: 'visa.eu-registration',
      label: 'EU citizen registration',
      officialName: 'Certificado de registro de ciudadano de la Unión',
      summary:
        'For EU, EEA or Swiss citizens staying in Spain longer than three months, who register as residents rather than apply for a visa.',
      applicability: {
        uk: 'not-applicable',
        us: 'not-applicable',
        'eea-swiss': 'applies',
        other: 'not-applicable',
      },
      applicabilityNotes: {
        uk: 'This route is only for EU, EEA and Swiss citizens. Post-Brexit UK citizens are third-country nationals and use a visa route instead.',
        us: 'This route is only for EU, EEA and Swiss citizens. US citizens use a visa route instead.',
        other: 'This route is only for EU, EEA and Swiss citizens. Other nationalities use a visa route instead.',
      },
      criteria: [
        {
          anyOf: [
            {
              id: 'visa.eu-registration.working',
              type: 'jobOfferInSpain',
              value: true,
              label: 'You work in Spain, employed or self-employed',
              effectiveFrom: '2007-04-02',
              source: {
                url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-4184',
                title: 'Real Decreto 240/2007, art. 7 (entrada, libre circulación y residencia de ciudadanos de la UE/EEE)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-07-06',
              note:
                'RD 240/2007 art 7.1(a): an EU/EEA/Swiss citizen who is an employed or self-employed worker in Spain has the right to reside beyond three months and registers on that basis, with no means or insurance test. Reuses the jobOfferInSpain askable type to mean "you are working here"; the label is worded for that. Workers need neither the means nor the insurance leaf below.',
              status: 'draft',
            },
            {
              id: 'visa.eu-registration.means-and-insurance',
              type: 'minIncomeMultiple',
              figureId: 'income-refs.iprem-monthly',
              multiple: 1,
              dependants: { first: 0.7, additional: 0.7 },
              basis: 'sufficient resources for yourself and your family so as not to become a burden on Spanish social assistance',
              label: 'Or you are not working but have sufficient resources and health cover in Spain',
              effectiveFrom: '2007-04-02',
              source: {
                url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-4184',
                title: 'Real Decreto 240/2007, art. 7 (entrada, libre circulación y residencia de ciudadanos de la UE/EEE)',
                accessed: '2026-07-06',
              },
              reviewBy: '2027-01-31',
              note:
                'RD 240/2007 art 7.1(b)/(c): a non-working (or student) EU/EEA/Swiss citizen must show sufficient resources for themselves and their family plus health insurance covering all risks in Spain. The law sets no fixed figure and caps it at the level below which Spaniards get social assistance (the minimum contributory pension); in practice offices use around 100% of the IPREM for the applicant plus 70% per family member. THE 100%/70% FIGURES ARE ADMINISTRATIVE PRACTICE, NOT SET IN RD 240/2007, and are flagged in the notes file. The health-insurance half of art 7.1(b) is folded into this criterion note rather than asked as a separate leaf, because for the non-worker both are required together; a "yes" here means both means and cover.',
              userNote:
                'The resources test has no fixed legal figure. Offices apply their own guidance around the IPREM, and your health policy must give full cover in Spain with no co-payments. Check your local office\'s current practice before you book an appointment.',
              status: 'draft',
            },
          ],
        },
      ],
      nextSteps: [
        'Book an appointment at the Immigration Office or a designated police station in the province where you live. This is a registration, not a visa application.',
        'Take your passport or national ID, proof of why you qualify (work contract, or resources plus health insurance), and the paid Modelo 790 code 012 fee.',
        'You should register within three months of arriving if you plan to stay longer than three months.',
        'You receive a green certificate (the certificado de registro) with your NIE. It does not expire, but keep proof of continued residence for later permanent-residence and citizenship steps.',
      ],
      userNote:
        'This is a registration you are entitled to, not a permission that can be refused if you meet a condition, so it is far simpler than a visa. The green certificate is paper, not a card, and easy to lose. Keep it safe, because replacing it means going through the appointment system again.',
      effectiveFrom: '2007-04-02',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-4184',
        title: 'Real Decreto 240/2007, de 16 de febrero (ciudadanos de la UE/EEE), arts. 3 and 7',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-07-06',
      note:
        'The EU free-movement registration under RD 240/2007, which transposes Directive 2004/38/EC. Applicability is the INVERSE of every other rule here: it applies ONLY to eea-swiss and is not-applicable to uk/us/other, who are third-country nationals. Art 3 obliges anyone staying over three months to register; art 7 sets the worker / sufficient-resources / student conditions. Rule-level source is the BOE consolidated text. The means figures are administrative practice, flagged for verification.',
      status: 'draft',
    },
  ],
};
