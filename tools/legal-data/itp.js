/*
 * tools/legal-data/itp.js - property purchase tax figures (ITP, IVA, IGIC, AJD)
 * ---------------------------------------------------------------------------
 * The figures behind the ITP calculator (/itp-calculator-spain):
 *   - itp.<region>.resale          ITP on resale residential property
 *   - itp.national.new-build-iva   IVA on new-build housing (mainland + Balears)
 *   - itp.canarias.new-build-igic  IGIC on new-build housing (Canary Islands)
 *   - itp.<region>.new-build-ajd   AJD stamp duty paid on top of IVA/IGIC
 *   - itp.<region>.*               any regional special rate kept for the
 *                                  record even if only surfaced as a caveat
 *                                  (e.g. Catalunya large holders)
 *
 * FIELDS (all enforced by tools/validate-legal-data.js):
 *   id            unique dot-path, must start with "itp."
 *   label         human label, British English
 *   region        a key from regions in index.js
 *   unit          'percent' | 'eur' | 'eur-per-month'
 *   value XOR bands
 *                 value: one flat number.
 *                 bands: [{ upTo, rate }] thresholds strictly ascending,
 *                 last band upTo: null. bandType 'marginal' (each rate
 *                 taxes its own slice) or 'whole' (one rate, picked by the
 *                 total, applied to the whole price - a cliff).
 *   effectiveFrom ISO date the figure took effect
 *   source        { url, title, accessed } - url must be https. A figure
 *                 can only be VERIFIED when the url is an official
 *                 tax-authority page (see officialSourceHosts in index.js).
 *   reviewBy      ISO date this figure must be re-checked by (the
 *                 freshness guard reads these)
 *   note          internal maintenance context - what changed, edge cases
 *   userNote      OPTIONAL user-facing caveat, shown with results. Must
 *                 pass els-brand-voice.md. Only where the shown general
 *                 rate could understate the tax or not apply at all -
 *                 never a catch-all. (Plain discounts live in the FAQ.)
 *   status        'draft' until Olivia has checked the figure against the
 *                 official source, then 'verified'. The production build
 *                 only ships verified figures.
 *
 * VERIFICATION 2026-07-05: the 7 priority regions (Andalucía, Valencia,
 * Catalunya, Madrid, Balears, Canarias, Murcia) plus national IVA and
 * Canarias IGIC were reconciled to Olivia's official-source rate sheet,
 * `aios/context/els/els-itp-rates-verification-2026-07.md`, and set
 * verified. Key corrections from that pass: Valencia is WHOLE (cliff at
 * EUR 1M), not marginal; Canarias IGIC is 7% (not 6.5%) and its new-build
 * AJD is 1.00% (not 0.75%); Balears scale runs from 2023-01-01.
 *
 * CEUTA / MELILLA (not modelled, deliberately): IPSI replaces IVA there.
 * Ceuta's ~4% new-build IPSI is indicative only (AEAT framework page, the
 * ordinance article is unconfirmed); Melilla runs a 0.5-10% IPSI band
 * scale with no single new-build figure pinned. Per the rate sheet, do
 * not publish either without checking the local IPSI ordinance. Neither
 * city has a resale figure either, so neither renders anywhere. When real
 * figures land, add them here and give the engine an IPSI branch (see
 * NON_IVA_REGIONS in js/calc-engine.js).
 * ---------------------------------------------------------------------------
 */

'use strict';

module.exports = {
  domain: 'itp',
  domainLabel: 'Property purchase taxes: ITP (resale), IVA/IGIC and AJD (new build)',
  figures: [
    // --- Catalunya ------------------------------------------------------------
    {
      id: 'itp.catalunya.resale',
      label: 'ITP on resale residential property, Catalunya',
      region: 'catalunya',
      unit: 'percent',
      bands: [
        { upTo: 600000, rate: 10 },
        { upTo: 900000, rate: 11 },
        { upTo: 1500000, rate: 12 },
        { upTo: null, rate: 13 },
      ],
      bandType: 'marginal',
      effectiveFrom: '2025-06-27',
      source: {
        url: 'https://www.boe.es/ccaa/dogc/2025/9379/f00001-00028.pdf',
        title: 'Decret llei 5/2025, DOGC núm. 9379 (26/03/2025)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Marginal four-band scale from the 2025 reform (Decret llei 5/2025, in force 2025-06-27 after a 3-month deferral; replaced the old 10%/11% two-band scale). Confirmed MARGINAL: the law builds the quota tranche by tranche (tipus mitjà). ATC entry-into-force notice: atc.gencat.cat/ca/agencia/noticies/detall-noticia/20250627-mesures-fiscals-2025-itpajd-isd. The separate 20% large-holder rate is itp.catalunya.resale-large-holder. Verified against els-itp-rates-verification-2026-07.md.',
      userNote:
        'Catalunya charges a separate 20% rate when the buyer is a large holder (a gran tenidor, roughly ten or more residential properties) or buys a whole building. If that is you, this result does not apply.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.resale-large-holder',
      label: 'ITP for large holders and whole-building purchases, Catalunya',
      region: 'catalunya',
      unit: 'percent',
      value: 20,
      effectiveFrom: '2025-06-27',
      source: {
        url: 'https://www.boe.es/ccaa/dogc/2025/9379/f00001-00028.pdf',
        title: 'Decret llei 5/2025, DOGC núm. 9379 (26/03/2025)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Not calculated by the v1 tool - surfaced as a caveat on Catalunya resale results via userNote on itp.catalunya.resale. The 20% gran tenidor / whole-building rate was added by the same Decret llei 5/2025 the rate sheet confirms; verified on that basis.',
      status: 'verified',
    },
    {
      id: 'itp.catalunya.new-build-ajd',
      label: 'AJD on new-build purchases, Catalunya',
      region: 'catalunya',
      unit: 'percent',
      value: 1.5,
      effectiveFrom: '2025-06-27',
      source: {
        url: 'https://www.boe.es/ccaa/dogc/2025/9379/f00001-00028.pdf',
        title: 'Decret llei 5/2025, DOGC núm. 9379 (26/03/2025)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'General AJD 1.5%, unchanged by the 2025 reform (the reform only raised the waived-IVA-exemption case to 3.5% and added an under-35 bonificació, neither modelled). New figure added in the 2026-07-05 verification pass; Catalunya new-build previously showed "AJD not yet verified".',
      status: 'verified',
    },

    // --- Madrid ------------------------------------------------------------------
    {
      id: 'itp.madrid.resale',
      label: 'ITP on resale residential property, Madrid',
      region: 'madrid',
      unit: 'percent',
      value: 6,
      effectiveFrom: '2026-04-23',
      source: {
        url: 'https://www.comunidad.madrid/atencion-contribuyente/transmisiones-patrimoniales-onerosas',
        title: 'Comunidad de Madrid: Transmisiones Patrimoniales Onerosas',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Flat 6%, long-standing. effectiveFrom is NOT a statutory commencement date: the reforming statute is unconfirmed (rate sheet flags search chatter citing Ley 5/2024 / Ley 2/2025, unverified), so effectiveFrom carries the official page\'s own last-updated date (2026-04-23), i.e. "confirmed in force as of". The 6% itself is confirmed current on that page. A 10% deduction on the quota applies to a habitual residence priced at EUR 250,000 or less (effective ~5.4%) - not modelled, covered by the reduced-rates FAQ.',
      status: 'verified',
    },
    {
      id: 'itp.madrid.new-build-ajd',
      label: 'AJD on new-build purchases, Madrid',
      region: 'madrid',
      unit: 'percent',
      value: 0.75,
      effectiveFrom: '2026-04-23',
      source: {
        url: 'https://www.comunidad.madrid/atencion-contribuyente/actos-juridicos-documentados',
        title: 'Comunidad de Madrid: Actos Jurídicos Documentados',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'General 0.75% for new-build homes above EUR 180,000. Reduced scale for cheaper homes (0.4% up to 120k, 0.5% 120-180k) not modelled - overstates only, covered by the reduced-rates FAQ. effectiveFrom = official page last-updated date, same reasoning as itp.madrid.resale.',
      status: 'verified',
    },

    // --- National IVA (mainland + Balears) ------------------------------------------
    {
      id: 'itp.national.new-build-iva',
      label: 'IVA on new-build residential property (mainland and Balearic Islands)',
      region: 'national',
      unit: 'percent',
      value: 10,
      effectiveFrom: '2012-09-01',
      source: {
        url: 'https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-inmobiliarias/compro-vivienda-tengo-que-pagar-itp.html',
        title: 'AEAT: Compro una vivienda, ¿IVA o ITP?',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Reduced IVA 10% on new dwellings, Ley 37/1992 art. 91.Uno.1.7 (4% only for VPO régimen especial / promoción pública, not modelled). Applies on the mainland and in the Balearic Islands, NOT in the Canary Islands (IGIC, itp.canarias.new-build-igic) or Ceuta/Melilla (IPSI, not yet modelled - see header).',
      status: 'verified',
    },

    // --- Andalucía ----------------------------------------------------------------------
    {
      id: 'itp.andalucia.resale',
      label: 'ITP on resale residential property, Andalucía',
      region: 'andalucia',
      unit: 'percent',
      value: 7,
      effectiveFrom: '2021-04-28',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/economiahaciendayfondoseuropeos/areas/tributos-juego/tributos/paginas/tipositpajd.html',
        title: 'Junta de Andalucía: Tipos de gravamen ITPAJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Flat 7% since 2021-04-28 (Decreto-ley 7/2021), made permanent by Ley 5/2021 de 20 de octubre; replaced the former banded scale. No 2024-25 reform. Reduced rates (6% habitual residence <= EUR 150,000; 3.5% under-35s and certain groups, same cap) not modelled, covered by the reduced-rates FAQ. Verified against els-itp-rates-verification-2026-07.md.',
      status: 'verified',
    },
    {
      id: 'itp.andalucia.new-build-ajd',
      label: 'AJD on new-build purchases, Andalucía',
      region: 'andalucia',
      unit: 'percent',
      value: 1.2,
      effectiveFrom: '2021-04-28',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/economiahaciendayfondoseuropeos/areas/tributos-juego/tributos/paginas/tipositpajd.html',
        title: 'Junta de Andalucía: Tipos de gravamen ITPAJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note: 'General AJD 1.2% since 2021-04-28. Verified against els-itp-rates-verification-2026-07.md.',
      status: 'verified',
    },

    // --- Comunidad Valenciana -----------------------------------------------------------
    {
      id: 'itp.comunidad-valenciana.resale',
      label: 'ITP on resale residential property, Valencia (Comunitat Valenciana)',
      region: 'comunidad-valenciana',
      unit: 'percent',
      bands: [
        { upTo: 1000000, rate: 9 },
        { upTo: null, rate: 11 },
      ],
      bandType: 'whole',
      effectiveFrom: '2026-06-01',
      source: {
        url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-11959',
        title: 'Ley 5/2025, de 30 de mayo (Comunitat Valenciana), BOE-A-2025-11959',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'WHOLE, not marginal (corrected 2026-07-05; earlier draft assumed marginal): 9% up to EUR 1,000,000, and once the price exceeds EUR 1M the 11% applies to the ENTIRE price - a cliff, not a top tranche. Sanity checks: 1,000,000 -> 90,000; 1,000,001 -> 110,000.11. General rate cut 10% -> 9% by Ley 5/2025 for purchases from 2026-06-01. STALE OFFICIAL PAGE: the live ATV Modelo 600 tariff table (atv.gva.es/es/itpajd) still displayed 10% / AJD 1.5% on 2026-07-05; the statute governs. Verified against els-itp-rates-verification-2026-07.md.',
      userNote:
        'Valencia cut this rate from 10% to 9% for purchases from 1 June 2026 (Ley 5/2025). The regional tax agency\'s tariff page still showed the old 10% when we checked on 5 July 2026, but the law governs. Above one million euros the 11% rate applies to the whole price, not just the part above the threshold.',
      status: 'verified',
    },
    {
      id: 'itp.comunidad-valenciana.new-build-ajd',
      label: 'AJD on new-build purchases, Valencia (Comunitat Valenciana)',
      region: 'comunidad-valenciana',
      unit: 'percent',
      value: 1.4,
      effectiveFrom: '2026-06-01',
      source: {
        url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-11959',
        title: 'Ley 5/2025, de 30 de mayo (Comunitat Valenciana), BOE-A-2025-11959',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'General AJD cut 1.5% -> 1.4% by the same Ley 5/2025, from 2026-06-01. The ATV page still showed 1.5% on 2026-07-05; the statute governs. Verified against els-itp-rates-verification-2026-07.md.',
      userNote:
        'The same 2026 law cut Valencia\'s AJD from 1.5% to 1.4% for deeds from 1 June 2026. The tax agency\'s page still showed 1.5% when we checked on 5 July 2026; the law governs.',
      status: 'verified',
    },

    // --- Illes Balears ---------------------------------------------------------------------
    {
      id: 'itp.baleares.resale',
      label: 'ITP on resale residential property, Balearic Islands',
      region: 'baleares',
      unit: 'percent',
      bands: [
        { upTo: 400000, rate: 8 },
        { upTo: 600000, rate: 9 },
        { upTo: 1000000, rate: 10 },
        { upTo: 2000000, rate: 12 },
        { upTo: null, rate: 13 },
      ],
      bandType: 'marginal',
      effectiveFrom: '2023-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=16198&lang=es',
        title: 'ATIB: Tipos de gravamen ITPAJD (TPO inmuebles)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Marginal five-band scale in force since 2023-01-01 (the pre-2023 scale topped out at 11.5%; the earlier draft\'s 2025-01-01 placeholder was wrong). Confirmed MARGINAL: ATIB tariff builds the quota tranche by tranche (tipo medio). 2024 added first-home buyer reliefs (Ley 12/2023), general scale unchanged. Verified against els-itp-rates-verification-2026-07.md.',
      status: 'verified',
    },
    {
      id: 'itp.baleares.new-build-ajd',
      label: 'AJD on new-build purchases, Balearic Islands',
      region: 'baleares',
      unit: 'percent',
      value: 1.5,
      effectiveFrom: '2023-01-01',
      source: {
        url: 'https://www.atib.es/TA/contenido.aspx?Id=9854&lang=es',
        title: 'ATIB: ITPAJD (sistema tributario)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'General AJD 1.5%. A 2% rate applies when the value is EUR 1,000,000 or more (surfaced as a userNote because the general figure would UNDERSTATE tax there); 1.2% first habitual home <= 270,151.20 and 2.5% waived-exemption cases not modelled. Verified against els-itp-rates-verification-2026-07.md.',
      userNote:
        'A new build priced at one million euros or more pays AJD at 2% in the Balearic Islands, not the general 1.5% shown here.',
      status: 'verified',
    },

    // --- Canarias --------------------------------------------------------------------------
    {
      id: 'itp.canarias.resale',
      label: 'ITP on resale residential property, Canary Islands',
      region: 'canarias',
      unit: 'percent',
      value: 6.5,
      effectiveFrom: '2012-07-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Agencia Tributaria Canaria: Guía ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Flat 6.5% since 2012-07-01 (Ley 4/2012); no 2024-25 change. New builds pay IGIC (itp.canarias.new-build-igic) + AJD instead. Verified against els-itp-rates-verification-2026-07.md.',
      status: 'verified',
    },
    {
      id: 'itp.canarias.new-build-igic',
      label: 'IGIC on new-build residential property, Canary Islands',
      region: 'canarias',
      unit: 'percent',
      value: 7,
      effectiveFrom: '2012-07-01',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-9282',
        title: 'Ley 4/2012 (Canarias), BOE, arts. 51/58',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'IGIC replaces IVA in the Canary Islands. GENERAL rate is 7% (corrected 2026-07-05; the earlier 6.5% draft conflated it with the ITP rate). Reduced rates: 5% habitual residence delivered by the developer, 3% under-35/large family/disability >= 65%, 0% VPO first home - the 5% is surfaced as a userNote because most owner-occupier buyers qualify. Used by the calculator\'s Canarias new-build branch since the 2026-07-05 pass. Verified against els-itp-rates-verification-2026-07.md.',
      userNote:
        'Buying the home as your habitual residence straight from the developer usually qualifies for the reduced 5% IGIC rate instead of the general 7% shown here. A lawyer or gestor confirms eligibility before you complete.',
      status: 'verified',
    },
    {
      id: 'itp.canarias.new-build-ajd',
      label: 'AJD on new-build purchases, Canary Islands',
      region: 'canarias',
      unit: 'percent',
      value: 1,
      effectiveFrom: '2012-07-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/estatico/asistencia_contribuyente/guias/pdf/guia_completa_itp_y_ajd.pdf',
        title: 'Agencia Tributaria Canaria: Guía ITP y AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'A new-build PURCHASE deed (operation subject to IGIC) falls in the 1.00% band (corrected 2026-07-05 from the 0.75% draft; 0.75% is the general immovable/obra-nueva band, not the purchase deed). Verified against els-itp-rates-verification-2026-07.md.',
      status: 'verified',
    },

    // --- Región de Murcia --------------------------------------------------------------------
    {
      id: 'itp.murcia.resale',
      label: 'ITP on resale residential property, Murcia',
      region: 'murcia',
      unit: 'percent',
      value: 7.75,
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://www.borm.es/services/anuncio/ano/2025/numero/3684/pdf?id=837745',
        title: 'Ley 3/2025 (Presupuestos CARM 2025), BORM 24/07/2025',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'Flat 7.75% from 2025-07-25, cut from 8% by Ley 3/2025 (BORM anuncio 3684). ATRM news confirmation: agenciatributaria.carm.es novedades page (29/07/2025). WARNING: the ATRM FAQ page still shows the old 8%/2% - never cite the FAQ for the headline rate. Verified against els-itp-rates-verification-2026-07.md.',
      status: 'verified',
    },
    {
      id: 'itp.murcia.new-build-ajd',
      label: 'AJD on new-build purchases, Murcia',
      region: 'murcia',
      unit: 'percent',
      value: 1.5,
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://www.borm.es/services/anuncio/ano/2025/numero/3684/pdf?id=837745',
        title: 'Ley 3/2025 (Presupuestos CARM 2025), BORM 24/07/2025',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-07-05',
      note:
        'General AJD cut 2% -> 1.5% from 2025-07-25 by the same Ley 3/2025. Verified against els-itp-rates-verification-2026-07.md.',
      status: 'verified',
    },
  ],
};
