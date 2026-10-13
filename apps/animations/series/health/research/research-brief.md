# Research brief (shared by all research agents)

Project: a talking-head video series on HEALTH (owner Cristian on camera) built on the "eight laws" of
The Ministry of Healing p.127: "Pure air, sunlight, abstemiousness, rest, exercise, proper diet, the use of water,
trust in divine power—these are the true remedies." Audience: every Christian. In speech we quote ONLY Scripture (KJV,
verbatim) and PARAPHRASE Ellen White / pioneers without naming them; the sources are credited in the video description.
No denominational history. Health claims: stay with what the sources teach plus plain, well-established physiology;
never individual medical advice; never tell anyone to stop a treatment.

## Tools (read-only; do not edit any repo file; write only your one notes file)

- Corpus search (EGW + pioneers, same corpus as the `bible` CLI; served by the repo's own egw-search server):
  cd /tmp/claude-1000/-home-exedev-Developer-personal-bible-tools/078fad2f-b3a9-4025-813b-23f987283860/scratchpad
  bun q.ts "<query>" [limit=8] [scope=egw|pioneer|all] ["&type=book"]
  Prints `[REFCODE] (author, book)` + paragraph text. Queries are full-text (lexical); use distinctive words, not commas.
  The refcode IS the citation (book code + page.paragraph). Prefer the original compilation books: MH (Ministry of Healing),
  CH (Counsels on Health), CD (Counsels on Diet and Foods), MM (Medical Ministry), Te (Temperance), HL (Healthful Living),
  2SM (Selected Messages 2), CTBH (Christian Temperance and Bible Hygiene), 3T/2T etc. (Testimonies), Ed, DA.
  Pioneer health works in the corpus: HHTL (James White ed., Health, or How to Live, 1865), HBH (J. N. Loughborough,
  Hand Book of Health, 1868), BHY (Bible Hygiene, 1890), HR (Health Reformer periodical), ARSH Review articles,
  GCB General Conference Bulletins (health talks). Use scope=pioneer to reach them. AVOID modern/secondary books
  (Nichol, Douglass MOL, Robinson SHM, BIO volumes, FSDA) except to note historical context in one line.
- KJV (verify every verse you list; copy text verbatim from this output):
  cd /home/exedev/Developer/personal/bible-tools/packages/cli && bun src/main.ts verse "<ref>"
  (The CLI's `egw` subcommands are broken on this box - the local DB is a stub - so use q.ts for EGW/pioneers.)

## What to write (ONE markdown file, the path your task names; refs, not dumps)

For each law/theme assigned:

1. **Core passages** - 6-12 EGW refs, each: `REFCODE` - a verbatim key phrase (<=25 words, copied exactly from q.ts output) - one-line gist.
   Mark the 2-3 strongest with a star (*).
2. **Pioneer passages** - 2-6 refs: `REFCODE` (author, year if known) - gist (paraphrase; a short verbatim phrase ok).
3. **KJV texts** - 4-10 refs that bear on the law, each with its verified text (verbatim, can be the key clause only, marked with ... if trimmed - but give the full verse text for the 3 best).
4. **Physiology note** - what the sources claim that is plain and well-established today, and anything that is
   historically situated or that modern physiology would qualify (say so honestly, e.g. "night air" counsel, specific
   19th-c. remedies). One short paragraph.
5. **Video topics** - 5-9 proposed videos for the strand: title | the viewer's question (One Question format, 45-65 s) or the
   episode promise (Episode, 2:15-2:50) | KJV texts | source refs | format. Include: the law itself, the "why" in
   Scripture and the sources, the practice, and common questions/objections people raise.
6. **Search log** - the queries you ran (one line each).
   Keep the file under ~350 lines. Never invent a refcode or a quote: everything comes from tool output in your session.
   When done, reply with just the file path and a 3-line summary.
