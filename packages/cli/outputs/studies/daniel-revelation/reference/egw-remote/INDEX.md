# EGW Remote Corpus — Reference Bundles

Per-study extracts from the full EGW writings corpus (~17K+ paragraphs across hundreds of works), mined via `bible egw search --remote`.

## What's covered

The remote API spans much more than GC + PK. Notable corpora that surface in these bundles:

- **PFF1-4** — _The Prophetic Faith of Our Fathers_ (LeRoy Froom, 4 vols). Encyclopedic historicist scholarship; this is where the "Vicarius Filii Dei" historical record, Helwig, Litch's calculations, etc. are documented in detail.
- **7SDABC, SDABC** — SDA Bible Commentary verse-by-verse notes
- **FAFA** — _Facts of Faith_
- **EW** — _Early Writings_
- **DA, PP, AA** — Conflict of the Ages set
- **Lt, Ms** — Letters and Manuscripts
- **Sermons & periodical articles** — RH (Review and Herald), ST (Signs of the Times), etc.

## Free vs. paywalled

The EGW API marks each hit `action_required: "purchased"` or null. Paywalled hits return refcodes only, no snippet. The bundles separate these:

- **`[free]` rows** — usable snippet, paragraph anchor; treat as primary material
- **`<details>` block at the end** — paywalled refcodes for completeness; you can manually look these up at `egwwritings.org` or download the parent book (`bible egw catalog --search "<title>"`, then `bible egw download --id <ID>`) to get the full text into local FTS

## How to use

These are **broader** than DAR + GC + PK. Use them when:

- You need a historical citation chain (PFF documents who said what when about a prophetic identification)
- The DAR / GC bundle came up thin and you want adjacent EGW material
- You want sermon/periodical material (DA, RH) outside the major books

Same series rule applies: **no EGW quotes in the studies themselves** — use these to locate Bible texts and historical records, then write from Scripture + history.

## Bundles by Study

| #   | Study                               | Bundle                     | Refcodes |
| --- | ----------------------------------- | -------------------------- | -------- |
| 1   | The God Who Reveals Secrets         | [study-01.md](study-01.md) | 45       |
| 2   | The Judgment Scene                  | [study-02.md](study-02.md) | 54       |
| 3   | The 2300 Days and the Sanctuary     | [study-03.md](study-03.md) | 55       |
| 4   | The Sanctuary Key                   | [study-04.md](study-04.md) | 49       |
| 5   | Kings of the North and South        | [study-05.md](study-05.md) | 20       |
| 6   | Sealed Till the Time of the End     | [study-06.md](study-06.md) | 39       |
| 7   | The Revelation of Jesus Christ      | [study-07.md](study-07.md) | 25       |
| 8   | The Throne Room and the Sealed Book | [study-08.md](study-08.md) | 25       |
| 9   | The Seven Seals                     | [study-09.md](study-09.md) | 52       |
| 10  | The Seven Trumpets                  | [study-10.md](study-10.md) | 34       |
| 11  | The Little Book Opened              | [study-11.md](study-11.md) | 57       |
| 12  | The Woman, the Dragon, and the War  | [study-12.md](study-12.md) | 45       |
| 13  | The Two Beasts                      | [study-13.md](study-13.md) | 65       |
| 14  | The Three Angels' Messages          | [study-14.md](study-14.md) | 50       |
| 15  | Mark and Seal                       | [study-15.md](study-15.md) | 49       |
| 16  | Babylon Exposed and Fallen          | [study-16.md](study-16.md) | 44       |
| 17  | Probation's Close and the Plagues   | [study-17.md](study-17.md) | 65       |
| 18  | The Second Coming                   | [study-18.md](study-18.md) | 45       |
| 19  | The Millennium and Final Judgment   | [study-19.md](study-19.md) | 65       |
| 20  | All Things New                      | [study-20.md](study-20.md) | 45       |
| 21  | "Blessed Is He That Readeth"        | [study-21.md](study-21.md) | 15       |

Total: ~940 unique refcodes across 21 studies.

## Re-running searches

```bash
bible egw search "<query>" --remote --limit <N> --json --log-level=error > _raw/s<NN>-<topic>.json
bun run _raw/assemble.ts
```

`--log-level=error` keeps HTTP request logs out of stdout so the JSON file is clean.
