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
  function applyBands(bands, bandType, amount, errorDeSalto) {
    assertData(Array.isArray(bands) && bands.length >= 2, 'bands must be an array of 2+.');
    assertData(bands[bands.length - 1].upTo === null, 'last band must be open (upTo null).');
    assertData(bandType === 'marginal' || bandType === 'whole', 'bandType must be marginal or whole.');

    var amountCents = toCents(amount);
    var steps = [];
    var totalCents = 0;

    if (bandType === 'whole') {
      var idx = bands.findIndex(function (b) {
        return b.upTo === null || amount <= b.upTo;
      });
      var band = bands[idx];
      totalCents = taxCents(amountCents, band.rate);
      // Error de salto (e.g. Madrid TR art. 37): opt-in per rule. A whole-value
      // bracket must never let the quota rise by more than the base did across
      // the previous threshold, so just above each boundary the quota is capped
      // at (quota at that threshold) + (the amount over it). Off by default, so
      // Valencia's genuine whole-value cliff and every other caller are unchanged.
      if (errorDeSalto && idx > 0) {
        var prev = bands[idx - 1];
        var thresholdCents = toCents(prev.upTo);
        var capCents = taxCents(thresholdCents, prev.rate) + (amountCents - thresholdCents);
        if (capCents < totalCents) totalCents = capCents;
      }
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

  // Mainland IVA does not exist in these territories: IGIC in the Canary
  // Islands (handled by its own branch below, live since the 2026-07-05
  // verification pass), IPSI in Ceuta/Melilla (no verified figures yet, so
  // the engine refuses rather than compute a wrong number). Structural
  // fact, not a figure. When Ceuta/Melilla IPSI figures are verified, give
  // them a branch like the Canarias one.
  var IPSI_REGIONS = ['ceuta', 'melilla'];

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
      // New build: indirect tax (IVA, or IGIC in the Canary Islands) + AJD.
      // Never ITP.
      if (IPSI_REGIONS.indexOf(region) !== -1) {
        return { ok: false, error: 'iva-not-applicable', region: region };
      }
      var ajd = findFigure(data, 'itp.' + region + '.new-build-ajd');
      if (!ajd) return { ok: false, error: 'figure-missing', missing: 'itp.' + region + '.new-build-ajd' };
      if (region === 'canarias') {
        var igic = findFigure(data, 'itp.canarias.new-build-igic');
        if (!igic) return { ok: false, error: 'figure-missing', missing: 'itp.canarias.new-build-igic' };
        useFigure(igic, 'IGIC');
      } else {
        var iva = findFigure(data, 'itp.national.new-build-iva');
        if (!iva) return { ok: false, error: 'figure-missing', missing: 'itp.national.new-build-iva' };
        useFigure(iva, 'IVA');
      }
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

  // --- relief evaluation (v2: the personalised calculator) -------------------
  /*
   * Reliefs are reduced rates / bonifications a buyer qualifies for based on
   * their circumstances. Rules come from the spine (tools/legal-data/
   * itp-reliefs.js) via data.reliefs. Three iron rules:
   *   1. Only status 'verified' rules are ever evaluated (the build already
   *      strips drafts; the engine filters again - belt and braces).
   *   2. Conditions are tri-state: satisfied / failed / UNKNOWN. A relief
   *      only applies when every condition is explicitly satisfied. Missing
   *      input can never produce a "you likely qualify".
   *   3. "Most favourable" is decided by computed euros across every legal
   *      combination, never by comparing nominal rates.
   *
   * Buyer inputs (all optional - anything absent evaluates as unknown):
   *   mainHome                   true | false  the gate: will they live there?
   *   age                        number
   *   firstHome                  true | false
   *   ownsOtherHome              true | false  (50%+ of another dwelling)
   *   income                     number (EUR) - see noSpanishIncomeTax
   *   noSpanishIncomeTax         true = does not file Spanish IRPF: every
   *                              income cap stays unknown, relief withheld
   *   savingsIncome              number (EUR) - Murcia's separate savings cap
   *   largeFamily                true | false
   *   singleParentFamily         true | false
   *   disability                 'none' | '33to64' | '65plus'
   *   priorRegionResidenceYears  number (UI sends 3 for "3+ years", 0 for no)
   *   mortgageLtvPercent         number (UI sends 60 for "60%+", 0 for no)
   */

  // Condition types the calculator can ask about. Anything NOT in this list
  // (vpoProtectedHousing, genderViolenceVictim, ruralDepopulatedArea,
  // terrorismVictim, future additions...) evaluates as unknown forever, so a
  // rule carrying one can never auto-grant - it only ever surfaces as the
  // "other situation? a lawyer can confirm" hint. Keep in sync with
  // reliefConditionTypes in tools/legal-data/index.js.
  var ASKABLE_CONDITIONS = [
    'maxAge',
    'habitualResidence',
    'firstHome',
    'noPriorPropertyOwnership',
    'maxIncome',
    'maxHouseholdIncome',
    'maxSavingsIncome',
    'maxPropertyValue',
    'disability',
    'largeFamily',
    'singleParentFamily',
    'priorRegionResidenceYears',
    'mortgageLtvMin',
    'priorHomeSaleWindow',
  ];

  function triBool(v) {
    return v === true ? 'yes' : v === false ? 'no' : 'unknown';
  }
  function triMax(actual, cap, inclusive) {
    if (typeof actual !== 'number' || !isFinite(actual)) return 'unknown';
    return (inclusive === false ? actual < cap : actual <= cap) ? 'yes' : 'no';
  }

  // One condition against the buyer's answers -> 'yes' | 'no' | 'unknown'.
  function evaluateCondition(cond, ctx) {
    if (cond && Array.isArray(cond.anyOf)) {
      var sawUnknown = false;
      for (var i = 0; i < cond.anyOf.length; i++) {
        var r = evaluateCondition(cond.anyOf[i], ctx);
        if (r === 'yes') return 'yes';
        if (r === 'unknown') sawUnknown = true;
      }
      return sawUnknown ? 'unknown' : 'no';
    }
    var b = ctx.buyer || {};
    switch (cond.type) {
      case 'maxAge':
        return triMax(b.age, cond.value, cond.inclusive);
      case 'habitualResidence':
        return triBool(b.mainHome);
      case 'firstHome':
        return triBool(b.firstHome);
      case 'noPriorPropertyOwnership':
        // conservative: still owning another home fails the condition here;
        // sell-within-a-window nuances are the lawyer's confirmation, not ours
        return b.ownsOtherHome === false ? 'yes' : b.ownsOtherHome === true ? 'no' : 'unknown';
      case 'maxIncome':
      case 'maxHouseholdIncome':
        if (b.noSpanishIncomeTax === true) return 'unknown';
        return triMax(b.income, cond.value, cond.inclusive);
      case 'maxSavingsIncome':
        if (b.noSpanishIncomeTax === true) return 'unknown';
        return triMax(b.savingsIncome, cond.value, cond.inclusive);
      case 'maxPropertyValue': {
        var cap = cond.byIsland ? (ctx.island != null ? cond.byIsland[ctx.island] : undefined) : cond.value;
        if (typeof cap !== 'number') return 'unknown';
        return ctx.price <= cap ? 'yes' : 'no';
      }
      case 'disability': {
        var d = b.disability;
        if (d === 'none') return 'no';
        if (d === '65plus') return 'yes';
        if (d === '33to64') {
          if (cond.value === null || cond.value <= 33) return 'yes';
          return cond.value <= 64 ? 'unknown' : 'no'; // exact degree not asked
        }
        return 'unknown';
      }
      case 'largeFamily':
        return triBool(b.largeFamily);
      case 'singleParentFamily':
        return triBool(b.singleParentFamily);
      case 'priorRegionResidenceYears':
        if (typeof b.priorRegionResidenceYears !== 'number') return 'unknown';
        return b.priorRegionResidenceYears >= cond.value ? 'yes' : 'no';
      case 'mortgageLtvMin':
        if (typeof b.mortgageLtvPercent !== 'number') return 'unknown';
        return b.mortgageLtvPercent >= cond.value ? 'yes' : 'no';
      case 'priorHomeSaleWindow':
        // satisfied for a buyer with no other home; a buyer still holding one
        // may yet sell within the legal window - unknown, lawyer confirms
        return b.ownsOtherHome === false ? 'yes' : 'unknown';
      default:
        // unrecognised / never-asked types: unknown forever, never grants
        return 'unknown';
    }
  }

  // One rule -> { outcome: 'qualified'|'failed'|'potential', unknowns: [types] }
  function evaluateRule(rule, ctx) {
    var unknowns = [];
    var failed = false;
    var sawUnknown = false;
    for (var i = 0; i < rule.conditions.length; i++) {
      var c = rule.conditions[i];
      var r = evaluateCondition(c, ctx);
      if (r === 'no') failed = true;
      if (r === 'unknown') {
        sawUnknown = true;
        (c.anyOf || [c]).forEach(function (leaf) {
          if (ASKABLE_CONDITIONS.indexOf(leaf.type) !== -1 && unknowns.indexOf(leaf.type) === -1) {
            unknowns.push(leaf.type);
          }
        });
      }
    }
    if (failed) return { outcome: 'failed', unknowns: unknowns };
    // A lawyer-route condition is permanently unknown: the rule can never
    // auto-grant, and no refine question would change that, so it reports no
    // unknowns (it surfaces via otherSituationHint instead).
    if (hasLawyerRouteCondition(rule)) return { outcome: 'potential', unknowns: [] };
    if (unknowns.length) return { outcome: 'potential', unknowns: unknowns };
    // Backstop: a condition evaluated unknown but produced neither an askable
    // unknown nor a recognised lawyer-route condition. The only shape that does
    // this is an anyOf group made entirely of lawyer-route types - it can never
    // be satisfied from buyer input, so it must never auto-grant. Mirrors
    // eligibility-engine.js (any unknown -> never eligible) and holds regardless
    // of how future condition types are classified.
    if (sawUnknown) return { outcome: 'potential', unknowns: [] };
    return { outcome: 'qualified', unknowns: [] };
  }

  function hasLawyerRouteCondition(rule) {
    function isLawyerRoute(c) {
      if (c.anyOf) return false; // an anyOf can be satisfied by an askable alternative
      return ASKABLE_CONDITIONS.indexOf(c.type) === -1;
    }
    return rule.conditions.some(isLawyerRoute);
  }

  // If this rule is blocked SOLELY by a property-value cap (its maxPropertyValue
  // condition fails and nothing else does), return that cap in euros; otherwise
  // null. Unknowns are not failures, so a rule the buyer has not yet answered is
  // never reported as cap-blocked. Lets the UI say how far under the limit the
  // price needs to be, instead of a bare standard rate with no reason.
  function valueCapBlockedCap(rule, ctx) {
    var capValue = null;
    var capFailed = false;
    var otherFailed = false;
    for (var i = 0; i < rule.conditions.length; i++) {
      var c = rule.conditions[i];
      var r = evaluateCondition(c, ctx);
      if (!c.anyOf && c.type === 'maxPropertyValue') {
        if (r === 'no') {
          capFailed = true;
          var cap = c.byIsland ? (ctx.island != null ? c.byIsland[ctx.island] : undefined) : c.value;
          if (typeof cap === 'number') capValue = cap;
        }
      } else if (r === 'no') {
        otherFailed = true;
      }
    }
    return capFailed && !otherFailed ? capValue : null;
  }

  // The conditions a buyer explicitly FAILS on this rule (the ones that
  // evaluate 'no'), so the UI can say why a reduced rate does not apply rather
  // than only that it does not. Unknowns are excluded (still askable, not a
  // reason). Returns the raw condition objects for the UI to render.
  function failedConditions(rule, ctx) {
    var out = [];
    for (var i = 0; i < rule.conditions.length; i++) {
      if (evaluateCondition(rule.conditions[i], ctx) === 'no') out.push(rule.conditions[i]);
    }
    return out;
  }

  function reliefRef(rule) {
    return {
      id: rule.id,
      label: rule.label,
      appliesTo: rule.appliesTo,
      result: rule.result,
      conditions: rule.conditions,
      source: rule.source,
      effectiveFrom: rule.effectiveFrom,
      reviewBy: rule.reviewBy,
    };
  }

  // Quota (in cents) + display lines for a base option on one tax component.
  function baseQuota(taxName, stdFig, rateRule, price) {
    var lines = [];
    var cents = 0;
    if (!rateRule) {
      var std = applyFigure(stdFig, price);
      var only = std.steps.length === 1;
      std.steps.forEach(function (s) {
        lines.push({ label: bandLabel(taxName, s, only), rate: s.rate, base: s.taxableBase, amount: s.tax, figureId: stdFig.id });
      });
      cents = toCents(std.total);
      return { cents: cents, lines: lines };
    }
    var res = rateRule.result;
    if (res.type === 'exempt') {
      lines.push({ label: taxName + ' exempt (' + rateRule.label + ')', rate: 0, base: price, amount: 0, figureId: rateRule.id });
      return { cents: 0, lines: lines };
    }
    if (res.bands) {
      var banded = applyBands(res.bands, res.bandType, price, res.errorDeSalto);
      var one = banded.steps.length === 1;
      banded.steps.forEach(function (s) {
        lines.push({ label: bandLabel(taxName, s, one), rate: s.rate, base: s.taxableBase, amount: s.tax, figureId: rateRule.id });
      });
      return { cents: toCents(banded.total), lines: lines };
    }
    if (typeof res.bandCap === 'number' && price > res.bandCap) {
      // Reduced rate on the first bandCap euros; the STANDARD scale carries on
      // above it (marginal continuation - a flagged modelling decision, see
      // tools/RELIEFS-NOTES.md).
      var reducedCents = taxCents(toCents(res.bandCap), res.value);
      lines.push({
        label: taxName + ' at ' + res.value + '% on the first ' + fmtEUR(res.bandCap),
        rate: res.value,
        base: res.bandCap,
        amount: fromCents(reducedCents),
        figureId: rateRule.id,
      });
      var stdFull = toCents(applyFigure(stdFig, price).total);
      var stdCap = toCents(applyFigure(stdFig, res.bandCap).total);
      var excessCents = stdFull - stdCap;
      lines.push({
        label: taxName + ' at the standard scale above ' + fmtEUR(res.bandCap),
        rate: null,
        base: price - res.bandCap,
        amount: fromCents(excessCents),
        figureId: stdFig.id,
      });
      return { cents: reducedCents + excessCents, lines: lines };
    }
    var flat = applyFlatRate(res.value, price);
    lines.push({ label: taxName + ' at ' + res.value + '% (' + rateRule.label + ')', rate: res.value, base: price, amount: flat.total, figureId: rateRule.id });
    return { cents: toCents(flat.total), lines: lines };
  }

  // All valid subsets of cumulative deductions for a base (tiny sets, so
  // plain enumeration; incompatibilities prune).
  function deductionSubsets(deds) {
    var out = [[]];
    deds.forEach(function (d) {
      var grown = [];
      out.forEach(function (set) {
        grown.push(set);
        var clash = set.some(function (s) {
          return (s.incompatibleWith || []).indexOf(d.id) !== -1 || (d.incompatibleWith || []).indexOf(s.id) !== -1;
        });
        if (!clash) grown.push(set.concat([d]));
      });
      out = grown;
    });
    return out;
  }

  /*
   * Best legal outcome for ONE tax component (ITP line, AJD line or IGIC
   * line). Returns null when no relief improves on the standard quota.
   */
  function bestReliefScenario(taxName, stdFig, qualified, price) {
    var rateRules = qualified.filter(function (r) {
      return r.result.type === 'rate' || r.result.type === 'exempt';
    });
    var exclusiveDeds = qualified.filter(function (r) {
      return r.result.type === 'deduction' && r.combinesWith !== 'cumulative';
    });
    var cumulativeDeds = qualified.filter(function (r) {
      return r.result.type === 'deduction' && r.combinesWith === 'cumulative';
    });

    // base options: the standard figure, or any qualifying rate/exempt rule
    var bases = [{ rule: null, key: 'standard' }].concat(
      rateRules.map(function (r) {
        return { rule: r, key: r.id };
      })
    );

    var best = null;
    bases.forEach(function (baseOpt) {
      var base = baseQuota(taxName, stdFig, baseOpt.rule, price);
      // cumulative deductions that may stack on this base
      // (no stacksOn declared = the standard base only - conservative)
      var stackable = cumulativeDeds.filter(function (d) {
        var on = d.stacksOn || ['standard'];
        return on.indexOf(baseOpt.key) !== -1;
      });
      var subsets = deductionSubsets(stackable);
      // exclusive deductions: alone on the STANDARD base only
      if (baseOpt.key === 'standard') {
        exclusiveDeds.forEach(function (d) {
          subsets.push([d]);
        });
      }
      subsets.forEach(function (set) {
        if (baseOpt.key === 'standard' && set.length === 0) return; // that's just the standard result
        var cents = base.cents;
        var lines = base.lines.slice();
        var applied = baseOpt.rule ? [baseOpt.rule] : [];
        set
          .slice()
          .sort(function (a, b) {
            return a.id < b.id ? -1 : 1;
          })
          .forEach(function (d) {
            var off = Math.round((cents * d.result.value) / 100);
            lines.push({
              label: d.label + ' (' + d.result.value + '% off the ' + taxName + ' due)',
              rate: -d.result.value,
              base: fromCents(cents),
              amount: fromCents(-off),
              figureId: d.id,
            });
            cents -= off;
            applied.push(d);
          });
        var key = applied
          .map(function (r) {
            return r.id;
          })
          .sort()
          .join('+');
        if (!best || cents < best.cents || (cents === best.cents && key < best.key)) {
          best = { cents: cents, lines: lines, applied: applied, key: key };
        }
      });
    });
    return best;
  }

  // The tax components of a purchase, mirroring calculateITP's selection.
  // track: which relief appliesTo modifies this component (null = never).
  function componentsFor(data, region, propertyType) {
    if (propertyType === 'resale') {
      return [{ track: 'resale', taxName: 'ITP', figureId: 'itp.' + region + '.resale' }];
    }
    if (region === 'canarias') {
      return [
        { track: 'newbuild-igic', taxName: 'IGIC', figureId: 'itp.canarias.new-build-igic' },
        { track: 'newbuild-ajd', taxName: 'AJD', figureId: 'itp.canarias.new-build-ajd' },
      ];
    }
    return [
      { track: null, taxName: 'IVA', figureId: 'itp.national.new-build-iva' }, // IVA is national: never relieved
      { track: 'newbuild-ajd', taxName: 'AJD', figureId: 'itp.' + region + '.new-build-ajd' },
    ];
  }

  /*
   * calculatePersonalisedITP(data, input, opts)
   *   data   the spine slice: { regions, figures, reliefs } - the page embeds
   *          verified rules only; the engine re-filters drafts regardless
   *   input  { region, price, propertyType, island, buyer: {...} }
   *   opts   { includeDrafts: true } TESTS ONLY - never set in a page build
   *
   * Returns { ok: true, standard, personalised, comparison, reliefStatus,
   *           missingInputs, otherSituationHint, appliedReliefs-in-personalised }
   * with `standard` being the untouched calculateITP result.
   */
  function calculatePersonalisedITP(data, input, opts) {
    input = input || {};
    var standard = calculateITP(data, input);
    if (!standard.ok) return standard;

    var buyer = input.buyer || {};
    var ctx = { price: input.price, island: input.island, buyer: buyer };
    var allReliefs = Array.isArray(data.reliefs) ? data.reliefs : [];
    var live = allReliefs.filter(function (r) {
      return (opts && opts.includeDrafts) === true || r.status === 'verified';
    });

    var comps = componentsFor(data, input.region, input.propertyType);
    var tracks = comps
      .map(function (c) {
        return c.track;
      })
      .filter(Boolean);
    var relevant = live.filter(function (r) {
      return r.region === input.region && tracks.indexOf(r.appliesTo) !== -1;
    });

    var out = {
      ok: true,
      standard: standard,
      personalised: null,
      comparison: null,
      reliefStatus: 'standard-only',
      missingInputs: [],
      otherSituationHint: relevant.some(hasLawyerRouteCondition),
      aboveValueCap: false,
      valueCapAmount: null,
      blockedReliefs: [],
    };
    if (relevant.length === 0) return out;

    if (buyer.mainHome === false) {
      // Holiday home / investment / not moving in: nearly every relief needs
      // habitual residence, so we do not evaluate further. Honest copy in the
      // UI says so plainly.
      out.reliefStatus = 'reliefs-unavailable';
      return out;
    }

    // Only tax-reducing rules explain a "why"; lawyer-route hints do not.
    var reducing = relevant.filter(function (r) {
      var t = r.result && r.result.type;
      return t === 'rate' || t === 'deduction' || t === 'exempt';
    });
    // A reduced rate that is out of reach ONLY because the price is over its
    // value cap: record the highest such cap so the UI can name it ("up to
    // EUR X"). The highest is the ceiling of the best relief they would
    // otherwise reach.
    var caps = [];
    reducing.forEach(function (r) {
      var cap = valueCapBlockedCap(r, ctx);
      if (cap !== null) caps.push(cap);
    });
    if (caps.length) {
      out.aboveValueCap = true;
      out.valueCapAmount = Math.max.apply(null, caps);
    }
    // Each reduced rate the buyer's answers rule out, with the specific
    // conditions not met, so the UI can say why rather than just "none apply".
    // Lawyer-route reliefs are left out (the buyer cannot self-qualify for
    // them); they surface through otherSituationHint instead.
    out.blockedReliefs = reducing
      .filter(function (r) { return !hasLawyerRouteCondition(r); })
      .map(function (r) {
        return { label: r.label, conditions: failedConditions(r, ctx) };
      })
      .filter(function (b) { return b.conditions.length > 0; });

    var totalCents = 0;
    var lines = [];
    var applied = [];
    var notes = [];
    var anyRelief = false;

    comps.forEach(function (comp) {
      var fig = findFigure(data, comp.figureId);
      assertData(fig, 'figure ' + comp.figureId + ' missing for a component the standard calc accepted.');
      var rules = relevant.filter(function (r) {
        return r.appliesTo === comp.track;
      });
      var qualified = [];
      rules.forEach(function (r) {
        var ev = evaluateRule(r, ctx);
        if (ev.outcome === 'qualified') qualified.push(r);
        if (ev.outcome === 'potential') {
          ev.unknowns.forEach(function (t) {
            if (out.missingInputs.indexOf(t) === -1) out.missingInputs.push(t);
          });
        }
      });
      var best = qualified.length ? bestReliefScenario(comp.taxName, fig, qualified, input.price) : null;
      if (best && best.cents < toCents(applyFigure(fig, input.price).total)) {
        anyRelief = true;
        totalCents += best.cents;
        lines = lines.concat(best.lines);
        best.applied.forEach(function (r) {
          applied.push(reliefRef(r));
          if (r.userNote) notes.push(r.userNote);
        });
      } else {
        var std = baseQuota(comp.taxName, fig, null, input.price);
        totalCents += std.cents;
        lines = lines.concat(std.lines);
        if (fig.userNote) notes.push(fig.userNote);
      }
    });

    out.missingInputs.sort();
    if (!anyRelief) return out;

    var total = fromCents(totalCents);
    out.personalised = {
      total: total,
      effectiveRate: Math.round((total / input.price) * 10000) / 100,
      currency: 'EUR',
      lines: lines,
      appliedReliefs: applied,
      notes: notes,
    };
    out.comparison = {
      standardTotal: standard.total,
      yourTotal: total,
      saving: fromCents(toCents(standard.total) - totalCents),
    };
    out.reliefStatus = 'relief-applied';
    return out;
  }

  return {
    applyBands: applyBands,
    applyFlatRate: applyFlatRate,
    calculateITP: calculateITP,
    calculatePersonalisedITP: calculatePersonalisedITP,
    evaluateCondition: evaluateCondition,
    evaluateRule: evaluateRule,
    fmtEUR: fmtEUR,
  };
});
