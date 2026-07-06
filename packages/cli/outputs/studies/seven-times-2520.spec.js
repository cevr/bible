// Handbook spec: the 2520 — the "seven times" of the covenant curse, the scattering
// and treading of God's people, the times of the Gentiles. A full expansion of
// §2 "The Seven Times" of the Daniel & Revelation handbook into its own study.
// Bible PRIMARY; the Millerite pioneers (Miller, Litch, Hale, Snow, the Midnight
// Cry / Signs of the Times periodicals) + EGW as the central SECONDARY cloud.
//
// Run: Workflow(scriptPath: handbook-factory.workflow.js, args: { specPath: this file })

export default {
  title: 'The Seven Times — A Bible Handbook Study of the 2520',
  topic: 'The Seven Times — A Bible Handbook Study of the 2520',
  createdAt: '2026-06-22T12:00:00Z',

  // Bible-primary: every figure (seven times, the curse, the treading, the 360-day
  // time) defined first from Scripture; the Millerite pioneers + EGW corroborate only,
  // after the text has carried the point. This is a contested pioneer period (dropped
  // by mainstream SDA; Uriah Smith did NOT hold it), so sourcing must be scrupulous.
  bibleOnly: true,
  sabbathSchool: true,

  thesis:
    'Long before Daniel\'s 2300 days, Moses wrote the first and longest of the prophetic periods into the covenant itself. To a people warned that obedience brings blessing and rebellion brings the curse, the LORD four times pronounced one sentence: "I will punish you SEVEN TIMES for your sins" (Lev. 26:18, 21, 24, 28) — and the sentence was a scattering: "I will scatter you among the heathen... and your land shall be desolate" (Lev. 26:33). A prophetic "time" is 360 years; "seven times" is 2520 years (Litch). Nebuchadnezzar\'s literal seven years of madness (Dan. 4) is the Bible\'s own type of it — a proud kingdom hewn down "till seven times pass over." The 2520 is the era Christ named "the times of the Gentiles," when "Jerusalem shall be trodden down of the Gentiles" (Luke 21:24) — the long treading of God\'s people, pagan Babylon then papal Rome, the two desolating powers of Daniel 8:13. Measured from the carrying-away of Manasseh (B.C. 677), the seven times reach to A.D. 1844, ending where the 2300 ended; measured from the fall of Samaria and Judah\'s earlier shocks, the parallel reckoning reaches A.D. 1798, when the papal dominion was broken. The curse ran its full course — and on the cross Christ was "made a curse for us" (Gal. 3:13), that the scattering might end in a gathering.',
  method:
    "After Haskell's Bible Handbook: ref → gloss, scannable; every figure defined first from Scripture (Miller's Rule — the Bible defines its own figures: a time = 360 [Rev. 12:6,14], a day = a year [Num. 14:34; Eze. 4:6]). The doctrine is built from the covenant text (Lev. 26; Deut. 28), the type (Dan. 4), and Christ's own word (Luke 21:24); the Millerite pioneers — William Miller, Josiah Litch, Apollos Hale, Samuel Snow, and the 1843-44 periodicals (Signs of the Times / Midnight Cry / Advent Herald) — corroborate ONLY, after Scripture. BE SCRUPULOUS: this is a contested pioneer period. Uriah Smith and the later mainstream did NOT hold the 2520 — cite Smith (DAR) only for the daily/treading powers, NEVER for the period. Quote every refcode verbatim; verify with `bible egw \"REF\"`; never invent one, and never assert a chronology the pioneers did not actually compute.",

  outPath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-22-the-seven-times-a-bible-handbook-study-of-the-2520.md',
  sectionsDir:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/seven-times-2520/sections',
  templatePath:
    '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/2026-06-10-daniel-and-the-revelation-a-bible-handbook-study.md',

  sources:
    'The classic Millerite expositions of the 2520: William Miller (Miller\'s Works vols. 1-2, MWV1/MWV2 — the Manasseh B.C. 677 anchor, MWV2 262.2), Josiah Litch (Prophetic Expositions vols. 1-2, PREX1/PREX2 — the 360x7=2520 reckoning at PREX2 124.2, the two equal halves at PREX2 202.1/204.1), Apollos Hale (The Second Advent Manual, TSAM — the objections answered, TSAM 25.1/33.2/37.1), Samuel Snow (True Midnight Cry, TRMC). The 1844 periodicals (Advent Herald / Signs of the Times, HST; The True Midnight Cry, TRMC) carry the Israel/Samaria parallel terminus (HST March 20, 1844; HST October 2, 1844). EGW: Early Writings (EW 74, "The Gathering Time" — the scattering/gathering covenant frame; EW 74.1 the 1843 chart "directed by the hand of the Lord"). Uriah Smith\'s Daniel and the Revelation (DAR) is cited ONLY for the daily / the two treading powers, since Smith rejected the 2520 itself. Bible spine is the priority everywhere. CONSISTENCY: honor the positions already set in §2 "The Seven Times" of the Daniel & Revelation handbook (677 BC -> 1844 for Judah; ~723/722 BC -> 1798 for Israel; the no-year-zero rule; 1260+1260=2520).',

  sections: [
    // ---- Part I: the covenant sentence ----
    {
      key: '01-blessing-and-curse',
      part: 'I — The Covenant Curse',
      title: 'The Blessing and the Curse — the Covenant Sanctions',
      scope:
        'Lay the foundation Moses laid: the covenant set before Israel life and good, death and evil — obedience brings the blessing, rebellion brings the curse (Lev. 26:3-13 the blessing; Deut. 28:1-14 the blessing, 28:15-68 the curse; Deut. 30:15-19 "I have set before thee life and death, blessing and cursing"). The curse, fully unfolded, is a SCATTERING among the nations and a desolation of the land (Lev. 26:33; Deut. 28:64 "the LORD shall scatter thee among all people"). Establish that the curse is not arbitrary fate but the just sentence of a broken covenant — "the curse causeless shall not come" (Prov. 26:2) — and that Israel themselves confessed it fell "because we have sinned" (Dan. 9:11 "the curse... that is written in the law of Moses"). This sets the stage: the seven-times is the MEASURE of that curse. Define the covenant, the blessing and the curse, the scattering.',
      terms: [
        'I have set before thee life and death, blessing and cursing',
        'cursed shalt thou be in the city',
        'the LORD shall scatter thee among all people',
        'the curse causeless shall not come',
        'the curse is poured upon us, and the oath that is written in the law of Moses',
        'I will scatter you among the heathen',
      ],
      symbols: [
        "the covenant (= the LORD's sworn agreement with Israel, with blessings for obedience and curses for rebellion; Lev. 26; Deut. 28)",
        'the curse (= the covenant sentence for disobedience, fully unfolded as scattering and desolation; Lev. 26:33; Deut. 28:15-68)',
        'the scattering (= dispersion among the nations, the form the curse takes; Lev. 26:33; Deut. 28:64)',
      ],
    },
    {
      key: '02-seven-times-sentence',
      part: 'I — The Covenant Curse',
      title: 'Seven Times for Your Sins — the Fourfold Sentence',
      scope:
        'The heart of the covenant curse: FOUR times in one chapter the LORD names the measure — "I will punish you SEVEN TIMES more for your sins" (Lev. 26:18), "seven times more plagues" (26:21), "punish you yet seven times" (26:24), "chastise you seven times" (26:28). Show this is not merely "sevenfold in intensity" but, read prophetically (as the pioneers read it), a definite period of chastisement — the rod measured out in TIME. The escalation of the four warnings (each "if ye will not yet for all this hearken") climaxing in the scattering (26:33). Tie to the prophetic principle that a "time" is a measured period (set up for §4). The CENTRAL pioneer witnesses enter here: Miller (MWV1 43.3, the "seven times" of scattering are "a succession of years," not yet finished; MWV1 45.1, Lev. 26:21 names the cause). Define seven times.',
      terms: [
        'I will punish you seven times more for your sins',
        'I will bring seven times more plagues upon you',
        'I will punish you yet seven times for your sins',
        'I, even I, will chastise you seven times for your sins',
        'if ye will not yet for all this hearken unto me',
      ],
      symbols: [
        "seven times (= the measure of the covenant curse, read prophetically as a definite period of chastisement upon God's people; Lev. 26:18, 21, 24, 28)",
      ],
    },

    // ---- Part II: the type and the reckoning ----
    {
      key: '03-nebuchadnezzars-seven-times',
      part: 'II — The Type and the Reckoning',
      title: "Nebuchadnezzar's Seven Times — the Living Type",
      scope:
        'Daniel 4: the Bible\'s own type of the period. The proud tree hewn down, the stump bound "with a band of iron and brass," and "seven times pass over" the king till he learns "the most High ruleth in the kingdom of men" (Dan. 4:14-16, 25, 32). The literal fulfilment: Nebuchadnezzar driven from men, eating grass as an ox, for seven YEARS, then restored (Dan. 4:33-36). Establish the TYPE: a proud kingdom (the tree = a ruler/kingdom, Dan. 4:20-22; Eze. 31:3) brought low for "seven times" until it owns God\'s sovereignty — the very pattern of God\'s people scattered for their pride until the scattering ends. Miller reads the literal seven years as the key to the prophetic seven times (MWV2 261.1, "fulfilled in seven years... for his pride and arrogancy against God"). Define the tree, seven times (the type).',
      terms: [
        'Hew down the tree',
        'leave the stump of his roots in the earth, even with a band of iron and brass',
        'seven times shall pass over thee',
        'till thou know that the most High ruleth in the kingdom of men',
        'he was driven from men, and did eat grass as oxen',
        'mine understanding returned unto me',
      ],
      symbols: [
        'the tree (= a ruler or kingdom in its height; Dan. 4:20-22; Eze. 31:3)',
        "Nebuchadnezzar's seven times (= the literal seven years of his abasement, the living type of the 2520-year scattering of God's people for pride; Dan. 4:16, 25, 32-33)",
      ],
    },
    {
      key: '04-a-time-is-360',
      part: 'II — The Type and the Reckoning',
      title: 'A Time Is 360, Seven Times Is 2520 — the Reckoning',
      scope:
        'Build the arithmetic from Scripture. A prophetic "time" = a year of 360 days: the same 1260 days is called "a time, times, and half a time" (3.5 times), "forty and two months," and "a thousand two hundred and threescore days" (Rev. 12:6, 14; 11:2-3; 13:5) — so one time = 360, and the day-for-a-year principle (Num. 14:34; Eze. 4:6) turns the 2520 days into 2520 YEARS. Therefore seven times = 7 x 360 = 2520 years. Show the second, confirming path: the named papal half is 1260 ("a time, times, and an half," Dan. 7:25; 12:7); the whole being twice the half, 1260 + 1260 = 2520 — the seven times is simply twice the time-times-and-a-half. The CENTRAL reckoning witnesses: Litch (PREX2 124.2, "one time being 360 days, seven times would 2520 days... 2520 years is the length of that dispersion"; PREX1 92.3, "the Holy Ghost hath defined it"); Hale (TSAM 25.1, "2520 days in 7 times... the period expresses 2520 true solar years"; TSAM 33.2, the objections answered); Litch on the two equal halves (PREX2 202.1, 204.1). Define a time (360), the day-for-a-year principle, 2520.',
      terms: [
        'a time, and times, and the dividing of time',
        'a time, times, and half a time',
        'forty and two months',
        'a thousand two hundred and threescore days',
        'I have appointed thee each day for a year',
        'each day for a year',
      ],
      symbols: [
        'a time (= a prophetic year of 360 days/years; Rev. 12:6 with 12:14; 11:2-3)',
        'the day-for-a-year principle (= one prophetic day stands for one literal year; Num. 14:34; Eze. 4:6)',
        '2520 (= seven times, 7 x 360, the full length of the scattering; Lev. 26:18 with Dan. 4; PREX2 124.2)',
      ],
    },

    // ---- Part III: the treading ----
    {
      key: '05-times-of-the-gentiles',
      part: 'III — The Treading of the Gentiles',
      title: 'The Times of the Gentiles — the Treading Down',
      scope:
        'Christ\'s own name for the period. "Jerusalem shall be trodden down of the Gentiles, until the times of the Gentiles be fulfilled" (Luke 21:24) — the long treading of God\'s people. Identify the TWO desolating powers that do the treading across the 2520: pagan (Babylon/Rome) then papal Rome — the "transgression of desolation" that gives "both the sanctuary and the host to be trodden under foot" (Dan. 8:13). The whole period is one continuous treading, the rod passing from pagan to papal hands. The times of the Gentiles = the seven times, the whole 2520-year treading. Use Smith (DAR) ONLY for the two treading powers / the daily, with the explicit note that Smith did NOT hold the 2520 itself. Pioneer periodical witness: HST October 2, 1844 ("The seven times of the Gentile domination over the church of God spoken of in Leviticus 26"). Define the times of the Gentiles, the treading, the two desolating powers.',
      terms: [
        'Jerusalem shall be trodden down of the Gentiles',
        'until the times of the Gentiles be fulfilled',
        'to give both the sanctuary and the host to be trodden under foot',
        'the transgression of desolation',
        'how long shall be the vision',
      ],
      symbols: [
        "the times of the Gentiles (= the whole 2520-year treading down of God's people, pagan then papal; Luke 21:24)",
        "the treading (= the subjection of God's people and sanctuary under desolating powers; Dan. 8:13; Luke 21:24)",
        'the two desolating powers (= pagan Rome and papal Rome, the successive treaders; Dan. 8:13 — Smith DAR for the powers only, not the period)',
      ],
    },
    {
      key: '06-two-captivities-two-termini',
      part: 'III — The Treading of the Gentiles',
      title: 'Two Captivities, Two Termini — 677 to 1844, 723 to 1798',
      scope:
        'The chronology, exactly as set in the Daniel & Revelation handbook §2. JUDAH: the seven times began with the carrying-away of Manasseh to Babylon (2 Chron. 33:11, "bound him with fetters, and carried him to Babylon"), B.C. 677 (Miller MWV2 262.2, "In the year 677 before Christ"); 2520 years, by the no-year-zero rule, reach A.D. 1844 — ending where the 2300 ended. ISRAEL: the parallel and earlier terminus — Samaria fell to Shalmaneser (2 Kings 17:18; 18:9-12), ~B.C. 723/722; 2520 years reach A.D. 1798, when the papal dominion was broken. Present BOTH reckonings honestly with their witnesses: Miller / Hale on 677->1844 (MWV2 262.2; TSAM 37.1, "Why commence the seven times at the captivity of Manasseh, B.C. 677?"); Snow (TRMC August 22, 1844) and the Advent Herald series on the Israel/Samaria parallel (HST March 20, 1844, "The second siege of Samaria... B.C. 722, which corresponds with A.D. 1798"). Note the reckoning convention (simple subtraction vs. the no-year-zero rule) candidly, as §2 did. Define the two termini.',
      terms: [
        'took Manasseh among the thorns, and bound him with fetters, and carried him to Babylon',
        'removed them out of his sight: there was none left but the tribe of Judah only',
        'Shalmaneser king of Assyria came up against Samaria',
        'at the end of three years they took it',
        'the times of the Gentiles be fulfilled',
      ],
      symbols: [
        "the captivity of Manasseh (= the carrying-away to Babylon, B.C. 677, the start of Judah's seven times reaching A.D. 1844; 2 Chron. 33:11)",
        'the captivity of Samaria (= the fall of the northern kingdom, ~B.C. 723/722, the start of the parallel reckoning reaching A.D. 1798; 2 Kings 17:18; 18:9-12)',
        "the two termini (= A.D. 1844 from Judah's captivity and A.D. 1798 from Israel's, the two ends of the 2520)",
      ],
    },

    // ---- Part IV: the end of the curse ----
    {
      key: '07-made-a-curse-for-us',
      part: 'IV — The End of the Curse',
      title: 'Made a Curse for Us — the Scattering Ends in a Gathering',
      scope:
        'The gospel turn. The curse that fell on a covenant-breaking people Christ took on Himself: "Christ hath redeemed us from the curse of the law, being made a curse for us: for it is written, Cursed is every one that hangeth on a tree" (Gal. 3:13; Deut. 21:23). So the scattering was never God\'s last word — the same covenant that pronounced the curse promised, on confession, a regathering (Lev. 26:40-45 "then will I remember my covenant"; Deut. 30:1-5 the gathering "from all the nations"). And the 2520, ending at A.D. 1844, ends not in wrath but where the 2300 cleansing began and the gathering message went forth — "the times of refreshing" and the gathering of God\'s people (EW 74, "The Gathering Time": "He had stretched out His hand the second time to recover the remnant of His people... In the scattering Israel was smitten and peeled; in the gathering..."). Show that the curse fully spent (2520) and the cross (Christ made a curse) together open the door to the gathering. Close with the call: the curse is borne, the scattering is over, the gathering is now. Define made a curse, the gathering.',
      terms: [
        'Christ hath redeemed us from the curse of the law, being made a curse for us',
        'Cursed is every one that hangeth on a tree',
        'then will I remember my covenant',
        'the LORD thy God will turn thy captivity, and have compassion upon thee, and will gather thee',
        'He had stretched out His hand the second time to recover the remnant of His people',
      ],
      symbols: [
        'made a curse (= Christ bearing the covenant curse in our place on the tree; Gal. 3:13; Deut. 21:23)',
        "the gathering (= the regathering of God's people promised in the same covenant, fulfilled as the scattering ends; Lev. 26:40-45; Deut. 30:1-5; EW 74)",
      ],
    },
  ],
};
