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
  ],
};
