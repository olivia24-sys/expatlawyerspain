#!/usr/bin/env node
/*
 * build-blog-schema.js — injects BlogPosting + BreadcrumbList schema into every blog post
 * ---------------------------------------------------------------------------
 * Run from the repo root:   node tools/build-blog-schema.js
 * Check only (no writing):  node tools/build-blog-schema.js --check
 *
 * For each post listed in blog-data.js it writes a single JSON-LD block into the
 * post's <head>, between these markers:
 *
 *   <!-- BLOGPOSTING SCHEMA (generated) -->
 *   ...script...
 *   <!-- /BLOGPOSTING SCHEMA -->
 *
 * The block is BUILT from data already on the page (canonical URL, meta
 * description, og:image, the <h1>) plus the `published` / `updated` dates that
 * live in blog-data.js. Re-running replaces only the marked block, so it is
 * idempotent and safe to run any time.
 *
 * It NEVER touches:
 *   - any existing FAQPage schema (those blocks are left exactly as they are)
 *   - the listing pages (that is build-blog-listings.js)
 *   - the money / city pages (those have their own ItemList schema)
 *
 * Schema shape and field mapping come from
 *   aios/context/els/els-schema-draft-2026-08-06.md
 * author = Organization deliberately (brand voice bans first-person bylines).
 *
 * See tools/FABLE-NOTES.md for the plain-English guide.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const data = require('./blog-data.js');

const BLOG_DIR = path.join(__dirname, '..', 'blog');
const SITE = 'https://expatlawyerspain.com';
const checkOnly = process.argv.includes('--check');

const OPEN = '<!-- BLOGPOSTING SCHEMA (generated) -->';
const CLOSE = '<!-- /BLOGPOSTING SCHEMA -->';

function die(msg) {
  console.error('\n  ERROR: ' + msg + '\n');
  process.exit(1);
}

// Pull the first capture group out of `html`, or die with a helpful message.
function grab(re, html, label, slug) {
  const m = html.match(re);
  if (!m) die(`post "${slug}": could not find ${label}.`);
  return m[1].trim();
}

// Turn the <h1> inner markup into a clean single-line headline:
// drop <br> and <span> wrappers (replacing with a space), strip any other tag,
// collapse whitespace. Handles both "A:<br>B" and "A:<span ...>B</span>".
function headlineFrom(html, slug) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) die(`post "${slug}": no <h1> found.`);
  return m[1]
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Breadcrumb category step for a post: Home > Guides > [Category] > Post.
// Uses the post's first category, mapped to its label (blog-data nav) and its
// listing URL (blog-data pages dir). Returns null if the post has no category.
function categoryStep(post) {
  const key = (post.categories || [])[0];
  if (!key) return null;
  const nav = data.nav.find((n) => n.key === key);
  const page = data.pages[key];
  if (!nav || !page) die(`post "${post.slug}": category "${key}" is not in blog-data nav/pages.`);
  return { name: nav.label, item: `${SITE}/blog/${page.dir}/` };
}

// Build the JSON-LD object for one post from its on-page fields + blog-data dates.
function schemaFor(post, html) {
  if (!post.published || !post.updated) {
    die(`post "${post.slug}": missing published/updated in blog-data.js.`);
  }
  const canonical = grab(/<link\s+rel="canonical"\s+href="([^"]+)"/i, html, 'canonical URL', post.slug);
  const description = grab(/<meta\s+name="description"\s+content="([^"]*)"/i, html, 'meta description', post.slug);
  const image = grab(/<meta\s+property="og:image"\s+content="([^"]+)"/i, html, 'og:image', post.slug);
  const headline = headlineFrom(html, post.slug);

  const breadcrumb = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/blog/` },
  ];
  const cat = categoryStep(post);
  if (cat) breadcrumb.push({ '@type': 'ListItem', position: breadcrumb.length + 1, name: cat.name, item: cat.item });
  breadcrumb.push({ '@type': 'ListItem', position: breadcrumb.length + 1, name: headline, item: canonical });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${canonical}#article`,
        headline: headline,
        description: description,
        image: image,
        datePublished: post.published,
        dateModified: post.updated,
        inLanguage: 'en-GB',
        mainEntityOfPage: canonical,
        isPartOf: { '@id': `${SITE}/#website` },
        author: {
          '@type': 'Organization',
          name: 'ExpatLawyerSpain',
          url: `${SITE}/`,
        },
        publisher: {
          '@type': 'Organization',
          name: 'ExpatLawyerSpain',
          logo: {
            '@type': 'ImageObject',
            url: `${SITE}/images/logo-tree-44.png`,
          },
        },
      },
      { '@type': 'BreadcrumbList', itemListElement: breadcrumb },
    ],
  };
}

// Wrap the JSON in the marked <script> block, indented to sit in <head>.
function blockFor(post, html) {
  const json = JSON.stringify(schemaFor(post, html), null, 2);
  // Sanity: the JSON we just built must parse.
  JSON.parse(json);
  return `  ${OPEN}\n  <script type="application/ld+json">\n${json}\n  </script>\n  ${CLOSE}\n`;
}

// Escape a literal string for safe use inside a RegExp.
function reEsc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Insert or replace the marked block, immediately before </head>. Idempotent.
function inject(html, block, slug) {
  const re = new RegExp(`[ \\t]*${reEsc(OPEN)}[\\s\\S]*?${reEsc(CLOSE)}\\n?`);
  if (re.test(html)) return html.replace(re, block);
  const headClose = html.indexOf('</head>');
  if (headClose === -1) die(`post "${slug}": no </head> to inject before.`);
  return html.slice(0, headClose) + block + html.slice(headClose);
}

function main() {
  let changed = 0;
  let checked = 0;
  for (const post of data.posts) {
    const file = path.join(BLOG_DIR, `${post.slug}.html`);
    if (!fs.existsSync(file)) die(`post "${post.slug}": file not found at ${file}.`);
    const prev = fs.readFileSync(file, 'utf8');
    const next = inject(prev, blockFor(post, prev), post.slug);
    checked++;
    const rel = path.relative(path.join(__dirname, '..'), file);

    if (prev === next) {
      console.log(`  =  ${rel} (no change)`);
      continue;
    }
    if (checkOnly) {
      console.log(`  ~  ${rel} WOULD CHANGE`);
      changed++;
      continue;
    }
    fs.writeFileSync(file, next);
    console.log(`  +  ${rel} written`);
    changed++;
  }
  console.log(`\n  ${checked} posts checked, ${changed} ${checkOnly ? 'would change' : 'changed'}.\n`);
  if (checkOnly && changed > 0) process.exit(1); // handy for a pre-deploy check
}

main();
