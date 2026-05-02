# EGW — _Great Controversy_ + _Prophets and Kings_ — Reference Bundles

Per-study extracts from Ellen White's _The Great Controversy_ (GC) and _Prophets and Kings_ (PK), mined from the local EGW FTS5 index.

## Source

- Book codes: `GC` (id 132, 2078 paragraphs), `PK` (id 88, 2045 paragraphs)
- Author: Ellen Gould White
- Downloaded via: `bible egw download --id 132` and `bible egw download --id 88`
- Refcode format: `GC <page>.<paragraph>` / `PK <page>.<paragraph>`

## How to use — series rule

From `../../SERIES-OUTLINE.md`:

> **No EGW quotes in the studies themselves** — use EGW to find the right Bible texts, then let Scripture speak.

These bundles are search aids: GC tells you which prophetic moments matter and how the pieces connect. Read the matching DAR section, then go to the Bible texts, then write the study from the text.

## Bundles by Study

| #   | Study                                         | Bundle                     |
| --- | --------------------------------------------- | -------------------------- |
| 1   | The God Who Reveals Secrets — Daniel 1-2      | [study-01.md](study-01.md) |
| 2   | The Judgment Scene — Daniel 7                 | [study-02.md](study-02.md) |
| 3   | The 2300 Days and the Sanctuary — Daniel 8-9  | [study-03.md](study-03.md) |
| 4   | The Sanctuary Key                             | [study-04.md](study-04.md) |
| 5   | Kings of the North and South — Daniel 10-11   | [study-05.md](study-05.md) |
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

(Studies 6-10 and 21 do not yet have EGW bundles — DAR + Waterhouse + Earth's Final Destiny cover them. Add queries to `_raw/` and re-run the assembler if needed.)

## Re-running the searches

```bash
bible egw search "<query>" --book GC --limit <N> --json > _raw/s<NN>-<topic>.json
bun run _raw/assemble.ts
```

Mix `--book GC` and `--book PK` queries freely — the assembler handles both since refcodes carry their own book prefix.
