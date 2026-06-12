-- build-deck.applescript
-- Fire and Brimstone: The Forgotten Half of the Third Angel's Message
-- 78-slide cloud-of-witnesses support deck. Basic Black theme, 1920x1080.
-- Flat and explicit: one block per slide, no loops.
-- Native masters used: Title (title + event-marker), Section (section + closer),
-- Quote (text item 2 = quote area, text item 1 = attribution). "Big Fact" is
-- never used (broken via AppleScript). Items 3-4 on Quote slides are left untouched.
-- Quote-slide sizing: after setting text item 2, an explicit point size is set by
-- word count (<=45w: master default; 46-120w: 40; 121-200w: 32; 201-280w: 26; >280w: 22).
-- Curly typographic glyphs are used in the string literals to match the source paragraphs.

tell application "Keynote"
	activate
	set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
	tell theDoc

		-- Slide 1: TITLE (the default first slide)
		set base slide of slide 1 to master slide "Title"
		tell slide 1
			set object text of default title item to "FIRE AND BRIMSTONE"
			set object text of default body item to "The Forgotten Half of the Third Angel’s Message · Sabbath, June 13, 2026"
		end tell

		-- Slide 2: SECTION
		set s2 to make new slide at end with properties {base slide:master slide "Section"}
		tell s2
			set object text of default title item to "I. THE FORGOTTEN HALF"
		end tell

		-- Slide 3: QUOTE — GC 440.2 (272w -> 26)
		set s3 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s3
			set object text of text item 2 to "What nation of the New World was in 1798 rising into power, giving promise of strength and greatness, and attracting the attention of the world? The application of the symbol admits of no question. One nation, and only one, meets the specifications of this prophecy; it points unmistakably to the United States of America. Again and again the thought, almost the exact words, of the sacred writer has been unconsciously employed by the orator and the historian in describing the rise and growth of this nation. The beast was seen “coming up out of the earth;” and, according to the translators, the word here rendered “coming up” literally signifies “to grow or spring up as a plant.” And, as we have seen, the nation must arise in territory previously unoccupied. A prominent writer, describing the rise of the United States, speaks of “the mystery of her coming forth from vacancy,” and says: “Like a silent seed we grew into empire.”—G. A. Townsend, The New World Compared With the Old, page 462. A European journal in 1850 spoke of the United States as a wonderful empire, which was “emerging,” and “amid the silence of the earth daily adding to its power and pride.”—The Dublin Nation. Edward Everett, in an oration on 441 the Pilgrim founders of this nation, said: “Did they look for a retired spot, inoffensive for its obscurity, and safe in its remoteness, where the little church of Leyden might enjoy the freedom of conscience? Behold the mighty regions over which, in peaceful conquest, ... they have borne the banners of the cross!”—Speech delivered at Plymouth, Massachusetts, Dec. 22, 1824, page 11."
			set size of object text of text item 2 to 26
			set object text of text item 1 to "— Ellen G. White, The Great Controversy · 1888/1911"
		end tell

		-- Slide 4: QUOTE — GC 442.2 (154w -> 32)
		set s4 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s4
			set object text of text item 2 to "Such action would be directly contrary to the principles of this government, to the genius of its free institutions, to the direct and solemn avowals of the Declaration of Independence, and to the Constitution. The founders of the nation wisely sought to guard against the employment of secular power on the part of the church, with its inevitable result—intolerance and persecution. The Constitution provides that “Congress shall make no law respecting an establishment of religion, or prohibiting the free exercise thereof,” and that “no religious test shall ever be required as a qualification to any office or public trust under the United States.” Only in flagrant violation of these safeguards to the nation’s liberty, can any religious observance be enforced by civil authority. But the inconsistency of such action is no greater than is represented in the symbol. It is the beast with lamblike horns—in profession pure, gentle, and harmless—that speaks as a dragon."
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— Ellen G. White, The Great Controversy · 1888/1911"
		end tell

		-- Slide 5: QUOTE — GC 579.1 (111w -> 40)
		set s5 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s5
			set object text of text item 2 to "Since the middle of the nineteenth century, students of prophecy in the United States have presented this testimony to the world. In the events now taking place is seen a rapid advance toward the fulfillment of the prediction. With Protestant teachers there is the same claim of divine authority for Sundaykeeping, and the same lack of Scriptural evidence, as with the papal leaders who fabricated miracles to supply the place of a command from God. The assertion that God’s judgments are visited upon men for their violation of the 580 Sunday-sabbath, will be repeated; already it is beginning to be urged. And a movement to enforce Sunday observance is fast gaining ground."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, The Great Controversy · 1888/1911"
		end tell

		-- Slide 6: SECTION
		set s6 to make new slide at end with properties {base slide:master slide "Section"}
		tell s6
			set object text of default title item to "II. WHAT IS A TRUMPET?"
		end tell

		-- Slide 7: QUOTE — PREX2 132.3 (27w -> default)
		set s7 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s7
			set object text of text item 2 to "The sounding of the seven trumpets I understand to shadow forth the instrumentalities by which the Roman empire was to be overthrown and subverted, and finally ruined."
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 8: QUOTE — SSP 145.1 (240w -> 26) LONG
		set s8 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s8
			set object text of text item 2 to "The prophet on Patmos was given a threefold view of events which would take place between the time in which he lived, and the time when the redeemed gather about the throne. The messages to the seven churches are ecclesiastical history, showing the spread of the religion of Jesus Christ, and the errors which crept in. The seven seals reveal the inner workings of the church,-the individual experience-and foretell the signs of Christ’s coming. In the messages to the churches, Christ was seen as the Light walking in their midst: in the seals, He is the Lamb who was slain that man might live. Another phase of history, not wholly national, but having to do with nations, is revealed in the sounding of the trumpets. The sounding of the seven trumpets extends to the close of the eleventh chapter, the seventh trumpet carrying history into eternity, like the seventh church and the seventh seal. The work of the trumpets is first introduced to John in the second verse of chapter eight. Seven angels stood before God, “and to them were given seven trumpets.” The trumpet, or bugle sound, is the call to war; and the history of the trumpets is one long story of war and bloodshed, but in order that men might learn that the hand of God is overruling in every army, and that He guides in every war, the story of the trumpets is left on record."
			set size of object text of text item 2 to 26
			set object text of text item 1 to "— S.N. Haskell, The Story of the Seer of Patmos · 1905"
		end tell

		-- Slide 9: SECTION
		set s9 to make new slide at end with properties {base slide:master slide "Section"}
		tell s9
			set object text of default title item to "III. THE FIRST FOUR TRUMPETS"
		end tell

		-- Slide 10: EVENT — Trumpet 1
		set s10 to make new slide at end with properties {base slide:master slide "Title"}
		tell s10
			set object text of default title item to "TRUMPET 1 — THE GOTHS UNDER ALARIC"
			set object text of default body item to "ROME SACKED A.D. 410"
		end tell

		-- Slide 11: QUOTE — PREX2 134.2 (57w -> 40)
		set s11 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s11
			set object text of text item 2 to "The first sore and heavy judgment which fell on western Rome in its downward course, was the war with the Goths under Alaric, styled by himself “the scourge of God.” After the death of Theodosius, the Roman emperor, in January, 395, before the end of the winter, the Goths, under Alaric, were in arms against the empire."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 12: QUOTE — SSTR 9.1 (37w -> default)
		set s12 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s12
			set object text of text item 2 to "After this invasion of the empire by Radagaisus, Alaric again returned, invaded Italy in 408, and in 410 he besieged, took, and sacked Rome, and died the same year. In 412 the Goths voluntarily retired from Italy."
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 13: EVENT — Trumpet 2
		set s13 to make new slide at end with properties {base slide:master slide "Title"}
		tell s13
			set object text of default title item to "TRUMPET 2 — GENSERIC & THE VANDAL FLEET"
			set object text of default body item to "A.D. 428-468"
		end tell

		-- Slide 14: QUOTE — SSTR 11.3 (96w -> 40)
		set s14 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s14
			set object text of text item 2 to "The history illustrative of the sounding of this trumpet has been given so fully in the first chapter of this volume, that it will be unnecessary to repeat it here. The reader will find it at large in the exposition of Daniel 11:30. It relates to the invasion and conquest of Africa, and afterward of Italy, by the terrible Genseric. His conquests were for the most part naval, and his triumphs were “as it were a great mountain burning with fire, cast into the sea.” The repetition of one or two extracts from Gibbon must suffice:"
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 15: QUOTE — PREX2 70.1 (174w -> 32) LONG
		set s15 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s15
			set object text of text item 2 to "The Roman governor of Africa having revolted from the emperor in 427, and finding himself in need of assistance, he “despatched a trusty friend to the court, or rather camp, of Gonderic, king of the Vandals, with a proposal of a strict alliance, and the offer of an advantageous and perpetual settlement. The vessels which the Vandals found in the harbor of Carthagena might easily transport them to the isles of Majorca or Minorca, where the Spanish fugitives, as in a secure recess, had vainly concealed their families and their fortunes. The experience of navigation, and, perhaps, the prospect, encouraged the Vandals to accept the invitation which they received from Count Boniface; and the death of Gonderic served only to forward and animate the bold enterprise. In the room of a prince, not conspicuous for any superior powers of the mind or the body, they acquired his bastard brother, the terrible Genseric; a name which, in the destruction of the roman empire, has deserved an equal rank with the names of alaric and attila.”—[Ibid.]"
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 16: EVENT — Trumpet 3
		set s16 to make new slide at end with properties {base slide:master slide "Title"}
		tell s16
			set object text of default title item to "TRUMPET 3 — ATTILA THE HUN, “THE SCOURGE OF GOD”"
			set object text of default body item to "A.D. 433-453"
		end tell

		-- Slide 17: QUOTE — PREX2 148.2 (27w -> default)
		set s17 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s17
			set object text of text item 2 to "“There fell a great star from heaven. The name of Attila is to this day a memorial of his greatness, of which a brief description may suffice."
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 18: QUOTE — SSP 155.2 (341w -> 22) LONG
		set s18 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s18
			set object text of text item 2 to "But the end was not yet. “The third angel sounded, and there fell a great star from heaven, burning as it were a lamp.” For nearly one hundred years previous to the final downfall of Rome, the Huns, one of the wildest of the Scythian tribes, had pressed upon the empire, spreading themselves from the Volga to the Danube. For a time they commanded the alternative of peace or war, with both the eastern and western divisions of the empire. In the days of Ætius, a general of the West, sixty thousand Huns marched to the confines of Italy; but retreated when paid the sum which they cared to demand. Theodosius, the emperor of the East, bought peace by paying an annual tribute of three hundred and fifty pounds of gold, and bestowing the title of general upon the king of the Huns. There was still a senate at Rome, and it purchased peace of the Huns. This was a part of the “wormwood” which Rome was caused to drink. In 433 Attila and his brother became joint rulers of the barbarians, and in a treaty with the emperor, the Huns “dictated the conditions of peace; each condition was an insult on the majesty of the empire. Besides the freedom of a safe and plentiful market on the banks of the Danube, they required that the annual contribution should be augmented from three hundred and fifty pounds of gold to seven hundred pounds of gold; that a fine, or ransom, of eight pieces of gold should be paid for every Roman captive who had escaped from his barbarian master; that the emperor should renounce all treaties and engagements with the enemies of the Huns; and that all the fugitives who had taken refuge in the court, or provinces of Theodosius, should be delivered to the justice of their offended sovereign.” Thus was the Roman Empire made to realize that its power was gone, and that the proud Romans were subject to the most cruel of all barbarians. This was “wormwood” indeed."
			set size of object text of text item 2 to 22
			set object text of text item 1 to "— S.N. Haskell, The Story of the Seer of Patmos · 1905"
		end tell

		-- Slide 19: EVENT — Trumpet 4
		set s19 to make new slide at end with properties {base slide:master slide "Title"}
		tell s19
			set object text of default title item to "TRUMPET 4 — THE WESTERN EMPIRE EXTINGUISHED"
			set object text of default body item to "A.D. 476"
		end tell

		-- Slide 20: QUOTE — PREX2 157.1 (158w -> 32) LONG
		set s20 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s20
			set object text of text item 2 to "“The power and the glory of Rome, as bearing rule over any nation, became extinct. The name alone remained to the queen of nations. Every token, of royalty disappeared from the imperial city. She who had ruled over the nations sat in the dust, like a second Babylon, and there was no throne, where the Cæsars had reigned. The last act of obedience to a Roman prince, which that once august assembly performed, was the acceptance of the resignation of the last emperor of the West, and the abolition of the imperial succession in Italy. The sun of Rome was smitten. But though Rome itself, as an imperial city, ceased to exercise a sovereignty over any nation, yet the imperial ensigns, with the sacred ornaments of the throne and palace, were transferred to Constantinople, where Zeno reigned, under the title of sole emperor. The military acclamations of the confederates of Italy saluted Odoacer with the title of king."
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 21: QUOTE — SSP 158.1 (64w -> 40)
		set s21 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s21
			set object text of text item 2 to "“The fourth angel sounded, and the third part of the sun was smitten, and the third part of the moon, and the third part of the stars.” The prophetic history given under the fourth trumpet, represents the dense darkness that would exist if the sun, moon, and stars all refused to emit light. Its fulfillment was the extinction of the light of Western Rome."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— S.N. Haskell, The Story of the Seer of Patmos · 1905"
		end tell

		-- Slide 22: SECTION
		set s22 to make new slide at end with properties {base slide:master slide "Section"}
		tell s22
			set object text of default title item to "IV. THE FIRST WOE — THE FIFTH TRUMPET"
		end tell

		-- Slide 23: QUOTE — SSTR 30.3 (73w -> 40)
		set s23 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s23
			set object text of text item 2 to "“There is scarcely so uniform an agreement among interpreters concerning any part of the apocalypse as respecting the application of the fifth and sixth trumpets, or the first and second wo, to the Saracens and Turks. It is so obvious that it can scarcely be misunderstood. Instead of a ‘verse of two designating each, the whole of the ninth chapter of the Revelation, in equal portions, is occupied with a description of both."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 24: QUOTE — PREX2 168.2 (118w -> 40)
		set s24 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s24
			set object text of text item 2 to "“And there arose a smoke out of the pit, as the smoke of a great furnace, and the sun and the air were darkened by reason of the smoke of the pit. Like the noxious and even deadly vapor which the winds, particularly from the south-west, diffuse in Arabia, Mahometanism spread from thence its pestilential influence-and arose as suddenly, and spread as widely, as smoke arising out of the pit, the smoke of a great furnace. Such is a suitable symbol of the religion of Mahomet, of itself, or as compared with the pure light of the gospel of Jesus. It was not, like the latter, a light from heaven; but a smoke out of the bottomless pit."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 25: QUOTE — DAR 472.2 (131w -> 32)
		set s25 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s25
			set object text of text item 2 to "The Bottomless Pit. — The meaning of this term may be learned from the Greek ἄβυσσος, which is defined “deep, bottomless, profound,” and may refer to any waste, desolate, and uncultivated place. It is applied to the earth in its original state of chaos. Genesis 1:2. In this instance it may appropriately refer to the unknown wastes of the Arabian desert, from the borders of which issued the hordes of Saracens, like swarms of locusts. And the fall of Chosroes, the Persian king, may well be represented as the opening of the bottomless pit, inasmuch as it prepared the way for the followers of Mohammed to issue from their obscure country, and propagate their delusive doctrines with fire and sword, till they had spread their darkness over all the Eastern empire."
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— Uriah Smith, Daniel and the Revelation · 1897 ed."
		end tell

		-- Slide 26: QUOTE — SSTR 38.2 (97w -> 40) [stripped inline "39"]
		set s26 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s26
			set object text of text item 2 to "“A false religion was set up, which, although the scourge of transgressions and idolatry, filled the world with darkness and delusion; and swarms of Saracens, like locusts, overspread the earth, and speedily extended their ravages over the Roman empire, from east to west. The hail descended from the frozen shores of the Baltic; the burning mountain fell upon the sea, from Africa: and the locusts (the fit symbol of Arabs) issued from Arabia, their native region. They came, as destroyers, propagating a new doctrine, and stirred up to rapine and violence by motives of interest and religion."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 27: QUOTE — SSP 165.1 (147w -> 32)
		set s27 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s27
			set object text of text item 2 to "This same characteristic is emphasized in the symbols used throughout the history. “There came out of the smoke locusts upon the earth.” The Saracens themselves are called locusts by the prophet John, and the doctrine which impelled their actions was as a dense smoke, issuing out of a furnace. The work of these locust-like warriors is described in the eighth plague, sent upon the land of Egypt in the days when Pharaoh refused to let Israel go. “I will bring the locusts into thy coast: and they shall cover the face of the earth, that one cannot be able to see the earth: and they shall eat the residue of that which is escaped, ...and shall eat every tree which groweth for you out of the field: and they shall fill thy houses, and the houses of all thy servants, and the houses of all the Egyptians.”"
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— S.N. Haskell, The Story of the Seer of Patmos · 1905"
		end tell

		-- Slide 28: EVENT — First woe measured
		set s28 to make new slide at end with properties {base slide:master slide "Title"}
		tell s28
			set object text of default title item to "THE FIRST WOE MEASURED"
			set object text of default body item to "JULY 27, 1299 → 1449"
		end tell

		-- Slide 29: QUOTE — SSTR 49.5 (116w -> 40)
		set s29 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s29
			set object text of text item 2 to "“And their power was to torment men five months.” Thus far their commission extended, to torment, by constant depredations, but not politically to kill them. “Five months;” that is, one hundred and fifty years. Commencing July 27th, 1299, the one hundred and fifty years reach to 1449. During that whole period the Turks were engaged in an almost perpetual war with the Greek empire, but yet without conquering it. They seized upon and held several of the Greek provinces, but still Greek independence was maintained in Constantinople. But in 1449, the termination of the one hundred and fifty years, a change came. Before presenting the history of that change, however, we will look at verses 12-15."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 30: QUOTE — GSAM 128.2 (125w -> 32)
		set s30 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s30
			set object text of text item 2 to "The fifth trumpet presents the rise of Mohammedanism with its cloud of errors, but especially the period of “five months,” or one hundred and fifty literal years from the time they “had a king over them.” July 27, 1299, Othman, the founder of the Ottoman empire, invaded the territory of Nicomedia. From that time the Ottomans harassed and “tormented” the Eastern empire of Rome till July 27, 1449, the one hundred and fifty years of the sounding of the fifth trumpet. At that time the Turks came with their forces against the city of Constantinople itself, using gunpowder in their warfare; and from a ponderous cannon, which the historian Gibbon says required sixty oxen to draw, they fired great rocks against the walls of Constantinople."
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— J.N. Loughborough, The Great Second Advent Movement · 1905"
		end tell

		-- Slide 31: QUOTE — SSTR 47.5 (74w -> 40)
		set s31 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s31
			set object text of text item 2 to "1. “They had a king over them.” From the death of Mahomet until near the close of the 13th century, the Mahometans were divided into various factions, under several leaders, with no general civil government extending over them all. Near the close of the 13th century, Othman founded a government, which has since been known as the Ottoman government, or empire, extending over all the principal Mahometan tribes, consolidating them into one grand monarchy."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 32: QUOTE — PREX2 180.1 (61w -> 40)
		set s32 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s32
			set object text of text item 2 to "3. His name. In Hebrew, “Abaddon,” the destroyer; in Greek, “Apollyon,” one that exterminates or destroys. Having two different names in the two languages, it is evident that the character, rather than the name of the power, is intended to be represented. If so, in both languages he is a destroyer. Such has always been the character of the Ottoman government."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 33: SECTION
		set s33 to make new slide at end with properties {base slide:master slide "Section"}
		tell s33
			set object text of default title item to "V. THE SECOND WOE — THE SIXTH TRUMPET"
		end tell

		-- Slide 34: EVENT — Second woe loosed
		set s34 to make new slide at end with properties {base slide:master slide "Title"}
		tell s34
			set object text of default title item to "THE SECOND WOE LOOSED"
			set object text of default body item to "JULY 27, 1449"
		end tell

		-- Slide 35: QUOTE — SSTR 50.5 (119w -> 40)
		set s35 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s35
			set object text of text item 2 to "The first woe was to continue from the rise of Mahometanism until the end of the five months. Then the first woe was to end, and the second begin. And when the sixth angel sounded, it was commanded to take off the restraints which had been imposed on the nation, by which they were restricted to the work of tormenting men, and their commission extended to slay the third part of men. This command came from the four horns of the golden alter which is before God. “The four angels,” are the four principal sultanies of which the Ottoman empire is composed, located in the country of the Euphrates. They had been restrained; God commanded, and they were loosed."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 36: QUOTE — GSAM 128.3 (117w -> 40) [stripped inline "129"]
		set s36 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s36
			set object text of text item 2 to "About this time John Palleologus, who is set down by historians as the last Greek emperor, died. Constantine Decozes was the rightful heir to the throne, but it is said that his fears of Amurath, the Turkish sultan, who was waging this warfare against him, led him to ask permission of Amurath to ascend the throne. Such an act would almost seem a resignation of the throne to the Turks. In fact, very shortly the Ottomans had possession of the city of Constantinople and the Eastern empire of Rome. Thus they (politically) “killed” that empire which they had before “tormented.” They were to “slay” it for “an hour, and a day, and a month, and a year.”"
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— J.N. Loughborough, The Great Second Advent Movement · 1905"
		end tell

		-- Slide 37: QUOTE — PREX2 183.1 (43w -> default)
		set s37 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s37
			set object text of text item 2 to "The four angels were loosed for an hour, a day, a month, and a year, to slay the third part of men. This period amounts to three hundred and ninety-one years and fifteen days; during which Ottoman supremacy was to exist in Constantinople."
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 38: EVENT — Constantinople falls
		set s38 to make new slide at end with properties {base slide:master slide "Title"}
		tell s38
			set object text of default title item to "CONSTANTINOPLE FALLS"
			set object text of default body item to "A.D. 1453"
		end tell

		-- Slide 39: QUOTE — SSTR 51.4 (125w -> 32)
		set s39 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s39
			set object text of text item 2 to "But, although the four angels were thus loosed by the voluntary submission of the Greeks, yet another doom awaited the seat of empire. Amurath, the sultan to whom the submission of Deacozes was made, and by whose permission he reigned in Constantinople, soon after died, and was succeeded in the empire, in 1451, by Mahomet II., who set his heart on Constantinople, and determined to make it a prey. He accordingly made preparations for besieging and taking the city. The siege commenced on the 6th of April, 1453, and ended in the taking of the city, and death of the last of the Constantines, on the 16th day of May following. And the eastern 52 city of the Caesars became the seat of the Ottoman empire."
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 40: QUOTE — SSTR 56.1 (40w -> default)
		set s40 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s40
			set object text of text item 2 to "This historical sketch from Gibbon, of the use of gunpowder, fire-arms and cannon, as the instrumentality 57 by which the city was finally overcome is so illustrative of the text, that one can hardly imagine any other scene can be described."
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 41: QUOTE — MWV2 122.1 (353w -> 22) LONG
		set s41 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s41
			set object text of text item 2 to "17th verse: “And thus I saw the horses in the vision, and them that sat on them, having breastplates of fire, and of jacinth and brimstone; and the heads of the horses were as the heads of lions, and out of their mouths issued fire, and smoke, and brimstone.” 18th verse, “By these three was the third part of men killed, by the fire, and by the smoke, and by the brimstone, which issued out of their mouths.” 19th verse, “For their power is in their mouth, and in their tails; for their tails were like unto serpents, and had heads, and with them they do hurt.” In these verses which we have now read, we are plainly informed that it was an army of horses, and men on them, which John saw in the vision. And the implements and manner of fighting, such as the trapping of their horses, and the instruments offensive and defensive, gun powder and guns, are as exactly described as any person could describe it without knowing the name by which we describe it at the present day. Fire, smoke, and brimstone, would be the most visible component parts of gunpowder. Fire and smoke we should see, and brimstone we should smell. And who ever saw an army of horsemen engaged in an action but would think of John’s description, “out of their mouths issued fire, and smoke, and brimstone,” and in the breech of the guns were bullets, “like heads, and with these they do hurt”? Every part of this description is exactly applicable to an army of horsemen with fire-arms; and what is equally strong in the evidence is, that guns and fire-arms were invented but a short time previous to this trump-sounding, and the Turks claimed the honor (if honor it can be called) of inventing gun powder and guns: and it is equally evident by the history that guns were first used by the Turks at the taking of Constantinople, they having one single cannon that took 70 yoke of oxen to draw it at the siege, as says Dr. Gill on this passage."
			set size of object text of text item 2 to 22
			set object text of text item 1 to "— William Miller, Miller’s Works, vol. 2 · 1842"
		end tell

		-- Slide 42: QUOTE — MWV2 123.1 (378w -> 22) LONG
		set s42 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s42
			set object text of text item 2 to "20th verse, “And the rest of the men which were not killed by these plagues yet repented not of the works of their hands, that they should not worship devils, and idols of gold, and silver, and brass, and stone, and of wood, which neither can see, nor hear, nor walk.” 21st verse, “Neither repented they of their murders, nor of their sorceries, nor of their fornication, nor of their thefts.” In these verses, we have the character of the persons or government on whose account these plagues were sent. In the first place, they are represented as idolaters, as worshipping devils, idols of gold, etc., full of murder, sorceries, fornication, and theft. This exactly agrees with the description John has given of the “woman sitting on the scarlet-colored beast, full of names of blasphemy, having seven heads and ten horns. And the woman was arrayed in purple and scarlet color, and decked with gold, and precious stones, and pearls, having a golden cup in her hand full of abominations and filthiness of her fornication. And upon her forehead was a name written, Mystery, Babylon the Great, the Mother of Harlots,and the abominations of the earth.” So we see that the fifth and sixth trumpets, and the two first woes, were sent as the judgments of God upon this anti-Christian beast, and clearly shows the decline of the power which she had exercised over the kings of the earth and the people of God for more than eight centuries, to the commencing of the sixth trumpet, when the Turks were let loose upon those kingdoms under the control of Papacy, conquered all Asia and about one third part of Europe, and were in the end the means of opening the eyes of many of the inhabitants of the world to see that the Pope’s pretension of being the vicegerent of God was not well founded; for, if he could not foresee and resist the inroads of the Turks,—that infidel nation,—surely he could not perform those great miracle which he pretended to perform in order to support his ecclesiastical and civil power: and individuals, and afterward nations, began to disregard his authority, excommunications, and bulls, until his power is now but a little more than a bishop of Rome."
			set size of object text of text item 2 to 22
			set object text of text item 1 to "— William Miller, Miller’s Works, vol. 2 · 1842"
		end tell

		-- Slide 43: QUOTE — SSP 180.1 (154w -> 32)
		set s43 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s43
			set object text of text item 2 to "The prophet John watched the sounding of the sixth trumpet, and saw the woes and terrors of national strife, and the darkening of the earth by the smoke from the “bottomless pit.” He saw men buried beneath the weight of their own sins, and although the Son of God was waiting, like the father of the prodigal son, for the return of the sinful, yet they repented not of their murders and sorceries, their fornications and thefts. Justice and mercy are inseparably mingled in the dealings of God with man, and great woes call forth from Jehovah a great overflowing of His love. So when the world lay in darkness, unmindful of the voice of God which they might have heard in the very din of battle or the councils of nations, there came to the world a most thrilling message. John heard this message before seeing the further events of the third woe."
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— S.N. Haskell, The Story of the Seer of Patmos · 1905"
		end tell

		-- Slide 44: SECTION
		set s44 to make new slide at end with properties {base slide:master slide "Section"}
		tell s44
			set object text of default title item to "VI. AUGUST 11, 1840 — FULFILLED TO THE DAY"
		end tell

		-- Slide 45: QUOTE — PREX2 189.1 (101w -> 40)
		set s45 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s45
			set object text of text item 2 to "Commencing when, the one hundred and fifty years ended, in 1449, the period would end August 11th, 1840. Judging from the manner of the commencement of the Ottoman supremacy, that it was by a voluntary acknowledgment on the part of the Greek emperor that he only reigned by permission of the Turkish sultan, we should naturally conclude that the fall or departure of the Ottoman independence would be brought about in the same way; that at the end of the specified period, the Sultan would voluntarily surrender his independence into the hands of the Christian powers, from whom he received it."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 46: QUOTE — GSAM 129.2 (90w -> 40)
		set s46 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s46
			set object text of text item 2 to "In 1838 Dr. Josiah Litch, of Philadelphia, Pa., having embraced the truth set forth by William Miller, united in the work of giving greater publicity to the message. He prepared articles for the public print on the subject of the seven trumpets of the Revelation. He took the unqualified position that the sixth trumpet would cease to sound and the Ottoman power fall on the 11th day of August, 1840, and that that would demonstrate to the world that a day in symbolic prophecy represents a year of literal time."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— J.N. Loughborough, The Great Second Advent Movement · 1905"
		end tell

		-- Slide 47: EVENT — Ultimatum to Mehemet Ali
		set s47 to make new slide at end with properties {base slide:master slide "Title"}
		tell s47
			set object text of default title item to "AUGUST 11, 1840"
			set object text of default body item to "THE ULTIMATUM HANDED TO MEHEMET ALI"
		end tell

		-- Slide 48: QUOTE — SSTR 65.1 (34w -> default)
		set s48 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s48
			set object text of text item 2 to "According to the foregoing statement, the ultimatum was officially put into the power of Mehemet Ali, and was disposed of by his orders, viz., sent to quarantine, on the ELEVENTH DAY OF AUGUST, 1840."
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 49: QUOTE — GSAM 131.3 (129w -> 32) LONG
		set s49 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s49
			set object text of text item 2 to "“The sultan dispatched Rifat Bey on a government steamer to Alexandria, to communicate the ultimatum to the pasha. It was put into his hands, and by him taken in charge, on the eleventh day of August, 1840! On the same day a note was addressed by the sultan to the embassadors of the four powers, inquiring what plan was to be adopted in case the pasha should refuse to comply with the terms of the ultimatum; to which they made answer that provision had been made, and there was no necessity of his alarming himself about any contingency that might arise. This day the period of three hundred ninety-one years and fifteen days allotted to the continuance of the Ottoman power ended; and where was the sultan’s independence?- Gone!”"
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— J.N. Loughborough, The Great Second Advent Movement · 1905"
		end tell

		-- Slide 50: QUOTE — SSTR 58.2 / Goodell (159w -> 32)
		set s50 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s50
			set object text of text item 2 to "“The power of Islamism is broken forever; and there is no concealing the fact even from themselves. They exist now by mere sufferance. And though there is a mighty effort made by the Christian governments to sustain them, yet at every step they sink lower and lower with fearful velocity. And though there is a great endeavor made to graft the institutions of civilized and Christian countries upon the decayed trunk, yet the very root itself is fast wasting away by the venom of its own poison. How wonderful it is, that, when all Christendom combined together to check the progress of Mahometan power, it waxed exceedingly great in spite of every opposition; and now, when all the mighty potentates of Christian Europe, who feel fully competent to settle all the quarrels and arrange all the affairs of the whole world, are leagued together for its protection and defence, down it comes, in spite of all their fostering care.”"
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— Goodell, quoted in James White, The Sounding of the Seven Trumpets · 1859"
		end tell

		-- Slide 51: QUOTE — GC 335.1 (93w -> 40)
		set s51 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s51
			set object text of text item 2 to "At the very time specified, Turkey, through her ambassadors, accepted the protection of the allied powers of Europe, and thus placed herself under the control of Christian nations. The event exactly fulfilled the prediction. (See Appendix.) When it became known, multitudes were convinced of the correctness of the principles of prophetic interpretation adopted by Miller and his associates, and a wonderful impetus was given to the advent movement. Men of learning and position united with Miller, both in preaching and in publishing his views, and from 1840 to 1844 the work rapidly extended."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, The Great Controversy · 1888/1911"
		end tell

		-- Slide 52: QUOTE — PREX2 199.1 (189w -> 32) [preserve "we/wo"]
		set s52 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s52
			set object text of text item 2 to "Then the second wo is past, and the sixth trumpet has ceased its sounding; and the conclusion is now inevitable, because the word of God affirms the fact in so many words, “Behold, the third wo cometh quickly” And “in the days of the voice of the seventh angel, when he shall begin to sound, the mystery of God shall be finished.” But what will take place when the seventh angel sounds? I answer, Great voices will be heard in heaven, saying, “The kingdoms of this world have become the kingdoms of our Lord and his Christ, and he shall reign forever and ever.” Nor is this event a mere spiritual reign over the kingdoms of this world; but the Revelator goes on to say, “and thy wrath is come, and the time of the dead, that they should be judged; and that thou shouldest give reward unto thy servants the prophets, the saints, and them that fear thy name, small and great, and shouldest destroy them that destroy the earth.” This, then, is the consummation, when every one shall receive his retribution, according to what he has done."
			set size of object text of text item 2 to 32
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 53: QUOTE — AJB 259.3 (47w -> 40)
		set s53 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s53
			set object text of text item 2 to "These astounding facts prove that the prophecy of the sounding of the sixth angel for three hundred and ninety-one years and fifteen days, ended on the 11th day of August, 1840, and at the same time the second woe passed, and behold the third woe cometh quickly."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Joseph Bates, Autobiography of Elder Joseph Bates · 1868"
		end tell

		-- Slide 54: SECTION
		set s54 to make new slide at end with properties {base slide:master slide "Section"}
		tell s54
			set object text of default title item to "VII. THE DAY OF THE LORD"
		end tell

		-- Slide 55: QUOTE — PREX2 230.2 (331w -> 22) LONG [stripped inline "231"]
		set s55 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s55
			set object text of text item 2 to "God punishes nations, as such, by fire, sword, plague, earthquakes, captivity; and the desolation of their land and cities. So he has punished Jerusalem and his church; and so he will punish all the nations of the world which are upon the face of the whole earth. He punished the Jews once by sending them to Babylon; and he punished the kingdom of Babylon for exceeding their commission in afflicting the people of God. He has now given to Jerusalem and the cities of Judah the wine-cup of his fury; and he will give it to all the nations whither his people have been scattered. See Jeremiah 25:15-33. The reader will please turn to the passage if he wishes to have a clear view of God’s purpose of inflicting judgments on the nations of the earth. The individual and personal judgment will be inflicted in the second resurrection. But as all the national crimes of the church, or Jerusalem the metropolis of the church, were to come on the generation of the Jews then alive, when their national ruin came; so all the blood of the saints and righteous men put to death and afflicted by the Gentiles while they have dominion over the church, will come on the generation who live at the great day when God shall make inquisition for blood. Hence, the souls under the altar cried, “O Lord, how long, holy and true, dost thou not judge and avenge our blood on them which dwell on the earth? And it was said unto them that they should rest yet for a little season, until their brethren who should be killed as they were, should be fulfilled.” But the day of reckoning for the nations is coming. “Lo,” says the Lord, (Jeremiah 25.) “I begin to bring evil on the city which is called by my name, and shall ye be utterly unpunished? Ye shall not be unpunished. For I will call for a sword upon all flesh.”"
			set size of object text of text item 2 to 22
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 2 · 1842"
		end tell

		-- Slide 56: QUOTE — HST Feb. 14, 1844 (76w -> 40)
		set s56 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s56
			set object text of text item 2 to "Another and still more appalling scene is to be realized in “the great battle of God Almighty.” It would be most appalling if it were only a war of the ordinary kind. Impassioned and perverted reason and genius make the agents and elements of nature a hundred-fold more murderous than in their ordinary movements they can be. But this scene of strife and blood is to be unlike anything which the world has ever yet seen."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— The Advent Herald, and Signs of the Times Reporter [Himes] · Feb. 14, 1844, p. 14.16"
		end tell

		-- Slide 57: SECTION
		set s57 to make new slide at end with properties {base slide:master slide "Section"}
		tell s57
			set object text of default title item to "VIII. THE THIRD ANGEL’S MESSAGE — BOTH QUESTIONS"
		end tell

		-- Slide 58: QUOTE — TTAM 8.1 (68w -> 40)
		set s58 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s58
			set object text of text item 2 to "This mark is very conspicuous, in the forehead or hand, and signifies not a literal mark, but a prominent profession, that all may see and know. It is the mark of the beast; therefore it is a prominent point of religious faith introduced by the Papal power, which is the observance of the first day of the week as a holy day of rest instead of the seventh."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Third Angel’s Message · c. 1850"
		end tell

		-- Slide 59: QUOTE — DAR 624.3 (91w -> 40)
		set s59 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s59
			set object text of text item 2 to "2. The “mark of the beast” is that institution which this power has set up as proof of its authority to legislate for the church, and command the consciences of men under sin. It consists in a change of the law of God, by which the signature of royalty is taken from the law, — the seventh-day Sabbath, the great memorial of Jehovah’s creative work, is torn from its place in the decalogue, and a false and counterfeit Sabbath, the first day of the week, is set up in its stead."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Uriah Smith, Daniel and the Revelation · 1897 ed."
		end tell

		-- Slide 60: QUOTE — TMR 125.1 (95w -> 40)
		set s60 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s60
			set object text of text item 2 to "2. The prophet Isaiah (chap. 34) describes the final conflagration of our globe in language which is a complete parallel to that of the third angel in describing the punishment of the wicked. Those who contend that Isaiah refers only to ancient Idumea, must admit that the period of time described in this strong language must finally come to an end. And those who admit that Isaiah, in the language we are about to quote, refers to the conflagration of our earth, will find in what follows, ample proof that that scene will finally close."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— J.N. Andrews, The Three Messages of Revelation 14:6-12 · 1872"
		end tell

		-- Slide 61: QUOTE — DAR 631.7 (316w -> 22) LONG [stripped inline "632"]
		set s61 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s61
			set object text of text item 2 to "The Punishment of Beast-worshipers. — These shall be tormented with fire and brimstone in the presence of the holy angels and of the Lamb. When is this torment inflicted? Chapter 19:20 shows that at the second coming of Christ there is a manifestation of fiery judgments which may be called a lake of fire and brimstone, into which the beast and false prophet are cast alive. This can refer only to the destruction visited upon them at the commencement, not at the end, of the thousand years. Again, there is a remarkable passage in Isaiah to which we are obliged to refer in explanation of the phraseology of the threatening of the third angel, and which unquestionably describes scenes to take place here at the second advent, and in the desolate state of the earth during the thousand years following. That the language in the Revelation was borrowed from this prophecy can hardly fail to be seen. After describing the Lord’s anger upon the nations, the great slaughter of their armies, the departing of the heavens as a scroll, etc., the prophet says: “For it is the day of the Lord’s vengeance, and the year of recompenses for the controversy of Zion. And the streams thereof shall be turned into pitch, and the dust thereof into brimstone, and the land thereof shall become burning pitch. It shall not be quenched night nor day; the smoke thereof shall go up forever; from generation to generation it shall lie waste; none shall pass through it forever and ever.” Isaiah 34:8-10. And since it is expressly revealed that there is to be a lake of fire in which all sinners perish at the end of the thousand years, we can only conclude that the destruction of the living wicked at the commencement of this period, and the final doom of all the ungodly at its close, are very similar."
			set size of object text of text item 2 to 22
			set object text of text item 1 to "— Uriah Smith, Daniel and the Revelation · 1897 ed."
		end tell

		-- Slide 62: QUOTE — SSTR 30.2 (37w -> default)
		set s62 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s62
			set object text of text item 2 to "The last three trumpets are each attended with a wo to the inhabiters of the earth. The fifth trumpet is the first woe; the sixth trumpet the second wo; the seventh and last trumpet the third wo."
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 63: QUOTE — TMR 124.1 (48w -> 40)
		set s63 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s63
			set object text of text item 2 to "Such is a brief view of the dread realities of the seven last plagues, - the third woe! How fearful will be the events of that woe! May God count us worthy to escape the things coming on the earth, and to stand before the Son of man."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— J.N. Andrews, The Three Messages of Revelation 14:6-12 · 1872"
		end tell

		-- Slide 64: QUOTE — SSTR 2.1 (71w -> 40)
		set s64 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s64
			set object text of text item 2 to "The empire, after Constantine, was divided into three parts; and hence the frequent remark, “a third part of men,” etc., in allusion to the third part of the empire which was under the scourge. Under the first four trumpets the two western divisions fell, and under the fifth and sixth the eastern empire was crushed; but under the seventh trumpet great Babylon entire will sink to rise no more at all."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets of Revelation 8 and 9 · 1859"
		end tell

		-- Slide 65: QUOTE — PREX1 185.1 (320w -> 22) LONG [stripped inline "186"]
		set s65 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s65
			set object text of text item 2 to "“A great earthquake such as never was since men were upon the earth, so mighty an earthquake, and so great.” The terrors of an earthquake are more easily experienced than described. The account given of the earthquake at Aleppo, as found on page 153 of this work, will afford some faint idea of its terrors. What can exceed the terrors of such a scene? But O, when it shall not desolate a single city only, but desolate the globe!!! For “the great city,” Rome, “was divided into three parts, and the CITIES OF THE NATIONS FELL.” They were laid in a heap of ruins. Think of ten thousand human beings buried in the ruins of the earthquake of St. Domingo last spring! But what is that to the time when all the cities of the earth are destroyed at a stroke, by the power of Omnipotence; when “every island shall flee away and the mountains are not found!” What a picture is presented of this scene of destruction in Ezekiel 38:19, 20: “For in my jealousy, and in the fire of my wrath, have I spoken, Surely in that day there shall be a great shaking in the land of Israel; so that the fishes of the sea, and the fowls of the heaven, and the beasts of the field, and all creeping things that creep upon the earth, and all the men that are upon the face of the earth, shall shake at my presence; and the mountains shall he thrown down, and the steep places shall fall, and every wall shall fall to the ground.” It is at that time God will fulfil his promise, to “shake not the earth only, but also heaven;” that what can be shaken may be removed; and that the things which cannot be shaken may remain, even the kingdom of the saints, which cannot be removed, but must endure forever and ever."
			set size of object text of text item 2 to 22
			set object text of text item 1 to "— Josiah Litch, Prophetic Expositions, vol. 1 · 1842"
		end tell

		-- Slide 66: SECTION
		set s66 to make new slide at end with properties {base slide:master slide "Section"}
		tell s66
			set object text of default title item to "IX. THE LOUD CRY"
		end tell

		-- Slide 67: QUOTE — EW 277.2 (118w -> 40)
		set s67 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s67
			set object text of text item 2 to "Angels were sent to aid the mighty angel from heaven, and I heard voices which seemed to sound everywhere, “Come out of her, My people, that ye be not partakers of her sins, and that ye receive not of her plagues. For her sins have reached unto heaven, and God hath remembered her iniquities.” This message seemed to be an addition to the third message, joining it as the midnight cry joined the second angel’s message in 1844. The glory of God rested upon the patient, waiting saints, and they fearlessly gave the last solemn warning, proclaiming the fall of Babylon and calling upon God’s people to come out of her that they might escape her fearful doom."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, Early Writings · 1882"
		end tell

		-- Slide 68: QUOTE — TMR 49.3 (62w -> 40)
		set s68 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s68
			set object text of text item 2 to "2. When it is said, “Come out of her, my people,” it is added as a reason, “that ye be not partakers of her sins, and that ye receive not of her plagues.” Her fall had taken place; but she still existed to sin against God, and her plagues were yet future; therefore her fall and her destruction were events entirely distinct."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— J.N. Andrews, The Three Messages of Revelation 14:6-12 · 1872"
		end tell

		-- Slide 69: QUOTE — EW 278.2 (113w -> 40)
		set s69 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s69
			set object text of text item 2 to "Servants of God, endowed with power from on high with their faces lighted up, and shining with holy consecration, went forth to proclaim the message from heaven. Souls that were scattered all through the religious bodies answered to the call, and the precious were hurried out of the doomed churches, as Lot was hurried out of Sodom before her destruction. God’s people were strengthened by the excellent glory which rested upon them in rich abundance and prepared them to endure the hour of temptation. I heard everywhere a multitude of voices saying, “Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus.”"
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, Early Writings · 1882"
		end tell

		-- Slide 70: QUOTE — GSAM 162.2 / George Storrs, Go Ye Out to Meet Him (207w -> 26) LONG
		set s70 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s70
			set object text of text item 2 to "“On this present truth, I, through grace, dare venture all, and feel that to indulge in doubt about it would be to offend God and bring upon myself ‘swift destruction.’ I am satisfied that now ‘whosoever shall seek to save his life,’ where this cry has been fairly made, by indulging in an ‘if it don’t come,’ or by a fear to venture out on this truth, ‘shall lose his life.’ It requires the same faith that led Abraham to offer up Isaac, or Noah to build the ark, or Lot to leave Sodom, or the children of Israel to stand all night waiting for their departure out of Egypt, or for Daniel to go into the lions’ den, or the three Hebrews into the fiery furnace. We have fancied that we were going into the kingdom without such a test of faith, but I am satisfied we are not. This last truth brings such a test, and none will venture upon it but such as dare to be accounted fools, madmen, or anything else that antediluvian Sodomites, a lukewarm church, or sleeping virgins are disposed to heap upon them. Once more would I cry, ‘Escape for thy life;’ ‘Look not behind you;’ ‘Remember Lot’s wife.’ ”"
			set size of object text of text item 2 to 26
			set object text of text item 1 to "— George Storrs, “Go Ye Out to Meet Him,” The Midnight Cry, Oct. 3, 1844 · quoted in J.N. Loughborough, The Great Second Advent Movement, 1905"
		end tell

		-- Slide 71: SECTION
		set s71 to make new slide at end with properties {base slide:master slide "Section"}
		tell s71
			set object text of default title item to "X. OUT OF THE CITIES"
		end tell

		-- Slide 72: QUOTE — Ev 27.2 (65w -> 40)
		set s72 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s72
			set object text of text item 2 to "If Heaven’s Warnings Go Unheeded—I am bidden to declare the message that cities full of transgression, and sinful in the extreme, will be destroyed by earthquakes, by fire, by flood. All the world will be warned that there is a God who will display His authority as God. His unseen agencies will cause destruction, devastation, and death. All the accumulated riches will be as nothingness...."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, Evangelism · Ms 35, 1906"
		end tell

		-- Slide 73: QUOTE — LDE 95.3 (73w -> 40)
		set s73 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s73
			set object text of text item 2 to "The Lord calls for His people to locate away from the cities, for in such an hour as ye think not, fire and brimstone will be rained from heaven upon these cities. Proportionate to their sins will be their visitation. When one city is destroyed, let not our people regard this matter as a light affair, and think that they may, if favorable opportunity offers, build themselves homes in that same destroyed city...."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, Last Day Events · 1906 (orig. testimony)"
		end tell

		-- Slide 74: QUOTE — CL 24.2 (59w -> 40)
		set s74 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s74
			set object text of text item 2 to "The time has come, when, as God opens the way, families should move out of the cities. The children should be taken into the country. The parents should get as suitable a place as their means will allow. Though the dwelling may be small, yet there should be land in connection with it, that may be cultivated.—Manuscript 50, 1903."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, Country Living · Ms 50, 1903"
		end tell

		-- Slide 75: QUOTE — CL 31.4 (118w -> 40)
		set s75 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s75
			set object text of text item 2 to "“Out of the cities; out of the cities!”—this is the message the Lord has been giving me. The earthquakes will come; the floods will come; and we are not to establish ourselves in the wicked cities, where the enemy is served in every way, and where God is so often forgotten. The Lord desires that we shall have clear spiritual eyesight. We must be quick to discern the peril that would attend the establishment of institutions in these wicked cities. We must make wise plans to warn the cities, and at the same time live where we can shield our 32 children and ourselves from the contaminating and demoralizing influences so prevalent in these places.—Life Sketches, 409, 410 (1906)."
			set size of object text of text item 2 to 40
			set object text of text item 1 to "— Ellen G. White, Country Living · Life Sketches, 1906"
		end tell

		-- Slide 76: QUOTE — MWV2 57.2 (246w -> 26) LONG
		set s76 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s76
			set object text of text item 2 to "And now, my dear hearer, are you prepared for this great and important event? Are you ready for the judgment to set, and the books to be opened? Let this subject sink deep into your hearts; let it follow you to your bed-chambers, to your fields, or your shops. Not one jot or tittle of the word of God shall fail. If he has spoken, it will come, however inconsistent it may look to us. Be admonished, then, and see to it that you are prepared. Compare the vision with the history of the kingdom and where can you find a failure? Not one. Then, surely, here is evidence strong that the remainder will be accomplished in its time, and that time but seven years. Think, sinner, how good God is to give you notice, and prove it a thousand fold. Remember the old world; they thought Noah was a maniac; but the flood came, and they were reserved in chains of darkness unto the judgment of the great day. Remember the cities of the plain. Lot was unto them like one that mocked; but the same day God rained fire and brimstone upon them, and they are suffering the vengeance of eternal fire. Be warned, then; fly to the ark, Christ Jesus, before the door is shut; escape to the mountain of the house of the Lord before the Lord shall rise up to the prey, and you be driven away in your wickedness. Amen."
			set size of object text of text item 2 to 26
			set object text of text item 1 to "— William Miller, Miller’s Works, vol. 2 · 1842"
		end tell

		-- Slide 77: QUOTE — GC 30.2 (272w -> 26) LONG
		set s77 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s77
			set object text of text item 2 to "Not one Christian perished in the destruction of Jerusalem. Christ had given His disciples warning, and all who believed His words watched for the promised sign. “When ye shall see Jerusalem compassed with armies,” said Jesus, “then know that the desolation thereof is nigh. Then let them which are in Judea flee to the mountains; and let them which are in the midst of it depart out.” Luke 21:20, 21. After the Romans under Cestius had surrounded the city, they unexpectedly abandoned the siege when everything seemed favorable for an immediate attack. The besieged, despairing of successful resistance, were on the point of surrender, when the Roman general withdrew his forces without the least apparent reason. But God’s merciful providence was directing events for the good of His own people. The promised sign had been given to the waiting Christians, and now an opportunity was offered for all who would, to obey the Saviour’s warning. Events were so overruled that neither Jews nor Romans should hinder the flight of the Christians. Upon the retreat of Cestius, the Jews, sallying from Jerusalem, pursued after his retiring army; and while both forces were thus fully engaged, the Christians had an opportunity to leave the city. At this time the country also had been cleared of enemies who might have endeavored to intercept them. At the time of the siege, the Jews were assembled at Jerusalem to keep the Feast of Tabernacles, and thus the Christians throughout the land were able to make their escape unmolested. Without delay they fled to a place of safety—the city of Pella, in the land of Perea, beyond Jordan."
			set size of object text of text item 2 to 26
			set object text of text item 1 to "— Ellen G. White, The Great Controversy · 1888/1911"
		end tell

		-- Slide 78: CLOSER (Section-styled text card)
		set s78 to make new slide at end with properties {base slide:master slide "Section"}
		tell s78
			set object text of default title item to "BELIEVE HIS PROPHETS, SO SHALL YE PROSPER — 2 Chronicles 20:20"
		end tell

	end tell

	-- Save to the user's Keynote iCloud Documents folder.
	save theDoc in POSIX file "/Users/cvr/Library/Mobile Documents/com~apple~Keynote/Documents/Fire and Brimstone.key"
	return "OK " & (count of slides of theDoc)
end tell
