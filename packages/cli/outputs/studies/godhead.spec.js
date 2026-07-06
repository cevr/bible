// Handbook spec: the Father, the Son, and the Spirit of God — argued in the
// ADVENT-PIONEER understanding (NOT the later creedal Trinity). Bible PRIMARY;
// the pioneer cloud of witnesses CENTRAL (secondary), quoted verbatim from the
// corpus. Christ = the literal divine Son, "begotten not created," of the very
// substance of the Father; the Spirit = the presence/representative of the Father
// and the Son. No anachronistic "they developed into the Trinity" narrative.
//
// Run: Workflow(scriptPath: handbook-factory.workflow.js, args: { specPath: this file })

export default {
  title: 'The Father, the Son, and the Spirit of God — A Bible Handbook Study',
  topic: 'The Father, the Son, and the Spirit of God — A Bible Handbook Study',
  createdAt: '2026-06-20T12:00:00Z',

  // bibleOnly:false → Bible-FIRST, with the pioneer/EGW cloud of witnesses as a
  // central secondary voice. The study argues the PIONEER view of the Godhead.
  bibleOnly: false,
  sabbathSchool: true,

  thesis:
    'Scripture reveals one supreme God, the Father, the fountain of all being; and His only-begotten Son, Jesus Christ, a distinct and literal divine Person — "begotten, not created," brought forth from the Father in the days of eternity, so far back as to be to us practically without beginning, yet "of the very substance and nature of God," possessing by inheritance the divine attributes and "life in Himself" (Micah 5:2; John 1:1; Heb 1:3-5; John 5:26; Waggoner, "Christ and His Righteousness"). The Father and the Son are two distinct Persons, one in nature, mind, and purpose; the Holy Spirit is the Spirit and presence of the Father and the Son, Christ\'s own representative sent to dwell in His people. In the incarnation the Son emptied and veiled His glory and the independent use of His divine power — living by faith on the Father as we must — yet He never divested His deity, and He keeps His humanity forever as "the man Christ Jesus," our High Priest in our nature. He took the full fallen nature of the race, "the likeness of sinful flesh," tempted in all points as we are, yet without sin — for the difference between Christ and us was not the nature He bore but the life He lived: He was, from His birth, in full surrender to the Father, and never once consented to sin.',
  method:
    "After Haskell's Bible Handbook: ref → gloss, scannable; every doctrine established first from Scripture (Miller's Rule — the Bible defines its own terms), then corroborated by a central cloud of witnesses — the Advent pioneers and Ellen G. White, quoted VERBATIM and verified against the corpus. This study argues the historic ADVENT-PIONEER understanding of the Godhead — the supreme Father, the literal begotten divine Son, and the Spirit of God as the presence of the Father and the Son — and does NOT impose the later creedal-Trinity formula or any 'the pioneers evolved into Trinitarianism' narrative. Where a pioneer source cannot be quoted from the local corpus, the point rests on Scripture and on what CAN be verified; no history is asserted without a receipt.",

  outPath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-20-the-father-the-son-and-the-holy-spirit-a-bible-handbook-study.md',
  sectionsDir:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/godhead/sections',
  templatePath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-17-righteousness-by-faith-a-bible-handbook-study.md',

  sources:
    'Bible spine is primary everywhere. For the cloud of witnesses, the verified anchor in the local corpus is E.J. Waggoner, "Christ and His Righteousness" (CHR) — esp. CHR 9 ("Is Christ God?"), CHR 21-22 (Christ "begotten, not created," from "the days of eternity," "of the very substance and nature of God," possessing "life in Himself" by inheritance). Ellen G. White corroborates: Desire of Ages (DA 530 "in Christ is life, original, unborrowed, underived"), Acts of the Apostles (AA 50, the Spirit sent "as His representative"), Patriarchs and Prophets, Great Controversy, Steps to Christ. IMPORTANT: the local corpus is EGW-heavy and THIN on raw pioneer Godhead polemics (James White / Smith Review articles are largely NOT installed) — so do NOT narrate a pioneer-development storyline that cannot be quoted. Quote only what `bible egw "REF"` actually returns; never invent a refcode or a "they later changed" claim. Argue the pioneer view from Scripture + the verifiable Waggoner/EGW statements.',

  sections: [
    // ---- Part I: the three Persons ----
    {
      key: '01-the-father-and-the-son',
      part: 'I — The Father and the Son',
      title: 'One God the Father, and One Lord Jesus Christ',
      scope:
        'Establish the pioneer frame from Scripture: "to us there is but one God, the Father... and one Lord Jesus Christ" (1 Cor 8:6) — the supreme Father as the one God and fountain, and His Son as the one Lord, a distinct divine Person, not a second self-existent God nor a mode of the one. The two named together throughout (Father AND Son: John 17:3; Rev 5:13; the baptism, Matt 3:16-17, where Father, Son, and the Spirit appear as Father, Son, and the Spirit proceeding from them). Distinction of Persons, unity of nature and purpose ("I and my Father are one," John 10:30 — one in mind/purpose, two Persons). Avoid the creedal "three-in-one-substance" formula; let Scripture set the relation of Father and Son. Define the Godhead (the divine nature/being shared, Rom 1:20; Col 2:9), Person.',
      terms: [
        'but one God, the Father, of whom are all things, and one Lord Jesus Christ',
        'the only true God, and Jesus Christ, whom thou hast sent',
        'I and my Father are one',
        'the Father, and of the Son, and of the Holy Ghost',
        'the Godhead',
      ],
      symbols: [
        'the one God (= the Father, the supreme self-existent source; 1 Cor 8:6; John 17:3)',
        'the one Lord (= Jesus Christ the Son, distinct divine Person; 1 Cor 8:6)',
        'the Godhead (= the divine nature/being; Rom 1:20; Col 2:9)',
      ],
    },
    {
      key: '02-the-father',
      part: 'I — The Father and the Son',
      title: 'The Father — the One Supreme, Self-Existent God',
      scope:
        'The Father as the one supreme, self-existent God and fountain of all: "of whom are all things" (1 Cor 8:6), the only one who has life underived in the absolute sense, "from everlasting to everlasting, thou art God" (Ps 90:2). He sent the Son (John 3:16; 1 John 4:14) and is the Head even of Christ (1 Cor 11:3; John 14:28 "my Father is greater than I" — in the order of the Godhead, not in nature). His love is the fountain of redemption (John 16:27). Witnesses corroborate.',
      terms: [
        'one God, the Father, of whom are all things',
        'from everlasting to everlasting, thou art God',
        'the head of Christ is God',
        'my Father is greater than I',
        'God so loved the world',
      ],
      symbols: [
        'the Father (= the one supreme, self-existent God, the source and head; 1 Cor 8:6; 1 Cor 11:3)',
      ],
    },
    {
      key: '03-the-son-begotten',
      part: 'I — The Father and the Son',
      title: 'The Son — Begotten, Not Created; Did Christ Have a Beginning?',
      scope:
        'The central question, argued in the PIONEER view: Christ is the literal, only-begotten divine Son — "begotten, NOT created" — brought forth from the Father in the days of eternity, so far back as to be to us "practically without beginning," yet of the very substance and nature of God. Scripture: "whose goings forth have been from of old, from everlasting / the days of eternity" (Micah 5:2 + margin); "In the beginning was the Word, and the Word was God" (John 1:1); "before Abraham was, I AM" (John 8:58); the only begotten in the Father\'s bosom (John 1:14,18); "I came forth from the Father" / "proceeded forth and came from God" (John 16:28; 8:42); the Son has "life in himself" GIVEN/inhering by the Father (John 5:26); upholding all things (Col 1:16-17; Heb 1:2-3,8 the Son addressed as God). Define "only begotten" and "firstborn" as the pioneers did — a real Son truly brought forth of the Father (not created, not made), of the same divine substance, the heir and express image (Col 1:15-18; Heb 1:3-5; Ps 2:7) — NOT as a creature, and NOT collapsed into the later "eternally self-existent without any begetting" creedal formula. Hold honestly that the Father alone is the absolute fountain, while the Son is fully divine by derivation/inheritance from Him. The CENTRAL witness is Waggoner, CHR 21-22 (verbatim: "He is begotten, not created... of the very substance and nature of God... life in Himself"); EGW DA 530 ("life, original, unborrowed, underived") corroborates His full divinity. Do NOT narrate a "pioneers later became Trinitarian" arc. Define only begotten, firstborn, the Word.',
      terms: [
        'whose goings forth have been from of old, from everlasting',
        'In the beginning was the Word',
        'before Abraham was, I am',
        'the only begotten Son, which is in the bosom of the Father',
        'I proceeded forth and came from God',
        'as the Father hath life in himself',
        'the firstborn of every creature',
        'the brightness of his glory, and the express image',
      ],
      symbols: [
        "the Son / the Word (= the literal, only-begotten divine Person, of the Father's own substance; John 1:1,14; Micah 5:2)",
        'only begotten / begotten not created (= truly brought forth of the Father, sharing His divine nature, not a creature and not made; John 1:14,18; Heb 1:5; CHR 22)',
        'firstborn (= preeminence, heirship, the express image — not first-created; Col 1:15-18; Heb 1:6; Ps 89:27)',
      ],
    },
    {
      key: '04-the-spirit-of-god',
      part: 'I — The Father and the Son',
      title: 'The Spirit of God — the Presence of the Father and the Son',
      scope:
        'Who is the Holy Spirit, in the pioneer view? The Spirit is the Spirit OF God and OF Christ — the divine presence, life, and power of the Father and the Son, by which they are everywhere present and dwell in the believer; NOT framed as a separate third self-existent being apart from the Father and Son. Scripture: "the Spirit of God" / "the Spirit of Christ" used interchangeably (Rom 8:9-11; 1 Cor 2:11 "the Spirit of God" as a man\'s own spirit is in him; Gal 4:6 "the Spirit of his Son"); the promised Comforter is Christ coming to His own by the Spirit — "I will not leave you comfortless: I will come to you" (John 14:16-18); sent "as His representative" (AA 50); the Spirit searches and reveals the deep things of God (1 Cor 2:10-11), is grieved (Eph 4:30), intercedes (Rom 8:26-27) — personal in operation, the very presence of God Himself. Frame the Comforter as the abiding presence of the Father and the Son by the Spirit (consistent with "Peace Is the Spirit" in the peace/faith/works study), not as a creedal third Person. Be careful and Scripture-bound; quote only verifiable witnesses. Define the Comforter, the Spirit of truth.',
      terms: [
        'the Spirit of God dwelleth in you',
        'the Spirit of Christ',
        'the Spirit of his Son',
        'I will not leave you comfortless: I will come to you',
        'the Spirit searcheth all things, yea, the deep things of God',
        'another Comforter',
        'the Spirit of truth',
      ],
      symbols: [
        'the Spirit of God (= the divine presence, life, and power of the Father and the Son; Rom 8:9-11; 1 Cor 2:11)',
        "the Comforter (= Christ's own presence with His people by the Spirit, His representative; John 14:16-18; AA 50)",
      ],
    },

    // ---- Part II: the incarnation ----
    {
      key: '05-the-word-made-flesh',
      part: 'II — The Word Made Flesh',
      title: 'The Word Made Flesh — Truly God and Truly Man',
      scope:
        'The incarnation: the eternal Son became truly human without ceasing to be God. "The Word was made flesh, and dwelt among us" (John 1:14); "God was manifest in the flesh" (1 Tim 3:16); "in him dwelleth all the fulness of the Godhead bodily" (Col 2:9); "Immanuel, God with us" (Matt 1:23; Isa 7:14); partook of flesh and blood (Heb 2:14-17). Two natures, one Person. Witnesses corroborate the mystery. Define Immanuel, the Word made flesh.',
      terms: [
        'the Word was made flesh',
        'God was manifest in the flesh',
        'all the fulness of the Godhead bodily',
        'Immanuel, God with us',
        'partakers of flesh and blood',
        'made of a woman',
      ],
      symbols: [
        'the Word made flesh (= the eternal Son incarnate, truly God and truly man; John 1:14; 1 Tim 3:16)',
        'Immanuel (= God with us; Isa 7:14; Matt 1:23)',
      ],
    },
    {
      key: '06-emptied-not-divested',
      part: 'II — The Word Made Flesh',
      title: 'He Emptied Himself — Veiled, but Never Divested',
      scope:
        'What Christ laid aside and what He kept. On earth He "made himself of no reputation" (emptied Himself, Phil 2:6-8) — He veiled His glory and laid aside the INDEPENDENT exercise of His divine power, living by faith on the Father: "the Son can do nothing of himself" (John 5:19,30); "the Father that dwelleth in me, he doeth the works" (John 14:10). He drew no advantage from His deity that we cannot draw from God. BUT He never divested His deity, and He never divested His humanity: risen in the same body (Luke 24:39 "flesh and bones"), ascended and interceding now as "the man Christ Jesus" (1 Tim 2:5; Heb 4:14-15; 7:24-25; Acts 1:11). The incarnation is PERMANENT — He keeps our nature forever. Refute the idea that Christ divested His humanity. Define emptied himself (kenosis from the text).',
      terms: [
        'made himself of no reputation',
        'took upon him the form of a servant',
        'the Son can do nothing of himself',
        'the Father that dwelleth in me',
        'a spirit hath not flesh and bones',
        'the man Christ Jesus',
        'he ever liveth to make intercession',
      ],
      symbols: [
        'emptied himself / "of no reputation" (= veiled His glory and laid aside the independent use of divine power, not His deity; Phil 2:6-8)',
        'the man Christ Jesus (= the Son retaining humanity forever as our mediator; 1 Tim 2:5; Heb 7:24-25)',
      ],
    },
    {
      key: '07-nature-of-christ',
      part: 'II — The Word Made Flesh',
      title: 'The Nature He Took — Full Fallen Nature, Yet Without Sin',
      scope:
        'The contested heart of the study, framed per the locked position: Christ took the FULL FALLEN nature of the race — "the likeness of sinful flesh" (Rom 8:3), "in all things... made like unto his brethren" (Heb 2:17), touched with the feeling of our infirmities, "tempted in all points like as we are" (Heb 4:15), of the seed of David / Abraham (Rom 1:3; Heb 2:16) after 4000 years of degeneracy — YET WITHOUT SIN: "in him is no sin" (1 John 3:5), "who did no sin, neither was guile found in his mouth" (1 Pet 2:22), "knew no sin" (2 Cor 5:21). Hold the two streams honestly (the "sinful flesh" texts AND "that holy thing" Luke 1:35, "harmless, undefiled" Heb 7:26) and reconcile: He took our infirmities and liabilities, was tempted as we are, but never had guilt and never consented to sin. THE DIFFERENCE between Christ and us was not the nature He bore but the life He lived — He was, from birth, in full surrender to the Father ("born a Christian"): "I do always those things that please him" (John 8:29), He overcame by the same faith and Word and Spirit available to us (Heb 5:7-8; Matt 4:4; Luke 4:1). The pioneer/EGW witnesses (esp. on "took the nature of the fallen race" and the victory available to us) are central here. Define likeness of sinful flesh, tempted in all points.',
      terms: [
        'the likeness of sinful flesh',
        'in all things it behoved him to be made like unto his brethren',
        'tempted like as we are, yet without sin',
        'who did no sin',
        'made him to be sin for us, who knew no sin',
        'that holy thing which shall be born of thee',
        'I do always those things that please him',
      ],
      symbols: [
        'the likeness of sinful flesh (= the full fallen human nature Christ assumed, our infirmities and liabilities; Rom 8:3; Heb 2:17)',
        'without sin (= never consenting to sin, no guilt and no guile, the sinless life lived in the fallen nature; Heb 4:15; 1 Pet 2:22)',
        '"born a Christian" (= born in full surrender to the Father, the moral difference between Christ and us; John 8:29; Luke 1:35)',
      ],
    },

    // ---- Part III: why it matters ----
    {
      key: '08-the-godhead-and-our-salvation',
      part: 'III — The Godhead and Our Salvation',
      title: 'The Father, the Son, and the Spirit in the Plan of Salvation',
      scope:
        'Gather the whole: the Father plans and gives His Son (John 3:16), the Son redeems by taking our nature and overcoming in it (Heb 2:14-18 "able to succour them that are tempted"), and by His Spirit the Father and the Son dwell in us and apply that victory (John 14:16-18,23 "we will come unto him, and make our abode with him"; Rom 8:9-11; Titus 3:4-6). Because Christ — the literal divine Son, of the Father\'s own substance — took our fallen nature and conquered, His victory is ours by the same faith and Spirit (1 John 5:4-5; Rom 8:3-4 the righteousness of the law fulfilled in us; Heb 4:16). The Father and the Son, and the Spirit by which they dwell with us, together in the plan of salvation; the assurance that flows from a real Saviour, truly divine and truly partaker of our nature. Close with the call. The cloud of witnesses crowns it.',
      terms: [
        'God sending his own Son in the likeness of sinful flesh',
        'able to succour them that are tempted',
        'the love of God is shed abroad in our hearts by the Holy Ghost',
        'this is the victory that overcometh the world, even our faith',
        'the Spirit of him that raised up Jesus dwell in you',
      ],
      symbols: [
        'the plan of salvation (= the joint work of Father, Son, and Spirit; John 3:16; Titus 3:4-6)',
        "the victory (= Christ's overcoming in our nature made ours by faith and the Spirit; 1 John 5:4; Rom 8:3-4)",
      ],
    },
  ],
};
