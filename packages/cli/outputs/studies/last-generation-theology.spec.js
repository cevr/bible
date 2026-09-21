// Handbook spec: LAST GENERATION THEOLOGY — the historic Adventist message of
// complete victory over sin, argued Bible-first with the pioneer/EGW cloud of
// witnesses CENTRAL (secondary), quoted verbatim from the local corpus.
//
// The stance this handbook argues:
//   - Man is dust + the breath of life = a living soul; whole and mortal.
//   - Sin is the consented transgression of the law — a CHOICE. We inherit a
//     fallen NATURE that corrupts and enslaves, but not guilt; guilt is by
//     choice, not by birth (no "original sin" in the guilt sense).
//   - Christ, the second Adam, took the FULL fallen nature of man (after 4000
//     years of degeneration), yet was without sin — the difference was not the
//     nature He bore but the life He lived. Born of the Spirit, He lived from
//     birth the surrendered life of faith that we ENTER by the new birth of
//     water and the Spirit.
//   - Salvation is being saved FROM sin, not in it. Righteousness by faith —
//     "the third angel's message in verity" — both credits Christ's obedience
//     and works it in the believer: complete victory over sin is provided.
//   - That message ripens a last generation who keep the commandments of God
//     and the faith of Jesus, stand through the time of trouble WITHOUT a
//     mediator because they have ceased from sin, and in whom the character of
//     Christ is perfectly reproduced — the harvest that vindicates God.
//
// Run: Workflow(scriptPath: handbook-factory-fable.workflow.js, args: { specPath: this file })

export default {
  title: 'Last Generation Theology — A Bible Handbook Study',
  topic: 'Last Generation Theology — A Bible Handbook Study',
  createdAt: '2026-07-06T12:00:00Z',

  // bibleOnly:false → Bible-FIRST, with the pioneer/EGW cloud of witnesses as a
  // central secondary voice. The study argues the historic Adventist view.
  bibleOnly: false,
  sabbathSchool: true,

  thesis:
    'Man is dust made alive by the breath of God — a living soul, whole and mortal (Gen. 2:7). Sin is not a guilt inherited at birth but the consented transgression of the law (1 John 3:4; Jas. 1:14-15); yet the fallen nature we do inherit corrupts and enslaves (Rom. 7:14; Eph. 2:3). Into that very flesh the Son of God came — the second Adam, bearing the full fallen nature of man after four thousand years of sin, yet without sin (Rom. 8:3; Heb. 2:14-17; 4:15) — conceived of the Spirit and living from the manger, by faith in His Father, the surrendered life we enter by the new birth of water and the Spirit (John 3:5). Salvation is God saving His people FROM their sins, not in them (Matt. 1:21): righteousness by faith — the gospel in verity, the third angel’s message in verity — both credits Christ’s obedience to the believer and works it in him, so that complete victory over sin is provided, promised, and expected (Rom. 6:14; 1 John 5:4; Jude 24; Rev. 3:21). That message ripens a last generation who keep the commandments of God and the faith of Jesus (Rev. 14:12), stand through the time of trouble without a mediator because their sins have gone beforehand to judgment (Rev. 22:11; Dan. 12:1), and in whom the character of Christ is perfectly reproduced — the harvest that vindicates God before the universe (Mark 4:29; Rev. 14:1-5).',
  method:
    "After Haskell's Bible Handbook: ref → gloss, scannable; every doctrine established first from Scripture (Miller's Rule — the Bible defines its own terms), then corroborated by a central cloud of witnesses — E. J. Waggoner, A. T. Jones, S. N. Haskell, and Ellen G. White — quoted VERBATIM and verified against the corpus. This study argues the historic Adventist “last generation” understanding: full victory over sin through the indwelling Christ. On the nature of Christ it is careful and honest: He took our fallen NATURE, never our sin — nature is not guilt, and sin is in the consent — so no line may make Christ a sinner, and no line may give Him an unfallen-Adam advantage. Where a source cannot be quoted from the local corpus, the point rests on Scripture and what CAN be verified; no claim without a receipt.",

  outPath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-07-06-last-generation-theology-a-bible-handbook-study.md',
  sectionsDir:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/last-generation-theology/sections',
  templatePath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-17-righteousness-by-faith-a-bible-handbook-study.md',

  sources:
    'Bible spine primary everywhere (KJV, verify with the verse tool). The verified pioneer anchors in the local corpus: A. T. Jones, "The Consecrated Way to Christian Perfection" (CWCP) — the spine for the nature Christ took and the perfection of the saints — and "Lessons on Faith" (LOF_ATJ); E. J. Waggoner, "Christ and His Righteousness" (CHR, esp. the God-manifest-in-the-flesh chapters), "The Glad Tidings" (GTI), "Waggoner on Romans" (WOR, esp. on Rom. 8:3-4), "The Everlasting Covenant" (EVCO); S. N. Haskell, "Bible Handbook" (BHB), "The Cross and Its Shadow" (CIS). Ellen G. White: The Desire of Ages (DA, esp. DA 48-49 — humanity weakened by four thousand years of sin; DA 24; DA 117; DA 671-672), The Great Controversy (GC 425 — those living after intercession ceases stand without a mediator; GC 613-634 — the time of Jacob’s trouble), Early Writings (EW 71 — living in the sight of a holy God without an intercessor), Christ’s Object Lessons (COL 69 — the character of Christ perfectly reproduced in His people; COL 311-319), Steps to Christ (SC), Selected Messages (1SM 253-256 — He took upon His sinless nature our sinful nature; 1SM 366-373 — justification by faith IS the third angel’s message in verity), and The Review and Herald (RH — 29k paragraphs, search it liberally). IMPORTANT GUARDRAILS: (1) verify EVERY refcode with `bible egw "REF"` before citing — a refcode that does not resolve or does not contain the quoted words is dropped; use `bible egw search "plain words" --limit 8` to find codes (no hyphens/quotes inside the phrase). (2) On the nature of Christ, quote honestly and resolve as the pioneers did: He took fallen humanity’s NATURE (hereditary, weakened, tempted from within and without) yet never consented to sin — statements guarding His sinlessness (e.g. "not for one moment was there in Him an evil propensity") are about consent and character, not about an unfallen nature; never suppress either side. (3) For the section on what man is (dust + breath), a ministry-interview transcript is saved at /Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/last-generation-theology/sources/0V3pkW18ABE.txt — read it for the SHAPE of the argument and its verse-chain, but NEVER cite it as an authority: every point must stand on Scripture, with EGW/pioneer confirmation.',

  sections: [
    // ---- Part I: The Man ----
    {
      key: '01-dust-and-breath',
      part: 'I — The Man',
      title: 'Dust and Breath — What Man Is',
      scope:
        'Gen. 2:7: dust of the ground + the breath of life = a LIVING SOUL. Man does not have a soul; he is one — an indivisible whole. The breath/spirit is God’s life-power, not a conscious entity (Job 33:4; Eccl. 12:7); at death it returns to God and the man sleeps (Ps. 146:4; Eccl. 9:5). Man is mortal — God only hath immortality (1 Tim. 6:16); the soul that sinneth dies (Ezek. 18:4). This grounds the whole handbook: sin and salvation happen in one undivided man — body, mind, breath — not in an immortal ghost inside him. FIRST read the transcript at /Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/last-generation-theology/sources/0V3pkW18ABE.txt (Read tool) for the argument’s shape (dust + breath of life, body + spirit = soul); mine its verse-chain, but never cite the transcript itself — Scripture and verified EGW/pioneer confirmations only.',
      terms: [
        'formed man of the dust of the ground',
        'breathed into his nostrils the breath of life',
        'man became a living soul',
        'the spirit shall return unto God who gave it',
        'the soul that sinneth, it shall die',
        'who only hath immortality',
        'his breath goeth forth',
      ],
      symbols: [
        'the living soul (= dust + breath: the whole man, Gen. 2:7)',
        'the breath/spirit of life (= the life-power from God, not a conscious entity; Job 33:4; Eccl. 12:7)',
      ],
    },
    {
      key: '02-what-sin-is',
      part: 'I — The Man',
      title: 'What Sin Is — Transgression, Not Inheritance',
      scope:
        'Sin defined: the transgression of the law (1 John 3:4); it is born when desire CONCEIVES — when the will consents (Jas. 1:14-15). Guilt attaches to choice, not to birth: the son shall not bear the iniquity of the father (Ezek. 18:20; Deut. 24:16); every mouth is stopped because ALL HAVE SINNED (Rom. 3:19, 23; 5:12 — death passed upon all men, "for that all have sinned"). Yet the inherited FALLEN NATURE is real and terrible: shapen in iniquity (Ps. 51:5), by nature children of wrath (Eph. 2:3), sold under sin, a law in the members (Rom. 7:14-24) — the nature inclines, corrupts, and holds dominion over the natural man, but it is not itself guilt; it condemns only when obeyed. Distinguish plainly: original-sin GUILT (guilty at birth) — rejected; inherited CORRUPTION (a bent that enslaves until Christ delivers) — affirmed.',
      terms: [
        'sin is the transgression of the law',
        'when lust hath conceived, it bringeth forth sin',
        'the son shall not bear the iniquity of the father',
        'for that all have sinned',
        'shapen in iniquity',
        'by nature the children of wrath',
        'sold under sin',
        'a law in my members',
      ],
      symbols: [
        'sin (= consented transgression of the law; 1 John 3:4; Jas. 1:14-15)',
        'the flesh / fallen nature (= the inherited bent that enslaves but does not condemn until obeyed; Rom. 7:14; Eph. 2:3)',
      ],
    },

    // ---- Part II: The Pattern ----
    {
      key: '03-nature-christ-took',
      part: 'II — The Pattern',
      title: 'The Second Adam — The Nature Christ Took',
      scope:
        'Christ is the second/last Adam (1 Cor. 15:45-47; Rom. 5:19) — and He did NOT take the first Adam’s unfallen nature. Made of a woman (Gal. 4:4); the seed of David ACCORDING TO THE FLESH (Rom. 1:3); God sent His Son in the LIKENESS OF SINFUL FLESH (Rom. 8:3); He took part of the SAME flesh and blood as the children, made like unto His brethren IN ALL THINGS (Heb. 2:14-17); tempted in ALL POINTS like as we are — yet WITHOUT SIN (Heb. 4:15). He took humanity after four thousand years of degeneration, at its weakest — and never once sinned. The difference between Christ and us is not the nature He bore but the life He lived in it: unbroken surrender to the Father. Guard both truths with equal force: full fallen NATURE, absolute sinlessness — nature is not sin, and consent never came. Use Waggoner (CHR — God manifest in sinful flesh; WOR on Rom. 8:3-4), Jones (CWCP — "in all things like unto his brethren"), EGW (DA 48-49, 112, 117; 1SM 253-256), quoting honestly the guard-statements about His sinless character.',
      terms: [
        'the last Adam was made a quickening spirit',
        'in the likeness of sinful flesh',
        'made of the seed of David according to the flesh',
        'made of a woman, made under the law',
        'took on him the seed of Abraham',
        'in all things it behoved him to be made like unto his brethren',
        'in all points tempted like as we are, yet without sin',
      ],
      symbols: [
        'the second Adam (= Christ standing where the first fell — in fallen flesh; 1 Cor. 15:45; Rom. 5:19)',
        'sinful flesh (= the fallen human nature Christ took and never obeyed; Rom. 8:3)',
      ],
    },
    {
      key: '04-born-of-the-spirit',
      part: 'II — The Pattern',
      title: 'Born of Water and of the Spirit — How He Lived, How We Begin',
      scope:
        'Christ was conceived of the Holy Ghost (Matt. 1:20; Luke 1:35 — "that holy thing") — born into the Spirit-filled, surrendered life; from childhood the Father’s will was His life (Luke 2:49; Ps. 40:8). He overcame by no power unavailable to us: the Son can do nothing of Himself (John 5:19, 30); the Father that dwelleth in Me, He doeth the works (John 14:10) — He lived BY FAITH, as man must. What He was from birth, we become by the NEW BIRTH: except a man be born of water and of the Spirit (John 3:3-7); the washing of regeneration and renewing of the Holy Ghost (Titus 3:5); the washing of water by the word (Eph. 5:26) — the laver-truth: cleansing joined to power, not by might, nor by power, but by my Spirit (Zech. 4:6; Acts 1:8). The result: a new creature (2 Cor. 5:17), partakers of the divine nature (2 Pet. 1:4) — Christlike from the same source Christ lived from.',
      terms: [
        'that holy thing which shall be born of thee shall be called the Son of God',
        'except a man be born of water and of the Spirit',
        'the washing of regeneration, and renewing of the Holy Ghost',
        'the washing of water by the word',
        'the Son can do nothing of himself',
        'partakers of the divine nature',
        'if any man be in Christ, he is a new creature',
      ],
      symbols: [
        'the new birth (= the Spirit re-creating the whole man; John 3:5-7; 2 Cor. 5:17)',
        'the laver / the washing (= regeneration by water, word, and Spirit — cleansing joined to power; Titus 3:5; Eph. 5:26)',
      ],
    },

    // ---- Part III: The Remedy ----
    {
      key: '05-what-salvation-is',
      part: 'III — The Remedy',
      title: 'What Salvation Really Is — Saved From Sin',
      scope:
        '"Thou shalt call his name JESUS: for he shall save his people FROM their sins" (Matt. 1:21) — from them, not in them. Salvation is deliverance from sin’s guilt (justification), from sin’s power (sanctification), and at last from sin’s presence (glorification); it is the restoration of the image of God in the soul (Col. 3:10; 2 Cor. 3:18). It is not a legal status only but a Person possessed: Christ IN you, the hope of glory (Col. 1:27; Gal. 2:20); being then MADE FREE from sin (Rom. 6:18, 22); able to save to the UTTERMOST (Heb. 7:25). A gospel that leaves men under sin’s dominion until death is not the everlasting gospel.',
      terms: [
        'he shall save his people from their sins',
        'renewed in knowledge after the image of him that created him',
        'Christ in you, the hope of glory',
        'being then made free from sin',
        'able also to save them to the uttermost',
        'changed into the same image from glory to glory',
      ],
      symbols: [
        'salvation (= God saving man FROM sin — its guilt, power, and presence — restoring His image; Matt. 1:21; Col. 3:10)',
      ],
    },
    {
      key: '06-rbf-gospel-in-verity',
      part: 'III — The Remedy',
      title: 'Righteousness by Faith — The Third Angel’s Message in Verity',
      scope:
        'Justification by faith: being justified freely by his grace (Rom. 3:24-28); to him that worketh not, but believeth (Rom. 4:3-5); THE LORD OUR RIGHTEOUSNESS (Jer. 23:6; 1 Cor. 1:30). Christ’s righteousness is both IMPUTED (our title) and IMPARTED (our fitness): the faith which worketh by love (Gal. 5:6); I live, yet not I, but Christ liveth in me (Gal. 2:20). This is the 1888 message: EGW — "The message of justification by faith … is the third angel’s message in verity" (verify: 1SM 372; RH April 1, 1890). Waggoner (CHR, GTI, WOR) and Jones (LOF_ATJ) carry it: righteousness by faith is not a softer standard but God’s own righteousness wrought in fallen men. Obedience is the fruit of this faith, never its root — and never optional.',
      terms: [
        'the just shall live by faith',
        'counted unto him for righteousness',
        'THE LORD OUR RIGHTEOUSNESS',
        'being justified freely by his grace',
        'faith which worketh by love',
        'I live; yet not I, but Christ liveth in me',
        'the righteousness of God which is by faith of Jesus Christ',
      ],
      symbols: [
        'righteousness by faith (= Christ’s obedience credited to the believer AND wrought in him by the indwelling Christ; Rom. 3-4; Gal. 2:20)',
      ],
    },
    {
      key: '07-victory-over-sin',
      part: 'III — The Remedy',
      title: 'Complete Victory — Overcoming as He Overcame',
      scope:
        'Can we truly stop sinning, or must we always fall short? Scripture’s answer: sin SHALL NOT have dominion over you (Rom. 6:14); whosoever is born of God doth not commit sin (1 John 3:9); whatsoever is born of God OVERCOMETH the world (1 John 5:4, 18); God is able to keep you from falling (Jude 24); always causeth us to triumph (2 Cor. 2:14); with every temptation a way to escape (1 Cor. 10:13); my grace is sufficient (2 Cor. 12:9); and the promise is to him that overcometh EVEN AS I ALSO OVERCAME (Rev. 3:21) — the same victory, by the same faith, in the same flesh. Provision is complete: no known sin need be retained. The believer who falls has an Advocate (1 John 2:1) — but falling is never necessary, and the message never lowers the mark to managed failure. Jones’ CWCP and Waggoner carry this; EGW (COL 311-319 — "the character of Christ" the standard; SC on the will) corroborates.',
      terms: [
        'sin shall not have dominion over you',
        'whosoever is born of God doth not commit sin',
        'whatsoever is born of God overcometh the world',
        'now unto him that is able to keep you from falling',
        'will with the temptation also make a way to escape',
        'to him that overcometh will I grant to sit with me in my throne, even as I also overcame',
        'my grace is sufficient for thee',
      ],
      symbols: [
        'the overcomer (= one in whom Christ lives out His own victory, in fallen flesh; Rev. 3:21; Gal. 2:20)',
      ],
    },

    // ---- Part IV: The Last Generation ----
    {
      key: '08-third-angels-message',
      part: 'IV — The Last Generation',
      title: 'The Commandments of God and the Faith of Jesus',
      scope:
        'Rev. 14:6-12: the everlasting gospel preached in the hour of God’s judgment; the three messages end by DESCRIBING the people they produce: "Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus" (Rev. 14:12). The third angel’s message is not law apart from gospel: righteousness by faith IS this message in verity (carry from "Righteousness by Faith — The Third Angel’s Message in Verity") — the faith OF Jesus, the very faith by which He overcame, now living in the saints, producing commandment-keeping. The judgment-hour setting makes the victory message present truth: a message must ripen a people who can stand.',
      terms: [
        'having the everlasting gospel to preach',
        'fear God, and give glory to him; for the hour of his judgment is come',
        'here is the patience of the saints',
        'here are they that keep the commandments of God, and the faith of Jesus',
        'the testimony of Jesus',
      ],
      symbols: [
        'the faith of Jesus (= the same faith by which Jesus overcame, now in the saints; Rev. 14:12)',
        'the third angel’s message (= the everlasting gospel in judgment-hour form — righteousness by faith producing a commandment-keeping people; Rev. 14:9-12)',
      ],
    },
    {
      key: '09-time-of-trouble',
      part: 'IV — The Last Generation',
      title: 'The Time of Trouble — Standing Without a Mediator',
      scope:
        'Before the second coming, Christ’s priestly intercession closes: "He that is unjust, let him be unjust still … he that is holy, let him be holy still. And, behold, I come quickly" (Rev. 22:11-12); the temple filled with smoke, no man able to enter, till the plagues be fulfilled (Rev. 15:8); Michael stands up, and there is a time of trouble such as never was (Dan. 12:1); the time of Jacob’s trouble — but he shall be saved out of it (Jer. 30:5-7; Gen. 32:24-30). The saints then live in the sight of a holy God WITHOUT AN INTERCESSOR for sin — not without Christ’s presence or the Spirit, but with every case decided. This is why the victory message precedes the crisis: those who stand have ceased from sin while the Advocate still pleads. EGW is explicit — verify GC 425 ("without a mediator"), GC 613-634 (Jacob’s trouble; "their sins had gone beforehand to judgment"), EW 71.',
      terms: [
        'he which is filthy, let him be filthy still',
        'he that is holy, let him be holy still',
        'no man was able to enter into the temple',
        'at that time shall Michael stand up',
        'a time of trouble, such as never was',
        'it is even the time of Jacob’s trouble; but he shall be saved out of it',
      ],
      symbols: [
        'the close of probation (= intercession ended, every case decided; Rev. 22:11)',
        'the time of Jacob’s trouble (= the sealed saints’ anguish without an intercessor, yet saved; Jer. 30:7)',
      ],
    },
    {
      key: '10-final-demonstration',
      part: 'IV — The Last Generation',
      title: 'The Harvest — A People in Whom Christ Is Vindicated',
      scope:
        'What the gospel can do, the last generation demonstrates. The 144,000 stand with the Lamb, "and in their mouth was found no guile: for they are without fault before the throne of God" (Rev. 14:1-5); the remnant of Israel shall do no iniquity (Zeph. 3:13); the bride hath made herself ready, arrayed in the righteousness of saints (Rev. 19:7-8). The harvest law: first the blade, then the ear, then the full corn — "when the fruit is brought forth, immediately he putteth in the sickle, because the harvest is come" (Mark 4:26-29) — Christ waits for His character to be perfectly reproduced in His people (verify COL 69), and then He comes. In them the manifold wisdom of God is shown to principalities and powers (Eph. 3:10); the accuser is answered (Rev. 12:10-11); God is vindicated in the very flesh where Satan claimed His law could not be kept. Tie the whole chain: what man is, what sin is, the nature Christ took, the new birth, salvation from sin, righteousness by faith, complete victory, the message, the standing without a mediator — all ripen here.',
      terms: [
        'in their mouth was found no guile: for they are without fault',
        'the remnant of Israel shall not do iniquity',
        'his wife hath made herself ready',
        'when the fruit is brought forth, immediately he putteth in the sickle',
        'the manifold wisdom of God',
        'they overcame him by the blood of the Lamb, and by the word of their testimony',
      ],
      symbols: [
        'the harvest (= the ripened likeness of Christ in His people, the signal for the sickle; Mark 4:29)',
        'the 144,000 / the remnant (= the last generation, sealed and without fault; Rev. 14:1-5; Zeph. 3:13)',
      ],
    },
  ],
};
