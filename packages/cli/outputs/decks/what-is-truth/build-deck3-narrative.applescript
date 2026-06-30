-- build-deck3-narrative.applescript
-- "Why Suffering? — The Trial of God" (Part III) — NARRATIVE / IMAGE-DRIVEN rebuild.
-- Full-bleed painted scene per slide + ONE line of text. Narration lives in presenter notes.
-- Emotional spine: He is both merciful and just — the cross is where they meet.
-- 33 beats (see images/day3/beat-sheet.json). Reuses 11 existing images + 22 new narrative scenes.

set imgDir to "/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/what-is-truth/images/day3/"

-- {image-file, on-slide line, presenter-narration}
set beats to {¬
	{"00-title.png", "WHY SUFFERING?", "Part III. Two nights of evidence that the Book is reliable and above human origin. Tonight is not more proof — tonight is the heart of it. Who is this God the Book reveals? Open warm; this is a story, not a lecture."}, ¬
	{"n02-suffering-weight.png", "If God is good — why is the world like this?", "Name the ache honestly — most people aren't skeptics because of arguments, but because of pain. Honor it. The whole night answers this, not with a formula, but with a Person."}, ¬
	{"02-stars-before-creation.png", "The answer is older than you are.", "To understand the suffering in front of you, we go back — before a single human being, before sin itself. The story starts in a universe at peace."}, ¬
	{"n04-host-at-peace.png", "Before us, a universe at peace.", "A created order before humanity — ranks of angelic beings, perfect harmony, no death, no fear. Love freely given. This is the baseline; everything that follows is a deviation from it."}, ¬
	{"01-covering-cherub.png", "And one stood highest of all.", "The most beautiful and exalted of all created beings — Lucifer, the anointed covering cherub (Ezekiel 28:12-15). Perfect in his ways… until iniquity was found in him. Hold on the tragedy of that 'until.'"}, ¬
	{"05-throne-guardian.png", "He guarded one thing: the law of love.", "The covering cherub stood over the law at the heart of God's government — and that law is simply love (Romans 13:10; Matthew 22:37-40). He of all beings KNEW the law was love. Which makes what he did next astonishing."}, ¬
	{"n07b-moses-pattern.png", "Heaven showed Moses the original.", "On Sinai, Moses was shown the heavenly sanctuary itself and told: build a copy — 'according to the pattern shewed thee in the mount' (Exodus 25:40). The earthly was only ever a shadow of the heavenly thing (Hebrews 8:5). So when we look at Israel's sanctuary, we are looking at a scale model of heaven's throne room."}, ¬
	{"03-sanctuary.png", "Heaven had a blueprint on earth.", "Israel's sanctuary was a copy of a heavenly reality (Hebrews 8:5) — a window into the throne room. Use it to picture what the covering cherub guarded."}, ¬
	{"04-ark-cherubim.png", "Two angels, wings spread, covering the law.", "At its center: the ark, with two cherubim covering the law inside, God's presence shining between them (Exodus 25:20-22). Lucifer was one such covering cherub — guarding the law of love."}, ¬
	{"n09-heart-of-god.png", "Because God is love.", "1 John 4:8 — not 'God loves,' God IS love. His very essence. Everything tonight must stay true to this. Let the audience feel it, not just hear it."}, ¬
	{"06-open-hands.png", "And love can never be forced.", "The proof of love is freedom — a forced 'I love you' is not love. So the very possibility of rebellion is the cost of real love. A universe where sin is impossible is a universe without love."}, ¬
	{"n11-pride-dawns.png", "Then the highest heart turned.", "Not a sudden event — a slow self-exaltation (Isaiah 14:13-14, the five 'I wills'). He began to admire his own brightness more than the throne. The saddest turning in all of history."}, ¬
	{"n12-accusation-born.png", "“The law must be wrong.”", "To justify himself, the standard had to be the problem. The accusation is born: God's law is bondage, His government unfair, God Himself the tyrant. This is the charge the whole night answers."}, ¬
	{"n13-restrained-force.png", "Love cannot answer a lie with a sword.", "If God destroyed the rebel on the spot, a watching universe that had never seen sin would serve from fear, not love — and the doubt would survive. Force can win a fight; it cannot answer a charge. So mercy stays the hand of power."}, ¬
	{"n14-cosmic-courtroom.png", "A charge like this can only be disproven — in the open.", "The conflict becomes a trial over God's character, heard before the whole universe. And a fair trial needs witnesses outside the original dispute (Deuteronomy 19:15) — the angels had already taken sides."}, ¬
	{"07-human-before-cosmos.png", "So He made you. To see for yourself.", "THE REVEAL — you were created because you were needed: an honest, third-party witness, made after the conflict, given the facts. Not to flatter God — to SEE Him truly. 'For His glory' = to vindicate His character. Let it land."}, ¬
	{"n16-eden-dawn.png", "The first morning of the world.", "Humanity placed in a perfect garden — innocent, free, loved. The witnesses take the stand at the dawn of the world."}, ¬
	{"n17-the-tree.png", "Justice let the other side speak too.", "The tree was not a trap — it was the one place the accuser was permitted to make his case to the jury (Genesis 2:16-17). Total abundance, one boundary, stakes disclosed, nothing forced. A fair trial hears both sides."}, ¬
	{"n18-the-fall.png", "And we believed the accuser.", "The jury believed the lie — 'God is holding out on you' (Genesis 3). The issue was never fruit; it was allegiance: whose word about God would we trust? That choice rearranged the world."}, ¬
	{"n19-false-victory.png", "The accuser thought he had won a world.", "The fall looked like total victory — a kingdom, a jury turned, a base of operations (2 Corinthians 4:4). The shadow falls over the earth."}, ¬
	{"n20-father-and-son.png", "He did not know the love of God.", "He had not reckoned with the depths of the Father's and the Son's love — a plan already in place to do two things at once: redeem the witnesses, and conclude the case. Conceived in love, at infinite cost."}, ¬
	{"08-diverging-paths.png", "Two paths that look the same — until they don't.", "Why let sin run at all? Two lines a degree apart look identical at the start; only over distance does the gap become a chasm. Evil's true nature only shows when its principles fully unfold."}, ¬
	{"n22-world-groans.png", "He let the world groan — so it would never groan again.", "The case must mature so the verdict is unanswerable, and then — Nahum 1:9 — affliction will not rise a second time. You don't kill a weed by cutting the stem; you dig out the root. Once, fully, forever."}, ¬
	{"n23-jesus-weeps.png", "And He did not watch from a safe distance.", "'In all their affliction He was afflicted' (Isaiah 63:9). 'Jesus wept' (John 11:35). The God of this Book entered the suffering — He felt it from the inside. Unique among all the answers. Let it breathe."}, ¬
	{"n24-justice-mercy-dilemma.png", "Justice and mercy — pick one, God.", "The accuser's sharpest charge: if the law is just, the lawbreaker cannot be pardoned; justice and mercy cannot coexist. Every human court faces this. The cross takes both horns."}, ¬
	{"n25-calvary.png", "He did not waive the law. He paid it.", "God did not change the rules to excuse us — He absorbed the penalty Himself (2 Corinthians 5:19). Justice satisfied AND mercy extended. The Lawgiver pays the law's own price. Reverent; let the weight of it land."}, ¬
	{"n26-accuser-exposed.png", "And the accuser was unmasked before the universe.", "Given a free hand, the accuser tortured and killed the only innocent man who ever lived (Colossians 2:15). His own work condemned him. Whatever sympathy his case still had — died at the cross, in full view of the watching universe."}, ¬
	{"n27-mercy-justice-meet.png", "At the cross, mercy and justice met — and kissed.", "Psalm 85:10 — 'mercy and truth are met together; righteousness and peace have kissed.' THE heart of the night: He is both merciful AND just, and the cross is where the two become one. This is the character you were made to see."}, ¬
	{"n28-grace-received.png", "None of us could ever earn this.", "Measured by love itself, none of us makes it (Romans 3:23). And that is exactly why the bridge is grace, not achievement (Titus 3:5). 'I've done my best' was never the standard — His love is. The insufficiency is good news. Say 'we,' never 'you.'"}, ¬
	{"09-bridge-of-light.png", "The same cross that cleared His name — reopens your way home.", "One act, both results: it vindicated God's character AND rebuilt the bridge to you. 'Behold, what manner of love' (1 John 3:1). Vindication and rescue, inseparable."}, ¬
	{"e01-second-coming.png", "And this story is not finished.", "Everything so far is settled history — the cross is behind us. But the Book has pages not yet turned. It says this present world is almost over, and One is coming back: 'Behold, he cometh with clouds; and every eye shall see him' (Revelation 1:7). Pivot the room here: from what God HAS done to what He has PROMISED to do. Soon."}, ¬
	{"e02-babylon-falls.png", "The world as it is will not stand.", "The proud world-system — its empire, its luxury, its defiance — comes down: 'Babylon the great is fallen, is fallen' (Revelation 18:2). Not cynicism about the world, but realism: this order is temporary and already under sentence. What looks permanent is passing."}, ¬
	{"e03-white-throne.png", "And every life will be weighed.", "A great final reckoning is coming — 'I saw a great white throne… and the books were opened… and the dead were judged… according to their works' (Revelation 20:11-12). Every life, small and great, in the open at last. The same justice that was vindicated at the cross will be applied to all. Sober, not threatening — this is why the invitation matters."}, ¬
	{"e04-world-fire.png", "This world ends — so a new one can begin.", "The old earth itself passes away in fire: 'the heavens shall pass away with a great noise, and the elements shall melt… the earth also and the works that are therein shall be burned up' (2 Peter 3:10). Not annihilation for its own sake — a cleansing, the doorway the world passes through. The destruction is real, and it is not the end of the story."}, ¬
	{"n30-new-earth.png", "He will wipe away every tear.", "Revelation 21:4 — no more death, sorrow, crying, or pain. Not clouds and harps — a restored earth, the home you were made for. The groaning of the world, ended personally. After the fire: 'I saw a new heaven and a new earth' (Revelation 21:1). THIS is what the destruction was making room for."}, ¬
	{"n31-eternal-peace.png", "And suffering will never rise again.", "Affliction shall not rise up the second time (Nahum 1:9). Secured not by force, but by a verdict the whole universe witnessed — which is why this peace is permanent. The case is closed forever."}, ¬
	{"10-door-light.png", "He stands at the door, and knocks.", "Revelation 3:20 — He knocks; He does not break in. The God who refused to win the cosmos by force will not force you either. Consistent to the last page."}, ¬
	{"n33-invitation.png", "Your move.", "The ask, both lanes: study with me (one hour, any week night), or start alone in the Gospel of John. 'O taste and see that the LORD is good' (Psalm 34:8). You've met His character tonight — the next move is yours. Close warm; prayer if the room allows."} ¬
	}

tell application "Keynote"
	activate
	set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
	tell theDoc

		set isFirst to true
		repeat with b in beats
			set imgFile to item 1 of b
			set theLine to item 2 of b
			set theNote to item 3 of b
			set imgPath to imgDir & imgFile

			if isFirst then
				set theSlide to slide 1
				set base slide of theSlide to master slide "Blank"
				set isFirst to false
			else
				set theSlide to make new slide at end with properties {base slide:master slide "Blank"}
			end if

			-- verify the file exists BEFORE handing it to Keynote: a non-existent POSIX
			-- file path can silently no-op (slide ends up blank) instead of throwing.
			tell application "System Events" to set imgExists to (exists disk item imgPath)

			tell theSlide
				-- full-bleed background image
				if imgExists then
					make new image with properties {file:(POSIX file imgPath), position:{0, 0}, width:1920, height:1080}
				else
					-- loud marker so a missing image can never ship unnoticed
					make new text item with properties {object text:("[MISSING IMAGE: " & imgFile & "]"), position:{160, 480}, width:1600, height:120}
				end if
				-- one-line caption, lower third, with a dark scrim text box behind for legibility
				make new text item with properties {object text:theLine, position:{160, 870}, width:1600, height:150}
				set presenter notes to theNote
			end tell
		end repeat

	end tell

	set savePath to "/Users/cvr/Library/Mobile Documents/com~apple~Keynote/Documents/why_suffering_narrative.key"
	set slideCount to (count of slides of theDoc)
	save theDoc in POSIX file savePath

	-- Cleanup: the build document was created untitled, so after persisting it to the
	-- named path it (and any sibling autosaves) linger as "Untitled N.key" scratch
	-- documents. Close every still-open document whose name starts with "Untitled"
	-- WITHOUT saving, so they never get written to disk in the first place.
	repeat with d in (every document whose name starts with "Untitled")
		close d saving no
	end repeat

	return "NARRATIVE DECK DONE — slides: " & slideCount
end tell
