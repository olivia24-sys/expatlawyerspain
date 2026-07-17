/*
 * tools/visa-checker-copy.js - THE COPY DECK for /spain-visa-checker
 * ---------------------------------------------------------------------------
 * Every user-facing string for the visa eligibility checker page lives here.
 * Nothing else does: no visa facts, no euro amounts, no thresholds. Those
 * come from the legal-data spine (tools/legal-data/visas.js + income-refs.js)
 * and are rendered by js/visa-checker.js at runtime, so the copy can never
 * drift against the law. The rule mirrors tool-pages-data.js: figures in the
 * spine, words here.
 *
 * A separate build agent folds this into tools/tool-pages-data.js. The
 * top-level fields mirror the itp copy-entry field names so the fold is
 * mechanical: slug, breadcrumb, breadcrumbLeaf, title, description, h1, lead,
 * intro, sectionsBefore, sectionsAfter, when, cta, faq. The checker-specific
 * strings sit under `checker`, the way itp keeps its calculator strings under
 * `refine`.
 *
 * VOICE: els-brand-voice.md is canonical. British English, no em/en dashes
 * anywhere, no spaced-hyphen sentence breaks, one empathy sentence at most,
 * active voice, the lead-magnet mechanic (the lawyer is the natural next step,
 * never a pitch). No banned words.
 *
 * ---------------------------------------------------------------------------
 * THE `checker` SHAPE, and how js/visa-checker.js reads it
 * ---------------------------------------------------------------------------
 * checker.gate            the nationality gate, rendered FIRST and alone:
 *   .legend               the question
 *   .help                 one line under it
 *   .optionOrder          [group keys] the order the four choices render in.
 *                         Labels come from the embedded nationalityGroups, not
 *                         from here (they are shared spine vocabulary).
 *
 * checker.questionOrder   [answer keys] the FIXED priority order progressive
 *                         questions render in. The checker renders the union
 *                         of every result's missingInputs, sorted by this
 *                         order, and never renders a key the engine is not
 *                         asking for. Every askable answerKey in the engine's
 *                         CRITERION_KINDS registry (plus 'dependants', which
 *                         the income/savings criteria ask for) MUST appear
 *                         here, or that question can never be rendered.
 *
 * checker.questions       { answerKey: spec } one spec per answer key:
 *   .kind                 'yesNo' | 'number' | 'select'
 *   .legend / .label      the question text (legend for yesNo/select
 *                         fieldsets, label for a number input)
 *   .help                 OPTIONAL one line under the question
 *   .yes / .no            yesNo only: the two option labels (default to
 *                         checker.yes / checker.no when omitted)
 *   .options              select only: [{ value, label }] in render order
 *   .placeholder          number only: OPTIONAL input placeholder
 *   .unit                 number only: OPTIONAL suffix shown after the input
 *
 * checker.groups          the four result groups, each { heading, blurb }:
 *   .eligible             met the headline requirements (never "approved")
 *   .needInfo             more answers needed
 *   .notEligible          a requirement is not met
 *   .notNeeded            no visa needed (EEA/Swiss)
 *
 * checker.outcomes        outcome-level sentences and small labels:
 *   .eligibleLine         the honest "you appear to meet" line per card
 *   .needInfoLine         the "here is what is still missing" lead-in
 *   .lawyerRouteLine      shown when result.lawyerRoute is true
 *   .notEligibleLine      the "this requirement is not met" lead-in
 *   .criterionMet/.criterionNotMet/.criterionUnknown  marker labels
 *   .thresholdMonthly/.thresholdTotal  templates for the computed euro floor
 *                         ({amount} is substituted from result.criteria
 *                         threshold, never authored here)
 *   .figuresChecked       template for the effectiveFrom/reviewBy provenance
 *                         line ({from}, {review} substituted from the engine)
 *   .nextStepsHeading / .userNoteHeading / .sourcesHeading  sub-headings
 *   .officialNamePrefix   glosses the Spanish official name
 *
 * checker.cta             the per-card call to action:
 *   .heading / .text      the block copy
 *   .primaryLabel         -> /immigration-lawyers-spain
 *   .secondaryLabel       -> /#contact-form
 *
 * checker.gateNotNeeded   the EEA/Swiss "you don't need a visa" panel:
 *   .heading / .lead      the honest no-visa framing
 *   .registerHeading      heading for the EU-registration route (rendered only
 *                         if the eu-registration rule is present in the data)
 *
 * checker.disclaimer      the standing directory/not-a-law-firm line.
 * checker.emptyState      shown when the embed carries zero rules.
 * ---------------------------------------------------------------------------
 */

'use strict';

module.exports = {
  // --- fold-in fields: mirror the itp copy entry ---------------------------
  slug: 'spain-visa-checker',
  breadcrumb: { href: '/immigration-lawyers-spain', label: 'Immigration Lawyers' },
  breadcrumbLeaf: 'Visa checker',

  title: 'Spain Visa Checker: Which Residence Route Fits You | ExpatLawyerSpain',
  description:
    'Answer a few questions and see which Spanish visa routes match your situation, with the real requirements and official sources. Free, no sign-up.',
  h1: 'Spain Visa Checker: Which Residence Route Fits You',
  lead:
    'Tell us your nationality and a little about your situation, and see which Spanish residence routes you appear to meet the headline requirements for, with every requirement sourced.',

  intro: `
  <p>Spain has several ways for a non-EU national to live here legally, and they do not overlap neatly. The digital nomad visa suits people who keep working remotely for a company abroad. The non-lucrative visa suits people who can support themselves without working. Each has its own income floor, its own paperwork and its own place you apply from, and picking the wrong one costs months.</p>
  <p>This checker asks about your situation and shows the routes that fit, the requirements you appear to meet, and the ones you do not. It reads the same sourced requirements a lawyer would work from, so you can see where you stand before you spend anything.</p>`,

  sectionsBefore: [
    {
      heading: 'How the checker reads your answers',
      html: `
  <p>Your nationality decides almost everything, so the checker asks that first. If you hold an EU, EEA or Swiss passport you do not need a visa to live in Spain at all, and the checker says so and stops. For everyone else, post-Brexit UK citizens included, Spain treats you as a third-country national and one of these residence routes applies.</p>
  <p>After that the checker only asks what it needs to. Each question narrows the routes in or out. Answer honestly rather than optimistically: an income figure a few hundred euros short is the single most common reason an application fails at the consulate, and the checker can only be as accurate as what you tell it.</p>`,
    },
  ],

  sectionsAfter: [
    {
      heading: 'What "you appear to meet the requirements" does and does not mean',
      html: `
  <p>The checker compares your answers against the published headline requirements for each route. When it says you appear to meet them, it means the income floor, the paperwork categories and the eligibility conditions on the official pages line up with what you entered. It does not mean your application will be approved.</p>
  <p>Approval is a separate question the checker cannot answer. The UGE and the consulates examine the real documents, the work relationship and the social-security position case by case, and paperwork from some countries takes months to legalise. The checker gets you to the right route and shows you the bar. Clearing it in practice is where the paperwork lives.</p>`,
    },
  ],

  when: {
    heading: 'When do you actually need an immigration lawyer?',
    html: `
  <p>If you have a clear-cut case, one route obviously fits, your income sits comfortably above the floor, your paperwork is straightforward, you can often apply yourself or with a gestor and no lawyer.</p>
  <p>A lawyer earns the fee at specific moments, not as a general precaution:</p>
  <ul>
    <li><strong>When two routes are close and the wrong one wastes months.</strong> If your situation sits between the digital nomad and non-lucrative visas, for example because you still do some remote work, the choice is not cosmetic. Applying on the wrong route gets refused, and you start again from the back of the queue.</li>
    <li><strong>When the social-security piece is unclear.</strong> On the digital nomad visa this is the slowest document and the most common reason applications stall. Whether you register in Spain or stay in your home system under a coordination agreement turns on your exact contract, and getting it wrong holds up everything else.</li>
    <li><strong>When your income sits near the floor.</strong> The bar moves every year with the minimum wage, and the authorities have at times read it against a higher annualised figure. If you are close, a lawyer tells you whether you clear the version of the bar your consulate actually applies.</li>
    <li><strong>When the checker routes you to "a lawyer can confirm".</strong> Some routes, arraigo and family reunification among them, turn on facts a form cannot weigh. Those never resolve to a yes or no here by design, because the honest answer is that someone has to look at the specifics.</li>
  </ul>
  <p>If any of those is your situation, you can <a href="/immigration-lawyers-spain">compare verified immigration lawyers in Spain</a> and reach the best-fit one with a single enquiry.</p>`,
  },

  cta: {
    strong: 'You know which route fits. The route is the easy part.',
    text:
      'The income evidence, the social-security position and the order you do things in are where Spanish applications actually go wrong. Send one enquiry and we route it to the best-fit verified immigration lawyer for your case. Free, no obligation.',
    btn: 'Send an enquiry',
  },

  faq: [
    {
      q: 'Does this tell me I will be approved?',
      a: 'No, and no honest tool could. The checker compares your answers against the published headline requirements for each route, so it can show you which visa fits and whether you appear to meet the income floor and the eligibility conditions. Approval is decided by the UGE or the consulate on your actual documents, your work relationship and your social-security position, case by case. The checker gets you to the right route and shows you the bar. It cannot see the file an officer sees.',
    },
    {
      q: 'I am a UK citizen. Which rules apply to me?',
      a: 'Since Brexit, Spain treats UK citizens as third-country nationals, the same as US or other non-EU applicants. You need one of these residence visas to live in Spain for more than 90 days in any 180. The pre-Brexit right to live in Spain freely no longer applies to new arrivals, so the checker puts UK citizens through the full route questions rather than the EU path.',
    },
    {
      q: 'Where do the requirements and figures come from?',
      a: 'Each result links to the official Spanish source the requirement came from, the Ministerio de Inclusión, the UGE or the consular pages, and shows when we last checked it. The income floors are calculated live from the current IPREM and minimum-wage figures, so when Spain revises those every year the numbers here update with them rather than going stale.',
    },
    {
      q: 'Why does it ask my income and how many dependants I have?',
      a: 'Every residence route has an income or savings floor, and the floor rises with each family member who joins you. The checker cannot tell whether you meet it without both numbers, so it asks for them together. The euro figure it shows you is the minimum. Because the bar moves each year and some consulates read it against a higher annual figure, treat the number as a floor and budget a margin above it.',
    },
    {
      q: 'What does "a lawyer can confirm whether this route fits" mean?',
      a: 'Some routes turn on facts a checker cannot weigh, arraigo (residence through established ties) and family reunification among them. Those depend on the detail of your circumstances, so the checker never returns a plain yes or no for them. It flags them as worth a lawyer\'s look instead, because a wrong automatic answer there would be worse than none.',
    },
    {
      q: 'Is my answer data stored?',
      a: 'The checker runs in your browser and we do not store what you enter. Our analytics records that a check ran, the nationality group chosen and how many routes matched, the same way it counts visits to any page, but not your income, savings or any other answer. If you send an enquiry through the contact form afterwards, that is a separate step you choose to take, and only the details you put in that form reach us.',
    },
  ],

  // --- the checker itself ---------------------------------------------------
  checker: {
    // Shared yes/no labels (per-question specs may override).
    yes: 'Yes',
    no: 'No',
    choose: 'Choose',

    gate: {
      legend: 'What is your nationality?',
      help: 'This decides which routes apply, so the checker asks it first. Nothing else is shown until you answer.',
      optionOrder: ['uk', 'us', 'eea-swiss', 'other'],
    },

    // FIXED priority order for progressive questions. The checker renders the
    // union of all results' missingInputs, sorted by this order. Broad
    // situation questions first (they rule whole routes in or out), then the
    // qualification questions, then the shared compliance questions everyone
    // faces. Every askable answerKey in the engine plus 'dependants' appears.
    questionOrder: [
      // what kind of applicant you are (rules whole routes in or out first)
      'remoteEmployeeOfForeignCompany',
      'spanishClientsSharePercent',
      'noWorkInSpain',
      'admittedToStudies',
      'jobOfferInSpain',
      'innovativeBusinessProject',
      'familyMemberSpanishResident',
      'yearsLivingInSpain',
      // how you qualify on that route
      'employmentRelationshipMonths',
      'universityDegree',
      'professionalExperienceYears',
      // means (income/savings then the dependant count that sets the bar)
      'monthlyIncome',
      'savings',
      'dependants',
      // compliance everyone faces
      'healthInsurance',
      'cleanCriminalRecord',
      'medicalCertificate',
    ],

    questions: {
      remoteEmployeeOfForeignCompany: {
        kind: 'yesNo',
        legend: 'Do you work remotely for a company based outside Spain?',
        help: 'An employer abroad that you work for by computer, not a Spanish company.',
      },
      spanishClientsSharePercent: {
        kind: 'number',
        label: 'If you are self-employed, what share of your work is for clients in Spain?',
        help: 'A rough percentage. Leave the rest of your work as clients outside Spain.',
        placeholder: '10',
        unit: '%',
      },
      noWorkInSpain: {
        kind: 'yesNo',
        legend: 'Will you support yourself without working or running a business in Spain?',
        help: 'This covers people living on pensions, savings or passive income rather than a job here.',
      },
      admittedToStudies: {
        kind: 'yesNo',
        legend: 'Have you been accepted onto a course of study in Spain?',
        help: 'A place confirmed by a recognised Spanish school, university or training centre.',
      },
      jobOfferInSpain: {
        kind: 'yesNo',
        legend: 'Do you have a job offer from an employer in Spain?',
        help: 'A Spanish employer offering you a contract, not remote work for a company abroad.',
      },
      innovativeBusinessProject: {
        kind: 'yesNo',
        legend: 'Are you starting a business Spain recognises as innovative?',
        help: 'A project assessed as innovative under the startups law, not an ordinary self-employment plan.',
      },
      familyMemberSpanishResident: {
        kind: 'yesNo',
        legend: 'Do you have a close family member who is a legal resident in Spain?',
        help: 'A spouse, partner, parent or child already living in Spain with the right to be here.',
      },
      yearsLivingInSpain: {
        kind: 'number',
        label: 'How many years have you already lived in Spain?',
        help: 'Count the time you have actually been here, however you have been living.',
        placeholder: '3',
        unit: 'years',
      },
      employmentRelationshipMonths: {
        kind: 'number',
        label: 'How many months have you worked with your employer or main clients?',
        help: 'The length of the working relationship you are applying on, up to now.',
        placeholder: '6',
        unit: 'months',
      },
      universityDegree: {
        kind: 'yesNo',
        legend: 'Do you hold a university degree or recognised professional qualification?',
        help: 'A degree, or a qualification from a training or business school of recognised standing.',
      },
      professionalExperienceYears: {
        kind: 'number',
        label: 'How many years of professional experience do you have in your field?',
        help: 'Use this if you do not have a degree. Enough experience can stand in its place.',
        placeholder: '3',
        unit: 'years',
      },
      monthlyIncome: {
        kind: 'number',
        label: 'What is your regular gross income each month?',
        help: 'Before tax. Include what you can evidence: salary, pensions, rent, dividends and other regular income.',
        placeholder: '3,000',
        unit: 'euros a month',
      },
      savings: {
        kind: 'number',
        label: 'What savings do you hold that you could show a consulate?',
        help: 'Cash or readily available funds you can evidence with statements. Use this if your income is low but your savings are not.',
        placeholder: '30,000',
        unit: 'euros in total',
      },
      dependants: {
        kind: 'number',
        label: 'How many family members will join you on the application?',
        help: 'A partner and any children moving with you. Enter 0 if you are applying alone. Each one raises the income you need to show.',
        placeholder: '0',
        unit: 'people',
      },
      healthInsurance: {
        kind: 'yesNo',
        legend: 'Do you have, or can you arrange, full health cover valid in Spain?',
        help: 'Public cover, or a private policy from an insurer authorised to operate in Spain.',
      },
      cleanCriminalRecord: {
        kind: 'yesNo',
        legend: 'Are you free of a criminal record in the countries you have lived in recently?',
        help: 'You will need a certificate from each country you have lived in over the last few years.',
      },
      medicalCertificate: {
        kind: 'yesNo',
        legend: 'Can you get a doctor to certify you carry no disease of public-health concern?',
        help: 'A standard medical certificate. Nearly everyone can obtain one from any doctor.',
      },
    },

    groups: {
      eligible: {
        heading: 'Routes that appear to fit',
        blurb: 'You appear to meet the headline requirements for these, based on what you told us.',
      },
      needInfo: {
        heading: 'Routes that could fit, with more to check',
        blurb: 'These might fit, but the checker needs more from you, or a point on them needs a lawyer\'s eye.',
      },
      notEligible: {
        heading: 'Routes that do not fit',
        blurb: 'Based on your answers, a requirement on these is not met.',
      },
      notNeeded: {
        heading: 'Routes you do not need',
        blurb: 'These do not apply to you, because you can live in Spain without them.',
      },
    },

    outcomes: {
      eligibleLine: 'You appear to meet the headline requirements for this route.',
      needInfoLine: 'To finish checking this route, the checker still needs:',
      lawyerRouteLine: 'A lawyer can confirm whether this route fits your case.',
      notEligibleLine: 'This requirement is not met on your answers:',
      criterionMet: 'Met',
      criterionNotMet: 'Not met',
      criterionUnknown: 'Not answered yet',
      // {amount} is substituted from result.criteria[].threshold by the
      // checker. No euro figure is ever written in this file. The Floor
      // variants render while the family count is still unanswered.
      thresholdMonthly: 'Works out at {amount} a month for your situation',
      thresholdTotal: 'Works out at {amount} in total for your situation',
      thresholdMonthlyFloor: 'Works out at {amount} a month for a single applicant, more with family',
      thresholdTotalFloor: 'Works out at {amount} in total for a single applicant, more with family',
      // {from} is the requirement's in-force date, {accessed} the date we
      // last read the official source, {review} the next scheduled re-check.
      figuresChecked: 'In force since {from}. Checked against the official source {accessed}, next review {review}.',
      nextStepsHeading: 'What applying involves',
      userNoteHeading: 'Worth knowing',
      sourcesHeading: 'Where these requirements come from',
      officialNamePrefix: 'Officially the',
    },

    cta: {
      heading: 'Get this checked by someone who does it every week',
      text:
        'A verified immigration lawyer confirms the route fits, checks your income evidence and social-security position, and files it correctly the first time.',
      primaryLabel: 'Compare immigration lawyers in Spain',
      secondaryLabel: 'Send one enquiry',
    },

    gateNotNeeded: {
      heading: 'You do not need a visa to live in Spain',
      lead:
        'An EU, EEA or Swiss passport lets you live and work in Spain freely. None of the residence visas below apply to you.',
      registerHeading: 'What you do instead',
    },

    disclaimer:
      'ExpatLawyerSpain is a directory, not a law firm. This checker shows the headline requirements published by the Spanish authorities. It is not legal advice, and it cannot tell you whether an application will be approved.',

    emptyState:
      'The checker has no verified routes to show yet. Once the current routes are confirmed against their official sources, they will appear here.',
  },
};
