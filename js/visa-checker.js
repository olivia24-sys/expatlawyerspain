/*
 * visa-checker.js - UI wiring for /spain-visa-checker
 * ---------------------------------------------------------------------------
 * No eligibility logic, no thresholds, no visa knowledge lives here. This
 * file reads two embeds the page build provides, calls the shared engine on
 * every answer change, and renders the result with textContent only (never
 * innerHTML). It is the visa-page counterpart of js/itp-calculator.js.
 *
 * THE TWO EMBEDS (build writes both as <script> globals):
 *
 *   window.ELS_ELIGIBILITY_VISA = {
 *     rules,             the shippable (or, in preview, draft) visa rules
 *     figures,           the income-reference figures thresholds anchor to
 *     conditionTypes,    { askable, lawyerRoute } - passed straight to the
 *                        engine so it can tell lawyer-route criteria apart
 *     nationalityGroups, { groupKey: label } - the four gate options
 *     draftPreview?      true only on an --allow-draft preview build
 *   }
 *
 *   window.ELS_VISA_COPY = tools/visa-checker-copy.js .checker slice, plus
 *     the fold. The full shape is documented at the top of
 *     tools/visa-checker-copy.js. This file reads only copy.checker.* .
 *
 * DOM the page build provides (this file fills them, builds nothing outside):
 *   #visa-checker-gate      the nationality gate mounts here
 *   #visa-checker-questions the progressive questions mount here
 *   #visa-checker-results   the result cards mount here (aria-live polite)
 *
 * ENGINE CALL: on every answer change,
 *   ELSEligibility.checkEligibility(
 *     data, answers,
 *     data.draftPreview === true ? { includeDrafts: true } : undefined)
 * The engine owns the nationality gate, the tri-state logic and the outcome
 * precedence; this file only reads answers and paints results.
 *
 * PROGRESSIVE QUESTIONS: the union of every result's missingInputs, minus
 * 'nationality' (the gate owns that), rendered in the FIXED priority order in
 * copy.checker.questionOrder. A question is never rendered unless the engine
 * is asking for its answer key. Answered questions stay visible with their
 * value selected. Re-render on every change.
 *
 * GRACEFUL EMPTY: zero rules in the embed (production with nothing verified,
 * which the build refuses to ship) renders only the disclaimer + empty line.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var data = window.ELS_ELIGIBILITY_VISA;
  var copyRoot = window.ELS_VISA_COPY;
  var engine = window.ELSEligibility;
  var gateBox = document.getElementById('visa-checker-gate');
  var questionsBox = document.getElementById('visa-checker-questions');
  var resultsBox = document.getElementById('visa-checker-results');

  if (!data || !copyRoot || !engine || !gateBox || !questionsBox || !resultsBox) return;

  var copy = copyRoot.checker;
  if (!copy) return;

  var previewOpts = data.draftPreview === true ? { includeDrafts: true } : undefined;
  var groups = data.nationalityGroups || {};

  // Running answer state. nationality is set by the gate; every other key by
  // a progressive question. dependants and the euro amounts are numbers; the
  // yes/no keys are booleans; unanswered keys are simply absent.
  var answers = {};

  // Graceful empty: no verified routes to evaluate. Render nothing but the
  // standing disclaimer and the empty-state line.
  if (!Array.isArray(data.rules) || data.rules.length === 0) {
    gateBox.textContent = '';
    questionsBox.textContent = '';
    resultsBox.textContent = '';
    resultsBox.appendChild(el('p', 'visa-empty', copy.emptyState));
    resultsBox.appendChild(disclaimerNode());
    resultsBox.hidden = false;
    return;
  }

  // --- tiny DOM helpers (textContent only, never innerHTML) ------------------

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function tpl(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
    });
  }

  function track(eventName, params) {
    if (typeof gtag === 'function') gtag('event', eventName, params);
  }

  // Euro formatting, mirroring the ITP page house style (e.g. "€2,442").
  // Cents are shown only when the figure genuinely has them (€3,357.75):
  // rounding a legal floor would misstate it in one direction or the other.
  function fmtEUR(amount) {
    if (typeof amount !== 'number' || !isFinite(amount)) return '';
    var whole = Math.floor(amount);
    var cents = Math.round((amount - whole) * 100);
    if (cents === 100) { whole += 1; cents = 0; }
    var s = '€' + whole.toLocaleString('en-GB');
    if (!cents) return s;
    return s + '.' + (cents < 10 ? '0' + cents : String(cents));
  }

  function disclaimerNode() {
    return el('p', 'visa-disclaimer', copy.disclaimer);
  }

  // Read a numeric field: strip anything but digits and one dot.
  function parseNumber(raw) {
    var cleaned = String(raw).replace(/[^\d.]/g, '');
    if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return NaN;
    return parseFloat(cleaned);
  }

  // --- the gate: nationality, always first, alone until answered -------------

  function buildGate() {
    gateBox.textContent = '';
    var fs = el('fieldset', 'visa-gate');
    fs.appendChild(el('legend', 'visa-gate-legend', copy.gate.legend));
    if (copy.gate.help) fs.appendChild(el('p', 'visa-gate-help', copy.gate.help));

    var opts = el('div', 'visa-gate-opts');
    copy.gate.optionOrder.forEach(function (groupKey) {
      var label = groups[groupKey];
      if (!label) return; // only render groups the embed knows
      var lab = el('label', 'visa-gate-opt');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'visa-nationality';
      input.value = groupKey;
      if (answers.nationality === groupKey) input.checked = true;
      input.addEventListener('change', function () {
        if (!input.checked) return;
        answers = { nationality: groupKey }; // a new nationality resets the rest
        rebuildAll();
      });
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(' ' + label));
      opts.appendChild(lab);
    });
    fs.appendChild(opts);
    gateBox.appendChild(fs);
  }

  // --- progressive questions -------------------------------------------------

  // A yes/no fieldset bound to a boolean answer key.
  function questionYesNo(key, spec) {
    var fs = el('fieldset', 'visa-q visa-q-yesno');
    fs.appendChild(el('legend', 'visa-q-legend', spec.legend));
    if (spec.help) fs.appendChild(el('p', 'visa-q-help', spec.help));
    var opts = el('div', 'visa-q-opts');
    [[spec.yes || copy.yes, true], [spec.no || copy.no, false]].forEach(function (pair) {
      var lab = el('label', 'visa-q-opt');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'visa-q-' + key;
      if (answers[key] === pair[1]) input.checked = true;
      input.addEventListener('change', function () {
        if (input.checked) { answers[key] = pair[1]; rebuildAll(); }
      });
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(' ' + pair[0]));
      opts.appendChild(lab);
    });
    fs.appendChild(opts);
    return fs;
  }

  // A number input bound to a numeric answer key.
  function questionNumber(key, spec) {
    var wrap = el('div', 'visa-q visa-q-number');
    var lab = el('label', 'visa-q-label', spec.label);
    lab.setAttribute('for', 'visa-input-' + key);
    wrap.appendChild(lab);
    if (spec.help) wrap.appendChild(el('p', 'visa-q-help', spec.help));

    var row = el('div', 'visa-q-input-row');
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'visa-input-' + key;
    input.className = 'visa-field-input';
    input.setAttribute('inputmode', 'decimal');
    if (spec.placeholder) input.placeholder = spec.placeholder;
    if (typeof answers[key] === 'number') input.value = String(answers[key]);
    input.addEventListener('change', function () {
      var n = parseNumber(input.value);
      if (isFinite(n)) answers[key] = n; else delete answers[key];
      rebuildAll();
    });
    row.appendChild(input);
    if (spec.unit) row.appendChild(el('span', 'visa-q-unit', spec.unit));
    wrap.appendChild(row);
    return wrap;
  }

  // A select bound to a string answer key (present in the copy shape; no
  // current spine question uses it, but the checker honours it).
  function questionSelect(key, spec) {
    var wrap = el('div', 'visa-q visa-q-select');
    var lab = el('label', 'visa-q-label', spec.legend || spec.label);
    lab.setAttribute('for', 'visa-input-' + key);
    wrap.appendChild(lab);
    if (spec.help) wrap.appendChild(el('p', 'visa-q-help', spec.help));
    var sel = document.createElement('select');
    sel.id = 'visa-input-' + key;
    sel.className = 'visa-field-input';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = copy.choose;
    sel.appendChild(placeholder);
    (spec.options || []).forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (answers[key] === o.value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      if (sel.value) answers[key] = sel.value; else delete answers[key];
      rebuildAll();
    });
    wrap.appendChild(sel);
    return wrap;
  }

  function buildQuestion(key) {
    var spec = copy.questions[key];
    if (!spec) return null; // no spec means the build is broken; render nothing
    if (spec.kind === 'yesNo') return questionYesNo(key, spec);
    if (spec.kind === 'number') return questionNumber(key, spec);
    if (spec.kind === 'select') return questionSelect(key, spec);
    return null;
  }

  // Render the union of missingInputs, in the fixed priority order, skipping
  // 'nationality' (the gate owns it). A key the engine is not asking for is
  // never rendered.
  function renderQuestions(missingUnion) {
    questionsBox.textContent = '';
    var wanted = {};
    missingUnion.forEach(function (k) { if (k !== 'nationality') wanted[k] = true; });

    copy.questionOrder.forEach(function (key) {
      if (!wanted[key]) return;
      var node = buildQuestion(key);
      if (node) questionsBox.appendChild(node);
    });
  }

  // --- result cards ----------------------------------------------------------

  function criterionMarker(state) {
    if (state === 'met') return copy.outcomes.criterionMet;
    if (state === 'not-met') return copy.outcomes.criterionNotMet;
    return copy.outcomes.criterionUnknown;
  }

  // The computed euro line for an income/savings criterion. The number comes
  // entirely from result.criteria[].threshold; this file never authors one.
  function thresholdLine(threshold) {
    if (!threshold) return null;
    if ('totalFloor' in threshold) {
      // total is null while the family count is unanswered: show the floor,
      // worded as the floor, never as "your situation".
      if (typeof threshold.total === 'number') {
        return tpl(copy.outcomes.thresholdTotal, { amount: fmtEUR(threshold.total) });
      }
      if (typeof threshold.totalFloor !== 'number') return null;
      var totalTpl = threshold.dependantsMatter
        ? copy.outcomes.thresholdTotalFloor : copy.outcomes.thresholdTotal;
      return tpl(totalTpl, { amount: fmtEUR(threshold.totalFloor) });
    }
    if (typeof threshold.monthly === 'number') {
      return tpl(copy.outcomes.thresholdMonthly, { amount: fmtEUR(threshold.monthly) });
    }
    if (typeof threshold.monthlyFloor !== 'number') return null;
    var monthlyTpl = threshold.dependantsMatter
      ? copy.outcomes.thresholdMonthlyFloor : copy.outcomes.thresholdMonthly;
    return tpl(monthlyTpl, { amount: fmtEUR(threshold.monthlyFloor) });
  }

  // Display-only computed floor for a lawyer-route criterion that references a
  // spine figure (the Blue Card salary floor). The number comes entirely from
  // the spine - figure value x the criterion's displayMultiple - so this file
  // authors neither the euro nor the multiple. It NEVER gates eligibility (the
  // criterion stays a lawyer-route and evaluates as unknown); it only shows the
  // applicant the current bar. Returns null unless BOTH the criterion's display
  // config and the (verified, embedded) figure are present, so a verified-only
  // build that has not embedded the figure simply shows nothing.
  var displayFloorByCritId = null;
  function buildDisplayFloorIndex() {
    displayFloorByCritId = {};
    var figs = {};
    (data.figures || []).forEach(function (f) { figs[f.id] = f; });
    (data.rules || []).forEach(function (rule) {
      (rule.criteria || []).forEach(function (entry) {
        var leaves = entry && entry.anyOf ? entry.anyOf : [entry];
        leaves.forEach(function (c) {
          if (!c || !c.figureId || typeof c.displayMultiple !== 'number') return;
          var fig = figs[c.figureId];
          if (!fig || typeof fig.value !== 'number') return;
          displayFloorByCritId[c.id] = {
            amount: Math.round(fig.value * c.displayMultiple * 100) / 100,
            multiple: c.displayMultiple,
          };
        });
      });
    });
  }
  function displayFloorLine(critId) {
    if (displayFloorByCritId === null) buildDisplayFloorIndex();
    var d = displayFloorByCritId[critId];
    if (!d) return null;
    return tpl(copy.outcomes.salaryFloorLine, { amount: fmtEUR(d.amount), multiple: d.multiple });
  }

  function criteriaList(result) {
    var ul = el('ul', 'visa-criteria');
    result.criteria.forEach(function (c) {
      var li = el('li', 'visa-criterion visa-criterion-' + c.state);
      li.appendChild(el('span', 'visa-criterion-marker', criterionMarker(c.state)));
      li.appendChild(el('span', 'visa-criterion-label', c.label));
      var tline = thresholdLine(c.threshold);
      if (tline) li.appendChild(el('p', 'visa-criterion-threshold', tline));
      var dline = displayFloorLine(c.id);
      if (dline) li.appendChild(el('p', 'visa-criterion-threshold', dline));
      if (c.userNote) li.appendChild(el('p', 'visa-criterion-note', c.userNote));
      ul.appendChild(li);
    });
    return ul;
  }

  // Missing-inputs in plain words, from the copy question specs.
  function missingWords(result) {
    var ul = el('ul', 'visa-missing');
    result.missingInputs.forEach(function (key) {
      if (key === 'nationality') return;
      var spec = copy.questions[key];
      var text = spec ? (spec.legend || spec.label) : key;
      ul.appendChild(el('li', null, text));
    });
    return ul;
  }

  function nextStepsBlock(result) {
    if (!result.nextSteps || !result.nextSteps.length) return null;
    var wrap = el('div', 'visa-nextsteps');
    wrap.appendChild(el('strong', null, copy.outcomes.nextStepsHeading));
    var ol = el('ol');
    result.nextSteps.forEach(function (s) { ol.appendChild(el('li', null, s)); });
    wrap.appendChild(ol);
    return wrap;
  }

  function userNoteBlock(result) {
    if (!result.userNote) return null;
    var box = el('div', 'callout visa-usernote');
    box.appendChild(el('strong', null, copy.outcomes.userNoteHeading));
    box.appendChild(el('p', null, result.userNote));
    return box;
  }

  // Sources: every criterion's source, deduped by URL, plus the rule's own.
  // Each carries a "figures checked" provenance line from its dates.
  function sourcesBlock(result) {
    var seen = {};
    var refs = [];
    function add(ref) {
      if (!ref || !ref.source || !ref.source.url || seen[ref.source.url]) return;
      seen[ref.source.url] = true;
      refs.push(ref);
    }
    add(result.sourceRef);
    result.criteria.forEach(function (c) { add(c.sourceRef); });
    if (!refs.length) return null;

    var wrap = el('div', 'visa-sources');
    wrap.appendChild(el('strong', null, copy.outcomes.sourcesHeading));
    var ul = el('ul');
    refs.forEach(function (ref) {
      var li = el('li');
      var a = el('a', null, ref.source.title);
      a.href = ref.source.url;
      a.rel = 'noopener';
      a.target = '_blank';
      li.appendChild(a);
      if (ref.effectiveFrom && ref.reviewBy) {
        li.appendChild(el('p', 'visa-figures-checked', tpl(copy.outcomes.figuresChecked, {
          from: ref.effectiveFrom,
          accessed: ref.source.accessed || ref.effectiveFrom,
          review: ref.reviewBy,
        })));
      }
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    return wrap;
  }

  function ctaBlock(result) {
    var wrap = el('div', 'visa-cta');
    wrap.appendChild(el('strong', 'visa-cta-heading', copy.cta.heading));
    wrap.appendChild(el('p', null, copy.cta.text));

    var actions = el('div', 'visa-cta-actions');
    var primary = el('a', 'cta-btn visa-cta-primary', copy.cta.primaryLabel + ' ->');
    primary.href = '/immigration-lawyers-spain';
    primary.addEventListener('click', function () {
      track('visa_cta_click', { visa: result.id, target: 'immigration-lawyers-spain' });
    });
    actions.appendChild(primary);

    var secondary = el('a', 'visa-cta-secondary', copy.cta.secondaryLabel + ' ->');
    secondary.href = '/#contact-form';
    secondary.addEventListener('click', function () {
      track('visa_cta_click', { visa: result.id, target: 'contact-form' });
    });
    actions.appendChild(secondary);

    wrap.appendChild(actions);
    return wrap;
  }

  // One visa card. `group` is the outcome bucket it landed in.
  function resultCard(result, group) {
    var card = el('article', 'visa-card visa-card-' + group);

    var header = el('div', 'visa-card-head');
    header.appendChild(el('h3', 'visa-card-label', result.label));
    if (result.officialName) {
      header.appendChild(el('p', 'visa-card-official',
        copy.outcomes.officialNamePrefix + ' ' + result.officialName + '.'));
    }
    card.appendChild(header);

    if (result.summary) card.appendChild(el('p', 'visa-card-summary', result.summary));

    // The honest outcome line per group.
    if (group === 'eligible') {
      card.appendChild(el('p', 'visa-outcome-line', copy.outcomes.eligibleLine));
    } else if (group === 'need-more-info') {
      if (result.missingInputs && result.missingInputs.filter(function (k) {
        return k !== 'nationality';
      }).length) {
        card.appendChild(el('p', 'visa-outcome-line', copy.outcomes.needInfoLine));
        card.appendChild(missingWords(result));
      }
      if (result.lawyerRoute) {
        card.appendChild(el('p', 'visa-lawyer-route', copy.outcomes.lawyerRouteLine));
      }
    } else if (group === 'not-eligible') {
      card.appendChild(el('p', 'visa-outcome-line', copy.outcomes.notEligibleLine));
    }

    // Criteria, met/not-met/unknown, with computed thresholds.
    if (result.criteria && result.criteria.length) {
      card.appendChild(criteriaList(result));
    }

    var un = userNoteBlock(result);
    if (un) card.appendChild(un);

    var ns = nextStepsBlock(result);
    if (ns) card.appendChild(ns);

    var src = sourcesBlock(result);
    if (src) card.appendChild(src);

    // CTA on every actionable card (not the "not-needed" ones).
    card.appendChild(ctaBlock(result));

    return card;
  }

  // The EEA/Swiss "you don't need a visa" panel. Uses each rule's
  // applicabilityNote plus the eu-registration rule if the data carries one.
  function notNeededPanel(res) {
    var panel = el('div', 'visa-notneeded');
    panel.appendChild(el('h2', 'visa-notneeded-heading', copy.gateNotNeeded.heading));
    panel.appendChild(el('p', 'visa-notneeded-lead', copy.gateNotNeeded.lead));

    // Any per-rule honest note (e.g. "you register as an EU resident instead").
    var notes = el('ul', 'visa-notneeded-notes');
    var seenNote = {};
    res.results.forEach(function (r) {
      if (r.outcome !== 'not-needed' || !r.applicabilityNote || seenNote[r.applicabilityNote]) return;
      seenNote[r.applicabilityNote] = true;
      notes.appendChild(el('li', null, r.applicabilityNote));
    });
    if (notes.childNodes.length) panel.appendChild(notes);

    // The EU-registration route, if it exists in the data (an 'applies' rule
    // for eea-swiss). It renders as the honest "what you do instead" card.
    var euReg = res.results.find(function (r) {
      return /eu-registration/.test(r.id) && r.applicability === 'applies';
    });
    if (euReg) {
      panel.appendChild(el('h3', 'visa-notneeded-register', copy.gateNotNeeded.registerHeading));
      panel.appendChild(resultCard(euReg, mapOutcomeToGroup(euReg.outcome)));
    }
    return panel;
  }

  function mapOutcomeToGroup(outcome) {
    if (outcome === 'eligible') return 'eligible';
    if (outcome === 'need-more-info') return 'need-more-info';
    if (outcome === 'not-eligible') return 'not-eligible';
    return 'not-needed';
  }

  function groupSection(def, cards) {
    if (!cards.length) return null;
    var section = el('section', 'visa-group');
    section.appendChild(el('h2', 'visa-group-heading', def.heading));
    if (def.blurb) section.appendChild(el('p', 'visa-group-blurb', def.blurb));
    cards.forEach(function (c) { section.appendChild(c); });
    return section;
  }

  // --- render orchestration --------------------------------------------------

  function renderResults(res) {
    resultsBox.textContent = '';

    // EEA/Swiss: the honest no-visa path, and nothing else.
    if (res.nationality === 'eea-swiss') {
      resultsBox.appendChild(notNeededPanel(res));
      resultsBox.appendChild(disclaimerNode());
      resultsBox.hidden = false;
      return;
    }

    var buckets = { eligible: [], needInfo: [], notEligible: [], notNeeded: [] };
    res.results.forEach(function (r) {
      if (r.outcome === 'eligible') buckets.eligible.push(resultCard(r, 'eligible'));
      else if (r.outcome === 'need-more-info') buckets.needInfo.push(resultCard(r, 'need-more-info'));
      else if (r.outcome === 'not-eligible') buckets.notEligible.push(resultCard(r, 'not-eligible'));
      else if (r.outcome === 'not-needed') buckets.notNeeded.push(resultCard(r, 'not-needed'));
      // 'not-applicable' routes are simply not shown: they do not exist for
      // this person, so surfacing them would only add noise.
    });

    // Fixed group order: eligible, need-info, not-eligible, not-needed.
    [
      [copy.groups.eligible, buckets.eligible],
      [copy.groups.needInfo, buckets.needInfo],
      [copy.groups.notEligible, buckets.notEligible],
      [copy.groups.notNeeded, buckets.notNeeded],
    ].forEach(function (pair) {
      var section = groupSection(pair[0], pair[1]);
      if (section) resultsBox.appendChild(section);
    });

    resultsBox.appendChild(disclaimerNode());
    resultsBox.hidden = false;
  }

  // Re-evaluate and repaint everything from the current answers.
  function rebuildAll() {
    buildGate();

    // Before the gate is answered, ask nothing and show nothing.
    if (!answers.nationality) {
      questionsBox.textContent = '';
      questionsBox.hidden = true;
      resultsBox.textContent = '';
      resultsBox.hidden = true;
      return;
    }

    var res = engine.checkEligibility(data, answers, previewOpts);
    if (!res || !res.ok) {
      // Bad input never throws in the engine; if it ever returns not-ok,
      // fail quietly rather than render a broken page.
      questionsBox.hidden = true;
      resultsBox.textContent = '';
      resultsBox.hidden = true;
      return;
    }

    // EEA/Swiss goes straight to the no-visa panel, but keeps any questions
    // the EU-registration route is asking (work / means) - the panel renders
    // that route's card, so its questions must be answerable too.
    renderQuestions(res.missingInputs || []);
    questionsBox.hidden = questionsBox.childNodes.length === 0;

    renderResults(res);
    trackCheck(res);
  }

  // GA4: one visa_check per full evaluation after the gate.
  function trackCheck(res) {
    var eligible = 0, needInfo = 0;
    res.results.forEach(function (r) {
      if (r.outcome === 'eligible') eligible++;
      else if (r.outcome === 'need-more-info') needInfo++;
    });
    track('visa_check', {
      nationality: res.nationality || '(none)',
      eligible_count: eligible,
      needinfo_count: needInfo,
    });
  }

  // First paint: the gate, alone.
  rebuildAll();
})();
