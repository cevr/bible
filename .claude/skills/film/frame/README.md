# Pioneer frame

The doctrinal frame for every film: the historic Seventh-day Adventist pioneer position. It is built only from primary texts: the 1889 _Year Book_ statement, read from the page scan, and the local `~/.bible` corpus, reached through the `bible` CLI. Doctrine comes from these texts and from nowhere else: not from memory, and not from a later statement of beliefs.

## Use it

1. **Principle.** Find the film's topic below and read its 1889 principle in [1889.md](1889.md). The script may say less than the principle, but nothing the principle denies.
2. **Topic.** Read the topic file whole before writing a line. Every file has the same parts:
   - **Pioneer position**, written only in its quotes' words and the 1889 wording;
   - **Quotes**, verbatim, each with its refcode, writer, work and year;
   - **Key texts** (KJV);
   - **Film direction**: what the film MUST SHOW and MUST NOT SAY-OR-SHOW;
   - **Distinctives**, where the pioneers part from a mainstream explainer;
   - **Unverified / not found**.
3. **Pictures.** Read the Film direction and the Distinctives before drawing anything. Imagery carries doctrine: a soul drifting upward at death, or a transaction finished at the cross, teaches as loudly as the narration does.
4. **Quotes.** Take quotes from a topic file, or verify a new one the same way before the script uses it. Write it to a `.jsonl` record (`{"ref", "author", "work", "year", "text"}`, with `…` for an omission and `refs: [...]` when it spans paragraphs), then run the verifier.

## Verify

```bash
python3 .claude/skills/film/frame/verify-quotes.py .claude/skills/film/frame/*.jsonl
```

It checks every record against its paragraph in `~/.bible/egw-paragraphs.db`, read-only:

- **EXACT** passes.
- **PAGENUM** passes: the quote is exact once a print-page number, which the corpus embeds mid-sentence, is dropped.
- **RELAXED** (punctuation differs), **CASE**, **FAIL** and **NOREF** each need fixing.

It exits 1 on a FAIL or a NOREF. All 133 records pass as of 2026-09-26.

## The rules the frame keeps

- **Refcodes are the corpus's own.** Books use `CODE page.para`. Periodicals use the corpus form, such as `ARSH August 19, 1862, page 91.29`.
- **Writers come from the byline.** A periodical's writer is taken from its byline, never from the volume's editor field. The corpus credits the editor, which is how the `GCDB 1897` sermons came to be misattributed.
- **Disagreements stay visible.** Where the sources differ from one another, both readings are shown with their dates and left unreconciled.
- **Anything not found is listed.** A search that turned up nothing appears under **Unverified / not found**, never filled in from memory.
- **Originals come before compilations.** Cite a letter, manuscript or article before the later book that compiled it: `Lt 57, 1895, par. 43`, not `TM 91` alone.

## Topics

| Topic                                                    | 1889 principle          | File                                                       |
| -------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| God and Christ                                           | I, II                   | [god-christ.md](god-christ.md)                             |
| Nature of Christ                                         | II                      | [nature-of-christ.md](nature-of-christ.md)                 |
| Scripture                                                | III                     | [scripture.md](scripture.md)                               |
| Baptism                                                  | IV                      | [baptism.md](baptism.md)                                   |
| Prophecy: the great outline chains                       | VI, VII, XIII           | [prophecy-chains.md](prophecy-chains.md)                   |
| Prophecy: the 2300 days, 70 weeks, 1844                  | IX                      | [prophecy-2300-1844.md](prophecy-2300-1844.md)             |
| The sanctuary, the atonement, the investigative judgment | II, X, XXI              | [sanctuary-judgment.md](sanctuary-judgment.md)             |
| Law and Sabbath                                          | XI, XII, XIII           | [law-sabbath.md](law-sabbath.md)                           |
| Health reform                                            | none (context: XIV–XVI) | [health.md](health.md)                                     |
| The Holy Spirit                                          | I, XVII, XIX            | [holy-spirit.md](holy-spirit.md)                           |
| Righteousness by faith and the 1888 message              | XVIII                   | [righteousness-by-faith.md](righteousness-by-faith.md)     |
| The gift of prophecy                                     | XIX                     | [gift-of-prophecy.md](gift-of-prophecy.md)                 |
| The three angels' messages                               | XX, XXI                 | [three-angels.md](three-angels.md)                         |
| State of the dead                                        | V, XXII–XXIV            | [state-of-dead.md](state-of-dead.md)                       |
| Second coming and the millennium                         | V, VIII, XXIV–XXVII     | [second-coming-millennium.md](second-coming-millennium.md) |
| Hell and the destruction of the wicked                   | XXVII                   | [hell-destruction.md](hell-destruction.md)                 |
| The new earth                                            | XXVIII                  | [new-earth.md](new-earth.md)                               |

**Other files:**

- [distinctives.jsonl](distinctives.jsonl) holds five verified records that cut across topics: the two thrones (TTKGG 2.2, 3.1), the temporal millennium (FP1889 148.6), "Jewish" and "Christian" Sabbath (FP1889 149.3), and the 1872 list of differences from other Adventists (FP1872 3.3).
- A film's own review against the frame lives beside its plans, for example `apps/animations/plans/righteousness-by-faith-frame-review.md`.
