/*
 * calc-engine.js - the ELS calculation engine
 * ---------------------------------------------------------------------------
 * Pure, deterministic maths for every ELS calculator. No DOM, no fetch,
 * no figures hardcoded: every rate and threshold is passed IN as data from
 * the legal-data spine (tools/legal-data/). The same file runs in the
 * browser (window.ELSCalc, loaded by the calculator pages) and in Node
 * (module.exports, used by the tests and the page build).
 *
 * All money maths is done in integer cents, rounded half-up per line, so
 * browser and Node can never disagree and totals always match the printed
 * breakdown to the cent.
 *
 * Every calculator returns the same result shape ("show the working"):
 *   { ok: true,
 *     total, effectiveRate, currency: 'EUR',
 *     lines:       [{ label, rate, base, amount, figureId }],
 *     figuresUsed: [{ id, label, source, effectiveFrom, reviewBy }],
 *     notes:       [user-facing caveats from the figures used] }
 * Bad user input returns { ok: false, error: '...' } - it never throws.
 * Malformed spine data DOES throw: that is a build bug and the tests and
 * page build must fail loudly, not render a wrong number.
 * ---------------------------------------------------------------------------
 */

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ELSCalc = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- money helpers (integer cents) ---------------------------------------

  function toCents(euros) {
    return Math.round(euros * 100);
  }
  function fromCents(cents) {
    return Math.round(cents) / 100;
  }
  // rate is a percent (e.g. 10.5). Round half-up to the cent.
  function taxCents(baseCents, rate) {
    return Math.round((baseCents * rate) / 100);
  }
  function fmtEUR(euros) {
    var whole = Math.floor(Math.abs(euros));
    var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var cents = Math.round((Math.abs(euros) - whole) * 100);
    var out = '€' + s + (cents ? '.' + String(cents).padStart(2, '0') : '');
    return (euros < 0 ? '-' : '') + out;
  }

  function assertData(cond, msg) {
    if (!cond) throw new Error('calc-engine: bad spine data - ' + msg);
  }

  // --- generic band maths ----------------------------------------------------

  /*
   * applyBands(bands, bandType, amount)
   *   bands    [{ upTo: number|null, rate: percent }] ascending, last upTo null
   *   bandType 'marginal' - each rate taxes its own slice of the amount
   *            'whole'    - one rate, picked by where the total falls,
   *                         applied to the whole amount
   * Returns { total, effectiveRate, steps: [{ from, to, rate, taxableBase, tax }] }
   */
  function applyBands(bands, bandType, amount) {
    assertData(Array.isArray(bands) && bands.length >= 2, 'bands must be an array of 2+.');
    assertData(bands[bands.length - 1].upTo === null, 'last band must be open (upTo null).');
    assertData(bandType === 'marginal' || bandType === 'whole', 'bandType must be marginal or whole.');

    var amountCents = toCents(amount);
    var steps = [];
    var totalCents = 0;

    if (bandType === 'whole') {
      var band = bands.find(function (b) {
        return b.upTo === null || amount <= b.upTo;
      });
      totalCents = taxCents(amountCents, band.rate);
      steps.push({ from: 0, to: band.upTo, rate: band.rate, taxableBase: amount, tax: fromCents(totalCents) });
    } else {
      var prev = 0;
      for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        assertData(b.upTo === null || b.upTo > prev, 'band thresholds must ascend.');
        var top = b.upTo === null ? amount : Math.min(amount, b.upTo);
        if (top <= prev) break;
        var sliceCents = toCents(top) - toCents(prev);
        var t = taxCents(sliceCents, b.rate);
        totalCents += t;
        steps.push({ from: prev, to: b.upTo, rate: b.rate, taxableBase: fromCents(sliceCents), tax: fromCents(t) });
        prev = top;
        if (b.upTo !== null && amount <= b.upTo) break;
      }
    }

    var total = fromCents(totalCents);
    return {
      total: total,
      effectiveRate: amount > 0 ? Math.round((total / amount) * 10000) / 100 : 0,
      steps: steps,
    };
  }

  function applyFlatRate(rate, amount) {
    assertData(typeof rate === 'number' && isFinite(rate), 'flat rate must be a number.');
    var t = fromCents(taxCents(toCents(amount), rate));
    return {
      total: t,
      effectiveRate: rate,
      steps: [{ from: 0, to: null, rate: rate, taxableBase: amount, tax: t }],
    };
  }

  // --- figure plumbing ---------------------------------------------------------

  function findFigure(data, id) {
    assertData(data && Array.isArray(data.figures), 'data.figures missing.');
    for (var i = 0; i < data.figures.length; i++) {
      if (data.figures[i].id === id) return data.figures[i];
    }
    return null;
  }

  function figureRef(f) {
    return {
      id: f.id,
      label: f.label,
      source: f.source,
      effectiveFrom: f.effectiveFrom,
      reviewBy: f.reviewBy,
    };
  }

  // Run one figure (flat or banded) against an amount.
  function applyFigure(fig, amount) {
    assertData(fig.unit === 'percent', 'figure ' + fig.id + ' is not a percent figure.');
    if (fig.bands) return applyBands(fig.bands, fig.bandType, amount);
    return applyFlatRate(fig.value, amount);
  }

  // Turn a banded step into a readable line label.
  function bandLabel(taxName, step, isOnly) {
    if (isOnly) return taxName + ' at ' + step.rate + '%';
    if (step.from === 0) return taxName + ' at ' + step.rate + '% on the first ' + fmtEUR(step.to);
    if (step.to === null) return taxName + ' at ' + step.rate + '% above ' + fmtEUR(step.from);
    return taxName + ' at ' + step.rate + '% from ' + fmtEUR(step.from) + ' to ' + fmtEUR(step.to);
  }

  // --- the ITP calculator --------------------------------------------------------
  /*
   * calculateITP(data, { region, price, propertyType })
   *   data          the spine slice: { regions: {key: label}, figures: [...] }
   *                 (the page embeds verified figures only; tests pass seeds)
   *   region        canonical region key, e.g. 'catalunya'
   *   price         declared purchase price in euros
   *   propertyType  'resale' (ITP) | 'new-build' (IVA + AJD - never ITP)
   */
  function calculateITP(data, input) {
    input = input || {};
    var region = input.region;
    var price = input.price;
    var propertyType = input.propertyType;

    if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
      return { ok: false, error: 'invalid-price' };
    }
    if (propertyType !== 'resale' && propertyType !== 'new-build') {
      return { ok: false, error: 'invalid-property-type' };
    }
    if (!region || !data.regions || !(region in data.regions)) {
      return { ok: false, error: 'unknown-region' };
    }

    var lines = [];
    var figuresUsed = [];
    var notes = [];
    var totalCents = 0;

    function useFigure(fig, taxName) {
      var r = applyFigure(fig, price);
      var only = r.steps.length === 1;
      r.steps.forEach(function (s) {
        lines.push({
          label: bandLabel(taxName, s, only),
          rate: s.rate,
          base: s.taxableBase,
          amount: s.tax,
          figureId: fig.id,
        });
      });
      figuresUsed.push(figureRef(fig));
      if (fig.userNote) notes.push(fig.userNote);
      totalCents += toCents(r.total);
    }

    if (propertyType === 'resale') {
      var itp = findFigure(data, 'itp.' + region + '.resale');
      if (!itp) return { ok: false, error: 'figure-missing', missing: 'itp.' + region + '.resale' };
      useFigure(itp, 'ITP');
    } else {
      // New build: IVA + AJD. Never ITP.
      var iva = findFigure(data, 'itp.national.new-build-iva');
      var ajd = findFigure(data, 'itp.' + region + '.new-build-ajd');
      if (!iva) return { ok: false, error: 'figure-missing', missing: 'itp.national.new-build-iva' };
      if (!ajd) return { ok: false, error: 'figure-missing', missing: 'itp.' + region + '.new-build-ajd' };
      useFigure(iva, 'IVA');
      useFigure(ajd, 'AJD');
    }

    var total = fromCents(totalCents);
    return {
      ok: true,
      total: total,
      effectiveRate: Math.round((total / price) * 10000) / 100,
      currency: 'EUR',
      region: region,
      regionLabel: data.regions[region],
      propertyType: propertyType,
      price: price,
      lines: lines,
      figuresUsed: figuresUsed,
      notes: notes,
    };
  }

  return {
    applyBands: applyBands,
    applyFlatRate: applyFlatRate,
    calculateITP: calculateITP,
    fmtEUR: fmtEUR,
  };
});
