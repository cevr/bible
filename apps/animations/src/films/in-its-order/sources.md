# In Its Order: sources

The film is The Path of the Just's opener, made for every Christian (CRAFT rule 2): it quotes only Scripture, and it never quotes or names Ellen G. White or the pioneers in speech. Their thought is said in the narrator’s own words, and every paraphrase stays inside its source’s words; the credits name them. Each entry names the narrator’s line that carries it, in straight quotes exactly as the script says it: Quoted (the KJV, read as it reads), Told (a Bible scene told in his words), Paraphrased (a thought in his words) or Shown, not said (a picture’s detail). The Bible’s or a source’s own words are in curly quotes.

The Ellen G. White and pioneer texts are records in `quotes.jsonl`, each printed fresh by `bible egw lookup` on 2026-10-20 and checked against the local corpus with `python3 .claude/skills/film/frame/verify-quotes.py apps/animations/src/films/in-its-order/quotes.jsonl` (12 records: 11 EXACT, 1 PAGENUM, 0 failing, 2026-10-20). The PAGENUM is Ed 105.3, whose corpus text carries the printed page number 106 inside “There can be 106 no life without growth”; the record drops it. The KJV, the only words the film quotes, was printed by `bible verse` on 2026-10-20; its supplied-word brackets are dropped for speech. Quoted Scripture: 11 passages, 161 of 884 spoken words (18.2 %).

The film’s draft, kept by the owner (ask a5d8568415d), is `apps/animations/series/theology/scripts/01-in-its-order.md`; the series’ searches are in `apps/animations/series/theology/sources.md`, section 01. The series’ thesis is one Waggoner devotional page, MEDM September 1904, 286.4–286.8 (milk good and necessary for babes; teeth as the sign for solid food; the first principles used combined; “gets it all and more”), and the script stays inside those words.

## `cold`

- **Hebrews 5:12** (KJV). Quoted: "They “are become such as have need of milk, and not of strong meat.”" Paraphrased: "Now picture a letter to believers that says nearly the same."

  > For when for the time ye ought to be teachers, ye have need that one teach you again which be the first principles of the oracles of God; and are become such as have need of milk, and not of strong meat.

## `milk`

- **1 Peter 2:2** (KJV). Quoted: "“As newborn babes, desire the sincere milk of the word, that ye may grow thereby.”"

  > As newborn babes, desire the sincere milk of the word, that ye may grow thereby:

- **PTUK August 17, 1893, page 315.16** · E. J. Waggoner, _The Present Truth_ (1893). Paraphrased: "Sincere here means pure, with nothing mixed in. So the milk is God's word, plain and unmixed."

  > The Lord says, “As newborn babes, desire the sincere [pure, unadulterated] milk of the word, that ye may grow thereby.” We see, therefore, that the heavenly milk is the pure, unmixed word of God.

- **MEDM September 1904, page 286.4** · E. J. Waggoner, _The Medical Missionary_ (1904). Paraphrased: "And milk is good. A baby cannot do without it."

  > Milk is good and absolutely necessary for babes

## `stones`

- **Hebrews 6:1–2** (KJV). Told: the list, said as a list and not as a quotation: "Repentance from dead works. Faith toward God. Baptisms. The laying on of hands. The resurrection of the dead. And eternal judgment." Paraphrased: "Hebrews lists them, and calls them a foundation."

  > Therefore leaving the principles of the doctrine of Christ, let us go on unto perfection; not laying again the foundation of repentance from dead works, and of faith toward God, Of the doctrine of baptisms, and of laying on of hands, and of resurrection of the dead, and of eternal judgment.

- **Hebrews 5:12** (KJV). Paraphrased: "Hebrews calls them the first principles of the oracles of God."

  > ye have need that one teach you again which be the first principles of the oracles of God

## `bottle`

- **MEDM September 1904, page 286.4** · E. J. Waggoner, _The Medical Missionary_ (1904). Paraphrased: "We want it all made so easy we can swallow it without chewing. And chewing is thinking. So we never grow strong."

  > They want everything made so easy for them that they can swallow it without chewing, that is, without thought. For that reason they never grow strong.

- **1 Corinthians 3:1–3** (KJV). Quoted: "“I have fed you with milk, and not with meat: for hitherto ye were not able to bear it.”" Told: "Paul had a church like that, in Corinth." and "They were quarrelling." (3:3, “envying, and strife, and divisions”).

  > And I, brethren, could not speak unto you as unto spiritual, but as unto carnal, even as unto babes in Christ. I have fed you with milk, and not with meat: for hitherto ye were not able to bear it, neither yet now are ye able. For ye are yet carnal: for whereas there is among you envying, and strife, and divisions, are ye not carnal, and walk as men?

- **MM 124.2** · Ellen G. White, _Medical Ministry_ (1932). Paraphrased: "Growing in God's word is never only knowing more. It is growing more like Christ."

  > “As newborn babes, desire the sincere milk of the word, that ye may grow thereby,” in perception, in likeness to the character of Christ. Development of character, growth in knowledge and wisdom, will be the sure result of feeding on the word.

## `teeth`

- **MEDM September 1904, page 286.4** · E. J. Waggoner, _The Medical Missionary_ (1904). Paraphrased: "Feed a baby on milk, and she grows teeth. And teeth are a sign that it is time for solid food."

  > By feeding on milk, babes develop teeth as they grow; and the appearance of teeth is an indication that now they must take solid food, instead of milk.

- **Hebrews 5:14** (KJV). Quoted: "who “by reason of use have their senses exercised to discern both good and evil.”" Paraphrased: "Hebrews says strong meat belongs to those".

  > But strong meat belongeth to them that are of full age, even those who by reason of use have their senses exercised to discern both good and evil.

## `rush`

- **2 Peter 3:16** (KJV). Quoted: "Peter warns of things in Scripture “hard to be understood, which they that are unlearned and unstable wrest.”"

  > As also in all his epistles, speaking in them of these things; in which are some things hard to be understood, which they that are unlearned and unstable wrest, as they do also the other scriptures, unto their own destruction.

- **Ed 190.2** · Ellen G. White, _Education_ (1903). Paraphrased: "The Bible explains its own words".

  > The Bible is its own expositor. Scripture is to be compared with scripture.

- **GC 520.3** · Ellen G. White, _The Great Controversy_ (1911). Paraphrased: "To wrest is to twist." and "until it says what we wanted."

  > the prevailing custom of wresting the Scriptures to support a favorite theory. Instead of carefully studying God’s word with humility of heart to obtain a knowledge of His will, many seek only to discover something odd or original.

- **BEcho August 26, 1895, par. 7** · Ellen G. White, _The Bible Echo_ (1895). Paraphrased: "Skip those first steps, and we fill its words with meanings of our own, until it says what we wanted."

  > They interpret the Scriptures to suit themselves

## `math`

- **Hebrews 6:1** (KJV). Paraphrased: "Hebrews does say, leaving the principles, let us go on."

  > Therefore leaving the principles of the doctrine of Christ, let us go on unto perfection

- **PTUK January 31, 1895, page 65.4** · E. J. Waggoner, _The Present Truth_ (1895). Paraphrased: "But leaving them never means throwing them away." and "Think of a student of mathematics. … But he never stops using them."

  > Leaving the principles does not mean repudiating them, but applying them in the higher branches. … and no matter how great a mathematician he becomes, his success will depend wholly on the use of those rudiments.

- **MEDM September 1904, page 286.6** · E. J. Waggoner, _The Medical Missionary_ (1904). Paraphrased: "His hardest problems are those first steps, combined." and "Solid food leaves out nothing that was in the milk. It has all of it, and more."

  > The most profound problems consist only of simple principles in various combinations. So as we leave the first principles of the doctrine of Christ, and go on unto perfection, we leave them only in the sense that we do not use them detached, but in combination. The man who eats hard food, instead of milk, does not reject any element that is in milk, but gets it all and more.

## `priest`

- **Hebrews 5:10–11** (KJV). Paraphrased: "Hebrews serves it right after the milk." (5:10–11 runs straight into the milk of 5:12).

  > Called of God an high priest after the order of Melchisedec. Of whom we have many things to say, and hard to be uttered, seeing ye are dull of hearing.

- **Hebrews 6:19–20** (KJV). Quoted: "It is Jesus, made “an high priest for ever after the order of Melchisedec.”" Shown, not said: Christ passing in through the veil.

  > Which hope we have as an anchor of the soul, both sure and stedfast, and which entereth into that within the veil; Whither the forerunner is for us entered, even Jesus, made an high priest for ever after the order of Melchisedec.

- **Hebrews 8:1–2** (KJV). Paraphrased: "Not only what Christ did once, but what he is doing now." The film does not say where He ministers when; that belongs to Tier Two.

  > Now of the things which we have spoken this is the sum: We have such an high priest, who is set on the right hand of the throne of the Majesty in the heavens; A minister of the sanctuary, and of the true tabernacle, which the Lord pitched, and not man.

- **GW 315.2** · Ellen G. White, _Gospel Workers_ (1915). Paraphrased: "The meat is never something other than Christ." and "Every deeper truth is read by one light, and that light streams from his cross."

  > The sacrifice of Christ as an atonement for sin is the great truth around which all other truths cluster. In order to be rightly understood and appreciated, every truth in the word of God, from Genesis to Revelation, must be studied in the light that streams from the cross of Calvary.

## `grain`

- **Mark 4:26–28** (KJV). Told: "Jesus said the kingdom grows like grain. A man sows seed, and sleeps, and gets up, and it grows, he knows not how." Quoted: "It comes up “first the blade, then the ear, after that the full corn in the ear.”"

  > And he said, So is the kingdom of God, as if a man should cast seed into the ground; And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how. For the earth bringeth forth fruit of herself; first the blade, then the ear, after that the full corn in the ear.

- **Ed 105.3** · Ellen G. White, _Education_ (1903). Paraphrased: "You cannot watch it happen. It is quiet, and it never stops. A blade is not a failed ear. At every stage it can be perfect, and still it keeps growing."

  > There can be no life without growth. The plant must either grow or die. As its growth is silent and imperceptible, but continuous, so is the growth of character. At every stage of development our life may be perfect; yet if God’s purpose for us is fulfilled, there will be constant advancement.

- **Isaiah 28:9–10** (KJV). Paraphrased: "Isaiah says God teaches the same way, a line at a time, here a little, and there a little."

  > Whom shall he teach knowledge? and whom shall he make to understand doctrine? them that are weaned from the milk, and drawn from the breasts. For precept must be upon precept, precept upon precept; line upon line, line upon line; here a little, and there a little:

- **Mark 4:33** (KJV). Paraphrased: "And Jesus gave them the word as much as they were able to hear."

  > And with many such parables spake he the word unto them, as they were able to hear it.

- **PTUK May 4, 1899, page 277.2** · E. J. Waggoner, _The Present Truth_ (1899). Paraphrased: "Simple truths, again and again, and not one of them has a bottom."

  > children, however, learn by accepting simple statements of fact. … Constant repetition of simple truths which, although simple, contain infinity, is the way to acquire “the wisdom which is from above.”

## `eat`

- **Jeremiah 15:16** (KJV). Quoted: "“Thy words were found, and I did eat them; and thy word was unto me the joy and rejoicing of mine heart.”"

  > Thy words were found, and I did eat them; and thy word was unto me the joy and rejoicing of mine heart: for I am called by thy name, O LORD God of hosts.

- **ST June 25, 1902, par. 17** · Ellen G. White, _The Signs of the Times_ (1902). Paraphrased: "And nobody can eat your food for you." and "Your body lives on the food you eat yourself. And your soul lives on the word you take in yourself."

  > As our physical life is sustained by food, so our spiritual life is sustained by the Word of God. And every soul is to receive life from God’s Word for himself. As we must eat for ourselves in order to receive nourishment, so we must receive the Word for ourselves.

## `path`

- **Proverbs 4:18** (KJV). Quoted, its opening “But” dropped: "“The path of the just is as the shining light, that shineth more and more unto the perfect day.”" The series’ name and verse.

  > But the path of the just is as the shining light, that shineth more and more unto the perfect day.

- **Hebrews 6:1–2** (KJV). Paraphrased: "First, the six stones of the foundation." (as in `stones`).
- **Hebrews 8:1–2, 6** (KJV). Paraphrased: "a priest in heaven, a sanctuary, a covenant".

  > We have such an high priest, who is set on the right hand of the throne of the Majesty in the heavens; A minister of the sanctuary, and of the true tabernacle … But now hath he obtained a more excellent ministry, by how much also he is the mediator of a better covenant, which was established upon better promises.

- **Hebrews 4:9** (KJV). Paraphrased: "and a rest."

  > There remaineth therefore a rest to the people of God.

- **2 Peter 1:19** (KJV). Paraphrased: "And last, the strongest meat, the things to come."

  > We have also a more sure word of prophecy; whereunto ye do well that ye take heed, as unto a light that shineth in a dark place, until the day dawn, and the day star arise in your hearts:

## `name`

- **Psalm 34:8** (KJV). Quoted: "“O taste and see that the LORD is good.”"

  > O taste and see that the LORD is good: blessed is the man that trusteth in him.

- **Ephesians 4:13–15** (KJV). Paraphrased: "It is growing up into him."

  > Till we all come in the unity of the faith, and of the knowledge of the Son of God, unto a perfect man, unto the measure of the stature of the fulness of Christ: That we henceforth be no more children … But speaking the truth in love, may grow up into him in all things, which is the head, even Christ:

- **MEDM September 1904, page 286.6** · E. J. Waggoner, _The Medical Missionary_ (1904). Paraphrased: "and the milk is on it still." (as in `math`: nothing in the milk is left behind). Shown, not said: the cup of milk beside the plate on the set table.

## `thesis`

- **2 Peter 3:18** (KJV). Quoted, its opening “But” dropped: "“Grow in grace, and in the knowledge of our Lord and Saviour Jesus Christ.”", on its full-screen card with “Grow” in gold.

  > But grow in grace, and in the knowledge of our Lord and Saviour Jesus Christ. To him be glory both now and for ever. Amen.
