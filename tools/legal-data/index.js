/*
 * tools/legal-data/index.js - THE LEGAL-DATA SPINE (entry point)
 * ---------------------------------------------------------------------------
 * One structured source of truth for Spain's legal figures: tax rates,
 * thresholds, official fees. Every ELS surface that shows a figure (the
 * calculators, and over time the money pages and blog fact-checks) reads
 * from here. No figure is ever hardcoded inside a calculator or a page.
 *
 * THE ONE RULE: a figure cannot enter the spine without a source URL,
 * an effective date, a review-by date and a note. tools/validate-legal-data.js
 * enforces it and rejects anything unsourced.
 *
 * A figure can only be marked status: 'verified' when its source is an
 * OFFICIAL tax-authority page (AEAT or a regional hacienda / agencia
 * tributaria - see officialSourceHosts below). Law-firm blogs and
 * aggregators are never a verifying source; a figure that only appears on
 * a secondary site stays 'draft'.
 *
 * Domain files (one per topic) live next to this file: itp.js today,
 * beckham.js / visa-fees.js etc. later. Add the require() below when you
 * add one. See tools/TOOLS-NOTES.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const domains = {
  itp: require('./itp.js'),
};

// Canonical region keys. A figure's `region` must be one of these.
// Labels are the user-facing English names rendered on pages.
const regions = {
  andalucia: 'Andalucía',
  aragon: 'Aragón',
  asturias: 'Asturias',
  baleares: 'Balearic Islands',
  canarias: 'Canary Islands',
  cantabria: 'Cantabria',
  'castilla-la-mancha': 'Castilla-La Mancha',
  'castilla-y-leon': 'Castilla y León',
  catalunya: 'Catalunya',
  'comunidad-valenciana': 'Valencia (Comunitat Valenciana)',
  extremadura: 'Extremadura',
  galicia: 'Galicia',
  madrid: 'Madrid',
  murcia: 'Murcia',
  navarra: 'Navarra',
  'pais-vasco': 'Basque Country',
  'la-rioja': 'La Rioja',
  ceuta: 'Ceuta',
  melilla: 'Melilla',
  national: 'National (state-wide)',
};

// Units a figure's `value` / band `rate` can be expressed in.
const units = ['percent', 'eur', 'eur-per-month'];

// Hosts that count as an OFFICIAL source. A figure may only be
// status: 'verified' if its source.url host is (a subdomain of) one of
// these. Extend the list when a new region's official agency is added -
// never add a law firm, news site or aggregator.
const officialSourceHosts = [
  'agenciatributaria.gob.es', // AEAT (national)
  'agenciatributaria.es',
  'boe.es', // state law gazette
  'atc.gencat.cat', // Catalunya
  'gencat.cat',
  'comunidad.madrid', // Madrid
  'juntadeandalucia.es', // Andalucía
  'agenciatributariadeandalucia.es',
  'gva.es', // Valencia
  'atv.gva.es',
  'caib.es', // Balearic Islands
  'atib.es',
  'gobiernodecanarias.org', // Canary Islands
  'carm.es', // Murcia
  'aragon.es',
  'asturias.es',
  'cantabria.es',
  'castillalamancha.es',
  'jcyl.es', // Castilla y León
  'juntaex.es', // Extremadura
  'atriga.gal', // Galicia
  'xunta.gal',
  'navarra.es',
  'euskadi.eus', // Basque Country
  'araba.eus',
  'bizkaia.eus',
  'gipuzkoa.eus',
  'larioja.org',
  'ceuta.es',
  'melilla.es',
];

function isOfficialSourceUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return officialSourceHosts.some((h) => host === h || host.endsWith('.' + h));
}

// Every figure across every domain, with `domain` stamped on.
function allFigures() {
  return Object.values(domains).flatMap((d) =>
    (d.figures || []).map((f) => ({ ...f, domain: d.domain }))
  );
}

// Look one figure up by id (or undefined).
function getFigure(id) {
  return allFigures().find((f) => f.id === id);
}

module.exports = {
  version: 1,
  regions,
  units,
  domains,
  officialSourceHosts,
  isOfficialSourceUrl,
  allFigures,
  getFigure,
};
