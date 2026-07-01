#!/usr/bin/env node
/*
 * build-money-pages.js — regenerates every money page from money-pages-data.js
 * ---------------------------------------------------------------------------
 * Run from the repo root:   node tools/build-money-pages.js
 * Check only (no writing):  node tools/build-money-pages.js --check
 *
 * What it does, in order:
 *   1. Reads the LIVE firm listings by parsing lawyers.html (the /lawyers page
 *      is the single source of truth for which firms are listed). No snapshot.
 *   2. For each page in money-pages-data.js, filters the firms by specialty.
 *      Fewer than 2 verified firms -> the page is NOT built and the run fails
 *      loudly (no thin stubs; that intent stays with the enquiry form).
 *   3. Writes each page to <slug>.html at the repo root (URL /<slug>).
 *   4. Keeps in sync (updates in place, never recreates):
 *        - sitemap.xml            (managed block between money-pages markers)
 *        - llms.txt               ("Find a lawyer by specialty" section)
 *        - llms-full.txt          ("Specialty lawyer directories" section)
 *        - lawyers.html           (browse-by-specialty links, managed block)
 *
 * It NEVER touches blog posts, existing URLs, or any SEO tag outside the
 * managed blocks. Nothing is written until every check passes.
 *
 * See tools/FABLE-NOTES-money-pages.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const data = require('./money-pages-data.js');
const blogData = require('./blog-data.js');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://expatlawyerspain.com';

const checkOnly = process.argv.includes('--check');

// --- tiny helpers -----------------------------------------------------------

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

// --- 1. read the LIVE firm listings from lawyers.html ------------------------

function parseFirms() {
  const html = fs.readFileSync(path.join(ROOT, 'lawyers.html'), 'utf8');
  const cards = html.match(/<article class="firm-card lawyer-card"[\s\S]*?<\/article>/g) || [];
  if (cards.length < 25) {
    die(
      `only found ${cards.length} firm cards in lawyers.html — expected 25+. ` +
        'The card markup may have changed; update parseFirms() in tools/build-money-pages.js to match.'
    );
  }

  return cards.map((card, i) => {
    const attr = (name) => {
      const m = card.match(new RegExp(`data-${name}="([^"]*)"`));
      return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
    };
    const one = (re, label) => {
      const m = card.match(re);
      if (!m) die(`firm card #${i + 1} in lawyers.html is missing its ${label} — markup drift?`);
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
    const enquiry = one(/<a href="([^"]*#contact-form)" class="firm-enquiry">/, 'enquiry link');

    const ratingM = card.match(/<b>([\d.]+)<\/b>\s*<span class="rating-count">\((\d+)\)<\/span>/);
    const verified = /class="firm-badge"/.test(card);

    return {
      name, // already HTML-escaped in source (e.g. &amp;)
      location: locRaw.trim(),
      cities,
      specialties,
      langs,
      langsText: langsText.trim(),
      rating: ratingM ? { score: ratingM[1], count: ratingM[2] } : null,
      enquiry,
      verified,
    };
  });
}

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
      <div class="container">© 2026 ExpatLawyerSpain.com - Not a law firm. Directory service only.</div>
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

// --- 2. page pieces ----------------------------------------------------------

function firmTableSection(page, firms) {
  const rows = firms
    .map((f) => {
      const rating = f.rating
        ? `${esc(f.rating.score)} ★ <span style="color:var(--text-light)">(${esc(f.rating.count)} Google reviews)</span>`
        : '—';
      return `      <tr>
        <th scope="row">${f.name}</th>
        <td>${esc(f.location)}</td>
        <td>${esc(f.langsText)}</td>
        <td>${rating}</td>
        <td><a href="${f.enquiry}">Enquire ${ARROW_SVG}</a></td>
      </tr>`;
    })
    .join('\n');

  return `  <p>${firms.length} verified English-speaking firms are currently listed for ${esc(
    page.label.toLowerCase()
  )} work — pulled from the live ELS directory, so this table always matches <a href="/lawyers?specialty=${page.specialty}">the full listings</a>. Every firm here is checked before listing: <a href="${data.vettingUrl}">how we verify firms</a>.</p>

  <table class="region-table firm-table">
    <thead>
      <tr>
        <th scope="col">Firm</th>
        <th scope="col">Coverage</th>
        <th scope="col">Languages</th>
        <th scope="col">Google rating</th>
        <th scope="col"></th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <div class="info-box">
    <p><strong>Prefer not to compare firms yourself?</strong> <a href="/#contact-form">Send one enquiry</a> and we route it to the best-fit firm for your city and situation. If a firm doesn't respond within 2–5 working days, we route it to the next one — that's the service.</p>
  </div>`;
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

function siblingsBox(pageKey) {
  const links = Object.entries(data.pages)
    .filter(([k]) => k !== pageKey)
    .map(([, p]) => `<a href="/${p.slug}">${esc(p.shortLabel)} lawyers in Spain</a>`)
    .join(' &nbsp;·&nbsp; ');
  return `  <div class="info-box">
    <p><strong>Looking for a different specialty?</strong> ${links} &nbsp;·&nbsp; or <a href="/lawyers">browse all firms</a>.</p>
  </div>`;
}

function relatedGuides(page) {
  // Pull guide cards from blog-data.js so they can never drift from the blog.
  const posts = blogData.posts.filter((p) =>
    (p.categories || []).some((c) => page.blogCategories.includes(c))
  );
  // Categories with few posts top up from the page's fallbackGuides list.
  for (const slug of page.fallbackGuides || []) {
    if (posts.length >= 3) break;
    const p = blogData.posts.find((x) => x.slug === slug);
    if (!p) die(`page "${page.slug}": fallbackGuides slug "${slug}" is not in tools/blog-data.js.`);
    if (!posts.includes(p)) posts.push(p);
  }
  if (posts.length < 3) {
    die(
      `page "${page.slug}": fewer than 3 related guides found for categories [${page.blogCategories}]. ` +
        'Add slugs to its "fallbackGuides" list in money-pages-data.js.'
    );
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
  const allHref = `/blog/${page.blogCategories[0]}/`;
  return `  <section class="related-guides">
    <div class="related-inner">
      <div class="related-head">
        <h2>Guides that answer the common questions</h2>
        <a class="related-all" href="${allHref}">All guides →</a>
      </div>
      <div class="related-grid">
${cards}
      </div>
    </div>
  </section>`;
}

// --- 3. page assembly --------------------------------------------------------

function buildPage(pageKey, page, firms) {
  const canonical = `${SITE}/${page.slug}`;

  // Section list drives both the body and the "On this page" TOC.
  const firmHeading = `Verified ${page.label.toLowerCase()} lawyers in Spain`;
  const sections = [
    { heading: firmHeading, html: firmTableSection(page, firms) },
    ...page.sections,
    { heading: page.when.heading, html: page.when.html },
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
    <a href="/#contact-form" class="cta-btn">${esc(page.cta.btn)} -&gt;</a>
  </div>\n\n${siblingsBox(pageKey)}`
          : '';
      return `  <h2 id="${slugId(s.heading)}">${esc(s.heading)}</h2>
${s.html}${extra}`;
    })
    .join('\n\n');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${page.label} lawyers in Spain — verified English-speaking firms`,
    itemListOrder: 'https://schema.org/ItemListUnordered',
    numberOfItems: firms.length,
    itemListElement: firms.map((f, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: f.name.replace(/&amp;/g, '&'),
    })),
  };

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
  <meta name="description" content="${escAttr(page.description)}" />
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
${JSON.stringify(itemList, null, 2)}
  </script>
</head>
<body class="post">

${HEADER}

  <main>

<div class="hero">
  <div class="hero-inner">
  <div class="hero-breadcrumb"><a href="/lawyers">Find a Lawyer</a> &nbsp;·&nbsp; ${esc(page.label)}</div>
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

${CF_BEACON}
<script src="/js/blog.js?v=20260626-b2"></script>
</body>
</html>
`;
}

// --- 4. managed blocks in existing files (update, never recreate) ------------

function replaceBetween(file, startMark, endMark, replacement, label) {
  // startMark may be a prefix (the marker comment can carry an explanatory
  // note); the managed content replaces everything between the END of the
  // line containing startMark and the line containing endMark.
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark);
  if (start === -1 || end === -1 || end < start) {
    die(
      `${file} is missing the managed ${label} block markers ` +
        `("${startMark}" … "${endMark}"). Restore them — the script only ever edits between markers.`
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
    .map((p) => `- ${p.label} lawyers in Spain (verified, English-speaking): ${SITE}/${p.slug}`)
    .join('\n');
}

function llmsFullBlock(pages) {
  return pages
    .map(
      (p) => `### ${p.title}
- URL: ${SITE}/${p.slug}
- Description: ${p.description}
- Contains: a live table of every verified English-speaking firm listed for ${p.label.toLowerCase()} work (coverage, languages, Google rating), specific legal facts, a "when do you actually need a lawyer" section, and links to the related guides.`
    )
    .join('\n\n');
}

function lawyersLinksBlock(pages) {
  const links = pages.map((p) => `<a href="/${p.slug}">${p.label}</a>`).join(' · ');
  return `          <div class="filter-help">
            <h3>Browse by specialty</h3>
            <p>Compare verified firms by legal area: ${links}.</p>
          </div>`;
}

// --- run ----------------------------------------------------------------------

function main() {
  const firms = parseFirms();
  console.log(`  read ${firms.length} live firm listings from lawyers.html`);

  const pages = Object.entries(data.pages);
  const writes = [];

  for (const [key, page] of pages) {
    const matching = firms.filter((f) => f.verified && f.specialties.includes(page.specialty));
    if (matching.length < data.minFirms) {
      die(
        `page "${page.slug}" has only ${matching.length} verified firm(s) for specialty "${page.specialty}" ` +
          `(minimum ${data.minFirms}). The page was NOT built — that intent should route to the enquiry form. ` +
          'If firm coverage has genuinely grown, re-run; do not lower the threshold.'
      );
    }
    const file = path.join(ROOT, `${page.slug}.html`);
    writes.push({ path: file, file: `${page.slug}.html`, next: buildPage(key, page, matching), prev: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, firms: matching.length });
  }

  const pageList = pages.map(([, p]) => p);
  writes.push(
    replaceBetween('sitemap.xml', '<!-- money-pages:start', '<!-- money-pages:end -->', sitemapBlock(pageList), 'money-pages'),
    replaceBetween('llms.txt', '<!-- money-pages:start', '<!-- money-pages:end -->', llmsBlock(pageList), 'money-pages'),
    replaceBetween('llms-full.txt', '<!-- money-pages:start', '<!-- money-pages:end -->', llmsFullBlock(pageList), 'money-pages'),
    replaceBetween('lawyers.html', '<!-- money-pages:specialty-links -->', '<!-- /money-pages:specialty-links -->', lawyersLinksBlock(pageList), 'specialty-links')
  );

  let changed = 0;
  for (const w of writes) {
    const prev = 'prev' in w ? w.prev : null;
    if (prev === w.next) {
      console.log(`  =  ${w.file} (no change)`);
      continue;
    }
    if (checkOnly) {
      console.log(`  ~  ${w.file} WOULD CHANGE`);
      changed++;
      continue;
    }
    fs.writeFileSync(w.path, w.next);
    console.log(`  +  ${w.file} written${w.firms ? ` (${w.firms} firms)` : ''}`);
    changed++;
  }

  console.log(`\n  ${writes.length} files checked, ${changed} ${checkOnly ? 'would change' : 'changed'}.\n`);
  if (checkOnly && changed > 0) process.exit(1);
}

main();
