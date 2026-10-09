// The screenplay: ordered beats, each with what is said, its sources and what
// the picture does. One narrator reads it (voice.ts); `{mark}` cues sit before
// the word a picture must hit.
//
// The film speaks to every Christian (CRAFT rule 2): it quotes only
// Scripture, verbatim KJV checked with `bible verse` (supplied-word brackets
// dropped for speech). Ellen White and the pioneers are never quoted nor named
// in speech: their thought is said in the narrator's own words, inside their
// words (sources.md, quotes.jsonl), and the credits name them.
//
// The order: the question (`cold`), the title, the problem (`word`,
// `mirror`), then the answer's shape. `message` names it once: God does not
// just call us righteous; He makes us righteous with three gifts, faith,
// forgiveness and power, and every day we choose to keep receiving them.
// Scripture then shows the three gifts given, in that order, twice: the
// paralytic in `roof` (Mark 2), told and then counted, "One… two… three…",
// and the woman taken in adultery in `woman` (John 8), counted again. On each
// spoken count the icon band lights its icon, left to right.
//
// The count, then, runs the film. Each gift's section opens on the icon row
// with the gift's number, "The first gift: faith" (`spoke`), "The second
// gift: forgiveness" (`declared`), "The third gift: power" (`within`), and
// closes, or turns, on one callback to the two stories in the story's own
// layout (CRAFT rule 8):
// - faith, `spoke` → `centurion` → `look`: God's word creates, faith expects
//   the word to do it, faith is the hand that looks and lives; `look` pulls
//   back to the row and calls back `roof`'s four faces at the hole, lit gold.
// - forgiveness, `declared` → `exchange` → `accuser` → `robe`: the hinge is
//   `declared`, justified means made righteous, not merely counted so;
//   `robe` (the deepest turn) answers the cold open, "A cover-up, just a
//   nicer one? No.", and calls back `woman`'s court, the woman in white.
// - power, `within` → `daily`: the law moves in, written on the heart;
//   `within` calls back `roof`'s man walking out with his bed; `daily` keeps
//   receiving them by choice, and rests in the Sabbath.
// The count is an order, never a timetable: both stories give all three in
// one moment, and nothing pictures a delay between pardon and power.
//
// Motifs (CRAFT rule 4):
// - The verdict. `cold` opens on a judge calling a guilty person righteous
//   ("That is a cover-up."), and the gold stamp drains hollow; `declared` fills
//   it ("by the obedience of one shall many be made righteous"); `robe`
//   pays it off (not a cloak, not merely a judicial act: reclaiming from sin);
//   `name` returns to the same courtroom, where the stamp lands solid and the
//   glow answers from inside: He makes it true.
// - The garment. Fig leaves in `mirror` (our own sewing), the woman's stained
//   garment washed in `woman`, the filthy clothes in `accuser`, the robe from
//   heaven's loom in `robe`; `name`: "Not by sewing a better garment. By
//   taking God at his word, receiving his robe, and a new heart with it."
// - The spoken word. God speaks light in `spoke`, the soldier asks only for a
//   word in `centurion`, the word makes righteous in `declared`; `thesis` is a name.
// - The law. The word card in `word` (matched from the title's first word)
//   and its circle, the mirror in `mirror`, the banner in `message`, the
//   accuser's tablet in `woman`; written inside the heart in `within`, kept
//   by daily choice and Sabbath rest in `daily`.
// - The count. The three icons, set in the open hand in `message`, lit one,
//   two, three in `roof` and `woman`, and pulled back to at each gift.
//
// Tent poles (CRAFT rule 11), with their act's light and the question that
// opens the act (the chapters in `film.ts`):
// - `cold`: the hollow stamp over the bench, a cool even page. "How should
//   man be just with God?"
// - `roof`: the four faces at the hole in the roof, peach afternoon. "So what
//   was the message?"
// - `spoke`: the gold word of light arcing into the dark, peach to dawn.
//   "Where does faith come from?"
// - `exchange`: the cross in silhouette, the valley's one black moment.
//   "Isn't that a cover-up?"
// - `within`: the heart lit from inside, early gold. "So is the law out of the
//   picture?"
// - `name`: the stamp landing solid under the teal landing sky. "Where was all
//   this heading?"
//
// Art direction (reference/bibleproject-tone-art.md): STORY is a cardboard
// diorama under 2–3-stop gradient skies, with grey paper figures whose faces
// are a brow line and eye strokes; IDEA is a light parchment page with ink
// figures and one gold prop. Scarlet marks sin (Isa 1:18), white the robe,
// gold the word. The colour script stays bright (mean luma 140–150): teal day
// at the open and the landing, peach to explain, one black moment at the cross,
// dawn at the answer.

import { defineScript } from '@bible/film/core';

/** The film's name: the film, its title card and its credits all read it here. */
export const TITLE = 'Righteousness by Faith';

export const script = defineScript([
  {
    id: 'cold',
    say: 'Imagine standing in a courtroom. {evidence}The evidence is overwhelming. {did}You did it. {judge}And the judge looks at you and says, {righteous}righteous. {wait}Wait. That is not justice. {cover}That is a cover-up. {right}Right? {bible}And yet the Bible says God justifies the ungodly. {oldest}So what is God doing? It is one of the oldest questions there is. Job asked it: {job}“How should man be just with God?”',
    cite: ['Romans 4:5', 'Job 9:2'],
    picture:
      "IDEA: a parchment courtroom. A small grey figure in a scarlet-stained garment stands before a tall bench; papers of evidence stack up beside them on `evidence`. On `righteous` the judge's gavel falls and a gold word stamps across the bench. On `wait` the frame tilts and pushes in on the figure's face, puzzled. On `oldest` the gold stamp (cue `drain`) does not vanish: it drains to a hollow gold outline and hangs over the bench, a verdict with nothing behind it (paid off in `declared` and `name`). On `job` the question writes itself above the bench, the only text: How should man be just with God?",
  },
  {
    id: 'title',
    picture:
      'Title over a teal-to-mint sky above a cardboard city: Righteousness by Faith, in a rounded heavy sans, cream. A small grey figure on a rooftop looks up at it.',
  },
  {
    id: 'word',
    say: 'Righteousness. {church}A word most of us only hear in church. {fair}But it is simple. {right}It just means right doing. {whose}Right by whose measure? {psalm}The psalmist answers, {all}“All thy commandments are righteousness.” {char}His law is a portrait of his own character, {circle}a circle as big as the universe.',
    cite: [
      "Ellen G. White, Christ's Object Lessons, 312",
      'Psalm 119:172',
      'E. J. Waggoner, Christ and His Righteousness, 48, 50',
    ],
    picture:
      "IDEA: the parchment page, opened on a match cut from the title: its first word, Righteousness, drops out of the sky onto the parchment and becomes the act's word card, RIGHTEOUSNESS, while the rest of the title falls away. The grey figure shrugs (`church`). Under the word, right doing (`right`). A measuring tape unrolls and hangs, asking whose (`whose`). Two small stone tablets set down; the ten lines on them glow gold (`all`). A portrait of God is not drawn: the tablets' glow becomes a face-less warm light (`char`). On `circle` the tablets' outline widens into a gold circle that keeps growing past the page, planets and stars inside it.",
  },
  {
    id: 'mirror',
    // The v4 takes open on about 0.15 s of breath: a lead of 0.4 keeps the
    // seams between unbroken lines near 0.55 s, as a reader would.
    lead: 0.4,
    say: "{short}How do we measure up? Every one of us comes up short. {fig}So we do what Adam and Eve did. We sew fig leaves. {harder}We try harder. {promise}We make promises. {going}How is that going? {rags}Isaiah's verdict: “All our righteousnesses are as filthy rags.” {mirror}And the law? It is a mirror. {stain}It shows every stain, {wash}but you cannot wash your face with a mirror.",
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
    id: 'message',
    lead: 0.4,
    say: "{how}So how does anyone become righteous? {year}In Minneapolis in 1888, {two}two young preachers took that question head on. {rep}Their church had a reputation: they talked the law, the law, but did not preach Christ. {ew}Many had lost sight of Jesus. {precious}God was sending them a precious message, to turn their eyes back to him. {what}So what was the message? {answer}It was {angel}the third angel's message, {banner}“the commandments of God, and the faith of Jesus.” {hand}The law and the gospel, never apart. {three}God does not just call us righteous. {makes}He makes us righteous, {gifts}with three gifts: {faith}faith, {forgiveness}forgiveness, {power}and power. {daily}And every day, we choose to keep receiving them.",
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
      "STORY: on `how` the scene opens outside a cardboard meeting hall at dusk, one tall window lit warm; the fig-leaf figure from `mirror`, small and screen-left, looks up at it. On `year` the camera pushes through the lit window into the hall of 1888, warm peach light through tall windows. Two men at the front, one with a Bible open, faces toward a crowd of grey figures. On `rep` the crowd splits: half hold small stone tablets up in their hands, half look for something missing; the tablets have no one with them. On `answer` every grey face turns toward a warm gold light rising behind the pulpit. On `angel` the roof lifts away and an angel flies across a teal sky trailing a banner; on `banner` it reads: the commandments of God, and the faith of Jesus. On `hand` a stone tablet and a cross come together into one gold emblem. On `three` push through into IDEA, the parchment page, on the same row. On `makes` the grey figure stands centre, and a warm light rises in their chest. On `gifts` three icons come in left to right, each set into an open hand held palm up (the figure's own hand, pushed into): the gold word-bubble, faith (`faith`); the white robe, forgiveness (`forgiveness`); the heart with two small tablets inside, power (`power`). On `daily` a small sun arcs over the row, rising and setting two or three times, and each time the hand opens again.",
  },
  {
    // Mark 2:1–12 told, then counted: faith, forgiveness and power, each lit
    // on the icon band as the narrator counts it, while its moment replays in
    // its own framing. The owner's handbook study reads the gifts as the
    // court's gate, altar and laver.
    id: 'roof',
    lead: 0.4,
    say: '{see}What do these gifts look like? {roof}In Capernaum, four friends open a roof and lower a paralysed man on his bed to Jesus. {saw}Jesus saw their faith, {son}and said, “Son, thy sins be forgiven thee.” {scribes}Only God forgives sins, the scribes think. {easy}Easy to say, right? No one can see a sin forgiven. {arise}So Jesus says, arise, take up your bed, and go home. {went}And he walks out in front of them all. {count}Count what he received. {one}One: faith. They believed, and he took Jesus at his word. {two}Two: forgiveness, before a word about his legs. {three}Three: power, to get up and walk, {proof}the proof that two was real.',
    cite: ['Mark 2:1–12'],
    picture:
      "STORY: the question on `see` pushes through the faith icon of `message`'s row into the scene. A cardboard house in Capernaum, packed with grey figures (varied heights and headcloths, never cloned), under a peach sky; 3–5 planes, the crowd near, the house wall far. Screen direction holds the film's: the one receiving is screen-left, Jesus screen-right. On `roof` four friends on the flat roof lift tiles away and lower the man on his bed on ropes into the room. On `saw` Jesus (white robe, gold sash) looks up at the four faces in the hole, a face at a third of the frame. On `son` close on the man's face as the scarlet specks lift off him. On `scribes` a plane slide racks to two scribes on a bench at the far wall, in profile, brows down; on `easy` back to the man, still lying on his bed: nothing anyone can see has changed yet. On `arise` he stands and rolls up his bed; on `went` he carries it out through the parting crowd, faces amazed. On `count` the three-icon band from `message` slides up along the bottom, small, with no numerals. Each number replays its moment in the same framing, held for a breath while its icon lights: on `one` the four faces at the hole, and the gold word-bubble lights; on `two` the man's face as the specks lift, and the robe lights; on `three` the man walking out with his bed, and the heart lights. On `proof` a thread of light runs back along the band from the heart to the robe: the walk vouching for the pardon.",
  },
  {
    // John 8:2–11 told, then counted again, quicker: the viewer counts along.
    id: 'woman',
    lead: 0.4,
    say: '{court}Then a woman is brought into the temple court, caught in adultery. {law}Moses said to stone her, they say. {dust}Jesus stoops and writes in the dust. {first}Let the one without sin throw the first stone. {leave}One by one, they go. {alone}Only the two of them are left. {none}Has no man condemned you? {lord}No man, Lord. {told}And Jesus said: “Neither do I condemn thee: go, and sin no more.” {again}Count again. {one}One: faith. She calls him Lord. {two}Two: forgiveness. No condemnation. {three}Three: power, to go and sin no more. {order}The same three, in the same order.',
    cite: ['John 8:2–11'],
    picture:
      "STORY: on `court` cut to a temple court in the same peach light: the woman stands in the middle in a scarlet-stained garment, her accusers around her holding stones (varied silhouettes). On `law` one accuser holds up a small stone tablet, the law's shape from `word`, as the charge. On `dust` Jesus stoops and writes in the dust with one finger; nothing in the dust is readable (CRAFT rule 1). On `first` he straightens. On `leave` the stones drop into the dust one by one and the accusers go out of frame, eldest first; on `alone` the wide shot shows only the two of them. On `none` Jesus asks, in three-quarter. On `lord` her face at a third of the frame, looking up. On `told` reverse to Jesus's face as he speaks the quotation (the speaker's close-up); on `go` her stain washes out and she turns and walks out of frame screen-left, upright. On `again` the band slides up, and each number replays its moment: on `one` her face looking up, and faith lights; on `two` Jesus speaking, and the robe lights; on `three` her walking out upright, and the heart lights. On `order` pull back to IDEA: the three icons in the `message` layout, all lit.",
  },
  {
    id: 'spoke',
    lead: 0.4,
    say: "{gift}The first gift: faith. {where}Where does it come from? {from}From God's word. {back}Go back to the beginning. {dark}The world starts dark and empty. {then}The psalm says, {spake}“He spake, and it was done.” {only}Notice something amazing: God only spoke the word, {itself}and the word itself made the thing.",
    cite: ['Romans 10:17', 'Genesis 1:2–3', 'Psalm 33:9', 'A. T. Jones, Lessons on Faith, 16'],
    picture:
      "IDEA, then STORY. The scene opens on `woman`'s closing layout, the three icons all lit. On `gift` the gold word-bubble pulses and the other two dim. On `where` the grey figure beside the row looks at it, curious. On `from` the camera pushes through the word-bubble, and an open book comes up out of the gold; on `back` its pages turn to the beginning. The dip to black on `dark`: an empty dark cardboard world, no sky. On `then` a single gold word of light arcs across the dark and bursts into a sun; the sky floods dawn to teal, and land and water tear in beneath it, flat cardboard shapes rising into place (`spake`). On `only` the word of light hangs in the air and a tree grows up under it, as if drawn out of the word (`itself`).",
  },
  {
    id: 'centurion',
    lead: 0.4,
    // The icons light while the voice still speaks, and `look` carries on in
    // the same act: a short hold after the gift is named.
    tail: 0.6,
    say: "{same}You see it again in a Roman soldier, {servant}whose servant was dying. {offer}Jesus offered to come. {only}You need not come, said the soldier. Just speak the word. {healed}The servant was healed, {room}with Jesus nowhere in the room. {def}That is what faith is. {faith}It expects God's word to do what it says, and leans on that word alone to do it. {gift}And even that faith is God's gift.",
    cite: [
      'Matthew 8:5–13',
      'A. T. Jones, Lessons on Faith, 14–15',
      'Ephesians 2:8',
      'Ellen G. White, Signs of the Times, May 19, 1898',
    ],
    picture:
      "STORY: a warm cardboard town street at midday. The soldier (grey figure, red crest, face at a third of the frame) stands before Jesus (white robe, gold sash) on `offer`; Jesus gestures toward the far house. Close-up of the soldier's face, earnest, one hand raised: stop (`only`). Split: far across town, the servant in bed; a ribbon of gold light, the word, flies across the rooftops like a paper plane and reaches the bed, and the servant sits up (`healed`). At the end of `room` the soldier's own hand, held up. On `faith` the gold word ribbon settles into the open hand; the `hold` on the hand ends at `gift`. On `gift` pull back to IDEA, the three icons in the `message` layout, and the gold word-bubble (faith) lights.",
  },
  {
    id: 'look',
    // A pause after the key quotation (CRAFT rule 9): the pull back to the
    // icons and the callback to `roof`'s four faces at the hole.
    tail: 2.8,
    say: '{faith}So what does faith do? {saviour}Faith is not our Saviour. It earns nothing. {hand}It is only the hand that takes hold of Christ. {desert}Remember Israel, bitten by snakes? {pole}Whoever looked at the serpent on the pole lived. {harder}We still make it harder. {climb}But no one has to climb the pole. Just look to Christ: “Look unto me, and be ye saved.”',
    cite: [
      'Ellen G. White, The Desire of Ages, 175',
      'Numbers 21:8–9',
      'John 3:14–15',
      'Ellen G. White, Letter 85, 1891',
      'Isaiah 45:22',
    ],
    picture:
      'STORY: first the parchment: a stack of coins, medals and good deeds is held up and slides off; a plain open hand, palm up, and a gold light is laid in it (`hand`). Then a warm desert camp of cardboard tents under a peach sky; scarlet paper snakes in the sand (`desert`). The bronze serpent rises on its pole (`pole`). A grey figure starts to climb the pole, straining, comic, legs wrapped round it (`harder`), then stops, slides down, turns and simply looks up; close on their face as colour returns to it (`climb`). After the last word, pull back to the three icons in the `message` layout, the gold word-bubble glowing; for a breath, under the faith icon, the callback to `roof` in its `saw` framing: the four faces at the hole in the roof, lit gold from below.',
  },
  {
    id: 'declared',
    say: '{now}The second gift: forgiveness. {paul}Paul calls it being {justified}justified. {still}Justified? But we are still guilty. {cover}Is that the cover-up again? {would}It would be, if God only said the words. {subst}But Paul goes further: {w}“by the obedience of one shall many be made righteous.” {voice}The voice that said, let there be light, {speaks}speaks righteousness into a life {made}where there was none before.',
    cite: [
      'Romans 3:24–25',
      'Romans 5:19',
      'E. J. Waggoner, Christ and His Righteousness, 65',
      'E. J. Waggoner, The Present Truth, October 18, 1894, 659',
      'A. T. Jones, Lessons on Faith, 22–23',
      'E. J. Waggoner, The Glad Tidings, 77',
    ],
    picture:
      "IDEA: the scene opens on `look`'s closing icons. On `now` the white robe lights beside the glowing faith icon, and the row lifts off the top as the parchment comes forward. The act's one word card: JUSTIFY, δικαιόω, made righteous, coming in on `justified` (the `greek` cue pinned there). The grey figure in their scarlet-stained garment looks down at it, doubtful (`still`). On `cover` the hollow gold stamp from `cold` drifts in over the figure's head, in the same shape and scale. On `w` the hollow stamp fills solid gold, becomes heavy, and sinks into the figure's chest. On `voice` the dawn sky from `spoke` returns in a panel behind the figure, in `spoke`'s layout; the same gold word of light arcs from it and lands on the figure's chest, and gold blooms there, spreading, a new creation where there was none before (`made`).",
  },
  {
    id: 'exchange',
    lead: 0.4,
    say: 'But how can God make the guilty righteous {fair}and still be fair? {notes}Here is the answer. {treated}Jesus was given what we deserve. {took}He took our sins, so that we might take his righteousness. {cross}He bore them on the cross. {rose}But the story does not end there. He rose, {up}and went up to heaven as our high priest. {now}And right now, “he ever liveth to make intercession” for us.',
    cite: [
      'Ellen G. White, Ms 24, 1888',
      '2 Corinthians 5:21',
      '1 Peter 2:24',
      'Hebrews 8:1–2',
      'Hebrews 7:25',
      'Ellen G. White, Letter 57, 1895 (TM 92)',
    ],
    picture:
      "STORY: sunset over a cardboard hill. On `fair` Jesus walks up to the grey figure; close on both faces (`treated`). The scarlet stain lifts off the figure's garment as a scarlet cloth and goes onto Jesus' shoulders; he carries it up the hill (`took`). On `cross` the film's one black moment: the hill, the cross and the figures go to silhouette against the last red of the sky. On `rose` dawn relights the world: the empty tomb, the rolled stone, the white grave cloths folded. On `up` the camera tilts up with him into a teal sky, to a gold sanctuary in heaven; he stands there as high priest, robe and breastplate, hands raised in plea (`now`). Pull back to the three icons: the robe lights.",
  },
  {
    id: 'accuser',
    lead: 0.4,
    say: "{zech}The prophet Zechariah saw that very court. {joshua}Joshua the high priest, {filthy}in filthy clothes, stands before the Angel, {satan}and Satan stands at his right hand to accuse him. {room}The accuser is right there. {points}He is not wrong about the clothes. {ew}And the vision speaks to God's people {day}as the great day of atonement closes. {angel}But the Angel, Christ himself, {silence}silences the accuser: “The LORD rebuke thee, O Satan.”",
    cite: ['Zechariah 3:1–2', 'Ellen G. White, Testimonies for the Church, vol. 5, 468–472'],
    picture:
      "STORY: the heavenly court in the same gold sanctuary, laid out like the cold open's courtroom (same positions, bench at centre right). Joshua, a grey figure in a priest's turban, stands head bowed in scarlet-stained clothes (`filthy`), face at a third of the frame. On `satan` a tall angular shadow-grey figure steps up at his right and points at the stains; each stain flares as he points (`points`). The Angel, Christ in white and gold, stands before them at the bench. On `day` the court's high window shows a low gold sun: a great day closing. On `angel` Christ raises a hand; on `silence` the accuser's pointing hand drops and he shrinks back into shadow.",
  },
  {
    id: 'robe',
    lead: 0.4,
    // The pull back to the three icons, forgiveness lit, comes after the
    // quotation's last word; the tail holds it and the callback to `woman`
    // under the robe for a breath, and `within` opens on the same icons.
    tail: 1.4,
    say: "{take}He says, take the filthy clothes off him. {pass}I have taken your sin away, {clothe}and I will clothe you anew. {loom}A robe woven on heaven's loom, {woven}not one thread of it ours. {nicer}A cover-up, {just}just a nicer one? {no}No. {cloak}Christ gives no cloak for sin. {away}He takes it away. {judicial}It is more than a ruling: {reclaim}“he is faithful and just to forgive us our sins, {reclaiming}and to cleanse us from all unrighteousness.”",
    cite: [
      'Zechariah 3:4',
      "Ellen G. White, Christ's Object Lessons, 311",
      'E. J. Waggoner, Christ and His Righteousness, 65',
      'Ellen G. White, Thoughts From the Mount of Blessing, 114',
      '1 John 1:9',
    ],
    picture:
      "STORY: the same court. On `take` those standing before him lift the filthy clothes off Joshua and carry them out of the frame (Zech 3:4); on `pass` the last scarlet speck lifts from his skin. On `loom` push in to a gold loom in the light: white threads cross and a robe weaves itself, no hand at the loom but light (`woven`). The robe settles onto Joshua; close on his face as he looks down at it. On `nicer` the doubt: a tiny cartoon cloak hovers over a stain. On `cloak` a cross-section: under the white robe the scarlet stain itself dissolves, not covered, gone (`away`). On `judicial` the cold open's gavel rests on the bench, the ruling standing, and a warm glow begins to rise in Joshua's chest: more than the ruling. On `reclaim` close on Joshua's face at human scale; under the white robe the glow rises where the heart is, a preview of the third gift, not yet lit, and he looks up glad on `reclaiming`. After the quotation's last word, pull back to the three icons (`toIcons`, `pullBack` and `iconGlow` on the speech's end): the robe, forgiveness, glows. Callback to `woman` (CRAFT rule 8, a graphic match in its layout): under the glowing robe icon, the robe left whole above it, for a breath, the temple court from `woman` in the same framing, the woman standing where she stood, the stones in the dust, now in white.",
  },
  {
    id: 'within',
    say: "{power}The third gift: power. {out}So is the law out of the picture? {never}No, it moves in. {write}God writes it on the heart. {bed}Christ gave the paralysed man power to walk. {not}Not just the right to be called God's children, {become}but “power to become the sons of God.” {plain}So we depend on Christ for both: {first}first, to be justified from our past sins, {second}then for grace to obey his law from now on.",
    cite: [
      'Hebrews 8:10',
      'Mark 2:11–12',
      'John 1:12',
      'E. J. Waggoner, The Present Truth, May 9, 1895, 290',
      'Fundamental Principles (1889), XVIII',
      'Ellen G. White, Steps to Christ, 18',
    ],
    picture:
      "IDEA: the scene opens on `robe`'s closing icons, forgiveness glowing and the woman fading beneath. On `power` the heart lights. On `out` the camera pushes into the parchment. The gold circle from `word` returns, shrinks and settles into the grey figure's chest as a warm heart with the two tablets inside it, still legible (`never` to `write`). On `bed` the callback to `roof` in its layout, under the lit heart, its tablets left whole: for a breath, the man from Capernaum walks out through the crowd with his bed on his shoulder, as he did on `went`. On `not` the grey figure again, the glow running out from the heart to the open hands. On `become` close on the face (a third of the frame), warm; the grey paper of the figure warms toward cream, the same gold as the word from `declared`. Two panels, one after the other: a forgiven past (a closed book, `first`), and a path ahead with the figure walking it, flowers springing up in their footprints (`second`).",
  },
  {
    id: 'daily',
    say: 'Once made righteous, {done}are we done? {joy}Heaven would be no joy to a heart that still loves sin. {keep}So how do we stay changed? {will}We cannot change our own hearts, {choose}but we can choose to give God our will. {matter}“Choose you this day whom ye will serve.” Every day, again. {sab}And the Sabbath is righteousness by faith: {rest}we stop our own works, and rest in his.',
    cite: [
      'Ellen G. White, Steps to Christ, 17',
      'Ellen G. White, Review and Herald, November 4, 1890',
      'Joshua 24:15',
      'Ellen G. White, Steps to Christ, 47, 70',
      'E. J. Waggoner, General Conference Daily Bulletin, March 8, 1897, 303',
      'Hebrews 4:10',
    ],
    picture:
      "IDEA, then STORY. On the parchment: on `joy` a gold city gate, light and small music notes drifting out, and a small grey figure in the cold open's scarlet stains stands at the gate with hands over ears: the notes jangle for them, a light moment, not a sad one. Never draw this figure in a white robe: a robe over the stains would picture a cloak for sin. On `keep` the question. On `will` push through into STORY: a cardboard house at dawn under a peach-to-teal sky, and the robed figure from `robe`, heart glowing, at the window, face at a third of the frame. On `choose` they open their hand palm up (the hand from `look`), and the three small gold icons are laid in it. On `matter` quick sun arcs: day after day the hand opens again at dawn, and on the path outside one flower springs up each day (the path from `within`'s `second` panel). On `sab` the sixth sun sets gold, and the Sabbath begins at that sunset: the field at golden hour, tools set down, the figure resting against a tree, face calm (`rest`). Pull back to the three icons with the open hand under them, all lit.",
  },
  {
    id: 'rain',
    lead: 0.4,
    // The angel's flight (`fly`, 3 s from `loud`) outlasts the short last
    // line: a held breath lets the banner cross before `name` cuts in.
    tail: 0.5,
    say: 'Where was all this heading? {big}Somewhere big. {spirit}To the latter rain, the Spirit poured out. {blot}To the blotting out of sins, as the sanctuary is cleansed. {loud}A message cried “with a loud voice.”',
    cite: [
      'A. T. Jones, The Consecrated Way to Christian Perfection, 124',
      'Joel 2:23',
      'Acts 3:19',
      'Daniel 8:14',
      'Ellen G. White, Letter 57, 1895 (TM 91)',
      'Revelation 14:9',
    ],
    picture:
      'STORY: wide cardboard fields under a teal sky. Rain begins, silver-gold, and the fields green as it falls (`spirit`). Far above, the gold sanctuary from `exchange`: its light brightens and the last scarlet specks over the land wink out (`blot`). On `loud` the angel with the banner from `message` flies across again, and figures on rooftops across the city turn to look and wave to one another.',
  },
  {
    id: 'name',
    lead: 0.4,
    // The held pause before the landing's last words (CRAFT 7: about 3 s
    // with `thesis`'s lead), declared in the scene as a designed silence.
    tail: 2,
    say: "So, back to Job's question. {how}How should man be just with God? {not}Not by sewing a better garment. {taking}By taking God at his word, {receive}receiving his robe, {heart}and a new heart with it, {every}every day. {verdict}When God says righteous, it is not a cover-up. {real}God never deals in make-believe. {true}He makes it true. {jer}And Jeremiah gave the coming King his name.",
    cite: [
      'Job 9:2',
      'Ezekiel 36:26',
      'E. J. Waggoner, The Present Truth, March 21, 1895, 177',
      'Ellen G. White, Steps to Christ, 70',
    ],
    picture:
      "Landing: IDEA and STORY merge. The cold open's courtroom layout (same bench, same positions, same framing) now stands in the cardboard world under the teal-to-yellow landing sky. The grey figure from the cold open stands where they stood, now in the white robe; Christ stands beside them as Advocate. The question from the cold open writes itself above the bench again (`how`). The middle follows the count: on `taking` a small gold word of light settles into the robed figure's open hand (faith); on `receive` the figure touches the robe's sleeve (forgiveness); on `heart` the heart glows through the robe (power). On `every` a sun passes across the court's high window. On `verdict` the gavel falls again, softly. On `real` the hollow stamp from `cold` appears above the bench; on `true` it lands solid across the bench as in the cold open, and the glow answers from inside the figure, not only on the robe. On `jer` the judge's bench glows gold, and it is still swelling through the held breath after the last word.",
  },
  {
    id: 'thesis',
    // The landing: the music rises alone for about 28 s (CRAFT rule 10).
    min: 30,
    say: 'The Lord our righteousness.',
    cite: ['Jeremiah 23:6'],
    picture:
      'The held pause, then the answer writes itself where the question stood, the only text on screen: THE LORD OUR RIGHTEOUSNESS. Hold the whole courtroom in the light; the music rises alone for about thirty seconds while the camera eases back to the city and the two figures sit together on a rooftop under the landing sky.',
  },
  {
    id: 'end',
    // The credits roll over the landing's pull back (20–30 s), and the last
    // seconds hold clear for the end screens; its length holds `name` at 84 %
    // of the film or under.
    min: 30,
    picture:
      "STORY: the credits over the landing's last shot. The camera keeps easing back from where `thesis` leaves the city, the two still sitting together on the rooftop, while the film's name and its sources (each beat's cite, by author) roll up a torn paper strip at the left for about 22 s; then the strip goes and the city holds clear for the end screens. Nothing breathes.",
  },
]);

/** A beat's id: the name a drawing, a light and a short take it by. */
export type BeatId = (typeof script)[number]['id'];
