# How the Pioneers Ordered the Teaching (research, 2026-10-19)

The episode numbers in this file are the list's before it was renumbered on 2026-10-20; [series.md](series.md), Episodes, maps each to its number now.

The owner asked how the Advent pioneers ordered Bible teaching, "teaching one from nothing to the full stature of Christ" (owner, 2026-10-19), what they called milk, and what their handbooks show. This file answers from the pioneers' own books and sets their order against _From Milk to Meat_ ([series.md](series.md)). The episode numbers below are series.md's as they stood on 2026-10-19. On 2026-10-20 the owner took R1, R2a, R3 and R7 (ask a31833ec347): 26 (Daniel 2) is now 11b, 28 (Daniel 7) is now 21b, and 12's case on man's nature is the new 27b. No other episode moved.

How it was read (2026-10-19; the PDFs on 2026-10-20):

- **The corpus.** `bible egw lookup` printed each passage. Read-only SQLite over `~/.bible/egw-paragraphs.db` printed each book's headings in publication order.
- **The web.** archive.org OCR text, egwwritings.org book pages, preparingforeternity.com and thoughtlines.org. Header requests gave the PDF sizes. Nothing was downloaded that day.
- **Raw exports** (git-ignored) are in `tmp/pioneer-order/`: `toc/` (the headings of 17 books), `lookups.txt` (94 passages as the CLI printed them) and `web-captures.txt` (the web reads and the sizes).
- **Two PDFs (2026-10-20).** The owner chose two (ask a31833ec347): the Bible-Reading Gazette for 1884 and Bible Readings for the Home Circle, 1914. Each was downloaded with `curl -fL -o` into its own directory under `tmp/pioneer-order/pdf/` (git-ignored), and each size matched the header size (6,553,884 and 4,575,385 bytes). They were read only as page images, at most 20 pages a call; the Gazette's 288 pages were read whole, in four ranges. Facts from them are marked **[M PDF]**. Page numbers are the printed pages: the Gazette's PDF page is its printed page, and the 1914 reprint marks each original page in braces.

Claim labels: **[M]** measured (a tool printed it this session); **[I]** inferred from measured facts; **[G]** guess. A label at the end of a bullet covers the bullet. Each source has a status: read in the corpus, read on the web, read in the PDF, or not found.

## Findings that matter most

1. **Two routes, with a turn between them.** Before 1888 most manuals open with the Bible, the advent or Daniel 2; Cottrell's (1855) opens with the law [M]. Then they teach Daniel 7 and 8, the sanctuary, the three messages, the law and the Sabbath, and after these the state of the dead. Repentance and faith come after the prophecies and the law, or not at all (TBI 1877, SYNPT 1884, Helps 1886, BR 1888) [M]. From 1885 Ellen White counsels a different start: the conscience, practical godliness and the life of Jesus, and "Then present to them the prophecies" (4LtMs, Lt 23, 1885, par. 18) [M]. The later manuals open with the Word, sin and its remedy, Christ and the way to Christ, and only then teach prophecy (BR 1914; TDOC 1919) [M]. The later manuals follow her counsel [I]. BR 1914's own preface calls its readings "classified and carefully arranged according to topics" (p. 22) [M PDF], so its part order is a classification as much as a course [I]. The Gazette of 1884 is no course at all: no note in it sets an order, and its 162 readings follow the monthly printing [M PDF; I] (see its section).
2. **Tier One already walks the later route.** Its order (the Word, God's love, the fall, Christ, the cross, repentance, faith, baptism, the Spirit, growth) matches BR 1914 Parts 1–5 and Ellen White's 1885 order [I, from measured orders]. One difference sits inside BR 1914 Part 2: the fall (p. 53) comes before God's character and love (pp. 61, 63) [M PDF], while Tier One follows _Steps to Christ_ and puts God's love (03) first [M, series.md].
3. **Daniel 2 is the largest difference.** Four sequenced courses put Daniel 2 before the Sabbath and the state of the dead: BSA, TBI, SYNPT and Helps 1886 [M]. BR 1888 and BR 1914 put their prophecy readings there too [M]. In BR 1914 only "Prophecy; Why Given" (p. 201) comes before "Nebuchadnezzar's Dream", subtitled "The Great Image of Daniel 2" (p. 204) [M PDF]; in BR 1888 Daniel 2 leads them [I, from the titles]. Ellen White says that ministers bring "the Sabbath and immortality questions" in too soon, when they could carry hearers "step by step through the important events in the prophecies" (Ev 246.3–246.4) [M]. The series put Daniel 2 at 26, after the dead (12), the Sabbath (20) and Daniel 9 and 8 (22–23) [M]; the owner moved it to 11b on 2026-10-20. Daniel 7 (28) also came late: every sequenced course that has both teaches Daniel 7 before the Sabbath [M; BR 1888 inferred; in BR 1914 "Four Great Monarchies" (p. 213) is Daniel 7, M PDF]; the owner moved it to 21b.
4. **The state of the dead (12) is the second difference.** Every sequenced course that has both subjects puts the state of the dead after the prophecies and after the Sabbath (BSA, TBI, SYNPT, Helps 1886, BR 1888, BR 1914) [M; BR 1914's "The Intermediate State", Part 11, p. 511, M PDF]. They teach it beside man's nature and the fate of the wicked (BSA headings 21–26, TBI lessons 14–17, SYNPT ch. 12–15, Helps readings 22–25, BR 1914 pp. 505–519; the Gazette groups the same three as Nos. 28–30, pp. 70–72) [M; M PDF]. Haskell's topical handbook also puts it after the Sabbath (BHB 74, BHB 99) [M]. Ellen White names it, with the Sabbath, as a subject to defer (Ev 246.3, Ev 200.2) [M]. But the resurrection itself comes early in two courses: Smith's BSA teaches "The Hope of the Church" and the resurrection beside the advent (headings 6–7), and Prescott teaches the general resurrection from Scripture with no argument about the soul (TDOC 76.5–77.3) [M]. Hebrews 6:2 puts "resurrection of the dead" in the milk [M]. BR 1914 makes the same split: "The Resurrection of the Just" sits with the second coming (Part 7, p. 343), before the law and the Sabbath, and "What Is Man?" comes after them (Part 11, p. 505) [M PDF]. The Gazette is weak evidence either way. It prints "The Resurrection" right after "The Second Advent" (Nos. 16–17, pp. 46–47), but its next reading, "Eternal Life" (No. 18, p. 49), opens on man's making, his fall and the tree of life, and its order is the printing's [M PDF; I]. So the pioneers split the subject: the resurrection early, as the hope; man's nature late [I]. The owner took that split on 2026-10-20 (12 and 27b).
5. **Milk is the plain Word, and no one outgrows it. Strong meat is truth given before the hearer is ready.** The pioneers use "strong meat" for readiness, not for a class of hard doctrine (WDUS 126.4; Ev 177.1; Ev 248.4) [M]. The meat Hebrews names is Christ's Melchisedec priesthood (PTUK December 2, 1897, 755.45–755.47; CWCP 76.2–76.3) [M]. No passage read calls prophecy strong meat [M, for the passages read].
6. **The three tiers have a pioneer frame.** Jones studies Christ as prophet, then priest, then king, each office "preparatory" to the next (CWCP 8.4) [M]. Tier One (Christ the teacher on earth), Tier Two (the priest) and Tier Three (the kingdom) keep that order [I]. Jones (CWCP 1905), Haskell (CIS) and Prescott (TDOC section X) also teach the priesthood before the prophetic dates, as Tier Two does [M].

## The orders at a glance

Where each subject falls in each order (lesson, chapter, part, page or refcode, as the source counts) [M, except where marked].

| Order                                        | The Word  | Repentance, faith                  | Daniel 2   | Sanctuary  | Sabbath    | State of the dead                | Second coming |
| -------------------------------------------- | --------- | ---------------------------------- | ---------- | ---------- | ---------- | -------------------------------- | ------------- |
| BSA 1858 (Smith), 29 headings                | 1         | none                               | 2          | 9          | 11         | 25                               | 4             |
| TBI 1877 (White, Smith), 29 lessons          | none      | only in 26 (baptism)               | 3          | 7          | 10         | 14                               | 2             |
| SYNPT 1884 (Smith), 32 chapters              | none      | only in 27 (baptism)               | 1          | 5          | 8          | 14                               | 24            |
| Gazette 1884, 162 readings (no course)       | No. 8     | No. 5 (conversion), No. 21 (faith) | No. 36     | No. 1      | No. 7      | No. 29                           | No. 16        |
| Helps 1886, 26 readings                      | none      | 7                                  | 2          | 9          | 6          | 23                               | 4             |
| BR 1888 (Corliss), by page                   | p. 11     | p. 113, p. 329                     | p. 17 [I]  | p. 81      | p. 48      | p. 144                           | p. 71         |
| BR 1914, 18 parts                            | 1 (p. 25) | 3 (faith p. 83, repentance p. 89)  | 6 (p. 204) | 6 (p. 238) | 9 (p. 415) | 11 (p. 511)                      | 7 (p. 332)    |
| TDOC 1919 (Prescott), 18 sections            | I         | XI                                 | no lesson  | X, XII     | XIV        | no lesson (resurrection in VIII) | XII           |
| BHB 1919 (Haskell), topical                  | BHB 5     | faith only, BHB 149                | BHB 114    | BHB 35     | BHB 74     | BHB 99                           | BHB 10        |
| series.md, 2026-10-19                        | 01–02b    | 07, 08                             | 26         | 16–17      | 20         | 12                               | 34            |
| series.md, 2026-10-20 (R1, R2a and R3 taken) | 01–02b    | 07, 08                             | 11b        | 16–17      | 20         | 27b (12 keeps the resurrection)  | 34            |

- BR 1888 "Prophetic History of the World" (p. 17) is read as Daniel 2 from its title [I]. BR 1914 files "Nebuchadnezzar's Dream" (p. 204) right after "Prophecy; Why Given" (p. 201), and the post-1945 revision does the same (BR-ASI9 Part Six) [M PDF; M].
- BR 1914's row comes from the contents pages of the PDF, where each reading has its page [M PDF]. The readings for Daniel 2, Daniel 7 and the sanctuary were opened at their pages (pp. 204, 213, 238) [M PDF].
- The Gazette's numbers are its readings in the order they were printed, twelve monthly numbers in 1884. Nothing in it sets a teaching order, so its row shows only where each subject fell [M PDF; I].
- The numbers count each source's own units: BSA's headings, TBI's lessons, SYNPT's chapters, Helps' readings. BHB numbers are refcodes [M].

## Ellen White on the order (1885–1908)

Status: read in the corpus (Ev, 4LtMs, 6T, PH130, GW, GW92, 14LtMs, ST, RH, TSA) [M]. Her order, condensed, as she gives it:

1. **Win the heart first.** Do not say at once that "the seventh day is the Sabbath" or "the nonimmortality of the soul". Speak "upon points of doctrine on which you can agree" (Ev 200.2; GW 119–120) [M].
2. **Christ first.** Show that "we believe in His divinity and in His pre-existence" (Ev 231.1; 6T 58, 1900) [M]. "The very first and the most important thing" is Christ "as the sin-bearer" (Ev 264.3) [M]. Preach repentance and faith, because many are "sadly ignorant in regard to the plan of salvation" (Ev 185.4) [M].
3. **The conscience and the life of Jesus.** "dwell upon subjects that would arouse the conscience", and present "the self-denial, self-sacrificing life of Jesus" (4LtMs, Lt 23, 1885, par. 18) [M].
4. **Then the prophecies.** "Then present to them the prophecies" (same) [M]. Carry hearers "step by step through the important events in the prophecies" (Ev 246.4; Letter 48, 1886) [M]. Study Daniel and the Revelation with "Behold the Lamb of God" (Ev 196.2) [M].
5. **Then the law.** "show them the purity and binding claims of the law of God" (4LtMs, Lt 23, 1885, par. 18) [M]. Paul gave the law "as the test of their obedience" only when hearers were "melted and subdued" (Ev 230.4; Special Testimonies, Series A, 6:55, 1895) [M].
6. **Last, the testing truths.** Keep other truths before the hearers "even weeks before the Sabbath and immortality questions are entered upon" (Ev 246.3) [M]. The Sabbath comes when hearers "surrender heart and mind and will to God" (Ev 228.3; Letter 77, 1895) [M].

Her reasons and limits:

- **Confidence.** Truths "that will not involve so great a cross" come first, and they gain "the confidence of the people", because "they think you understand the Scriptures" (Ev 246.3) [M]. She names them in the next paragraph: "the important events in the prophecies" and "practical subjects in the teachings of Christ" (Ev 246.4) [M].
- **Pace.** "Take one point at a time" (Ev 201.3; Ms 39, 1895). "present the truth as the people are prepared to hear it" (PH130 24.1 = 6T 55.2, on John 16:12). Christ "held in His hand the entire map of truth" and did not show it all (Ev 202.2; RH April 23, 1908). "This determined the measure of the divine communication" (14LtMs, Lt 207, 1899, par. 13) [M].
- **The centre.** "Christ crucified for our sins, Christ risen from the dead, Christ our intercessor", and with these the Spirit (Ev 187.1; Letter 86, 1895). The atonement is "the great substance, the central truth" (Ev 223.2; Ms 156, 1898) [M].
- **The hope and the foundation.** The hope of the second coming "is the key that unlocks all the history that follows" (Ev 220.2; Letter 218, 1906). The heavenly ministration "is the foundation of our faith" (Ev 221.2; Letter 208, 1906) [M].
- **The exceptions.** In a campaign "for only two weeks", do not defer the Sabbath (Ev 229.3) [M]. A community "acquainted with our faith" needs no "cautious course" (Ev 227.1) [M]. The series is a long course for viewers new to these truths, so the cautious order applies to it [I].
- **The method.** "The plan of holding Bible-readings was a heaven-born idea" (GW 191.4) [M].
- **A source-line caution.** Ev 226.3–227.1 cites "Letter 2, 1885". The corpus prints the same text as 4LtMs, Lt 23, 1885, par. 18 [M]. One word differs: Ev 226.5 reads "binding claims of the Word of God", and the letter reads "of the law of God" [M]. Quote the letter [I].

## The handbooks and courses, oldest first

### 1854 · Leading Doctrines (the Review's masthead; LD1854)

Status: read in the corpus. The corpus files it under James White [M].

1. The Bible alone, the rule of faith and duty.
2. The law of God, unchangeable.
3. The personal advent and the resurrection of the just, before the millennium.
4. The earth restored, the inheritance of the saints.
5. Immortality only through Christ, given at the resurrection. (LD1854 1.1–1.5) [M]

Why: no reason given. It is a list of beliefs, not a course [M].

### 1855 · The Bible Class (R. F. Cottrell; BIC)

Status: read in the corpus. The title page prints "ROCHESTER, N. Y." and 1855 [M].

1. Lessons 1–25: the law of God, the Sabbath, the law's place in the sanctuary, the third message.
2. Lessons 26–37: the faith of Jesus (sacrifices, the promised Christ, his birth, his life, his miracles).
3. Lesson 38: faith a duty. Lesson 39: repentance ("What duties are next after faith?").
4. Lessons 40–46: baptism, foot-washing, the Lord's Supper, prayer, fasting, self-denial, morality.
5. Lessons 47–52: signs, definite time, the three messages. (BIC headings) [M]

Why: "subjects of the greatest importance, and which should claim the first attention" (BIC 2.1) [M]. He wrote for children and for adults "commencing to investigate" (BIC 2.1) [M]. The first principles of Heb 6:1 are "those outward acts which express our faith in Christ", and the other lesson "teaches us to go on to perfection" (BIC 107.3) [M].

### 1858 · Bible Student's Assistant (BSA)

Status: read in the corpus. It prints Battle Creek, 1858. The corpus files it under Uriah Smith [M].

The numbers in brackets count its 29 headings.

1. "The Bible, and the Bible alone." (1)
2. Daniel 2, with Daniel 7 and 8 in the same section (2; BSA 2.2).
3. The millennium (3); the second advent (4); the inheritance (5); "The Hope of the Church" (6); the resurrection (7).
4. Signs (8); the sanctuary (9); the law (10); the Sabbath (11–14); the first day (15).
5. The lawgiver (16); baptism (17); the covenants (18–20).
6. Soul and spirit (21–22); "A Stupendous Fact" (23); the nature of man (24); the state of the dead (25); the wicked (26).
7. God the Father and his Son (27); God a personal being (28); hell (29). (BSA headings) [M]

The resurrection comes early, as the church's hope beside the advent (6–7). The state of the dead comes late (25) [M].

Why: "to assist the reader in the study of the sacred Scriptures". It states each proposition and cites its texts (BSA 1.1) [M]. No reason for the order [M].

### 1854–1865 · The tent courses (reports in the Review)

Status: read in the corpus [M].

1. 1854: "the prophecies, the commandments, and the present truth of the third angel's message" (ARSH February 14, 1854, 31.24).
2. 1858: Loughborough's "full course of lectures on the prophecies, the Sabbath, and the state of the dead" (ARSH December 23, 1858, 38.15).
3. 1863: "We took up the Sabbath question the last evening" (ARSH October 13, 1863, 157.12; James White).
4. 1865: "wait to introduce the Sabbath and other testing subjects" (ARSH August 22, 1865, 95.23). [M]

The order the reports show: prophecy first, the Sabbath after it, the state of the dead last [I, from four reports].

### 1864 · Key to the Prophetic Chart (Uriah Smith; KPC; 46 pp. per egwwritings)

Status: read in the corpus [M].

1. Prophecy (introduction).
2. Daniel 2.
3. Daniel 7.
4. Daniel 8: the 2300 days, the sanctuary, 1844.
5. The three messages of Revelation 14.
6. Revelation 12 and 13.
7. The woe trumpets. (KPC headings) [M]

Why: a key to the chart, prophecy only. Its introduction was not read for a stated reason [M].

### 1870 · Our Faith and Hope, No. 1 (James White; OFH1; 182 pp. per egwwritings)

Status: read in the corpus [M].

1. Introductory.
2. The millennium.
3. The second advent.
4. The time of the end.
5. The church not in darkness.
6. Noah's time, and ours.
7. The kingdom.
8. The judgment.
9. The time (Daniel 8 and the 2300 days).
10. The sanctuary.
11. Saving faith. (OFH1's eleven sermons) [M]

_Bible Adventism_ (BIAD) has the same sermons in nearly the same order, and it also ends on "Saving Faith" [M]. The corpus shows no year for it [M].

Why: "overcome this prejudice by a clear and intelligent defense of the truth, in the spirit of humility and love" (OFH1 3.3) [M].

### 1872 · Fundamental Principles (FP1872)

Status: read in the corpus. It prints Battle Creek, 1872 [M].

1. God. 2. Christ. 3. The Scriptures.
2. Baptism, "to follow faith and repentance". 5. The new birth.
3. Prophecy. 7. Prophetic chronology. 8. No temporal millennium. 9. 1844.
4. The sanctuary. 11. The moral law. 12. The Sabbath. 13. The papacy and the law.
5. Conversion of the carnal heart. 15. Justification through Christ. 16. Spiritual gifts.
6. The advent proclamation. 18. The time of the cleansing.
   19–20. The grave and the sleep of death. 21–22. The resurrection; the last trump.
   23–24. The saints in heaven; after the thousand years. 25. The new earth. (FP1872 4.2–14.2) [M]

Why: "this synopsis of our faith", for the public (FP1872 3.1) [M]. It is a statement of belief, not a course [M].

### 1877 · The Biblical Institute (James White and Uriah Smith; TBI)

Status: read in the corpus. It gives the lectures of Oakland, April 1–17, 1877 (TBI i.1) [M].

1. The millennium. 2. The second advent.
2. Daniel 2. 4. Daniel 7. 5. Daniel 8. 6. The 70 weeks and the 2300 days. 7. The sanctuary.
3. The messages of Revelation 14. 9. Revelation 12 and 13.
   10–13. The Sabbath (four lessons).
   14–15. The nature and destiny of man. 16–17. The destiny of the wicked.
   18–22. The plagues, the 144,000, the churches, the seals, the trumpets.
   23–25. Angels, the inheritance, gifts.
4. Baptism "in the work of true conversion". 27. Christ in the Old Testament.
   28–29. The first day; the Bible Sabbath. (TBI headings) [M]

Why: "to give the principal facts, dates and references" (TBI i.1), for "those everywhere who desire to acquaint themselves with the prophetic word" (TBI i.3) [M]. It has no lesson on repentance or faith [M].

### 1884 · Synopsis of the Present Truth (Uriah Smith; SYNPT; 333 pp. per egwwritings)

Status: read in the corpus [M].

1. Daniel 2. 2. Daniel 7. 3. Daniel 8. 4. The 70 weeks and the 2300 days. 5. The sanctuary.
2. Revelation 14. 7. Revelation 12 and 13.
   8–11. The Sabbath (four chapters).
   12–13. The nature and destiny of man. 14. The state of the dead. 15. The destiny of the wicked.
   16–17. The plagues; the millennium. 18. Matthew 24.
   19–21. The churches, the seals, the trumpets. 22. Signs. 23. Spiritualism. 24. The second advent.
   25–26. The two laws; the first day. 27. Baptism and true conversion. 28–29. Gifts; predestination.
   30–32. The 144,000; angels; the inheritance. (SYNPT headings) [M]

Why: it grew from the Biblical Institute lectures, "thoroughly revised, much of it re-written" (SYNPT 3.1) [M]. Its rule for prophecy: "The symbolic language of the Scriptures is to be explained by the literal" (SYNPT 11.1) [M].

### 1884 · The Bible-Reading Gazette (monthly; many writers)

Status: read in the PDF (2026-10-20), all 288 pages; pp. 287–288 are torn [M PDF]. It has no teaching order to find.

- At the 1883 General Conference, Haskell gave studies by question and answer. The Conference voted a monthly Gazette, and the Review and Herald printed it each month in 1884 (FSG 360.7–360.8, quoting RH June 26, 1930) [M].
- "It first had 162 Bible readings and contained 288 pages", with the writers' initials after each reading (FSG 360.6) [M]. The PDF confirms the count: twelve monthly numbers of 24 pages (January, p. 1, to December, p. 265), with the readings numbered straight through from 1 to 162 [M PDF]. The initials hold only in part: Nos. 1–29 carry none [M PDF]. (The masthead of No. 11, p. 241, prints "APRIL" between October and December [M PDF].)
- **Who made it.** The masthead names the Bible-Reading Bureau at Battle Creek and a Central Committee: U. Smith, W. H. Littlejohn, W. C. Sisley, E. B. Miller and M. J. Chapman (p. 1) [M PDF]. The membership terms ask each member for "one or more original readings a month", and send members "a printed sheet monthly" with lessons for each week (pp. 73, 97, 121) [M PDF]. S. N. H. signs four readings: Nos. 47, 63, 76 and 104 (the Sabbath's observance, conversion, prayer, sanctification) [M PDF].
- **What it says it is.** The REMARKS box calls it "a large variety of Bible-readings" on "a wide range of Scripture topics", "now issued in book form" (p. 1) [M PDF].
- **No order.** No preface, contents, index or note in the 288 pages says in what order to give the readings [M PDF]. The subjects mix and come back. No. 1 is the sanctuary (p. 1), No. 2 the law (p. 8), No. 5 conversion (p. 21), No. 7 the Sabbath (p. 25), No. 8 the Scriptures (p. 27), Nos. 16–17 the second advent and the resurrection (pp. 46–47), No. 21 faith (p. 54), Nos. 28–30 the nature of man, the state of the dead and the fate of the wicked (pp. 70–72), No. 31 the 2300 days of Daniel 8 (p. 73), No. 36 the great image (p. 83), No. 56 Daniel 7 (p. 114), No. 67 Daniel 8 and 9 (p. 131) [M PDF]. The judgment comes back as Nos. 121 and 158, and man's nature as Nos. 96 and 154 [M PDF]. So the numbers follow the printing, not a course [I].
- **For the series.** The Gazette is no witness to a teaching order [I]. Two of its uses of John 11 fit 12: "The Resurrection" opens with Lazarus raised (No. 17, John 11:21–23, 25–26, 43–44, p. 47), and "The State of the Dead" compares death to sleep with John 11:11–14 (No. 29, p. 71) [M PDF].
- Haskell's first two readings (1882, at a California camp meeting) were on the Lord's coming and the Sabbath. Source: thoughtlines.org, which cites "How to Give Bible Readings", pp. 11–13 [M web; secondhand].

### 1886 · Helps to Bible Study (a committee of the Battle Creek College Bible-Reading Class; 136 pp.)

Status: read on the web (archive.org OCR). The corpus describes it at ATNM 139.7 [M].

1. Increase of knowledge and the signs of the times. 2. Daniel 2. 3. The new earth. 4. The second coming. 5. Daniel 7.
2. The law of God and the Sabbath. 7. Repentance and conversion.
3. The 2300 days. 9. The sanctuary. 10. The first angel. 11. Sabbath reform in the Old Testament.
4. The seal of God and the mark of the beast. 13. The United States in prophecy. 14. The third angel.
5. Sabbath observance. 16. Obedience. 17. Baptism. 18. Health and temperance. 19. Spiritual gifts. 20. Supporting gospel workers.
6. Angels. 22. Satan. 23. The state of the dead. 24. The nature of man. 25. The fate of the wicked. 26. Objections.
   Then miscellaneous readings, among them "Faith" and "Humility" [M web].

Why: for "those, especially, who were unacquainted with the truth" (preface, signed "Committee") [M web]. "simple and easy", revised "by a committee appointed by the General Conference" (ATNM 139.7) [M]. No sentence on the order [M web]. A German edition (1888) has 25 readings (SITI March 23, 1888, 192.12) [M].

### 1888 · Bible Readings for the Home Circle (ed. J. O. Corliss; Review and Herald; 162 readings)

Status: read on the web (archive.org OCR). "?" marks a page the OCR garbled [M web].

1. Searching the Scriptures (11). 2. The Sure Word of Prophecy (14). 3. Prophetic History of the World (17). 4. Four Great Monarchies (25). 5. A Remarkable Symbol (29). 6. Our Lord's Great Prophecy (35). 7. The Millennium (43).
2. Four Sabbath readings (48–60). 9. Signs of the Times (65). 10. Manner of Christ's Coming (71). 11. The Judgment (75).
3. The Atonement in the Old and the New Testament (81, 88). 13. A Great Prophetic Period (92). 14. The three messages (98–107).
4. Nature of God's Law (110?). 16. Repentance (113). 17. The New Birth (117).
5. … The Intermediate State (144), the Resurrection (147), What Is Man? (154) …
6. … Conversion (252?), The Divinity of Christ (255), The Love of God (258) …
7. … The Two Covenants (312), Saving Faith (329), Justification by Faith (343) … Sin (526), Salvation (529). [M web]

Why: the preface gives no reason for the order [M web]. Its method is to answer each question "in Bible language" (preface) [M web]. The contents list is alphabetical [M web].

The 1899 printing keeps "The Two Covenants" on pp. 312–317, and the corpus credits that reading to E. J. Waggoner (BRHC99) [M]. So the 1899 printing probably keeps the 1888 order [I]. That reading sums the plan of salvation: the law brings "conviction of sin"; the sinner accepts Christ; then, "justified by faith", he lives by faith (BRHC99 317.4) [M].

### 1890 · From Eden to Eden (J. H. Waggoner; Pacific Press; FEE)

Status: read in the corpus [M].

1. "In the beginning." 2. The promise to the fathers. 3. The Abrahamic covenant. 4. The steps of Abraham's faith.
2. The covenant with Israel. 6. An important question settled.
3. The kingdom and the King. 8. The time of setting up the kingdom. 9. Heirs of the kingdom.
4. Another little horn. 11. The beast with seven heads. 12. The 1260 days. 13. The beast with two horns.
5. The hour of judgment. 15. Babylon is fallen. 16. The commandments and the faith. 17. The seal and the mark.
6. Signs of the coming. 19. The resurrection. 20. The first dominion restored. (FEE headings) [M]

Why: "to point out the unity of the divine plan from the creation", and to show that God aims "to restore what was lost in the fall" (FEE 3.3) [M].

### 1891 · Danish lesson books (a General Conference report)

Status: read in the corpus (the report only) [M].

- "Bible Lessons for the Youth" hold "sixty lessons on Creation, Redemption, and the Prophecies" (GCDB March 19, 1891, 165.21; the Danish list starts at 165.18) [M].
- The order: creation, then redemption, then prophecy [M]. The lessons themselves were not found [M].
- The corpus files the bulletin under E. J. Waggoner. The byline is not established [M listing; I].

### 1905 · The Consecrated Way to Christian Perfection (A. T. Jones; Pacific Press; CWCP)

Status: read in the corpus [M].

1. "Such an high priest."
   2–9. Christ as God; Christ as man; "He took part of the same"; "Made under the law"; "Made of a woman"; the law of heredity; "In all things like"; further qualifications of our High Priest.
2. "The sum" (Heb 8:1).
3. "That I may dwell among them": the sanctuary.
4. Perfection.
5. The transgression and the abomination of desolation: Daniel 7 (CWCP 88.1), then the little horn of Daniel 8 (CWCP 95.1–98.1).
6. The time of finishing the mystery of God: the 490 years and the 2300 days (CWCP 106.1–111.1).
7. The cleansing of the sanctuary. 16. The times of refreshing. 17. Conclusion. (CWCP's 17 chapters) [M]

Why: Christ's three offices come one after another. Jones studies Christ "in His office of prophet as preparatory" to his office as priest, and the priest so that we can consider him "as king" (CWCP 8.4) [M]. The "Therefore" of Heb 6:1 follows Christ's call as priest after Melchizedek (CWCP 76.2), and "perfection is attained only through the Melchizedek priesthood" (CWCP 76.3) [M].

### 1914 · Bible Readings for the Home Circle, the 1914 edition

Status: read in the PDF (2026-10-20): the title page, the contents, the preface and the prophecy readings [M PDF]. It was first read on the web (the contents page at preparingforeternity.com, which prints "Copyrighted 1914", "First Edition Published in 1888" and 201 topics in 18 sections) [M web].

- **The copy.** A 2010 "Text Only" reprint. Its publisher's note calls it "an unabridged reproduction of the text of the 1914 edition", and it marks each original page in braces [M PDF]. The title page reads "A Topical Study of the Bible, Systematically Arranged for Home and Private Study" and promises "Two Hundred Readings" [M PDF]. The contents list 203 titles in 18 parts, after two opening essays (counted by hand) [M PDF].
- **The preface.** No page is headed "Preface". The second opening essay, "The Value of Bible Study" (p. 20), ends with "Bible Readings; Their Value and Use" (pp. 21–22) [M PDF]. It calls a Bible reading "a topical study of the Bible" by questions and answers (p. 21) [M PDF]. The first readings were "contributed by a large number of Bible workers"; the 1914 work has them "classified and carefully arranged according to topics" by "a large committee of able critics and Bible students", and keeps "the same general plan as the former work" (p. 22) [M PDF]. It gives no reason for the order of the parts [M PDF]. The order did change from 1888, so "the same general plan" means the method of question and Bible answer, not the order [I].

The parts, each reading with its page [M PDF]:

- **Part 1, the Bible:** The Scriptures (25), The Study of the Scriptures (28), Power in the Word (33), The Life-Giving Word (37), Christ in All the Bible (40).
- **Part 2, sin, its origin, results and remedy:** Creation and the Creator (47), The Origin of Evil (50), The Fall and Redemption of Man (53), Creation and Redemption (57), The Character and Attributes of God (61), The Love of God (63), The Deity of Christ (67), Prophecies Relating to Christ (70), Christ the Way of Life (75), Salvation Only Through Christ (79).
- **Part 3, the way to Christ:** Faith (83), Hope (86), Repentance (89), Confession and Forgiveness (92), Conversion, or the New Birth (96), Baptism (100), Reconciled to God (104), Acceptance with God (106), Justification by Faith (110), Righteousness and Life (115), Consecration (118), Bible Election (121), Bible Sanctification (124), Importance of Sound Doctrine (127), Present Truth (131), The Obedience of Faith (136).
- **Part 4, the life, parables and miracles of Christ:** ten readings, from His birth (143) through His sufferings (163) and resurrection (169) to "Our Helper and Friend" (177).
- **Part 5, the Holy Spirit:** His work (181), fruit (184), gifts (187), the gift of prophecy (189), the outpouring (195).
- **Part 6, the sure word of prophecy:** Prophecy; Why Given (201), Nebuchadnezzar's Dream (204), The Gospel of the Kingdom (209), Four Great Monarchies (213), The Kingdom and Work of Antichrist (218), The Vicar of Christ (224), A Great Prophetic Period (230), The Atonement in Type and Antitype (238), The Judgment (245), The Judgment-Hour Message (251), The Fall of Modern Babylon (254), The Closing Gospel Message (259), Satan's Warfare Against the Church (264), A Great Persecuting Power (268), Making an Image to the Beast (271), the seven churches, seals and trumpets (280–289), The Eastern Question (296), The Seven Last Plagues (301), The Mystery of God Finished (306).
- **Part 7, coming events and signs of the times:** Our Lord's Great Prophecy (311), Signs of the Times (319), Increase of Knowledge (326), Conflict Between Capital and Labor (329), Christ's Second Coming (332), its manner (337) and object (340), The Resurrection of the Just (343), The World's Conversion (347), The Gathering of Israel (352), The Millennium (355), Length of the Day of the Lord (360), Elijah the Prophet (362).
- **Part 8, the law of God:** ten readings (369–409), with The Two Covenants (397) and The Law and the Gospel (409).
- **Part 9, the Sabbath:** twelve readings (415–463), from its institution (415) through The Seal of God and the Mark of Apostasy (446) to Sabbath Reform (463).
- **Part 10, Christian liberty:** six readings (471–491).
- **Part 11, life only in Christ:** Origin, History, and Destiny of Satan (499), What Is Man? (505), Life Only in Christ (509), The Intermediate State (511), The Two Resurrections (514), Fate of the Transgressor (519), the good and the bad angels (523, 530), Spiritualism (533).
- **Parts 12–17, the practical parts:** Christian growth and experience (541–599), prayer and public worship (603–625), Christian service (629–664), admonitions and warnings (669–701), the home (705–734), health and temperance (739–755).
- **Part 18, the kingdom restored:** from The Kingdom of Glory (759) through The New Jerusalem (778) and The Conflict Ended (782) to three titles on "The Game of Life" (787–789).

Opened at their pages [M PDF]:

- "Prophecy; Why Given" (pp. 201–203) reads 2 Pet 1:16–19. The part's title, "The Sure Word of Prophecy", is 11b's title, and 11b's core KJV opens with 2 Pet 1:19.
- "Nebuchadnezzar's Dream" (p. 204) is subtitled "The Great Image of Daniel 2". Two of its proof texts are in 11b's core KJV: Dan 5:28 and Luke 2:1 (pp. 206–207).
- "Four Great Monarchies" (p. 213) reads Daniel 7. Its note (p. 215) says that Daniel 2 gives "the mere political outline" of the kingdoms, and that Daniel 7 shows them "as viewed in the light of Heaven".
- "The Vicar of Christ" (p. 224) reads Daniel 8. "A Great Prophetic Period" (p. 230) is the 2300 days of Daniel 8, with Daniel 9. "The Atonement in Type and Antitype" (p. 238) opens the sanctuary from Ex 25:8.

Why: the preface gives none beyond its topical arrangement (above) [M PDF]. Against 1888, the gospel readings (sin, Christ, repentance, faith, the new birth) move from after the prophecies to before them: BR 1888 teaches repentance (p. 113) and the new birth (p. 117) after the prophecy and Sabbath readings of pp. 14–107, and BR 1914 teaches them in Parts 2–3 (pp. 47–136), before its prophecy part (p. 201) [M web; M PDF].

### The Cross and Its Shadow (S. N. Haskell; CIS)

Status: read in the corpus. The corpus prints no year; series.md gives 1914 [M].

1. Light in the darkness; the tabernacle; its history.
2. The furniture.
3. The priesthood, with "Christ Our High Priest" first.
4. The spring feasts: the Passover to Pentecost.
5. The offerings.
6. The services: the court, the first apartment, "A Wonderful Prophecy" (chapter 27).
7. The autumn feasts: trumpets, the Day of Atonement (chapter 29), the congregation's duty, the nature of the judgment, tabernacles.
8. Levitical laws. 9. The tribes and the 144,000. (CIS headings) [M]

Why: "There is no other subject which so fully unites all parts of the inspired Word into one harmonious whole" (CIS 6.1) [M]. The New Testament needs "a previous knowledge of the deep, bloodstained foundations" in Moses (CIS 5.2) [M]. Chapter 27 brings in the investigative judgment (CIS 187.2) before the Day of Atonement in chapter 29 [M].

### 1919 · Bible Handbook (S. N. Haskell; BHB; 186 pp.)

Status: read in the corpus. egwwritings gives 1919 and Review and Herald; booksellers give the Bible Training School as publisher [M web].

By page, as the handbook runs (it is topical):

1. The Word: magnifying it, its power, how to read it, how to teach it (BHB 5–9).
2. The second advent: the appearing, the new earth, the signs, the judgment as the marriage, the close of probation, the plagues (BHB 10–27).
3. Angels (BHB 30).
4. The sanctuary: type and antitype, the two apartments, the judgment, Daniel 8, the 2300 days, the high priest, the Day of Atonement, the three messages (BHB 35–59).
5. The home (BHB 61–67). 6. Prayer (BHB 68). 7. The Sabbath, the seal, the 144,000 (BHB 74–89).
6. The two covenants and the law (BHB 91–94). 9. Death and the resurrection (BHB 99–102).
7. The great adversary, spiritualism, the Spirit, the latter rain (BHB 104–111).
8. Prophecy: the nations, Daniel 2 (BHB 114), the trumpets, the churches; Daniel 12; Armageddon (BHB 112–128).
9. Business; the Spirit of prophecy; conscience; faith (BHB 149–151); health; dress; baptism; the ordinances; tithe; church order.
10. Promises, etiquette, nature, Christ in the grave, everyday topics, Melchisedec (BHB 177–185). (BHB headings) [M]

Why: it "contains suggestive texts on important lines of thought", the "cream" of seventeen years of Bible Training School studies (BHB 3.2) [M]. It claims no teaching order [M]. Its study "Power of the Word" cites the "sincere milk of the word" (BHB 6.1) [M].

### 1919 · The Doctrine of Christ (W. W. Prescott; TDOC)

Status: read in the corpus. Its front page says that the first edition was outlined and recommended by the Bible and History Teachers' Council, Washington, D.C., July 20 to August 9, 1919 [M].

1. The Word of God. 2. The person of Christ. 3. Christ the only Saviour (sin, man's need, accepting a Saviour). 4. The great facts.
2. His deity. 6. His incarnation. 7. His atoning death.
3. His resurrection (lesson 29: the general resurrection). 9. His ascension.
4. His mediatorial work: the new covenant, the two covenants, the law and the gospel, the temple, Christ our priest.
5. Living the life of Christ: repentance, faith, conversion, justification by faith, the victorious life.
6. The second coming: prophecies and promises, God's kingdom, signs, the judgment, the investigative judgment and its time, the millennium, the inheritance, the threefold message.
7. The Holy Spirit. 14. The Sabbath. 15. The church. 16. Prayer. 17. Giving Christ his place.
8. Miscellaneous: spiritualism, the two laws, angels. (TDOC headings) [M]

Why: "the essential doctrines of the everlasting gospel in their direct relation to the person of Christ" (TDOC 3.1) [M]. It has no lesson on Daniel 2 or on the state of the dead. Daniel 2:44 is a proof text in lesson 50 (TDOC 137.4) [M]. Lesson 29 teaches the resurrection from Scripture with no argument about the soul (TDOC 76.5–77.3) [M].

### 1922 and later · Handbook for Bible Students; Source Book for Bible Students (HBS, SBBS)

Status: read in the corpus. Both are quotation books in alphabetical order, with no teaching order (HBS 3.1) [M].

### After 1945 · Bible Readings, the revised edition (BR-ASI9; the corpus files it under the Ellen G. White Estate)

Status: read in the corpus [M].

- It keeps the 1914 edition's 18 parts in the same order [M]. It has a reading "The Atomic Age—What Next?", so the text is after 1945 [I].
- Part 2: creation, the origin of evil, the fall, God's character, the love of God, the deity of Christ, the prophecies of Christ, salvation only through Christ [M].
- Part 3: faith, hope, repentance, confession, the new birth, baptism, reconciliation, justification, sanctification, sound doctrine, present truth, the obedience of faith [M].
- Part 6: prophecy, why given; Nebuchadnezzar's dream; four great monarchies; Antichrist; Daniel 8; the hour of judgment; the atonement in type; the judgment; the three messages; Revelation 12–13; the church's history; the seals; the plagues [M].
- Part 11: what is man; life only in Christ; the intermediate state; the two resurrections; the fate of the transgressor; angels; spiritualism [M]. BR 1914's Part 11 opens with Satan (p. 499) before "What Is Man?" (p. 505) [M PDF].

Why: "The subjects have been classified and carefully arranged according to topics" (BR-ASI9 9.4) [M]. The 1914 preface says nearly the same (p. 22) [M PDF]. It is a revision after the pioneers, so it confirms the 1914 order but does not stand for the pioneers [I].

### Not found

- **A Bible-worker handbook by J. H. Waggoner, E. J. Waggoner, A. T. Jones, J. N. Andrews or J. N. Loughborough** [M, a title search of the corpus's books]. What the corpus has instead: E. J. Waggoner's one reading in the 1899 Bible Readings (BRHC99); Jones's question-and-answer tract on man (BQACM); Loughborough's _Questions on the Sealing Message_ (QSM); Andrews's _The Sanctuary of the Bible_ (SOTB) [M]. These are single-subject tracts, not courses [I].
- **"How to Give Bible Readings"**, known only through the thoughtlines.org citation [M web].
- **The "Bible Lessons" series** appears only as catalogue titles, for example "Bible Lessons, No. 4. With map" (NTMS 185.25–185.30). Their contents are not in the corpus [M].
- **Other 1880s Bible-worker courses** beyond Helps 1886 [M, for the searches run].
- Two items once listed here were read in the PDF on 2026-10-20: the Gazette's order (it has none; see its section) and the 1914 preface (pp. 20–22; see the 1914 section) [M PDF].

## Milk and meat in their words

**What milk is.**

- The Word, given plainly. "the only milk for babes in Christ is the Word" (E. J. Waggoner, PTUK August 9, 1894, 501.5). "the simple word received into the mind and heart causes Christian growth" (same) [M].
- The truth as it is in Jesus, with nothing of the teacher's own. "feed them with the sincere milk of the Word" (Ev 252.1; Ms 39, 1895). The same text was in print as ST December 25, 1893, par. 9 [M].
- For the newly come. "babes in Christ, who need to be fed with milk" (TSA 34.3) [M].

**No one outgrows the milk.**

- "we never grow so old in Christian life that we can't get along without this sincere milk" (PTUK March 29, 1894, 199.3) [M].
- "perfection can be acquired only by adhering to first principles". The child keeps the alphabet all his life (PTUK December 16, 1897, 789.4) [M].
- "the highest perfection consists simply in the use of first principles" (PTUK December 16, 1897, 789.5) [M].

**What the first principles are.**

- The six of Hebrews 6:1–2: "These are indeed the first principles" (PTUK December 16, 1897, 789.3–789.4) [M].
- Cottrell: the outward acts of faith are the first principles, and the moral life "teaches us to go on to perfection" (BIC 107.3) [M].
- Smith reads Heb 5:12–14 and 6:1 to his own readers: "let us who are babes take courage" (ARSH April 22, 1858, 182.10–182.11) [M].
- An unsigned 1853 article warns readers content with "the first principles of the oracles of God" to search out "all truth" (ARSH November 29, 1853, 165.9) [M].

**What the meat is.**

- Hebrews' own meat is the Melchisedec priesthood. Waggoner goes from "After the order of Melchisedek." to "We have many things to say, and hard to be uttered." (PTUK December 2, 1897, 755.45–755.47) [M]. Jones: "perfection is attained only through the Melchizedek priesthood" (CWCP 76.3) [M].
- Ellen White joins Heb 5:11–14 to "growing up unto the full stature of men and women in Christ Jesus" (RH January 10, 1888, par. 9) [M]. That is the owner's phrase from Eph 4:13 [I].

**What "strong meat" means in their use.**

- Truth the hearer is not ready for, not hard inference. Paul spoke "of truths which they were not prepared to hear" (J. H. Waggoner, WDUS 126.4) [M].
- All new truth is strong meat at first: "It is strong meat and should be dealt out judiciously" (Ev 177.1; Letter 39, 1887, at 177.2) [M].
- "the strongest meat is not to be given to babes who know not the first principles" (Ev 200.1; RH October 14, 1902) [M].
- Her named example is the immortality question, pressed on prejudiced hearers: "Strong meat was thrust upon them" (Ev 248.4; Ms 104, 1898, at 249.1) [M].
- "There must be a leading along" (Ev 299.4; Ms 42, 1894, at 300.1) [M].
- No passage read calls prophecy strong meat. Prophecy is "the foundation of the faith" (Ev 196.2), and it builds the confidence that the testing truths need (Ev 246.3–246.4) [M, for the passages read].

For the series: the series' name and its tier labels use Hebrews' words, and that is sound [I]. The pioneers read "strong meat" as readiness. So the testing truths (the Sabbath, the state of the dead) are their strong meat, more than prophecy is [I].

## The pioneers against series.md

References name each source's unit: heading (hd.), lesson, chapter (ch.), reading, sermon, proposition, section, part, page (p.), or a refcode such as BHB 99 [M].

| Subject                                                | series.md, 2026-10-19        | The pioneers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Word first                                         | 01, 02, 02b                  | BSA hd. 1; LD1854 item 1; BR 1888 p. 11; BR 1914 Part 1 (p. 25); TDOC section I; BHB 5–9                                                                                                                                                                                                                                                                                                                                                                                                                                              | Agrees [M]                                                                                                                                                                                                                                                                 |
| Creation, the fall, God's love                         | 03, 03b, 04, 04b             | BR 1914 Part 2 (creation p. 47, the fall p. 53, God's love p. 63) and BR-ASI9 Part 2; FEE ch. 1; the Danish lessons ("Creation, Redemption"); TDOC section III                                                                                                                                                                                                                                                                                                                                                                        | Agrees [M]. BR 1914 teaches the fall before God's love; the series follows SC and puts God's love (03) first [M PDF; M]                                                                                                                                                    |
| Who Christ is                                          | 05                           | Ev 231.1; BR 1914 Part 2 ("The Deity of Christ", p. 67); TDOC sections II, V, VI; FP1872 proposition 2                                                                                                                                                                                                                                                                                                                                                                                                                                | Agrees [M]                                                                                                                                                                                                                                                                 |
| The cross, salvation                                   | 06, 06b                      | Ev 264.3; Ev 223.2; TDOC section VII                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Agrees [M]                                                                                                                                                                                                                                                                 |
| Repentance and faith early                             | 07, 08                       | The later route: BR 1914 Part 3 (faith p. 83, repentance p. 89); TDOC section XI; Ev 185.4. The early route: late (BIC lessons 38–39, Helps reading 7, BR 1888 p. 113, OFH1 sermon 11) or absent (TBI, SYNPT)                                                                                                                                                                                                                                                                                                                         | Agrees with the later route [M]                                                                                                                                                                                                                                            |
| Repentance before faith                                | 07, then 08                  | TDOC lessons 42–43: repentance, then faith. BIC lessons 38–39 and BR 1914 Part 3 (faith p. 83, repentance p. 89): faith first                                                                                                                                                                                                                                                                                                                                                                                                         | Mixed. The series follows Heb 6:1 and SC [M]                                                                                                                                                                                                                               |
| Baptism, the Spirit, growth                            | 09, 10, 11                   | BR 1914 Parts 3 (baptism p. 100), 5 (pp. 181–195) and 12 (pp. 541–599); TDOC sections XIII, XV                                                                                                                                                                                                                                                                                                                                                                                                                                        | Agrees in substance [I]                                                                                                                                                                                                                                                    |
| The resurrection and the state of the dead             | 12 (stone 5)                 | The state of the dead after the prophecies and the Sabbath in every sequenced course that has both: BSA hd. 25, TBI lesson 14, SYNPT ch. 14, Helps reading 23, BR 1888 p. 144, BR 1914 Part 11 (p. 511); also BHB 99 and ARSH 1858; Ev 246.3; Ev 248.4. Beside man's nature and the fate of the wicked: BSA hd. 21–26, TBI lessons 14–17, SYNPT ch. 12–15, Helps readings 22–25, BR 1914 pp. 505–519. The resurrection early, as the hope: BSA hd. 6–7; TDOC lesson 29, with no soul argument; BR 1914 p. 343, with the second coming | Differed. Taken 2026-10-20 as R2a: 12 keeps the resurrection hope, and 27b takes man's nature [M]                                                                                                                                                                          |
| Eternal judgment                                       | 13 (stone 6)                 | Beside the coming: BR 1888 p. 75; OFH1 sermon 8; TDOC lesson 52                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Partly. They teach it with the coming, not as a stone [M]                                                                                                                                                                                                                  |
| Daniel 2                                               | 26 (Tier Three)              | Early: BSA hd. 2, KPC hd. 2, TBI lesson 3, SYNPT ch. 1, Helps reading 2, BR 1888 p. 17 [I], BR 1914 Part 6 (p. 204) after Parts 1–5; Lt 23, 1885; Ev 246.4. Late: BHB 114 (topical). Absent: TDOC                                                                                                                                                                                                                                                                                                                                     | Differed. Taken 2026-10-20 as R1: now 11b [M]                                                                                                                                                                                                                              |
| The priesthood, the sanctuary, the covenant            | 14–19                        | The priesthood first: CWCP ch. 1–12; CIS sections 1–5; TDOC section X. From Daniel 8 in the early route: KPC hd. 4, OFH1 sermons 9–10, TBI lessons 5–7, SYNPT ch. 3–5; and in BR 1914 (Daniel 8 p. 224, the 2300 days p. 230, the sanctuary p. 238)                                                                                                                                                                                                                                                                                   | Agrees with CWCP, CIS and TDOC [M]. BR 1914 reaches the sanctuary from Daniel 8, as the early route does [M PDF]                                                                                                                                                           |
| The Sabbath waits                                      | 20                           | After Daniel 2 and Daniel 7 in every sequenced course that has them: BSA hd. 11, TBI lesson 10, SYNPT ch. 8, Helps reading 6, BR 1888 p. 48, BR 1914 Part 9 (p. 415, after Daniel 2 at p. 204 and Daniel 7 at p. 213). After the second-coming section in TDOC (section XIV). Lt 23, 1885; Ev 228.3; Ev 246.3                                                                                                                                                                                                                         | Partly. The Sabbath waits, as they ask. On 2026-10-19 no Daniel episode came before it; 02b reads Dan 7:3, 17, 23 only as a lesson in reading. Since R1 was taken (2026-10-20), Daniel 2 (11b) comes before it; Daniel 7 (21b) still comes after it. See R1, R3 and R4 [M] |
| The Day of Atonement, Daniel 9, Daniel 8, the judgment | 21–24                        | TBI lessons 5–7 (Daniel 8, the 70 weeks and the 2300 days, then the sanctuary); CIS ch. 27 (the prophecy) before ch. 29 (the Day of Atonement); CWCP ch. 13–15 (Daniel 7 and 8, the time, the cleansing); BR 1914 (Daniel 8 p. 224, the 2300 days with Daniel 9 p. 230, the sanctuary p. 238, the judgment p. 245)                                                                                                                                                                                                                    | A small difference inside the block. No move needed [I]                                                                                                                                                                                                                    |
| Daniel 7                                               | 28 (Tier Three, after 23–24) | Right after Daniel 2: BSA hd. 2 (BSA 2.2), KPC hd. 3, TBI lesson 4, SYNPT ch. 2, BR 1888 p. 25 [I], BR 1914 p. 213 (one reading between), BR-ASI9 Part 6. Helps reading 5 comes after the new earth and the coming. After the sanctuary and before the time prophecy: CWCP 88.1                                                                                                                                                                                                                                                       | Differed. Taken 2026-10-20 as R3: now 21b [M]                                                                                                                                                                                                                              |
| Revelation 12, the three messages, Babylon, the seal   | 27, 29–31                    | After Daniel 8: TBI lessons 8–9, SYNPT ch. 6–7, Helps readings 10–14, BR 1888 pp. 98–107, BR 1914 Part 6 (pp. 251–271, after Daniel 8 at p. 224; its seal of God sits with the Sabbath, p. 446), FEE ch. 10–17                                                                                                                                                                                                                                                                                                                        | Agrees [M]                                                                                                                                                                                                                                                                 |
| The second coming, the millennium                      | 34, 35                       | Near the start in the early route: BSA hd. 3–4, TBI lessons 1–2, OFH1 sermons 2–3, Helps readings 3–4, BHB 10. After the gospel and the prophecies: BR 1914 Part 7 (the coming p. 332, the millennium p. 355), TDOC section XII. Ev 220.2: the hope is the key                                                                                                                                                                                                                                                                        | Agrees with BR 1914. See R5 [M]                                                                                                                                                                                                                                            |
| The end of the wicked                                  | 36                           | TBI lessons 16–17, SYNPT ch. 15, Helps reading 25, BR 1914 Part 11 (p. 519)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Agrees [M]                                                                                                                                                                                                                                                                 |
| The new earth last                                     | 37                           | LD1854 item 4; FP1872 proposition 25; FEE ch. 20; BR 1914 Part 18 (pp. 759–789)                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Agrees [M]                                                                                                                                                                                                                                                                 |

## Recommendations (the owner decides)

The owner took R1, R2a (27b), R3 and R7 (2026-10-20, ask a31833ec347).

The two PDFs, read on 2026-10-20, change no recommendation [I, from the PDF checks below]. Each R ends with what they add.

The drafted scripts are 01, 02, 02b, 03, 03b, 04b, 05, 06b, 08 and 18b [M, `scripts/`]. No recommendation below needs a change to any of them [I, from the checks given in each cost].

### R1 · Move 26 (The Sure Word of Prophecy, Daniel 2) into Tier One, after 11 and before 12

- **Sources.** 4LtMs, Lt 23, 1885, par. 18 (the conscience and the life of Jesus, "Then present to them the prophecies", then the law). Ev 246.3–246.4 (lighter truths first gain "the confidence of the people"; ministers bring "the Sabbath and immortality questions" in too soon, when they could carry hearers "step by step through the important events in the prophecies"). BR 1914 (Part 6, the prophecies, after the way to Christ, the life of Christ and the Spirit, and before the law, the Sabbath and life only in Christ). The early courses: BSA hd. 2, KPC hd. 2, TBI lesson 3, SYNPT ch. 1, Helps reading 2, and BR 1888 p. 17 (read from its title [I]) [M].
- **What it fixes.** Prophecy comes before the Sabbath (20) and the immortality question (12 now; after 27 with R2a), as Lt 23, 1885 and Ev 246.3–246.4 ask [I]. "How prophecy reads" (26's promise) comes before the series reads Daniel 9 and 8 in 22–23; today it comes after them [M, series.md order]. Dan 2:44 gives 12 and 13 the kingdom that they wait for [I].
- **Cost.** 26 has no script [M]. It builds on 02 only, which stays before it [M]. 28 (builds on 23, 24, 26), 30 (12, 20, 26, 29) and 37 (03, 26, 35, 36) all still come after it [M]. series.md marks inserted episodes with a letter (02b, 03b, 04b, 06b, 18b), and 02b's heading says the numbers settle at a later renumbering [M]. So 26 can become "11b" now [I]. series.md changes: 26's block moves; the tier lists in "The arc" lose and gain "how prophecy reads"; "Why that order" names the move [I].
- **Scripts touched.** None. 01's `path` beat says "And last, the strongest meat, the things to come" [M]. Tier Three still holds the things to come, so the line stays true [I].
- **Two other slots, not recommended.** (a) Right after 02b, as BR 1888 does (pp. 11, 14, 17): this puts prophecy before the conscience and Christ, against Lt 23, 1885 and Ev 231.1 [I]. (b) Between 13 and 14: this breaks 13's handoff, "and where does this Judge stand now?" [M, series.md].
- **Taken (2026-10-20).** 26 is now 11b, after 11 and before 12 [M, series.md].
- **PDF check.** BR 1914 opens its prophecy part, "The Sure Word of Prophecy", with "Prophecy; Why Given" (p. 201), then Daniel 2 (p. 204). That part comes after Parts 1–5 (pp. 25–195) and before the law (p. 369) and the Sabbath (p. 415) [M PDF]. That is 11b's place: after the new life, and before the law and the Sabbath [I]. The Gazette sets no order [M PDF]. R1 stands.

### R2 · Split 12: keep the resurrection at stone 5, and move the case on man's nature to Tier Three

- **R2a, recommended.** 12 (Asleep in Jesus) stays stone 5 and teaches the resurrection hope: Jesus wakes his friends. These texts stay in it: John 11:11–14, where Jesus himself sets "sleepeth" beside "Lazarus is dead"; 1 Thess 4:13–17; Dan 12:2; John 5:28–29; 1 Cor 15:51–53 [M, series.md and the CLI]. The case on man's nature (Gen 2:7; Ps 146:4; Eccl 9:5; the answer on Phil 1:23) moves to Tier Three [I].
  - Sources, the resurrection early as the hope: BSA hd. 6–7, beside the advent; TDOC lesson 29, seven propositions from Scripture with no argument about the soul (TDOC 76.5–77.3); Heb 6:2; PTUK December 16, 1897, 789.3–789.4 [M].
  - Sources, man's nature late, after the prophecies and the Sabbath and beside the fate of the wicked: BSA hd. 21–26; TBI lessons 14–17; SYNPT ch. 12–15; Helps readings 22–25; Ev 246.3; Ev 248.4 [M].
  - The slot: a new episode, 27b, after 27 (War in Heaven) and before 29. Helps puts Satan (reading 22) right before the state of the dead (reading 23), and BR 1914 Part 11 opens with "Origin, History, and Destiny of Satan" (p. 499) [M web; M PDF]. 30 already uses this doctrine among Babylon's wine (series.md: "and 36 for the wine's doctrines") [M], so 27b comes before its first use [I]. The other slot is 36's first act, as TBI and SYNPT put man's nature right before the fate of the wicked [M]; then 30 uses the doctrine before the series teaches it [I].
  - Cost: 12 has no script [M]. 12's promise and core KJV change in series.md, and 27b is a new block of about 6 minutes [I]. 30, 34 and 36 still build on 12's resurrection; 30 and 36 add 27b [I]. The dictionary's "sleep beside death in 12" (series.md line 46) can stay, because John 11:11–14 sets the two side by side [M; I]. series.md line 25 says the state of the dead waits until the viewer has "the high priest in hand", but 12 now comes before 14 [M]. R2a makes that line true [I]. No drafted script is touched [M].
- **R2b, the cheaper alternative.** Keep 12 as it is: the sleep reading plain and gentle, with the title and the first act on the hope (John 11:11; 1 Thess 4:13–17) [I].
  - Sources: Heb 6:2; Ev 248.3 (the nonimmortality of the soul is "not as objectionable as the Sabbath"); series.md line 25 ("the state of the dead (12, gently)") [M].
  - Cost: no new block. The state of the dead stays before the prophecies and the Sabbath, against every sequenced course [M, the orders above]. Line 25's "the high priest in hand" then needs a fix [I].
- **Why R2a.** It is the pioneers' own split: the resurrection early, as the hope (BSA, TDOC), and man's nature late (every sequenced course) [M]. It keeps Hebrews' stone 5, "resurrection of the dead", in the milk [M]. Its cost falls on series.md alone [M].
- **Taken (2026-10-20): R2a.** 12 keeps the resurrection hope, and the new 27b, after 27 and before 29, takes the case on man's nature [M, series.md].
- **PDF check.** BR 1914 makes the same split. "The Resurrection of the Just" (p. 343) sits with the second coming in Part 7, before the law and the Sabbath. Part 11 comes after them: Satan (p. 499), "What Is Man?" (p. 505), "The Intermediate State" (p. 511) and "Fate of the Transgressor" (p. 519) [M PDF]. So 27b's slot after 27 (War in Heaven) matches BR 1914 as well as Helps [I]. The Gazette is no course (see its section) [M PDF; I]. R2a stands.

### R3 · (Optional; needs R1) Move 28 (Four Winds, Four Beasts, Daniel 7) into Tier Two, after 21 and before 22

- **Sources.** CWCP 88.1: Jones turns to Daniel 7 right after the sanctuary chapters, then to Daniel 8's horn, then to the time, then to the cleansing (CWCP ch. 13–15) [M]. TBI lessons 4–6, SYNPT ch. 2–4 and KPC hd. 3–4 teach Daniel 7 before Daniel 8 and the 2300 days [M]. BR-ASI9 Part 6 does the same [M].
- **What it fixes.** 24 reads Dan 7:9–10, 13, 22 (its core KJV) before 28 teaches Daniel 7 [M]. 28's own promise says "Daniel 7 retells Daniel 2" [M]. The chain becomes Daniel 2 (26), Daniel 7 (28), Daniel 9 (22), Daniel 8 (23), the judgment (24) [I]. 28 and 22 both read Num 14:34 and Ezek 4:6 [M, series.md], so the day-for-a-year key then comes first in 28 [I].
- **Cost.** 28 is CAUTION (the horn stays unnamed) [M]. Its "Builds on" changes from 23, 24, 26 to 21, 26, and 24 adds 28 [I]. 28 must carry Tier Two's motif (Christ in the sanctuary); Dan 7:13, the Son of man brought near the Ancient of days, can carry it [I]. 28 has no script [M]. 02b's `figure` beat shares Daniel 7's beasts with 28 and needs no change [M, 02b's prop table; I].
- **Why it needs R1.** 28 builds on 26 [M]. Without R1, 28 would come before 26 [I].
- **Another slot, not recommended.** Right after 26 in Tier One, as BSA hd. 2, KPC hd. 3, TBI lesson 4 and SYNPT ch. 2 do [M]. That slot also puts Daniel 7 before the Sabbath, as every sequenced course that has both does [M; BR 1888 inferred; BR 1914 pp. 213 and 415, M PDF]. But it brings the CAUTION horn, the 1260 years and Daniel 7's court into the milk, and 13 must say nothing about when the judgment sits (series.md) [M; I].
- **Taken (2026-10-20).** 28 is now 21b, after 21 and before 22 [M, series.md].
- **PDF check.** BR 1914 teaches Daniel 7 ("Four Great Monarchies", p. 213) one reading after Daniel 2, and before Daniel 8 (p. 224), the 2300 days (p. 230) and the sanctuary (p. 238) [M PDF]. That agrees with 21b before 22 and 23, but not with 21b after the sanctuary chapters, which is CWCP's order [I]. It adds one witness to the other slot above, right after Daniel 2. That slot's cost does not change, so R3 stands [I]. Its note on Daniel 7 (p. 215) reads Daniel 2 as "the mere political outline" of the kingdoms and Daniel 7 as the same kingdoms "as viewed in the light of Heaven" [M PDF]. That fits 21b's promise, that Daniel 7 retells Daniel 2 [I].

### R4 · Keep 20 (A Rest That Remains) where it is

- Sources: Lt 23, 1885 (the law after the prophecies); Ev 228.3; Ev 230.4; Ev 246.3; BR 1914 Parts 8–9 (the law, p. 369, then the Sabbath, p. 415); TDOC section XIV [M; M PDF]. The series reaches the Sabbath from the law in the ark (19, then 20; series.md "The arc") [M]. With R1, Daniel 2 comes before it, as in every sequenced course that has both [M, the orders above].
- What stays different: Daniel 7, 8 and 9 still come after 20 (21b, 23 and 22 since 2026-10-20) [M, series.md]. Every sequenced course that has both teaches Daniel 7 before the Sabbath [M; BR 1888 inferred; BR 1914 pp. 213 and 415, M PDF]. On the 2300 days they split. BSA (under the sanctuary, BSA 12.7), TBI and SYNPT teach them before the Sabbath, and TDOC teaches the judgment's time before it (section XII) [M]. BR 1914 does too: the 2300 days (p. 230) come before the Sabbath (p. 415) [M PDF]. Helps 1886 (reading 8 after reading 6) and BR 1888 (p. 92 after p. 48 [I]) teach them after it [M]. So the pioneers do not settle whether the time prophecy must come before the Sabbath [I].
- Cost: none.
- **PDF check.** BR 1914 adds one more course to the side that teaches the time prophecy before the Sabbath, and the split stays [M PDF; I]. R4 stands.

### R5 · Keep 34 (Every Eye Shall See Him) in Tier Three

- Sources: BR 1914 Part 7 ("Christ's Second Coming", p. 332) [M PDF] and TDOC section XII [M] put the coming after the gospel and the prophecies. The early route put it near the start (BSA hd. 3–4, TBI lessons 1–2, OFH1 sermons 2–3, Helps readings 3–4) [M]. Ev 220.2 calls its hope "the key that unlocks all the history that follows" [M].
- With R1, the hope still comes early: in 11b (Dan 2:44, the stone and the kingdom) and in 12 (1 Thess 4:13–17) [I].
- Cost: none.
- **PDF check.** BR 1914 puts the coming (p. 332) after the prophecy part (pp. 201–306), as the sources above say [M PDF]. R5 stands.

### R6 · Keep 07 before 08, and keep 18b in Tier Two

- Sources: Heb 6:1's order; SC (series.md "The arc"); TDOC lessons 42–43 (repentance, then faith) and lesson 45 (justification by faith, after the mediatorial work in section X) [M].
- Against: BIC lessons 38–39 and BR 1914 Part 3 put faith first, and BR 1914 puts justification in Part 3 [M; BR 1914: faith p. 83, repentance p. 89, "Justification by Faith" p. 110, M PDF].
- These were the owner's choices (18b moved on 2026-10-19) [M, series.md]. Cost: none.
- **PDF check.** The pages confirm BR 1914's order in Part 3: faith, then repentance, then justification [M PDF]. R6 stands.

### R7 · Add two lines to series.md, "Why that order"

- Line one: the pioneers' own sequence for new hearers (the conscience and Christ; then the prophecies; then the law; last the Sabbath and the immortality question), with 4LtMs, Lt 23, 1885, par. 18 and Ev 246.3–246.4 [M sources].
- Line two: Jones's prophet, priest and king as the frame of the three tiers (CWCP 8.4); and the pioneers' "strong meat" as truth given before the hearer is ready (Ev 177.1; WDUS 126.4) [M sources].
- Cost: two lines in series.md. No script.
- **Taken (2026-10-20).** Both lines are in series.md, "Why that order" [M, series.md]. The PDFs add nothing to R7 [I].

## PDFs worth asking for (two downloaded and read, 2026-10-20)

Sizes come from header requests [M]. The owner chose items 1 and 5 (ask a31833ec347); both were downloaded, their sizes matched, and both were read [M]. The Gazette proved a miscellany with no teaching order, so items 2–4, its later printings, now matter little [I].

1. **The Bible-Reading Gazette for 1884.** <https://cdn.centrowhite.org.br/home/uploads/2022/11/The-Bible-Reading-Gazette-for-1884.pdf>, 6,553,884 bytes. Downloaded and read on 2026-10-20 [M]. Its 162 readings are many writers' work in the order of printing, not a sequence of Haskell's; his initials, S. N. H., close four of them [M PDF; I] (see its section).
2. **"The Bible-Reading Gazette: containing …" (the 1887 printing).** <https://documents.adventistarchives.org/Books/BR1887.pdf>, 6,065,853 bytes. A second witness to the same readings [I].
3. **"Bible-Readings." (1888).** <https://documents.adventistarchives.org/Books/BR1888.pdf>, 5,729,877 bytes. The Gazette book's 1888 edition. It shows whether the order changed before the large book [I].
4. **The Bible-Reading Gazette for 1888.** <https://cdn.centrowhite.org.br/home/uploads/2022/11/The-Bible-Reading-Gazette-for-1888-1.pdf>, 8,158,650 bytes. Probably the same edition as item 3 [G].
5. **Bible Readings for the Home Circle (1914).** <http://www.anym.org/pdf/Bible-Readings-for-the-Home-Circle.pdf>, 4,575,385 bytes. Downloaded over HTTP and read on 2026-10-20 [M]. It gave the preface (pp. 20–22) and each part's readings with their pages [M PDF] (see the 1914 section). A second copy, <https://www.preparingforeternity.com/br1914/Bible-Readings-for-the-Home-Circle.pdf>, refused the header request (HTTP 403), so its size is not shown [M].
6. **Bible Readings for the Home Circle (1889).** <https://judgmentdaydocumentary.com/wp-content/uploads/1889-Bible-Readings-for-the-Home-Circle.pdf>, 17,198,495 bytes. Low need [I].
7. **Bible Readings for the Home Circle (1888), archive.org.** <https://archive.org/download/biblereadingsfor01batt/biblereadingsfor01batt.pdf>, 71,077,167 bytes (67.8M on the page). It would fix the OCR's "?" pages. Low need [I].
8. **The same (1888), Library of Congress scan, 628 pp.** <https://archive.org/download/biblereadingforh00corl/biblereadingforh00corl.pdf>, 69,143,084 bytes (65.9M on the page). A duplicate of item 7 [I].
9. **Helps to Bible Study (1886).** <https://archive.org/download/HelpsToBibleStudy1886/HelpsToBibleStudy_containingSeriesOfSimpleBibleReadings_1886.pdf>, 31,666,821 bytes (30.2M on the page). Its contents are already read from the OCR. Low need [I].

## Cautions

- **Credits.** Quote the 1885 letter, not Ev 226.5 (one word differs; see Ellen White's section) [I]. BRHC99 is "understood to be authored by E. J. Waggoner", and the corpus files GCDB 1891 under him; both need a byline check before any credit line [M].
- **What counts as an order.** LD1854 and FP1872 are statements of belief, and BHB, HBS and SBBS are topical. Only the courses (BIC, TBI, SYNPT, Helps, the Bible Readings, TDOC, CWCP, CIS) show a teaching sequence [I]. BR-ASI9 is a revision after 1945 and does not stand for the pioneers [I]. The Gazette of 1884 is a monthly miscellany with no order (read in the PDF), and BR 1914's preface calls its own arrangement topical (p. 22), so BR 1914's part order is a weaker witness than a course's [M PDF; I].
- **History stays out of narration.** The Review's tent reports and the Gazette's story are church history. Use them here for the order only, never in a script (house rule, series.md "Audience") [I].
- **The web reads.** BR 1888's page numbers with "?" are OCR guesses [M]. encyclopedia.adventist.org refused the fetch (HTTP 403), so its facts come in only through FSG 360.6–360.8 and a search listing [M].
