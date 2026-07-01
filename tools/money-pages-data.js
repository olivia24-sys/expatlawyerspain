/*
 * money-pages-data.js — THE SINGLE SOURCE OF TRUTH for every money page
 * (the national specialty pillar pages, and later — if approved — city pages).
 * ---------------------------------------------------------------------------
 * This file is the ONLY thing you edit to add or change a money page.
 *
 * After editing this file, run:   node tools/build-money-pages.js
 * That regenerates every money page, refreshes the firm tables from the LIVE
 * /lawyers listings, and keeps sitemap.xml, llms.txt, llms-full.txt and the
 * /lawyers "browse by specialty" links in sync.
 *
 * IMPORTANT: only pages in this file are ever generated (the approved list).
 * The script refuses to build any page with fewer than 2 verified firms.
 *
 * See tools/FABLE-NOTES-money-pages.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

module.exports = {
  // Bump this when the CSS cache-busting version changes elsewhere on the site.
  cssVersion: 'redesign-20260626-16',

  // Shown in the page hero ("Updated …") and used as sitemap <lastmod>.
  // Change BOTH together when you meaningfully update page content.
  updatedLabel: 'Updated July 2026',
  lastmod: '2026-07-01',

  // The vetting-methodology page every money page links to.
  vettingUrl: '/how-we-verify',

  // Minimum verified firms for a page to exist. Do not lower this —
  // below 2 the intent routes to the enquiry form instead (no thin stubs).
  minFirms: 2,

  /*
   * One entry per money page. Key = the specialty value used on /lawyers
   * firm cards (data-specialty). Fields:
   *   slug           - page URL, i.e. /<slug> (file <slug>.html at repo root)
   *   specialty      - the /lawyers data-specialty value the firm table filters on
   *   label          - human label for the specialty (used in headings/links)
   *   shortLabel     - compact label for sibling-directory links
   *   title / description - the <title> tag and meta description
   *   h1 / lead      - hero heading + hero lead sentence
   *   blogCategories - blog-data.js category keys; the "related guides" cards
   *                    and guide links are pulled from tools/blog-data.js so
   *                    they can never drift from the live blog listings
   *   intro          - opening paragraphs (HTML)
   *   sections       - the verified legal-facts sections (heading + HTML)
   *   when           - the "when do you actually need a lawyer?" section
   *   cta            - the navy CTA box (goes to the enquiry form)
   *   faq            - FAQ accordion items (no JSON-LD — dropped by Google June 2026)
   */
  pages: {
    immigration: {
      slug: 'immigration-lawyers-spain',
      specialty: 'immigration',
      label: 'Immigration & Residency',
      shortLabel: 'Immigration',
      title: 'Immigration & Residency Lawyers in Spain | ExpatLawyerSpain',
      description:
        'Compare verified English-speaking immigration lawyers in Spain. Visas, residency, the NLV and DNV, appeals and nationality — one free enquiry, no hidden fees.',
      h1: 'Immigration & Residency Lawyers in Spain',
      lead: 'Verified English-speaking lawyers for visa applications, residency cards, appeals and nationality — compared in one place, with one enquiry form.',
      blogCategories: ['immigration', 'moving-to-spain'],
      intro: `
  <p>Spain's immigration rules changed more in the last two years than in the previous ten: the Golden Visa was abolished in April 2025, income thresholds for the remaining visas rise every January, and post-Brexit UK nationals now queue under the same rules as everyone else. The firms below are verified English-speaking immigration specialists listed on ELS — what each one covers, where they are, and how to reach them with a single enquiry.</p>`,
      sections: [
        {
          heading: 'The visa routes an immigration lawyer handles in 2026',
          html: `
  <p>With the Golden Visa gone, two routes carry most expat moves to Spain:</p>
  <table class="cost-table">
    <thead>
      <tr><th scope="col">Visa</th><th scope="col">Income requirement (2026)</th><th scope="col">Work allowed?</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">Non-Lucrative Visa (NLV)</th><td>€2,400/month passive income for a single applicant (400% of IPREM), plus €600/month per dependant</td><td>No — passive income only</td></tr>
      <tr><th scope="row">Digital Nomad Visa (DNV)</th><td>€2,850/month (200% of the minimum wage, updated January 2026), plus €1,069/month for a spouse and €356/month per child</td><td>Yes — remote work, with at most 20% of income from Spanish clients</td></tr>
    </tbody>
  </table>
  <p>The DNV also opens the door to the <a href="/blog/beckham-law-spain">Beckham Law</a> — a flat 24% income tax rate on Spanish-source income up to €600,000 for up to six years. The application must be made within six months of registering as a Spanish resident, and missing that window forfeits it permanently. A lawyer handling your visa will normally bundle the Beckham application into the same instruction.</p>
  <p>Beyond the headline visas, immigration lawyers in Spain handle family reunification, the <em>arraigo</em> regularisation routes for people already in Spain, work permits, student-visa conversions, visa refusals and appeals, and Spanish nationality applications.</p>`,
        },
        {
          heading: 'Residency paperwork: NIE, TIE and the queues',
          html: `
  <p>Every route ends in the same paperwork. Your <a href="/blog/nie-number-spain-lawyer">NIE</a> is the identification number Spain uses to track you financially — nothing of legal significance happens without it. The TIE is the physical residency card non-EU nationals collect once a visa is approved.</p>
  <p>The bottleneck is appointments. Public NIE and TIE appointment slots in Barcelona and Madrid regularly run 6–8 weeks out; lawyers and <em>gestores</em> have access to appointment channels that aren't available through the public booking system and can often get the same thing done in days. If you're on a deadline — a property completion, a job start date, a visa expiry — that difference is usually the whole reason to instruct someone.</p>
  <div class="callout">
    <strong>The 90-day rule</strong>
    <p>Without a visa, UK and US nationals can spend at most 90 days in any 180-day period in the Schengen area. Overstaying creates a record that complicates every later application — it's the single most common self-inflicted problem immigration lawyers are asked to fix.</p>
  </div>`,
        },
        {
          heading: 'What immigration lawyers charge in Spain',
          html: `
  <p>Immigration and residency work in Spain typically runs €500 to €2,000 as a fixed fee depending on visa type and complexity — a Digital Nomad Visa application with a Beckham Law election sits at the top of that range, a straightforward NLV renewal near the bottom. Get the fee agreement in writing before any work begins; a reputable firm will offer that without being asked.</p>`,
        },
      ],
      when: {
        heading: 'When do you actually need an immigration lawyer?',
        html: `
  <p>If you're an EU citizen registering residency, or you need a one-off NIE for a bank account, you can usually manage the process yourself — it's form-filling plus patience with the appointment system.</p>
  <p>A lawyer earns their fee in these situations:</p>
  <ul>
    <li><strong>Your application has any complication.</strong> A previous refusal, an overstay, a criminal-record certificate issue, or income that doesn't fit neatly into the passive/active boxes. These need to be presented correctly the first time — appeals take months.</li>
    <li><strong>You're combining a visa with tax planning.</strong> The Beckham Law's six-month deadline runs from residency registration, not from when you get around to it. Visa and tax election need to be sequenced by one adviser.</li>
    <li><strong>You're on a hard deadline.</strong> Professional access to appointment slots is the difference between days and 6–8 weeks in the big cities.</li>
    <li><strong>Family reunification or nationality.</strong> Both are documentation-heavy and unforgiving of gaps; both are routinely refused on technicalities that a specialist would have caught.</li>
  </ul>`,
      },
      cta: {
        strong: 'Not sure which firm fits your situation?',
        text: 'Send one enquiry and we’ll route it to the best-fit verified immigration lawyer for your city and case. Free, no obligation.',
        btn: 'Send an enquiry',
      },
      faq: [
        {
          q: 'How much does an immigration lawyer cost in Spain?',
          a: 'Most immigration and residency work is quoted as a fixed fee between €500 and €2,000 depending on the visa and complexity. A Digital Nomad Visa application with a Beckham Law tax election sits at the top of that range. Always get the fee agreement in writing before work begins.',
        },
        {
          q: 'Can I still get a Golden Visa in Spain?',
          a: 'No. Spain abolished the Golden Visa (residency by €500,000+ property investment) in April 2025. The main routes now are the Non-Lucrative Visa for people with passive income and the Digital Nomad Visa for remote workers.',
        },
        {
          q: 'Do the lawyers listed here speak English?',
          a: 'Yes. Every firm listed on ExpatLawyerSpain is checked for genuine English-language service before it appears in the directory — that is the point of the site.',
        },
        {
          q: 'What if no firm here covers my city?',
          a: 'Several listed firms work nationwide and handle immigration matters remotely — visa applications rarely require you to be in the same city as your lawyer. Send one enquiry and we’ll route it to a firm that covers your situation.',
        },
      ],
    },

    property: {
      slug: 'property-lawyers-spain',
      specialty: 'property',
      label: 'Property',
      shortLabel: 'Property',
      title: 'Property Lawyers in Spain for Expats | ExpatLawyerSpain',
      description:
        'Compare verified English-speaking property lawyers in Spain. Independent legal checks, contracts and completion for foreign buyers — one free enquiry.',
      h1: 'Property Lawyers in Spain',
      lead: 'Verified English-speaking property lawyers for purchases, sales and disputes — independent of the agent, the developer and the notary.',
      blogCategories: ['property'],
      intro: `
  <p>Spain has no equivalent of UK conveyancing. The <em>notario</em> who witnesses your purchase works for the transaction, not for you — nobody in the standard Spanish process checks the property on the buyer's behalf unless you hire your own lawyer. For foreign buyers that check is the difference between a clean purchase and inheriting someone else's debts: unpaid IBI and community fees transfer with the property, not with the seller. The firms below are verified English-speaking property specialists listed on ELS.</p>`,
      sections: [
        {
          heading: 'What buying in Spain actually costs',
          html: `
  <p>Budget 10–14% on top of the purchase price for taxes, fees and legal costs combined. The biggest variable is regional:</p>
  <table class="tax-table">
    <thead>
      <tr><th scope="col">Cost</th><th scope="col">Rate</th><th scope="col">Notes</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">ITP (transfer tax, resale property)</th><td>6–10% by region</td><td>6% in Madrid, 7% in Andalusia, up to 10% in Catalonia — a €12,000 difference on a €300,000 resale</td></tr>
      <tr><th scope="row">IVA + AJD (new builds)</th><td>10% + ~1.5%</td><td>VAT replaces ITP on new builds, plus stamp duty</td></tr>
      <tr><th scope="row">Independent lawyer</th><td>~1% of price</td><td>Typical minimum €1,000–2,000 on lower-value properties; covers due diligence to completion</td></tr>
      <tr><th scope="row">Notary + registry</th><td>~1% combined</td><td>Fixed by scale; paid at completion</td></tr>
    </tbody>
  </table>
  <p>Full breakdown, including the 3% retention when you buy from a non-resident seller (Modelo 211 — the buyer's legal obligation, not the seller's), in the <a href="/blog/buying-property-spain-foreigner">complete buying guide</a>.</p>`,
        },
        {
          heading: 'The contrato de arras — where deals go wrong',
          html: `
  <p>Before completion you'll sign the <em>contrato de arras</em> — a private deposit contract between you and the seller, typically at 10% of the purchase price. It is legally binding and not standardised: if you pull out, you lose the deposit; if the seller pulls out, they owe you double. Terms, conditions and exit clauses are all negotiable — which means they're all checkable, and the moment to check them is before you sign, not after. A property lawyer reviews the arras as a standard part of the instruction.</p>
  <div class="info-box">
    <p><strong>What independent due diligence covers:</strong> title and ownership at the Land Registry, outstanding charges and embargoes, unpaid IBI and community fees (both transfer to you with the property), planning status and building licences, and — on new builds — the developer's bank guarantee on your stage payments.</p>
  </div>`,
        },
        {
          heading: 'Non-EU buyers: the 100% tax question',
          html: `
  <p>Spain's proposed 100% tax on non-EU property buyers made headlines in 2025 — and is regularly misreported. What has actually passed into law, who could be affected and what UK buyers should do now is covered in our dedicated guide to the <a href="/blog/spain-non-eu-property-tax">non-EU property tax proposal</a>. Short version: don't restructure a purchase around a proposal that hasn't passed; do have a lawyer confirm the current position before you commit a deposit.</p>`,
        },
      ],
      when: {
        heading: 'Do you actually need a property lawyer in Spain?',
        html: `
  <p>Legally, no — Spain doesn't require buyers to use a lawyer, and that's exactly why so many foreign buyers get caught. Everyone else at the table (agent, developer, notary, seller's bank) is paid by the transaction going through, not by it going through safely.</p>
  <p>In practice a foreign buyer should never complete without independent representation. It matters most when:</p>
  <ul>
    <li><strong>Buying off-plan</strong> — your stage payments must be secured by a bank guarantee; unsecured payments to a developer that fails are usually gone.</li>
    <li><strong>Buying rural or older property</strong> — planning irregularities and unregistered extensions are common, and legalising them after purchase is your problem, at your cost.</li>
    <li><strong>Buying from a non-resident seller</strong> — the 3% retention (Modelo 211) is your legal obligation as the buyer; get it wrong and the tax office pursues you.</li>
    <li><strong>Selling</strong> — a lawyer handles the capital gains position, the 3% retention refund and the <a href="/blog/spanish-property-taxes-foreign-owners">Plusvalía</a> calculation.</li>
  </ul>
  <p>At roughly 1% of the purchase price, the lawyer is one of the smallest line items in the 10–14% costs stack — and the only one working for you. More detail: <a href="/blog/property-lawyer-spain">do I need a lawyer to buy property in Spain?</a></p>`,
      },
      cta: {
        strong: 'Buying or selling in Spain?',
        text: 'Send one enquiry and we’ll route it to a verified English-speaking property lawyer covering your region. Free, no obligation.',
        btn: 'Send an enquiry',
      },
      faq: [
        {
          q: 'How much does a property lawyer cost in Spain?',
          a: 'Around 1% of the purchase price, with typical minimum fees of €1,000–2,000 on lower-value properties. On a €300,000 purchase expect €2,500–3,500 all in for legal fees, covering due diligence through to completion.',
        },
        {
          q: 'Doesn’t the notary check the property for me?',
          a: 'No. The notario is a neutral public official who verifies identities and witnesses the deed — they do not check the property’s legal status on your behalf. Only a lawyer you hire independently does that.',
        },
        {
          q: 'Can these lawyers help if I’m buying from abroad?',
          a: 'Yes. Buying remotely via power of attorney is routine — your lawyer attends the notary on your behalf. Several listed firms handle the whole purchase for buyers who are not yet in Spain.',
        },
        {
          q: 'What taxes will I pay when buying?',
          a: 'On a resale: ITP at 6–10% depending on the region. On a new build: 10% IVA plus roughly 1.5% stamp duty. Budget 10–14% on top of the purchase price for all taxes, fees and legal costs combined.',
        },
      ],
    },

    tax: {
      slug: 'tax-lawyers-spain',
      specialty: 'tax',
      label: 'Tax & Fiscal',
      shortLabel: 'Tax',
      title: 'Tax & Fiscal Lawyers in Spain for Expats | ExpatLawyerSpain',
      description:
        'Compare verified English-speaking tax lawyers in Spain. Beckham Law, non-resident tax, Modelo 210, capital gains and wealth tax — one free enquiry.',
      h1: 'Tax & Fiscal Lawyers in Spain',
      lead: 'Verified English-speaking tax specialists for residency tax planning, non-resident filings, property taxes and cross-border income.',
      blogCategories: ['tax'],
      intro: `
  <p>Spanish tax runs on deadlines that don't announce themselves: the Beckham Law election expires six months after you register as a resident, the non-resident property return is due every 31 December, and inheritance tax falls due six months after a death. Most expat tax problems in Spain aren't clever-planning failures — they're missed windows. The firms below are verified English-speaking tax and fiscal specialists listed on ELS.</p>`,
      sections: [
        {
          heading: 'The Beckham Law: the six-month window',
          html: `
  <p>The <a href="/blog/beckham-law-spain">Beckham Law</a> caps tax on your Spanish-source income at a flat 24% (up to €600,000 a year) for up to six years, instead of progressive rates that reach 47%. You must apply within six months of registering as a Spanish resident — miss the window and it's gone, with no retroactive application. On a €70,000 salary the difference between the flat rate and the standard scale is worth €10,000–15,000 a year.</p>
  <p>Qualifying is not automatic: you need a Spanish employment contract or a qualifying remote-work arrangement (Digital Nomad Visa holders are eligible), and you must not have been Spanish tax resident in the previous five years. The application, the payroll setup and the annual filings are exactly the kind of paperwork that is easy to get wrong once and impossible to fix later.</p>`,
        },
        {
          heading: 'Owning Spanish property from abroad: the taxes nobody tells you about',
          html: `
  <p>Non-resident owners owe Spanish tax every year even if the property earns nothing:</p>
  <table class="tax-table">
    <thead>
      <tr><th scope="col">Tax</th><th scope="col">Rate</th><th scope="col">When</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">Imputed income tax (IRNR, Modelo 210)</th><td>19% (EU/EEA) or 24% (UK, US and other non-EU) on 1.1–2% of the cadastral value</td><td>By 31 December each year — no bill is sent; you must file</td></tr>
      <tr><th scope="row">IBI (municipal property tax)</th><td>Typically €200–800/year for holiday homes</td><td>Annually; unpaid IBI transfers with the property</td></tr>
      <tr><th scope="row">Wealth tax (Modelo 714)</th><td>Regional; state allowance €700,000 per person</td><td>Annually, where assets exceed the allowance</td></tr>
    </tbody>
  </table>
  <p>When you sell, non-residents pay 19% capital gains tax on the net gain, and the buyer withholds 3% of the price (Modelo 211) against it — reclaiming any excess is your filing, on your deadline. Full detail in the <a href="/blog/capital-gains-tax-spain">capital gains guide</a> and the <a href="/blog/spanish-property-taxes-foreign-owners">property-tax overview</a>.</p>`,
        },
        {
          heading: 'Becoming tax resident: what changes',
          html: `
  <p>Spend more than 183 days a year in Spain and you're tax resident — worldwide income, progressive rates, and the savings scale on investment income running 19% to 28%. UK and US double-tax treaties prevent most double payment but not double filing: US citizens keep filing IRS returns (and FATCA forms like Form 8938) regardless of residency. The year you move is the year that decides most of your tax position, and it's decided by dates, not intentions — the point of taking advice before the move rather than after.</p>`,
        },
      ],
      when: {
        heading: 'When do you actually need a tax lawyer in Spain?',
        html: `
  <p>For a single rental property and a straightforward annual Modelo 210, a <em>gestor</em> or accountant handles it cheaply and well. A tax lawyer — as opposed to a bookkeeper — matters when the stakes or the structure justify it:</p>
  <ul>
    <li><strong>The year you become resident.</strong> Sequencing the move, the Beckham election and the sale of assets before or after the residency line routinely saves five figures.</li>
    <li><strong>Cross-border income.</strong> Pensions, US retirement accounts, UK rental income, stock options — treaty positions need to be claimed correctly, not assumed.</li>
    <li><strong>A dispute with Hacienda.</strong> Once the tax office opens an inspection or issues a surcharge (late Modelo 210 penalties run up to 150% of the unpaid tax), you need representation, not software.</li>
    <li><strong>Selling property as a non-resident.</strong> The 3% retention, the CGT calculation with documented improvement costs, and the home-country top-up (most UK higher-rate taxpayers owe HMRC a small balance) belong in one pair of hands.</li>
  </ul>`,
      },
      cta: {
        strong: 'Tax question with a deadline attached?',
        text: 'Send one enquiry and we’ll route it to a verified English-speaking tax specialist. Free, no obligation.',
        btn: 'Send an enquiry',
      },
      faq: [
        {
          q: 'What is the deadline for the Beckham Law?',
          a: 'Six months from registering as a Spanish resident. There is no retroactive application — if the window closes, the regime is gone for good. It caps tax on Spanish-source income at a flat 24% (up to €600,000/year) for up to six years.',
        },
        {
          q: 'I own a Spanish holiday home but live in the UK. Do I owe Spanish tax?',
          a: 'Yes — every year. Non-residents pay imputed income tax on Modelo 210 (24% for UK owners on 1.1–2% of the cadastral value) by 31 December, plus municipal IBI. No bill is sent; the obligation to file is yours.',
        },
        {
          q: 'Do I need a tax lawyer or a gestor?',
          a: 'For routine annual filings, a gestor or accountant is enough. For the year you move to Spain, cross-border income, a property sale or anything involving an inspection by the tax office, a tax lawyer earns the difference in fees many times over.',
        },
        {
          q: 'How are capital gains taxed when I sell Spanish property?',
          a: 'Non-residents pay a flat 19% on the net gain, and the buyer must withhold 3% of the price (Modelo 211) on account. Residents pay the savings scale, 19% to 28%. Documented purchase costs and improvement works with invoices reduce the gain.',
        },
      ],
    },

    wills: {
      slug: 'wills-inheritance-lawyers-spain',
      specialty: 'wills',
      label: 'Wills & Inheritance',
      shortLabel: 'Wills & Inheritance',
      title: 'Wills & Inheritance Lawyers in Spain | ExpatLawyerSpain',
      description:
        'Compare verified English-speaking inheritance lawyers in Spain. Spanish wills, forced heirship, regional inheritance tax and probate — one free enquiry.',
      h1: 'Wills & Inheritance Lawyers in Spain',
      lead: 'Verified English-speaking specialists for Spanish wills, cross-border estates, forced heirship and inheritance tax planning.',
      blogCategories: ['wills'],
      // The wills category has one post; top the related-guides cards up with:
      fallbackGuides: ['getting-married-in-spain', 'spanish-property-taxes-foreign-owners'],
      intro: `
  <p>Spanish succession law is nothing like UK or US law: children are entitled to two-thirds of your estate by default (<em>la legítima</em>), an unmarried partner inherits nothing under intestacy, and the inheritance tax bill on the same asset can differ by a factor of ten between regions. Almost all of that is plannable — with a Spanish will and, where it's warranted, a specialist lawyer. The firms below are verified English-speaking wills and inheritance specialists listed on ELS.</p>`,
      sections: [
        {
          heading: 'Inheritance tax: the region decides the bill',
          html: `
  <p>Spanish inheritance tax is paid by the beneficiary, and the applicable rules follow where the assets are — not where the deceased lived. The regional spread for spouses and children:</p>
  <table class="region-table">
    <thead>
      <tr><th scope="col">Region</th><th scope="col">Close-family treatment</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">Madrid, Andalusia, Murcia</th><td>99% reduction — effectively near zero</td></tr>
      <tr><th scope="row">Galicia</th><td>99% reduction up to €1M</td></tr>
      <tr><th scope="row">Valencia</th><td>75% reduction</td></tr>
      <tr><th scope="row">Balearic Islands, Catalonia</th><td>Partial reductions — moderate to significant tax</td></tr>
      <tr><th scope="row">Basque Country</th><td>€400,000 exemption per heir</td></tr>
    </tbody>
  </table>
  <div class="callout">
    <strong>The six-month deadline</strong>
    <p>Inheritance tax is due six months from the date of death. An extension exists but must be requested before the original deadline expires. Missing it triggers surcharges and interest — and for families handling a Spanish estate from abroad, six months disappears fast once translations, apostilles and notary appointments are in the chain.</p>
  </div>`,
        },
        {
          heading: 'A Spanish will: the cheapest insurance an expat can buy',
          html: `
  <p>A Spanish will covers your Spanish assets and sits alongside your UK or US will — it doesn't replace it. Made before a <em>notario</em>, it costs €150–300 in notary fees for a straightforward case (€200–500 where a lawyer drafts it), and it's registered automatically with the Central Registry of Wills. Compare that with what your heirs face without one: Spanish intestacy rules deciding who inherits, plus a recognition process for any foreign will — sworn translation, apostille, notary validation — that routinely adds months and costs many times the price of the will.</p>
  <p>The will is also where the EU succession regulation (Brussels IV) election is made — choosing which country's law governs your estate instead of Spain's default rules. The election only works if the clause is drafted precisely, which is exactly the part a specialist does. Background: <a href="/blog/inheritance-law-spain-expats">Spanish inheritance law for expats</a>.</p>`,
        },
        {
          heading: 'Forced heirship: what you can and can’t decide',
          html: `
  <p>Under Spanish default rules, two-thirds of your estate is reserved for your children (<em>la legítima</em>) regardless of what your will says, and an unmarried partner receives nothing under intestacy however long you lived together. If your intended distribution conflicts with those shares — second marriages, stepchildren, a partner you're not married to — the will has to be structured around the constraints, and that's specialist drafting, not a notary template. Your marital property regime (fixed when you married, and different by region — see <a href="/blog/getting-married-in-spain">getting married in Spain</a>) determines what's yours to leave in the first place.</p>`,
        },
      ],
      when: {
        heading: 'When do you actually need an inheritance lawyer?',
        html: `
  <p>For one or two Spanish assets going to straightforward beneficiaries, a notary appointment is enough — the notario is a qualified legal professional and drafts wills as standard work.</p>
  <p>A specialist inheritance lawyer is worth the fee in four situations:</p>
  <ul>
    <li><strong>You want your national law, not Spain's, to govern your estate.</strong> The Brussels IV election has to be drafted precisely to be enforceable.</li>
    <li><strong>Assets in more than one country.</strong> Wills drafted in isolation routinely revoke each other by accident; they need coordinating.</li>
    <li><strong>Your wishes conflict with forced heirship.</strong> Working within <em>la legítima</em> is a structuring exercise, not a wording tweak.</li>
    <li><strong>You're the one inheriting.</strong> Probate on a Spanish estate — Certificate of Last Wills, deed of acceptance (<em>escritura de aceptación de herencia</em>), the tax filing inside six months — runs from roughly a thousand euros for a simple estate, and a lawyer handling it remotely spares you doing Spanish bureaucracy in person from another country.</li>
  </ul>`,
      },
      cta: {
        strong: 'Planning an estate — or handling one?',
        text: 'Send one enquiry and we’ll route it to a verified English-speaking inheritance specialist. Free, no obligation.',
        btn: 'Send an enquiry',
      },
      faq: [
        {
          q: 'How much does a Spanish will cost?',
          a: 'Notary fees for a straightforward Spanish will are €150–300. Where a lawyer drafts it — advisable for cross-border estates, Brussels IV elections or forced-heirship planning — expect €200–500. It is one of the lowest-cost legal documents an expat with Spanish assets can put in place.',
        },
        {
          q: 'Does my UK or US will cover my Spanish property?',
          a: 'It can be recognised in Spain, but the process — sworn translation, apostille, notary validation — adds months of delay and significant cost at exactly the wrong moment for your family. A Spanish will covering your Spanish assets avoids that entirely and sits alongside your home-country will.',
        },
        {
          q: 'How much inheritance tax will my children pay?',
          a: 'It depends almost entirely on the region where the assets are. Madrid, Andalusia and Murcia apply a 99% reduction for spouses and children — effectively near zero. Catalonia and the Balearics apply partial reductions with real tax. The bill is due within six months of the death.',
        },
        {
          q: 'My partner and I aren’t married. What happens to my Spanish flat?',
          a: 'Under Spanish intestacy rules an unmarried partner inherits nothing — the default order is children, then parents, then siblings, then a surviving spouse. If you want your partner to inherit, a Spanish will is the mechanism, structured around the forced-heirship shares if you have children.',
        },
      ],
    },
  },
};
