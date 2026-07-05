/*
 * tools/legal-data/itp.js - property purchase tax figures (ITP, IVA, AJD)
 * ---------------------------------------------------------------------------
 * The figures behind the ITP calculator (/itp-calculator-spain):
 *   - itp.<region>.resale         ITP on resale residential property
 *   - itp.national.new-build-iva  IVA on new-build housing (national)
 *   - itp.<region>.new-build-ajd  AJD stamp duty paid on top of IVA
 *   - itp.<region>.*              any regional special rate, kept for the
 *                                 record even if the calculator only surfaces
 *                                 it as a caveat (e.g. Catalunya large holders)
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
 *                 total, applied to the whole price).
 *   effectiveFrom ISO date the figure took effect
 *   source        { url, title, accessed } - url must be https. A figure
 *                 can only be VERIFIED when the url is an official
 *                 tax-authority page (see officialSourceHosts in index.js).
 *   reviewBy      ISO date this figure must be re-checked by (the
 *                 freshness guard reads these)
 *   note          internal maintenance context - what changed, edge cases
 *   userNote      OPTIONAL user-facing caveat, shown with results. Must
 *                 pass els-brand-voice.md. Only for things that genuinely
 *                 vary by case - never a catch-all.
 *   status        'draft' until Olivia has checked the figure against the
 *                 official source, then 'verified'. The production build
 *                 only ships verified figures.
 *
 * SEED DATA WARNING: every figure below started life as EXAMPLE data to
 * exercise the engine and tests. Whether a region's scale is marginal or
 * whole, and the exact bands, are per-region facts to confirm against the
 * official source before flipping to 'verified'.
 * ---------------------------------------------------------------------------
 */

'use strict';

module.exports = {
  domain: 'itp',
  domainLabel: 'Property purchase taxes: ITP (resale), IVA and AJD (new build)',
  figures: [
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
        url: 'https://atc.gencat.cat/ca/tributs/itpajd/',
        title: 'Agència Tributària de Catalunya: ITP i AJD, tipus de gravamen',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Tiered scale from the June 2025 reform. CONFIRM against the ATC page: the exact thresholds, that the scale is marginal (per tranche) not whole, and the effective date. The separate 20% rate for large holders and whole buildings is itp.catalunya.resale-large-holder.',
      userNote:
        'Catalunya charges a separate 20% rate when the buyer is a large holder (a gran tenidor, roughly ten or more residential properties) or buys a whole building. If that is you, this result does not apply.',
      status: 'draft',
    },
    {
      id: 'itp.catalunya.resale-large-holder',
      label: 'ITP for large holders and whole-building purchases, Catalunya',
      region: 'catalunya',
      unit: 'percent',
      value: 20,
      effectiveFrom: '2025-06-27',
      source: {
        url: 'https://atc.gencat.cat/ca/tributs/itpajd/',
        title: 'Agència Tributària de Catalunya: ITP i AJD, tipus de gravamen',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Not calculated by the v1 tool - surfaced as a caveat on Catalunya resale results via userNote on itp.catalunya.resale. Kept here so the figure itself is on the record with its source.',
      status: 'draft',
    },
    {
      id: 'itp.madrid.resale',
      label: 'ITP on resale residential property, Madrid',
      region: 'madrid',
      unit: 'percent',
      value: 6,
      effectiveFrom: '2014-01-01',
      source: {
        url: 'https://www.comunidad.madrid/servicios/vivienda/impuesto-transmisiones-patrimoniales',
        title: 'Comunidad de Madrid: Impuesto sobre Transmisiones Patrimoniales',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Flat 6% general rate. CONFIRM the exact source page URL on comunidad.madrid and check the current family/reduced rates before verifying.',
      status: 'draft',
    },
    {
      id: 'itp.national.new-build-iva',
      label: 'IVA on new-build residential property (national)',
      region: 'national',
      unit: 'percent',
      value: 10,
      effectiveFrom: '2012-09-01',
      source: {
        url: 'https://sede.agenciatributaria.gob.es/Sede/iva.html',
        title: 'AEAT: IVA, tipos impositivos - entregas de viviendas',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Reduced IVA rate for dwellings (first delivery). Does not apply in the Canary Islands (IGIC instead) or Ceuta/Melilla (IPSI instead) - those need their own figures before their new-build mode can go live. CONFIRM the exact AEAT page URL.',
      status: 'draft',
    },
    {
      id: 'itp.madrid.new-build-ajd',
      label: 'AJD on new-build purchases, Madrid',
      region: 'madrid',
      unit: 'percent',
      value: 0.75,
      effectiveFrom: '2019-01-01',
      source: {
        url: 'https://www.comunidad.madrid/servicios/vivienda/impuesto-actos-juridicos-documentados',
        title: 'Comunidad de Madrid: Impuesto sobre Actos Jurídicos Documentados',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'General documented-deeds rate applied to a new-build purchase deed. CONFIRM the exact source page URL and the current rate before verifying.',
      status: 'draft',
    },
    {
      id: 'itp.andalucia.resale',
      label: 'ITP on resale residential property, Andalucía',
      region: 'andalucia',
      unit: 'percent',
      value: 7,
      effectiveFrom: '2021-04-28',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/economiahaciendayfondoseuropeos/areas/tributos-juego/tributos/paginas/impuestos-cedidos-transmisiones.html',
        title: 'Junta de Andalucía: Impuesto sobre Transmisiones Patrimoniales y Actos Jurídicos Documentados',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Flat 7% general rate, confirmed via the official Junta de Andalucía tributos page (fetched 2026-07-05), effective from 28/04/2021 per a regional decree-law. A reduced 6% applies to primary residences valued at EUR 150,000 or less (from 27/10/2021), plus 3.5% for under-35s, disability, victims of violence/terrorism, and depopulation-risk municipalities, and 2% for licensed resale-flipper businesses - none of these reduced rates are modelled in v1. CONFIRM the 7% figure and 2021-04-28 date against the primary legal text (Decreto-ley) before verifying; also check no later 2025/2026 budget law has changed it.',
      status: 'draft',
    },
    {
      id: 'itp.andalucia.new-build-ajd',
      label: 'AJD on new-build purchases, Andalucía',
      region: 'andalucia',
      unit: 'percent',
      value: 1.2,
      effectiveFrom: '2021-04-28',
      source: {
        url: 'https://www.juntadeandalucia.es/organismos/economiahaciendayfondoseuropeos/areas/tributos-juego/tributos/paginas/impuestos-cedidos-transmisiones.html',
        title: 'Junta de Andalucía: Impuesto sobre Actos Jurídicos Documentados',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Flat 1.2% general documented-deeds rate applied to a new-build purchase deed, effective 28/04/2021. Reduced rates of 0.3% (young buyers/large families, primary residence <= EUR 150,000) and 0.1% (disability, primary residence <= EUR 250,000) exist - not modelled in v1. CONFIRM against the primary legal text before verifying.',
      status: 'draft',
    },
    {
      id: 'itp.comunidad-valenciana.resale',
      label: 'ITP on resale residential property, Valencia (Comunitat Valenciana)',
      region: 'comunidad-valenciana',
      unit: 'percent',
      bands: [
        { upTo: 1000000, rate: 9 },
        { upTo: null, rate: 11 },
      ],
      bandType: 'marginal',
      effectiveFrom: '2026-06-01',
      source: {
        url: 'https://atv.gva.es/es/tarifes-itpajd',
        title: 'Agència Tributària Valenciana: Tarifes ITP i AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'UNRESOLVED - CONFIRM BEFORE VERIFYING: Ley 5/2025 cut the general rate from a flat 10% to a two-band scale, effective 2026-06-01: 9% up to EUR 1,000,000, 11% above. I could NOT confirm from a primary source whether the 11% band is MARGINAL (only the slice above EUR 1M taxed at 11%, entered here) or WHOLE (11% applied to the entire price once it exceeds EUR 1M - a cliff edge). Secondary sources conflict: one explicitly called it a cliff ("11% applies to the entire transaction value"), another described it as "excess over EUR 1,000,000 taxed at 11%" and called the structure a progressive two-tranche tariff. atv.gva.es/es/tarifes-itpajd itself only lists tariff codes (e.g. TU1 = Type 9) without rendering the euro thresholds in this session - the real scale lives in a linked normativa/law page I could not fetch. I have entered bandType marginal as the working assumption (consistent with Catalunya and Baleares regional scales, and the "tarifa progresiva" wording) but this MUST be verified against the literal text of Ley 5/2025 (or its BOE/DOGV publication) before status can move to verified - if it turns out to be whole, both the bandType and the calculator logic that reads it must be checked. Reduced rates of 8% (under-35/VPO <= EUR 180,000), 6%, 4% (large families/disability >=65%) and 3% (depopulation municipalities) also exist and are not modelled in v1.',
      status: 'draft',
    },
    {
      id: 'itp.comunidad-valenciana.new-build-ajd',
      label: 'AJD on new-build purchases, Valencia (Comunitat Valenciana)',
      region: 'comunidad-valenciana',
      unit: 'percent',
      value: 1.4,
      effectiveFrom: '2026-06-01',
      source: {
        url: 'https://atv.gva.es/es/tarifes-itpajd',
        title: 'Agència Tributària Valenciana: Tarifes ITP i AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'RATE FROM SECONDARY SOURCE (guiafiscal.es/patrimonio/itp/valencia/) - official page did not clearly state the general AJD rate for this session; atv.gva.es/es/tarifes-itpajd shows a "DA1 / Type 0.1" tariff code for "Adquisicion de vivienda habitual" under notarial acts, which does not obviously match 1.4% and may be a different, narrower concept (e.g. a fixed-fee code rather than the ad-valorem rate). Ley 5/2025 reportedly cut the general AJD rate from 1.5% to 1.4% effective 2026-06-01. CONFIRM the 1.4% figure and what DA1/Type 0.1 actually represents against the official normativa before verifying.',
      status: 'draft',
    },
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
      effectiveFrom: '2025-01-01',
      source: {
        url: 'https://www.atib.es/TA/normativa/impuestos/ITP/',
        title: 'Agència Tributària de les Illes Balears: normativa ITP',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'RATE FROM SECONDARY SOURCES (multiple aggregators cross-confirmed, e.g. calculadoraitp.es/calculadora/itp-baleares, guiafiscal.es/patrimonio/itp/baleares/) - atib.es did not render the numeric scale for this session (empty/404 body). Confirmed MARGINAL (not whole) via an explicit worked example found in research: a EUR 700,000 purchase computes as 400,000 x 8% + 200,000 x 9% + 100,000 x 10% = 32,000 + 18,000 + 10,000 = EUR 60,000, which only reconciles under marginal banding (a whole reading would give 700,000 x 10% = EUR 70,000 instead). effectiveFrom of 2025-01-01 is a placeholder - sources call this the "new" 2025 scale but I could not pin the exact commencement date; CONFIRM against atib.es directly. A 0% rate for primary residence under-30s and a 5% rate for large families/VPO <= EUR 270,151.20 exist and are not modelled in v1.',
      status: 'draft',
    },
    {
      id: 'itp.baleares.new-build-ajd',
      label: 'AJD on new-build purchases, Balearic Islands',
      region: 'baleares',
      unit: 'percent',
      value: 1.5,
      effectiveFrom: '2025-01-01',
      source: {
        url: 'https://www.atib.es/TA/normativa/impuestos/ITP/',
        title: 'Agència Tributària de les Illes Balears: normativa AJD',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'RATE FROM SECONDARY SOURCES (atib.es did not render for this session) - general 1.5% AJD rate on new-build purchase deeds. A 2.0% AJD surcharge reportedly applies specifically to new-build homes priced at or above EUR 1,000,000 - not modelled in v1 (v1 only carries the general rate). effectiveFrom is a placeholder pending direct confirmation on atib.es.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.resale',
      label: 'ITP on resale residential property, Canary Islands',
      region: 'canarias',
      unit: 'percent',
      value: 6.5,
      effectiveFrom: '2012-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/',
        title: 'Agencia Tributaria Canaria (ATC)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'RATE FROM SECONDARY SOURCES (multiple aggregators agree on a flat, non-progressive 6.5% general rate) - the official ATC guide PDF exists (guia_completa_itp_y_ajd.pdf on gobiernodecanarias.org) but returned as an unreadable image-based PDF in this session; open it directly to confirm. effectiveFrom 2012-01-01 is a rough placeholder (when the current devolved-rate regime broadly settled) and NOT independently confirmed - check the actual commencement date. Reduced rates around 3-4% for primary residence under value/age/income thresholds exist (sources are slightly inconsistent on the exact reduced number) - not modelled in v1.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.new-build-ajd',
      label: 'AJD on new-build purchases, Canary Islands',
      region: 'canarias',
      unit: 'percent',
      value: 0.75,
      effectiveFrom: '2012-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/',
        title: 'Agencia Tributaria Canaria (ATC)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'RATE FROM SECONDARY SOURCES (rankia.com blog, fiscaly.com) - the official ATC PDF guide could not be read in this session (image-based PDF). 0.75% is the general AJD rate applied to a new-build purchase deed in the Canary Islands. effectiveFrom 2012-01-01 is an unconfirmed placeholder. CONFIRM directly against the ATC guide or normativa before verifying.',
      status: 'draft',
    },
    {
      id: 'itp.canarias.new-build-igic',
      label: 'IGIC on new-build residential property, Canary Islands',
      region: 'canarias',
      unit: 'percent',
      value: 6.5,
      effectiveFrom: '2012-01-01',
      source: {
        url: 'https://www3.gobiernodecanarias.org/tributos/atc/',
        title: 'Agencia Tributaria Canaria (ATC)',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'IGIC (Impuesto General Indirecto Canario) replaces IVA in the Canary Islands - national IVA (itp.national.new-build-iva, 10%) does not apply here. This figure is NOT yet used by the calculator (Canarias new-build mode is not live) but must validate. RATE FROM SECONDARY SOURCES - conflicting: several aggregators quote 6.5% as the rate specifically for new housing (vivienda), while the GENERAL IGIC rate on most other goods/services is quoted as 7%. It is unclear whether 6.5% is a housing-specific reduced IGIC rate distinct from the 7% general rate, or whether one of these numbers is simply wrong in the secondary sources. I have recorded 6.5% as it was the figure most consistently tied to "vivienda" specifically. CONFIRM this against Ley 4/2012 (IGIC law) or the official ATC guide PDF before verifying - this is the single biggest open question for Canarias. effectiveFrom 2012-01-01 is an unconfirmed placeholder tied to when IGIC housing rates broadly settled.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.resale',
      label: 'ITP on resale residential property, Murcia',
      region: 'murcia',
      unit: 'percent',
      value: 7.75,
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/-/novedades-en-materia-de-tributos-aprobadas-en-la-ley-de-presupuestos-generales-de-la-comunidad-autonoma-de-la-region-de-murcia-para-el-ano-2025',
        title: 'Agencia Tributaria de la Región de Murcia (ATRM): novedades en materia de tributos, Ley de Presupuestos 2025',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Flat 7.75% general rate, confirmed directly on the official CARM/ATRM announcement page, effective 2025-07-25 (reduced from a prior flat 8% by Ley 3/2025, the CARM 2025 budget law). Reduced rates of 3% (under-35/large-family/disability >=65%, primary residence <= EUR 150,000) and 4% (VPO) exist - not modelled in v1. Strongest-sourced region in this batch; still confirm the announcement matches the final published Ley 3/2025 text before verifying.',
      status: 'draft',
    },
    {
      id: 'itp.murcia.new-build-ajd',
      label: 'AJD on new-build purchases, Murcia',
      region: 'murcia',
      unit: 'percent',
      value: 1.5,
      effectiveFrom: '2025-07-25',
      source: {
        url: 'https://agenciatributaria.carm.es/en/-/novedades-en-materia-de-tributos-aprobadas-en-la-ley-de-presupuestos-generales-de-la-comunidad-autonoma-de-la-region-de-murcia-para-el-ano-2025',
        title: 'Agencia Tributaria de la Región de Murcia (ATRM): novedades en materia de tributos, Ley de Presupuestos 2025',
        accessed: '2026-07-05',
      },
      reviewBy: '2027-01-31',
      note:
        'Confirmed directly on the official CARM/ATRM announcement page: reduced from 2% to 1.5%, effective 2025-07-25, applying to first-copy deeds for property transfers subject to and not exempt from VAT (i.e. new-build). A 0.1% reduced rate for qualifying primary-residence buyers exists - not modelled in v1.',
      status: 'draft',
    },
  ],
};
