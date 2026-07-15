/*
 * tool-pages-data.js - THE SINGLE SOURCE OF TRUTH for every calculator page
 * ---------------------------------------------------------------------------
 * This file holds the page COPY only. The figures (rates, bands, dates,
 * sources) live in tools/legal-data/ and are rendered into the page by
 * tools/build-tool-pages.js - no rate number is ever written here, so the
 * copy can never drift against the spine. (The one allowed exception:
 * national IVA 10% may appear in prose.)
 *
 * After editing this file, run:   node tools/build-tool-pages.js
 * Local preview with draft figures:  node tools/build-tool-pages.js --allow-draft
 * (never merge an --allow-draft build - it carries a red banner + noindex).
 *
 * See tools/TOOLS-NOTES.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

module.exports = {
  // Bump when the site CSS cache-buster changes.
  cssVersion: 'redesign-20260715-20',
  // Bump when js/calc-engine.js or js/itp-calculator.js change.
  jsVersion: 'itp-20260715-1',

  // Shown in the page hero and used as sitemap <lastmod>. Change together.
  updatedLabel: 'Updated July 2026',
  lastmod: '2026-07-05',

  /*
   * One entry per tool page. Copy fields mirror money-pages-data.js
   * (title/description/h1/lead/intro/when/refine/cta/faq); the calculator sits
   * between sectionsBefore and sectionsAfter. Build-only fields:
   *   slug            page URL, /<slug> (file <slug>.html at repo root)
   *   breadcrumb      the pillar this tool belongs to (cluster up-link)
   *   breadcrumbLeaf  the crumb label for this page
   *   calcHeading     heading of the calculator section
   *   rateTableHeading heading of the generated rates-by-region section
   *   baseNote        one-line tax-base caveat shown under the calculator
   *   blogCategories  used for the "All guides" link target
   *   guides          exactly 3 blog-data.js slugs for the related cards
   *   llmsLine / llmsFullContains   the llms.txt + llms-full.txt entries
   */
  pages: {
    itp: {
      slug: 'itp-calculator-spain',
      breadcrumb: { href: '/property-lawyers-spain', label: 'Property Lawyers' },
      breadcrumbLeaf: 'ITP calculator',
      calcHeading: 'Calculate your property transfer tax',
      rateTableHeading: 'The rates by region, with sources',
      baseNote:
        'The calculator works on the declared purchase price. On a resale, if the official reference value of the property, the valor de referencia, is higher than your price, the tax office assesses ITP on that value instead.',
      blogCategories: ['property'],
      guides: [
        'spanish-property-taxes-foreign-owners',
        'buying-property-spain-foreigner',
        'conveyancing-spain',
      ],
      llmsLine:
        'ITP property transfer tax calculator (sourced regional rates, resale and new build)',
      llmsFullContains:
        'an interactive calculator that computes ITP on a resale purchase or IVA plus AJD on a new build, reading only verified figures with official tax-authority sources; a per-region rate table with source links and effective dates; a worked banded example; a "when do you actually need a property lawyer" section; and links to the related buying guides.',

      title: 'ITP Calculator Spain: Property Transfer Tax | ExpatLawyerSpain',
      description:
        'Work out ITP property transfer tax on a Spanish resale by region, or IVA plus stamp duty on a new build. Sourced figures, banded breakdown, one free enquiry.',
      h1: 'ITP Calculator Spain: Property Transfer Tax by Region',
      lead:
        'Enter your region and declared price and see the property transfer tax on a Spanish home, resale or new build, with the working shown and every figure sourced.',
      intro: `
  <p>ITP, the <em>Impuesto sobre Transmisiones Patrimoniales</em>, is Spain's tax on buying a resale home, set by each region and usually the biggest line in your closing costs. A new build is taxed differently, at IVA (Spanish VAT) plus a smaller regional stamp duty, and the calculator below works out both.</p>`,

      sectionsBefore: [],

      sectionsAfter: [
        {
          heading: 'Resale or new build: which tax you actually pay',
          html: `
  <p>Two purchases, two completely different tax bills. Getting this right before you calculate anything matters, because the taxes do not overlap: you pay one route or the other, never both.</p>
  <p><strong>Buying a resale home</strong> (any property being sold on, not for the first time) means you pay ITP, the transfer tax, at your region's rate. The buyer pays it. There is no VAT on a resale.</p>
  <p><strong>Buying a new build</strong> (a first delivery straight from the developer) means you pay IVA at 10% instead, plus AJD, the regional stamp duty on the purchase deed (<em>Actos Jurídicos Documentados</em>). The developer charges the IVA and passes it to the tax office; you pay the AJD. A new build never attracts ITP. In the Canary Islands the developer charges IGIC, the local equivalent of IVA, and the calculator handles that too.</p>
  <p>On a resale you file and pay ITP yourself, usually within 30 working days of signing the deed at the notary. Miss that window and the tax office adds a surcharge, so this is a date to diarise, not a bill that waits for you.</p>
  <p>One thing the calculator flags but cannot decide for you: on a resale, the tax office can assess ITP on the <em>valor de referencia</em>, the official reference value it assigns to the property, if that figure is higher than the price you actually pay. When it is, your tax is worked out on the reference value, not on your price.</p>`,
        },
        {
          heading: 'How the calculator works',
          html: `
  <p>The calculator does not guess. It reads a maintained set of tax figures, each tied to the official regional or national source it came from, and applies the one that matches your region and purchase type. For a banded region it shows the working tranche by tranche, so you can see exactly how the total was built rather than taking a single number on trust.</p>
  <p>Every result carries the source link for the rate used and a "figures last verified" date, so you can check the figure against the tax authority yourself. Where a region charges a special rate in particular cases, the tool shows that as a caveat alongside your result rather than folding it silently into the number.</p>
  <p>The calculator covers the regions we have verified against their official tax-authority pages. If your region is not yet listed, that means we have not confirmed its current rate to the standard we are willing to publish, not that the tax does not apply. A property lawyer or <em>gestor</em> covering that region will have the current figure.</p>`,
        },
        {
          heading: 'What this number does not include',
          html: `
  <p>ITP (or IVA plus AJD) is the tax on the purchase. It is the largest closing cost, but it is not the only one. The figure this tool gives you does not cover:</p>
  <ul>
    <li><strong>Notary fees</strong> for witnessing the deed, set by a regulated scale.</li>
    <li><strong>Land Registry fees</strong> to register you as the new owner.</li>
    <li><strong>Gestoría fees</strong>, if a processing agent handles the paperwork and tax filing for you.</li>
    <li><strong>Your lawyer's fee</strong> for the independent legal checks, typically around 1% of the price.</li>
  </ul>
  <div class="callout">
    <strong>Plusvalía is the seller's tax, not yours</strong>
    <p>The <em>plusvalía municipal</em>, the council tax on the increase in the land's value since the seller bought it, is the seller's cost by law, not the buyer's. Do not budget for it as a purchase cost. Watch instead for a contract clause that tries to shift it onto you, which a lawyer catches on a read-through of the deposit contract.</p>
  </div>
  <p>As a rough frame, budget 10% to 14% of the purchase price for all taxes, fees and legal costs combined, with the tax this calculator gives you as the biggest piece of it.</p>`,
        },
      ],

      when: {
        heading: 'When do you actually need a property lawyer?',
        html: `
  <p>Working out the tax is the easy part, and you have just done it. If you are buying a straightforward resale flat from a resident seller, paying in full with your own money, and the price and the reference value line up, the purchase itself is largely form-filling and dates. Plenty of buyers handle that with a good gestor and no lawyer.</p>
  <p>A property lawyer earns the fee at specific moments, not as a general precaution:</p>
  <ul>
    <li><strong>Before you sign the arras.</strong> The <em>contrato de arras</em> is the private deposit contract between you and the seller, and it is binding: pull out and you lose the deposit, the seller pulls out and they owe you double. The terms are negotiable, which means they are checkable, and the moment to check them is before you sign, not after.</li>
    <li><strong>When the reference value is higher than your price.</strong> If the tax office assesses ITP on the <em>valor de referencia</em> and you think that value is too high for the actual property, you can challenge it, but the appeal has to be argued and evidenced correctly to succeed.</li>
    <li><strong>Buying off-plan.</strong> Your stage payments to the developer must be secured by a bank guarantee. If they are not and the developer fails, the money is usually gone. A lawyer confirms the guarantee is real before you pay.</li>
    <li><strong>Buying through a company, or as a large holder.</strong> The structure changes the tax and the paperwork, and some regions charge a much higher rate on large holders, so the figure a standard calculator gives you may not be the one that applies to you.</li>
  </ul>
  <p>If any of those is your situation, you can <a href="/property-lawyers-spain">compare verified property lawyers in Spain</a> and reach the best-fit one with a single enquiry.</p>`,
      },

      cta: {
        strong: 'You have the tax number. The number is the easy part.',
        text:
          'The contract terms, the reference value and the order you do things in are where Spanish purchases actually go wrong. Send one enquiry and we route it to the best-fit verified property lawyer for your region and case. Free, no obligation.',
        btn: 'Send an enquiry',
      },

      // The refine (relief personalisation) copy. Embedded at build time as
      // window.ELS_ITP_COPY; every string is British English with no em/en
      // dashes and no banned words. The handful of numerals here (the 3-year
      // Balearic residence gate, the 60% mortgage LTV gate, the 33/64/65
      // disability bands) are the ENGINE'S FIXED INPUT CONTRACT from
      // js/calc-engine.js, not spine figures. No rate or euro threshold ever
      // lives here: those are substituted at runtime from engine output.
      refine: {
        heading: 'Could you pay less? Refine for your situation',
        intro: 'Some regions charge less when the buyer meets set conditions. Answer what applies to you and the calculator checks the reductions it has verified for your region.',
        yes: 'Yes',
        no: 'No',
        choose: 'Choose',
        labelJoin: ' and ',
        gate: { label: 'Will this be your main home, the one you live in?' },
        questions: {
          age: { label: 'Your age' },
          firstHome: { label: 'Will this be your first home?' },
          ownsOtherHome: { label: 'Do you own half or more of another home?' },
          income: {
            label: "Your taxable income on your last Spanish IRPF return, roughly. If you're buying as a household, use the household figure.",
            noIrpfLabel: "I don't file Spanish tax returns yet",
          },
          savingsIncome: { label: 'Your savings and investment income last year, roughly' },
          disability: { label: 'Recognised disability?', none: 'None', mid: '33 to 64%', high: '65% or more' },
          family: {
            label: 'Family status',
            none: 'None of these',
            large: 'Large family (familia numerosa)',
            single: 'Single-parent family (familia monoparental)',
            both: 'Both',
          },
          priorResidence: { label: 'Have you lived in the Balearic Islands for the last 3 years or more?' },
          mortgageLtv: { label: 'Will a mortgage cover 60% or more of the appraised value?' },
          island: {
            label: 'Which island?',
            options: { 'mallorca-menorca': 'Mallorca or Menorca', 'ibiza-formentera': 'Ibiza or Formentera' },
          },
        },
        taxNames: { resale: 'ITP', newBuild: 'IVA plus AJD', newBuildCanarias: 'IGIC plus AJD' },
        appliedHeadline: 'Based on what you told us, you likely qualify for {label}. Your {taxName} would be about {yourTotal} instead of {standardTotal}, saving about {saving}.',
        dependsOnHeading: 'This depends on',
        sourcesHeading: 'Where these rules come from',
        appliedClose: 'A lawyer confirms you qualify and files the reduced rate. Getting a relief wrong means a top-up assessment later, with interest.',
        unavailable: "For a holiday home or a property you won't live in, the reduced rates don't apply. Nearly every regional relief requires the home to be your habitual residence in Spain, and most also need Spanish income-tax history.",
        aboveValueCap: 'This home is above the value limit {region} sets for its reduced rates, so the standard rate applies. These limits sit well below typical coastal prices, which is why higher-value purchases rarely qualify.',
        noRelief: 'Based on what you told us, none of the reduced rates in {region} apply to this purchase, so the standard rate is the one to use.',
        otherSituation: 'Something else about your situation, for example protected housing or another special category? A lawyer can check every relief your region offers.',
        otherSituationLink: 'Compare verified property lawyers in Spain',
        noIrpf: 'Most of these reliefs are checked against your Spanish IRPF return, so they generally need Spanish tax residency first. A lawyer can confirm what applies in your case.',
        ctaBtn: 'Send an enquiry',
        conditions: {
          relAtMost: 'no more than',
          relUnder: 'under',
          anyOfPrefix: 'Either ',
          anyOfJoin: ' or ',
          maxAgeInclusive: 'You are {value} or under',
          maxAgeStrict: 'You are under {value}',
          habitualResidence: 'The home is your habitual residence, the one you live in',
          firstHome: 'This is your first home',
          noPriorPropertyOwnership: 'You do not own half or more of another home',
          maxIncome: 'Your income is {rel} {value}, measured as {basis}',
          maxHouseholdIncome: 'Your household income is {rel} {value}, measured as {basis}',
          maxSavingsIncome: 'Your savings and investment income is {rel} {value}, measured as {basis}',
          maxPropertyValue: 'The property costs no more than {value}',
          maxPropertyValueIsland: 'The property costs no more than {value} on {island}',
          disabilityMin: 'A recognised disability of {value}% or more',
          disabilityAny: 'A legally recognised disability',
          largeFamily: 'You are a large family (familia numerosa)',
          singleParentFamily: 'You are a single-parent family (familia monoparental)',
          priorRegionResidenceYears: 'You have lived in the region for the last {value} years or more',
          mortgageLtvMin: 'A mortgage covers {value}% or more of the appraised value',
          priorHomeSaleWindow: 'You own no other home, or you sell your previous home within the legal window',
          other: 'A further condition the calculator does not check, so a lawyer confirms it',
        },
      },

      faq: [
        {
          q: 'Do I pay ITP on a new-build property?',
          a: 'No. A first delivery from the developer carries IVA (Spanish VAT) at 10% instead of ITP, plus AJD, the regional stamp duty on the purchase deed. ITP applies only to resale homes. You pay one route or the other, never both.',
        },
        {
          q: 'What happens if I pay ITP late?',
          a: 'ITP is normally due within 30 working days of signing the deed at the notary, and you file and pay it yourself. File late and the tax office adds a surcharge that grows the longer you leave it, with interest on top once enough time passes. It is a fixed deadline, so diarise it from the signing date.',
        },
        {
          q: 'What is the valor de referencia and can I challenge it?',
          a: 'The valor de referencia is the official reference value the tax office assigns to a property. On a resale, if that value is higher than the price you pay, your ITP is worked out on the reference value rather than on your price. You can challenge it, but the appeal has to be argued and evidenced properly, which is a specific job a property lawyer or gestor does.',
        },
        {
          q: 'Does the calculator include reduced rates?',
          a: "Only the officially verified ones. Several regions charge a reduced rate, or a discount on the tax due, for a main home bought by a young buyer, a large family or a buyer with a recognised disability. Where we have verified a region's rules against its official source, the calculator asks a few extra questions and applies the most favourable relief you likely qualify for, with the conditions listed. Where we have not, it shows the general rate and says so.",
        },
        {
          q: 'What are the reduced ITP rates?',
          a: 'Most regions charge less than their general rate for certain buyers, most commonly on a main home bought by a young buyer, a large family or a buyer with a recognised disability. Each region writes its own rules, so the conditions and the paperwork differ depending on where you buy. The reduction can be a lower rate on the price or a percentage off the tax due, and the difference is often thousands of euros.',
        },
        {
          q: 'Why does the calculator ask about my main home and my Spanish tax returns?',
          a: 'Nearly every regional relief requires the home to be your habitual residence in Spain, and most check your income against your Spanish IRPF return. If you are buying a holiday home, or you do not file Spanish tax returns yet, the reduced rates generally do not apply to you. That is why the refine questions start there: two answers rule most reliefs in or out.',
        },
        {
          q: 'Why do the results show sources?',
          a: 'Because a tax figure you cannot check is a figure you should not trust. Each result links to the official regional or national tax page the rate came from and shows when we last verified it, so you can confirm the number yourself rather than taking ours on faith. Regional rates change, and the source link is how you tell whether ours is current.',
        },
      ],
    },
  },
};
