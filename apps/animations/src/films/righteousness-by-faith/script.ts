// The screenplay: ordered beats, each with what is said, who says it, its
// sources and what the picture does. A cast reads it (voice.ts): `lead`
// explains, and `ask` is the viewer beside him, curious, asking at each turn.
// `{@ask}` and `{@lead}` hand the line over; `{mark}` cues sit before the word
// a picture must hit.
//
// Every quotation is verbatim from sources.md and verified (quotes.jsonl for
// the pioneers, `bible verse` for the KJV); paraphrase stays inside its
// source's words. KJV supplied-word brackets are dropped for speech.
//
// The answer's shape, shown once in `message` and pulled back to at each turn:
// God does not just call us righteous; He makes us righteous by three gifts,
// faith (`spoke` to `centurion`), forgiveness (`exchange` to `robe`) and power
// (`look` to `within`), and sanctification is the daily choice to keep
// receiving them (`daily`). The hinge is `declared`: justified means made
// righteous, not merely counted so.
//
// Motifs (CRAFT rule 4):
// - The verdict. `cold` opens on a judge calling a guilty person righteous
//   ("That's a cover-up."), and the gold stamp drains hollow; `declared` fills
//   it ("not simply counted righteous, but actually made righteous"); `robe`
//   pays it off (not a cloak, not merely a judicial act: reclaiming from sin);
//   `name` returns to the same courtroom, where the stamp lands solid and the
//   glow answers from inside: He makes it true.
// - The garment. Fig leaves in `mirror` (our own sewing), the filthy clothes
//   in `accuser`, the robe from heaven's loom in `robe`; `name`: "Not by
//   sewing a better garment. By receiving one, and a new heart with it."
// - The spoken word. God speaks light in `spoke`, the soldier asks only for a
//   word in `centurion`, the word makes righteous in `declared`; `thesis` is a name.
// - The law. The circle in `word`, the mirror in `mirror`, the banner in
//   `message`; written inside the heart in `within`, kept by daily choice and
//   Sabbath rest in `daily`.
//
// Art direction (reference/bibleproject-tone-art.md): STORY is a cardboard
// diorama under 2–3-stop gradient skies, with grey paper figures whose faces
// are a brow line and eye strokes; IDEA is a light parchment page with ink
// figures and one gold prop. Scarlet marks sin (Isa 1:18), white the robe,
// gold the word. The colour script stays bright (mean luma 140–150): teal day
// at the open and the landing, peach to explain, one black moment at the cross,
// dawn at the answer.

import type { Beat } from '@bible/film/core';

export const script: ReadonlyArray<Beat> = [
  {
    id: 'cold',
    say: 'Imagine standing in a courtroom. {evidence}The evidence is overwhelming. {did}You did it. {judge}And the judge looks at you and says, {righteous}righteous. {@ask}{wait}Wait, that is not justice. {cover}That is a cover-up. {@lead}{right}Right? {bible}And yet the Bible says God justifies the ungodly. {oldest}So what is God doing? It is one of the oldest questions there is. Job asked it: {job}“How should man be just with God?”',
    cite: ['Romans 4:5', 'Job 9:2'],
    picture:
      "IDEA: a parchment courtroom. A small grey figure in a scarlet-stained garment stands before a tall bench; papers of evidence stack up beside them on `evidence`. On `righteous` the judge's gavel falls and a gold word stamps across the bench. On `wait` the frame tilts and pushes in on the figure's face, puzzled. On `oldest` the gold stamp (cue `stampGone`) does not vanish: it drains to a hollow gold outline and hangs over the bench, a verdict with nothing behind it (paid off in `declared` and `name`). On `job` the question writes itself above the bench, the only text: How should man be just with God?",
  },
  {
    id: 'title',
    picture:
      'Title over a teal-to-mint sky above a cardboard city: Righteousness by Faith, in a rounded heavy sans, cream. A small grey figure on a rooftop looks up at it.',
  },
  {
    id: 'message',
    say: "{year}In 1888, at a church conference in Minneapolis, {two}two young preachers, Ellet Waggoner and Alonzo Jones, took that question head on. {rep}Their church had a reputation: Adventists talk the law, the law, but do not preach Christ. {ew}Ellen White said God sent {precious}“a most precious message” through those two. {@ask}{what}So what was the message? {@lead}{answer}It was {angel}the third angel's message: {banner}the commandments of God, and the faith of Jesus. {hand}The law and the gospel, hand in hand. {three}In short, God does not just call us righteous. {makes}He makes us righteous, {gifts}with three gifts: {faith}faith, {forgiveness}forgiveness, {power}and power. {daily}And every day, we choose to keep receiving them.",
    cite: [
      'Ellen G. White, Letter 57, 1895 (TM 91–92)',
      'Ellen G. White, Ms 24, 1888',
      'Revelation 14:12',
      'E. J. Waggoner, The Present Truth, October 18, 1894, 659',
      'Ephesians 2:8',
      'Acts 5:31',
      'John 1:12',
      'Ellen G. White, Steps to Christ, 70',
    ],
    picture:
      'STORY: a cardboard meeting hall in 1888, warm peach light through tall windows. Two young men at the front, one with a Bible open, faces toward a crowd of grey figures. On `rep` the crowd splits: half hold small stone tablets up, half look for something missing; the tablets have no one with them. On `answer` every grey face turns toward a warm gold light rising behind the pulpit. On `angel` the roof lifts away and an angel flies across a teal sky trailing a banner; on `banner` it reads: the commandments of God, and the faith of Jesus. On `hand` a stone tablet and a cross come together into one gold emblem. On `three` push through into IDEA, the parchment page, on the same row. On `makes` the grey figure stands centre, and a warm light rises in their chest. On `gifts` three icons come in left to right, each set into an open hand held palm up (the hand from `look`, drawn once here): the gold word-bubble, faith (`faith`); the white robe, forgiveness (`forgiveness`); the heart with two small tablets inside, power (`power`). On `daily` a small sun arcs over the row, rising and setting two or three times, and each time the hand opens again.',
  },
  {
    id: 'word',
    say: "{@ask}Okay. Righteousness. {church}Honestly, that is a word I only hear in church. {@lead}{fair}Fair. {right}It just means right doing. {whose}The question is, right by whose measure? {psalm}The psalmist answers, {all}“All thy commandments are righteousness.” {char}Waggoner called God's law a transcript of his character, {circle}a circle as big as the universe.",
    cite: [
      "Ellen G. White, Christ's Object Lessons, 312",
      'Psalm 119:172',
      'E. J. Waggoner, Christ and His Righteousness, 48, 50',
    ],
    picture:
      "IDEA: the parchment page. The grey figure shrugs (`church`). A single word card: RIGHTEOUSNESS, and under it, right doing (`right`). A measuring tape unrolls and hangs, asking whose (`whose`). Two small stone tablets set down; the ten lines on them glow gold (`all`). A portrait of God is not drawn: the tablets' glow becomes a face-less warm light (`char`). On `circle` the tablets' outline widens into a gold circle that keeps growing past the page, planets and stars inside it.",
  },
  {
    id: 'mirror',
    say: "{short}And measured by that circle, every one of us comes up short. {fig}So we do what Adam and Eve did. We sew fig leaves. {harder}We try harder. {promise}We make promises. {@ask}{going}How is that going? {@lead}{rags}Isaiah's verdict: “All our righteousnesses are as filthy rags.” {mirror}And the law cannot fix that. It is a mirror. {stain}It shows the stain perfectly, {wash}but you cannot wash your face with a mirror.",
    cite: [
      'Romans 3:23',
      "Ellen G. White, Christ's Object Lessons, 311",
      'Isaiah 64:6',
      'Ellen G. White, Faith and Works, 31',
      'James 1:23',
    ],
    picture:
      'STORY: a peach garden of cardboard trees. The grey figure stands inside the gold circle, which is far too big for them (`short`). They sew fig leaves together, needle and thread, a close-up on their concentrating face (`fig`); the leaves are stained scarlet at the seams. They add patch after patch (`harder`), and hold up a hand in a promise (`promise`). On `rags` the patched garment droops into rags. On `mirror` the two tablets stand up as a tall mirror; the figure looks in and sees every stain, sharp and true (`stain`), and tries to scrub the glass (`wash`); the reflection stays stained. A light moment: the figure gives the mirror a look.',
  },
  {
    id: 'spoke',
    say: '{@ask}So if righteousness cannot come from us, {where}where does it come from? {@lead}{back}Jones went back to the beginning for that. {dark}In Genesis, the world starts dark and empty. {then}Then God speaks. {spake}“He spake, and it was done.” {only}Jones noticed something kind of amazing: God spoke the word only, {itself}and the word itself produced the thing.',
    cite: ['Genesis 1:2–3', 'Psalm 33:9', 'A. T. Jones, Lessons on Faith, 16'],
    picture:
      'STORY: the dip to black on `dark`: an empty dark cardboard world, no sky. On `then` a single gold word of light arcs across the dark and bursts into a sun; the sky floods dawn to teal, and land and water tear in beneath it, flat cardboard shapes rising into place (`spake`). On `only` the word of light hangs in the air and a tree grows up under it, as if drawn out of the word (`itself`).',
  },
  {
    id: 'centurion',
    // A pause after the key quotation (CRAFT rule 9) falls in the take, before
    // `gift`; the tail holds the turn to the first gift.
    tail: 1,
    say: "{same}He saw the same thing in a Roman soldier. {servant}The soldier's servant was dying, {offer}and Jesus offered to come to his house. {only}The soldier said, you do not need to come. Just speak the word. {healed}And his servant was healed. {@ask}{room}So he did not need Jesus in the room. {word}Just his word. {@lead}{exactly}Exactly. {def}And from that story Jones defined faith: {faith}“Faith is the expecting the word of God to do what it says and the depending upon that word to do what it says.” {gift}And even that faith is God's gift, the first of three.",
    cite: [
      'Matthew 8:5–13',
      'A. T. Jones, Lessons on Faith, 14–15',
      'Ephesians 2:8',
      'Ellen G. White, Signs of the Times, May 19, 1898',
    ],
    picture:
      "STORY: a warm cardboard town street at midday. The soldier (grey figure, red crest, face at a third of the frame) stands before Jesus (white robe, gold sash) on `offer`; Jesus gestures toward the far house. Close-up of the soldier's face, earnest, one hand raised: stop (`only`). Split: far across town, the servant in bed; a ribbon of gold light, the word, flies across the rooftops like a paper plane and reaches the bed, and the servant sits up (`healed`). On `faith` the gold word ribbon settles into an open hand, held up; the `hold` on the hand ends at `gift`. On `gift` pull back to IDEA, the three icons in the `message` layout, and the gold word-bubble (faith) lights.",
  },
  {
    id: 'declared',
    say: '{now}Now bring that back to our problem. {paul}Paul says we are {justified}justified. {@ask}{still}Justified? But I am still guilty. {cover}Is that the cover-up again? {@lead}{would}It would be, if God only said the words. {subst}But Waggoner saw it: {w}“People are not simply counted righteous, but actually made righteous.” {voice}The voice that said, let there be light, {speaks}speaks righteousness into a life {made}where there was none before.',
    cite: [
      'Romans 3:24',
      'E. J. Waggoner, The Present Truth, October 18, 1894, 659',
      'A. T. Jones, Lessons on Faith, 22–23',
      'E. J. Waggoner, The Glad Tidings, 77',
    ],
    picture:
      "IDEA: the parchment page, the act's one word card: JUSTIFY, δικαιόω, made righteous, coming in on `justified` (the `greek` cue pinned there). The grey figure in their scarlet-stained garment looks down at it, doubtful (`still`). On `cover` the hollow gold stamp from `cold` drifts in over the figure's head, in the same shape and scale. On `w` the hollow stamp fills solid gold, becomes heavy, and sinks into the figure's chest (replacing the word-bubble's `heavy` shot). On `voice` the dawn sky from `spoke` returns in a panel behind the figure; the same gold word of light arcs from it and lands on the figure's chest, and gold blooms there, spreading, a new creation where there was none before (`made`).",
  },
  {
    id: 'exchange',
    say: '{@ask}Okay, but how can God make guilty people righteous {fair}and still be fair? {@lead}{right}That is the right question. {notes}Ellen White answered it in her account of that 1888 conference: {treated}“He was treated as we deserve to be treated. He came to our world and {took}took our sins that we might take His righteousness.” {cross}Our sins went onto him at the cross. {rose}But the story does not end there. He rose, {up}and went up to heaven as our high priest. {plead}And {now}right now, she wrote, Christ is pleading for his people in the courts of heaven.',
    cite: [
      'Ellen G. White, Ms 24, 1888',
      '1 Peter 2:24',
      'Hebrews 8:1–2',
      'Ellen G. White, Letter 57, 1895 (TM 92)',
    ],
    picture:
      "STORY: sunset over a cardboard hill. Jesus walks up to the grey figure; close on both faces (`treated`). The scarlet stain lifts off the figure's garment as a scarlet cloth and goes onto Jesus' shoulders; he carries it up the hill (`took`). On `cross` the film's one black moment: the hill, the cross and the figures go to silhouette against the last red of the sky. On `rose` dawn relights the world: the empty tomb, the rolled stone, the white grave cloths folded. On `up` the camera tilts up with him into a teal sky, to a gold sanctuary in heaven; he stands there as high priest, robe and breastplate, hands raised in plea (`plead`). Pull back to the three icons: the robe lights.",
  },
  {
    id: 'accuser',
    say: "{zech}That is the very scene the prophet Zechariah saw. {joshua}Joshua the high priest stands before the Angel of the Lord {filthy}in filthy clothes, {satan}and Satan stands at his right hand to accuse him. {@ask}{room}Wait, the accuser is in the room? {@lead}{is}He is. {points}And he is not wrong about the clothes. {ew}Ellen White said this vision applies to God's people {day}“in the closing up of the great day of atonement.” {angel}But the Angel, Christ himself, {silence}silences the accuser.",
    cite: ['Zechariah 3:1–2', 'Ellen G. White, Testimonies for the Church, vol. 5, 468–472'],
    picture:
      "STORY: the heavenly court in the same gold sanctuary, laid out like the cold open's courtroom (same positions, bench at centre right). Joshua, a grey figure in a priest's turban, stands head bowed in scarlet-stained clothes (`filthy`), face at a third of the frame. On `satan` a tall angular shadow-grey figure steps up at his right and points at the stains; each stain flares as he points (`points`). The Angel, Christ in white and gold, stands before them at the bench. On `day` the court's high window shows a low gold sun: a great day closing. On `angel` Christ raises a hand; on `silence` the accuser's pointing arm drops and he shrinks back into shadow.",
  },
  {
    id: 'robe',
    say: "{take}Then he says, take the filthy clothes off him. {pass}I have taken your sin away, {clothe}and I will clothe you in new clothes. {loom}A robe from heaven's loom, Ellen White said, {woven}with not one thread of our own. {@ask}{nicer}So it is a cover-up. {just}Just a nicer one. {@lead}{no}No. {cloak}Christ does not give a cloak for sin, Waggoner said. {away}He takes it away. {judicial}God's forgiveness is more than a judge's ruling, she wrote. {reclaim}“It is not only forgiveness for sin, but {reclaiming}reclaiming from sin.”",
    cite: [
      'Zechariah 3:4',
      "Ellen G. White, Christ's Object Lessons, 311",
      'E. J. Waggoner, Christ and His Righteousness, 65',
      'Ellen G. White, Thoughts From the Mount of Blessing, 114',
    ],
    picture:
      "STORY: the same court. On `take` those standing before him lift the filthy clothes off Joshua and carry them out of the frame (Zech 3:4); on `pass` the last scarlet speck lifts from his skin. On `loom` push in to a gold loom in the light: white threads cross and a robe weaves itself, no hand at the loom but light (`woven`). The robe settles onto Joshua; close on his face as he looks down at it. On `nicer` the ask's doubt: a tiny cartoon cloak hovers over a stain. On `cloak` a cross-section: under the white robe the scarlet stain itself dissolves, not covered, gone (`away`). On `judicial` the cold open's gavel lies on the bench; the Angel moves it aside with the back of his hand (a light touch, not a shot of its own). On `reclaim` close on Joshua's face at human scale; under the white robe a warm glow rises where the heart is, a preview of the third gift, not yet lit. Then pull back to the three icons (`toIcons`, `pullBack` and `iconGlow` after `reclaim`): the robe, forgiveness, glows.",
  },
  {
    id: 'look',
    say: '{@ask}So what is my part? {faith}What does faith do? {@lead}{saviour}Faith is not our Saviour, Ellen White said. It earns nothing. {hand}It is the hand that takes hold of Christ. {desert}Remember Israel in the desert, bitten by snakes? {pole}Whoever looked up at the serpent on the pole lived. {harder}We still try to make it harder than that. {climb}Her counsel: “Do not climb the pole, but only look. I present Christ to you. Look and live.”',
    cite: [
      'Ellen G. White, The Desire of Ages, 175',
      'Numbers 21:8–9',
      'Ellen G. White, Letter 85, 1891',
    ],
    picture:
      'STORY: first the parchment: a stack of coins, medals and good deeds is held up and slides off; a plain open hand, palm up, and a gold light is laid in it (`hand`). Then a warm desert camp of cardboard tents under a peach sky; scarlet paper snakes in the sand (`desert`). The bronze serpent rises on its pole (`pole`). A grey figure starts to climb the pole, straining, comic, legs wrapped round it (`harder`), then stops, slides down, turns and simply looks up; close on their face as colour returns to it (`climb`).',
  },
  {
    id: 'within',
    say: "{@ask}So if it is all a gift, {out}is the law out of the picture? {@lead}{never}No, it moves in. {write}God writes it on the heart. {power}And that is the third gift: power. {not}Not just the right to be called God's children, Waggoner said, {become}but the power actually to become them. {plain}The church's 1889 statement put it this way: {first}we depend on Christ first to be justified from our past sins, {second}then for grace to obey his law from now on.",
    cite: [
      'Hebrews 8:10',
      'John 1:12',
      'E. J. Waggoner, The Present Truth, May 9, 1895, 290',
      'Fundamental Principles (1889), XVIII',
      'Ellen G. White, Steps to Christ, 18',
    ],
    picture:
      "IDEA: the parchment page. The gold circle from `word` returns, shrinks and settles into the grey figure's chest as a warm heart with the two tablets inside it, still legible (`never` to `write`). On `power` pull back to the three icons, and the heart lights (`heartLit`, moved here from the end). On `not` the grey figure again, the glow running out from the heart along the arms to the open hands. On `become` close on the face (a third of the frame), warm; the grey paper of the figure warms toward cream, the same gold as the word from `declared`. Two panels, one after the other: a forgiven past (a closed book, `first`), and a path ahead with the figure walking it, flowers springing up in their footprints (`second`).",
  },
  {
    id: 'daily',
    say: '{@ask}So once God makes me righteous, {done}am I done? {@lead}{kingdom}Well, God will not take a sinner at heart into his kingdom. {joy}Heaven would be no joy to a heart that still loves sin. {@ask}{keep}So how do I stay changed? {@lead}{will}We cannot change our own hearts, Ellen White said, {choose}but we can choose to give God our will. {matter}“This is a daily matter.” {sab}And every seventh day, Waggoner said, the Sabbath is righteousness by faith: {rest}we stop our own works, and rest in his.',
    cite: [
      'Revelation 21:27',
      'Ellen G. White, Steps to Christ, 17',
      'E. J. Waggoner, Christ and His Righteousness, 55',
      'Ellen G. White, Review and Herald, November 4, 1890',
      'Joshua 24:15',
      'Ellen G. White, Steps to Christ, 47, 70',
      'E. J. Waggoner, General Conference Daily Bulletin, March 8, 1897, 303',
      'Hebrews 4:10',
    ],
    picture:
      "IDEA, then STORY. On the parchment: on `kingdom` a gold city gate, light and small music notes drifting out. On `joy` a small grey figure in the cold open's scarlet stains stands at the gate with hands over ears: the notes jangle for them, a light moment, not a sad one. Never draw this figure in a white robe: a robe over the stains would picture a cloak for sin. On `keep` the ask's question. On `will` push through into STORY: a cardboard house at dawn under a peach-to-teal sky, and the robed figure from `robe`, heart glowing, at the window, face at a third of the frame. On `choose` they open their hand palm up (the hand from `look`), and the three small gold icons are laid in it. On `matter` quick sun arcs: day after day the hand opens again at dawn, and on the path outside one flower springs up each day (the path from `within`'s `second` panel). On `sab` the sixth sun sets gold, and the Sabbath begins at that sunset: the field at golden hour, tools set down, the figure resting against a tree, face calm (`rest`), the shot moved from `within`. Pull back to the three icons with the open hand under them, all lit.",
  },
  {
    id: 'rain',
    say: "{@ask}And where was all this heading? {@lead}{big}Somewhere big. {spirit}Jones tied it to the latter rain, the outpouring of God's Spirit, {blot}and to the blotting out of sins in the cleansing of the sanctuary. {loud}Ellen White said this message was to be given with a loud voice.",
    cite: [
      'A. T. Jones, The Consecrated Way to Christian Perfection, 124',
      'Acts 3:19',
      'Ellen G. White, Letter 57, 1895 (TM 91)',
    ],
    picture:
      'STORY: wide cardboard fields under a teal sky. Rain begins, silver-gold, and the fields green as it falls (`spirit`). Far above, the gold sanctuary from `exchange`: its light brightens and the last scarlet specks over the land wink out (`blot`). On `loud` the angel with the banner from `message` flies across again, and figures on rooftops across the city turn to look and wave to one another.',
  },
  {
    id: 'name',
    // The held pause before the landing's last words.
    tail: 1.2,
    say: '{@ask}Okay, so let me see if I have got it. {how}How should man be just with God? {not}Not by sewing a better garment. {receive}By receiving one, {heart}and a new heart with it. {@lead}{taking}By taking God at his word, {every}every day. {verdict}So when God says righteous, it is not a cover-up. {real}God never deals in make-believe. {true}He makes it true. {jer}And Jeremiah gave the coming King a name that says it all.',
    cite: [
      'Job 9:2',
      'Ezekiel 36:26',
      'E. J. Waggoner, The Present Truth, March 21, 1895, 177',
      'Ellen G. White, Steps to Christ, 70',
    ],
    picture:
      "Landing: IDEA and STORY merge. The cold open's courtroom layout (same bench, same positions, same framing) now stands in the cardboard world under the teal-to-yellow landing sky. The grey figure from the cold open stands where they stood, now in the white robe; Christ stands beside them as Advocate. The question from the cold open writes itself above the bench again (`how`). On `receive` the figure touches the robe's sleeve; on `heart` the heart glows through the robe (power). On `every` a sun passes across the court's high window. On `verdict` the gavel falls again, softly. On `real` the hollow stamp from `cold` appears above the bench; on `true` it lands solid across the bench as in the cold open, and the glow answers from inside the figure, not only on the robe. On `jer` the judge's bench glows gold.",
  },
  {
    id: 'thesis',
    // The landing: the music rises alone for about 30 s (CRAFT rule 10).
    min: 32,
    say: 'The Lord our righteousness.',
    cite: ['Jeremiah 23:6'],
    picture:
      'The held pause, then the answer writes itself where the question stood, the only text on screen: THE LORD OUR RIGHTEOUSNESS. Hold the whole courtroom in the light; the music rises alone for about thirty seconds while the camera eases back to the city and the two figures sit together on a rooftop under the landing sky.',
  },
  {
    id: 'end',
    picture: 'End card on parchment: Righteousness by Faith, and the sources.',
  },
];
