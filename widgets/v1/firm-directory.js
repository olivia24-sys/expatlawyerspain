/*!
 * ExpatLawyerSpain firm-directory widget frame, v1.
 * Runs inside a sandboxed cross-origin iframe under a strict CSP
 * (default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'
 * data:; connect-src 'self'). No dependencies, ES2017+.
 *
 * SECURITY RULE: all rendering goes through document.createElement /
 * textContent / setAttribute. Never innerHTML, insertAdjacentHTML, eval, or
 * template-string HTML.
 */
(function () {
  'use strict';

  var FALLBACK_URL = 'https://expatlawyerspain.com/lawyers';
  var LOADING_TEXT = 'Loading lawyers…';
  var EMPTY_TEXT = 'No listed firms match this filter yet. Browse the full directory on ExpatLawyerSpain.';
  var ERROR_TEXT = 'The directory could not be loaded. Find every listed firm at expatlawyerspain.com/lawyers.';
  var MAX_CHIPS = 4;
  var RESIZE_DEBOUNCE_MS = 150;

  var partnerValue = '';
  var resizeTimer = null;
  var firstRenderDone = false;

  function capitalise(s) {
    var str = String(s || '');
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Adds the ELS UTM set to a URL, handling an existing query string and
  // encoding the partner value.
  function appendUtm(url) {
    var campaign = encodeURIComponent(partnerValue || 'unattributed');
    var utm = 'utm_source=els-widget&utm_medium=embed&utm_campaign=' + campaign;
    var separator = url.indexOf('?') === -1 ? '?' : '&';
    return url + separator + utm;
  }

  function setStatus(text) {
    var status = document.getElementById('els-status');
    if (status) status.textContent = text;
  }

  function clearFirms() {
    var list = document.getElementById('els-firms');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  function buildCard(firm) {
    var li = document.createElement('li');
    li.className = 'els-card';

    var nameEl = document.createElement('div');
    nameEl.className = 'els-name';
    nameEl.textContent = firm.name || '';
    if (firm.verified) {
      var verifiedEl = document.createElement('span');
      verifiedEl.className = 'els-verified';
      verifiedEl.textContent = ' · Verified';
      nameEl.appendChild(verifiedEl);
    }
    li.appendChild(nameEl);

    if (firm.location) {
      var locationEl = document.createElement('div');
      locationEl.className = 'els-location';
      locationEl.textContent = firm.location;
      li.appendChild(locationEl);
    }

    var specialties = Array.isArray(firm.specialties) ? firm.specialties : [];
    if (specialties.length) {
      var chipsEl = document.createElement('div');
      chipsEl.className = 'els-chips';
      for (var i = 0; i < specialties.length && i < MAX_CHIPS; i++) {
        var chip = document.createElement('span');
        chip.className = 'els-chip';
        chip.textContent = capitalise(specialties[i]);
        chipsEl.appendChild(chip);
      }
      li.appendChild(chipsEl);
    }

    if (firm.languages_text) {
      var languagesEl = document.createElement('div');
      languagesEl.className = 'els-languages';
      languagesEl.textContent = firm.languages_text;
      li.appendChild(languagesEl);
    }

    if (firm.directory_url) {
      var linkEl = document.createElement('a');
      linkEl.className = 'els-view-link';
      linkEl.setAttribute('href', appendUtm(firm.directory_url));
      linkEl.setAttribute('target', '_blank');
      linkEl.setAttribute('rel', 'noopener');
      linkEl.textContent = 'View listing →';
      li.appendChild(linkEl);
    }

    return li;
  }

  function renderFirms(firms) {
    clearFirms();
    var list = document.getElementById('els-firms');
    if (!list) return;
    for (var i = 0; i < firms.length; i++) {
      list.appendChild(buildCard(firms[i]));
    }
  }

  // Idempotent: a link that already carries the widget UTM set is left alone,
  // so repeated calls (boot + after fetch) can never stack duplicate params.
  function applyUtmToStaticLinks() {
    ['els-header-link', 'els-footer-link'].forEach(function (id) {
      var link = document.getElementById(id);
      if (!link) return;
      var href = link.getAttribute('href') || FALLBACK_URL;
      if (href.indexOf('utm_source=els-widget') !== -1) return;
      link.setAttribute('href', appendUtm(href));
    });
  }

  function postToParent(message) {
    try {
      if (window.parent === window) return;
      window.parent.postMessage(message, '*');
    } catch (e) {
      /* never throw */
    }
  }

  function postResize() {
    postToParent({ els: 1, type: 'els:resize', height: document.documentElement.scrollHeight });
  }

  function postReadyOnce() {
    if (firstRenderDone) return;
    firstRenderDone = true;
    postToParent({ els: 1, type: 'els:ready' });
    postResize();
  }

  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(postResize, RESIZE_DEBOUNCE_MS);
  }

  function buildApiUrl(params) {
    var query = [];
    ['city', 'specialty', 'lang'].forEach(function (key) {
      var value = params.get(key);
      if (value) query.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    query.push('limit=12');
    return '/v1/firms?' + query.join('&');
  }

  function showFailure() {
    setStatus(ERROR_TEXT);
    clearFirms();
    applyUtmToStaticLinks();
    postReadyOnce();
  }

  function boot() {
    try {
      // partnerValue must be set BEFORE any UTM is applied, or the header and
      // footer links would be tagged 'unattributed'.
      var params = new URLSearchParams(window.location.search);
      partnerValue = params.get('partner') || '';
      applyUtmToStaticLinks();

      setStatus(LOADING_TEXT);

      fetch(buildApiUrl(params), { credentials: 'omit' })
        .then(function (res) {
          if (!res.ok) throw new Error('bad status');
          return res.json();
        })
        .then(function (body) {
          if (!body || body.ok !== true) throw new Error('bad body');
          var firms = (body.data && body.data.firms) || [];
          if (!firms.length) {
            setStatus(EMPTY_TEXT);
            clearFirms();
          } else {
            setStatus('');
            renderFirms(firms);
          }
          applyUtmToStaticLinks();
          postReadyOnce();
        })
        .catch(function () {
          showFailure();
        });

      window.addEventListener('resize', onResize, false);
    } catch (e) {
      showFailure();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})();
