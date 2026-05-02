# Uriah Smith — _Daniel and the Revelation_ — Reference Bundles

Per-study extracts from Uriah Smith's _Daniel and the Revelation_ (DAR), mined from the local EGW FTS5 index.

## Source

- Book code: `DAR`
- Author: Uriah Smith
- Paragraphs in local DB: 3555 (after dedup) — 3568 originally fetched
- Downloaded via: `bible egw download --id 12861`
- Refcode format: `DAR <page>.<paragraph>` (printed-page locator from the standard edition)

## How to use

These bundles are **observation tracks**, not citation sources. Per the series convention (see `../../SERIES-OUTLINE.md`):

> his structural findings surface as observations about the text itself ("Notice the chiastic structure of Dan 8-11...") — never cited as "Smith says." The structures are in the text; we are just pointing them out.

The same rule applies to Smith's identifications and arguments. If DAR notes that the deadly wound is healed by 1798 + Napoleon's general, that is a fact about Rev 13:3 plus historical record — not a Smith opinion to cite. Use the bundle to find the right Bible verses and the right historical anchors; let the text speak.

## Bundles by Study

| #   | Study                                         | Bundle                     |
| --- | --------------------------------------------- | -------------------------- |
| 1   | The God Who Reveals Secrets — Daniel 1-2      | [study-01.md](study-01.md) |
| 2   | The Judgment Scene — Daniel 7                 | [study-02.md](study-02.md) |
| 3   | The 2300 Days and the Sanctuary — Daniel 8-9  | [study-03.md](study-03.md) |
| 4   | The Sanctuary Key                             | [study-04.md](study-04.md) |
| 5   | Kings of the North and South — Daniel 10-11   | [study-05.md](study-05.md) |
| 6   | Sealed Till the Time of the End — Daniel 12   | [study-06.md](study-06.md) |
| 7   | The Revelation of Jesus Christ — Rev 1-3      | [study-07.md](study-07.md) |
| 8   | The Throne Room and the Sealed Book — Rev 4-5 | [study-08.md](study-08.md) |
| 9   | The Seven Seals — Rev 6-7                     | [study-09.md](study-09.md) |
| 10  | The Seven Trumpets — Rev 8-9                  | [study-10.md](study-10.md) |
| 11  | The Little Book Opened — Rev 10-11            | [study-11.md](study-11.md) |
| 12  | The Woman, the Dragon, and the War — Rev 12   | [study-12.md](study-12.md) |
| 13  | The Two Beasts — Rev 13                       | [study-13.md](study-13.md) |
| 14  | The Three Angels' Messages — Rev 14           | [study-14.md](study-14.md) |
| 15  | Mark and Seal                                 | [study-15.md](study-15.md) |
| 16  | Babylon Exposed and Fallen — Rev 17-18        | [study-16.md](study-16.md) |
| 17  | Probation's Close and the Plagues — Rev 15-16 | [study-17.md](study-17.md) |
| 18  | The Second Coming — Rev 19                    | [study-18.md](study-18.md) |
| 19  | The Millennium and Final Judgment — Rev 20    | [study-19.md](study-19.md) |
| 20  | All Things New — Rev 21-22                    | [study-20.md](study-20.md) |
| 21  | "Blessed Is He That Readeth" — The Call       | [study-21.md](study-21.md) |

## Re-running the searches

The raw JSON queries live in `_raw/`. Each file is named `s<NN>-<topic>.json` and was produced by:

```bash
bible egw search "<query>" --book DAR --limit <N> --json > _raw/s<NN>-<topic>.json
```

To regenerate the bundles after changing the raw queries:

```bash
bun run _raw/assemble.ts
```

The assembler dedups refcodes within a study, strips HTML, and truncates each excerpt to ~700 chars.

## Add more queries

Drop another `s<NN>-<slug>.json` into `_raw/` (any new slug; existing files are kept). Re-run the assembler. New topics get appended to the right study bundle automatically.
