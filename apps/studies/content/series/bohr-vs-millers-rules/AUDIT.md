# AUDIT — Bohr-vs-Miller, Revelation citation pass

**Scope.** Verify, verse-by-verse across all 22 chapters of Revelation (403 verses), that the citations we attribute to Uriah Smith (`DAR …`) and to Stephen Bohr (volume + page range) are **accurate copies of what those sources actually say**, with no important surrounding context omitted that would change the meaning. Re-audit the Miller-rule call (`status.html` + `violations.items[]`) on every verse.

This is not a re-interpretation pass. It is a fidelity pass on the source chain that lives in `chapters/rev-*.json` (sibling directory to this file).

This file is the binding methodology + hermeneutic note for any re-audit. The per-chapter working logs (`audit/rev-N.md`) used during the May 2026 pass have been removed — all corrections were applied to the chapter JSONs in-place, and per-chapter findings are recoverable from `git log -- chapters/rev-N.json` if needed.

---

## Methodology

For each verse the loop is the same. Do not skip steps.

### 1. Pull the verse's current claims

Open the chapter JSON for the verse, e.g. `chapters/rev-12.json`, locate the verse, and read four fields:

- `pioneerReading.citation` — the DAR refcode(s) we claim
- `pioneerReading.html` — the actual quoted prose from DAR
- `bohrReading.citation` — the Bohr volume + page(s) we claim
- `bohrReading.html` — the actual quoted prose from Bohr

Each verse may also have `violations.items[]`, `status.html`, `symbols.html`, `notes.html`, or `extensions`. The readings are upstream; the status + violations are downstream judgments on those readings.

### 2. Verify the DAR quote against DAR

Use the local EGW database — DAR is installed (3,555 paragraphs).

```sh
bun packages/cli/src/main.ts egw lookup "DAR 509.3" --json
bun packages/cli/src/main.ts egw lookup "DAR 509.2-510.2" --json
```

What to check:

- **a. The quote exists at the cited refcode**, verbatim. Word-for-word, including italics/emphasis where we marked them. If the wording drifted (e.g. paraphrase, modernized spelling, dropped clause), flag it.
- **b. No nearby DAR paragraph reverses or qualifies the quote.** Read at least one paragraph before and one after. If `pioneerReading.citation` is `DAR 509.3` but `DAR 509.4` materially modifies the claim, the citation is incomplete.
- **c. If the verse is part of a Smith symbol-block (Smith often resolves vv. 1-6 together via a single word-list at DAR 509.3-510.x), the citation must cover the whole block, not a single paragraph.**

If the local DB lookup returns nothing for the refcode, the citation is bad — record the gap and propose the correct refcode (search by phrase: `bible egw search "<distinctive phrase>" --book DAR`).

### 3. Verify the Bohr quote against the dedicated Bohr volume

Bohr PDFs and their `.txt` extracts live at `packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/bohr/`. **Always use the dedicated volume for that Revelation chapter** — see the chapter→volume table below. Cross-references from his _Daniel 11_ book are not a substitute.

The line-to-page lookup `bohr-page-index.json` in the same dir maps `.txt` line numbers to PDF pages, so a grep hit yields a page citation without re-scanning `Page N of XXX` markers.

```sh
grep -n "distinctive phrase from the quoted html" \
  packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/bohr/bohr-great-prophecies-daniel-revelation.txt
```

What to check:

- **a. The phrase is in the cited volume on the cited page(s).** If the citation says `pp. 29-30` and the phrase is on `p. 32`, fix the page range.
- **b. No nearby Bohr paragraph reverses or qualifies the quote.** Same one-paragraph-before, one-paragraph-after rule.
- **c. The quote isn't lifted from a Bohr aside that he himself attributes to someone else** (e.g. Bohr quoting Anderson, Ford, etc. as a foil). If Bohr is repeating a view to refute it, attributing it to him is a misread.
- **d. If Bohr says the same thing more clearly elsewhere in the same volume, prefer the clearer citation.**

### 4. Audit the Miller-rule call

This step is **not** optional — audit every verse's `status.html` and (if present) `violations.items[]` even when the DAR/Bohr quotes were verbatim. The Miller-rule lens uses William Miller's 14 Rules (see [`packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/00-foundation/01-millers-rules.md`](packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/00-foundation/01-millers-rules.md) for the canonical list).

For each verse, check:

- **a. Does the violation actually exist?** Reread the verbatim Bohr quote you just verified. Does the violation justification (`violations.items[N].body`) describe what Bohr really says, or has the extractor inferred a stronger position than the source supports? Convergent-reading verses (status starts with "No violation") still need a sanity-check that "convergent" is true — Bohr and Smith sometimes share a framework but split on the historical specifier, which is a divergence, not a violation but worth flagging.
- **b. Does the rule cited actually apply?** Rule numbers (`ruleNumber`) and names (`ruleName`) must line up with the listed 14 rules. A justification that invokes Rule XI ("literal first") to fault Bohr for taking a _symbol_ literally is fine; one that invokes Rule XI against a passage Bohr explicitly reads as symbolic is mis-targeting the rule.
- **c. Apply the chronological-coherence test** (see Hermeneutic note below). A frequent error in published Bohr-vs-Miller assessments treats it as if Miller's "scripture interprets scripture" rule were silent on time-of-fulfillment. It is not.
- **d. Is the verdict proportional?** "VIOLATION" should require a textually-grounded contradiction (Bohr collapses two distinct vision-actors, ignores the time-frame, etc.). Soft divergences — different historical specifier inside the same framework — are not violations and should be downgraded to status notes.

If the extractor's violation call survives this audit, leave it. If it doesn't, edit the JSON (downgrade status, rewrite the justification, or remove the spurious item from `violations.items[]`) per step 5.

### 5. Apply fixes to the chapter JSON, then record the result

If steps 2-4 surfaced a fixable problem — wrong page in a Bohr citation, a quote that landed on an adjacent page, a status verdict that needs upgrading or downgrading — edit the corresponding `chapters/rev-N.json` field in the same pass. Real corrections go into the JSON.

The May 2026 audit pass used per-chapter working files (`audit/rev-N.md`) to track ticked-off verses + receipts; if you re-run the audit and want a similar log, recreate them ad-hoc. The commit history on `chapters/rev-*.json` carries the durable record.

---

## Hermeneutic note — Revelation must be chronologically coherent within each vision

This is a binding constraint that several published Bohr-vs-Miller assessments miss. Miller Rule V says **"Scripture must be its own expositor… God has revealed it so that the wayfaring man, though a fool, need not err therein"** — which forbids a reading that makes the text contradict itself.

The principle is **chronological coherence within the vision-context**, not a blanket ban on past-event symbols. Revelation does refer backward at times (e.g. the slain Lamb of Rev 5:6 looks back to Calvary). What it does **not** do is move forward through a vision sequence and then drop in a pre-history flashback that breaks the sequence. Once a vision plants a chronological anchor, symbols that follow in that same vision must be downstream of that anchor.

Apply this to Rev 12:

- **Rev 12:1-2** plants an unambiguous anchor: the woman, "travailing in birth, and pained to be delivered." The natural reading (confirmed by Rev 12:5 — "she brought forth a man child, who was to rule all nations with a rod of iron") fixes this on **the birth of Christ**.
- Therefore everything that follows in this vision must be **at or after** the birth of Christ. The vision cannot, three verses later, jump back to pre-Edenic angelic history without breaking its own chronology.
  - **"His tail drew the third part of the stars of heaven, and did cast them to the earth"** (Rev 12:4) cannot primarily be Satan's pre-Edenic seduction of a third of the angels, because the surrounding verses (vv. 1-2, v. 5) have already placed us at the birth of Christ.
  - **"There was war in heaven: Michael and his angels fought against the dragon"** (Rev 12:7) cannot primarily be the pre-creation casting-down of Lucifer for the same reason. The chronologically coherent referent is **the Cross**, which is where the usurped dominion was wrested back from Satan to Christ, after which Satan can no longer appear before God as the legal representative of earth (cf. Job 1; John 12:31 "now shall the prince of this world be cast out"; Rev 12:10 "now is come… the kingdom of our God"). Rev 12:10's "now" is the chronological hinge — it points to _that_ moment of victory, not a pre-creation one.

When auditing a verse, the test to apply is:

1. What chronological anchor(s) has the current vision already planted (a named event, a dated symbol, an explicit "now")?
2. Does the proposed reading of this verse sit **at or after** the most recent upstream anchor and **at or before** the next downstream anchor?
3. If not, the reading breaks the vision's chronology and contradicts Miller Rule V — record it as a **chronological-coherence violation**, even if no other Miller rule is named in the source markdown.

> Vision plants an anchor → Miller Rule V binds the vision to its own chronology → out-of-sequence readings contradict the anchor → violation.

---

## Chapter → Bohr volume map

Always use the dedicated Bohr volume for the chapter being audited. The `.txt` extracts and the `bohr-page-index.json` line-to-page map are at `packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/bohr/`.

| Chapter   | Bohr primary volume                                                       | Bohr txt file                                 |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| Rev 1-3   | _Seven Churches_                                                          | `bohr-seven-churches.txt`                     |
| Rev 4-7   | _Seven Seals_                                                             | `bohr-seven-seals.txt`                        |
| Rev 8-11  | _Seven Trumpets_                                                          | `bohr-seven-trumpets.txt`                     |
| Rev 12    | _Great Prophecies_ (primary); also _Seven Trumpets_, _Close of Probation_ | `bohr-great-prophecies-daniel-revelation.txt` |
| Rev 13    | _Great Prophecies_                                                        | `bohr-great-prophecies-daniel-revelation.txt` |
| Rev 14    | _Close of Probation_ (primary); also _Seven Trumpets_, _Seven Seals_      | `bohr-close-of-probation-rev15-22.txt`        |
| Rev 15-22 | _Close of Probation_                                                      | `bohr-close-of-probation-rev15-22.txt`        |

---

## Per-chapter audit index

Density tiers (from `chapters.json`) show where the existing flagged violations cluster — useful for sequencing, but every verse is audited regardless of tier.

| Chapter                                      | Verses                      | Bohr volume          | Already-flagged violations | Audit file                           | Status      |
| -------------------------------------------- | --------------------------- | -------------------- | -------------------------- | ------------------------------------ | ----------- |
| Rev 1 — The Opening Vision                   | 20                          | _Seven Churches_     | 0                          | [`audit/rev-1.md`](audit/rev-1.md)   | ✅ Complete |
| Rev 2 — Letters (Ephesus → Thyatira)         | 29                          | _Seven Churches_     | 0                          | [`audit/rev-2.md`](audit/rev-2.md)   | ✅ Complete |
| Rev 3 — Letters (Sardis → Laodicea)          | 22                          | _Seven Churches_     | 0                          | [`audit/rev-3.md`](audit/rev-3.md)   | ✅ Complete |
| Rev 4 — The Heavenly Sanctuary               | 11                          | _Seven Seals_        | 0                          | [`audit/rev-4.md`](audit/rev-4.md)   | ⏳ Pending  |
| Rev 5 — The Sealed Scroll and the Slain Lamb | 14                          | _Seven Seals_        | 0                          | [`audit/rev-5.md`](audit/rev-5.md)   | ⏳ Pending  |
| Rev 6 — The Six Seals                        | 17                          | _Seven Seals_        | 0                          | [`audit/rev-6.md`](audit/rev-6.md)   | ⏳ Pending  |
| Rev 7 — The Sealing of the 144,000           | 17                          | _Seven Seals_        | 0                          | [`audit/rev-7.md`](audit/rev-7.md)   | ⏳ Pending  |
| Rev 8 — Trumpets 1-4                         | 13                          | _Seven Trumpets_     | 0                          | [`audit/rev-8.md`](audit/rev-8.md)   | ⏳ Pending  |
| Rev 9 — Trumpets 5-6 (HOT)                   | 21                          | _Seven Trumpets_     | 16                         | [`audit/rev-9.md`](audit/rev-9.md)   | ⏳ Pending  |
| Rev 10 — The Little Book                     | 11                          | _Seven Trumpets_     | 0                          | [`audit/rev-10.md`](audit/rev-10.md) | ⏳ Pending  |
| Rev 11 — The Two Witnesses                   | 19                          | _Seven Trumpets_     | 0                          | [`audit/rev-11.md`](audit/rev-11.md) | ✅ Complete |
| Rev 12 — The Woman, the Dragon, the Remnant  | 17                          | _Great Prophecies_   | 4                          | [`audit/rev-12.md`](audit/rev-12.md) | ⏳ Pending  |
| Rev 13 — The Sea Beast and the Earth Beast   | 18                          | _Great Prophecies_   | 1                          | [`audit/rev-13.md`](audit/rev-13.md) | ⏳ Pending  |
| Rev 14 — The Three Angels                    | 20                          | _Close of Probation_ | 1                          | [`audit/rev-14.md`](audit/rev-14.md) | ⏳ Pending  |
| Rev 15 — Prelude to the Plagues              | 8                           | _Close of Probation_ | 0                          | [`audit/rev-15.md`](audit/rev-15.md) | ✅ Complete |
| Rev 16 — The Seven Last Plagues              | 20 (16:2 missing in source) | _Close of Probation_ | 0                          | [`audit/rev-16.md`](audit/rev-16.md) | ⏳ Pending  |
| Rev 17 — Babylon the Great                   | 18                          | _Close of Probation_ | 2                          | [`audit/rev-17.md`](audit/rev-17.md) | ⏳ Pending  |
| Rev 18 — The Fall of Babylon                 | 24                          | _Close of Probation_ | 0                          | [`audit/rev-18.md`](audit/rev-18.md) | ⏳ Pending  |
| Rev 19 — Marriage Supper / Second Coming     | 21                          | _Close of Probation_ | 0                          | [`audit/rev-19.md`](audit/rev-19.md) | ⏳ Pending  |
| Rev 20 — The Millennium                      | 15                          | _Close of Probation_ | 1                          | [`audit/rev-20.md`](audit/rev-20.md) | ⏳ Pending  |
| Rev 21 — The New Jerusalem                   | 27                          | _Close of Probation_ | 0                          | [`audit/rev-21.md`](audit/rev-21.md) | ✅ Complete |
| Rev 22 — Tree of Life / Closing              | 21                          | _Close of Probation_ | 0                          | [`audit/rev-22.md`](audit/rev-22.md) | ⏳ Pending  |
