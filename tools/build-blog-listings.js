#!/usr/bin/env node
/*
 * build-blog-listings.js — regenerates every blog listing page from blog-data.js
 * ---------------------------------------------------------------------------
 * Run from the repo root:   node tools/build-blog-listings.js
 * Check only (no writing):  node tools/build-blog-listings.js --check
 *
 * It rewrites:
 *   blog/index.html              (the "All" page)
 *   blog/<category>/index.html   (one per category in blog-data.js)
 *
 * It NEVER touches the blog post pages themselves — only the listing pages.
 *
 * See tools/FABLE-NOTES.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const data = require('./blog-data.js');

// The blog directory lives one level up from tools/ (repo-root/blog).
const BLOG_DIR = path.join(__dirname, '..', 'blog');
const SITE = 'https://expatlawyerspain.com';

const checkOnly = process.argv.includes('--check');

// --- tiny helpers -----------------------------------------------------------

// Escape text that goes between HTML tags (card titles, descriptions, tags).
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escape text that goes inside an HTML attribute value (e.g. image alt).
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

function die(msg) {
  console.error('\n  ERROR: ' + msg + '\n');
  process.exit(1);
}

// --- reusable markup fragments (copied byte-for-byte from the live site) ----

const BADGE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/></svg>';
const ARROW_SVG = '<svg class="ic-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';
const BURGER_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';

function head(page, canonical) {
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
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${esc(page.title)}</title>
  <meta name="description" content="${escAttr(page.description)}"/>
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" type="text/markdown" href="/llms.txt" title="ExpatLawyerSpain LLM summary" />
  <link rel="alternate" type="text/markdown" href="/llms-full.txt" title="ExpatLawyerSpain full LLM context" />
  <link rel="icon" href="/favicon.png" type="image/png"/>
  <link rel="preload" href="/fonts/fraunces-var.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/fonts/libre-franklin-var.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/css/style.css?v=${data.cssVersion}"/>
</head>`;
}

const HEADER = `
    <!-- HEADER -->
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

const FOOTER = `    <footer class="site-footer">
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

const CF_BEACON = `  <!-- Cloudflare Pages Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "8c13e389e64f4afe8b1d9bf2e3868dd3"}'></script><!-- Cloudflare Pages Analytics -->`;

// --- page pieces ------------------------------------------------------------

function pills(activeKey) {
  return data.nav
    .map((n) => {
      const href = n.key === 'all' ? '/blog/' : `/blog/${n.key}/`;
      const active = n.key === activeKey ? 'active' : '';
      return `      <a href="${href}" class="pill ${active}">${n.label}</a>`;
    })
    .join('\n');
}

function featuredCard(post, badge) {
  return `  <a class="blog-featured" href="/blog/${post.slug}">
    <div class="blog-featured-media">
      <img src="${post.img}" alt="${escAttr(post.alt)}" decoding="async" loading="lazy" width="600" height="400">
    </div>
    <div class="blog-featured-body">
      <div class="blog-featured-badge">${BADGE_SVG} ${esc(badge)}</div>
      <div class="tag">${esc(post.tag)}</div>
      <h2>${esc(post.title)}</h2>
      <p>${esc(post.desc)}</p>
      <span class="read-more">Read guide ${ARROW_SVG}</span>
    </div>
  </a>`;
}

function gridCard(post) {
  return `    <div class="blog-card">
      <div class="tag">${esc(post.tag)}</div>
      <h2>${esc(post.title)}</h2>
      <p>${esc(post.desc)}</p>
      <a class="read-more" href="/blog/${post.slug}">Read guide ${ARROW_SVG}</a>
    </div>`;
}

// --- page assembly ----------------------------------------------------------

function buildPage(key) {
  const page = data.pages[key];
  const canonical = key === 'all' ? `${SITE}/blog/` : `${SITE}/blog/${page.dir}/`;

  // Which posts belong on this page? 'all' = everything; otherwise category match.
  const members = data.posts.filter(
    (p) => key === 'all' || (p.categories || []).includes(key)
  );

  // Exactly one featured post per page.
  const featured = members.filter((p) => (p.featured || []).includes(key));
  if (featured.length === 0) {
    die(`page "${key}" has no featured post. Add "${key}" to some post's "featured" list in blog-data.js.`);
  }
  if (featured.length > 1) {
    die(`page "${key}" has ${featured.length} featured posts (${featured.map((p) => p.slug).join(', ')}). Only one post may list "${key}" in its "featured" array.`);
  }
  const feat = featured[0];
  if (!feat.img || !feat.alt) {
    die(`featured post "${feat.slug}" needs an "img" and "alt" (it is the featured card on page "${key}").`);
  }

  // Grid = every member except the featured one, in blog-data order.
  const grid = members.filter((p) => p !== feat).map(gridCard).join('\n\n');
  const gridBlock = grid ? `\n${grid}\n` : '';

  return `${head(page, canonical)}
<body>
${HEADER}

  <main>

  <div class="blog-hero">
    <div class="container">
      <h1>${esc(page.h1)}</h1>
      <p>${esc(page.hero)}</p>
    </div>
  </div>

  <div class="blog-filter"><div class="blog-categories">
${pills(key)}
    </div></div>

  <div class="blog-wrap">

${featuredCard(feat, page.badge)}

  <div class="blog-grid">
${gridBlock}
  </div>

  </div>

  </main>

${FOOTER}

${CF_BEACON}
</body>
</html>
`;
}

// --- run --------------------------------------------------------------------

function outPath(key) {
  const page = data.pages[key];
  return page.dir
    ? path.join(BLOG_DIR, page.dir, 'index.html')
    : path.join(BLOG_DIR, 'index.html');
}

function main() {
  // Sanity: every post's categories point at a real page.
  const validKeys = new Set(Object.keys(data.pages));
  for (const p of data.posts) {
    for (const c of p.categories || []) {
      if (!validKeys.has(c)) die(`post "${p.slug}" lists unknown category "${c}".`);
    }
    for (const f of p.featured || []) {
      if (!validKeys.has(f)) die(`post "${p.slug}" is featured on unknown page "${f}".`);
    }
  }

  let changed = 0;
  let checked = 0;
  for (const key of Object.keys(data.pages)) {
    const file = outPath(key);
    const next = buildPage(key);
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    checked++;

    if (prev === next) {
      console.log(`  =  ${path.relative(path.join(__dirname, '..'), file)} (no change)`);
      continue;
    }

    if (checkOnly) {
      console.log(`  ~  ${path.relative(path.join(__dirname, '..'), file)} WOULD CHANGE`);
      changed++;
      continue;
    }

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
    console.log(`  +  ${path.relative(path.join(__dirname, '..'), file)} written`);
    changed++;
  }

  console.log(
    `\n  ${checked} listing pages, ${changed} ${checkOnly ? 'would change' : 'changed'}.\n`
  );

  if (checkOnly && changed > 0) process.exit(1); // handy for a pre-deploy check
}

main();
