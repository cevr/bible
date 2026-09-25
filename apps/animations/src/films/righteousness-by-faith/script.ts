// The screenplay. Words, their order, their sources, and what the picture is
// doing. The film plays these beats in this order; each id needs a drawing in
// scenes/. `{mark}` cues sit before the word the picture should hit.
//
// Every quotation is verbatim from script/sources.md (checked against the
// local corpus). KJV supplied-word brackets are dropped for speech.

export interface Beat {
  readonly id: string;
  readonly say?: string;
  /** On-screen citations, in the order they are spoken. */
  readonly cite?: ReadonlyArray<string>;
  /** What the picture does — the brief for the scene's drawing. */
  readonly picture: string;
}

export const script: ReadonlyArray<Beat> = [
  {
    id: 'question',
    say: "There's a question in the book of Job that every one of us eventually asks. {q}“How should man be just with God?” {after}How can someone who has {wrong}done wrong be {right}made right with the One who is perfectly right?",
    cite: ['Job 9:2'],
    picture:
      "Cold open. A tiny cut-paper person alone on a vast cream page. The question writes itself above them in handwriting, huge. On 'made right' a thin gold line tries to connect the person to a far warm glow at top right — and falls short.",
  },
  {
    id: 'title',
    picture:
      "Title card. 'Righteousness by Faith' pasted in, letter by letter, over a torn gold sun. Small caption: 'A. T. Jones · E. J. Waggoner · Ellen G. White'.",
  },
  {
    id: 'measure',
    say: "Start with the word itself. {word}Righteousness means right-doing. {whose}But right by whose measure? {psalm}“All thy commandments are righteousness,” says the psalmist. {char}The law is God's own character, written out in words. {circle}E. J. Waggoner put it like this: “the decalogue is a circle having a circumference as great as the universe.”",
    cite: ['Psalm 119:172', 'E. J. Waggoner, Christ and His Righteousness, 50'],
    picture:
      'Word-study card: RIGHTEOUSNESS = right-doing. Two stone tablets tear in, then their outline widens into a circle that grows past the frame edge, stars and planets inside it.',
  },
  {
    id: 'rags',
    say: "And that's the problem. Measured by that circle, {short}we all come short. So we do what Adam and Eve did: we {sew}sew together fig leaves. {try}We try harder. {promise}We make promises. {isaiah}But Isaiah says {rags}“all our righteousnesses are as filthy rags.” {why}Waggoner saw why: {math}“multiplied evil cannot make one good deed.”",
    cite: ['Romans 3:23', 'Isaiah 64:6', 'E. J. Waggoner, Christ and His Righteousness, 55'],
    picture:
      'The person stitches teal paper scraps into a garment — each patch looks worse. Then a handwritten sum: teal scrap × teal scrap × teal scrap = still teal. Never gold.',
  },
  {
    id: 'witness',
    say: "The law can't fix this. {standard}It's a perfect standard, which is exactly why it will not {call}call a guilty person innocent. {must}As Waggoner wrote, “We must have the righteousness of the law or we cannot enter heaven, and yet {none}the law has no righteousness for one of us.”",
    cite: ['E. J. Waggoner, Christ and His Righteousness, 55'],
    picture:
      'The tablets as a mirror: the person looks in and sees every stain, sharp and true. The mirror can show the stain but it cannot wash it — the reflection stays teal.',
  },
  {
    id: 'void',
    say: 'So where does righteousness come from? {back}Go back to the beginning. {dark}Darkness. Emptiness. Nothing at all. And then God {spoke}spoke. {spake}“He spake, and it was done.” {atj}A. T. Jones noticed something simple here: {jones}“He spoke the word only, and it was so. {produced}The word spoken, itself produced the thing.”',
    cite: ['Psalm 33:9', 'A. T. Jones, Lessons on Faith, 16'],
    picture:
      'Ink wipe to a deep night page. Nothing. A single handwritten word glides in — LIGHT — and bursts into a torn gold sun; land and water tear in behind it.',
  },
  {
    id: 'centurion',
    say: "A Roman centurion understood this. {servant}His servant was dying. {jesus}When Jesus offered to come, he said, {only}“Speak the word only, and my servant shall be healed.” {house}He didn't need Jesus at his house. {alone}The word alone would do it. {healed}And it did. {story}From this story Jones drew one of the clearest definitions of faith ever written: {faith}“Faith is the expecting the word of God to do what it says and the depending upon that word to do what it says.”",
    cite: ['Matthew 8:8', 'A. T. Jones, Lessons on Faith, 15'],
    picture:
      "Split page: the centurion (red crest) on the left before Jesus; a sick servant in bed on the right, far away. A ribbon of handwriting — 'be healed' — flies across the fold like a paper plane; the servant sits up, colour returning.",
  },
  {
    id: 'justified',
    say: "Here's the heart of it. The Bible says we are {justified}justified: {declared}declared righteous. {fiction}And when God declares something, it is no legal fiction. {as}As Waggoner wrote, {subst}“His word is substantial; it carries with it the thing which it names.” {voice}The same voice that said, {light}“Let there be light,” {speaks}speaks over a human life. {spoken}Jones again: “Christ has spoken the word only, and in the {void}darkened void of man's life there is {right}righteousness to everyone who will receive it.”",
    cite: [
      'Romans 3:24',
      'E. J. Waggoner, The Glad Tidings, 14',
      'A. T. Jones, Lessons on Faith, 23',
    ],
    picture:
      "Word card: JUSTIFY — Greek δικαιόω — 'declared righteous'. Then a close-up of the person's chest: a dark void, like the night page. The word arrives and a gold sun blooms inside.",
  },
  {
    id: 'exchange',
    say: 'But how can God declare the guilty righteous and still be just? {came}Because Christ came all the way down to us, {flesh}“in the likeness of sinful flesh.” {took}He took our place, {gave}and gave us his. {line}Ellen White said it in one line: {treated}“Christ was treated as we deserve, that we might be treated as He deserves.”',
    cite: ['Romans 8:3', 'Ellen G. White, The Desire of Ages, 25'],
    picture:
      "A figure in white and gold steps down a long ladder of paper strips onto our page. The two figures face each other; the garments swap — rags onto him, robe onto us. A cross shadow falls across the page on 'treated as we deserve'.",
  },
  {
    id: 'robe',
    say: 'The prophet Zechariah saw it in a vision. {priest}The high priest stands in {filthy}filthy garments, and God says, {take}“Take away the filthy garments from him,” {clothe}and, “I will clothe thee with change of raiment.” {loom}Ellen White wrote that this robe, “woven in the loom of heaven, has in it not one thread of human devising.” {cloak}And it is no cover-up. {does}Christ, said Waggoner, “does not furnish a cloak for sin but {away}takes the sin away.”',
    cite: [
      'Zechariah 3:4',
      "Ellen G. White, Christ's Object Lessons, 311",
      'E. J. Waggoner, Christ and His Righteousness, 65',
    ],
    picture:
      'The rags lift off and blow away like torn paper. Gold threads cross on a loom and weave a white robe, which settles on the person. Then a close look: under the robe the teal stain itself dissolves — not hidden, gone.',
  },
  {
    id: 'hand',
    say: "So what is faith? It isn't the thing that saves us. {saviour}“Faith is not our Saviour,” Ellen White wrote. {earns}“It earns nothing. {hand}It is the hand by which we lay hold upon Christ.” {open}An empty hand, held open to {receive}receive a {gift}gift.",
    cite: ['Ellen G. White, The Desire of Ages, 175'],
    picture:
      'A tall stack of coins, medals and good deeds is offered up — and slides off. A plain open hand, palm up. Something gold is laid in it.',
  },
  {
    id: 'serpent',
    say: "Remember Israel in the wilderness? {bitten}Bitten by serpents, dying. {moses}God told Moses to lift up a serpent of brass on a pole, and {look}whoever looked, lived. Jesus said, {lifted}“As Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up.” {harder}It's tempting to make it harder than that. {climb}But Ellen White's counsel is almost playful: {dnc}“Do not climb the pole, but only look. {present}I present Christ to you. Look and live.”",
    cite: ['Numbers 21:8', 'John 3:14', 'Ellen G. White, Manuscript Releases, vol. 13, 150'],
    picture:
      'Desert camp, dusk. Snakes of torn red paper. The bronze serpent rises on its pole. One figure starts to climb the pole — comic, straining — and stops. They turn and simply look; gold floods back into them.',
  },
  {
    id: 'within',
    say: "And the word that declares us righteous doesn't stop there. {heart}It moves in. {changes}“Christ changes the heart,” Ellen White wrote. “He abides in your heart by faith.” {write}God promised to write His law in our hearts. {title}Imputed, then imparted. {first}“The first is our title to heaven, the second is our fitness for heaven.” {adopt}Or as Waggoner put it: {god}“God does not adopt us as His children because we are good, but in order that He may make us good.”",
    cite: [
      'Ellen G. White, Steps to Christ, 62',
      'Hebrews 8:10',
      'Ellen G. White, Messages to Young People, 35',
      'E. J. Waggoner, Christ and His Righteousness, 69',
    ],
    picture:
      "The circle of the law from 'measure' returns, shrinks, and settles into the person's heart as a warm gold ring. Two labelled cards: TITLE (a ticket) and FITNESS (a growing plant). The person walks; flowers spring up in their footprints.",
  },
  {
    id: '1888',
    say: "In {year}1888, two young editors, {names}Alonzo Jones and Ellet Waggoner, brought this message to a church {lost}where many had lost sight of Jesus. Ellen White called it {precious}“a most precious message.” {asked}And when she was asked whether it was the third angel's message of Revelation 14, she answered: {verity}“It is the third angel's message in verity.”",
    cite: [
      'Ellen G. White, Testimonies to Ministers, 91',
      'Ellen G. White, Review and Herald, April 1, 1890',
    ],
    picture:
      "Collage of 1888: a torn newspaper masthead 'Minneapolis 1888', two small portrait silhouettes with name tags. A stamp: A MOST PRECIOUS MESSAGE. An angel with a trumpet flies across a wide sky.",
  },
  {
    id: 'name',
    say: '{so}So, how should man be just with God? {not}Not by weaving a better garment. {receive}By receiving one. {taking}By taking God at His word. {jer}The prophet Jeremiah gave the coming King a name that says it all: {name}“The Lord our righteousness.”',
    cite: ['Jeremiah 23:6'],
    picture:
      'Back to the opening page — the same small person, now in white. The question from the start is still there; underneath it, the answer writes itself: THE LORD OUR RIGHTEOUSNESS. The gold line from the first scene now reaches all the way.',
  },
  {
    id: 'end',
    picture: "End card on paper: 'Righteousness by Faith' and the source list.",
  },
];
