# Blog category pages — how they stay in sync

## What this is

The blog has one **index page** (`/blog/`) and several **category pages**
(`/blog/property/`, `/blog/tax/`, `/blog/immigration/`, `/blog/admin/`,
`/blog/moving-to-spain/`, `/blog/wills/`, `/blog/family/`).

Those pages used to be hand-built lists of cards. Every time a new post went
live, you had to remember to paste a card onto the index **and** onto the right
category page. Miss one and the post is invisible under that filter — that's how
the Conveyancing guide ended up live but missing from `/blog/property/`.

These two files fix that:

- **`blog-data.js`** — one list of every post and which categories it belongs
  to. This is the only file you edit.
- **`build-blog-listings.js`** — a small script that reads `blog-data.js` and
  rewrites all eight listing pages so they always match the list.

The script **only ever touches the listing pages**. It never changes a blog
post, its URL, its wording, its images, or its SEO tags.

## How to run it

From the repo root (the `website` folder), run:

```
node tools/build-blog-listings.js
```

It prints one line per page, e.g. `+ blog/property/index.html written` or
`= blog/tax/index.html (no change)`. That's it — then commit and push as usual.

To see what *would* change without writing anything:

```
node tools/build-blog-listings.js --check
```

(You need Node installed. Any recent version is fine. No `npm install`, no
build tools, no dependencies.)

## How to add a new blog post so it shows up automatically

1. Create the post the normal way: `blog/<your-slug>.html`.
2. Open **`tools/blog-data.js`** and add one entry to the `posts` list.
   Put it where you want it to appear (the list is top-to-bottom order).

   ```js
   {
     slug: 'your-slug',                    // matches blog/your-slug.html → /blog/your-slug
     tag: 'Property Law',                  // the small label on the card
     title: 'Your Card Headline',
     desc: 'One-sentence summary shown on the card.',
     categories: ['property', 'tax'],      // every category page it should appear on
     featured: [],                         // leave empty unless it's the big top card (see below)
   },
   ```

3. Run `node tools/build-blog-listings.js`.
4. Commit and push. Done — the post now appears on `/blog/` and on every
   category page you listed.

### Categories you can use

`property`, `immigration`, `tax`, `admin`, `moving-to-spain`, `wills`, `family`.
A post can be in more than one. If you leave `categories` empty, the post still
shows on the main `/blog/` page but on no category page.

### Making a post the "featured" (big top) card

Each page has one large featured card at the top. To make a post the featured
card on a page, add that page's key to its `featured` list **and** give it an
image:

```js
{
  slug: 'your-slug',
  tag: 'Property Law',
  title: 'Your Card Headline',
  desc: 'One-sentence summary.',
  categories: ['property'],
  featured: ['property'],                          // big card on /blog/property/
  img: '/images/blog/your-image.jpg',              // required when featured
  alt: 'Short description of the image',           // required when featured
},
```

The main `/blog/` page's featured card says **"Featured guide"**; the category
pages say **"Most read guide"**. That wording is set per page in `blog-data.js`
under `pages`.

## How to add a brand-new category

1. In `blog-data.js`, add the category to two places:
   - the `nav` list (this is the pill that appears on every page), and
   - the `pages` list (its title, description, heading, etc.).
2. Add that category key to the relevant posts' `categories`.
3. Pick one post to be its featured card (`featured: ['your-new-category']`
   plus `img`/`alt`).
4. Run the script. It creates `blog/<your-new-category>/index.html` for you.

## If it breaks

The script tries to fail loudly with a plain message instead of writing broken
pages. Common messages:

- **`page "X" has no featured post`** — every page needs exactly one featured
  card. Add `"X"` to some post's `featured` list.
- **`page "X" has N featured posts`** — two posts both claim to be featured on
  the same page. Remove `"X"` from all but one.
- **`featured post "slug" needs an "img" and "alt"`** — the featured card shows
  an image, so the featured post must have `img` and `alt`.
- **`post "slug" lists unknown category "X"`** — a typo in a `categories` or
  `featured` value. It must match a key in the `pages` list.

Nothing is written until all checks pass, so a broken run leaves the live pages
untouched. Fix the message in `blog-data.js` and run again.

### Sanity checks

- Re-running the script when nothing changed should report `no change` on every
  line. If it wants to rewrite pages you didn't touch, someone hand-edited a
  listing page — let the script win (that's the point) and check the diff.
- `git diff` before pushing always shows exactly what changed.

## What it deliberately does NOT do

- It does not read or change any blog **post** file.
- It does not touch URLs, slugs, meta tags, canonical links, or anything SEO.
- The card wording lives here in `blog-data.js`, on purpose: the cards use
  shorter, punchier copy than the posts' own SEO descriptions, so they are kept
  separate.
