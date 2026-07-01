# PROPOSAL (not applied): cluster down-links from blog posts to the pillar pages

**Status: awaiting Olivia's approval. Nothing in this file has been done.**
Blog post copy and SEO are frozen; per the build brief, edits to existing
posts need explicit sign-off first. This file lists every line that would be
touched, so the approval is informed.

## The idea

The blog posts already link to the lawyer directory at their CTA moments —
38 links of the form `/?specialty=X` (the old homepage filter, which now
forwards to `/lawyers`). Each of those is the natural down-link the new
pillar pages need. The proposal is a **pure href swap**: the visible link
text, surrounding copy and everything else stays byte-identical; only the
`href` changes from the filter URL to the matching pillar page.

Why it's safe: the links already exist and already point at the directory;
the pillar page is a better landing (firm table + facts) for the same intent.
No new sentences, no copy changes, no layout changes.

Note: `?specialty=family` links (getting-married post, 3 links) have **no
pillar page** (family is deliberately a blog-only cluster) — those are left
untouched.

## Exact lines (35 href swaps across 15 posts)

Swap `…/?specialty=immigration` → `/immigration-lawyers-spain`:
- blog/golden-visa-spain-guide.html:136
- blog/digital-nomad-visa-spain.html:157
- blog/non-lucrative-visa-spain.html:174
- blog/moving-to-spain-from-uk.html:374
- blog/retire-in-spain.html:126, 289, 336

Swap `…/?specialty=property` → `/property-lawyers-spain`:
- blog/buying-property-spain-foreigner.html:229, 358, 409
- blog/conveyancing-spain.html:155, 239, 288
- blog/nie-number-spain-lawyer.html:417, 498
- blog/spain-non-eu-property-tax.html:194, 301
- blog/property-lawyer-spain.html:271, 367
- blog/spanish-property-taxes-foreign-owners.html:191, 426
- blog/spanish-legal-glossary.html:930

Swap `…/?specialty=tax` → `/tax-lawyers-spain`:
- blog/beckham-law-spain.html:251, 366
- blog/capital-gains-tax-spain.html:136, 286, 335
- blog/retire-in-spain.html:221
- blog/spanish-property-taxes-foreign-owners.html:289, 377

Swap `…/?specialty=wills` → `/wills-inheritance-lawyers-spain`:
- blog/inheritance-law-spain-expats.html:193, 207, 219, 273, 308

(Line numbers as of branch `money-pages`, commit b38f5e1. A tiny script can
do the swaps mechanically on approval so nothing else in those files moves.)

## Decision needed from Olivia

- [ ] Approve all 35 href swaps (recommended), or
- [ ] Approve per-pillar, or
- [ ] Leave the posts untouched for now (pillar pages still link *down* to the
      posts either way; only the post→pillar direction waits).
