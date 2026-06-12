-- edit-deck1.applescript
-- "What is Truth — Part I: Beyond Opinion" v2 surgical edits.
-- Operates on the COPY (What is truth v2.key); original untouched.
-- All ops execute in DESCENDING slide order so pending indices never shift.
-- Evidence basis: gather/audit-deck1-evidence.md (G1, verified 2026-06-12).

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
	set theDoc to open (POSIX file "/Users/cvr/Library/Mobile Documents/com~apple~Keynote/Documents/What is truth v2.key")
	delay 2
	set problems to {}

	tell theDoc

		-- ============ slide 85: close becomes cliffhanger ============
		set presenter notes of slide 85 to "Pick up a Bible and see what an open heart and a willing mind can do to change your life. And tomorrow night — the Book goes on trial: a hypothesis, testable predictions, and history as the judge. Bring your skepticism. You'll need it less than you think."

		-- ============ WAGER inserts (between 84 and 85), then delete 84 ============
		set w2 to make new slide at after slide 84 with properties {base slide:master slide "Title - Center"}
		tell w2
			set object text of default title item to "Commit to the standard — not to a religion."
			set presenter notes to "That is all I ask of you tonight. Tomorrow we take this Book and test it the way you would test any claim: hypothesis, assumptions, testable predictions, evidence. If it fails, you have lost nothing. If it passes — you already told yourself what you would do. [IMAGE: consider a simple handshake / scales visual]"
		end tell
		set w1 to make new slide at after slide 84 with properties {base slide:master slide "Title - Center"}
		tell w1
			set object text of default title item to "If a source met all five — would you follow it?"
			set presenter notes to "THE WAGER — the hinge of the night. Be honest with yourself. Not 'would you become religious' — would you FOLLOW a truth that proved itself above human origin, consistent, universal, and benevolent — seeking YOUR good? If the answer is no, then no amount of evidence will ever matter — and that is not skepticism; that is a commitment to disbelief. If the answer is yes, then all that remains is to test the candidate. [Pause here. Let the room sit in it.]"
		end tell
		delete slide 84

		-- ============ slide 83 notes absorb old 84 (gurus) ============
		set presenter notes of slide 83 to "A multi-billion-dollar wellness industry often repackages new-age and ancient mysticism — with zero scrutiny, zero accountability, no documentation. Add the countless, often contradicting opinions of social-media gurus, influencers, and podcasters — and we eat those up without asking for a single footnote. Here is the double standard: we hold the Bible to a standard of proof nobody applies to the sources we already trust. Tonight I am asking the opposite: hold THIS book to the same standard you would demand of anything — it survives it."

		-- ============ slide 82: New Age stats — keep only the solid Pew number ============
		my replaceText(slide 82 of theDoc, "87%", "62% of American adults hold at least one New Age belief — spiritual energy in objects, psychics, reincarnation, or astrology." & linefeed & "Pew Research Center, 2018")
		set presenter notes of slide 82 to "Pew Research Center, October 2018: 62% of US adults hold at least one New Age belief (spiritual energy in physical things, psychics, reincarnation, astrology). The older YouGov '87%' figure was dropped in v2 — Pew alone is bulletproof and sufficient."

		-- ============ delete slide 81 (New Age compression) ============
		delete slide 81

		-- ============ objections notes (79..75) ============
		set presenter notes of slide 79 to "We have seen countless examples — churches and people — that make others wonder about the Bible. Is THIS what the Book produces? No. And here is the thing: the Bible itself predicts this corruption and condemns it (we will see this in Night 3). Judge a standard by what it says, not by those who break it. We do not abolish medicine because of malpractice."
		set presenter notes of slide 78 to "Many people have had genuinely bad experiences — with churches, with religious people, with hypocrisy. That pain is real, and I will not argue with it. But notice: being hurt by people who failed a standard tells you about the PEOPLE, not the standard. If anything, your outrage proves you already believe in a standard they violated."
		set presenter notes of slide 77 to "This is the one objection we can settle with physical evidence — and we already did tonight: 5,800+ Greek New Testament manuscripts; Dead Sea Scrolls a thousand years older than the medieval Hebrew text and over 95% identical, the differences being mostly spelling. Whatever you think of the Book's claims, we KNOW we are reading what the authors wrote."
		set presenter notes of slide 76 to "So are our medical textbooks, our physics theories, every self-help book and every source of knowledge we have. 'Written by humans' does not disqualify a source — being LIMITED to human knowledge would. Whether this book exceeds human knowledge is exactly tomorrow night's test."
		set presenter notes of slide 75 to "Older than Plato and Aristotle — which we still study, quote, and build civilizations on. Age is not a defect in truth; DRIFT is. The question is never how old a standard is, but whether it changed. Next objection answers that."

		-- ============ slide 74: universal mandate — drop the false 'only religion' claim ============
		set presenter notes of slide 74 to "The gospel's mandate is explicitly universal — every nation, every creature (Mark 16:15; Matthew 28:19): a faith meant to be shared, not hoarded, crossing every culture and class. That is criterion 4. [PRECISION: do NOT claim Christianity is the only missionary faith — Islam teaches dawah and Buddhism has been missionary since Ashoka, 3rd century BC. The defensible claim is about the Bible's OWN universal commission, not a comparative 'only.']"

		-- ============ insert verdict-deferral after 72 ============
		set defSlide to make new slide at after slide 72 with properties {base slide:master slide "Title - Center"}
		tell defSlide
			set object text of default title item to "But does it FIX the problem?"
			set presenter notes to "Criterion 5 has two halves. Benevolent principles — you have just seen the evidence: it protects the weak, rebukes kings, costs its writers everything, and serves people who never believed it. But the second half is the biggest question in the world: does it actually FIX what is broken in us and in the world? Why is there evil at all? Why suffering? That question gets its own night — Night 3. Tonight: the candidate qualifies. Tomorrow: the proof of divine origin. Night 3: the fix."
		end tell

		-- ============ slide 67: retitle to bind criteria 3+5 ============
		my replaceText(slide 67 of theDoc, "Is it practical?", "Does it work? Does it seek your good?")
		set presenter notes of slide 67 to "Criteria 3 and 5 together: practical — livable, real-world principles with proven results — and benevolent: written for YOUR good, not the authors' gain. Watch the next slides with that double question: do these principles work, and who do they serve?"

		-- ============ delete prophecy block 66..61, insert teaser after 60 ============
		delete slide 66
		delete slide 65
		delete slide 64
		delete slide 63
		delete slide 62
		delete slide 61
		set teaser to make new slide at after slide 60 with properties {base slide:master slide "Title - Center"}
		tell teaser
			set object text of default title item to "Can a book PROVE that?"
			set presenter notes to "Every page of this Book claims God as its source. Anyone can claim that. So how would you ever test it? There is exactly one test no human author can fake: telling the future — in writing, in detail, with dates — centuries in advance. That is tomorrow night. Tonight we finish the criteria."
		end tell

		-- ============ delete Sodom block 57..54 (Wyatt material — indefensible) ============
		delete slide 57
		delete slide 56
		delete slide 55
		delete slide 54

		-- ============ Sinai imagery caution (slides 50, 49 remain) ============
		set presenter notes of slide 50 to "[CAUTION — v2 audit] If this imagery shows Jabal al-Lawz (Saudi Arabia): that identification is popular but disputed; mainstream scholarship favors the Sinai Peninsula and rejects the Wyatt/Cornuke claims. Present any site only as 'a candidate location' — or speak of the Exodus narrative without claiming a proven site. Do not stake credibility on a contested identification."

		-- ============ archaeology notes refresh (48, 47, 46) ============
		set presenter notes of slide 48 to "The Pilate Stone, Caesarea Maritima, discovered June 1961 (Frova excavation): a Latin inscription naming 'Pontius Pilatus, Prefect of Judaea' — the only contemporary inscription naming Pilate, dated AD 26-36. Bonus for the skeptic: the stone says PREFECT — the precise, period-correct title — where later writers loosely said 'procurator.' Contemporary stone-cut precision is the signature of authenticity."
		set presenter notes of slide 47 to "The Tel Dan Stele, discovered 1993 (Biran excavation): a 9th-century-BC victory monument in Old Aramaic — carved by an ENEMY of Israel (most scholars: Hazael of Aram-Damascus) — containing 'bytdwd', the House of David. The first hard evidence outside the Bible that David's dynasty was real, and it comes from a hostile witness. Mainstream consensus accepts the reading."
		set presenter notes of slide 46 to "19th-century critics doubted the Hittites existed and used that doubt against the Bible. [PRECISION: the Bible was not the ONLY ancient source — Egyptian records mention the 'Kheta' — the honest claim is DOUBTED, then VINDICATED.] In 1906 Hugo Winckler excavated Bogazkoy — the Hittite imperial capital, with some 10,000 cuneiform tablets. A people once waved off as fiction turned out to rival Egypt and Babylon."

		-- ============ slide 45: Glueck typo + caveat notes ============
		my replaceText(slide 45 of theDoc, "Archeolgist", "— Nelson Glueck, Archaeologist")
		my replaceText(slide 45 of theDoc, "no archaeological discovery has ever controverted", "\"It may be stated categorically that no archaeological discovery has ever controverted a Biblical reference.\"")
		set presenter notes of slide 45 to "Nelson Glueck, Rivers in the Desert (1959), p. 31 — a real statement by a leading archaeologist (American Schools of Oriental Research). [PRECISION if challenged: it is a 1959 claim and somewhat rhetorical; scholars still debate items like the Exodus route. The defensible core — and our actual claim — is that archaeology keeps CONFIRMING the Bible's named people and places rather than contradicting them. The next three slides are exactly that.]"

		-- ============ slide 44: NT manuscripts — notes with corrected comparisons ============
		set presenter notes of slide 44 to "5,800+ Greek New Testament manuscripts (Wallace/CSNTM); 20,000+ counting all ancient languages. The next best preserved ancient text, Homer's Iliad: about 1,900 (the old '643' figure is outdated — use ~1,900). Caesar's Gallic Wars: a handful of early manuscripts, the oldest ~900 years after Caesar. No other ancient document is preserved like this. [HONESTY CARD: this proves we HAVE what they wrote — textual integrity — not that what they wrote is true. That test is tomorrow night. Saying this out loud builds more credibility than any number.]"

		-- ============ slide 43: OT — drop '17,000', argue fidelity ============
		my replaceText(slide 43 of theDoc, "17,000", "Dead Sea Scrolls (c. 100 BC)" & linefeed & "Over 95% identical to the medieval Hebrew text")
		set presenter notes of slide 43 to "The '17,000+ copies' figure was dropped in v2 — it could not be sourced and a skeptic would catch it. The honest, stronger argument is FIDELITY: the Dead Sea Scrolls pushed our oldest Hebrew text back a thousand years, and across that millennium of hand-copying the text matches the medieval Masoretic text in over 95% of the words, the variants being mostly spelling. A thousand years of copying with near-perfect fidelity — that is criterion 1, consistency, in hard evidence."

		-- ============ insert criterion 5 after slide 39 ============
		set c5 to make new slide at after slide 39 with properties {base slide:master slide "Title - Center"}
		tell c5
			set object text of default title item to "5. Benevolent"
			set presenter notes to "The fifth criterion — the one that makes this personal. A true external standard must seek YOUR good, not its authors' gain. A standard that profits its maker is an advertisement; a standard that costs its makers everything and heals its readers is something else entirely. And benevolence has a second half: it must not merely diagnose our problem — it must FIX it. Hold that thought; it gets its own night. [IMAGE: consider a physician / outstretched hand visual]"
		end tell

		-- ============ slide 34 notes: kilogram verified + 'five standards' ============
		set presenter notes of slide 34 to "Originally there were physical artifacts: the International Prototype Kilogram — a platinum-iridium cylinder in a Paris vault since 1889. The problem? It DRIFTED: roughly 50 micrograms relative to its official copies. Just like human morality — the physical standard changed with time. So on 20 May 2019 the SI was redefined: every unit now rests on unchanging constants of nature. The metre is the distance light travels in 1/299,792,458 of a second; the kilogram is fixed by Planck's constant. The lesson: an absolute standard cannot drift with the thing it measures — it must be anchored OUTSIDE, to something unchanging. So here are five standards I propose for an absolute moral truth."

		-- ============ slide 32 notes: SPE dropped; Milgram + diffusion kept honestly ============
		set presenter notes of slide 32 to "And even whether we are rich or poor. The research: Milgram (1961), replicated by Burger (2009, American Psychologist) — about 70% of ordinary people obey an authority figure even when they believe they are harming a stranger; even the modern, ethically-bound replication produced the same obedience. And in crowds: diffusion of responsibility — each person assumes someone else will act, so individual responsibility quietly evaporates (Darley & Latane 1968; 2019 CCTV research shows people usually DO step in once someone owns the moment — the mechanism is real even though the 'nobody helps' caricature is not). [NOTE: the Stanford Prison Experiment was removed in v2 — it was discredited in 2018-2019 (coached guards, predetermined conclusions, never replicated). If anyone asks why we did not cite it: 'we only build on evidence that survives scrutiny — that is the whole point of tonight.'] The point stands: our internal compass bends to fatigue, fear, money, authority, and crowds. A compass that bends is not a standard."

		-- ============ slide 26 notes: divorce myth corrected ============
		set presenter notes of slide 26 to "It removes self-accountability — what should anyone be held accountable for, if all truth is relative? And much of the time, claiming relativism is really a shield against being 'judged.' Consider our most considered promise: marriage. About 40% of first marriages are projected to end in divorce (Institute for Family Studies 2024; CDC) — and that is the CORRECTED number; the famous '50%' is a myth, and using the honest figure matters more here than the bigger one. Four in ten of our most deliberate lifelong vows fail — usually a collision of two private moral standards. Ultimately, many of us agree with moral relativism right up until injustice arrives at our own door."

		-- ============ slide 20 notes: war-tech precision ============
		set presenter notes of slide 20 to "Things we cannot imagine living without were born from military research: the internet (DARPA's ARPANET, 1969) and GPS (US Department of Defense, NAVSTAR) were built for war. Even the microwave oven came out of WWII radar — Raytheon engineer Percy Spencer noticed a candy bar melt next to an active magnetron; Raytheon patented the oven in 1945. [PRECISION: the microwave was a peacetime ACCIDENT of war technology, not a weapon — a skeptic who knows the Percy Spencer story will respect the accuracy.]"

		-- ============ slide 8: relativism stats refresh ============
		my replaceText(slide 8 of theDoc, "64%", "66% of US adults reject or doubt that absolute moral truth exists — American Worldview Inventory 2025, Arizona Christian University" & linefeed & "3 in 4 Americans (75%) say they decide moral truth by their feelings — AWVI 2025" & linefeed & "74% of Millennials: \"Whatever is right for your life or works best for you is the only truth you can know\" — Barna Group, 2016")
		set presenter notes of slide 8 to "Updated v2 stats (the old Barna '64% truth is always relative' was an early-2000s figure and the '58%' could not be verified). Current: American Worldview Inventory 2025 (Cultural Research Center, Arizona Christian University; n=2,100, Jan 2025): 66% of US adults reject or doubt absolute moral truth; 75% decide moral truth by their feelings. Held-over 2016 Barna (labeled as such): 74% of Millennials — 'whatever is right for your life is the only truth you can know.' The sharp point is not that people disagree — it is that three quarters have abandoned any METHOD for finding moral truth beyond feelings."

	end tell

	save theDoc
	set finalCount to count of slides of theDoc
	return "DECK1 DONE — slides: " & finalCount
end tell
