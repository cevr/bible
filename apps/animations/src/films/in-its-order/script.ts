// In Its Order: the screenplay of The Path of the Just, episode 01 of 44,
// the series' opener (Tier One, the milk). The owner kept its draft
// (`apps/animations/series/theology/scripts/01-in-its-order.md`: "Keep it:
// go on to the concept and the Board"), so this file is the film's script
// and the source of what is said; the draft is not edited for it. The
// series is named for Proverbs 4:18; milk and meat are said only inside the
// film, never in a title, a card label or a thumbnail (owner, 2026-10-20).
//
// One narrator reads it, the owner, in his voice
// (`.claude/skills/film/reference/owner-voice.md`), in the series' Language
// (`apps/animations/series/README.md`), which wins where the two differ, and
// to Ellen White's account of Christ's manner of speaking
// (`.claude/skills/film/reference/voice-counsel.md`), timed at 150–165 wpm.
// It speaks to every Christian (CRAFT rule 2): it quotes only Scripture,
// verbatim KJV checked with `bible verse` (supplied-word brackets dropped for
// speech), one quotation a beat. Ellen White and the pioneers are never
// quoted nor named in speech: their thought is said in the narrator's own
// words, inside their words (sources.md, quotes.jsonl), and the credits name
// them. No denomination and no church history after the apostles.
//
// Each line is marked for delivery
// (`.claude/skills/film/reference/elevenlabs-delivery.md`): `{*}` before the
// word that carries the sense, `{/}` a breath, `{//}` a hold (0.6 s, or the
// seconds it names) at an act's question, after a key quotation and at a
// register switch. `{mark}` cues sit before the word a picture must hit.
//
// The order. The joke (`cold`: a grown man at a wedding feast still asking
// for his bottle; Hebrews says that to its readers), the title, then what
// milk is (`milk`: the plain word), which truths are the milk (`stones`: the
// six first principles of Hebrews 6:1–2, the series' first tier), the
// problem in one small dose (`bottle`, `teeth`: some never chew), its other
// side (`rush`: some skip the first steps and twist the rest; owner,
// 2026-10-20), the turn (`math`: the meat leaves out nothing that was in the
// milk), what the meat is (`priest`: more of Christ, His priesthood now), how
// growth happens (`grain`, `eat`), the series map (`path`), and the landing
// back at the feast (`name`). The series' thesis is one Waggoner devotional
// page (MEDM September 1904, 286.4–286.8), and the script stays inside its
// words. `priest` names the meat as Hebrews names it and shows Christ
// entering the veil; where He ministers when belongs to Tier Two.
//
// Motifs (CRAFT rule 4), each introduced and paid off:
// - The cup. A baby's cup of milk in `cold`; filled in `milk` from an open
//   book (the milk is the word); in the landing the grown man sets the bottle
//   down at a set table, and the cup stands among the bread and the dishes,
//   still there (`math` paid off: nothing in the milk is left behind).
// - The six stones. Laid as a foundation in `stones`, each with its small
//   gold icon; hopped over in `rush`; the first rise of the path in `path`;
//   the courtyard's paving for a breath in `name`. Tier One's episode map.
// - The grain. A seed in `grain` grows blade, ear, full corn; in the landing
//   the bread on the table is that corn.
// - The light from the cross. A small gold cross on the page in `priest`,
//   whose light widens over the stones; in `path` the whole path lies inside
//   its light; in `name` it warms the whole courtyard.
// The setting bookends (CRAFT rule 4): `cold` and `name` are one wedding
// courtyard in one layout and framing, changed: the landing's teal-to-yellow
// sky, the bottle set down, Christ the host at the head of the table.
//
// Tent poles (CRAFT rule 11), each with its act's light and the question that
// opens the act (the chapters, `acts.ts`):
// - `cold`: the feast table, a grown grey figure holding a baby's bottle,
//   teal day. "What are milk and meat?"
// - `stones`: six stones set in a row on parchment, peach. "Which truths are
//   the milk?"
// - `math`: the slate of sums combining into one great sum, peach to dawn
//   (episodes 07 and 10 reuse the slate). "Do we leave the milk behind?"
// - `priest`: the veil with gold light behind it, dawn gold. "So what is the
//   meat?"
// - `name`: the set table under the teal landing sky. "How does anyone
//   grow?" (its act opens on `grain`).
//
// Registers (CRAFT rule 3): IDEA (parchment, flat figures, one gold prop) for
// `milk`, `stones`, `teeth`, `rush`, `math`, `path`; STORY (cardboard
// diorama, faces) for `cold`, `bottle` (Corinth), `grain` (a field), `eat`
// (Jeremiah); `priest` goes from IDEA into STORY; the landing merges them.
// The film has no black moment; its valley is a short dusk in `bottle`. The
// narration's words appear on screen only as full-screen cards the engine
// sets (CRAFT rule 1): no picture carries lettering. The draft wrote the
// thesis in the sky over the courtyard; here it is the thesis's card, and
// the picture cuts back to the courtyard after it.
//
// The cast (the draft's `## Cast`; character-design 2.3, casting.md). Every
// figure wears sleeves, a circle hand at each sleeve's end and no thumbs, and
// is shaded with colour, never grey or black (CRAFT rule 12).
// - The grown man at the feast is the series' plain lead, never named, in a
//   festive dress new to the library (the plain lead's sheet, his garment
//   changed by the story alone). The mother and the baby at the cup, and the
//   IDEA figures (the drinkers, the child at the slate, the toddler who runs,
//   the one who skips the stones, the eater and the watcher), are plain
//   figures from the same sheet.
// - Jesus Christ is the locked figure (`src/library/cast/christ`), at the top
//   of the court canon's height band, never short: as Priest in `priest` (a
//   white robe, the golden girdle and the breastplate, seen from behind
//   passing in through the veil), and in His earthly dress (the seamless
//   linen coat and the walnut mantle) as the host in `name`. The Father is
//   never pictured: the host is Christ.
// - Paul (`bottle`), the sower (`grain`) and Jeremiah (`eat`) are Bible
//   figures in story cloth, each drawn once as shared cast.
// - The wedding guests and the Corinthian church come from the crowd kit
//   (casting.md 2.2, 2.6), a seeded mix of the base rigs. The recurring cast
//   (docs/ensemble.md) may sit among the guests as background, and none is
//   required.
//
// Quoted Scripture: 11 passages, 161 of 884 spoken words (18.2 %). 2 Peter
// 3:18 (`thesis`) is quoted from "Grow", its opening "But" dropped; Proverbs
// 4:18 (`path`) likewise.

import { defineScript } from '@bible/film/core';

/** The film's name: the film, its title card and its credits all read it here. */
export const TITLE = 'In Its Order';

/** Every brief carries it (CRAFT rule 1). */
const CARDS =
  "The narration's words appear only as full-screen cards: nothing in the picture carries lettering.";

export const script = defineScript([
  {
    id: 'cold',
    say: '{baby}A baby drinks milk, and nobody minds. {/} {grown}But picture a grown man at a wedding feast, {bottle}still asking for his {*}bottle. {/} {letter}Now picture a letter to believers that says nearly the {*}same. {/} {quote}They “are become such as have need of milk, and not of strong {*}meat.” {//} {ouch}And that letter is in our {*}Bible. {/} {what}So what is milk, and what is meat? {/} {why}And why would the Bible care which one we eat?',
    cite: ['Hebrews 5:12'],
    picture: `STORY: a cardboard courtyard at a village wedding, teal day, lanterns strung, a long table of bread, fruit and dishes. On \`baby\` a mother lifts a cup to a baby's lips, close on the baby's glad face. On \`grown\` the camera trucks down the table to a tall grey grown man in festive clothes; on \`bottle\` he holds up a baby's bottle, hopeful, and the guests either side turn and stare (a light moment). On \`letter\` a rolled scroll drops onto the table in front of him and unrolls; on \`quote\` its words are not shown (CRAFT rule 1), only the gold seal. On \`ouch\` he winces. On \`what\` the camera lifts to a cup of milk and a platter of bread side by side, the only props lit. ${CARDS}`,
  },
  {
    id: 'title',
    picture: `STORY: Title over the teal sky above the courtyard: The Path of the Just. Under it a thin gold path rises toward a small dawn light, the hill of \`path\` in miniature. No cup and no loaf: the title names no milk (owner, 2026-10-20). ${CARDS}`,
  },
  {
    id: 'milk',
    say: "{start}Start with the milk. {/} {peter}Peter writes, {newborn}“As newborn babes, desire the sincere milk of the word, that ye may {*}grow thereby.” {/} {sincere}Sincere here means pure, {mixed}with {*}nothing mixed in. {/} {word}So the milk is God's word, plain and unmixed. {/} {good}And milk is {*}good. {/} {need}A baby cannot do without it. {/} {began}Every one of us began there, {shame}and there is no shame in a cup of milk.",
    cite: [
      '1 Peter 2:2',
      'E. J. Waggoner, The Present Truth, August 17, 1893, 315',
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
    ],
    picture: `IDEA: the parchment page, matched from the cup on the courtyard table in \`cold\`. A grey figure holds a small cup; on \`newborn\` a book opens beside it and a ribbon of white pours from its pages into the cup (\`word\`). On \`mixed\` a dropper of dark ink hovers over the cup and is waved away. On \`need\` the cup passes to a row of small figures of every height, each drinking in turn; on \`shame\` the grey figure from \`cold\` takes a cup too and smiles. ${CARDS}`,
  },
  {
    id: 'stones',
    say: '{which}So which truths are the milk? {/} {lists}Hebrews lists them, {foundation}and calls them a {*}foundation. {/} {repent}Repentance from dead works. {/} {faith}Faith toward God. {/} {bapt}Baptisms. {/} {hands}The laying on of hands. {/} {resur}The resurrection of the dead. {/} {judg}And eternal judgment. {/} {six}Six stones. {/} {oracles}Hebrews calls them the first principles of the oracles of God. {/} {spoken}An oracle is a word God himself has spoken. {/} {begins}That is where this series {*}begins.',
    cite: ['Hebrews 6:1–2', 'Hebrews 5:12'],
    picture: `IDEA: the parchment. On \`foundation\` a level line is drawn and six paper stones drop onto it one per name, each carrying a small gold icon: a figure turning round (\`repent\`), an open hand (\`faith\`), a wave of water (\`bapt\`), two hands over a head (\`hands\`), an empty tomb (\`resur\`), a balance scale (\`judg\`). On \`six\` the camera pulls back: six stones, a foundation with nothing yet built on it. On \`oracles\` a gold speech-ribbon unrolls from the top of the page and settles under the stones as their bed. On \`begins\` a small grey figure steps onto the first stone. ${CARDS}`,
  },
  {
    id: 'bottle',
    say: "{but}But some of us never get past the {*}bottle. {/} {easy}We want it all made so easy we can swallow it without {*}chewing. {/} {think}And chewing is {*}thinking. {/} {strong}So we never grow strong. {/} {paul}Paul had a church like that, in Corinth. {/} {fed}“I have fed you with milk, and not with meat: for hitherto ye were not able to bear it.” {/} {slow}Why not? {/} Were they {*}slow? {/} {quarrel}No. {/} They were {*}quarrelling. {/} {more}Growing in God's word is never only knowing {*}more. {/} {like}It is growing more like {*}Christ.",
    cite: [
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
      '1 Corinthians 3:1–3',
      'Ellen G. White, Medical Ministry, 124',
    ],
    picture: `STORY: on \`easy\` a quick comic beat on the parchment: the grey grown man from \`cold\` lifts a plate and tips the whole meal into his mouth unchewed. On \`paul\` push through into a Corinthian house at dusk (the film's short valley), a room of grey figures in two knots, arguing, fingers pointing. Paul (grey, travel cloak, a face at a third of the frame) sits writing by a lamp; on \`fed\` close on his face as he writes, tired and fond. On \`quarrel\` the two knots turn their backs on each other. On \`like\` the lamp's light warms and one figure from each knot turns back and offers the other a hand. ${CARDS}`,
  },
  {
    id: 'teeth',
    say: '{milk}Feed a baby on milk, and she grows {teeth}{*}teeth. {/} {sign}And teeth are a sign {time}that it is time for solid {*}food. {/} {hebrews}Hebrews says strong meat belongs to those {use}who “by reason of use have their senses exercised to discern both good and evil.” {/} {practice}Use. {/} Practice. {/} {*}Chewing.',
    cite: ['E. J. Waggoner, The Medical Missionary, September 1904, 286', 'Hebrews 5:14'],
    picture: `IDEA: the parchment. A baby figure grins on \`teeth\` and shows one small white tooth (a light, warm moment). On \`sign\` a little paper signpost springs up beside it pointing right, toward a loaf. On \`use\` the grown grey figure sits at a small table and chews, thinking, a tiny lamp lit over his head; on \`practice\` a bowl of grain, a loaf and a plate come in, one per word. ${CARDS}`,
  },
  {
    id: 'rush',
    say: '{other}There is a mistake on the other side, too. {/} {skip}Some reach for the strong meat before they have learned the milk, {run}like a child who tries to run before he can {*}walk. {/} {peter}Peter warns of things in Scripture “hard to be understood, which they that are unlearned and unstable wrest.” {/} {twist}To wrest is to twist. {/} {own}The Bible explains its own words, {/} and we learn them one at a time. {/} {fill}Skip those first steps, and we fill its words with meanings of our own, {want}until it says {*}what we wanted. {/} {order}That is why it serves its truth in {*}order.',
    cite: [
      '2 Peter 3:16',
      'Ellen G. White, Education, 190',
      'Ellen G. White, The Great Controversy, 520',
      'Ellen G. White, The Bible Echo, August 26, 1895',
    ],
    picture: `IDEA: the parchment, the six stones from \`stones\` along the bottom. On \`skip\` a small grey figure hops over the stones without touching them and reaches for a heaped platter at the top of the page. On \`run\` a toddler figure sets off running, tips forward and sits down hard, unhurt, and gets up (a light moment). On \`peter\` a page of writing appears; on \`twist\` one line of it is wrung like a wet cloth, its letters bending. On \`own\` a small book opens beside the page, each word on the page linked to its entry in the book by a thin gold thread. On \`fill\` the figure who skipped writes over the empty entries in his own colour, and on \`want\` the page turns into a mirror and shows his face. On \`order\` the mirror clears to the page, and the figure steps back down onto the first stone. ${CARDS}`,
  },
  {
    id: 'math',
    say: '{leave}So do we leave the milk {*}behind? {/} {go}Hebrews does say, leaving the principles, let us go on. {/} {but}But leaving them never means throwing them {*}away. {//} {student}Think of a student of mathematics. {/} {adds}First he learns to add and subtract and multiply. {/} {stay}He must not stay there forever. {/} {never}But he never stops {*}using them. {/} {hardest}His hardest problems are those first steps, {*}combined. {/} {meat}So it is with meat. {/} {nothing}Solid food leaves out nothing that was in the milk. {/} {more}It has all of it, and {*}more.',
    cite: [
      'Hebrews 6:1',
      'E. J. Waggoner, The Present Truth, January 31, 1895, 65',
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
    ],
    picture: `IDEA: dawn begins to come into the parchment. A child-sized grey figure at a slate writes 1 + 1 on \`adds\`; the sums multiply across the slate. On \`stay\` the figure grows taller across three quick dissolves, the slate growing with it. On \`hardest\` one enormous sum fills the slate, and as the camera pushes in every term in it is one of the first small sums from \`adds\`, picked out in gold. On \`meat\` match cut: the slate's frame becomes the edge of a plate; on \`nothing\` the cup of milk from \`milk\` is set down on the plate beside the bread, not taken away; on \`more\` dishes fill in around it. ${CARDS}`,
  },
  {
    id: 'priest',
    say: '{what}So what is the meat? {/} {right}Hebrews serves it right after the milk. {/} {christ}It is Jesus, made “an high {*}priest for ever after the order of Melchisedec.” {//} {once}Not only what Christ did {*}once, {now}but what he is doing {*}now. {/} {other}The meat is never something other than {*}Christ. {/} {him}It is {*}more of him. {/} {light}Every deeper truth is read by one light, and that light streams from his {*}cross.',
    cite: [
      'Hebrews 5:10–11',
      'Hebrews 6:19–20',
      'Hebrews 8:1–2',
      'Ellen G. White, Gospel Workers, 315',
    ],
    picture: `IDEA, then STORY. The parchment: the six stones from \`stones\`; on \`right\` a gold path runs on from the last stone up the page. On \`christ\` push through into STORY: a tall woven veil glowing gold from behind, and a figure in a priest's white robe and breastplate (Christ) seen from behind as he passes in through it (never a face of the Father, never a throne in this film). On \`once\` a small cardboard hill with an empty cross at dawn appears in a round panel; on \`now\` the panel slides to sit beside the veil, both lit. On \`light\` pull back to IDEA: a small gold cross at the centre of the page, its light widening in rings across the six stones and up the path. ${CARDS}`,
  },
  {
    id: 'grain',
    say: '{how}So how does anyone grow? {/} {jesus}Jesus said the kingdom grows like {*}grain. {/} {sow}A man sows seed, {sleeps}and sleeps, and gets up, {knoweth}and it grows, he knows not {*}how. {/} {first}It comes up “first the blade, then the ear, after that the full corn in the ear.” {/} {watch}You cannot watch it happen. {/} {quiet}It is quiet, and it never {*}stops. {/} {blade}A blade is not a failed ear. {/} {stage}At every stage it can be {*}perfect, {still}and still it keeps {*}growing. {/} {isaiah}Isaiah says God teaches the same way, a line at a time, here a little, and there a little. {/} {bear}And Jesus gave them the word as much as they were able to {*}hear. {/} {simple}Simple truths, again and again, {bottom}and not one of them has a {*}bottom.',
    cite: [
      'Mark 4:26–28',
      'Ellen G. White, Education, 105–106',
      'Isaiah 28:9–10',
      'Mark 4:33',
      'E. J. Waggoner, The Present Truth, May 4, 1899, 277',
    ],
    picture: `STORY: a cardboard field on a hillside, peach morning, 3–5 planes (the far hills, the field, a low stone wall near). On \`sow\` a farmer (grey, a face at a third of the frame) scatters seed and walks off; quick sun arcs on \`sleeps\`/\`knoweth\` (day, night, day). On \`first\` a single blade tears up out of the soil, then the green ear, then the full gold ear, one per phrase, each a paper layer folding up. On \`blade\` the camera returns to the young blade alone, upright and bright green, whole for what it is. On \`quiet\` the camera holds low by the stalk while a snail crosses the wall: nothing seems to move, but the stalk is visibly taller at the end of the hold. On \`isaiah\` the field dissolves to the parchment: one line of gold writing drawn, then another under it; on \`bear\` the next line waits, unwritten, until the one above it has filled with light; on \`bottom\` the camera drops through one line of the writing as if it were a well, and finds more light below. ${CARDS}`,
  },
  {
    id: 'eat',
    say: '{nobody}And nobody can eat your food for you. {/} {jer}The prophet Jeremiah said, {found}“Thy words were found, and I did eat them; and thy word was unto me the {joy}joy and rejoicing of mine heart.” {//} {body}Your body lives on the food you eat yourself. {/} {soul}And your soul lives on the {*}word you take in yourself.',
    cite: ['Jeremiah 15:16', 'Ellen G. White, The Signs of the Times, June 25, 1902'],
    picture: `STORY: a small cardboard room in Jerusalem, warm lamplight; Jeremiah (grey, a scroll on his knees, a face at a third of the frame) reads, and on \`found\` his face lifts and softens; on \`joy\` he laughs out loud, alone. On \`body\` cut to the parchment: two grey figures at one table, one eating, the other only watching; the eater glows faintly from the chest (\`soul\`), the watcher does not; the watcher picks up a spoon. ${CARDS}`,
  },
  {
    id: 'path',
    say: '{path}Here is the path ahead. {/} {just}“The path of the just is as the shining light, that shineth more and more unto the {*}perfect day.” {//} {stones}First, the six stones of the foundation. {/} {then}Then the meat Hebrews was eager to serve: {priest}a priest in heaven, {sanct}a sanctuary, {cov}a covenant, {rest}and a rest. {/} {last}And last, the strongest meat, {come}the things to {*}come. {/} {one}And all of it is {*}Christ.',
    cite: ['Proverbs 4:18', 'Hebrews 6:1–2', 'Hebrews 8:1–2, 6', 'Hebrews 4:9', '2 Peter 1:19'],
    picture: `IDEA: the series map. The parchment widens into a long hill: the six stones at its foot (Tier One), the gold path climbing past a veil, a small tent sanctuary, two tablets in an ark and a resting figure under a tree (Tier Two), up to a city on the summit under a dawn sky (Tier Three). On \`just\` the dawn behind the summit brightens in three soft steps, more and more, never all at once. On \`one\` the gold cross's light from \`priest\` spreads until the whole hill lies inside it. ${CARDS}`,
  },
  {
    id: 'name',
    say: '{back}Back to the feast. {/} {sets}The grown man sets down his bottle. {/} {bad}Not because milk was {*}bad. {/} {table}But because the table was set for him all along, {cup}and the milk is on it {*}still. {/} {taste}“O taste and see that the LORD is good.” {/} {leaving}Going from milk to meat never leaves Christ {*}behind. {/} {into}It is growing up {//3} into {*}him.',
    cite: [
      'Psalm 34:8',
      'Ephesians 4:13–15',
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
    ],
    picture: `IDEA and STORY merged, the landing: the wedding courtyard from \`cold\` in the same layout and framing, now under the teal-to-yellow landing sky. The grey grown man stands where he stood; on \`sets\` he sets the baby's bottle down. On \`table\` the host's hand (the host is Christ, in the seamless linen coat and the walnut mantle, at the head of the table) gestures to the place set for him: bread from the field in \`grain\`, and on \`cup\` the cup of milk from \`milk\` beside the plate. On \`taste\` he tastes, close on his face, delight. On \`leaving\` the six stones show for a breath as the courtyard's paving under the table. On \`into\` he stands taller beside the host; the gold cross's light from \`priest\` warms the whole courtyard. The held pause comes after \`into\`. ${CARDS}`,
  },
  {
    id: 'thesis',
    say: '{grow}{*}“Grow in grace, and in the knowledge of our Lord and Saviour Jesus Christ.”',
    lead: 1,
    min: 30,
    cite: ['2 Peter 3:18'],
    picture: `STORY: after the held pause, the full-screen card, the film's last words: "Grow in grace, and in the knowledge of our Lord and Saviour Jesus Christ.", "Grow" large in gold, the answer to \`cold\`'s question (the draft's sky lettering, GROW IN GRACE, moved to the card: CRAFT rule 1); hard cut back to the courtyard. The music rises alone for about thirty seconds while the camera eases back and lifts over the courtyard, the grown man still at the host's side at the set table. Past the courtyard wall, the field from \`grain\` moves in the wind, full corn, and the hill of \`path\` rises beyond it. ${CARDS}`,
  },
  {
    id: 'end',
    min: 28,
    picture: `STORY: the credits over the landing's last pull back, the wedding courtyard from above under the landing sky, the field and the hill beyond its wall, nothing breathing. The film's name and its sources roll up a torn paper strip at the left for about 22 s; then the strip goes and the courtyard holds clear for the end screens. ${CARDS}`,
  },
]);

/** A beat of the film, by its id. */
export type BeatId = (typeof script)[number]['id'];
