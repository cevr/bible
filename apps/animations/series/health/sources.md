# Health series: sources and searches

The searches run, the key passages for each strand (references only), and what
the corpus holds and lacks. The full notes, with each passage's verbatim key
phrase, the strongest refs starred, pioneer refs, physiology notes and
per-strand search logs, are in `research/`:

- `research-air-sun-water-dress.md`: Pure air, Sunlight, Water, Dress
- `research-diet-temperance.md`: Proper diet, Abstemiousness, Temperance, and the sources' guardrails against extremes
- `research-rest-exercise-trust-mind.md`: Rest, Exercise, Trust, the Mind and the Body
- `research-medicine.md`: Medicine (drugs then, faith and means, the physician, simple remedies, _pharmakeia_)

## 1. How the material was gathered

- **KJV:** every verse quoted in a script and every KJV ref in `series.md` was printed
  in this session by `bun packages/cli/src/main.ts verse "<ref>"` (the `bible` CLI run
  from source; the checked-in `packages/cli/bin/bible` is a macOS binary). In this CLI,
  `3 John 2` fails and `3 John 1:2` works. The CLI's `[ ]` marks KJV italics and `‹ ›`
  marks red letter; the scripts drop the marks and keep the words.
- **Strong's:** `bible concordance H2235` (pulse, "something sown") and `G5331`
  (_pharmakeia_, sorcery). G5331 was looked up by the Medicine research agent.
- **EGW and pioneers:** the CLI's `egw` commands fail on this box. `~/.bible/egw-paragraphs.db`
  is a stub (no books, a two-column `paragraphs` table), so every `egw` command dies with
  `no such column: book_id`. `--remote` needs `EGW_CLIENT_ID`/`EGW_CLIENT_SECRET`, and
  `packages/cli/.env` is absent. The searches therefore went to **egw.cvr.im**, the repo's
  own egw-search server (`apps/egw-search`, same `@bible/core` search over the full corpus),
  through `GET /api/search?q=…&scope=egw|pioneer&context=N`. `research/q.ts` lists hits and
  `research/ctx.ts` prints a hit with its neighbouring paragraphs. The refcodes are the ones
  the corpus prints, the same as `bible egw lookup` would take. Nothing in `~/.bible` or the
  repo was changed.
  - To use the CLI's own `egw` path again: restore a full `egw-paragraphs.db` to `~/.bible/`
    (or point `EGW_PARAGRAPH_DB` at one), or supply the EGW API credentials.
- **Verification rule kept:** every source note in the five pilot scripts was re-read in
  context by the scriptwriter (the paragraph and its neighbours), not only taken from a
  search hit.

## 2. What the corpus holds for this series

**EGW, primary books used:** MH (_The Ministry of Healing_, 1905: "Natural Remedies"
126–128, "Prayer for the Sick" 225–233, "Mind Cure" 241–259, "General Hygiene" 271–277,
"Dress" 287–294, "Diet and Health" 295–335); CH (_Counsels on Health_); CD (_Counsels on
Diet and Foods_); MM (_Medical Ministry_); Te (_Temperance_); HL (_Healthful Living_);
2SM (_Selected Messages_ 2, "Use of Drugs" 274–303); CTBH (_Christian Temperance and Bible
Hygiene_, 1890); DA 360, 824–825; COL 346–348; PK 479–483; PP 50, 378, 562; Ed 197–214;
1T–9T; 2SG 135 (1860); 4aSG 138–139 (1864); the Review, Signs and Health Reformer.
Where a compilation reprints an original, the original is cited first.

**Pioneer health works in the corpus** (reach them with `scope=pioneer`):

| Code | Work                                                     | Notes                                                                                                                                                                                 |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HHTL | _Health, or How to Live_ (1865), compiled by James White | Mixed authorship. EGW's "Disease and its Causes" chapters, plus reprints of R. T. Trall (the "Drugs" article is Trall's, credited at HHTL 129.4) and others. Credit the right writer. |
| HBH  | J. N. Loughborough, _Hand Book of Health_ (1868)         | The fullest pioneer physiology. Air, bathing, clothing, exercise, sleep, diet, and medicine as a "necessary evil" (HBH 204.6).                                                        |
| BHY  | _Bible Hygiene_ (1890), catalogued under James White     | Indexed separately from CTBH (_Christian Temperance and Bible Hygiene_, 1890); check in print whether it is CTBH's James White section before crediting it as a separate book.        |
| ARSH | _Review and Herald_ articles                             | James White, Uriah Smith, A. T. Jones, E. J. Waggoner.                                                                                                                                |
| GCB  | General Conference Bulletins, 1895–1913                  | Health talks; the 1909 physicians' discussion of drugs (GCB May 31 1909 p. 219.6; June 1 1909 p. 236.3–236.7).                                                                        |
| AMS  | _American Sentinel_                                      | A. T. Jones, Jan 30, 1896: the Sabbath's object is not physical rest.                                                                                                                 |
| SPCR | James White, Review, Mar 17, 1868                        | Why the writings hold counsel both against extremes and against tardiness.                                                                                                            |

**Not in the corpus:** J. H. Kellogg's own books. Searches return only modern books
_about_ him. J. N. Andrews and D. M. Canright left no health works here; they show up only
in modern histories. Modern secondary works (Nichol, Douglass, Robinson's _Story of Our
Health Message_, the biography volumes, _Foundations_) were left out as sources.

**Compilers' notes** in 2SM (277.2, 277.5, 292.5, 303.3–303.6) are White Estate editorial
text. Use them as context, not as her words. 2SM 303.6 (vaccination) is her secretary's
1931 recollection.

## 3. Key passages, by strand (refs, not text)

### Frame: God, the body, and the eight

- **The list:** MH 127.2 (= CH 90.2, CG 366.1). Its setting: MH 126.1–126.4 (drugs and
  patent nostrums, opium and morphine habits), MH 127.1 (disease an effort of nature;
  find the cause), MH 127.3 (slow, costs habits), MH 128.1 (prevention).
- **Variant lists:** 5T 443.1 (= 2SM 287.3, CH 323.2): "pure air and water,
  cleanliness, a proper diet, purity of life, and a firm trust in God".
- **Physical law as God's law:** COL 346.4–348.1; CTBH 53.1 (= CD 17.4); 24LtMs Ms 109 1909 par. 14.
- **Christ the healer:** MH 19.4; DA 824.1–825 (Siloam's clay, "sin no more", the healer of
  Galilee spoke at Marah, Ps 105:37, "workers together with God"); CH 34.1.
- **Health and the gospel, without denominational framing:** MH 146.1; MM 259.1.
- **KJV:** Ex 15:22–27; Deut 7:15; Ps 105:37; John 9:6–7; John 5:14; Matt 4:23; Acts 10:38;
  3 John 1:2 (an epigraph, not a promise); 1 Cor 6:19–20; 1 Cor 10:31; Rom 12:1; Ps 139:14; Prov 4:20–22.

### Pure air

MH 271.2, 272.1*, 272.2*, 273.1, 274.2, 274.4; 1T 702.2*; CH 55.2, 57.3, 59.3; 2T 527.3
(the railway-car "night air" story); ST Sept 30 1897 par. 1; MH 220.2–220.3 (sickroom);
3MR 309.2 (deep breathing). Pioneers: HBH 116.2, 152.3; HHTL 236.1, 298.3; BHY 173.4.
KJV: Gen 2:7; Job 33:4; Acts 17:25; Ps 150:6; Acts 20:8–9.

### Sunlight

2T 527.1*; MH 275.3*, 263.2*, 264.2, 276.5; CH 57.2, 58.2, 170.1, 196.2; 2SM 297.2;
MM 225.1; MH 32.3 (Mal 4:2). Pioneers: HBH 156.2; HHTL 240.1; GCB Feb 17 1895 p. 183.10
(sunlight kills germs); BHY 173.4. KJV: Eccl 11:7; Mal 4:2; Matt 5:45; Ps 84:11 (a bridge); Ps 19:6.

### Abstemiousness

The definition: PP 562.1 / Te 138.2 ("dispense entirely with everything hurtful…use
judiciously that which is healthful"). MH 308.2*, 303.2*, 310.3*, 299.6, 310.1, 321.1,
235.2; Ed 205.2; CTBH 50.1, 51.1; CH 160.1; CD 173.1. Pioneers: HBH 195.4; HHTL 7.3;
ARSH June 13 1865 p. 11.16; GCB July 1 1900 p. 184.1; ARSH Oct 27 1896 p. 679.4.
KJV: Prov 23:1–3; Prov 25:16; Eccl 10:17; Luke 21:34; Prov 23:20–21; Phil 4:5 (an echo only).

### Rest

DA 360.1–360.3*; MH 236.1*; Ed 205.4*, 207.1; MH 58.2, 247.1; 7T 247.1; 2MCP 388.1;
PH043 38.3; DG 162.2; GW 245.2; 3MR 368.1; RH Nov 7 1893 par. 5; RH Nov 14 1893 par. 6;
DA 207.2; 2T 583.1; 1T 514.1. Pioneers: HHTL 334.1, 356.2, 387.1; HBH 59.2, 115.2;
ARSH Oct 27 1859 p. 182.30; AMS Jan 30 1896 p. 35.17 (guardrail). KJV: Mark 6:30–33;
Ps 127:2; Matt 11:28–30; Gen 2:2–3; Ex 20:9–10; Mark 2:27; Ps 4:8; Eccl 5:12; Heb 4:9–10.

### Exercise

MH 238.1*, 238.4, 240.2*; 3T 78.2*, 156.3; PP 50.1*; Ed 214.1, 278.2; 4T 264.3; CTBH 101.2;
CH 52.2, 200.1; DG 172.1, 173.5; MM 77.2, 106.3; COL 345.2; RC 147.4. Pioneers: HBH 58.2,
59.2, 155.1, 202.2; GCB June 4 1913 p. 271.10; HHTL 302.1 (disagrees on walking; context
only). KJV: Gen 2:15; Gen 3:19; Eccl 5:12; Eccl 9:10; Prov 6:6–11; 1 Tim 4:8 (the objection).

### Proper diet

MH 295.3*, 296.1* (= PHJ July 1 1905 par. 5), 300.1, 302.2, 311.2, 313.1–313.3, 315.2,
323.3; 9T 159.2*; PP 378.1, 562.1; 3SM 289.1; CH 450.1. Daniel: PK 480.2–483.3; 4T 515.4–516;
CTBH 22.3–22.4. Pioneers: HBH 180.4; BHY 169.1, 215.4; ARSH July 24 1900 p. 467.4
(Waggoner: KJV "meat" = food); ARSH Mar 1 1898 p. 140.3. KJV: Gen 1:29; 3:18; 9:3–4;
Lev 11:2–3, 7–8; Num 11:4–6; Ps 106:14–15; Dan 1:3–20; 1 Cor 10:31; Gen 2:9. Strong's H2235.

**The sources' own guardrails, for every diet video:** MH 319.1*, 319.2*, 318.2, 318.4,
320.2*, 321.3, 323.3; 9T 159.3*; MM 279.5, 286.2, 260.4; CD 202.4, 210.1, 460.3, 466.3, 491.3;
2T 374.3; 3T 20.3; SPCR 1.3 (James White). Rom 14:3, 17 for not judging.

### The use of water

MH 237.1*, 237.2*, 276.1, 276.2*; Te 101.1; CD 421.3; CH 103.3; 2SM 288.1, 289.4; MM 227.1;
CTBH 105.2; Ed 200.1. Pioneers: HBH 138.2, 138.4, 197.6, 198.2; BHY 181.1, 184.2;
HHTL 122.1 (dated). KJV: Isa 55:1; John 4:14; Rev 22:1–2; Ezek 47:9, 12; Isa 12:3; Heb 10:22;
Deut 23:14; Lev 15:13. 2 Kgs 5:10 and John 9:7 are miracles of faith, not hydrotherapy (PK 249.2).

### Trust in divine power

MH 115.4*, 251.3*, 281.3, 247.1–247.2, 246.1, 226.2; DA 270.1*, 268.3; CH 508.2; ML 155.4;
T12 9.1 (= 1T 502); HL 233.7; MM 53.1; 7T 297.3; 21MR 85.5. The guardrail: MH 231.3*;
2SG 135.1. Pioneers: HBH 120.2; ARSH Nov 21 1865 p. 198.10; BHY 212.1. KJV: Prov 3:5–8;
Ps 103:1–3; Phil 4:6–7; Isa 26:3; Mark 2:5, 11; Isa 40:29–31; Ps 42:11; 1 Pet 5:7; Ps 32:3–5; John 9:3.

### Medicine

- **Diagnosis:** MH 126.2–127.1; GCDB Mar 4 1897 par. 4.
- **What "drugs" meant:** 2SM 278.3–279.1 (the 1893 student letter and her answer:
  mercury, strychnine, arsenic); 4aSG 138.1–139.2 (1864: nux vomica/strychnine, opium,
  mercury, calomel, quinine); 2SM 447.2 (a calomel case); 15MR 276.2; MH 126.4 (opium and
  morphine habits from patent nostrums).
- **Direction, not a ban:** CH 261.2 (= 2SM 281.4, 1888: "as it is generally practiced…use
  them less and less"); 2SM 283.3–283.6; 5T 443.1; 7T 76.2.
- **Faith and means:** MH 227.2, 227.4, 228.1, 229.2, 231.1–233.2*; 2SM 284.4 (surgery),
  286.1–286.4*, 300.1, 346.2–346.4; 2SG 135.1* (1860); 2MCP 513.7; PK 211.1 ("the skill of
  well-qualified physicians"); Ev 594.3.
- **Her own practice** (context, not for speech): 2SM 302.2; 2SM 303.7 (X-ray, 1911);
  2SM 303.6 (vaccination, secondhand).
- **The physician:** MH 125.1, 135.2; MM 120.3; 5T 443.3–443.4; 2SM 282.2, 284.2, 286.3;
  RH Dec 17 1914 par. 3 (Luke); 7T 59.1.
- **Simple remedies:** 2SM 288.1, 290.2, 292.5 (compilers: almost no named herbs in her
  published work), 294.1, 298.5–298.6; 22LtMs Lt 158 1907 par. 1 (charcoal).
- **Pioneers:** HBH 204.6* (Loughborough: medicine sometimes "indispensably necessary");
  HHTL 155.2–155.3 (Trall), 158.3 (Prof. Smith, M.D.), 390.5 (the 1865 drug list), 177.2
  (EGW); GCB May 31 1909 p. 219.6, June 1 1909 p. 236.3–236.7; ARSH Oct 17 1899 p. 668.7
  (A. T. Jones).
- **KJV:** 2 Kgs 20:1–7; Isa 38:21; James 5:14–16; Matt 9:12; Col 4:14; 2 Chr 16:12;
  Jer 8:22; Mark 5:25–26; Luke 10:34; 2 Kgs 1:3; Ps 103:3; Ps 104:14; Ezek 47:12; Rev 22:2.
  Gal 5:20 and Rev 18:23 only in the _pharmakeia_ myth check. Jer 46:11 and 1 Tim 5:23 are
  dropped (the first is an oracle against Egypt; the second distracts).
- **Not found:** a 5T passage on "pious" faith-cure (none matched; MH 227.2 covers
  presumption). W. C. White's quinine-for-malaria report, which the 2SM 281.4 lead-in
  announces, is not in the indexed text; check the print before using it. The authorship
  of 3SG 27.3 (the vol. 3 introduction) is unconfirmed.

### Temperance (appetite and stimulants)

DA 117.3*; 3T 161.3; CTBH 54.2; Te 108.4; MH 176.3*; MH 326.1, 326.3, 327.1, 330.2, 331.1,
335.3; CD 436.3; MH 316.3. Pioneers: BHY 199.3, 205.1, 256.6; ARSH May 17 1898 p. 315.23;
GCB May 30 1909 p. 217.3; GCB May 31 1909 p. 233.11. KJV: Matt 4:2–4; Gen 3:6; 1 Cor 9:25–27;
2 Pet 1:5–6; Gal 5:22–23; Prov 20:1; Prov 23:29–32. Col 2:21 is not to be quoted as a command.

### The mind and the body

MH 241.1*, 241.3*, 241.2 (nocebo only), 244.1, 257.1; Ed 197.2*; 4T 60.2; 3T 183.2;
5T 443.4 (not its "nine tenths"); 1T 702.1; 2MCP 734.4; CH 627.3. Pioneers: HBH 12.4, 120.2,
122.4; HHTL 102.4. KJV: Prov 17:22; 4:20–22; 14:30; 16:24; Ps 32:3–5; Isa 26:3; Ps 42:11;
Isa 58:8; Prov 11:25.

### Dress

MH 293.1*, 293.3*, 288.3*, 287.1, 290.2; Ed 199.2; 2T 531.3; HL 69.4, 190.1; CTBH 87.2.
Pioneers: HBH 80.7; HHTL 259.1, 290.1. KJV: 3 John 1:2; 1 Cor 6:19–20; 1 Tim 2:9 (modesty,
the companion principle); Gen 3:21 (lightly); Prov 31:21.

## 4. Searches run by the scriptwriter (beyond the four research logs)

- `true remedies`; `Pure air, sunlight, abstemiousness`; `Disease is an effort of nature to free the system`;
  `Every person should have a knowledge of nature's remedial agencies`; `The use of natural remedies requires…`
  (MH 126–128 in context)
- pioneer survey: `health reform`; `drug medication`; `Kellogg hygiene`; `pure air ventilation`; `water treatment bath`;
  `John Harvey Kellogg`; `physiology digestion stomach`; `tobacco tea coffee`; `Canright health`; `Andrews health`; `dress reform`
- EGW survey: `drugs poison system`; `nature's remedies`
- frame: `truly a sin to violate the laws of our being`; `God's law is written on every nerve muscle faculty`
  (→ COL 347.1); `health is a treasure`; `devoted more time to healing the sick than to preaching` (→ MH 19.4);
  `far better to prevent disease`
- Marah: `Marah bitter waters statute healeth thee…`; `None of these diseases Egyptians…` (→ DA 824.3, read in context 824.1–825)
- `Christ made use of the simple agencies of nature clay Siloam`; `God's remedies are the simple agencies of nature` (→ 5T 443 / T32 199.1)
- `dispense entirely with everything hurtful and to use judiciously that which is healthful` (→ PP 562, Te 138.2)
- Daniel: `Daniel purposed in his heart king's meat…`; `meat and wine of the king consecrated to idolatry…` (→ PK 481.2,
  read in context 480.2–483.3); `clearness of mind and firmness of purpose` (→ 4T 515.4)
- pilots' context reads: MH 271.3–273.1; 1T 702.2; MH 230.4–233.2; 2SG 135.1; 2SM 286.2–286.4; DA 360.1–360.3; Ed 205.4;
  MH 236.1; DG 162.2; Ed 207.1; ST Sept 30 1897; MH 274.4 (via CCh 149.2)
- KJV checked by the scriptwriter: Ex 15:22–27; 3 John 1:2; 1 Cor 6:19–20; Rom 12:1; 1 Cor 10:31; Ps 139:14; Prov 4:20–22;
  Deut 7:15; Matt 4:23; Acts 10:38; Ps 103:2–3; Deut 30:19; Hos 4:6; Gal 6:7; Gen 2:7–9, 2:15; Ps 105:37; John 9:6–7;
  John 5:14; Mark 6:30–33; Ps 104:14–15; Eccl 11:7; Job 33:4; Dan 1:3–20; Gen 1:29; Acts 17:24–25; Ps 150:6;
  2 Kgs 20:1–7; Matt 9:12; Col 4:14; Luke 10:34; James 5:14; Ps 127:2; Acts 20:8–9; Isa 58:8; Prov 11:25; Isa 40:29;
  2 Chr 16:12; Jer 8:22; Prov 25:16; Eccl 10:17; Gen 3:6. Strong's H2235.
