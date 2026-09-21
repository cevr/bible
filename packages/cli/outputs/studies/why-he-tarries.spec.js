// Handbook spec: WHY HE TARRIES — the country-living message, the third angel in verity,
// and the reason the Lord did not return in the 1880s-1890s as EGW said He might have.
//
// THESIS (the author's): the country-living message is the message that was most
// decisively ignored. It is the natural, embodied response to the third angel's message —
// and righteousness by faith, which EGW calls "the third angel's message in verity." God's
// people rejected the country-living message and everything it embodied — all the sacrifices
// it entailed, all the inconveniences it demanded — preferring to be rich in goods and in
// need of nothing. It is tied to the days of Noah: the marked contrast between those who
// "began to call upon the name of the LORD" and those who did not — eating and drinking,
// buying and selling, building and planting, with no separation. It points to Lot, and to
// why we must "Remember Lot's wife." Following Miller's rules; handbook format.
//
// Run: Workflow(scriptPath: handbook-factory.workflow.js, args: { specPath: this file })

export default {
  title: 'Why He Tarries — Country Living and the Third Angel in Verity',
  topic: 'Why He Tarries — Country Living and the Third Angel in Verity',
  createdAt: '2026-06-26T12:00:00Z',

  // Bible-PRIMARY (Miller's Rule): every figure — the marked contrast, the city, the field,
  // the separation, Lot's wife, the days of Noah, the Laodicean self-sufficiency — defined
  // FIRST from Scripture. EGW is here a LARGER but still SECONDARY cloud than a pure
  // bibleOnly study, because the historical CLAIM of the study (that the Lord delayed, and
  // why) is a claim Scripture alone cannot date — it rests on the prophetic testimony. So:
  // bibleOnly=false, but the discipline holds: Scripture carries every DOCTRINE and every
  // SYMBOL; EGW carries the dated historical burden (the delay, the rejected message) and
  // confirms after the text. Verify EVERY refcode; never let a symbol rest on EGW alone.
  bibleOnly: false,
  sabbathSchool: true,

  thesis:
    'Ellen White wrote plainly that the Lord might already have come — that "had the church of Christ done her appointed work as the Lord ordained, the whole world would before this have been warned, and the Lord Jesus would have come" (_DA 633.3_) — and that the delay is ours to own, not God\'s: "We may have to remain here in this world because of insubordination many more years, as did the children of Israel" (_Ev 696.3_). The question this study presses is: which message, decisively ignored, held back the King? The answer offered here is the country-living message — not as a mere health or real-estate counsel, but as the natural, embodied response to the third angel\'s message, and therefore to righteousness by faith, which Ellen White calls "the third angel\'s message in verity." To get out of the cities, to make homes in the country, to come out from the marked stream of buying and selling and building and planting, demanded sacrifice and inconvenience; and God\'s people, like Laodicea, would rather be "rich, and increased with goods, and have need of nothing." It is the old line of Genesis: in the days of Noah men "did eat, they drank, they married wives... and knew not until the flood came," while a remnant "began to call upon the name of the LORD" and built an ark of separation; in the days of Lot the same eating and drinking and buying and selling ran on "until the day that Lot went out of Sodom" — which is why the Lord nailed one warning to the end of the age: "Remember Lot\'s wife." The marked contrast is the whole matter: those who separate unto God and bear the seal, and those who keep the city and receive the mark. He tarries because His people loved the city.',
  method:
    'After Haskell\'s Bible Handbook: ref → gloss, scannable; every symbol and doctrine defined FIRST from Scripture (Miller\'s Rule — the Bible defines its own figures). The argument is built from the text — Genesis 4-7 (the two seeds, the calling on the Name, the ark), Genesis 13-19 (Lot, Sodom, the pillar of salt), Luke 17 (the days of Noah and of Lot, "Remember Lot\'s wife"), Revelation 3 (Laodicea), Revelation 18 ("Come out of her, my people"), 2 Corinthians 6 ("come out from among them, and be ye separate"), and the seal vs. the mark of Revelation 7, 13, 14. Ellen White is the SECONDARY but indispensable witness who supplies the dated historical claim Scripture cannot — that the advent was delayed, and which message was refused — and who names the country-living message and identifies righteousness by faith as "the third angel\'s message in verity." Quote every refcode verbatim; verify with `bible egw "REF"` (the Country Living [CL], Adventist Home [AH], Testimonies [#T], Great Controversy [GC], Selected Messages [#SM], and Letters & Manuscripts corpus); never invent one, and never let a doctrine or symbol rest on the testimony where Scripture must carry it.',

  outPath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-26-why-he-tarries-country-living-and-the-third-angel-in-verity.md',
  sectionsDir:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/why-he-tarries/sections',
  templatePath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-17-righteousness-by-faith-a-bible-handbook-study.md',

  sources:
    'PRIMARY EGW for the country-living message: Country Living (CL — the whole tract; CL 9-32 the warnings to leave the cities, CL 21 "the time is near when the large cities will be visited," CL 5 "again and again the Lord has instructed our people to leave the cities"). Adventist Home (AH 131-145 "Country Versus City Living"; AH 170.3 "A Test for God\'s People... making homes for the homeless"). Counsels on Health (CH 268.1 "“Out of the cities,” is my message"). THE DELAY: Great Controversy (GC 458 "Had the church performed her appointed work... the Lord Jesus would have come"; the parable of the tarrying); Evangelism (Ev 696 / and the manuscript line "We may have to remain here in this world... because of insubordination many more years"); Testimonies vol. 8 (8T 115-116 the parallel to ancient Israel’s wandering — "long years" not necessary); Selected Messages and the 1888 materials for righteousness by faith as "the third angel\'s message in verity" (the 1888 statement; TM 91-92; RH April 1, 1890; 1SM 234-235, 363). THE LAODICEAN refusal: Rev 3:14-22 with 3T / Testimonies on the Laodicean message. Verify every code; CL and AH are compilations, so confirm the source line and that the paragraph contains the quoted words. Bible spine is the priority everywhere — Genesis, Luke 17, 2 Cor 6, Rev 3, 7, 13, 14, 18 carry the doctrine; EGW supplies the dated historical claim and the naming of the message.',

  sections: [
    // ============================================================
    // Part I — THE TARRYING: that He might have come, and did not
    // ============================================================
    {
      key: '01-the-tarrying',
      part: 'I — The Tarrying',
      title: 'He Might Have Come — the Delay Was Ours',
      scope:
        'Establish the fact the whole study rests on: the Lord might already have returned, and the delay lies with His people, not with God. Scripture sets the frame — the kingdom "should have appeared immediately" was held back (Luke 19:11; the wicked servant who says "My lord delayeth his coming," Matt 24:48), the Lord is "not slack concerning his promise... but is longsuffering... not willing that any should perish" (2 Pet 3:9), and the day may be "hasted" or held by the readiness of His people ("hasting unto the coming," 2 Pet 3:12). The promise was conditional on a finished work ("this gospel of the kingdom shall be preached in all the world... and then shall the end come," Matt 24:14). Then bring the dated testimony Scripture cannot supply: Ellen White’s plain statements that the advent was delayed by the unfaithfulness of the church — GC 458 "Had the church performed her appointed work as the Lord ordained, the whole world would have been warned ere this, and the Lord Jesus would have come"; the parallel to ancient Israel whose "long years" of wandering "might have been spared" (8T 115-116; the 40 years for an 11-day journey, Deut 1:2; Num 14:33-34). Define the tarrying and the delay from Scripture, with the testimony as the dated witness.',
      terms: [
        'My lord delayeth his coming',
        'the kingdom of God should immediately appear',
        'the Lord is not slack concerning his promise',
        'hasting unto the coming of the day of God',
        'this gospel of the kingdom shall be preached in all the world',
        'after the way of the mountain of Seir unto Kadeshbarnea',
      ],
      symbols: [
        'the tarrying (= the prolonging of the time before the advent, charged not to God but to His people’s unreadiness; Matt 24:48; 25:5; 2 Pet 3:9,12)',
        'the delay (= the avoidable lengthening of probation, the "long years" that might have been spared, typified by Israel’s wandering; Num 14:33-34; Deut 1:2; 8T 115)',
      ],
    },
    {
      key: '02-third-angel-in-verity',
      part: 'I — The Tarrying',
      title: 'The Third Angel in Verity — Righteousness by Faith',
      scope:
        'Name the message that was to ripen the harvest and was refused. The third angel’s message (Rev 14:9-12) ends in a people who "keep the commandments of God, and the faith of Jesus" — law AND faith fused, which is righteousness by faith. Build it from Scripture: the just shall live by faith (Hab 2:4; Rom 1:17), Christ "the LORD our righteousness" (Jer 23:6), righteousness "without the law... by faith of Jesus Christ" yet establishing the law (Rom 3:21-31), the seal of the living God set on those who are sealed in their foreheads with the Father’s name/character (Rev 7:2-3; 14:1). Then the testimony that names it: Ellen White calls the message of righteousness by faith "the third angel’s message in verity" (1888 statement; RH April 1, 1890; 1SM 234-235, 363; TM 91-92) — the very message largely rejected in and after 1888. Establish that righteousness by faith is not a doctrine alongside the third angel but its life and substance — and that to refuse it, or to keep its form while refusing its fruit, is to hold back the harvest. This sets up that the country-living message is the embodied OBEDIENCE of this faith.',
      terms: [
        'here are they that keep the commandments of God, and the faith of Jesus',
        'the just shall live by his faith',
        'THE LORD OUR RIGHTEOUSNESS',
        'the righteousness of God without the law is manifested',
        'do we then make void the law through faith? God forbid: yea, we establish the law',
        'the seal of the living God',
      ],
      symbols: [
        'the third angel’s message (= the final warning of Rev 14:9-12, consummated in commandment-keeping faith; Rev 14:9-12)',
        'righteousness by faith (= Christ’s righteousness received by faith and working obedience, "the third angel’s message in verity"; Rom 1:17; 3:21-31; 1SM 234)',
        'the seal (= the settling into the truth and the Father’s character, marking the faithful; Rev 7:2-3; 14:1; Eph 4:30)',
      ],
    },

    // ============================================================
    // Part II — THE MESSAGE IGNORED: country living as obedience
    // ============================================================
    {
      key: '03-out-of-the-cities',
      part: 'II — The Message Ignored',
      title: 'Out of the Cities — the Message Refused',
      scope:
        'The country-living message itself, and that it was decisively ignored. Scripture lays the pattern of separation from the corrupt city unto God: "Get thee out of thy country... unto a land that I will shew thee" (Gen 12:1); "Come out from among them, and be ye separate, saith the Lord, and touch not the unclean thing" (2 Cor 6:17); "Come out of her, my people, that ye be not partakers of her sins" (Rev 18:4); the city of confusion vs. the quiet habitation (Isa 32:18; 48:20 "Go ye forth of Babylon"). The garden, not the city, was God’s first home for man (Gen 2:8,15); the first city was Cain’s (Gen 4:17). Then the testimony that gave the message and recorded its rejection: "“Out of the cities” is my message" (CH 268.1); "Again and again the Lord has instructed that our people are to take their families away from the cities" (AH 141.4; CL 5); "The time is near when the large cities will be... destroyed" (CL 21); and crucially "A Test for God’s People... making homes for the homeless... that the country was the place to which they should withdraw" (AH 170.3) — a TEST, given and refused. Establish that the call was clear, repeated, urgent, and largely unheeded. Define the city, the country, and the call to come out, from Scripture.',
      terms: [
        'Get thee out of thy country',
        'Come out from among them, and be ye separate',
        'Come out of her, my people',
        'Go ye forth of Babylon',
        'the LORD God planted a garden eastward in Eden',
        'he builded a city',
      ],
      symbols: [
        'the city (= the world’s gathered confusion and self-trust, from Cain’s city to Babylon, the place of the mark; Gen 4:17; Rev 18:2-4)',
        'the country / the field (= the place of separation, dependence on God, and refuge, where God set man at first and calls him again; Gen 2:8; Isa 32:18; AH 141.4)',
        'coming out (= the obedient separation of God’s people from Babylon, in body and in spirit; 2 Cor 6:17; Rev 18:4)',
      ],
    },
    {
      key: '04-rich-and-need-of-nothing',
      part: 'II — The Message Ignored',
      title: 'Rich and Increased with Goods — the Laodicean Refusal',
      scope:
        'WHY the message was refused: the heart it exposed. The country-living call demanded sacrifice and inconvenience — leaving business, comfort, position; God’s people would rather keep the city and its goods. This is the Laodicean spirit exactly: "Because thou sayest, I am rich, and increased with goods, and have need of nothing; and knowest not that thou art wretched, and miserable, and poor, and blind, and naked" (Rev 3:17). Scripture’s warnings to the comfortable: the rich fool who said "thou hast much goods laid up... take thine ease" the night his soul was required (Luke 12:16-21); "they that will be rich fall into temptation and a snare" (1 Tim 6:9-10); the young ruler who "went away sorrowful: for he had great possessions" (Matt 19:21-22); "ye cannot serve God and mammon" (Matt 6:24); Demas, "having loved this present world" (2 Tim 4:10). The counsel of the True Witness to BUY gold tried in the fire (Rev 3:18) — the opposite economy. Then the testimony: the Laodicean message applies to God’s people who refuse the cross of separation; the love of goods and ease held them in the cities. Establish that the refusal of country living was at root the Laodicean refusal of the cross. Define Laodicea, the lukewarm, and the false riches from Scripture.',
      terms: [
        'I am rich, and increased with goods, and have need of nothing',
        'thou art wretched, and miserable, and poor, and blind, and naked',
        'I counsel thee to buy of me gold tried in the fire',
        'thou hast much goods laid up for many years',
        'they that will be rich fall into temptation and a snare',
        'he went away sorrowful: for he had great possessions',
      ],
      symbols: [
        'Laodicea (= the lukewarm self-sufficient church of the last days, rich in goods and poor toward God; Rev 3:14-22)',
        'the goods / riches (= the worldly increase that holds the heart in the city and refuses the cross of separation; Rev 3:17; Luke 12:16-21; 1 Tim 6:9)',
        'the gold tried in the fire (= faith working by love, true riches the True Witness offers in exchange; Rev 3:18; 1 Pet 1:7)',
      ],
    },

    // ============================================================
    // Part III — THE MARKED CONTRAST: Noah, Lot, and the two streams
    // ============================================================
    {
      key: '05-days-of-noah',
      part: 'III — The Marked Contrast',
      title: 'As in the Days of Noah — the Two Streams',
      scope:
        'The type the Lord Himself set: "as it was in the days of Noe, so shall it be also in the days of the Son of man. They did eat, they drank, they married wives... and knew not until the flood came" (Luke 17:26-27; Matt 24:37-39). Establish the MARKED CONTRAST in Genesis: on one side the line of Cain — the city-builder (Gen 4:17), the smiths of bronze and iron and the harpists (4:21-22), a civilization that "did eat and drink," whose wickedness was great and every imagination evil (Gen 6:5); on the other the line of Seth, when "then began men to call upon the name of the LORD" (Gen 4:26) — Enoch who "walked with God" (5:24), and Noah who "found grace" and "walked with God" (6:8-9) and built an ark of separation while the world ate and drank. The two streams: those who call on the Name and separate, and those who keep the ordinary current of life with no thought of God. The ark is the act of faith that divides them (Heb 11:7 "by faith Noah... prepared an ark... by the which he condemned the world"). The country-living separation is the modern ark-building: the same eating-and-drinking world, the same small remnant who come out and call on the Name. Define the days of Noah, the calling on the Name, and the ark from Scripture.',
      terms: [
        'as it was in the days of Noe, so shall it be',
        'they did eat, they drank, they married wives',
        'then began men to call upon the name of the LORD',
        'Noah found grace in the eyes of the LORD',
        'by faith Noah... prepared an ark to the saving of his house',
        'Enoch walked with God',
      ],
      symbols: [
        'the days of Noah (= the antitype of the last age, an eating-drinking world heedless until judgment falls; Luke 17:26-27; Gen 6:5)',
        'calling on the name of the LORD (= the separation of the faithful seed into open worship and dependence on God; Gen 4:26)',
        'the ark (= the act of separating faith that divides the two streams and saves the remnant; Gen 6:14-22; Heb 11:7)',
      ],
    },
    {
      key: '06-remember-lots-wife',
      part: 'III — The Marked Contrast',
      title: 'Remember Lot’s Wife — the Backward Look',
      scope:
        'The second type, with the sharpest warning in the gospels. "Likewise also as it was in the days of Lot; they did eat, they drank, they bought, they sold, they planted, they builded; but the same day that Lot went out of Sodom it rained fire and brimstone from heaven, and destroyed them all" (Luke 17:28-29). Lot the type of God’s people caught in the city: he "pitched his tent toward Sodom" (Gen 13:12), then "dwelt in Sodom" (Gen 14:12), then "sat in the gate of Sodom" (Gen 19:1) — the steady drift INTO the city; "vexed his righteous soul" yet stayed (2 Pet 2:7-8); and at the end "lingered" so the angels had to take his hand (Gen 19:16). His wife "looked back from behind him, and she became a pillar of salt" (Gen 19:26) — the heart still in the city though the feet had left. The Lord crowns the whole age-end warning with three words: "Remember Lot’s wife" (Luke 17:32) — to leave the city in body but keep it in heart is to perish in sight of safety; "no man, having put his hand to the plough, and looking back, is fit for the kingdom of God" (Luke 9:62); "if any man draw back, my soul shall have no pleasure in him" (Heb 10:38-39). Tie directly to country living: the call is not only to MOVE but to come out wholly — the half-converted move (body out, heart in Sodom) is Lot’s wife. Define Sodom, the lingering, and the backward look from Scripture.',
      terms: [
        'Remember Lot’s wife',
        'they bought, they sold, they planted, they builded',
        'his wife looked back from behind him, and she became a pillar of salt',
        'while he lingered, the men laid hold upon his hand',
        'Lot... pitched his tent toward Sodom',
        'no man, having put his hand to the plough, and looking back, is fit for the kingdom of God',
      ],
      symbols: [
        'Sodom (= the doomed city whose ease and plenty entangle the righteous who linger in it; Gen 13:13; 19:24-25; Eze 16:49)',
        'Lot’s wife (= the half-separated soul, body out of the city but heart still in it, lost in sight of refuge; Gen 19:26; Luke 17:32)',
        'the backward look (= the divided heart that forfeits the kingdom, the opposite of the ark-builder’s forward faith; Luke 9:62; Heb 10:38-39)',
      ],
    },

    // ============================================================
    // Part IV — THE SEAL OR THE MARK: the remedy and the call
    // ============================================================
    {
      key: '07-seal-or-mark',
      part: 'IV — The Seal or the Mark',
      title: 'The Seal or the Mark — the Final Marked Contrast',
      scope:
        'Gather the contrast into its end-time form: every soul will bear either the seal of God or the mark of the beast, and where one lives — in the city’s stream or in separated dependence on God — proves which. The two companies of Rev 14: those sealed with the Father’s name on Mount Zion who "follow the Lamb" and are "without fault" (Rev 14:1-5), and those who worship the beast and receive his mark and "have no rest" (Rev 14:9-11). The mark is received in the hand or forehead — in the very places the seal is set (Rev 13:16-17; 7:3) — and "no man might buy or sell, save he that had the mark" (Rev 13:17): the city’s commerce is the mark’s leverage, and to be free of dependence on that buying-and-selling system (the country-living provision — "raise their own provisions," AH 141.4) is to be free to refuse the mark. The seal is the Sabbath-keeping, character-settled rest of the commandment-keeping faith (Eze 20:12,20; Rev 7:2-3) — the very righteousness by faith of §2. So the country-living message is preparation to stand: out of the city, out of the buying-and-selling dependence, sealed and separate. Define the seal, the mark, and the buying and selling from Scripture.',
      terms: [
        'having his Father’s name written in their foreheads',
        'these are they which follow the Lamb whithersoever he goeth',
        'if any man worship the beast and his image... the same shall drink of the wine of the wrath of God',
        'no man might buy or sell, save he that had the mark',
        'I gave them my sabbaths, to be a sign between me and them',
        'a mark in their right hand, or in their foreheads',
      ],
      symbols: [
        'the mark of the beast (= forced conformity to the beast’s worship, enforced through the buy-and-sell commerce of the city system; Rev 13:16-17; 14:9-11)',
        'the seal of God (= the Sabbath sign and settled character of the commandment-keeping, faith-of-Jesus remnant; Eze 20:12,20; Rev 7:2-3; 14:1)',
        'buying and selling (= the world’s commercial dependence that becomes the lever of the mark, broken by the separated, self-provisioning life; Rev 13:17; AH 141.4)',
      ],
    },
    {
      key: '08-come-out-and-be-ready',
      part: 'IV — The Seal or the Mark',
      title: 'Come Out and Be Ready — Why He Tarries, and How He Comes',
      scope:
        'The close and the call. Gather the whole argument: He tarries because His people loved the city — refused the country-living message, refused the cross of separation it required, and so refused, in deed, the righteousness by faith that is the third angel in verity; like Laodicea they were rich and in need of nothing, like the days of Noah and of Lot they ate and drank and bought and sold while the call to come out went largely unheeded, and many who moved kept their hearts in Sodom. Now the gospel turn and the hope: the message still stands and the door is not shut — "Come out of her, my people" is a present call (Rev 18:4); the True Witness still counsels and stands at the door (Rev 3:18-20); the same conditional promise that explains the delay also names the remedy — when "this gospel of the kingdom shall be preached in all the world... then shall the end come" (Matt 24:14), and the day can be hastened (2 Pet 3:12). The remnant who come out, call on the Name, build the ark, and do not look back will see Him. End on the readiness Scripture commands: "Watch... for in such an hour as ye think not the Son of man cometh" (Matt 24:42-44); "let us not sleep, as do others; but let us watch and be sober" (1 Thess 5:6); "Surely I come quickly. Amen. Even so, come, Lord Jesus" (Rev 22:20). Define readiness and the present call from Scripture; close with the summons to come out, separate fully, and be ready.',
      terms: [
        'Come out of her, my people',
        'Behold, I stand at the door, and knock',
        'and then shall the end come',
        'Watch therefore: for ye know not what hour your Lord doth come',
        'Surely I come quickly',
        'let us watch and be sober',
      ],
      symbols: [
        'the present call (= the still-open summons to come out of Babylon and the city, before the door shuts; Rev 18:4; 3:20)',
        'readiness (= the watching, separated, sealed state of those who will meet the Lord without looking back; Matt 24:44; 1 Thess 5:6)',
      ],
    },
  ],
};
