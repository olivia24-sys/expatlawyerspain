/*
 * itp-calculator.js - UI wiring for /itp-calculator-spain
 * ---------------------------------------------------------------------------
 * No maths and no figures live here. The page embeds the verified spine
 * slice as window.ELS_LEGAL_DATA_ITP (build-tool-pages.js writes it), the
 * engine is window.ELSCalc (js/calc-engine.js), and this file only reads
 * the form, calls the engine and renders the result - breakdown lines,
 * source links and caveats - using textContent (never innerHTML with user
 * or data values).
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var form = document.getElementById('itp-form');
  var result = document.getElementById('itp-result');
  if (!form || !result || !window.ELSCalc || !window.ELS_LEGAL_DATA_ITP) return;

  var data = window.ELS_LEGAL_DATA_ITP;

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

  function renderResult(r) {
    result.textContent = '';

    var head = el('div', 'itp-total');
    head.appendChild(el('div', 'itp-total-label',
      (r.propertyType === 'resale' ? 'ITP due' : 'IVA + AJD due') + ' in ' + r.regionLabel));
    head.appendChild(el('div', 'itp-total-amount', window.ELSCalc.fmtEUR(r.total)));
    head.appendChild(el('div', 'itp-total-rate',
      'Effective rate ' + r.effectiveRate + '% on ' + window.ELSCalc.fmtEUR(r.price)));
    result.appendChild(head);

    // The working: one row per line.
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
    r.lines.forEach(function (line) {
      var tr = el('tr');
      tr.appendChild(el('td', null, line.label));
      tr.appendChild(el('td', null, window.ELSCalc.fmtEUR(line.base)));
      tr.appendChild(el('td', null, window.ELSCalc.fmtEUR(line.amount)));
      tbody.appendChild(tr);
    });
    var totalRow = el('tr', 'itp-breakdown-total');
    var totalLabel = el('th', null, 'Total');
    totalLabel.setAttribute('scope', 'row');
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(el('td', null, ''));
    totalRow.appendChild(el('td', null, window.ELSCalc.fmtEUR(r.total)));
    tbody.appendChild(totalRow);
    table.appendChild(tbody);
    result.appendChild(table);

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

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();

    var region = form.querySelector('#itp-region').value;
    var typeInput = form.querySelector('input[name="itp-type"]:checked');
    var propertyType = typeInput ? typeInput.value : '';
    var price = parsePrice(form.querySelector('#itp-price').value);

    var r = window.ELSCalc.calculateITP(data, {
      region: region,
      price: price,
      propertyType: propertyType,
    });

    track('calculator_use', {
      calculator: 'itp',
      region: region || '(none)',
      property_type: propertyType || '(none)',
      result: r.ok ? 'ok' : r.error,
    });

    if (r.ok) {
      renderResult(r);
      return;
    }

    if (r.error === 'invalid-price') {
      renderError('Enter the purchase price in euros, for example 350,000.');
    } else if (r.error === 'unknown-region' || r.error === 'invalid-property-type') {
      renderError('Choose a region and whether the property is a resale or a new build.');
    } else if (r.error === 'iva-not-applicable') {
      renderError(
        'New builds in ' + (data.regions[region] || region) + ' pay ' +
        (region === 'canarias' ? 'IGIC' : 'IPSI') + ' instead of mainland IVA. ' +
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

  // CTA instrumentation: measure whether the tool drives enquiries.
  document.querySelectorAll('[data-calc-cta]').forEach(function (a) {
    a.addEventListener('click', function () {
      track('calculator_cta_click', { calculator: 'itp' });
    });
  });
})();
