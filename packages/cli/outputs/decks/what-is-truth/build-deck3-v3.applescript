-- build-deck3-v3.applescript
-- "Why Suffering? — The Trial of God" (What is Truth, Part III v3) — fresh ~98-slide rebuild.
-- New thesis: created as WITNESSES (not worshippers) to vindicate God's character in the great controversy.
-- Basic Black; masters: Title (title+body), Section (marker), Quote (item 2 = body / item 1 = attribution).
-- Scripture/history/plain-reason on slides; EGW shapes presenter notes only. [IMAGE: …] = later art pass.
-- Verses verbatim KJV from gather/deck3-v3-verses.md. Source: PLAN-NIGHT3-V3.md + CONTEXT.md.

tell application "Keynote"
	activate
	set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
	tell theDoc

		----------------------------------------------------------------
		-- §1 — THE HOOK: THE QUESTION (open on the problem, not the thesis)
		----------------------------------------------------------------
		set base slide of slide 1 to master slide "Title"
		tell slide 1
			set object text of default title item to "WHY SUFFERING?"
			set object text of default body item to "What is Truth — Part III"
			set presenter notes to "Welcome back. Two nights of evidence that the Book is reliable and above human origin. Tonight: the hardest question any worldview faces — and what this Book actually SAYS about it. [IMAGE: series title art, matching Parts I-II]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The riddle"
			set object text of default body item to "Is God willing to prevent suffering, but not able? Then He is not all-powerful." & linefeed & "Is He able, but not willing? Then He is not all-good." & linefeed & "Is He both able and willing? Then where does suffering come from?" & linefeed & "— traditionally ascribed to Epicurus (via Lactantius); authorship debated — the challenge stands regardless"
			set presenter notes to "Lead with the skeptic's strongest punch. ATTRIBUTION CARE: survives only in Lactantius (c. 313 CE); scholars doubt Epicurus authored it — the slide says so, which protects you. The whole night answers this riddle."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Two questions for any answer"
			set object text of default body item to "1. Where did suffering come from?" & linefeed & "2. Does it ever actually END?" & linefeed & "Tonight's answer will be judged by the same two questions."
			set presenter notes to "State the test once so it doesn't feel rigged. Hold the Bible to the same standard you'd hold any worldview."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A different shape of answer"
			set object text of default body item to "Not 'suffering is an illusion.' Not 'it's all karma.' Not 'blind, pitiless indifference.'" & linefeed & "The Bible's answer is a STORY — a trial that began before you existed, and is not finished yet."
			set presenter notes to "The turn. Every other answer is a proposition; the Bible's is a courtroom narrative. To understand it we have to go back — before humanity."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The answer starts before us"
			set object text of default body item to "To understand the suffering in front of you," & linefeed & "we have to start before there was a single human being." & linefeed & "Before there was any sin at all."
			set presenter notes to "Plant the hook for §2. Resist stating the thesis (you were created as a witness) — that reveal is held until §8. [IMAGE: a field of stars / deep space — restrained]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "BEFORE US"
			set presenter notes to "Section break into the pre-history of the controversy."
		end tell

		----------------------------------------------------------------
		-- §2 — THE ANGELIC ORDER BEFORE SIN
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…When the morning stars sang together, and all the sons of God shouted for joy?”"
			set object text of text item 1 to "— Job 38:4-7 (KJV) — a created order watched the earth being founded"
			set presenter notes to "There was an intelligent, created order BEFORE humanity — present and rejoicing when earth was laid. 'Sons of God' here = the angelic order."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“For by him were all things created… whether they be thrones, or dominions, or principalities, or powers…”"
			set object text of text item 1 to "— Colossians 1:16 (KJV)"
			set presenter notes to "Ranks and orders of created beings — thrones, dominions. A populated universe, all made good."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A universe at peace"
			set object text of default body item to "Before sin: one order, one harmony, no death, no fear." & linefeed & "And one being stood at the very top of the created order."
			set presenter notes to "Establish the baseline: love-governed harmony (GC 493.1 shaping). Sin is a deviation FROM this, not the original state. Name the highest being next."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Thou sealest up the sum, full of wisdom, and perfect in beauty… every precious stone was thy covering…”"
			set object text of text item 1 to "— Ezekiel 28:12-13 (KJV) — the highest of the created order"
			set presenter notes to "Eze 28: surface addressee is the king of Tyrus, but the language (in Eden, the anointed cherub, on the holy mountain of God) has been read for centuries as the power behind him. Say the dual reading aloud — honesty is the brand."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Thou wast perfect in thy ways from the day that thou wast created, TILL iniquity was found in thee.”"
			set object text of text item 1 to "— Ezekiel 28:15 (KJV)"
			set presenter notes to "THE hinge word: 'till.' Sin began in the HIGHEST, perfectly-made being — so it cannot be blamed on a design flaw. Perfect, then self-corrupted. Hold on 'till.'"
		end tell

		----------------------------------------------------------------
		-- §3 — THE COVERING CHERUB & THE LAW (full visual build)
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "WHAT HE GUARDED"
			set presenter notes to "Build the covering-cherub picture from scratch — the audience has zero sanctuary background. Pay it off with: he guarded the law of love."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Thou art the anointed cherub that covereth; and I have set thee so…”"
			set object text of text item 1 to "— Ezekiel 28:14 (KJV)"
			set presenter notes to "His title: 'the anointed cherub that covereth.' What does that mean? To answer, look at the one place the Bible shows us a 'covering cherub' in action — Israel's sanctuary."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A blueprint of heaven"
			set object text of default body item to "Israel was given a sanctuary — a portable temple." & linefeed & "It was not invented. It was a COPY — built to a pattern shown from heaven."
			set presenter notes to "Set up Heb 8:5 next. The earthly sanctuary is an explicit model of a heavenly reality — that's what licenses reading its furniture as a window into the throne room. [IMAGE: the wilderness sanctuary / tabernacle, full view]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…the example and shadow of heavenly things… See, that thou make all things according to the PATTERN shewed to thee in the mount.”"
			set object text of text item 1 to "— Hebrews 8:5 (KJV); cf. Exodus 25:40"
			set presenter notes to "Load-bearing: the earthly sanctuary is 'the shadow of heavenly things,' made to a heavenly pattern. So its center pictures something real in heaven."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "At its center: a gold box"
			set object text of default body item to "At the heart of the sanctuary stood the ark — a gold-covered chest." & linefeed & "And over it stood two angelic figures."
			set presenter notes to "Zoom in. Keep it concrete for the uninitiated: 'a gold box; two angel figures on top, wings stretched over it.' [IMAGE: the ark of the covenant, two cherubim over the mercy seat]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“And the cherubims shall stretch forth their wings on high, COVERING the mercy seat with their wings…”"
			set object text of text item 1 to "— Exodus 25:20 (KJV)"
			set presenter notes to "There it is — 'covering' cherubim, the same word as Lucifer's title. Two angel-figures covering the most sacred spot. Now: what were they covering?"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…in the ark thou shalt put the testimony… and I will commune with thee… from between the two cherubims which are upon the ark of the testimony.”"
			set object text of text item 1 to "— Exodus 25:21-22 (KJV)"
			set presenter notes to "Inside the box: 'the testimony.' God Himself speaks from BETWEEN the covering cherubim, over the ark. What is 'the testimony'?"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…and put the tables in the ark which I had made; and there they be.”"
			set object text of text item 1 to "— Deuteronomy 10:5 (KJV) — the tables of the law"
			set presenter notes to "The 'testimony' inside the ark = the tables of the law (the Ten Commandments). So the covering cherubim guarded THE LAW. Connect the dots out loud."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Love worketh no ill to his neighbour: therefore love is the fulfilling of the law.”"
			set object text of text item 1 to "— Romans 13:10 (KJV); cf. Matthew 22:37-40"
			set presenter notes to "The payoff: the law is not arbitrary rules — it IS love, codified (Matt 22:37-40, 'on these hang all the law'). So what did the covering cherub guard? The law of love at the center of God's government."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Lucifer covered the law of love"
			set object text of default body item to "The highest being in creation stood guard over one thing:" & linefeed & "the law of love at the heart of God's government." & linefeed & "Until iniquity was found in him."
			set presenter notes to "Land the whole §3 build in one line. He of all beings KNEW the law was love. Which makes what he did next astonishing. [IMAGE: light radiating from the throne, a guardian figure]"
		end tell

		----------------------------------------------------------------
		-- §4 — GOD IS LOVE, PROVEN BY FREE WILL
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "GOD IS LOVE"
			set presenter notes to "The axiom everything must survive. Then the hard, counterintuitive turn: the very possibility of sin proves God's love."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“He that loveth not knoweth not God; for God IS love.”"
			set object text of text item 1 to "— 1 John 4:8 (KJV)"
			set presenter notes to "Not 'God loves' — God IS love. His essence. Every move tonight must stay consistent with this, or the story fails its own test."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Love cannot be compelled"
			set object text of default body item to "A forced “I love you” is not love." & linefeed & "Love requires freedom." & linefeed & "Freedom creates risk."
			set presenter notes to "Three lines, slowly — the hinge of the whole theodicy (PP 34.3 shaping: 'He takes no pleasure in a forced obedience; and to all He grants freedom of will'). [IMAGE: open hands]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…choose you this day whom ye will serve… but as for me and my house, we will serve the LORD.”"
			set object text of text item 1 to "— Joshua 24:15 (KJV)"
			set presenter notes to "Allegiance invited, never coerced — even by God Himself, at the highest level of His own story."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The proof is the possibility"
			set object text of default body item to "Here is the hard truth:" & linefeed & "the fact that sin COULD arise at all" & linefeed & "is itself the proof that God grants real freedom." & linefeed & "A universe where rebellion is impossible is a universe without love."
			set presenter notes to "Counterintuitive but central. The skeptic blames God for the possibility of evil; reframe it: that possibility is the cost of genuine freedom, which is the cost of genuine love. Robots can't rebel — and can't love."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A foreign element"
			set object text of default body item to "When iniquity first stirred, it was utterly NEW." & linefeed & "Nothing in all creation had ever seen it." & linefeed & "Sin was a foreign, unknown element — with no precedent, and no remedy yet shown."
			set presenter notes to "Crucial for §6: because sin was unprecedented, the watching universe had no way yet to understand it. This is why God could not simply destroy it on sight — there'd be no shared understanding of WHY. (GC 492.2 shaping: sin is 'mysterious, unaccountable.')"
		end tell

		----------------------------------------------------------------
		-- §5 — THE COVER-UP: "THE LAW MUST BE WRONG"
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Thine heart was lifted up because of thy beauty, thou hast corrupted thy wisdom by reason of thy brightness…”"
			set object text of text item 1 to "— Ezekiel 28:17 (KJV)"
			set presenter notes to "The mechanism: self-exaltation (Isa 14:13-14, the five 'I wills' — notes). Not a grievance, an ambition: 'I will be like the most High.' Pride in his own brightness."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Sin's first instinct: cover yourself"
			set object text of default body item to "What is the very first thing sin does?" & linefeed & "We see it the moment it reaches humans —"
			set presenter notes to "Bridge to Gen 3 to show sin's universal first reaction — then apply it back to Lucifer."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…they knew that they were naked; and they sewed fig leaves together… and Adam and his wife HID themselves from the presence of the LORD God.”"
			set object text of text item 1 to "— Genesis 3:7-8 (KJV)"
			set presenter notes to "Sin's first instinct, every time: cover up and hide. Then justify. Watch the same pattern run in the original rebellion."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The cherub covers himself"
			set object text of default body item to "The covering cherub — who guarded the law of love —" & linefeed & "now turns to cover his OWN guilt." & linefeed & "And to justify himself, one thing has to be true:"
			set presenter notes to "The pivot of the whole controversy. A guilty conscience has two options: admit the law is right and I am wrong, or insist the law is wrong. He chose the second. (PP 41.3 shaping: he 'cast doubt upon the plainest statements of Jehovah.')"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "“THE LAW MUST BE WRONG”"
			set object text of default body item to "If the standard is unjust, then breaking it isn't sin." & linefeed & "So the accusation is born: God's law is bondage. God's government is unfair." & linefeed & "God Himself is the problem."
			set presenter notes to "Name the accusation — this is the charge the rest of the night answers (GC 498.2 shaping: 'All evil he declared to be the result of the divine administration'). It cannot be answered by force, only disproven. Hold here."
		end tell

		----------------------------------------------------------------
		-- §6 — HOW DOES LOVE RESPOND?
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "HOW DOES LOVE RESPOND?"
			set presenter notes to "The 'why didn't God just destroy him?' problem — but framed from God's side: a brand-new charge, a watching universe that has never seen sin."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Option one: destroy him now"
			set object text of default body item to "Suppose God ends Lucifer the instant sin appears." & linefeed & "What does a universe that has NEVER seen sin conclude?" & linefeed & "“The accusation must have had something to it — or why silence it by force?”"
			set presenter notes to "A seed is planted. Destroying the accuser the moment he speaks looks exactly like a guilty defendant silencing a witness. The doubt would survive his death."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Option two: destroy him at open rebellion"
			set object text of default body item to "Suppose God waits until the rebellion is open, then ends it." & linefeed & "Same seed: “Was God just? Or did He crush a challenger?”" & linefeed & "Force can WIN a fight. It cannot ANSWER a charge."
			set presenter notes to "Either way, force proves the accuser's point — that God rules by power, not by right. (GC 498.3, load-bearing: 'they would have served God from fear rather than from love… Evil must be permitted to come to maturity.')"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Love cannot answer with force"
			set object text of default body item to "A government of love cannot be defended by the very thing it's accused of." & linefeed & "The charge has to be DISPROVEN — out in the open, for everyone to see." & linefeed & "And that requires a trial."
			set presenter notes to "The conclusion that drives the rest of the night. This is the same logic Nights 1-2 ran on (test it, don't take it on force). Pivot to the necessity of a case — but first, prove the conflict had two distinct chapters."
		end tell

		----------------------------------------------------------------
		-- §7 — THE TWO FALLS
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "CAST DOWN — TWICE"
			set presenter notes to "Most people think Satan fell once. The Bible shows two distinct castings-down, proven from two SEPARATE text sets. NOTE (from exegesis check): do NOT claim the first fall is absent from Rev 12 — v.4's 'third part of the stars' is plausibly the first fall's aftermath. Present Rev 12 as containing BOTH; vv.7-12 are the second."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The first fall"
			set object text of default body item to "Eze 28:16 — “I will cast thee… O covering cherub.”" & linefeed & "Isa 14:12 — “How art thou fallen from heaven, O Lucifer.”" & linefeed & "Jude 6 — the angels “which kept not their first estate.”" & linefeed & "Luke 10:18 — “I beheld Satan as lightning fall from heaven.”"
			set presenter notes to "Four texts for the original rebellion, before humanity. Don't over-rest on Luke 10:18 alone (it's present-tense, arguably about ongoing defeat) — it's corroboration, not the whole proof. The Eze/Isa/Jude texts carry it."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "But there is a SECOND casting-down"
			set object text of default body item to "Revelation 12 describes a war in heaven and a casting-out." & linefeed & "Most read it as the first fall." & linefeed & "Read the sequence — and watch WHEN it happens."
			set presenter notes to "Set up the close reading. The payoff is that Rev 12's datable marker puts vv.7-12 AFTER the cross."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“And she brought forth a man child… and her child was caught up unto God, and to his throne.”"
			set object text of text item 1 to "— Revelation 12:5 (KJV) — the incarnation and ascension"
			set presenter notes to "The chapter's own timeline: the man-child (Christ) is born and 'caught up unto God' (the ascension). That already places us at/after the first century. THEN comes the war (next slide)."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“And there was war in heaven… And the great dragon was cast out, that old serpent, called the Devil, and Satan…”"
			set object text of text item 1 to "— Revelation 12:7-9 (KJV)"
			set presenter notes to "The war and casting-out come AFTER the ascension in the chapter's own order. But the decisive proof of timing is the next verse."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…the accuser of our brethren is cast down… And they overcame him by THE BLOOD OF THE LAMB…”"
			set object text of text item 1 to "— Revelation 12:10-11 (KJV)"
			set presenter notes to "THE anchor. 'The blood of the Lamb' did not exist before creation — there was no slain Lamb until Calvary. So this casting-down is dated AFTER the cross. The recapitulation objection actually becomes the proof: a symbol drawn from Calvary cannot describe a pre-creation event. (Frame the 'casting down' as Satan losing his STANDING as accuser — his access to the court — not a second geographic eviction; that's the most defensible read.)"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Now is the judgment of this world: now shall the prince of this world be cast out.”"
			set object text of text item 1 to "— John 12:31 (KJV) — spoken days before the cross"
			set presenter notes to "Jesus Himself dates it: 'NOW' — at the cross. Future tense, days before Calvary. The cross is the moment the accuser is cast down. (1-line answer to the skeptic: 'the blood of the Lamb didn't exist before creation, so Rev 12:11 can't be describing the original fall.')"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Two chapters, one conflict"
			set object text of default body item to "First: cast out of his POSITION — the rebellion in heaven." & linefeed & "Second: cast down from his STANDING — at the cross, the accuser loses his case." & linefeed & "Between them runs the whole story of this world."
			set presenter notes to "The payoff: the cross is where the case is DECIDED, not where the rebellion starts. This frames §12. Now — why does the trial need US?"
		end tell

		----------------------------------------------------------------
		-- §8 — THE NECESSITY OF A CASE (thesis reveal)
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE TRIAL NEEDS WITNESSES"
			set presenter notes to "Build to the reveal: the trial required impartial third-party witnesses — and that's why YOU exist. Hold the reveal until the dedicated slide."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A hardened charge"
			set object text of default body item to "Once Lucifer would not back down, the accusation stood — unanswered." & linefeed & "And a charge that won't be retracted can only be settled one way: disproven, before witnesses."
			set presenter notes to "The case is now a necessity. Heaven's angels are already parties to the dispute (a third took Satan's side, Rev 12:4) — so they can't be the impartial jury. You need a THIRD party."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…at the mouth of two witnesses, or at the mouth of three witnesses, shall the matter be established.”"
			set object text of text item 1 to "— Deuteronomy 19:15 (KJV); cf. 17:6"
			set presenter notes to "God's own justice principle: a matter is established only by independent witnesses. The Judge binds Himself to it. So the trial of God's character requires witnesses outside the original dispute."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Who could the witnesses be?"
			set object text of default body item to "Not the angels who already took sides." & linefeed & "The trial needed a NEW order of beings —" & linefeed & "made after the conflict, given the facts, free to weigh it."
			set presenter notes to "The setup for the reveal. Let the audience feel the gap the trial needs filled — then fill it with them."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "You were created because you were NEEDED"
			set object text of default body item to "Humanity was made for the jury." & linefeed & "Not to flatter God — to WITNESS Him." & linefeed & "“Created for His glory” means created to see, and vindicate, His true character."
			set presenter notes to "THE REVEAL — the thesis lands here, late, as a payoff. DISARM the narcissist-deity caricature explicitly: God didn't need applause, He needed honest witnesses. 'Glory' = a cleared name, not ego. This reframes the whole night and answers 'why am I here?' Let it land. [IMAGE: a single human figure facing a vast courtroom/cosmos]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…we are made a spectacle unto the world, and to angels, and to men.”"
			set object text of text item 1 to "— 1 Corinthians 4:9 (KJV)"
			set presenter notes to "The trial is public; the jury is real (Eph 3:10 — God's wisdom made known to the watching powers, notes). You are not an accident. You are a witness."
		end tell

		----------------------------------------------------------------
		-- §9 — THE TREE & THE FALL: the prosecutor's platform
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "BOTH SIDES GET A HEARING"
			set presenter notes to "The tree reframed: justice requires the prosecutor reach the jury too. Access, NOT entrapment."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A fair trial hears both sides"
			set object text of default body item to "Justice demands the prosecutor get to make his case to the jury — not just the defense." & linefeed & "A courtroom that silences one side isn't justice."
			set presenter notes to "This is the move that makes the tree make sense to a skeptic. If God barred the accuser entirely, He'd be doing the very thing He's accused of. The tree is the venue that fairness required."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Of EVERY tree of the garden thou mayest freely eat: but of the tree of the knowledge of good and evil, thou shalt not eat…”"
			set object text of text item 1 to "— Genesis 2:16-17 (KJV)"
			set presenter notes to "Total abundance — 'of EVERY tree, freely' — and ONE boundary. The single tree was the accuser's permitted platform: the one place he could present his case to the witnesses."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Access, not entrapment"
			set object text of default body item to "God granted the accuser ACCESS — one tree." & linefeed & "He told the jury the stakes plainly: “thou shalt surely die.”" & linefeed & "And He forced NOTHING. That is a fair trial, not a trap."
			set presenter notes to "Disarm the entrapment objection head-on (the skeptic WILL raise it). Full disclosure + no coercion = the opposite of a trap. The risk was the price of a real trial."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The prosecutor's best move"
			set object text of default body item to "What would a prosecutor do with a platform?" & linefeed & "Recruit witnesses. Gain a base of operations." & linefeed & "Turn the jury itself."
			set presenter notes to "Frame the temptation as legal strategy, not just seduction. If he can flip the witnesses, he controls the testimony."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…Ye shall not surely die… ye shall be as gods, knowing good and evil.”"
			set object text of text item 1 to "— Genesis 3:4-5 (KJV)"
			set presenter notes to "The pitch IS the original accusation, repackaged for the jury: God is holding out on you; His rule protects His privilege, not your good. Same charge, new courtroom."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…she took of the fruit thereof, and did eat, and gave also unto her husband with her; and he did eat.”"
			set object text of text item 1 to "— Genesis 3:6 (KJV)"
			set presenter notes to "The jury believed the accuser. Don't moralize the fruit — the issue is allegiance: whose word about God did humanity trust? That choice rearranged the planet."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“All this power will I give thee, and the glory of them: for that is DELIVERED unto me…”"
			set object text of text item 1 to "— Luke 4:6 (KJV) — and Jesus did not dispute the claim"
			set presenter notes to "Dominion changed hands. Satan claims the world was 'delivered' to him, and Jesus — who contradicts liars for a living — lets it stand. The accuser now has a base of operations."
		end tell

		----------------------------------------------------------------
		-- §10 — SATAN THINKS HE HAS WON
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "He thought he had won"
			set object text of default body item to "A kingdom. A jury turned. A base of operations." & linefeed & "The accuser believed the case was over — and his."
			set presenter notes to "Let the audience feel the apparent defeat. The fall looks like the prosecutor's total victory."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…the god of this world hath blinded the minds of them which believe not…”"
			set object text of text item 1 to "— 2 Corinthians 4:4 (KJV)"
			set presenter notes to "He runs the base now, and works to keep the lights off — to hide God's true character. Say it gently; this explains why God can feel hidden."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "But he did not know the love of God"
			set object text of default body item to "He had not reckoned with the depths of the Father's and the Son's love —" & linefeed & "a plan already in place to do TWO things at once."
			set presenter notes to "Pivot to the plan of salvation: redeem humanity AND conclude the case. Two birds, one cross. Set it up; deliver it in §12."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "One plan, two purposes"
			set object text of default body item to "1. Redeem humanity — buy the witnesses back." & linefeed & "2. Conclude the case — answer the accusation before the universe, forever." & linefeed & "But first, the case had to be allowed to FULLY unfold."
			set presenter notes to "State the two purposes; then answer the night's headline question — why let suffering run at all — before paying off the cross."
		end tell

		----------------------------------------------------------------
		-- §11 — WHY SIN & SUFFERING IS PERMITTED TO RUN
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "WHY LET IT RUN?"
			set presenter notes to "THE answer to why-suffering: the case must mature to be seen. Lead with the diverging-lines image."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Two lines, one degree apart"
			set object text of default body item to "Two lines that start a single degree apart look identical at first." & linefeed & "Only when they run far enough does the gap become a chasm." & linefeed & "Evil is the same: its true nature is invisible at the start."
			set presenter notes to "THE core illustration. A principle's real fruit only shows when it's fully extended. To judge the accuser's claims fairly, the universe has to SEE where they lead. [IMAGE: two lines diverging from a near-shared origin — small angle, huge separation far right]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The case must mature"
			set object text of default body item to "God lets Satan develop his principles to the utmost —" & linefeed & "so the whole universe can see, for itself, what rebellion actually produces." & linefeed & "Not because God is absent. Because the verdict must be UNANSWERABLE."
			set presenter notes to "(GC 499.1, load-bearing: 'Satan must more fully develop his principles, that his charges… might be seen in their true light by all created beings.') History itself is the evidence. The suffering you indict God for is the case running its course — in public."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“For we know that the whole creation groaneth and travaileth in pain together until now.”"
			set object text of text item 1 to "— Romans 8:22 (KJV)"
			set presenter notes to "The Bible does not pretend the groaning isn't real. It names it — and gives it a terminus. The groaning is the exhibit, not the verdict."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Why not destroy him NOW?"
			set object text of default body item to "Same reason as the beginning — but louder." & linefeed & "Destroy the rebel before the case is seen, and the doubt simply regrows." & linefeed & "You don't kill a weed by cutting the stem. You dig out the root."
			set presenter notes to "The seed/root image — the user's own. Premature destruction replants the seed (someone, somewhere, wonders if God was unjust). The only permanent cure is a verdict everyone can see."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…he will make an utter end: affliction shall not rise up the SECOND time.”"
			set object text of text item 1 to "— Nahum 1:9 (KJV)"
			set presenter notes to "God's stated goal. The point of letting it run once, fully, is so it NEVER runs again. (GC 504.1: extermination at the END vindicates love, where at the start it would have planted fear — the same act means opposite things before and after the evidence is in.) Destruction at the root, once, forever."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "And He did not watch from a distance"
			set object text of default body item to "The case had to run — but God did not sit outside it."
			set presenter notes to "Brief secondary support: the intellectual answer (the case must mature) is paired with the emotional one (He entered the suffering). Two slides, then move."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“In all their affliction he was afflicted…”  ·  “Jesus wept.”"
			set object text of text item 1 to "— Isaiah 63:9 ; John 11:35 (KJV)"
			set presenter notes to "Not a spectator God. 'In all THEIR affliction HE was afflicted'; at a graveside He was about to empty, He still wept. Unique among worldviews — He felt it from the inside. Let it breathe."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“The Lord is not slack concerning his promise… but is longsuffering to us-ward, not willing that any should perish…”"
			set object text of text item 1 to "— 2 Peter 3:9 (KJV)"
			set presenter notes to "The delay reframed: not absence, not impotence — mercy with a clock. Every extra day is somebody's rescue window. Maybe yours."
		end tell

		----------------------------------------------------------------
		-- §12 — THE CROSS: VINDICATION FIRST
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE VERDICT: THE CROSS"
			set presenter notes to "Stay in the courtroom. Lead with vindication (the case concludes); the personal bridge is the payoff in §14. The cross is what the whole trial was FOR."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The prosecutor's sharpest charge"
			set object text of default body item to "If the law is just, the lawbreaker cannot simply be pardoned." & linefeed & "Justice and mercy cannot coexist." & linefeed & "Pick one, God."
			set presenter notes to "(DA 761.4 shaping: Satan 'declared that justice was inconsistent with mercy.') The dilemma is real — every court faces it. The cross takes BOTH horns."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "He did not waive the law — He absorbed it"
			set object text of default body item to "God did not change the rules to excuse us." & linefeed & "He paid them. Himself." & linefeed & "“God was in Christ, reconciling the world unto himself.” — 2 Corinthians 5:19"
			set presenter notes to "(DA 762.1 shaping: 'God did not change His law, but He sacrificed Himself, in Christ.') Justice satisfied AND mercy extended — the 'pick one' dilemma collapses. The Lawgiver pays the law's own penalty."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“But he was wounded for our transgressions… and with his stripes we are healed… the LORD hath laid on him the iniquity of us all.”"
			set object text of text item 1 to "— Isaiah 53:5-6 (KJV) — preserved in the Great Isaiah Scroll, copied before the cross"
			set presenter notes to "The substitution chapter. KEEP the scroll-predates-the-event point (the Great Isaiah Scroll, ~125 BC, physically predates the crucifixion) — but DO NOT say '~7 centuries early' (that picks a fight over authorship dating you don't need). The pre-event manuscript is the clean claim."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The accuser unmasked"
			set object text of default body item to "Given a free hand, the accuser tortured and killed the only innocent man who ever lived." & linefeed & "Whatever sympathy his case still had — died at the cross."
			set presenter notes to "(DA 761.2 shaping: 'He had revealed himself as a murderer… the last link of sympathy between Satan and the heavenly world was broken.') The prosecutor's OWN work condemned him. Keep the agency careful: the powers were publicly exposed in what was done to the innocent Christ."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…having spoiled principalities and powers, he made a shew of them OPENLY, triumphing over them in it.”"
			set object text of text item 1 to "— Colossians 2:15 (KJV)"
			set presenter notes to "'Openly' — before the watching universe. The cross is the public exhibit that answers the charge. Paul saw the same trial."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The charge collapses"
			set object text of default body item to "“God is selfish.” — He gave Himself." & linefeed & "“His law is bondage.” — He died rather than break it." & linefeed & "“He rules by force.” — He won by love, in the open." & linefeed & "The case is answered. Forever."
			set presenter notes to "The vindication, point by point — each accusation from §5 answered by the cross. This is the verdict the whole trial was for. Pause. THEN turn it personal in §14 — but first, the standard."
		end tell

		----------------------------------------------------------------
		-- §13 — WHOSE STANDARD? (hinge: vindication -> bridge)
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "BY WHOSE STANDARD?"
			set presenter notes to "Placed AFTER the cross has redefined the standard as love. The insufficiency of our private standard lands as GOOD NEWS, not condemnation. Do not accuse the room; lead with the good news on the back end."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Our private standard"
			set object text of default body item to "“I've done my best.”" & linefeed & "“I'm a good person.”" & linefeed & "“God sees my effort.”" & linefeed & "Each of us grades ourselves on a standard we set."
			set presenter notes to "Name it gently — everyone in the room runs on one of these. Don't attack it yet; just surface it."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“There is a way which SEEMETH right unto a man, but the end thereof are the ways of death.”  ·  “Every way of a man is right in his own eyes…”"
			set object text of text item 1 to "— Proverbs 14:12 ; 21:2 (KJV)"
			set presenter notes to "The problem with self-grading: it always feels right from the inside. A trial can't run on the defendant's own scorecard; a universe can't rest on billions of conflicting private standards."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "There is only ONE standard"
			set object text of default body item to "“Thou shalt love… on these two commandments hang all the law.” — Matthew 22:37-40" & linefeed & "The standard was never “did you try.”" & linefeed & "It is love itself — the same law the cherub once guarded."
			set presenter notes to "Loop back to §3: the standard is the law of love. This is what God's character was vindicated BY at the cross — and it's the one measure that applies to everyone, every culture (criterion 4, universal, embodied here)."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…all have sinned, and come short of the glory of God.”  ·  “…all our righteousnesses are as filthy rags.”"
			set object text of text item 1 to "— Romans 3:23 ; Isaiah 64:6 (KJV)"
			set presenter notes to "And measured by love itself — none of us makes it. Not the worst of us; ALL of us. Say it as a shared diagnosis ('we'), never as an accusation aimed at the skeptic."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…God shall bring every work into judgment, with every secret thing…”"
			set object text of text item 1 to "— Ecclesiastes 12:13-14 (KJV)"
			set presenter notes to "The future is real — there is an accounting. This is the stakes. But the next slide turns the bad news inside-out."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“NOT by works of righteousness which we have done, but according to his mercy he saved us…”"
			set object text of text item 1 to "— Titus 3:5 (KJV)"
			set presenter notes to "The payoff: the fact that none of us meets the standard is EXACTLY why the bridge exists. Rescue is grace, not achievement. Your best was never the plan — His sacrifice was. The insufficiency is good news. Every human 'my standard is fine' was the first rebellion in miniature ('the law must be wrong') — and the cross answers it."
		end tell

		----------------------------------------------------------------
		-- §14 — THE BRIDGE & HOW IT ENDS
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE BRIDGE"
			set presenter notes to "Now the personal payoff: the same act that vindicated God reconnects YOU. Then how it ends."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Behold, what manner of love the Father hath bestowed upon us, that we should be called the sons of God…”"
			set object text of text item 1 to "— 1 John 3:1 (KJV)"
			set presenter notes to "Criterion 5 (benevolent) gets its verdict here. The cross didn't just win a case — it built a bridge back to God for the very witnesses who turned. 'What manner of love.' [IMAGE: a gulf/chasm with a bridge of light across it]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "One act. Both results."
			set object text of default body item to "The same cross that cleared God's name" & linefeed & "reopens the door home for you." & linefeed & "Vindication and rescue — inseparable."
			set presenter notes to "Tie the two axes together: you cannot reconnect humanity without answering the charge, because both required God to absorb the law's penalty Himself. One stroke, two results."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…the dead were judged out of those things which were written in the books, according to their works.”"
			set object text of text item 1 to "— Revelation 20:12 (KJV)"
			set presenter notes to "The judgment is evidence-based, recorded, PUBLIC — 'the books were opened.' God ends the case the way He ran it: in the open. Every question answered before the assembled universe (GC 666-671, notes)."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain…”"
			set object text of text item 1 to "— Revelation 21:4 (KJV)"
			set presenter notes to "The payoff verse of the whole night. The groaning of Romans 8:22 — ended, personally. Read it slowly."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“And there shall be no more curse…”"
			set object text of text item 1 to "— Revelation 22:3 (KJV)"
			set presenter notes to "Eden bookended; the curse reversed. And — back to Nahum 1:9 — affliction will not rise a second time. Secured not by force, but by a verdict the whole universe witnessed. That's the difference between this ending and a fragile peace."
		end tell

		----------------------------------------------------------------
		-- §15 — THE VERDICT & YOUR MOVE
		----------------------------------------------------------------
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "YOUR MOVE"
			set presenter notes to "Bring the series home. Score the criteria ONCE here — embodied all night, named now."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The scorecard"
			set object text of default body item to "3. Practical ✓ — it explains the world you actually live in." & linefeed & "4. Universal ✓ — one controversy, every culture, every human heart." & linefeed & "5. Benevolent ✓ — it cost the Author everything. What manner of love."
			set presenter notes to "The only place the criteria are scored. Criteria 1-2 were Nights 1-2 (reliable record, above human origin); tonight finished 3-5. Read line 5 exactly."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Three nights ago, you took a wager"
			set object text of default body item to "If a source met all five — would you follow it?" & linefeed & "The case is in. The witnesses have testified." & linefeed & "Now YOU judge."
			set presenter notes to "Reframed close (DO NOT say 'you said yes' — the v2 reviewers flagged it as putting words in skeptics' mouths). The whole night earned the right to say: you were made for the jury; here is the evidence; the verdict is yours. Non-coercion is the night's THESIS, not just its manner."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“These were more noble… in that they… searched the scriptures daily, whether those things were so.”"
			set object text of text item 1 to "— Acts 17:11 (KJV)"
			set presenter notes to "The Bible calls people NOBLE for fact-checking the preacher. Don't take my word for any of this — check me. Same posture as Nights 1-2."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him…”"
			set object text of text item 1 to "— Revelation 3:20 (KJV)"
			set presenter notes to "He knocks. He does not break in. The God who refused to win the cosmos by force will not force you either — consistent to the last page. [IMAGE: a door, light beneath it]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Your move"
			set object text of default body item to "Study with me — one hour, your questions, any week night." & linefeed & "Or start alone: the Gospel of John, one chapter a night." & linefeed & "Test it the way we tested everything these three nights." & linefeed & "“O taste and see that the LORD is good.” — Psalm 34:8"
			set presenter notes to "The ask, both lanes: contact (study together — signup/number ready) and zero-pressure (read John). Close on Ps 34:8 — the Book's own empirical challenge. Prayer if the room allows; otherwise a warm thank-you and availability."
		end tell

	end tell

	save theDoc in POSIX file "/Users/cvr/Library/Mobile Documents/com~apple~Keynote/Documents/why_suffering_v3.key"
	return "DECK3 v3 DONE — slides: " & (count of slides of theDoc)
end tell
