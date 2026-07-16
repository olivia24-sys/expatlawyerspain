/*
 * parse-firms.js - the ONE parser for the live firm listings in lawyers.html.
 * ---------------------------------------------------------------------------
 * lawyers.html (the /lawyers page) is the single source of truth for which
 * firms are listed and what their public profiles say. Both generators read
 * it through this module:
 *
 *   - tools/build-money-pages.js  (specialty pillar pages)
 *   - tools/build-widget-data.js  (public read-API dataset for embeds)
 *
 * The extraction logic is the parser that lived inside build-money-pages.js
 * (moved here unchanged); `desc` was added for the widget dataset. If the
 * card markup in lawyers.html ever changes shape, update THIS file only.
 *
 * parseFirms(opts)
 *   opts.root - repo root (defaults to the parent of tools/)
 *   opts.die  - error handler (defaults to throwing; build scripts pass their
 *               own die() so a markup drift still exits 1 with a loud message)
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');

function parseFirms(opts = {}) {
  const root = opts.root || path.join(__dirname, '..', '..');
  const die =
    opts.die ||
    ((msg) => {
      throw new Error(msg);
    });

  const html = fs.readFileSync(path.join(root, 'lawyers.html'), 'utf8');
  const cards = html.match(/<article class="firm-card lawyer-card"[\s\S]*?<\/article>/g) || [];
  if (cards.length < 25) {
    die(
      `only found ${cards.length} firm cards in lawyers.html - expected 25+. ` +
        'The card markup may have changed; update parseFirms() in tools/lib/parse-firms.js to match.'
    );
  }

  return cards.map((card, i) => {
    const attr = (name) => {
      const m = card.match(new RegExp(`data-${name}="([^"]*)"`));
      return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
    };
    const one = (re, label) => {
      const m = card.match(re);
      if (!m) die(`firm card #${i + 1} in lawyers.html is missing its ${label} - markup drift?`);
      return m[1].trim();
    };

    const cities = attr('city');
    const specialties = attr('specialty');
    const langs = attr('lang');
    if (!cities || !specialties || !langs) {
      die(`firm card #${i + 1} in lawyers.html is missing a data-city/data-specialty/data-lang attribute.`);
    }

    const name = one(/<h3 class="firm-name">([\s\S]*?)<\/h3>/, 'name (h3.firm-name)');
    // Location text = whatever follows the pin SVG inside .firm-loc
    const locRaw = one(/<div class="firm-loc">[\s\S]*?<\/svg>([\s\S]*?)<\/div>/, 'location (.firm-loc)');
    const langsText = one(/<div class="firm-langs">([\s\S]*?)<\/div>/, 'languages (.firm-langs)');
    const desc = one(/<p class="firm-desc">([\s\S]*?)<\/p>/, 'description (p.firm-desc)');
    const enquiry = one(/<a href="([^"]*#contact-form)" class="firm-enquiry">/, 'enquiry link');

    const ratingM = card.match(/<b>([\d.]+)<\/b>\s*<span class="rating-count">\((\d+)\)<\/span>/);
    const verified = /class="firm-badge"/.test(card);

    return {
      html: card, // the full card markup, reused verbatim on the money pages
      name, // already HTML-escaped in source (e.g. &amp;)
      location: locRaw.trim(),
      cities,
      specialties,
      langs,
      langsText: langsText.trim(),
      desc,
      rating: ratingM ? { score: ratingM[1], count: ratingM[2] } : null,
      enquiry,
      verified,
    };
  });
}

module.exports = { parseFirms };
