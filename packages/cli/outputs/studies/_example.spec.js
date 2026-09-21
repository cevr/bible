// Example handbook spec for the handbook-factory workflow.
//
// Copy this file, fill it in, and run:
//   Workflow(name or scriptPath: handbook-factory.workflow.js,
//            args: { specPath: "/abs/path/to/your.spec.js" })
//
// The factory reads this file (via an agent — the workflow sandbox can't import),
// then runs: witnesses → dual draft → cross critique → synth → dual section
// verifier (auto-fix x2) → aggregate → dual final review + reconciler (auto-fix x2).

export default {
  // ---- identity ----
  title: 'The Sanctuary in Hebrews — A Bible Handbook Study',
  topic: 'The Sanctuary in Hebrews — A Bible Handbook Study', // frontmatter topic (usually == title)
  createdAt: '2026-06-20T12:00:00Z',

  // ---- sourcing discipline ----
  // true  = Scripture-primary; EGW/pioneer ONLY for bare historical facts or a single
  //         confirmation after Scripture (0-2 per section). Symbols defined from the Bible.
  // false = Bible-first but with a fuller verified EGW/pioneer cloud of witnesses corroborating.
  bibleOnly: true,
  // true = append "For discussion:" questions to each section (Sabbath School use).
  sabbathSchool: true,

  // ---- thesis + method (the aggregator drops these into the head verbatim/as a brief) ----
  thesis:
    'Hebrews reads the earthly sanctuary as a shadow of the true (Heb 8:5), and walks Christ through it as our high priest — the once-for-all sacrifice, the better covenant, the heavenly ministry, the cleansing, and the open way into the Most Holy. Each piece of the pattern is opened by the epistle itself.',
  method:
    "After Haskell's Bible Handbook: ref → gloss, scannable; every symbol defined first from Scripture (Miller's Rule — the Bible defines its own figures); the pioneer/EGW writings appear only as secondary confirmation. Historicist, Christ-centered, evidence-first.",

  // ---- output paths (absolute) ----
  outPath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-20-the-sanctuary-in-hebrews-a-bible-handbook-study.md',
  sectionsDir:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/sanctuary-in-hebrews/sections',
  templatePath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-17-righteousness-by-faith-a-bible-handbook-study.md',

  // ---- optional: extra source-map notes handed to the witness-gatherers ----
  sources:
    'Lean on Hebrews 1-10, Lev 16, Exo 25-30, Dan 8:14. For the heavenly-sanctuary doctrine, Haskell "The Cross and Its Shadow" (CIS) and EGW Patriarchs and Prophets / Great Controversy ch. 23 corroborate only.',

  // ---- the section spine ----
  // key: stable id (drives the saved filename) · part: Part label · title: exact heading
  // scope: what it must cover · terms: KJV phrases to gather · symbols: what it owns (Bible-definable)
  sections: [
    {
      key: '01-shadow-and-true',
      part: 'I — The Pattern',
      title: 'The Shadow and the True — Hebrews 8',
      scope:
        'The earthly sanctuary is "the example and shadow of heavenly things" (Heb 8:5); Christ is a minister of "the true tabernacle, which the Lord pitched, and not man" (Heb 8:2). Establish the two-sanctuary frame from the text.',
      terms: [
        'example and shadow',
        'the true tabernacle',
        'see, saith he, that thou make all things according to the pattern',
        'a more excellent ministry',
      ],
      symbols: [
        'the true tabernacle (= the heavenly sanctuary)',
        'the shadow (= the earthly type)',
      ],
    },
    {
      key: '02-better-sacrifice',
      part: 'I — The Pattern',
      title: 'The Better Sacrifice — Hebrews 9-10',
      scope:
        'Christ entered "by his own blood... once" (Heb 9:12), "the heavenly things themselves with better sacrifices" (Heb 9:23); "one sacrifice for sins for ever" (Heb 10:12). Define the cleansing and the blood from Lev 16 + Heb 9.',
      terms: [
        'by his own blood',
        'once into the holy place',
        'the heavenly things themselves',
        'one sacrifice for sins for ever',
        'without shedding of blood',
      ],
      symbols: [
        'the blood (= the life given for atonement; Lev 17:11)',
        'the cleansing (= the antitypical day of atonement; Lev 16; Heb 9:23)',
      ],
    },
    // ... add the rest of the sections the same way ...
  ],
};
