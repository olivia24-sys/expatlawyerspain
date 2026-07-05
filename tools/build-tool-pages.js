#!/usr/bin/env node
/*
 * build-tool-pages.js - regenerates every calculator/tool page
 * ---------------------------------------------------------------------------
 * Run from the repo root:    node tools/build-tool-pages.js
 * Check only (no writing):   node tools/build-tool-pages.js --check
 * Local draft preview:       node tools/build-tool-pages.js --allow-draft
 *
 * What it does, in order:
 *   1. Runs tools/validate-legal-data.js - a spine that fails validation
 *      never reaches a page.
 *   2. Loads the legal-data spine and keeps VERIFIED figures only. A user
 *      can never pick a region and get a draft or blank number: regions
 *      without a verified resale figure simply do not appear, in the rate
 *      table or in the calculator's region selector.
 *      (--allow-draft keeps drafts too, adds a loud preview banner and a
 *      noindex tag. For checking the page locally before Olivia verifies
 *      figures. NEVER merge a draft build.)
 *   3. Renders each page in tool-pages-data.js: static rate table + worked
 *      example computed at build time BY THE SAME ENGINE the browser runs
 *      (js/calc-engine.js), the server-rendered calculator form, and the
 *      spine slice embedded as window.ELS_LEGAL_DATA_ITP.
 *   4. Writes <slug>.html at the repo root and keeps sitemap.xml, llms.txt
 *      and llms-full.txt in sync (managed tool-pages marker blocks).
 *
 * No figure is ever hardcoded here or in the page copy: everything comes
 * from tools/legal-data/. See tools/TOOLS-NOTES.md for the guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const data = require('./tool-pages-data.js');
const blogData = require('./blog-data.js');
const spine = require('./legal-data/index.js');
const engine = require('../js/calc-engine.js');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://expatlawyerspain.com';

const checkOnly = process.argv.includes('--check');
const allowDraft = process.argv.includes('--allow-draft');

// --- tiny helpers (house pattern, as in build-money-pages.js) ----------------

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
function die(msg) {
  console.error('\n  ERROR: ' + msg + '\n');
  process.exit(1);
}
function slugId(text) {
  return String(text)
    .toLowerCase()
    .replace(/&amp;|&/g, 'and')
    .replace(/[’'"()：:,.?]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- 1. validate the spine, then load the shippable figures -------------------

try {
  execFileSync('node', [path.join(__dirname, 'validate-legal-data.js')], { stdio: 'pipe' });
} catch (e) {
  die('the legal-data spine failed validation - fix it first:\n' + (e.stdout || '') + (e.stderr || ''));
}

const allItp = spine.allFigures().filter((f) => f.domain === 'itp');
const shippable = allItp.filter((f) => (allowDraft ? true : f.status === 'verified'));

// Strip the internal maintenance note before anything reaches a page.
function publicFigure(f) {
  const { note, domain, ...pub } = f;
  return pub;
}

function fig(id) {
  return shippable.find((f) => f.id === id) || null;
}

// Regions offered = regions with a shippable resale figure, in label order.
const availableRegions = Object.keys(spine.regions)
  .filter((r) => fig(`itp.${r}.resale`))
  .sort((a, b) => spine.regions[a].localeCompare(spine.regions[b]));

if (availableRegions.length === 0) {
  die(
    allowDraft
      ? 'no ITP resale figures in the spine at all - seed tools/legal-data/itp.js first.'
      : "no VERIFIED ITP resale figures yet, so there is nothing a production build may ship. " +
          'Olivia flips figures draft -> verified in tools/legal-data/itp.js after checking each official source. ' +
          'For a local preview of the draft state, run with --allow-draft (never merge that build).'
  );
}

const embeddedRegions = {};
for (const r of availableRegions) embeddedRegions[r] = spine.regions[r];

const embedded = {
  regions: embeddedRegions,
  figures: shippable
    .filter((f) => f.region === 'national' || availableRegions.includes(f.region))
    .map(publicFigure),
};

// "Figures last verified" line, derived from the shipped figures.
const latestAccessed = embedded.figures.map((f) => f.source.accessed).sort().pop();
const earliestReview = embedded.figures.map((f) => f.reviewBy).sort().shift();

// --- reusable markup (copied byte-for-byte from the live site) ---------------

const BURGER_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
const ARROW_SVG =
  '<svg class="ic-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';

const HEADER = `  <!-- HEADER -->
  <header>
    <div class="container header-inner navb">
      <a href="/" class="logo">
        <img src="/images/logo-tree-44.png" alt="ExpatLawyerSpain" class="logo-icon" decoding="async" width="36" height="36">
        <span>ExpatLawyer<strong>Spain</strong></span>
      </a>
      <input type="checkbox" id="nav-toggle" class="navb-cb" aria-label="Toggle navigation menu">
      <label for="nav-toggle" class="navb-burger" aria-hidden="true">${BURGER_SVG}</label>
      <div class="navb-menu">
        <nav>
        <a href="/lawyers">Find a Lawyer</a>
        <a href="/blog/">Guides</a>
        <a href="/list-your-firm">List Your Firm</a>
      </nav>
        <a href="/#contact-form" class="btn-nav nav-cta">Send enquiry</a>
      </div>
    </div>
  </header>`;

const FOOTER = `  <footer class="site-footer">
    <div class="container footer-top">
      <div class="footer-brand">
        <div class="logo">
          <img src="/images/logo-tree-44.png" alt="ExpatLawyerSpain" class="logo-icon" decoding="async" width="36" height="36">
          <span>ExpatLawyer<strong>Spain</strong></span>
        </div>
        <p class="footer-tagline">The directory connecting English-speaking expats with vetted, bilingual lawyers across Spain.</p>
      </div>
      <div class="footer-col">
        <h3>Directory</h3>
        <ul>
          <li><a href="/lawyers">Browse by city</a></li>
          <li><a href="/lawyers">Browse by legal area</a></li>
          <li><a href="/lawyers">Featured lawyers</a></li>
          <li><a href="/#contact-form">Get matched</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h3>For lawyers</h3>
        <ul>
          <li><a href="/list-your-firm">List your firm</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h3>Company</h3>
        <ul>
          <li><a href="/privacy">Privacy Policy</a></li>
          <li><a href="/terms">Terms</a></li>
          <li><a href="/cookie-policy">Cookie Policy</a></li>
          <li><a href="mailto:hello@expatlawyerspain.com">Contact</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bar">
      <div class="container">© 2026 ExpatLawyerSpain.com. Not a law firm, directory service only.</div>
    </div>
  </footer>`;

const CF_BEACON = `<!-- Cloudflare Pages Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "8c13e389e64f4afe8b1d9bf2e3868dd3"}'></script><!-- Cloudflare Pages Analytics -->`;

const FAQ_SCRIPT = `<script>
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => {
      const answer = q.nextElementSibling;
      const isOpen = answer.classList.contains('open');
      document.querySelectorAll('.faq-a').forEach(a => a.classList.remove('open'));
      document.querySelectorAll('.faq-q').forEach(x => x.classList.remove('open'));
      if (!isOpen) {
        answer.classList.add('open');
        q.classList.add('open');
      }
    });
  });
</script>`;

// --- 2. generated sections -----------------------------------------------------

function describeRate(f) {
  if (f.bands) {
    // 'whole' scales are cliffs: one rate on the ENTIRE price, picked by the
    // total. Reading them like marginal tranches would mislead near the
    // threshold, so they get their own wording.
    if (f.bandType === 'whole') {
      const parts = f.bands.map((b, i) => {
        if (b.upTo !== null) return `${b.rate}% up to ${engine.fmtEUR(b.upTo)}`;
        const prev = f.bands[i - 1].upTo;
        return `${b.rate}% on the whole price above ${engine.fmtEUR(prev)}`;
      });
      return parts.join(', ');
    }
    const parts = f.bands.map((b) =>
      b.upTo === null ? `${b.rate}% above` : `${b.rate}% to ${engine.fmtEUR(b.upTo)}`
    );
    // "10% to €600,000, 11% to €900,000, 12% to €1,500,000, then 13% above that"
    const last = parts.pop().replace(/% above$/, '% above that');
    return parts.join(', ') + ', then ' + last;
  }
  return `${f.value}%`;
}

function sourceLink(f) {
  return `<a href="${escAttr(f.source.url)}" rel="noopener" target="_blank">${esc(f.source.title)}</a>`;
}

function calculatorSection(page) {
  const options = availableRegions
    .map((r) => `        <option value="${escAttr(r)}">${esc(spine.regions[r])}</option>`)
    .join('\n');
  return `  <form id="itp-form" class="itp-form" novalidate>
    <div class="itp-field">
      <label for="itp-region">Where is the property?</label>
      <select id="itp-region" required>
        <option value="">Choose a region</option>
${options}
      </select>
    </div>
    <fieldset class="itp-field itp-type">
      <legend>What are you buying?</legend>
      <label><input type="radio" name="itp-type" value="resale" checked> A resale property</label>
      <label><input type="radio" name="itp-type" value="new-build"> A new build from a developer</label>
    </fieldset>
    <div class="itp-field">
      <label for="itp-price">Declared purchase price</label>
      <input id="itp-price" type="text" inputmode="decimal" placeholder="350,000" required>
    </div>
    <button type="submit" class="cta-btn itp-calc-btn">Calculate the tax</button>
  </form>
  <div id="itp-result" class="itp-result" hidden aria-live="polite"></div>
  <noscript>
    <p>The calculator needs JavaScript, but you don't: every verified rate is in the table below, so the sum works on paper too.</p>
  </noscript>
  <p class="itp-verified-line">Figures checked ${esc(latestAccessed)} against the official sources linked below. Next scheduled review: ${esc(earliestReview)}.</p>
  <p class="itp-base-note">${page.baseNote}</p>`;
}

function rateTableSection() {
  const iva = fig('itp.national.new-build-iva');
  const rows = availableRegions
    .map((r) => {
      const resale = fig(`itp.${r}.resale`);
      const ajd = fig(`itp.${r}.new-build-ajd`);
      const igic = fig('itp.canarias.new-build-igic');
      let newBuild;
      if (r === 'canarias') {
        newBuild = igic && ajd ? `IGIC ${igic.value}% + AJD ${describeRate(ajd)}` : 'IGIC applies instead of IVA';
      } else if (r === 'ceuta' || r === 'melilla') {
        newBuild = 'IPSI applies instead of IVA';
      } else {
        newBuild = ajd
          ? `IVA${iva ? ' ' + iva.value + '%' : ''} + AJD ${describeRate(ajd)}`
          : 'AJD rate not yet verified';
      }
      return `      <tr>
        <th scope="row">${esc(spine.regions[r])}</th>
        <td>${esc(describeRate(resale))}</td>
        <td>${esc(newBuild)}</td>
        <td>${sourceLink(resale)}</td>
      </tr>`;
    })
    .join('\n');

  return `  <p>These are the general rates the calculator uses, read from the same sourced data file. Regions we haven't verified against their official tax agency yet aren't shown, and the calculator won't offer them either.</p>
  <table class="cost-table itp-rate-table">
    <thead>
      <tr><th scope="col">Region</th><th scope="col">Resale (ITP)</th><th scope="col">New build</th><th scope="col">Official source</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>${iva ? `\n  <p>New builds everywhere on the mainland and the Balearic Islands pay IVA at ${iva.value}% (${sourceLink(iva)}) plus the region's AJD stamp duty, instead of ITP.</p>` : ''}`;
}

function workedExampleSection() {
  // Prefer a banded region (the breakdown is the point); fall back to flat.
  const banded = availableRegions.find((r) => fig(`itp.${r}.resale`).bands);
  const region = banded || availableRegions[0];
  const resale = fig(`itp.${region}.resale`);
  const price = banded ? resale.bands[1].upTo + 100000 : 300000;

  const r = engine.calculateITP(embedded, { region, price, propertyType: 'resale' });
  if (!r.ok) die(`worked example failed for ${region} at ${price}: ${r.error}`);

  const rows = r.lines
    .map(
      (l) => `      <tr><td>${esc(l.label)}</td><td>${esc(engine.fmtEUR(l.base))}</td><td>${esc(
        engine.fmtEUR(l.amount)
      )}</td></tr>`
    )
    .join('\n');

  return `  <p>Buying a ${engine.fmtEUR(price)} resale home in ${esc(r.regionLabel)}, the calculator shows every step rather than just the answer:</p>
  <table class="cost-table itp-worked">
    <thead><tr><th scope="col">Step</th><th scope="col">Taxed amount</th><th scope="col">Tax</th></tr></thead>
    <tbody>
${rows}
      <tr><th scope="row">Total</th><td></td><td><strong>${esc(engine.fmtEUR(r.total))}</strong></td></tr>
    </tbody>
  </table>
  <p>That is an effective rate of ${r.effectiveRate}% on the full price. Every result links the official source behind each rate it used.</p>`;
}

function faqSection(faq) {
  const items = faq
    .map(
      (f) => `    <div class="faq-item">
      <div class="faq-q">${esc(f.q)}</div>
      <div class="faq-a">${esc(f.a)}</div>
    </div>`
    )
    .join('\n');
  return `  <div class="faq">
${items}
  </div>`;
}

function relatedGuides(page) {
  // Explicit picks: the 3 guides named in tool-pages-data.js, pulled from
  // blog-data.js so titles/descriptions can never drift from the blog.
  const posts = (page.guides || []).map((slug) => {
    const p = blogData.posts.find((x) => x.slug === slug);
    if (!p) die(`page "${page.slug}": guides slug "${slug}" is not in tools/blog-data.js.`);
    return p;
  });
  if (posts.length < 3) {
    die(`page "${page.slug}": needs exactly 3 "guides" slugs in tool-pages-data.js.`);
  }
  const cards = posts
    .slice(0, 3)
    .map(
      (p) => `      <a class="related-card" href="/blog/${p.slug}">
        <div class="tag">${esc(p.tag)}</div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.desc)}</p>
        <span class="read-more">Read guide ${ARROW_SVG}</span>
      </a>`
    )
    .join('\n');
  return `  <section class="related-guides">
    <div class="related-inner">
      <div class="related-head">
        <h2>Guides that answer the common questions</h2>
        <a class="related-all" href="/blog/${page.blogCategories[0]}/">All guides →</a>
      </div>
      <div class="related-grid">
${cards}
      </div>
    </div>
  </section>`;
}

// --- 3. page assembly ------------------------------------------------------------

function buildPage(page) {
  const canonical = `${SITE}/${page.slug}`;

  const sections = [
    ...page.sectionsBefore,
    { heading: page.calcHeading, tocLabel: 'The calculator', html: calculatorSection(page) },
    { heading: page.rateTableHeading, tocLabel: 'Rates by region', html: rateTableSection() },
    { heading: 'A worked example', html: workedExampleSection() },
    ...page.sectionsAfter,
    { heading: page.when.heading, tocLabel: 'When you need a lawyer', html: page.when.html },
    { heading: 'Frequently Asked Questions', tocLabel: 'FAQs', html: faqSection(page.faq) },
  ];

  const toc = sections
    .map((s) => `        <li><a href="#${slugId(s.heading)}">${esc(s.tocLabel || s.heading)}</a></li>`)
    .join('\n');

  const body = sections
    .map((s, i) => {
      const extra =
        i === sections.length - 2
          ? `\n\n  <div class="cta-box">
    <p><strong>${esc(page.cta.strong)}</strong>${esc(page.cta.text)}</p>
    <a href="/#contact-form" class="cta-btn" data-calc-cta>${esc(page.cta.btn)} -&gt;</a>
  </div>`
          : '';
      return `  <h2 id="${slugId(s.heading)}">${esc(s.heading)}</h2>
${s.html}${extra}`;
    })
    .join('\n\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: page.h1,
    url: canonical,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    provider: { '@type': 'Organization', name: 'ExpatLawyerSpain', url: SITE },
  };

  // The spine slice the browser calculates from. </ escaped so figure text
  // can never terminate the script block.
  const embedJson = JSON.stringify(embedded).replace(/</g, '\\u003c');

  const draftBanner = allowDraft
    ? `\n  <div class="itp-draft-banner" style="background:#b3261e;color:#fff;text-align:center;padding:10px 16px;font-weight:600;">PREVIEW BUILD with unverified draft figures. Not for production. Rebuild without --allow-draft before merging.</div>`
    : '';
  const robots = allowDraft ? `\n  <meta name="robots" content="noindex" />` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QG44Z84ZFY"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-QG44Z84ZFY');
  </script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(page.title)}</title>
  <meta name="description" content="${escAttr(page.description)}" />${robots}
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" type="text/markdown" href="/llms.txt" title="ExpatLawyerSpain LLM summary" />
  <link rel="alternate" type="text/markdown" href="/llms-full.txt" title="ExpatLawyerSpain full LLM context" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escAttr(page.h1)}" />
  <meta property="og:description" content="${escAttr(page.description)}" />
  <meta property="og:image" content="${SITE}/images/social-preview.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="ExpatLawyerSpain logo" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(page.h1)}" />
  <meta name="twitter:description" content="${escAttr(page.description)}" />
  <meta name="twitter:image" content="${SITE}/images/social-preview.png" />
  <link rel="icon" href="/favicon.png" type="image/png" />
  <link rel="preload" href="/fonts/fraunces-var.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/fonts/libre-franklin-var.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/css/style.css?v=${data.cssVersion}" />
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
</head>
<body class="post calc-page">
${draftBanner}
${HEADER}

  <main>

<div class="hero">
  <div class="hero-inner">
  <div class="hero-breadcrumb"><a href="${page.breadcrumb.href}">${esc(page.breadcrumb.label)}</a> &nbsp;·&nbsp; ${esc(page.breadcrumbLeaf)}</div>
  <h1>${esc(page.h1)}</h1>
  <div class="hero-meta">${esc(page.lead)}</div>
  <div class="hero-actions"><span class="hero-updated">${esc(data.updatedLabel)}</span><button type="button" class="hero-share" data-share><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span class="share-label">Share</span></button></div>
  </div>
</div>

<div class="post-layout">
  <article class="article-wrap">
${page.intro}

${body}

  </article>

  <aside class="post-toc">
    <div class="post-toc-inner">
      <div class="post-toc-label">On this page</div>
      <ul>
${toc}
      </ul>
    </div>
  </aside>
  </div>

${relatedGuides(page)}

  </main>

${FOOTER}

${FAQ_SCRIPT}

<script>window.ELS_LEGAL_DATA_ITP = ${embedJson};</script>
<script src="/js/calc-engine.js?v=${data.jsVersion}"></script>
<script src="/js/itp-calculator.js?v=${data.jsVersion}"></script>
${CF_BEACON}
<script src="/js/blog.js?v=20260626-b2"></script>
</body>
</html>
`;
}

// --- 4. managed blocks in existing files (update, never recreate) -----------------

function replaceBetween(file, startMark, endMark, replacement, label) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark);
  if (start === -1 || end === -1 || end < start) {
    die(
      `${file} is missing the managed ${label} block markers ` +
        `("${startMark}" … "${endMark}"). Restore them - the script only ever edits between markers.`
    );
  }
  const afterStartLine = src.indexOf('\n', start) + 1;
  const endLineStart = src.lastIndexOf('\n', end) + 1;
  const next = src.slice(0, afterStartLine) + replacement + '\n' + src.slice(endLineStart);
  return { path: p, prev: src, next, file };
}

function sitemapBlock(pages) {
  return pages
    .map(
      (p) => `  <url>
    <loc>${SITE}/${p.slug}</loc>
    <lastmod>${data.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`
    )
    .join('\n');
}

function llmsBlock(pages) {
  return pages
    .map((p) => `- ${p.llmsLine}: ${SITE}/${p.slug}`)
    .join('\n');
}

function llmsFullBlock(pages) {
  return pages
    .map(
      (p) => `### ${p.title}
- URL: ${SITE}/${p.slug}
- Description: ${p.description}
- Contains: ${p.llmsFullContains}`
    )
    .join('\n\n');
}

// --- run ----------------------------------------------------------------------------

function main() {
  console.log(
    `  spine: ${allItp.length} ITP figures, ${shippable.length} shippable (${
      allowDraft ? 'DRAFTS ALLOWED - preview build' : 'verified only'
    }), ${availableRegions.length} region(s): ${availableRegions.join(', ')}`
  );

  const pages = Object.values(data.pages);
  const writes = [];

  for (const page of pages) {
    const file = path.join(ROOT, `${page.slug}.html`);
    writes.push({
      path: file,
      file: `${page.slug}.html`,
      next: buildPage(page),
      prev: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null,
    });
  }

  writes.push(
    replaceBetween('sitemap.xml', '<!-- tool-pages:start', '<!-- tool-pages:end -->', sitemapBlock(pages), 'tool-pages'),
    replaceBetween('llms.txt', '<!-- tool-pages:start', '<!-- tool-pages:end -->', llmsBlock(pages), 'tool-pages'),
    replaceBetween('llms-full.txt', '<!-- tool-pages:start', '<!-- tool-pages:end -->', llmsFullBlock(pages), 'tool-pages')
  );

  let changed = 0;
  for (const w of writes) {
    if (w.prev === w.next) {
      console.log(`  =  ${w.file} (no change)`);
      continue;
    }
    if (checkOnly) {
      console.log(`  ~  ${w.file} WOULD CHANGE`);
      changed++;
      continue;
    }
    fs.writeFileSync(w.path, w.next);
    console.log(`  +  ${w.file} written`);
    changed++;
  }

  console.log(`\n  ${writes.length} files checked, ${changed} ${checkOnly ? 'would change' : 'changed'}.\n`);
  if (checkOnly && changed > 0) process.exit(1);
}

main();
