/*!
 * ExpatLawyerSpain embed loader, v1.
 * https://expatlawyerspain.com
 *
 * Partner snippet (the published contract - see tools/WIDGET-FRAMEWORK-NOTES.md):
 *
 *   <div class="els-widget" data-els-widget="firm-directory"
 *        data-city="barcelona" data-specialty="property" data-partner="your-name">
 *     <a href="https://expatlawyerspain.com/lawyers">
 *       Find English-speaking lawyers in Spain | ExpatLawyerSpain</a>
 *   </div>
 *   <script async src="https://expatlawyerspain.com/embed/v1.js"></script>
 *
 * NEVER-BREAK-EMBEDDERS RULES for this file:
 *   - this URL (/embed/v1.js) is frozen; changes are ADDITIVE ONLY.
 *   - the data-* attributes above are a frozen contract; new attributes must
 *     be optional with safe defaults.
 *   - a breaking change means a NEW /embed/v2.js alongside this one.
 *   - window.ELSWidget.__test is NOT contract (test hooks only).
 *
 * Written as ES5 on purpose: it must run on any partner site, however old.
 * It never throws into the host page, and touches nothing outside its own
 * containers.
 */
(function () {
  'use strict';

  var PROTOCOL_VERSION = 1;
  var DEFAULT_ORIGIN = 'https://expatlawyerspain.com';
  var WIDGET_NAME_RE = /^[a-z0-9-]{1,64}$/;
  var PARAM_ATTRS = ['city', 'specialty', 'lang', 'partner'];
  var MIN_HEIGHT = 100;
  var MAX_HEIGHT = 4000;
  var DEFAULT_HEIGHT = 380;

  // The widget origin is derived from wherever this script was loaded from,
  // so the same file works on the production domain, Cloudflare previews and
  // local test servers. See acceptableOrigin() for how postMessage acceptance
  // relates to this origin.
  function scriptOrigin(doc) {
    try {
      var src =
        (doc.currentScript && doc.currentScript.src) ||
        (function () {
          var scripts = doc.querySelectorAll('script[src*="/embed/v1.js"]');
          return scripts.length ? scripts[scripts.length - 1].src : '';
        })();
      var m = /^(https?:\/\/[^\/]+)\//.exec(src);
      return m ? m[1] : DEFAULT_ORIGIN;
    } catch (e) {
      return DEFAULT_ORIGIN;
    }
  }

  // --- pure helpers (unit-tested via __test; not part of the contract) ------

  function readConfig(container) {
    var widget = container.getAttribute('data-els-widget') || '';
    if (!WIDGET_NAME_RE.test(widget)) return null;
    var params = [];
    for (var i = 0; i < PARAM_ATTRS.length; i++) {
      var v = container.getAttribute('data-' + PARAM_ATTRS[i]);
      if (v) {
        params.push(
          encodeURIComponent(PARAM_ATTRS[i]) + '=' + encodeURIComponent(String(v).slice(0, 100))
        );
      }
    }
    return { widget: widget, query: params.join('&') };
  }

  function frameSrc(origin, config) {
    return origin + '/widgets/v1/' + config.widget + (config.query ? '?' + config.query : '');
  }

  function validMessage(data) {
    return !!data && typeof data === 'object' && data.els === PROTOCOL_VERSION && typeof data.type === 'string';
  }

  function clampHeight(h) {
    var n = Number(h);
    if (!isFinite(n)) return null;
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(n)));
  }

  // --- mounting --------------------------------------------------------------

  var mounted = []; // { frame: <iframe>, container: <div> }
  var origin = null;
  var listening = false;

  function mountOne(doc, container) {
    if (container.getAttribute('data-els-mounted')) return;
    var config = readConfig(container);
    if (!config) return;
    container.setAttribute('data-els-mounted', '1');

    var frame = doc.createElement('iframe');
    frame.setAttribute('src', frameSrc(origin, config));
    frame.setAttribute('title', 'ExpatLawyerSpain: English-speaking lawyers in Spain');
    frame.setAttribute('loading', 'lazy');
    // Isolation: sandboxed, and deliberately WITHOUT allow-same-origin.
    // allow-forms is required: widgets that calculate on native form submission
    // (the ITP calculator) never fire their submit handler without it, so
    // Calculate does nothing when embedded. It is additive and safe - it only
    // grants a capability, breaks no existing embedder, and the widget CSP still
    // carries form-action 'none' so a submission cannot navigate or exfiltrate.
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms');
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.display = 'block';
    frame.style.height = DEFAULT_HEIGHT + 'px';

    // The visible attribution link stays in the HOST page's own DOM (it also
    // replaces the snippet's fallback anchor as the crawlable link). It points
    // at the homepage - the single "Powered by ExpatLawyerSpain" backlink.
    var attribution = doc.createElement('p');
    attribution.style.margin = '4px 0 0';
    attribution.style.fontSize = '12px';
    attribution.style.lineHeight = '1.4';
    var link = doc.createElement('a');
    link.setAttribute('href', DEFAULT_ORIGIN);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
    link.textContent = 'Powered by ExpatLawyerSpain';
    attribution.appendChild(link);

    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(frame);
    container.appendChild(attribution);
    mounted.push({ frame: frame, container: container });
  }

  // Message acceptance. The AUTHENTICATING check is event.source: it must be
  // the contentWindow of an iframe this loader itself mounted, and only our
  // own CSP-locked page (or whatever the host page navigates that iframe to,
  // which the host controls anyway) can post from there. The origin check is
  // secondary because the sandbox deliberately omits allow-same-origin, so
  // messages from the widget frame legitimately arrive with origin "null"
  // (the opaque-origin serialisation). A same-origin message is also accepted
  // in case a future widget frame drops the sandbox. Payloads carry nothing
  // but a height, which is clamped.
  function acceptableOrigin(msgOrigin) {
    return msgOrigin === 'null' || msgOrigin === origin;
  }

  function onMessage(event) {
    try {
      if (!acceptableOrigin(event.origin)) return;
      if (!validMessage(event.data)) return;
      for (var i = 0; i < mounted.length; i++) {
        if (mounted[i].frame.contentWindow === event.source) {
          if (event.data.type === 'els:resize') {
            var h = clampHeight(event.data.height);
            if (h !== null) mounted[i].frame.style.height = h + 'px';
          }
          // 'els:ready' and unknown types: no action needed today; unknown
          // types are ignored by design (forward compatibility).
          return;
        }
      }
    } catch (e) {
      /* never throw into the host page */
    }
  }

  function rescan() {
    try {
      var doc = document;
      var containers = doc.querySelectorAll('.els-widget[data-els-widget]');
      for (var i = 0; i < containers.length; i++) mountOne(doc, containers[i]);
      if (!listening && mounted.length) {
        listening = true;
        window.addEventListener('message', onMessage, false);
      }
    } catch (e) {
      /* never throw into the host page */
    }
  }

  function boot() {
    if (origin === null) origin = scriptOrigin(document);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', rescan, false);
    } else {
      rescan();
    }
  }

  // Public surface. `version` and `rescan` are contract (additive-only);
  // `__test` is not.
  if (!window.ELSWidget) {
    window.ELSWidget = {
      version: 1,
      rescan: rescan,
      __test: {
        readConfig: readConfig,
        frameSrc: frameSrc,
        validMessage: validMessage,
        clampHeight: clampHeight,
        scriptOrigin: scriptOrigin,
        acceptableOrigin: acceptableOrigin,
      },
    };
    boot();
  }
})();
