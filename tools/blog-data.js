/*
 * blog-data.js — THE SINGLE SOURCE OF TRUTH for every blog listing page.
 * ---------------------------------------------------------------------------
 * This file is the ONLY thing you edit to change what appears on the blog
 * index (/blog/) and the category pages (/blog/property/, /blog/tax/, ...).
 *
 * After editing this file, run:   node tools/build-blog-listings.js
 * That regenerates every listing page. You never hand-edit a category page.
 *
 * See tools/FABLE-NOTES.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

module.exports = {
  // Bump this when the CSS cache-busting version changes elsewhere on the site.
  cssVersion: 'redesign-20260626-16',

  // The pill/filter nav shown at the top of every listing page.
  // `key` links to a page below ('all' = the main /blog/ index).
  // Order here = order the pills appear in. Labels are printed verbatim.
  nav: [
    { key: 'all',             label: 'All' },
    { key: 'property',        label: 'Property' },
    { key: 'immigration',     label: 'Immigration' },
    { key: 'tax',             label: 'Tax' },
    { key: 'admin',           label: 'Admin' },
    { key: 'moving-to-spain', label: 'Moving to Spain' },
    { key: 'wills',           label: 'Wills & Inheritance' },
    { key: 'family',          label: 'Family Law' },
  ],

  // One entry per listing PAGE.
  //   'all'  -> writes  blog/index.html
  //   others -> writes  blog/<key>/index.html
  // `badge` is the label on the big featured card at the top of the page.
  pages: {
    all: {
      dir: '',
      badge: 'Featured guide',
      title: 'Legal Guides for Expats in Spain | ExpatLawyerSpain',
      description: 'Free legal guides for expats in Spain. Property law, immigration, NIE numbers, Golden Visa, inheritance and more - written in plain English.',
      h1: 'Legal Guides for Expats in Spain',
      hero: 'Plain-English guides to the legal topics that matter most to expats living in or moving to Spain.',
    },
    property: {
      dir: 'property',
      badge: 'Most read guide',
      title: 'Property Law Guides for Expats in Spain | ExpatLawyerSpain',
      description: 'Guides to buying property in Spain, Spanish property taxes, conveyancing, NIE numbers and legal checks for foreign buyers. Learn what to check before you sign, pay a deposit or complete a purchase.',
      h1: 'Property Law Guides for Expats in Spain',
      hero: 'Guides to buying property in Spain, Spanish property taxes, conveyancing, NIE numbers and legal checks for foreign buyers. Learn what to check before you sign, pay a deposit or complete a purchase.',
    },
    immigration: {
      dir: 'immigration',
      badge: 'Most read guide',
      title: 'Immigration Guides for Expats in Spain | ExpatLawyerSpain',
      description: 'Visa and residency guides for expats in Spain, including Golden Visa alternatives, the Digital Nomad Visa and the Non-Lucrative Visa.',
      h1: 'Immigration Guides for Expats in Spain',
      hero: 'Visa and residency guides for expats in Spain, including Golden Visa alternatives, the Digital Nomad Visa and the Non-Lucrative Visa.',
    },
    tax: {
      dir: 'tax',
      badge: 'Most read guide',
      title: 'Spanish Tax Guides for Expats | ExpatLawyerSpain',
      description: 'Spanish property taxes, capital gains tax, non-resident tax obligations and the Beckham Law explained in plain English. These guides help foreign owners and residents understand when to get professional tax advice.',
      h1: 'Spanish Tax Guides for Expats',
      hero: 'Spanish property taxes, capital gains tax, non-resident tax obligations and the Beckham Law explained in plain English. These guides help foreign owners and residents understand when to get professional tax advice.',
    },
    admin: {
      dir: 'admin',
      badge: 'Most read guide',
      title: 'Admin Guides for Expats in Spain | ExpatLawyerSpain',
      description: 'NIE numbers, TIE cards, bank accounts and the essential admin steps for expats in Spain. Start here for practical legal-administrative tasks before buying, relocating or hiring a lawyer.',
      h1: 'Admin Guides for Expats in Spain',
      hero: 'NIE numbers, TIE cards, bank accounts and the essential admin steps for expats in Spain. Start here for practical legal-administrative tasks before buying, relocating or hiring a lawyer.',
    },
    'moving-to-spain': {
      dir: 'moving-to-spain',
      badge: 'Most read guide',
      title: 'Moving to Spain Legal Guides | ExpatLawyerSpain',
      description: 'Legal checklists, visa guides and practical advice for people relocating to Spain from the UK, US and beyond. These guides cover the first legal steps expats usually need to understand.',
      h1: 'Moving to Spain Legal Guides',
      hero: 'Legal checklists, visa guides and practical advice for people relocating to Spain from the UK, US and beyond. These guides cover the first legal steps expats usually need to understand.',
    },
    wills: {
      dir: 'wills',
      badge: 'Most read guide',
      title: 'Wills and Inheritance Guides for Expats in Spain | ExpatLawyerSpain',
      description: 'Inheritance law, Spanish wills and estate planning for expats who own property or assets in Spain. Learn how regional rules, taxes and succession planning can affect your family.',
      h1: 'Wills and Inheritance Guides for Expats in Spain',
      hero: 'Inheritance law, Spanish wills and estate planning for expats who own property or assets in Spain. Learn how regional rules, taxes and succession planning can affect your family.',
    },
    family: {
      dir: 'family',
      badge: 'Most read guide',
      title: 'Family Law Guides for Expats in Spain | ExpatLawyerSpain',
      description: 'Family law guides for expats in Spain, including getting married as a foreigner, marital property regimes, prenuptial agreements and name changes.',
      h1: 'Family Law Guides for Expats in Spain',
      hero: 'Family law guides for expats in Spain, including getting married as a foreigner, marital property regimes, prenuptial agreements and name changes.',
    },
  },

  /*
   * Every blog post, in the order you want it to appear (top = shown first).
   * This order is used on ALL pages; each category page just filters this list.
   *
   * Fields:
   *   slug        - the post's URL, i.e. /blog/<slug>  (must match the .html file name)
   *   tag         - the little label on the card (e.g. "Property Law")
   *   title       - the card headline
   *   desc        - the card summary sentence
   *   categories  - which category pages this post appears on (array of page keys)
   *   featured    - which pages show this post as the big featured card at the top
   *   img / alt   - the featured-card image. ONLY needed on pages where it's featured.
   */
  posts: [
    {
      slug: 'retire-in-spain',
      tag: 'Immigration',
      title: 'Retire in Spain: Visas, Tax and Healthcare Explained (2026)',
      desc: 'The Non-Lucrative Visa, how pensions are taxed, healthcare options including the S1 form, the 90-day rule and property for UK and US retirees.',
      categories: ['immigration'],
      featured: ['all', 'immigration'],
      img: '/images/blog/retire-in-spain-couple-dock.webp',
      alt: 'Retired couple watching the sunset from a wooden jetty in Spain',
    },
    {
      slug: 'getting-married-in-spain',
      tag: 'Family Law',
      title: 'Getting Married in Spain as a Foreigner: The Legal Guide (2026)',
      desc: 'Civil vs religious ceremonies, the documents foreigners need, registering a foreign marriage, prenuptial agreements and name changes.',
      categories: ['family'],
      featured: ['family'],
      img: '/images/blog/getting-married-bride-bouquet.webp',
      alt: 'Bride walking through a vineyard on her wedding day in Spain',
    },
    {
      slug: 'beckham-law-spain',
      tag: 'Tax and Immigration',
      title: 'Beckham Law Spain 2026: Tax Benefits for New Residents',
      desc: 'Flat 24% tax for qualifying new residents, who qualifies, income conditions, the six-month deadline and the Digital Nomad Visa connection.',
      categories: ['tax'],
      featured: ['tax'],
      img: '/images/blog/beckham-law-spanish-city-aerial.webp',
      alt: 'Aerial view of a Spanish city, relevant to Beckham Law Spain relocation planning',
    },
    {
      slug: 'capital-gains-tax-spain',
      tag: 'Tax and Property Law',
      title: 'Capital Gains Tax Spain for Non-Residents: Complete Guide (2026)',
      desc: "How Spain's 19% non-resident CGT rate works, the 3% retention rule, deductible costs, Modelo 210 and double-tax issues for UK, US and Irish sellers.",
      categories: ['tax'],
      featured: [],
    },
    {
      slug: 'moving-to-spain-from-uk',
      tag: 'Moving to Spain',
      title: 'Moving to Spain from the UK: The Complete Legal Guide After Brexit (2026)',
      desc: 'Visas, the 90-day rule, NIE, TIE, healthcare, tax, property, banking and wills for British nationals planning a move to Spain.',
      categories: ['moving-to-spain'],
      featured: ['moving-to-spain'],
      img: '/images/blog/moving-to-spain-majorca-cove.jpg',
      alt: 'Rocky cove with turquoise water and pine-covered cliffs in Majorca, Spain',
    },
    {
      slug: 'spain-non-eu-property-tax',
      tag: 'Tax and Property Law',
      title: "Spain's 100% Property Tax for Non-EU Buyers: What You Need to Know",
      desc: "Spain's proposed 100% tax on non-EU property buyers has caused alarm. Here is what has actually passed into law, who could be affected, and what UK and other non-EU buyers should do now.",
      categories: ['property', 'tax'],
      featured: ['property'],
      img: '/images/blog/spain-non-eu-tax-marina.jpg',
      alt: 'Mediterranean marina with sailboats and coastal architecture, Spain',
    },
    {
      slug: 'digital-nomad-visa-spain',
      tag: 'Immigration',
      title: 'Digital Nomad Visa Spain: Requirements, Tax and How to Apply (2026)',
      desc: "Income thresholds, remote work rules, Beckham Law, tax issues and application steps for Spain's Digital Nomad Visa.",
      categories: ['immigration'],
      featured: [],
    },
    {
      slug: 'non-lucrative-visa-spain',
      tag: 'Immigration',
      title: 'Non-Lucrative Visa Spain: Requirements, Income and How to Apply (2026)',
      desc: "Passive income rules, health insurance, documentation and common mistakes for Spain's Non-Lucrative Visa.",
      categories: ['immigration'],
      featured: [],
    },
    {
      slug: 'golden-visa-spain-guide',
      tag: 'Residency',
      title: 'Golden Visa Spain: Abolished. What Now? (2026)',
      desc: "Spain's Golden Visa has ended. Compare the main alternative residency routes for remote workers, retirees and non-EU nationals.",
      categories: ['immigration'],
      featured: [],
    },
    {
      slug: 'spanish-legal-glossary',
      tag: 'Admin',
      title: 'Spanish Legal Glossary: 76 Key Terms Explained in English',
      desc: 'Plain-English definitions of Spanish legal terms expats encounter when buying property, applying for residency, paying tax or dealing with wills.',
      categories: ['admin'],
      featured: [],
    },
    {
      slug: 'english-speaking-lawyer-spain',
      tag: 'Admin',
      title: 'How to Find an English-Speaking Lawyer in Spain (2026)',
      desc: 'What to look for, what to pay, and how to find a trusted English-speaking lawyer in Spain by city and specialty.',
      categories: ['admin', 'moving-to-spain'],
      featured: ['admin'],
      img: '/images/blog/english-speaking-lawyer-llafranc.jpg',
      alt: 'Scenic aerial view of Llafranc coastline at sunset, Costa Brava, Spain',
    },
    {
      slug: 'spanish-property-taxes-foreign-owners',
      tag: 'Tax and Property Law',
      title: 'Spanish Property Taxes for Foreign Owners: The Complete 2026 Guide',
      desc: 'ITP, IBI, non-resident property tax, capital gains tax, Plusvalia and Wealth Tax explained in plain English for foreign owners.',
      categories: ['property', 'tax'],
      featured: [],
    },
    {
      slug: 'buying-property-spain-foreigner',
      tag: 'Property Law',
      title: 'Buying Property in Spain as a Foreigner: The Complete Legal Guide',
      desc: 'The full purchase process, costs, taxes, legal checks and why foreign buyers should use an English-speaking property lawyer.',
      categories: ['property'],
      featured: [],
    },
    {
      slug: 'conveyancing-spain',
      tag: 'Property Law',
      title: 'Conveyancing in Spain: What It Means and Who Does It',
      desc: "Spain doesn't have conveyancing in the UK sense. Here's what the notario does, what a property lawyer does, and why you need both.",
      categories: ['property'],
      featured: [],
    },
    {
      slug: 'property-lawyer-spain',
      tag: 'Property Law',
      title: 'Do I Need a Lawyer to Buy Property in Spain?',
      desc: "Not legally required - but here's why almost every expert says you should never buy without one.",
      categories: ['property'],
      featured: [],
    },
    {
      slug: 'nie-number-spain-lawyer',
      tag: 'Immigration',
      title: 'NIE Number Spain: What It Is and Do You Need a Lawyer?',
      desc: 'Everything expats need to know about the NIE - how to get one, how long it takes, and when a lawyer helps.',
      categories: ['property', 'admin'],
      featured: [],
    },
    {
      slug: 'inheritance-law-spain-expats',
      tag: 'Wills & Inheritance',
      title: 'Spanish Inheritance Law for Expats (2026)',
      desc: 'Forced heirship, Spanish wills, inheritance tax by region and what expats need to know before assets pass to heirs.',
      categories: ['wills'],
      featured: ['wills'],
      img: '/images/blog/inheritance-law-marbella-villa.jpg',
      alt: 'Mediterranean villa with pergola and pool, Marbella, Spain',
    },
  ],
};
