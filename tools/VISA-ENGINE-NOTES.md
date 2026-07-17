# The visa checker and the eligibility engine: how they work

*(The tax calculators have their own notes: `tools/TOOLS-NOTES.md` for the
standard rates and `tools/RELIEFS-NOTES.md` for the reliefs. This file
covers the eligibility engine and its first face, the visa checker at
`/spain-visa-checker`.)*

## What this is

A general **eligibility engine**: rule sets in the legal-data spine describe
who qualifies for what, and one pure evaluator (`js/eligibility-engine.js`)
checks a person's answers against them. Visas are the first rule set
(`tools/legal-data/visas.js`). The engine knows nothing about visas: a
future process checklist, a Beckham-regime checker or any other "do I
qualify" tool adds its own domain file with the same shape and reuses the
engine, the validator and the build unchanged. That generality is the point;
it was the design brief.

It is deliberately separate from `js/calc-engine.js` (the numeric tax
engine). The two share the spine's provenance and draft-gating discipline,
not code.

## The parts

| Piece | File | What it does |
| --- | --- | --- |
| Visa rules | `tools/legal-data/visas.js` | One rule per visa: applicability by nationality, criteria, next steps. Full field documentation in its header. |
| Income references | `tools/legal-data/income-refs.js` | The monthly IPREM and SMI. Every income threshold is a multiple of one of these, never a euro amount in a rule. |
| Vocabulary | `tools/legal-data/index.js` | `eligibilityConditionTypes` (askable + lawyer-route), `nationalityGroups`, the official-source host allowlist. |
| Engine | `js/eligibility-engine.js` | Pure tri-state evaluation. UMD: same file runs in the browser and in Node. |
| Validator | `tools/validate-legal-data.js` | Rejects malformed or unsourced rules; prints the verification worklist. |
| Page UI | `js/visa-checker.js` | Reads the embeds, calls the engine, renders. No logic, no figures. |
| Copy | `tools/visa-checker-copy.js` | Every user-facing string. No visa facts, no euro amounts. |
| Build | `tools/build-tool-pages.js` | Builds `/spain-visa-checker` next to the ITP page. Ships verified rules only. |
| Tests | `tools/test/eligibility.test.js` + `tools/test/fixtures/visa-fixtures.js` | The invariants below, pinned. |

## The invariants (what the tests actually prove)

1. **No false positive.** Every criterion evaluates tri-state: met, not met,
   or unknown. A missing or unparseable answer is unknown, and unknown can
   never produce "eligible". Pinned by an exhaustive sweep: all 19,683
   tri-state answer combinations for the digital nomad rule are checked
   against an independent oracle written from the spec.
2. **Draft never ships, at two layers.** The build embeds only shippable
   rules; the engine independently refuses drafts at evaluation time. A rule
   is shippable only when the rule itself AND every criterion AND every
   income figure it references are all `status: 'verified'`. One draft
   anywhere holds the whole visa back, and the validator's `--list` names
   the blockers.
3. **The nationality gate comes first.** Until nationality is answered,
   every rule returns need-more-info asking only for nationality; nothing
   else is asked and no eligibility is hinted. EEA/Swiss short-circuits to
   the honest "you do not need a visa" path. Post-Brexit UK is a third
   country and never inherits the EEA path.
4. **Lawyer-route conditions never auto-grant.** A rule carrying one
   (`arraigoVariantAssessment`, `sponsorMeansAndHousing`, the national
   employment test, or ANY condition type the engine does not recognise)
   tops out at need-more-info with the "a lawyer can confirm" line. This is
   the honest-routing product decision: arraigo, family reunification and
   the employed work permit can never say "eligible", by design.
5. **A hard no is final.** One explicitly failed AND-criterion makes the
   visa not-eligible, whatever else is unknown; the bar for a family only
   rises, so failing the single-applicant floor is a safe final no. When
   family members are unanswered and income clears the floor, the answer is
   need-more-info, never eligible (assuming zero dependants would be a
   false-positive vector).
6. **No euro amount is ever authored.** Thresholds are figure x multiple
   (+ per-family-member multiples), computed by the engine in integer
   cents. The validator rejects a euro sign in any criterion label. Update
   the IPREM or SMI figure and every visa threshold, page table and result
   moves with it.

## How the tri-state works, in one paragraph

Each criterion type maps to one answer key (the `CRITERION_KINDS` registry
in the engine). Booleans: true is met, false is not met, absent is unknown.
Numbers: compared against the rule's value, absent is unknown, `inclusive:
false` means strictly over/under. Thresholds: computed from the referenced
figure; the family count changes the bar, so an unanswered count keeps the
criterion unknown once income clears the floor. `anyOf` groups are genuine
legal alternatives: one met leaf satisfies the group, all-failed fails it,
anything else leaves it unknown and asks for the unknown leaves' answers.
The rule outcome follows strict precedence: any failed criterion means
not-eligible; a lawyer-route condition caps at need-more-info; any unknown
means need-more-info (with `missingInputs` naming what to ask); only a full
set of explicitly met criteria means eligible.

## Draft to verified: Olivia's workflow

Exactly the ITP discipline. Everything lands as `draft`; only you flip to
`verified`, only after reading the official source yourself; the production
page shows a visa only when the rule line and every criterion and every
referenced figure are verified.

```
node tools/validate-legal-data.js --list     # the worklist, source links ready to click
node tools/validate-legal-data.js            # after edits: the shape gate
node --test tools/test/                      # the invariants
node tools/build-tool-pages.js               # rebuild (skips the page while 0 verified)
node tools/build-tool-pages.js --allow-draft # local preview, red banner + noindex, never merged
```

Suggested verification order (traffic first): **digital nomad -> non-lucrative
-> student**, then the rest. The page ships with whatever subset is verified;
unverified visas simply do not appear, exactly like unverified ITP regions.

A criterion can only be verified when its source URL is on the
`officialSourceHosts` allowlist in `tools/legal-data/index.js` (the
immigration hosts inclusion.gob.es, migraciones.gob.es, exteriores.gob.es
and administracion.gob.es were added for this engine). The two income
figures (`income-refs.iprem-monthly`, `income-refs.smi-monthly`) gate every
means threshold, so verify those first; the validator's HELD BACK section
will point at them until you do.

## NEEDS YOUR EYES: flags carried in the draft rules

Every flag below also lives in the `note` of the rule or criterion it
belongs to, so the worklist will re-surface them. Practice-versus-statute
flags mean the multiple is what officials apply, not what the law prints.

1. **SMI basis for the digital nomad income floor**
   (`visa.digital-nomad.income` + `income-refs.smi-monthly`): UGE practice
   has varied between 200% of the 14-payment monthly SMI (EUR 2,442 today)
   and 200% of the annualised monthly average (EUR 2,849, the higher bar).
   The spine carries the 14-payment figure and the result carries a
   budget-a-margin userNote. Settle against the current UGE FAQ.
2. **Entrepreneur means multiple** (`visa.entrepreneur.income`/`savings`):
   200% IPREM is UGE practice, not in Ley 14/2013. Confirm the current
   means guidance.
3. **EU registration resources figures**
   (`visa.eu-registration.means-and-insurance`): 100% IPREM + 70% per
   family member is administrative practice; RD 240/2007 sets no figure.
   The health-insurance half of art 7.1(b) is folded into this criterion
   (a yes means both), noted in the criterion.
4. **Family reunification reduced means test**: where minors are reunited a
   lower test tied to the Ingreso Mínimo Vital can apply. NOT modelled (it
   is not IPREM-anchored); the userNote routes it to a lawyer. Decide if
   that stays.
5. **NLV reglamento references**: the income/savings requirement carries
   RD 557/2011-era provenance; re-pin article numbers to RD 1155/2024.
6. **Student savings basis**: the 12-month lump-sum leg scales to a
   one-year course; shorter courses scale down (noted, not modelled).
7. **Arraigo family-tie breadth** (`visa.arraigo.family-tie`): the askable
   question is broader than the legal test (Hoja 26 turns on the exact
   relationship). Safe because arraigo can never auto-grant, but confirm
   the wording reads right to you.
8. **Arraigo applicability for UK/US** is `not-needed` with an explanatory
   note ("rarely fits, open to anyone without status"). Semantically it is
   "rarely relevant", which the applicability vocabulary cannot say. If you
   would rather UK/US see arraigo evaluated, flip those to `applies`.

## Accuracy-audit closure (2026-07-18) and what still NEEDS YOUR EYES

The July accuracy audit (`els-visa-itp-accuracy-audit-2026-07.md`) fixes are
applied, all still `draft`. Four routes were ADDED and three rules corrected:

- **Arraigo familiar** rewritten to RD 1155/2024 scope (parent of an EU/EEA/Swiss
  minor, or carer of a disabled EU/EEA/Swiss national); it no longer covers
  family of Spanish citizens.
- **`visa.familiar-espanol`** added: the art. 94 5-year card for the non-EU
  family of a Spanish citizen (the route arraigo familiar used to cover). Always
  lawyer-routes.
- **`visa.self-employed`** added: the ordinary autonomo / cuenta propia route
  (Hoja 14), distinct from the ENISA entrepreneur visa. Always lawyer-routes.
- **`visa.blue-card`** added: EU Blue Card / highly qualified professional.
- **`visa.eu-family-member`** added: stub closing the dangling pointer from
  family reunification (non-EU family of an EEA/Swiss citizen). Always lawyer-routes.
- **Entrepreneur means** corrected to 100% IPREM + 50%/family member (was a wrong
  200% + 75%/25%), verified against the UGE Criterios PDF; kept draft.
- **Student** medical-certificate criterion added; **family reunification**
  citation fixed to arts 65-68; **NLV** health cover widened to "public or
  private" and re-pinned to arts 60-63.

**Blue Card salary floor - self-updating DISPLAY figure (new pattern).** Item 2
of the audit asked for the floor as a 1.4x INE-average multiplier that
self-updates. It is modelled as a lawyer-route (never auto-grants), AND the
salary criterion now carries `figureId: income-refs.ine-average-annual` +
`displayMultiple: 1.4`. The engine ignores these (a lawyer-route type returns
unknown before it looks at figureId), so eligibility is untouched; the checker
uses them only to SHOW the computed floor (figure x 1.4), which self-updates from
the spine like the IPREM/SMI figures. Because the criterion carries the figureId,
the build ship-gates the whole Blue Card route on that figure being verified.
The figure value (EUR 29,540, giving a floor of ~EUR 41,356) is DERIVED and draft
- VERIFY the exact INE base against Orden PJC/44/2026 before flipping it.

**Two verification actions still open (both LOW, both draft, flagged in-rule):**
1. **Work permit qualifications article** (`visa.work-employee.qualifications`):
   art. 75.1 is the shortage-occupation catalogue, NOT the qualifications rule.
   The correct RD 1155/2024 cuenta-ajena article is deliberately left uncited
   rather than guessed - pin it from Hoja 12 / the reglamento at verification.
2. **DNV company age + Social Security** (`visa.digital-nomad.relationship-3-months`):
   confirm the "company operating >= 1 year" claim against the UGE FAQ / Ley
   14/2013 art 74, and note that mandatory RETA / Social Security registration is
   surfaced in nextSteps rather than modelled as a gating criterion (deliberate).

## Vocabulary wrinkles to know about (deliberate, safe-direction)

- The employed work permit's qualifications criterion reuses the
  `universityDegree` askable type; the shared checker question asks about a
  degree or recognised qualification. A tradesperson answering no is
  under-granted (safe direction), and the permit lawyer-routes anyway.
- EU registration's "you work in Spain" leaf reuses `jobOfferInSpain`. The
  question wording covers both readings.
- Disability-style granular asks do not exist here; anything the vocabulary
  cannot express honestly is a lawyer-route condition, never a guess.

## How to add a visa (or fix one)

1. Copy an existing rule in `tools/legal-data/visas.js` and fill every
   field; the file header documents the shape. Criteria use only the
   askable types in `eligibilityConditionTypes` (index.js). If a
   requirement cannot be expressed with them, model it as a lawyer-route
   condition; new lawyer-route type names can be added to index.js freely
   (the engine treats unknown types as never-granting by design). A new
   ASKABLE type needs an engine change: the `CRITERION_KINDS` registry in
   `js/eligibility-engine.js`, a question spec in the copy deck, an entry
   in `checker.questionOrder`, and tests. That is a Claude Code job.
2. Income thresholds reference `income-refs.*` figures with a `multiple`
   and optional `dependants: { first, additional }` extra multiples. The
   dependants answer counts family members joining BEYOND the applicant;
   work one example by hand before you trust an encoding (see the
   family-reunification note for the trap).
3. `node tools/validate-legal-data.js` and fix everything it names.
4. Add 2-3 hand-worked scenarios to
   `tools/test/fixtures/visa-fixtures.js` (state the arithmetic in the
   name or a comment) and run `node --test tools/test/`.
5. Verify each criterion against its official source, flip to verified,
   rebuild.

## How a future tool rides the engine (no Fable needed)

1. New domain file, e.g. `tools/legal-data/checklists.js`, exporting
   `{ domain, domainLabel, rules: [...] }` with the visas.js rule shape.
2. Register it in `eligibilityDomains` in index.js. The validator picks it
   up automatically.
3. Call `ELSEligibility.checkEligibility({ rules, figures, conditionTypes },
   answers)` from its page. The result contract is documented in the
   engine header.
4. Copy deck + page entry in `tool-pages-data.js` (`kind: 'checker'`),
   build, done. The draft gate, the worklist and the freshness guard all
   apply unchanged.

## Delegation map (how this was built, July 2026)

| Piece | Model |
| --- | --- |
| Schema, engine, validator extension, invariant tests, exemplar rules (DNV + NLV), all reviews, this file's core | Fable |
| Research + transcription of the other six visas (draft), page copy deck, checker UI | Opus, against Fable briefs; Fable reviewed and fixed two encoding bugs (family-reunification dependants, arraigo anyOf) |
| Build-script checker kind, static SEO tables, cluster in-links, pillar regen | Sonnet, against a Fable spec; Fable reviewed |

## If it breaks

| Message | What it means |
| --- | --- |
| `REJECTED` naming a `visa.*` id | A rule or criterion is malformed; the message names the exact field. Fix it in visas.js. |
| `HELD BACK ... blocked by:` | A verified rule cannot ship because a listed criterion or figure is still draft. Verify the blockers. |
| `visa checker: 0 verified visas, page not built` | Not a bug: the draft gate. Verify at least one visa end to end and rebuild. |
| The build dies with the same message | The page HAD shipped and would now go stale: something was un-verified. Restore it or accept removing the page deliberately. |
| A scenario test fails after an IPREM/SMI change | The fixtures pin hand-worked euros. Re-work the affected scenarios by hand in the same commit, exactly as with the ITP fixtures. |
| A question never appears on the page | Its answer key is missing from `checker.questionOrder` or `checker.questions` in the copy deck. |
