-- build-deck.applescript
-- Fire and Brimstone: The Forgotten Half of the Third Angel's Message
-- 35-slide TEXT-ONLY companion deck, Basic Black theme, 1920x1080.
-- Flat and explicit: 35 sequential blocks, one per slide. No loops.
-- Native masters used: Title, Section, Big Fact, Quote, Blank.
-- Quote master mapping (from POC): text item 2 = large quote area, text item 1 = small attribution.

tell application "Keynote"
	activate
	set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
	tell theDoc

		-- Slide 1: title (the default first slide)
		set base slide of slide 1 to master slide "Title"
		tell slide 1
			set object text of default title item to "FIRE AND BRIMSTONE"
			set object text of default body item to "The Forgotten Half of the Third Angel’s Message · June 13, 2026"
		end tell

		-- Slide 2: quote — GC 442.2
		set s2 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s2
			set object text of text item 2 to "“Such action would be directly contrary to the principles of this government, to the genius of its free institutions, to the direct and solemn avowals of the Declaration of Independence, and to the Constitution.”"
			set object text of text item 1 to "— Ellen G. White, The Great Controversy"
		end tell

		-- Slide 3: section-marker
		set s3 to make new slide at end with properties {base slide:master slide "Section"}
		tell s3
			set object text of default title item to "WHAT IS A TRUMPET?"
		end tell

		-- Slide 4: event-marker — Trumpet 1
		set s4 to make new slide at end with properties {base slide:master slide "Title"}
		tell s4
			set object text of default title item to "THE GOTHS — Alaric sacks Rome"
			set object text of default body item to "Trumpet 1 · A.D. 410"
		end tell

		-- Slide 5: event-marker — Trumpet 2
		set s5 to make new slide at end with properties {base slide:master slide "Title"}
		tell s5
			set object text of default title item to "THE VANDALS — Genseric’s fleet preys on the coasts"
			set object text of default body item to "Trumpet 2 · A.D. 428-468"
		end tell

		-- Slide 6: event-marker — Trumpet 3
		set s6 to make new slide at end with properties {base slide:master slide "Title"}
		tell s6
			set object text of default title item to "THE HUNS — Attila, “the scourge of God”"
			set object text of default body item to "Trumpet 3 · A.D. 451"
		end tell

		-- Slide 7: event-marker — Trumpet 4
		set s7 to make new slide at end with properties {base slide:master slide "Title"}
		tell s7
			set object text of default title item to "THE WESTERN EMPIRE EXTINGUISHED — Odoacer deposes the last emperor"
			set object text of default body item to "Trumpet 4 · A.D. 476"
		end tell

		-- Slide 8: section-marker
		set s8 to make new slide at end with properties {base slide:master slide "Section"}
		tell s8
			set object text of default title item to "THE FIRST WOE"
		end tell

		-- Slide 9: event-marker — Saracens
		set s9 to make new slide at end with properties {base slide:master slide "Title"}
		tell s9
			set object text of default title item to "THE SARACENS — out of Arabia"
			set object text of default body item to "A.D. 632-1299"
		end tell

		-- Slide 10: quote — SSTR 38.2
		set s10 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s10
			set object text of text item 2 to "“swarms of Saracens, like locusts, overspread the earth, and speedily extended their ravages over the Roman empire, from east to west.”"
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets · 1859"
		end tell

		-- Slide 11: event-marker — Othman
		set s11 to make new slide at end with properties {base slide:master slide "Title"}
		tell s11
			set object text of default title item to "OTHMAN — “they had a king over them”"
			set object text of default body item to "July 27, 1299"
		end tell

		-- Slide 12: section-marker
		set s12 to make new slide at end with properties {base slide:master slide "Section"}
		tell s12
			set object text of default title item to "THE SECOND WOE"
		end tell

		-- Slide 13: event-marker — Ottoman artillery
		set s13 to make new slide at end with properties {base slide:master slide "Title"}
		tell s13
			set object text of default title item to "OTTOMAN ARTILLERY — fire, smoke, and brimstone"
			set object text of default body item to "1453"
		end tell

		-- Slide 14: event-marker — Constantinople falls
		set s14 to make new slide at end with properties {base slide:master slide "Title"}
		tell s14
			set object text of default title item to "CONSTANTINOPLE FALLS"
			set object text of default body item to "May 29, 1453"
		end tell

		-- Slide 15: quote — SSTR 53.1
		set s15 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s15
			set object text of text item 2 to "“The color of fire is red, of hyacinth or jacinth blue, and of brimstone yellow ... has a literal accomplishment ...”"
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets · 1859"
		end tell

		-- Slide 16: section-marker
		set s16 to make new slide at end with properties {base slide:master slide "Section"}
		tell s16
			set object text of default title item to "AUGUST 11, 1840"
		end tell

		-- Slide 17: event-marker — Litch prediction
		set s17 to make new slide at end with properties {base slide:master slide "Title"}
		tell s17
			set object text of default title item to "JOSIAH LITCH — the prediction published"
			set object text of default body item to "1838"
		end tell

		-- Slide 18: event-marker — London Convention
		set s18 to make new slide at end with properties {base slide:master slide "Title"}
		tell s18
			set object text of default title item to "THE LONDON CONVENTION — four powers take the Porte in hand"
			set object text of default body item to "July 15, 1840"
		end tell

		-- Slide 19: event-marker — ultimatum sails
		set s19 to make new slide at end with properties {base slide:master slide "Title"}
		tell s19
			set object text of default title item to "THE ULTIMATUM SAILS — Constantinople to Alexandria"
			set object text of default body item to "August 5, 1840"
		end tell

		-- Slide 20: quote — SSTR 65.1
		set s20 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s20
			set object text of text item 2 to "“the ultimatum was officially put into the power of Mehemet Ali ... on the ELEVENTH DAY OF AUGUST, 1840.”"
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets · 1859"
		end tell

		-- Slide 21: quote — GC 335.1
		set s21 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s21
			set object text of text item 2 to "“At the very time specified, Turkey, through her ambassadors, accepted the protection of the allied powers of Europe ... The event exactly fulfilled the prediction.”"
			set object text of text item 1 to "— Ellen G. White, The Great Controversy"
		end tell

		-- Slide 22: event-marker — advent movement
		set s22 to make new slide at end with properties {base slide:master slide "Title"}
		tell s22
			set object text of default title item to "THE ADVENT MOVEMENT SWELLS"
			set object text of default body item to "1840-1844"
		end tell

		-- Slide 23: section-marker
		set s23 to make new slide at end with properties {base slide:master slide "Section"}
		tell s23
			set object text of default title item to "THE DAY OF THE LORD"
		end tell

		-- Slide 24: quote — TMR 125.1
		set s24 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s24
			set object text of text item 2 to "“The prophet Isaiah (chap. 34) describes the final conflagration of our globe in language which is a complete parallel to that of the third angel in describing the punishment of the wicked.”"
			set object text of text item 1 to "— J. N. Andrews, The Three Messages of Revelation 14"
		end tell

		-- Slide 25: section-marker
		set s25 to make new slide at end with properties {base slide:master slide "Section"}
		tell s25
			set object text of default title item to "THE THIRD ANGEL’S MESSAGE"
		end tell

		-- Slide 26: quote — TTAM 8.1
		set s26 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s26
			set object text of text item 2 to "“This mark ... signifies not a literal mark, but a prominent profession, that all may see and know.”"
			set object text of text item 1 to "— James White, The Third Angel’s Message"
		end tell

		-- Slide 27: quote — TMR 124.1
		set s27 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s27
			set object text of text item 2 to "“Such is a brief view of the dread realities of the seven last plagues, - the third woe!”"
			set object text of text item 1 to "— J. N. Andrews, The Three Messages of Revelation 14"
		end tell

		-- Slide 28: quote — SSTR 2.1
		set s28 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s28
			set object text of text item 2 to "“under the seventh trumpet great Babylon entire will sink to rise no more at all.”"
			set object text of text item 1 to "— James White, The Sounding of the Seven Trumpets · 1859"
		end tell

		-- Slide 29: section-marker
		set s29 to make new slide at end with properties {base slide:master slide "Section"}
		tell s29
			set object text of default title item to "THE LOUD CRY"
		end tell

		-- Slide 30: quote — EW 278.2
		set s30 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s30
			set object text of text item 2 to "“the precious were hurried out of the doomed churches, as Lot was hurried out of Sodom before her destruction.”"
			set object text of text item 1 to "— Ellen G. White, Early Writings"
		end tell

		-- Slide 31: section-marker
		set s31 to make new slide at end with properties {base slide:master slide "Section"}
		tell s31
			set object text of default title item to "OUT OF THE CITIES"
		end tell

		-- Slide 32: quote — LDE 95.3
		set s32 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s32
			set object text of text item 2 to "“The Lord calls for His people to locate away from the cities, for in such an hour as ye think not, fire and brimstone will be rained from heaven upon these cities.”"
			set object text of text item 1 to "— Ellen G. White, Last Day Events"
		end tell

		-- Slide 33: quote — CL 31.4
		set s33 to make new slide at end with properties {base slide:master slide "Quote"}
		tell s33
			set object text of text item 2 to "“Out of the cities; out of the cities!”—this is the message the Lord has been giving me."
			set object text of text item 1 to "— Ellen G. White, Country Living"
		end tell

		-- Slide 34: event-marker — Noah
		set s34 to make new slide at end with properties {base slide:master slide "Title"}
		tell s34
			set object text of default title item to "NOAH BUILT BEFORE THE RAIN"
			set object text of default body item to "“moved with fear, prepared an ark”"
		end tell

		-- Slide 35: blank — pure black, set nothing
		set s35 to make new slide at end with properties {base slide:master slide "Blank"}

	end tell

	-- Save to the user's Keynote iCloud Documents folder.
	save theDoc in POSIX file "/Users/cvr/Library/Mobile Documents/com~apple~Keynote/Documents/Fire and Brimstone.key"
	return "OK " & (count of slides of theDoc)
end tell
