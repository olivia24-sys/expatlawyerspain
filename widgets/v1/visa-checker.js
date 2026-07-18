/*!
 * ExpatLawyerSpain visa-checker widget frame, v1.
 * Runs inside a sandboxed cross-origin iframe under a strict CSP
 * (default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'
 * data:; connect-src 'self'). No dependencies, ES2017+.
 *
 * Derived from js/visa-checker.js (the on-site /spain-visa-checker renderer).
 * The eligibility logic is unchanged - window.ELSEligibility does every
 * tri-state evaluation; window.ELS_ELIGIBILITY_VISA (the verified rule slice +
 * income figures) and window.ELS_VISA_COPY supply the data and copy. This file
 * only adapts the on-site renderer for frame life: query-param partner
 * attribution, absolute + UTM'd outbound ELS links opening in a new tab, and
 * postMessage resize/ready plumbing. Everything eligibility-related is
 * byte-for-byte the same behaviour as the page.
 *
 * SECURITY RULE: all rendering goes through document.createElement /
 * textContent / setAttribute / appendChild / createTextNode. Never innerHTML,
 * outerHTML, insertAdjacentHTML, document.write, eval, or template-string HTML.
 *
 * NO-FALSE-POSITIVE: the engine owns the nationality gate, the tri-state logic
 * and the outcome precedence. A missing answer is never "eligible". Draft rules
 * never evaluate unless the data module carries draftPreview (a --draft-local
 * preview build only, never shipped).
 */
(function () {
  'use strict';

  var RESIZE_DEBOUNCE_MS = 150;
  var ORIGIN = 'https://expatlawyerspain.com';

  // Outbound ELS destinations (absolute; UTM'd per partner at render time).
  var CTA_PRIMARY_URL = ORIGIN + '/immigration-lawyers-spain';
  var CTA_SECONDARY_URL = ORIGIN + '/#contact-form';

  // Frame plumbing state.
  var partnerValue = '';
  var resizeTimer = null;
  var firstRenderDone = false;

  // Set once boot() confirms the DOM and globals it needs exist.
  var data = null;
  var copyRoot = null;
  var copy = null;
  var engine = null;
  var gateBox = null;
  var questionsBox = null;
  var resultsBox = null;
  var groups = {};
  var previewOpts;

  // Running answer state (see js/visa-checker.js).
  var answers = {};

  // --- frame plumbing (postMessage to the loader, partner attribution) -------

  // Adds the ELS UTM set to a URL. A fragment (#...) is kept last so the query
  // is a real query string, not part of the fragment.
  function appendUtm(url) {
    var campaign = encodeURIComponent(partnerValue || 'unattributed');
    var utm = 'utm_source=els-widget&utm_medium=embed&utm_campaign=' + campaign;
    var hash = '';
    var hashAt = url.indexOf('#');
    if (hashAt !== -1) { hash = url.slice(hashAt); url = url.slice(0, hashAt); }
    var separator = url.indexOf('?') === -1 ? '?' : '&';
    return url + separator + utm + hash;
  }

  function postToParent(message) {
    try {
      if (window.parent === window) return;
      window.parent.postMessage(message, '*');
    } catch (e) {
      /* never throw into the host page */
    }
  }

  // True laid-out content height. body margin is 0 and padding is set in CSS,
  // so the body's bounding rect is the content height regardless of the frame's
  // current height; ceil avoids a sub-pixel under-report leaving a 1px scrollbar.
  function contentHeight() {
    return Math.ceil(document.body.getBoundingClientRect().height);
  }

  function postResize() {
    // A pre-layout measure reads 0; posting it would collapse the frame to the
    // loader's 100px floor and then jump back (the size flash). Never send a zero.
    var height = contentHeight();
    if (height > 0) postToParent({ els: 1, type: 'els:resize', height: height });
  }

  // Measure after the browser has laid out at least once.
  function postResizeAfterLayout() {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(postResize);
      });
    } else {
      postResize();
    }
  }

  function postReadyOnce() {
    if (firstRenderDone) return;
    firstRenderDone = true;
    postToParent({ els: 1, type: 'els:ready' });
    postResizeAfterLayout();
  }

  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(postResize, RESIZE_DEBOUNCE_MS);
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

  // GA4 cannot run in a cross-origin frame under connect-src 'self' (no
  // googletagmanager); attribution flows through the UTM'd outbound links to
  // expatlawyerspain.com instead. track() is a guarded no-op here on purpose.
  function track(eventName, params) {
    if (typeof gtag === 'function') gtag('event', eventName, params);
  }

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

  function parseNumber(raw) {
    var cleaned = String(raw).replace(/[^\d.]/g, '');
    if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return NaN;
    return parseFloat(cleaned);
  }

  // Outbound ELS link: absolute, UTM'd, opens in a new tab. Used for the CTAs.
  function elsLink(className, text, url) {
    var a = el('a', className, text);
    a.setAttribute('href', appendUtm(url));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    return a;
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
      if (!label) return;
      var lab = el('label', 'visa-gate-opt');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'visa-nationality';
      input.value = groupKey;
      if (answers.nationality === groupKey) input.checked = true;
      input.addEventListener('change', function () {
        if (!input.checked) return;
        answers = { nationality: groupKey };
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
    if (!spec) return null;
    if (spec.kind === 'yesNo') return questionYesNo(key, spec);
    if (spec.kind === 'number') return questionNumber(key, spec);
    if (spec.kind === 'select') return questionSelect(key, spec);
    return null;
  }

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

  function thresholdLine(threshold) {
    if (!threshold) return null;
    if ('totalFloor' in threshold) {
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

  // Display-only computed floor for a lawyer-route criterion referencing a spine
  // figure (the Blue Card salary floor). The number comes entirely from the
  // spine (figure value x displayMultiple); this file authors neither the euro
  // nor the multiple. It NEVER gates eligibility. Returns null unless both the
  // display config and the (verified, embedded) figure are present.
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
      // Official-source links (gov domains) open in a new tab; they are not ELS
      // destinations, so they carry no UTM.
      var a = el('a', null, ref.source.title);
      a.setAttribute('href', ref.source.url);
      a.setAttribute('rel', 'noopener');
      a.setAttribute('target', '_blank');
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
    var primary = elsLink('cta-btn visa-cta-primary', copy.cta.primaryLabel + ' →', CTA_PRIMARY_URL);
    primary.addEventListener('click', function () {
      track('visa_cta_click', { visa: result.id, target: 'immigration-lawyers-spain' });
    });
    actions.appendChild(primary);

    var secondary = elsLink('visa-cta-secondary', copy.cta.secondaryLabel + ' →', CTA_SECONDARY_URL);
    secondary.addEventListener('click', function () {
      track('visa_cta_click', { visa: result.id, target: 'contact-form' });
    });
    actions.appendChild(secondary);

    wrap.appendChild(actions);
    return wrap;
  }

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

    if (result.criteria && result.criteria.length) {
      card.appendChild(criteriaList(result));
    }

    var un = userNoteBlock(result);
    if (un) card.appendChild(un);

    var ns = nextStepsBlock(result);
    if (ns) card.appendChild(ns);

    var src = sourcesBlock(result);
    if (src) card.appendChild(src);

    card.appendChild(ctaBlock(result));

    return card;
  }

  function notNeededPanel(res) {
    var panel = el('div', 'visa-notneeded');
    panel.appendChild(el('h2', 'visa-notneeded-heading', copy.gateNotNeeded.heading));
    panel.appendChild(el('p', 'visa-notneeded-lead', copy.gateNotNeeded.lead));

    var notes = el('ul', 'visa-notneeded-notes');
    var seenNote = {};
    res.results.forEach(function (r) {
      if (r.outcome !== 'not-needed' || !r.applicabilityNote || seenNote[r.applicabilityNote]) return;
      seenNote[r.applicabilityNote] = true;
      notes.appendChild(el('li', null, r.applicabilityNote));
    });
    if (notes.childNodes.length) panel.appendChild(notes);

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
    });

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

  // Graceful empty: no verified routes to evaluate. Render the disclaimer and
  // the empty-state line only (never a draft "you qualify").
  function renderEmpty() {
    gateBox.textContent = '';
    questionsBox.textContent = '';
    questionsBox.hidden = true;
    resultsBox.textContent = '';
    resultsBox.appendChild(el('p', 'visa-empty', copy.emptyState));
    resultsBox.appendChild(disclaimerNode());
    resultsBox.hidden = false;
  }

  function rebuildAll() {
    buildGate();

    if (!answers.nationality) {
      questionsBox.textContent = '';
      questionsBox.hidden = true;
      resultsBox.textContent = '';
      resultsBox.hidden = true;
      postResize();
      return;
    }

    var res = engine.checkEligibility(data, answers, previewOpts);
    if (!res || !res.ok) {
      questionsBox.hidden = true;
      resultsBox.textContent = '';
      resultsBox.hidden = true;
      postResize();
      return;
    }

    renderQuestions(res.missingInputs || []);
    questionsBox.hidden = questionsBox.childNodes.length === 0;

    renderResults(res);
    trackCheck(res);
    postResize();
  }

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

  // --- boot -------------------------------------------------------------------

  function boot() {
    gateBox = document.getElementById('visa-checker-gate');
    questionsBox = document.getElementById('visa-checker-questions');
    resultsBox = document.getElementById('visa-checker-results');
    data = window.ELS_ELIGIBILITY_VISA;
    copyRoot = window.ELS_VISA_COPY;
    engine = window.ELSEligibility;
    if (!gateBox || !questionsBox || !resultsBox || !data || !copyRoot || !engine) return;

    copy = copyRoot.checker;
    if (!copy) return;

    // Set by --draft-local preview builds only; production embeds never carry it
    // (and contain no draft rules anyway). Belt-and-braces: harmless here.
    previewOpts = data.draftPreview === true ? { includeDrafts: true } : undefined;
    groups = data.nationalityGroups || {};

    // partnerValue must be set BEFORE any UTM is applied, or the CTA link would
    // be tagged 'unattributed'.
    var params = new URLSearchParams(window.location.search);
    partnerValue = params.get('partner') || '';

    // No verified routes: the honest empty state, then done (but still wire the
    // resize plumbing so the empty frame sizes correctly).
    if (!Array.isArray(data.rules) || data.rules.length === 0) {
      renderEmpty();
    } else {
      rebuildAll();
    }

    wireResize();
    postReadyOnce();
    scheduleReposts();
  }

  // Resize correctness, the same three-way cover the ITP frame uses:
  //   - window resize (debounced),
  //   - a ResizeObserver on the body (a revealed question or result reflows it),
  //   - window 'load' + document.fonts.ready re-posts, because the first layout
  //     in a sandboxed cross-origin frame can land after boot's rAF measure and
  //     the brand web fonts (font-display: swap) reflow the height late.
  function wireResize() {
    window.addEventListener('resize', onResize, false);
    window.addEventListener('load', postResize, false);
    if (typeof window.ResizeObserver === 'function') {
      try {
        var ro = new window.ResizeObserver(function () { onResize(); });
        ro.observe(document.body);
      } catch (e) { /* older engines: the schedule below still covers it */ }
    }
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(postResize);
    }
  }

  // The first layout in a sandboxed cross-origin frame can land after boot's rAF
  // measure. Re-post on a short unconditional schedule so a real height is sent
  // once the frame is laid out (this is what firm-directory.js gets for free
  // from its async fetch).
  function scheduleReposts() {
    [60, 180, 360, 700, 1200].forEach(function (ms) {
      window.setTimeout(postResize, ms);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
