-- edit-deck2.applescript
-- "What is Truth — Part II: Just Another Book?" v2 surgical edits.
-- Operates on the COPY (just_another_book v2.key); original untouched.
-- Pure additions + audited corrections; existing pacing untouched.
-- All ops in DESCENDING slide order. Evidence: gather/audit-deck2-dates.md + gather/capstone-1840.md.

on replaceText(theSlide, marker, newText)
	tell application "Keynote"
		set hit to false
		repeat with ti in (text items of theSlide)
			if (object text of ti as text) contains marker then
				set object text of ti to newText
				set hit to true
			end if
		end repeat
		return hit
	end tell
end replaceText

tell application "Keynote"
	activate
	set theDoc to open (POSIX file "/Users/cvr/Library/Mobile Documents/com~apple~Keynote/Documents/just_another_book v2.key")
	delay 2

	tell theDoc

		-- ============ slide 94: closing notes get the Night-3 hook ============
		set presenter notes of slide 94 to "I believe we live in interesting times. These prophecies predicted each successive world kingdom — and a kingdom that will never end. I believe the Bible has given us sufficient evidence that there is something supernatural about it. And that leaves the biggest question of all: if this Book really is above human origins — what does it SAY? Why is the world broken? Why is there suffering at all — and what is God doing about it? That is tomorrow night. And if this has piqued your interest, come talk to me after — we can study it together."

		-- ============ slide 93: remove the Ottoman teaser (now covered) ============
		my replaceText(slide 93 of theDoc, "Ottoman", "1260 day prophecy" & linefeed & "2300 day prophecy" & linefeed & "1290 day prophecy" & linefeed & "1335 day prophecy")

		-- ============ 1840 CAPSTONE — insert C12..C1 after slide 92 (reverse order) ============
		set c12 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c12
			set object text of default title item to "One key. Two eras."
			set object text of default body item to "The same day-for-a-year key that placed Messiah's anointing at AD 27 placed the surrender of Ottoman independence in August 1840." & linefeed & "The month — named two years early. The day — in print before it arrived. The event — exactly the kind predicted: sovereignty surrendered to four Christian powers." & linefeed & "One method. Two eras. Tested in public."
			set presenter notes to "Tie back to the 70 weeks: this is not a method invented to fit one verse — it is the SAME arithmetic, applied to a second prophecy, producing a publicly dated, publicly recorded prediction. Land the honest sentence: 'named the month two years out, the day in print before it arrived, and the event-type — sovereignty surrendered to the Christian powers — exactly as predicted; confirmed by friend (Goodell) and enemy (Balch) alike.' That sentence survives any hostile fact-check. Do NOT say 'he named the exact day two years early' or 'Turkey was destroyed on schedule.'"
		end tell
		set c11 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c11
			set object text of default title item to "A thousand skeptics changed their minds"
			set object text of default body item to "When the prediction landed, it didn't just convince believers." & linefeed & "By Litch's own report, more than 1,000 self-described skeptics wrote to him accepting the Bible because the prophecy had come true — and in several American cities the infidel clubs could no longer fill a meeting." & linefeed & "— Reported by J. N. Loughborough, The Great Second Advent Movement, p. 518"
			set presenter notes to "HONESTY: this is third-hand (Loughborough heard Pinney, who had it from Litch) and the number is uncorroborated outside the Adventist tradition. Present it as a REPORTED claim, attributed, exactly as the slide does — 'by Litch's own report.' Verbatim if challenged: 'he had received letters from more than 1,000 infidels, who adopted the Bible on the fulfillment of that prophecy... large infidel clubs were so decimated by the loss of members, that they could not rally enough to hold a meeting.' (GSAM 518.2) The rhetorical point for THIS room: people exactly like you changed their minds on this evidence."
		end tell
		set c10 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c10
			set object text of default title item to "Even the critics admitted it"
			set object text of default body item to "\"…the most authentic version of the change of the Ottoman empire is that it has not been on a better foundation in fifty years, for it is now re-organized by the European kingdoms, and is honorably treated as such.\"" & linefeed & "— Rev. Mr. Balch of Providence, R.I. — writing to ATTACK the prediction"
			set presenter notes to "The strongest slide in the segment, BECAUSE Balch was on the other side. He stood up to ridicule the predictors — and in the act of attacking them he conceded the substance: the Ottoman empire 're-organized by the European kingdoms.' That IS the prediction — sovereignty passing to the European powers — admitted by an enemy who thought he was refuting it. Frame: 'You don't have to trust the prophecy's friends. Here's a man who got up to call them liars — listen to what he conceded.' (Litch, PREX2 190.2) Honest nuance: Balch's point was that Turkey was NOT destroyed — true, and it is also the predictors' own reading: the empire survived as a European dependency. He confirms the dependency; he only disputes the drama."
		end tell
		set c9 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c9
			set object text of default title item to "\"Broken forever\""
			set object text of default body item to "\"The power of Islamism is broken forever; and there is no concealing the fact even from themselves. They exist now by mere sufferance… now, when all the mighty potentates of Christian Europe… are leagued together for its protection and defence, down it comes, in spite of all their fostering care.\"" & linefeed & "— Rev. William Goodell, American missionary at Constantinople, Missionary Herald, April 1841, p. 160"
			set presenter notes to "Why this works for skeptics: Goodell was an on-the-ground eyewitness in Constantinople writing to his mission board — a contemporary journal source, not a prophecy advocate. He describes the SAME outcome Litch predicted: Islamic power surviving only by the 'sufferance' and 'protection' of the Christian powers. Caveat for Q&A: Goodell certifies the trajectory, not the calendar day — use him for 'contemporaries on the ground agreed the independent power was finished,' not for August 11."
		end tell
		set c8 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c8
			set object text of default title item to "August 11, 1840"
			set object text of default body item to "The ultimatum passes into Mehemet Ali's power — from that moment the Sultan's affairs rest in the hands of the four powers." & linefeed & "By Litch's reckoning: 391 years and 15 days from July 27, 1449." & linefeed & "\"…Ottoman Supremacy did depart on the eleventh of August into the hands of the great Christian powers of Europe.\" — Josiah Litch, Prophetic Expositions, vol. 2, pp. 197-199"
			set presenter notes to "MOST CHALLENGEABLE SLIDE IN THE SERIES — rehearse the honest hold: the argument does NOT depend on Turkey being destroyed on Aug 11 (it wasn't — the empire limped on under European protection until 1922, and the pioneers themselves said it survived 'by sufferance'). It depends on the narrow, defensible claim: by the July 15 Convention and the events of August 1840, the Sultan's power passed into the hands of four Christian powers — exactly the 'voluntary surrender' Litch deduced from the prophecy in 1838. KNOW THE COUNTER: the neutral U.S. record (FRUS 1879, doc. 518) dates the written communication to Mehemet Ali to August 19, not the 11th; modern histories put the military resolution in November (Acre, Nov 3; capitulation Nov 27). If pressed: concede the day is debated, then pivot — the YEAR and the EVENT-TYPE were named two years out, the day was in print before the event, and even hostile contemporaries conceded the outcome. That is what no honest skeptic can wave away."
		end tell
		set c7 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c7
			set object text of default title item to "August 1840 — the messenger sails"
			set object text of default body item to "The Sultan dispatches Rifat Bey on a government steamer from Constantinople to Alexandria — carrying the ultimatum to Mehemet Ali of Egypt." & linefeed & "— Mission confirmed in the neutral diplomatic record (U.S. Foreign Relations series, 1879, doc. 518)"
			set presenter notes to "The Rifat Bey mission is real and in the neutral record: the U.S. State Department's FRUS 1879 (doc. 518) confirms 'the Sublime Porte sent Rifaat Bey to Alexandria, who, together with the consuls of England, Russia, Austria, and Prussia, presented himself to Muhammad Ali.' DATE CAUTION: 'sailed Aug 5 / delivered Aug 11' is the pioneer timeline (Loughborough/Smith); the slide deliberately says 'August 1840' — don't hard-commit the 5th as a checkable secular fact. The neutral anchors are the mission itself and the July 15 Convention."
		end tell
		set c6 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c6
			set object text of default title item to "July 15, 1840 — four powers meet in London"
			set object text of default body item to "England, Russia, Austria, and Prussia sign the Convention of London — \"for the Pacification of the Levant.\"" & linefeed & "Four powers take the Sultan's quarrel with Egypt out of his hands." & linefeed & "— Convention of London, 15 July 1840 (standard diplomatic history)"
			set presenter notes to "FULLY SECULAR AND SOLID — uncontested mainstream history (signatories: Palmerston for Britain, Neumann for Austria, Bulow for Prussia, Brunnow for Russia, Chekib Effendi for the Porte). Color: France was deliberately EXCLUDED and nearly went to war over it. Four powers acting together over the Sultan's affairs is precisely the event-shape the 1838 calculation called for."
		end tell
		set c5 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c5
			set object text of default title item to "He named it in advance"
			set object text of default body item to "1838 — Josiah Litch publishes his exposition of Revelation 9: Ottoman independence will end in August 1840." & linefeed & "August 1, 1840 — the day itself, August 11, is in print before the event (Signs of the Times)." & linefeed & "\"When the foregoing calculation was made, it was purely a matter of calculation on the prophetic periods of Scripture.\" — Josiah Litch, Prophetic Expositions, vol. 2, p. 189"
			set presenter notes to "'Purely a matter of calculation on the prophetic periods' is the quote that matters — Litch insisting the date came from arithmetic, not from reading the news. PRECISION (critics dispute this point): Litch's 1838 publication named AUGUST 1840 — the month, two years early. The exact day, August 11, is verifiably in print on August 1, 1840 (Signs of the Times) — before the event, but not two years before. The slide states exactly that split; keep your spoken words to it too: 'month named two years early; day in print before it arrived.' That phrasing is bulletproof."
		end tell
		set c4 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c4
			set object text of default title item to "The clock starts: July 27, 1299"
			set object text of default body item to "July 27, 1299 — Othman leads the first Ottoman attack on Byzantine territory (date per Edward Gibbon, The Decline and Fall of the Roman Empire)." & linefeed & "The 5th trumpet runs 150 years — \"five months\" (Rev 9:5, 10)." & linefeed & "July 27, 1449 — the Greek emperor takes his throne only by permission of the Turkish sultan." & linefeed & "The 391-year clock starts here."
			set presenter notes to "Gibbon is the named secular historian behind July 27, 1299 (he dates Othman's first invasion of Nicomedia to that day) — cite him by name. The 1449 'voluntary submission' (Constantine reigning by Amurath's permission) is the template: the prophecy's END should likewise be a VOLUNTARY surrender of independence — set this up here so the August 1840 reading doesn't feel invented on the spot. HONESTY: modern Ottomanists date Osman's emergence loosely (c. 1299-1302); present 1299 as 'the start-date Litch used, after Gibbon' — true and checkable — not as settled fact. Keep the 150 years (5th trumpet) DISTINCT from the 391 (6th trumpet) or the audience conflates them."
		end tell
		set c3 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c3
			set object text of default title item to "Do the math"
			set object text of default body item to "A prophetic day = a literal year — the same key that put Messiah at AD 27." & linefeed & "a year → 360 years" & linefeed & "a month → 30 years" & linefeed & "a day → 1 year" & linefeed & "an hour → 1/24 of a year → 15 days" & linefeed & "Total: 391 years and 15 days." & linefeed & "— Calculation published by Josiah Litch, Prophetic Expositions (1838)"
			set presenter notes to "Walk the column slowly — this is the same year-day key the audience just watched land Messiah at AD 27. 360 + 30 + 1 = 391 years; the 'hour' = one twenty-fourth of a 360-day prophetic year = 15 days. The audience must feel that NO new rules were invented for this prophecy."
		end tell
		set c2 to make new slide at after slide 92 with properties {base slide:master slide "Title & Bullets"}
		tell c2
			set object text of default title item to "Revelation 9:13-15"
			set object text of default body item to "And the sixth angel sounded, and I heard a voice from the four horns of the golden altar which is before God, Saying to the sixth angel which had the trumpet, Loose the four angels which are bound in the great river Euphrates. And the four angels were loosed, which were prepared for an hour, and a day, and a month, and a year, for to slay the third part of men." & linefeed & "— Revelation 9:13-15 (KJV)"
			set presenter notes to "The load-bearing phrase: 'an hour, and a day, and a month, and a year' — a TIMED prophecy. 'The great river Euphrates' places it geographically — the power seated on the Euphrates in this era is the Ottoman empire. Don't argue the geography yet; the math (next slide) and the history carry it."
		end tell
		set c1 to make new slide at after slide 92 with properties {base slide:master slide "Title - Center"}
		tell c1
			set object text of default title item to "One more. In our era."
			set presenter notes to "Every prophecy tonight was written, sealed, and copied centuries before it came true — and a determined skeptic can always whisper 'someone fudged the dates.' So here is one you cannot escape that way: a man named it IN PRINT, two years early, in our own documented era — and the newspapers, the diplomats, and his own enemies recorded what happened. (The prediction is on the public record BEFORE the event: Litch, Prophetic Expositions; Signs of the Times, Aug 1, 1840.)"
		end tell

		-- ============ slide 89: Alexander — 'settled into four', age 32 ============
		my replaceText(slide 89 of theDoc, "Gaugamela", "\"From the west\" → Alexander came from Macedonia/Greece, west of Persia." & linefeed & "\"Notable horn\" → Alexander himself, the first great king of Greece." & linefeed & "\"Furious against the ram\" → He crushed Persia at Issus (333 BC) and Gaugamela (331 BC)." & linefeed & "\"Horn broken\" → Alexander died suddenly at age 32 (323 BC), at the height of his power." & linefeed & "\"Four horns\" → After ~20 years of successor wars his empire SETTLED into four kingdoms — Cassander, Lysimachus, Seleucus, Ptolemy (Battle of Ipsus, 301 BC).")
		set presenter notes of slide 89 to "PRECISION (v2 audit): do NOT say 'four generals divided it the moment he died' — the immediate aftermath involved Perdiccas and Antigonus and four decades of successor wars; the four-fold settlement crystallized after the Battle of Ipsus (301 BC). 'Settled into four' is the accurate phrase — and Daniel 8:8 only says four notable horns CAME UP in its place, which is exactly what history delivered. Age at death: use 32 (born 356, died June 323 BC)."

		-- ============ slides 78, 77, 76: ten kingdoms — complete the list ============
		set tenNote to "TEN kingdoms (v2 audit — the old note listed only nine): Ostrogoths, Visigoths, Franks, Vandals, Suevi, Burgundians, Heruli, Anglo-Saxons, Lombards, and the Huns. Cite MACHIAVELLI (History of Florence, bk. 1) — he catalogued the ten with, as Albert Barnes noted, 'no design of furnishing an illustration of this prophecy.' Historians' lists differ on the disputed tenth slot (Huns vs Alemanni) — own that openly: independent historians converge on the NUMBER ten, which is the point. Don't claim one canonical list; claim the convergence."
		set presenter notes of slide 78 to tenNote
		set presenter notes of slide 77 to tenNote
		set presenter notes of slide 76 to "Rome came after Greece — and after the fall of Rome it fractured into ten kingdoms. " & tenNote

		-- ============ slide 72: Medo-Persia conquests — Cambyses attribution ============
		set presenter notes of slide 72 to "The three ribs: Lydia, defeated 546 BC (Cyrus defeats Croesus, captures Sardis); Babylon, 539 BC (taken 12 October); Egypt, 525 BC — conquered by CAMBYSES II, Cyrus's son (attribute it to Cambyses for accuracy). Three conquests in the bear's mouth — 'Arise, devour much flesh.'"

		-- ============ slide 36: Tiberius — receipts + honest alternative ============
		set presenter notes of slide 36 to "RECEIPTS (v2 audit): Velleius Paterculus 2.121 (a contemporary, writing c. AD 30) records Tiberius's enlarged powers around his Pannonian triumph — fixed by the Fasti Praenestini to 23 October AD 12; Suetonius (Tiberius 20-21) records the law that Tiberius 'should govern the provinces jointly with Augustus' — a provincial co-imperium from AD 12/13. Luke wrote for the provinces; counted from the provincial co-regency, the 'fifteenth year' (Luke 3:1) = AD 27 — where Tertullian and the early church placed it. NAME THE ALTERNATIVE OUT LOUD: counted from sole accession (19 Aug AD 14), the 15th year is AD 28/29. Present AD 27 as the best-supported reading given Luke's provincial vantage, not as undisputed — a skeptic who knows the AD 14 count will pounce if you hide it. Note: every reckoning still lands the baptism in the same narrow window the 70-weeks chronology requires."

		-- ============ slide 31: Artaxerxes 457 — support + honesty ============
		set presenter notes of slide 31 to "Why 457 BC holds (v2 audit): Artaxerxes I acceded 465 BC; Ezra 7:7-9 dates the journey to his 7th year — by Jewish fall-to-fall reckoning, fall 458 to fall 457, with the spring departure landing in 457 BC. Support: the ELEPHANTINE PAPYRI (Jewish colony in Egypt, double-dated documents establishing the Jewish autumn calendar in the Persian period); Nehemiah's own Kislev-then-Nisan 'twentieth year' (Neh 1:1; 2:1) confirming Tishri-to-Tishri counting; Ptolemy's Canon (astronomically anchored) and Olmstead's History of the Persian Empire for the accession. HONESTY: standard reference books often print 458 (Persian spring reckoning); 457 is a DEFENDED date resting on the Jewish calendar — say so, and frame it as the year the decree took effect on the ground."

		-- ============ slide 30: Darius I, not II ============
		set presenter notes of slide 30 to "Darius I (the Great) — his second year, 520 BC (Ezra 6:1-12; Haggai and Zechariah date the resumed work to the same year). Reaffirmed Cyrus's decree after opposition halted the work; still temple-focused — not the city and state. (v2 audit: be careful to say Darius I, not Darius II.)"

		-- ============ slide 29: Cyrus decree 538 BC ============
		my replaceText(slide 29 of theDoc, "537", "Cyrus' Decree — Ezra 1:1-4 (cf. 2 Chronicles 36:22-23)" & linefeed & "Issued 538 BC — Cyrus's first year as ruler of Babylon." & linefeed & "Allowed the Jews to return and rebuild the temple." & linefeed & "Focus: temple restoration, not the full city.")
		set presenter notes of slide 29 to "538 BC (v2 audit — the old slide said 537; scholarly consensus puts Babylon's fall at 12 October 539 BC and Cyrus's first regnal year over Babylon at 538). Fulfills Isaiah 44:28. Temple-focused — it does not authorize restoring the city and civil state, which is why it cannot start the 70-weeks clock."

		-- ============ slide 15: Stoner attribution ============
		set presenter notes of slide 15 to "Attribution (v2 audit): Peter W. Stoner, chairman of mathematics, Pasadena City College / Westmont — Science Speaks (Moody Press, 1958), ch. 3: the odds of one man fulfilling just 8 of the messianic prophecies by chance ≈ 1 in 10^17. The Texas illustration: 10^17 silver dollars cover Texas two feet deep; mark one, stir, blindfold a man — one try. The American Scientific Affiliation reviewed the book and called the probability PRINCIPLES sound — note: it endorsed the method, not each input estimate. If a skeptic says 'those probabilities are made up': AGREE the inputs are estimates, then pivot — discount them by ten orders of magnitude and the cumulative improbability is still staggering. Don't die on the exact exponent. Then the historical anchors: Josephus, Tacitus, Pliny the Younger — non-Christian ancient historians attesting Jesus as a real, executed figure."

		-- ============ migrated prophecies — insert Babylon, Egypt, Tyre after slide 11 ============
		set pBab to make new slide at after slide 11 with properties {base slide:master slide "Title & Bullets"}
		tell pBab
			set object text of default title item to "Details — Babylon"
			set object text of default body item to "\"And Babylon, the glory of kingdoms… shall be as when God overthrew Sodom and Gomorrah. It shall never be inhabited… neither shall the Arabian pitch tent there.\" — Isaiah 13:19-20 (KJV)" & linefeed & "\"And they shall not take of thee a stone for a corner, nor a stone for foundations; but thou shalt be desolate for ever.\" — Jeremiah 51:26 (KJV)" & linefeed & "The greatest city of its age has lain an uninhabited ruin for ~2,000 years."
			set presenter notes to "Babylon declined gradually and was abandoned — a ruin field for two millennia. HANDLE SADDAM HEAD-ON (v2 audit): Saddam Hussein restored portions of Nebuchadnezzar's palace (1980s, new bricks stamped with his own name) and built a palace OVERLOOKING the site — a monument and tourist site, NOT a repopulated city. The narrow claim holds: never re-inhabited as a living city. Do NOT say 'no one has ever set foot there' — tourists visit, and the modern Hillah area is nearby. The prophecy's precision is 'never INHABITED' — and that has held for 2,000 years."
		end tell
		set pEgy to make new slide at after slide 11 with properties {base slide:master slide "Title & Bullets"}
		tell pEgy
			set object text of default title item to "Details — Egypt"
			set object text of default body item to "\"…they shall be there a base kingdom. It shall be the basest of the kingdoms; neither shall it exalt itself any more above the nations: for I will diminish them, that they shall no more rule over the nations.\" — Ezekiel 29:14-15 (KJV)" & linefeed & "Egypt — a superpower for 2,000 years before Ezekiel — fell to Babylon, Persia, Greece, Rome… and has not ruled the nations since."
			set presenter notes to "The strength here is RESTRAINT — falsifiability in reverse (v2 audit). A forger would predict total destruction; this prophecy predicts survival WITHOUT dominance: 'a base kingdom… shall no more rule over the nations.' After Nebuchadnezzar's invasions Egypt never regained superpower status: Persia took it (Cambyses, 525 BC), then a GREEK dynasty (the Ptolemies — the 30th was the last native dynasty), then Rome, then Arab, Ottoman, and European powers. Twenty-five centuries — still a nation, never again an empire. Every year it remains so, the prophecy keeps passing its test."
		end tell
		set pTyre to make new slide at after slide 11 with properties {base slide:master slide "Title & Bullets"}
		tell pTyre
			set object text of default title item to "Details — Tyre"
			set object text of default body item to "\"They shall destroy the walls of Tyrus… I will also scrape her dust from her, and make her like the top of a rock… a place to spread nets… thou shalt be built no more.\" — Ezekiel 26:4-5, 14 (KJV)" & linefeed & "Nebuchadnezzar took the mainland city (573 BC). Alexander scraped its rubble into the sea to build his causeway and storm the island (332 BC — Diodorus 17.40)." & linefeed & "The ancient site lies bare rock; fishermen spread nets there still."
			set presenter notes to "Lead with the CAUSEWAY — the most striking and least controvertible detail, citable to the named historian Diodorus Siculus (17.40): Alexander used Old Tyre's stones and dust to build a ~0.8 km mole — literally 'scrape her dust from her.' CONCEDE BEFORE ASKED (v2 audit): a town named Tyre (Sour, Lebanon) exists nearby today; the prophecy's target is the original walled site, which was scraped bare and never rebuilt AS a city on that rock. Say 'the original Tyre was never rebuilt on its site' — not 'no town named Tyre exists.'"
		end tell

		-- ============ slide 11: Cyrus details — defensible framing ============
		my replaceText(slide 11 of theDoc, "150 years", "Names him directly: \"Cyrus… My shepherd… My anointed.\"" & linefeed & "Predicts he would free the captives and order Jerusalem rebuilt." & linefeed & "Fulfilled when Cyrus issued the decree in 538 BC (Ezra 1:1-4)." & linefeed & "The text stakes its own case on prediction: \"Declaring the end from the beginning\" (Isaiah 46:9-10).")
		set presenter notes of slide 11 to "FRAMING (v2 audit — this was the most attackable claim in the deck): Isaiah ben Amoz ministered c. 740-680 BC; Cyrus decreed in 538 BC — IF the eighth-century prophet wrote it, the naming is ~150 years early. KNOW THE OBJECTION: critical scholarship assigns Isaiah 40-66 to an anonymous exilic author (c. 540 BC, 'deutero-Isaiah'), making the 'prediction' contemporary. DO NOT rebut with the Great Isaiah Scroll — it dates to ~125 BC, AFTER Cyrus, and proves only that the text predates Christ, not Cyrus; a sharp skeptic will expose that logical error instantly. The honest, strong move: Isaiah 41-48 stakes God's ENTIRE case on predictive prophecy — 'declare the things to come… that we may know ye are gods' (41:21-23), 'declaring the end from the beginning' (46:9-10) — and naming Cyrus is the climax of that argument. The text claims to be prediction; the heavyweight TESTABLE cases come next — Daniel's manuscripts physically predate the fulfillments. (Color, cite as Josephus's report: Antiquities 11.1.1-2 says Cyrus read his own name in Isaiah and 'an earnest desire seized upon him' to fulfill it.)"

		-- ============ slide 2: recap rewritten for the new Night 1 ============
		my replaceText(slide 2 of theDoc, "Discussed Truth", "Night 1 — relative truth collapses under real evil; a true standard must come from OUTSIDE us" & linefeed & "Five criteria: consistent record · above human origins · practical · universal · benevolent" & linefeed & "The candidate: the Bible — a reliable record (manuscripts, archaeology)" & linefeed & "The wager: if a source met all five — would you follow it?" & linefeed & "Tonight: criterion 2 — is it ABOVE HUMAN ORIGINS?")
		set presenter notes of slide 2 to "Recap Night 1 briskly: truth is either relative or absolute; relativism failed its own tests (tolerance, progress, autonomy all require a standard); external standards are how we anchor everything else (the kilogram); we proposed FIVE criteria, and the Bible qualified as a testable candidate — reliable text, real places, real people. Then the wager: if a source met all five, would you follow it? Tonight is the criterion no human book should be able to pass: above human origins. One test no author can fake — telling the future, in writing, with dates."

	end tell

	save theDoc
	set finalCount to count of slides of theDoc
	return "DECK2 DONE — slides: " & finalCount
end tell
