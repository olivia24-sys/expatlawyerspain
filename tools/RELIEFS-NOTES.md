# Relief rules and the v2 calculator: how they work

*(Standard rates and the v1 calculator have their own notes:
`tools/TOOLS-NOTES.md`. This file covers the reliefs on top: reduced rates
and bonifications a private buyer qualifies for based on their
circumstances.)*

## What a relief rule is, and where it lives

A relief is a discount on top of the standard rate in `tools/legal-data/
itp.js`: a lower rate, a percentage off the quota (a bonificacion), or an
exemption. Every relief rule lives in one array, `tools/legal-data/
itp-reliefs.js`. The engine that evaluates them is `js/calc-engine.js`,
function `calculatePersonalisedITP`. The same one rule of provenance as the
standard figures applies here: no relief enters the array without a source
URL, an effective date, a review-by date and a note, and
`tools/validate-legal-data.js` enforces that.

Seven regions are in the spine today: Catalunya (the reference region, wired
end to end first) plus Andalucia, Comunidad Valenciana, Madrid, Illes
Balears, Canarias and Region de Murcia, added in this pass. All 73 rules are
`status: 'draft'` until Olivia checks each against its official source.

## How to add one

Copy an existing rule in `tools/legal-data/itp-reliefs.js` as a template and
fill in every field. The file's own header comment documents the full shape;
the short version:

| Field | What it is |
| --- | --- |
| `id` | unique dot-path, starting `itp.`, `ajd.` or `igic.` |
| `label` | human label, British English, shown on results |
| `region` | a key from `regions` in `tools/legal-data/index.js` |
| `appliesTo` | `resale`, `newbuild-ajd` or `newbuild-igic` |
| `result` | exactly one of a reduced `rate`, a `deduction` off the quota, or `exempt` |
| `conditions` | an AND-list of `{ type, value, ... }` the buyer must satisfy |
| `combinesWith` | `exclusive` (buyer takes the single best option) or `cumulative` (stacks on a base) |
| `stacksOn` | optional, cumulative deductions only: which base rule ids this may stack on |
| `incompatibleWith` | optional: rule ids this can never combine with |
| `effectiveFrom` / `reviewBy` / `source` / `note` / `status` | same discipline as figures |

Two gotchas that catch every new region:

- **The `anyOf` gotcha.** If the law offers genuine alternatives (large
  family OR single-parent family; under-36 OR disability OR large family),
  wrap them in `{ anyOf: [cond, cond, ...] }`. Writing them as a flat AND
  list means the rule can never match, because the buyer would need every
  alternative to be true at once. An `anyOf` group may contain only the
  `anyOf` key, nothing beside it, and needs at least two alternatives.
- **The `inclusive` gotcha.** A `maxAge`, `maxIncome`, `maxHouseholdIncome`
  or `maxSavingsIncome` condition defaults to at-or-under (`inclusive:
  true`). Set `inclusive: false` when the law says strictly under (Andalucia
  and Valencia's under-35 rules, the Balears under-36 and under-30 rules,
  Murcia's general income cap). Get this backwards and a buyer at the exact
  boundary either wrongly qualifies or wrongly misses out.

## Draft to verified workflow

Run `node tools/validate-legal-data.js --list` to see the relief worklist
alongside the figures worklist: every draft rule, its rate or deduction, its
effective date and its source link, ready to click. The one rule: a relief
can only become `status: 'verified'` once its source URL sits on the
`officialSourceHosts` list in `tools/legal-data/index.js`, the same
tax-authority hosts the figures use. The production build ships verified
rules only, and the engine independently ignores drafts regardless of what
the build does, so a draft rule can never produce a "you likely qualify" on
a live page. Belt and braces, exactly as the `itp-reliefs.js` header
describes.

## THE VERIFICATION WORKLIST

Ordered by priority. Check each rule id against its cited source before
flipping `status` to `'verified'`.

### HIGH, could produce a wrong "you qualify"

**(a) Canarias 2026 thresholds versus the stale official guide.** The 2026
figures (age up to 40, value caps 200k/300k/400k EUR, income 46,455 EUR) come
from Ley 9/2025 via KPMG tax alerts; the official ATC guide PDF still prints
the pre-reform figures (35 years, 150,000 EUR, 24,000 EUR). Confirm against
BOC 29/12/2025 before verifying any of:
`itp.canarias.habitual-residence-5pct`, `itp.canarias.large-family-1pct`,
`itp.canarias.single-parent-1pct`, `itp.canarias.disability-1pct`,
`itp.canarias.under40-bonificacion-20pct`,
`igic.canarias.newbuild-habitual-5pct`,
`igic.canarias.newbuild-habitual-superreduced-3pct`.

**(b) Balears island-cap split.** `itp.balears.habitual-4pc`,
`itp.balears.under36-first-home-2pc` and `itp.balears.disability-2pc` carry
the island-differentiated eligibility caps (`byIsland`). The three 100%
bonifications (`itp.balears.under30-100pc-bonification`,
`itp.balears.disability33-100pc-bonification`,
`ajd.balears.under30-disability33-100pc-bonification`) plus
`ajd.balears.first-home-1pc` must keep the FIXED 270,151.20 EUR cap and must
never be raised to an island figure. Confirm the island figures against
Orden 5/2026.

**(c) Madrid, no value cap on large-family.** `itp.madrid.large-family-rate`
and `ajd.madrid.large-family-bonif` deliberately carry no
`maxPropertyValue` condition. Confirm this against the consolidated statute
before verifying; this is a known aggregator error elsewhere, and adding a
cap here would be the wrong fix.

**(d) Murcia's removed 150,000 EUR cap.** `itp.murcia.young-under40-resale`
and `itp.murcia.disability-65-resale` carry no value cap in the current
text. Confirm the repeal against the live consolidated Article 6; the
research notes this is the single most consequential Murcia flag.

**(e) Catalunya's disability income cap.** `itp.catalunya.disability` is
already in the spine from the earlier pass and still needs a check of
30,000 EUR against 36,000 EUR (the young-buyer and gender-violence rates in
the same region are confirmed at 36,000 EUR).

### MEDIUM, thresholds sourced indirectly or definitions nuanced

1. **Disability degree left unstated in several regions.** Andalucia's
   disability rules (`itp.andalucia.disability`, `ajd.andalucia.disability`)
   use a 33% cross-reference the source page itself does not state
   explicitly. Canarias's `null`-degree rules
   (`itp.canarias.disability-1pct`, the anyOf inside
   `igic.canarias.newbuild-habitual-superreduced-3pct`) and Balears's
   `itp.balears.disability-2pc` use "entitled to the IRPF disability
   minimum", not a headline percentage.
2. **Valencia's income-cap attachment.** Already modelled correctly
   per-rule (young, large/single-parent family and gender-violence carry an
   income cap; VPO and disability do not), but flagged for a primary-text
   read of arts. 13 and 14, Ley 13/1997.
3. **Catalunya large-family and single-parent income figures**, and the AJD
   0.1% VPO rule, were read via ATC-quoting summaries rather than verbatim
   article text.
4. **Valencia's Iberley-sourced cross-references.** The rates, the 180k
   split, clave codes and income figures are confirmed on official ATV and
   GVA pages; only fine cross-reference wording leaned on an aggregator.
5. **Canarias IGIC 5%/3% overlap and income basis.** Confirm the income
   limit attaches to the 3% super-reduced tier
   (`igic.canarias.newbuild-habitual-superreduced-3pct`) and not the plain
   5% (`igic.canarias.newbuild-habitual-5pct`), and whether IGIC uses a
   household basis versus the per-buyer basis used for the ITP under-40
   bonificacion.

## FLAGGED MODELLING DECISIONS Olivia must sign off

1. **Balears bandCap uses marginal continuation.** Above 270,151.20 EUR the
   standard marginal scale carries on for the excess, rather than the whole
   price reverting to the standard scale. This is the same structure the
   existing Balears tests in `tools/test/reliefs.test.js` already validate.
2. **One income input covers both individual and household caps.** Several
   rules keep `maxIncome` (individual) and `maxHouseholdIncome` (joint) as
   separate AND conditions (the Balears 100% bonifications, several
   Valencia and Canarias rules). A joint filer who has only answered one of
   the two income questions is deliberately under-granted rather than
   guessed at: the calculator would rather ask twice than grant wrongly.
3. **Disability is asked in bands, not a headline percentage.** The
   calculator asks `none` / `33to64` / `65plus`. Valencia's
   disability rules (physical/sensory 65%+ OR intellectual/mental 33%+ in
   the law) are modelled as a flat `disability: 65` condition. This
   under-grants a 33-64% intellectual/mental buyer, who resolves `unknown`
   and never `yes`; the safe direction, and noted on both Valencia
   disability rules.
4. **`priorHomeSaleWindow` is satisfied only when the buyer owns no other
   home.** Madrid's large-family reliefs require a prior habitual home to
   be sold within a legal window either side of the purchase. The
   calculator treats this as satisfied when `ownsOtherHome` is false and
   unknown otherwise; a buyer still holding a prior home needs the lawyer
   to confirm the sale window rather than being auto-granted.
5. **Madrid's graduated AJD base is conditioned on habitual residence**, not
   the research file's original placeholder condition. This is the rule
   the other three Madrid AJD bonifications stack onto via `stacksOn`.
6. **Cumulative deductions apply sequentially, on the reducing quota,** if
   two ever qualify to stack on the same base. Confirmed by the existing
   Canarias and Madrid stacking tests; no region added in this pass
   introduces a case where three or more cumulative deductions stack at
   once, so this has not been separately re-tested here.

## How to add a whole region end to end

1. Find the region's reduced-rate and bonificacion rules in the official
   regional tax-authority pages (or a research pass that already did that
   search, citing official sources).
2. Transcribe each rule into `tools/legal-data/itp-reliefs.js` as
   `status: 'draft'`, following the field table above.
3. Run `node tools/validate-legal-data.js` and fix every reported error
   before moving on.
4. Write hand-worked test scenarios (2-3 per region is enough for a smoke
   test): work the expected total by hand from the standard rate in
   `itp.js` and the relief's own value, `bandCap` or `bands`, and state the
   arithmetic in a comment above the assertion. See
   `tools/test/relief-regions.test.js` for the pattern.
5. Run `node --test` and fix anything that fails.
6. Verify each rule against its official source one at a time, then flip
   `status` to `'verified'` only for the ones checked.

## Daily commands

| What you want | Command |
| --- | --- |
| Validate the spine (figures and reliefs) | `node tools/validate-legal-data.js` |
| Your relief and figure verification worklist | `node tools/validate-legal-data.js --list` |
| Freshness check (fails on stale) | `node tools/validate-legal-data.js --check` |
| Run the tests | `node --test "tools/test/**/*.test.js"` |

There is no separate build command for reliefs: `tools/build-tool-pages.js`
embeds them in the calculator page alongside the figures, filtered exactly
the same way. A production build (`node tools/build-tool-pages.js`) ships
verified rules only; while every rule is draft the page embeds an empty
reliefs list and the refine section stays dormant, so the live calculator
behaves exactly like v1. `--allow-draft` embeds drafts for a local preview
under the red banner, never for merging, and stamps a `draftPreview` flag
into the embed so the refine flow can be walked on that preview before any
rule is verified. See `tools/TOOLS-NOTES.md` for the full build commands.
