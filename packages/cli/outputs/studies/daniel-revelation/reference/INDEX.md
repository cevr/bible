# Daniel & Revelation Studies — Reference Material

Five reference tracks back the 21 studies in `../`. Each track has a different role.

Interpretation across all tracks follows **William Miller's Rules of
Interpretation** (Scripture is its own expositor; figures explained by the
Bible; prophecy fulfilled only when every word is answered in history).

## Tracks

| Track                     | Source                                                                                                                                                              | Role                                                                                                                     | Index                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Uriah Smith — DAR**     | _Daniel and the Revelation_ (3555 paragraphs in local DB)                                                                                                           | Verse-by-verse historicist commentary; identifies powers, dates, and historical anchors                                  | [uriah-smith/INDEX.md](uriah-smith/INDEX.md)                   |
| **Ellen White — GC + PK** | _The Great Controversy_ (2078 paras) + _Prophets and Kings_ (2045 paras)                                                                                            | Pastoral framing + Scripture pointers; helps locate the Bible texts that matter                                          | [egw/INDEX.md](egw/INDEX.md)                                   |
| **EGW Remote Corpus**     | Full EGW writings via API (~17K+ paragraphs across hundreds of works including Froom's _Prophetic Faith of Our Fathers_, SDA Bible Commentary, letters/manuscripts) | Historical citation chains, pioneer scholarship, sermon/periodical material                                              | [egw-remote/INDEX.md](egw-remote/INDEX.md)                     |
| **Pioneer Writings**      | William Miller, Uriah Smith, J.N. Andrews, James White, J.N. Loughborough, Litch, Fitch, Bates, Crosier, Snow, Hale + periodicals                                   | The Millerite/early-Advent historicist case — chronology, prophetic identifications, the pioneer voice (Miller foremost) | [pioneer-writings/](pioneer-writings/)                         |
| **Earth's Final Destiny** | Sermon transcripts (16 messages)                                                                                                                                    | Pastoral cadence, application angles, end-time emphasis                                                                  | [earths-final-destiny/INDEX.md](earths-final-destiny/INDEX.md) |

## Series rules these tracks live under

From `../SERIES-OUTLINE.md`:

- **No EGW quotes in the studies themselves** — use EGW to find the right Bible texts, then let Scripture speak.
- **Structural-findings rule:** structural observations surface as observations about the text itself ("Notice the chiastic structure of Dan 8-11..."), never cited as "so-and-so says."
- **The same applies to DAR and the pioneers:** Smith's and Miller's identifications (Vicarius Filii Dei = 666, Litch's 1840, etc.) are facts about the text + history, not "Smith says" / "Miller says" appeals.

## Per-study lookup

To enrich Study N, open these in parallel:

- `uriah-smith/study-NN.md` — DAR's verse-by-verse case
- `egw/study-NN.md` — EGW's framing + Scripture pointers (where present)
- `pioneer-writings/` — the Millerite/early-Advent case (Miller, Andrews, Litch, et al.)
- `earths-final-destiny/INDEX.md` — find the transcript mapped to Study N's topic

## Re-running searches

Both DAR and EGW bundles regenerate from raw JSON in `<track>/_raw/`. See each track's `INDEX.md` for commands.

The CLI underneath:

- `bible egw books` — list locally installed books
- `bible egw catalog --search "<title>"` — find books in the remote EGW API
- `bible egw download --id <ID>` — pull a book into the local DB
- `bible egw search "<query>" --book <CODE> --json` — local FTS5 search, JSON output
- `bible egw search "<query>" --remote --json` — remote API search across the whole EGW writings corpus
