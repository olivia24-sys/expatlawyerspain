/*
 * itp-calculator.js - UI wiring for /itp-calculator-spain
 * ---------------------------------------------------------------------------
 * No maths and no figures live here. The page embeds the verified spine
 * slice as window.ELS_LEGAL_DATA_ITP (build-tool-pages.js writes it), the
 * engine is window.ELSCalc (js/calc-engine.js), and this file only reads
 * the form, calls the engine and renders the result - breakdown lines,
 * source links and caveats - using textContent (never innerHTML with user
 * or data values).
 *
 * v2: the calculator ALWAYS calls calculatePersonalisedITP. The standard
 * result renders exactly as v1 (renderResult, byte-for-byte). Below it, a
 * collapsed "refine for your situation" section appears ONLY when the engine
 * reports something to refine (a missing input, an other-situation hint, a
 * relief applied, or reliefs ruled unavailable). Regions with no verified
 * relief data - and the current production build, which ships zero verified
 * reliefs - therefore behave exactly like v1: standard result, nothing else.
 * All refine copy comes from window.ELS_ITP_COPY (build-embedded); no user
 * string is authored here.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var form = document.getElementById('itp-form');
  var result = document.getElementById('itp-result');
  if (!form || !result || !window.ELSCalc || !window.ELS_LEGAL_DATA_ITP) return;

  var data = window.ELS_LEGAL_DATA_ITP;
  // Set by --allow-draft preview builds only; production embeds never carry
  // it (and contain no draft rules anyway). Lets Olivia walk the refine
  // flow on a preview before rules are verified.
  var previewOpts = data.draftPreview === true ? { includeDrafts: true } : undefined;
  var copy = window.ELS_ITP_COPY || null;
  var refineBox = document.getElementById('itp-refine');
  var fmtEUR = window.ELSCalc.fmtEUR;

  // Income cap condition types. When the ONLY thing withholding a relief is an
  // income cap and the buyer has said they do not file Spanish IRPF, we show
  // the "reliefs need Spanish tax history" line rather than an income question.
  var INCOME_TYPES = ['maxIncome', 'maxHouseholdIncome', 'maxSavingsIncome'];

  // Per-submit state.
  var current = null; // { region, price, propertyType }
  var buyer = {};
  var island = null;
  var refine = null; // DOM refs built once per submit

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function track(eventName, params) {
    if (typeof gtag === 'function') gtag('event', eventName, params);
  }

  function parsePrice(raw) {
    // Accept "350000", "350,000", "350 000", "350000.50".
    var cleaned = String(raw).replace(/[€\s,]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
    return parseFloat(cleaned);
  }

  function figureById(id) {
    for (var i = 0; i < data.figures.length; i++) {
      if (data.figures[i].id === id) return data.figures[i];
    }
    return null;
  }

  function renderError(msg) {
    result.textContent = '';
    result.appendChild(el('p', 'itp-error', msg));
    result.hidden = false;
  }

  // The working table: one row per line, plus a total row. Shared by the
  // standard render (v1, unchanged) and the personalised render.
  function breakdownTable(lines, total) {
    var table = el('table', 'cost-table itp-breakdown');
    var thead = el('thead');
    var hrow = el('tr');
    ['Step', 'Taxed amount', 'Tax'].forEach(function (h) {
      var th = el('th', null, h);
      th.setAttribute('scope', 'col');
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);
    var tbody = el('tbody');
    lines.forEach(function (line) {
      var tr = el('tr');
      tr.appendChild(el('td', null, line.label));
      tr.appendChild(el('td', null, fmtEUR(line.base)));
      tr.appendChild(el('td', null, fmtEUR(line.amount)));
      tbody.appendChild(tr);
    });
    var totalRow = el('tr', 'itp-breakdown-total');
    var totalLabel = el('th', null, 'Total');
    totalLabel.setAttribute('scope', 'row');
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(el('td', null, ''));
    totalRow.appendChild(el('td', null, fmtEUR(total)));
    tbody.appendChild(totalRow);
    table.appendChild(tbody);
    return table;
  }

  function renderResult(r) {
    result.textContent = '';

    var head = el('div', 'itp-total');
    head.appendChild(el('div', 'itp-total-label',
      (r.propertyType === 'resale' ? 'ITP due' : 'IVA + AJD due') + ' in ' + r.regionLabel));
    head.appendChild(el('div', 'itp-total-amount', fmtEUR(r.total)));
    head.appendChild(el('div', 'itp-total-rate',
      'Effective rate ' + r.effectiveRate + '% on ' + fmtEUR(r.price)));
    result.appendChild(head);

    // The working: one row per line.
    result.appendChild(breakdownTable(r.lines, r.total));

    // Case-specific caveats carried by the figures used.
    r.notes.forEach(function (note) {
      var box = el('div', 'callout itp-note');
      box.appendChild(el('p', null, note));
      result.appendChild(box);
    });

    // Sources: every figure used, linked.
    var src = el('div', 'itp-sources');
    src.appendChild(el('strong', null, 'Where these figures come from'));
    var ul = el('ul');
    r.figuresUsed.forEach(function (f) {
      var li = el('li');
      var a = el('a', null, f.source.title);
      a.href = f.source.url;
      a.rel = 'noopener';
      a.target = '_blank';
      li.appendChild(a);
      li.appendChild(document.createTextNode(
        ' (' + f.label + ', in force since ' + f.effectiveFrom + ')'));
      ul.appendChild(li);
    });
    src.appendChild(ul);
    result.appendChild(src);

    result.hidden = false;
  }

  // --- refine (relief personalisation) ---------------------------------------

  function ctaAnchor(label) {
    var a = el('a', 'cta-btn', label + ' ->');
    a.href = '/#contact-form';
    a.setAttribute('data-calc-cta', '');
    a.addEventListener('click', function () {
      track('calculator_cta_click', { calculator: 'itp' });
    });
    return a;
  }

  function tpl(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
    });
  }

  function decap(s) {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  // A yes/no radio pair bound to a buyer key. onPick(value) receives true/false.
  function yesNo(name, onPick) {
    var wrap = el('div', 'itp-refine-opts');
    [[copy.yes, true], [copy.no, false]].forEach(function (pair) {
      var lab = el('label');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(' ' + pair[0]));
      input.addEventListener('change', function () {
        if (input.checked) onPick(pair[1]);
      });
      wrap.appendChild(lab);
    });
    return wrap;
  }

  // Build the refine DOM once per submit. Returns a refs object.
  function buildRefine() {
    refineBox.textContent = '';
    var refs = { questions: [] };
    var regionLabel = (current && data.regions[current.region]) || '';

    var details = el('details', 'itp-refine-details');
    var summary = el('summary', 'itp-refine-summary', copy.heading);
    details.appendChild(summary);

    var body = el('div', 'itp-refine-body');
    body.appendChild(el('p', 'itp-refine-intro', copy.intro));

    // Gate: always first, always visible.
    var gate = el('fieldset', 'itp-refine-q itp-refine-gate');
    gate.appendChild(el('legend', null, copy.gate.label));
    gate.appendChild(yesNo('itp-gate', function (v) {
      buyer.mainHome = v;
      refresh();
    }));
    body.appendChild(gate);

    // Questions wrap (hidden until the gate is Yes and reliefs not unavailable).
    var qwrap = el('div', 'itp-refine-questions');
    refs.qwrap = qwrap;
    var Q = copy.questions;

    // age
    (function () {
      var q = el('div', 'itp-refine-q');
      q.appendChild(el('label', null, Q.age.label));
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'itp-field-input';
      input.setAttribute('inputmode', 'decimal');
      input.addEventListener('change', function () {
        var n = parseFloat(String(input.value).replace(/[^\d.]/g, ''));
        if (isFinite(n)) buyer.age = n; else delete buyer.age;
        refresh();
      });
      q.appendChild(input);
      refs.questions.push({ node: q, types: ['maxAge'] });
      qwrap.appendChild(q);
    })();

    // firstHome
    (function () {
      var q = el('fieldset', 'itp-refine-q');
      q.appendChild(el('legend', null, Q.firstHome.label));
      q.appendChild(yesNo('itp-firsthome', function (v) {
        buyer.firstHome = v;
        refresh();
      }));
      refs.questions.push({ node: q, types: ['firstHome'] });
      qwrap.appendChild(q);
    })();

    // ownsOtherHome - the inversion: Yes owns => ownsOtherHome = true. Feeds
    // both noPriorPropertyOwnership and priorHomeSaleWindow.
    (function () {
      var q = el('fieldset', 'itp-refine-q');
      q.appendChild(el('legend', null, Q.ownsOtherHome.label));
      q.appendChild(yesNo('itp-owns', function (v) {
        buyer.ownsOtherHome = v;
        refresh();
      }));
      refs.questions.push({ node: q, types: ['noPriorPropertyOwnership', 'priorHomeSaleWindow'] });
      qwrap.appendChild(q);
    })();

    // income (shared number field) + no-IRPF checkbox
    (function () {
      var q = el('div', 'itp-refine-q');
      q.appendChild(el('label', null, Q.income.label));
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'itp-field-input';
      input.setAttribute('inputmode', 'decimal');
      input.addEventListener('change', function () {
        var n = parseFloat(String(input.value).replace(/[^\d.]/g, ''));
        if (isFinite(n)) buyer.income = n; else delete buyer.income;
        refresh();
      });
      q.appendChild(input);

      var checkLab = el('label', 'itp-refine-check');
      var check = document.createElement('input');
      check.type = 'checkbox';
      checkLab.appendChild(check);
      checkLab.appendChild(document.createTextNode(' ' + Q.income.noIrpfLabel));
      check.addEventListener('change', function () {
        if (check.checked) buyer.noSpanishIncomeTax = true;
        else delete buyer.noSpanishIncomeTax;
        refresh();
      });
      q.appendChild(checkLab);
      refs.questions.push({ node: q, types: ['maxIncome', 'maxHouseholdIncome'] });
      qwrap.appendChild(q);
    })();

    // savingsIncome
    (function () {
      var q = el('div', 'itp-refine-q');
      q.appendChild(el('label', null, Q.savingsIncome.label));
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'itp-field-input';
      input.setAttribute('inputmode', 'decimal');
      input.addEventListener('change', function () {
        var n = parseFloat(String(input.value).replace(/[^\d.]/g, ''));
        if (isFinite(n)) buyer.savingsIncome = n; else delete buyer.savingsIncome;
        refresh();
      });
      q.appendChild(input);
      refs.questions.push({ node: q, types: ['maxSavingsIncome'] });
      qwrap.appendChild(q);
    })();

    // disability select
    (function () {
      var q = el('div', 'itp-refine-q');
      q.appendChild(el('label', null, Q.disability.label));
      var sel = document.createElement('select');
      sel.className = 'itp-field-input';
      [['', copy.choose], ['none', Q.disability.none], ['33to64', Q.disability.mid], ['65plus', Q.disability.high]]
        .forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0];
          opt.textContent = o[1];
          sel.appendChild(opt);
        });
      sel.addEventListener('change', function () {
        if (sel.value) buyer.disability = sel.value; else delete buyer.disability;
        refresh();
      });
      q.appendChild(sel);
      refs.questions.push({ node: q, types: ['disability'] });
      qwrap.appendChild(q);
    })();

    // family select -> largeFamily / singleParentFamily
    (function () {
      var q = el('div', 'itp-refine-q');
      q.appendChild(el('label', null, Q.family.label));
      var sel = document.createElement('select');
      sel.className = 'itp-field-input';
      [['', copy.choose], ['none', Q.family.none], ['large', Q.family.large], ['single', Q.family.single], ['both', Q.family.both]]
        .forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0];
          opt.textContent = o[1];
          sel.appendChild(opt);
        });
      sel.addEventListener('change', function () {
        var v = sel.value;
        if (v === 'none') { buyer.largeFamily = false; buyer.singleParentFamily = false; }
        else if (v === 'large') { buyer.largeFamily = true; buyer.singleParentFamily = false; }
        else if (v === 'single') { buyer.largeFamily = false; buyer.singleParentFamily = true; }
        else if (v === 'both') { buyer.largeFamily = true; buyer.singleParentFamily = true; }
        else { delete buyer.largeFamily; delete buyer.singleParentFamily; }
        refresh();
      });
      q.appendChild(sel);
      refs.questions.push({ node: q, types: ['largeFamily', 'singleParentFamily'] });
      qwrap.appendChild(q);
    })();

    // priorResidence yes/no -> priorRegionResidenceYears 3|0
    (function () {
      var q = el('fieldset', 'itp-refine-q');
      q.appendChild(el('legend', null, Q.priorResidence.label));
      q.appendChild(yesNo('itp-prior-res', function (v) {
        buyer.priorRegionResidenceYears = v ? 3 : 0;
        refresh();
      }));
      refs.questions.push({ node: q, types: ['priorRegionResidenceYears'] });
      qwrap.appendChild(q);
    })();

    // mortgageLtv yes/no -> mortgageLtvPercent 60|0
    (function () {
      var q = el('fieldset', 'itp-refine-q');
      q.appendChild(el('legend', null, Q.mortgageLtv.label));
      q.appendChild(yesNo('itp-ltv', function (v) {
        buyer.mortgageLtvPercent = v ? 60 : 0;
        refresh();
      }));
      refs.questions.push({ node: q, types: ['mortgageLtvMin'] });
      qwrap.appendChild(q);
    })();

    // island select -> top-level island
    (function () {
      var q = el('div', 'itp-refine-q');
      q.appendChild(el('label', null, Q.island.label));
      var sel = document.createElement('select');
      sel.className = 'itp-field-input';
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = copy.choose;
      sel.appendChild(opt0);
      Object.keys(Q.island.options).forEach(function (k) {
        var opt = document.createElement('option');
        opt.value = k;
        opt.textContent = Q.island.options[k];
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () {
        island = sel.value || null;
        refresh();
      });
      q.appendChild(sel);
      refs.questions.push({ node: q, types: ['maxPropertyValue'] });
      qwrap.appendChild(q);
    })();

    body.appendChild(qwrap);

    // Unavailable callout (holiday home / not living there).
    refs.unavailable = el('div', 'callout itp-refine-unavailable');
    refs.unavailable.appendChild(el('p', null, copy.unavailable));
    refs.unavailable.appendChild(ctaAnchor(copy.ctaBtn));
    refs.unavailable.hidden = true;
    body.appendChild(refs.unavailable);

    // No-IRPF callout.
    refs.noIrpf = el('div', 'callout itp-refine-noirpf');
    refs.noIrpf.appendChild(el('p', null, copy.noIrpf));
    refs.noIrpf.hidden = true;
    body.appendChild(refs.noIrpf);

    // Above-the-value-cap callout: reduced rates exist for the region but this
    // price is over their value limit, so only the standard rate applies.
    refs.aboveCap = el('div', 'callout itp-refine-abovecap');
    refs.aboveCap.appendChild(el('p', null, tpl(copy.aboveValueCap || '', { region: regionLabel })));
    refs.aboveCap.hidden = true;
    body.appendChild(refs.aboveCap);

    // No-relief callout: the buyer answered everything, no reduced rate applies,
    // and it is not a value-cap case. Gives feedback instead of a silent result.
    refs.noRelief = el('div', 'callout itp-refine-norelief');
    refs.noRelief.appendChild(el('p', null, tpl(copy.noRelief || '', { region: regionLabel })));
    refs.noRelief.hidden = true;
    body.appendChild(refs.noRelief);

    // Personalised panel (filled by applyRefineState).
    refs.panel = el('div', 'itp-refine-panel');
    refs.panel.hidden = true;
    body.appendChild(refs.panel);

    // Other-situation quiet line.
    refs.other = el('p', 'itp-refine-other');
    refs.other.appendChild(document.createTextNode(copy.otherSituation + ' '));
    var otherLink = el('a', null, copy.otherSituationLink);
    otherLink.href = '/property-lawyers-spain';
    refs.other.appendChild(otherLink);
    refs.other.hidden = true;
    body.appendChild(refs.other);

    details.appendChild(body);
    refineBox.appendChild(details);
    return refs;
  }

  // Render one condition as a plain-English "depends on" line.
  function condText(cond) {
    if (cond && Array.isArray(cond.anyOf)) {
      var parts = cond.anyOf.map(function (c) { return decap(condText(c)); });
      return copy.conditions.anyOfPrefix + parts.join(copy.conditions.anyOfJoin);
    }
    var C = copy.conditions;
    var rel = cond.inclusive === false ? C.relUnder : C.relAtMost;
    switch (cond.type) {
      case 'maxAge':
        return cond.inclusive === false
          ? tpl(C.maxAgeStrict, { value: cond.value })
          : tpl(C.maxAgeInclusive, { value: cond.value });
      case 'habitualResidence':
        return C.habitualResidence;
      case 'firstHome':
        return C.firstHome;
      case 'noPriorPropertyOwnership':
        return C.noPriorPropertyOwnership;
      case 'maxIncome':
        return tpl(C.maxIncome, { rel: rel, value: fmtEUR(cond.value), basis: cond.basis });
      case 'maxHouseholdIncome':
        return tpl(C.maxHouseholdIncome, { rel: rel, value: fmtEUR(cond.value), basis: cond.basis });
      case 'maxSavingsIncome':
        return tpl(C.maxSavingsIncome, { rel: rel, value: fmtEUR(cond.value), basis: cond.basis });
      case 'maxPropertyValue':
        if (cond.byIsland) {
          var cap = island != null ? cond.byIsland[island] : undefined;
          var islandLabel = island != null && copy.questions.island.options[island]
            ? copy.questions.island.options[island] : '';
          if (typeof cap === 'number') {
            return tpl(C.maxPropertyValueIsland, { value: fmtEUR(cap), island: islandLabel });
          }
          return C.maxPropertyValue.replace('{value}', '');
        }
        return tpl(C.maxPropertyValue, { value: fmtEUR(cond.value) });
      case 'disability':
        return (cond.value === null || cond.value === undefined)
          ? C.disabilityAny
          : tpl(C.disabilityMin, { value: cond.value });
      case 'largeFamily':
        return C.largeFamily;
      case 'singleParentFamily':
        return C.singleParentFamily;
      case 'priorRegionResidenceYears':
        return tpl(C.priorRegionResidenceYears, { value: cond.value });
      case 'mortgageLtvMin':
        return tpl(C.mortgageLtvMin, { value: cond.value });
      case 'priorHomeSaleWindow':
        return C.priorHomeSaleWindow;
      default:
        return C.other;
    }
  }

  function taxNameFor() {
    if (current.propertyType === 'resale') return copy.taxNames.resale;
    if (current.region === 'canarias') return copy.taxNames.newBuildCanarias;
    return copy.taxNames.newBuild;
  }

  // Fill the personalised panel from a relief-applied result.
  function fillPanel(r) {
    var panel = refine.panel;
    panel.textContent = '';
    var p = r.personalised;
    var cmp = r.comparison;

    var labels = p.appliedReliefs.map(function (x) { return x.label; }).join(copy.labelJoin);
    var headline = el('div', 'itp-refine-headline');
    headline.appendChild(el('p', null, tpl(copy.appliedHeadline, {
      label: labels,
      taxName: taxNameFor(),
      yourTotal: fmtEUR(cmp.yourTotal),
      standardTotal: fmtEUR(cmp.standardTotal),
      saving: fmtEUR(cmp.saving),
    })));
    panel.appendChild(headline);

    // Breakdown table (negative amounts render as reductions via fmtEUR minus).
    panel.appendChild(breakdownTable(p.lines, p.total));

    // Personalised notes as callouts.
    p.notes.forEach(function (note) {
      var box = el('div', 'callout itp-note');
      box.appendChild(el('p', null, note));
      panel.appendChild(box);
    });

    // "This depends on" list. Per-relief grouping when more than one relief.
    var depends = el('div', 'itp-refine-depends');
    depends.appendChild(el('strong', null, copy.dependsOnHeading));
    var multi = p.appliedReliefs.length > 1;
    p.appliedReliefs.forEach(function (rel) {
      if (multi) depends.appendChild(el('div', 'itp-refine-depends-label', rel.label));
      var ul = el('ul');
      (rel.conditions || []).forEach(function (c) {
        ul.appendChild(el('li', null, condText(c)));
      });
      depends.appendChild(ul);
    });
    panel.appendChild(depends);

    // Sources: every applied relief, deduped by URL, v1 style.
    var src = el('div', 'itp-sources');
    src.appendChild(el('strong', null, copy.sourcesHeading));
    var ul = el('ul');
    var seen = {};
    p.appliedReliefs.forEach(function (rel) {
      if (!rel.source || seen[rel.source.url]) return;
      seen[rel.source.url] = true;
      var li = el('li');
      var a = el('a', null, rel.source.title);
      a.href = rel.source.url;
      a.rel = 'noopener';
      a.target = '_blank';
      li.appendChild(a);
      li.appendChild(document.createTextNode(
        ' (' + rel.label + ', in force since ' + rel.effectiveFrom + ')'));
      ul.appendChild(li);
    });
    src.appendChild(ul);
    panel.appendChild(src);

    // Close + CTA.
    panel.appendChild(el('p', 'itp-refine-close', copy.appliedClose));
    panel.appendChild(ctaAnchor(copy.ctaBtn));
  }

  // Show/hide questions and panels from the latest engine result.
  function applyRefineState(r) {
    var missing = r.missingInputs || [];

    if (r.reliefStatus === 'reliefs-unavailable') {
      refine.qwrap.hidden = true;
      refine.unavailable.hidden = false;
      refine.noIrpf.hidden = true;
      refine.aboveCap.hidden = true;
      refine.noRelief.hidden = true;
      refine.panel.hidden = true;
      refine.other.hidden = !r.otherSituationHint;
      return;
    }

    // Gate answered Yes (or not yet answered "no"): show the questions.
    refine.unavailable.hidden = true;
    refine.qwrap.hidden = !(buyer.mainHome === true);

    // Per-question visibility: answered already, or its type is being asked.
    refine.questions.forEach(function (q) {
      var asked = q.types.some(function (t) { return missing.indexOf(t) !== -1; });
      q.node.hidden = !asked;
    });

    // No-IRPF message: only when income caps are the sole thing left unknown
    // and the buyer said they do not file IRPF.
    var incomeOnly = missing.length > 0 && missing.every(function (t) {
      return INCOME_TYPES.indexOf(t) !== -1;
    });
    refine.noIrpf.hidden = !(buyer.noSpanishIncomeTax === true &&
      r.reliefStatus === 'standard-only' && incomeOnly);

    // Applied panel.
    var applied = r.reliefStatus === 'relief-applied' && r.personalised;
    if (applied) {
      fillPanel(r);
      refine.panel.hidden = false;
    } else {
      refine.panel.hidden = true;
    }

    // Verdict once the buyer has said "main home", no relief applied and there
    // is nothing left to ask: explain WHY the standard rate stands rather than
    // leave the result blank. Value-cap case first, generic no-relief otherwise.
    var settled = buyer.mainHome === true && !applied && missing.length === 0 &&
      r.reliefStatus === 'standard-only';
    refine.aboveCap.hidden = !(settled && r.aboveValueCap === true && !!copy.aboveValueCap);
    refine.noRelief.hidden = !(settled && r.aboveValueCap !== true && !!copy.noRelief);

    // Other-situation quiet line.
    refine.other.hidden = !r.otherSituationHint;
  }

  // Re-run the engine with the current buyer answers and re-render refine.
  function refresh() {
    if (!current) return;
    var r = window.ELSCalc.calculatePersonalisedITP(data, {
      region: current.region,
      price: current.price,
      propertyType: current.propertyType,
      island: island,
      buyer: buyer,
    }, previewOpts);
    if (r.ok) applyRefineState(r);
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();

    // Reset per-submit state.
    buyer = {};
    island = null;
    refine = null;
    if (refineBox) {
      refineBox.textContent = '';
      refineBox.hidden = true;
    }

    var region = form.querySelector('#itp-region').value;
    var typeInput = form.querySelector('input[name="itp-type"]:checked');
    var propertyType = typeInput ? typeInput.value : '';
    var price = parsePrice(form.querySelector('#itp-price').value);

    var r = window.ELSCalc.calculatePersonalisedITP(data, {
      region: region,
      price: price,
      propertyType: propertyType,
      island: null,
      buyer: {},
    }, previewOpts);

    track('calculator_use', {
      calculator: 'itp',
      region: region || '(none)',
      property_type: propertyType || '(none)',
      result: r.ok ? 'ok' : r.error,
    });

    if (r.ok) {
      current = { region: region, price: price, propertyType: propertyType };
      renderResult(r.standard);

      var show = copy && refineBox && (
        (r.missingInputs && r.missingInputs.length) ||
        r.otherSituationHint ||
        r.aboveValueCap ||
        r.reliefStatus === 'relief-applied' ||
        r.reliefStatus === 'reliefs-unavailable'
      );
      if (show) {
        refine = buildRefine();
        applyRefineState(r);
        refineBox.hidden = false;
      }
      return;
    }

    current = null;

    if (r.error === 'invalid-price') {
      renderError('Enter the purchase price in euros, for example 350,000.');
    } else if (r.error === 'unknown-region' || r.error === 'invalid-property-type') {
      renderError('Choose a region and whether the property is a resale or a new build.');
    } else if (r.error === 'iva-not-applicable') {
      renderError(
        'New builds in ' + (data.regions[region] || region) + ' pay IPSI instead of mainland IVA. ' +
        'We have not yet verified that rate, so this calculator will not guess it. ' +
        'The resale calculation for the region works normally.'
      );
    } else if (r.error === 'figure-missing') {
      var iva = figureById('itp.national.new-build-iva');
      renderError(
        'New builds here pay IVA' + (iva ? ' at ' + iva.value + '%' : '') +
        ' plus AJD stamp duty, and we have not yet verified this region\'s current AJD rate against its official source. ' +
        'Rather than guess, the calculator leaves it out. The resale calculation works normally.'
      );
    } else {
      renderError('Something went wrong with that calculation. Refresh the page and try again.');
    }
  });

  // CTA instrumentation: measure whether the tool drives enquiries. Static
  // CTAs on the page; the dynamic refine CTAs wire their own listener.
  document.querySelectorAll('[data-calc-cta]').forEach(function (a) {
    a.addEventListener('click', function () {
      track('calculator_cta_click', { calculator: 'itp' });
    });
  });
})();
