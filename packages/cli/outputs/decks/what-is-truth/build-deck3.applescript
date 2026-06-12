-- build-deck3.applescript
-- "What is Truth — Part III: Why Suffering?" — fresh 88-slide build.
-- Basic Black theme; masters: Title (title+body), Section (marker), Quote (text item 2 = quote, text item 1 = attribution), Blank.
-- Scripture/history only on slides; EGW shapes presenter notes only. [IMAGE: …] marks the user's later art pass.
-- Sources: gather/deck3-verses.md (KJV verbatim), gather/deck3-shaping.md, gather/deck3-worldviews.md.

tell application "Keynote"
	activate
	set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
	tell theDoc

		-- ===== §1 THE SCOREBOARD (1-5) =====
		set base slide of slide 1 to master slide "Title"
		tell slide 1
			set object text of default title item to "WHAT IS TRUTH"
			set object text of default body item to "Part III: Why Suffering?"
			set presenter notes to "Welcome back. Two nights of evidence; tonight, the message. [IMAGE: series title art, matching Parts I-II]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE SCOREBOARD"
			set presenter notes to "Recap briskly. Night 1: relative truth collapsed under real evil; we wrote a five-criteria spec for an absolute moral truth, and you took a wager. Night 2: criterion 2 on trial — Daniel's manuscripts physically predate the fulfillments; the 70 weeks landed on AD 27; an 1838 published calculation named August 1840, and friend and foe alike conceded the event."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Five criteria"
			set object text of default body item to "1. Consistent written record ✓  (5,800+ manuscripts; Dead Sea Scrolls)" & linefeed & "2. Above human origins ✓  (the prophecies — tested last night)" & linefeed & "3. Practical ✓   4. Universal ✓" & linefeed & "5. Benevolent — ?"
			set presenter notes to "Four criteria evidenced. One question mark left — and it is the biggest one."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The last criterion"
			set object text of default body item to "Benevolent: does it actually FIX our problem?" & linefeed & "Tonight is not more proof THAT the Book is divine." & linefeed & "Tonight is what the divine Book SAYS."
			set presenter notes to "Frame shift: from apologetics to content. The audience earned this night by sitting through the evidence."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.”"
			set object text of text item 1 to "— Jeremiah 29:11 (KJV)"
			set presenter notes to "God's stated intent — 'peace, and not of evil.' That is the claim on trial tonight, against everything you have ever suffered."
		end tell

		-- ===== §2 THE QUESTION (6-15) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "WHY SUFFERING?"
			set presenter notes to "The question every worldview must answer — and the reason many of you are not religious. Honor that. [IMAGE: a hospital corridor / empty chair — restrained, not manipulative]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The riddle"
			set object text of default body item to "Is God willing to prevent suffering, but not able? Then He is not all-powerful." & linefeed & "Is He able, but not willing? Then He is not all-good." & linefeed & "Is He both able and willing? Then where does suffering come from?" & linefeed & "— traditionally ascribed to Epicurus (via Lactantius, De Ira Dei 13); authorship debated — the challenge stands regardless"
			set presenter notes to "Lead with their strongest punch. ATTRIBUTION CARE: it survives only in Lactantius (c. 313 CE); scholars (Glei 1988) doubt Epicurus authored it — the slide says so, which protects you. The whole night answers this riddle: He is willing, He is able, and there is a reason it is not done YET — a reason you can inspect."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Two questions for every worldview"
			set object text of default body item to "1. Where did suffering come from?" & linefeed & "2. Does it ever actually END?" & linefeed & "Same two questions for every view tonight — including the Bible's."
			set presenter notes to "State the rule ONCE so it doesn't feel rigged. The audience watches whether you score everyone on the same scale — including yourself."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…no design, no purpose, no evil and no good, nothing but blind pitiless indifference.”"
			set object text of text item 1 to "— Richard Dawkins, River Out of Eden (1995), ch. 4 — the materialist answer"
			set presenter notes to "FAIRNESS: this is the most intellectually honest view in one respect — it refuses to pretend suffering means something. But on its own terms there is no WHY and no END; entropy wins. Diagnosis without cure. DO NOT say atheists have no morals or don't care — they fight suffering hard; it is their metaphysics that offers no remedy, not their character."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Buddhism"
			set object text of default body item to "Suffering (dukkha) arises from craving (tanha); it ends by extinguishing craving — nirvana, via the Eightfold Path." & linefeed & "(Four Noble Truths — the Buddha's first sermon)"
			set presenter notes to "FAIRNESS: Buddhism takes BOTH questions seriously — a real explanation and a real path. The honest limitation, stated gently: the cure works by releasing the attachments — the very stuff love is made of; the person is released rather than the world restored. DO NOT call it nihilistic or pessimistic; compassion (karuna) is central. No caricature."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Hinduism"
			set object text of default body item to "Suffering is karma working itself out across many lives (samsara); it ends at moksha — liberation from the cycle." & linefeed & "(Britannica: karma, samsara, moksha)"
			set presenter notes to "FAIRNESS: karma is a PRECISE explanation — nothing is random, everything is earned — and moksha is a real end. The honest tension: present suffering reads as deserved (the suffering child is reaping prior-life acts), which many find hard to square with compassion. DO NOT use caste gotchas or 'you had it coming' framing; thoughtful Hindus emphasize reducing others' suffering as itself dharma."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Islam"
			set object text of default body item to "Suffering is a test (ibtila) within God's decree — “He created death and life to test you, which of you is best in deed” (Qur'an 67:2) — with full justice in the hereafter."
			set presenter notes to "FAIRNESS: Islam answers BOTH questions — a meaningful test under a wise God, and paradise with perfect justice. The honest point: the resolution is deferred entirely to the next life, and on WHY God decrees this specific suffering the tradition counsels reverent silence (Qur'an 21:23). DO NOT call Islam fatalistic — mainstream Sunni theology affirms human responsibility alongside qadar."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "New Age"
			set object text of default body item to "Suffering is illusion or self-generated — ego, resistance, “the pain-body” (Tolle, The Power of Now) — and dissolves through awakened consciousness."
			set presenter notes to "FAIRNESS: the perception point is partly true — much suffering IS amplified by the mind, and presence-practices bring real relief. The documented critique (state it as critics state it, never as mockery): applied to a child's starvation, genocide, or trauma, 'illusion / you attracted it' becomes victim-blaming — the framework must deny the suffering is real or blame the sufferer. No cheap 'vibrations' laugh line — it alienates the seekers in the room."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“O LORD, how long shall I cry, and thou wilt not hear! … Why dost thou shew me iniquity, and cause me to behold grievance?”"
			set object text of text item 1 to "— Habakkuk 1:2-3 (KJV) — the Bible asks the question first"
			set presenter notes to "Before the Bible answers the question, it ASKS it — rawer than most skeptics dare: Job 30:26 ('when I looked for good, then evil came'); Eccl 4:1 ('the tears of such as were oppressed… no comforter'). The Book does not dodge. That alone separates it from the sales brochures."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A different shape of answer"
			set object text of default body item to "Suffering is an INTRUDER — not original, not illusion, not deserved, not forever." & linefeed & "And it will be ABOLISHED: the person kept, the world restored," & linefeed & "guaranteed by Someone outside the system."
			set presenter notes to "State it humbly — a claim to be weighed, not a trump card. Every view above either explains origin without a guaranteed external END, or offers escape that dissolves the self, defers wholly to an afterlife, or denies the suffering is real. The Bible's answer is a different SHAPE. Now weigh it."
		end tell

		-- ===== §3 LOVE REQUIRES FREEDOM (16-23) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE ANSWER BEGINS: LOVE"
			set presenter notes to "Everything that follows must stay consistent with one axiom — or the story fails on its own terms."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“He that loveth not knoweth not God; for God is love.”"
			set object text of text item 1 to "— 1 John 4:8 (KJV)"
			set presenter notes to "Not 'God loves' — God IS love (also 1 John 4:16). His essence. Hold every move tonight against this axiom; that is the test the Book invites."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Love cannot be compelled"
			set object text of default body item to "A forced “I love you” is not love." & linefeed & "Love requires freedom." & linefeed & "Freedom creates risk."
			set presenter notes to "Three lines, slowly. This is the hinge of the whole theodicy. (EGW shaping, notes only: 'God takes no pleasure in a forced obedience; and to all He grants freedom of will' — PP 34.3.) [IMAGE: open hands / unlocked door]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“I have set before you life and death, blessing and cursing: therefore choose life…”"
			set object text of text item 1 to "— Deuteronomy 30:19 (KJV)"
			set presenter notes to "God stacks the appeal — 'therefore choose LIFE' — and still leaves the choice. He argues; He does not seize."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…choose you this day whom ye will serve… but as for me and my house, we will serve the LORD.”"
			set object text of text item 1 to "— Joshua 24:15 (KJV)"
			set presenter notes to "Allegiance invited, never coerced — modeled at the highest level of the Book's own story."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Made free"
			set object text of default body item to "“So God created man in his own image, in the image of God created he him…” — Genesis 1:27" & linefeed & "Image of God = moral agency. Not automation."
			set presenter notes to "The image (Gen 1:26-27) grounds the capacity for genuine choice that love requires. Robots cannot love; that is the point of not making robots."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Come now, and let us reason together, saith the LORD…”"
			set object text of text item 1 to "— Isaiah 1:18 (KJV)"
			set presenter notes to "God's recruiting method: reason. Mark this verse — it returns at the end of the night."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The risk of freedom"
			set object text of default body item to "If creatures can truly choose love," & linefeed & "they can truly refuse it." & linefeed & "The question was never IF freedom would be tested — but what God would do when it was."
			set presenter notes to "Pivot line into the rebellion. Pause before advancing."
		end tell

		-- ===== §4 THE REBELLION (24-33) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE REBELLION"
			set presenter notes to "[IMAGE: storm / fractured light — abstract, no horns-and-pitchfork kitsch]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“And there was war in heaven: Michael and his angels fought against the dragon… And the great dragon was cast out, that old serpent, called the Devil, and Satan, which deceiveth the whole world…”"
			set object text of text item 1 to "— Revelation 12:7-9 (KJV)"
			set presenter notes to "THE ANCHOR TEXT — explicit, names 'the Devil, and Satan' directly; no interpretive caveat needed. Lead the origin-of-evil case here (v2 audit decision), and let Ezekiel 28 / Isaiah 14 be illustrative."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Where evil began"
			set object text of default body item to "“Thou wast perfect in thy ways from the day that thou wast created, till iniquity was found in thee.” — Ezekiel 28:15" & linefeed & "(spoken of the king of Tyre — long read as describing the power behind the throne)"
			set presenter notes to "HONESTY ON SLIDE (v2 audit): the surface addressee is the king of Tyrus; the Lucifer application is the traditional dual-fulfillment reading — and v13 ('thou hast been in Eden… the anointed cherub,' v14) is why readers for centuries saw more than a Phoenician king here. The point that matters: evil began in the HIGHEST created being — perfect until self-corrupted — so it cannot be blamed on a design flaw."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The five “I wills”"
			set object text of default body item to "“…I will ascend into heaven, I will exalt my throne above the stars of God… I will be like the most High.” — Isaiah 14:13-14" & linefeed & "(a taunt against Babylon's king — the same pattern of self-exaltation)"
			set presenter notes to "Same honest handling: context is the king of Babylon (Isa 14:4); 'Lucifer' renders Hebrew helel, 'morning star.' The pattern is the point: not a grievance — an ambition. 'I will be LIKE the most High': not love seeking to serve, but self seeking the throne."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A war of words, not weapons"
			set object text of default body item to "“…He was a murderer from the beginning, and abode not in the truth… he is a liar, and the father of it.” — John 8:44" & linefeed & "The rebellion's weapon was never force. It was DECEPTION."
			set presenter notes to "Jesus' own verdict. A lie about WHAT? About God — about what kind of ruler He is. Which is why the conflict cannot be settled by force: lies are not killed with swords."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…for the accuser of our brethren is cast down, which accused them before our God day and night.”"
			set object text of text item 1 to "— Revelation 12:10 (KJV)"
			set presenter notes to "Scripture's own title for the enemy: THE ACCUSER. Pivot the room: this is a courtroom, not a battlefield. (Zech 3:1-2 — a second courtroom scene, Satan 'standing to resist' a believer.)"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The accusation"
			set object text of default body item to "1. God is selfish and tyrannical." & linefeed & "2. His law is arbitrary — impossible to keep." & linefeed & "3. He buys loyalty: worship is bribery." & linefeed & "4. He is unjust and vengeful."
			set presenter notes to "Name the charges — a vague 'problem of evil' cannot be answered; a specific indictment can. Receipts: #1 Gen 3:5 ('God doth know…' — He's holding out on you); #2 the serpent's first move, 'Hath God said?'; #3 Job 1:9-11 (next slide); #4 the caricature every skeptic carries. The rest of the night answers each one with evidence."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A courtroom, not a battlefield"
			set object text of default body item to "The universe — the watching jury (“we are made a spectacle… to angels, and to men,” 1 Cor 4:9)" & linefeed & "Earth — the exhibit" & linefeed & "Satan — the prosecutor (Rev 12:10)" & linefeed & "God — the accused"
			set presenter notes to "The classroom analogy (the user's own move, LGT-1): a student stands up and claims the teacher's rules are unfair — and the whole class watches BOTH the claim and the evidence. Expelling the student doesn't answer the claim. [IMAGE: empty courtroom]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Doth Job fear God for nought? … But put forth thine hand now, and touch all that he hath, and he will curse thee to thy face.”"
			set object text of text item 1 to "— Job 1:9-11 (KJV) — the accusation in action"
			set presenter notes to "Charge #3 live: loyalty is bought — 'hast not thou made an hedge about him?' The only way to DISPROVE 'they serve you because it pays' is to let the hedge down. There is no third option; that is the terrible logic of the trial."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Watch who does the striking"
			set object text of default body item to "“So went Satan forth from the presence of the LORD, and smote Job with sore boils…” — Job 2:7" & linefeed & "God permits. The accuser afflicts."
			set presenter notes to "CRITICAL HANDLING (v2 audit): Job himself, in his grief, says 'the LORD hath taken away' (Job 1:21) — but the narration tells us who actually struck (Job 2:7). Always pair them, or the deck teaches the opposite of its own thesis. Job's faith is the right response; the narrator's camera is the right theology."
		end tell

		-- ===== §5 WHY NOT DESTROY HIM (34-39) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "WHY NOT JUST DESTROY HIM?"
			set presenter notes to "The question everyone is now asking. Good — it means they accepted the frame."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "You cannot execute an accusation"
			set object text of default body item to "Kill the accuser — the accusation survives, whispered forever." & linefeed & "A defendant who destroys his accuser looks guilty." & linefeed & "A defendant who answers with evidence wins in the open."
			set presenter notes to "The user's signature one-liners (Way Home pt 1) — plain courtroom logic, no theology needed yet. Let it land as common sense."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Force ≠ vindication"
			set object text of default body item to "If God had destroyed Lucifer on the spot," & linefeed & "the watching universe would have served Him from FEAR —" & linefeed & "and fear is exactly what the accusation claimed His government ran on." & linefeed & "The charge would have been proven by the rebuttal."
			set presenter notes to "(EGW shaping, notes only — GC 498.3: 'Had he been immediately blotted from existence, they would have served God from fear rather than from love… Evil must be permitted to come to maturity.') On the slide it stands as plain logic; it needs no authority."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…let God be true, but every man a liar; as it is written, That thou mightest be justified in thy sayings, and mightest overcome when thou art judged.”"
			set object text of text item 1 to "— Romans 3:4 (KJV)"
			set presenter notes to "THE CENTRAL VERSE OF THE NIGHT. God consents to BE JUDGED — and to win by evidence, not by silencing the court. (Interpretive note: Paul is quoting Ps 51:4 on God's faithfulness; the 'God submits to judgment' application is defensible and the KJV wording carries it — use it knowingly.) Everything in this series — testable prophecy, public fulfillment, the invitation to verify — is this verse in action."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…we are made a spectacle unto the world, and to angels, and to men.”"
			set object text of text item 1 to "— 1 Corinthians 4:9 (KJV)"
			set presenter notes to "The audience is real (also Eph 3:10 — God's wisdom made known 'unto the principalities and powers in heavenly places' through events down here). The trial is public because the verdict must hold for every onlooker, forever."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "So the claims must be tested"
			set object text of default body item to "Evil must be allowed to show what it IS —" & linefeed & "so the verdict, when it comes, stands forever. Beyond all question."
			set presenter notes to "(EGW shaping, notes only — GC 499.1: the rebellion's history becomes 'a perpetual safeguard to all holy intelligences.') The cost of a permanent answer is letting the experiment run. That cost is the world you live in — which is where we go next."
		end tell

		-- ===== §6 THE TEST COMES TO EARTH (40-47) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE TEST COMES TO EARTH"
			set presenter notes to "[IMAGE: garden / fruit — restrained]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "One tree"
			set object text of default body item to "“Of every tree of the garden thou mayest FREELY eat: but of the tree of the knowledge of good and evil, thou shalt not eat of it: for in the day that thou eatest thereof thou shalt surely die.” — Genesis 2:16-17"
			set presenter notes to "Total freedom — 'of EVERY tree, freely' — one test, stakes stated in advance. Not a minefield; a single fence, labeled."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The same lie, retold"
			set object text of default body item to "“Ye shall not surely die: for God doth know that in the day ye eat thereof… ye shall be as gods…” — Genesis 3:4-5" & linefeed & "The accusation, repackaged for humans: God is holding out on you."
			set presenter notes to "Connect it explicitly: the serpent's pitch IS charge #1 from the courtroom slide — God is selfish; His rules protect His privilege, not you. Same prosecutor, new jury."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Humanity switched sides"
			set object text of default body item to "“…she took of the fruit thereof, and did eat, and gave also unto her husband with her; and he did eat.” — Genesis 3:6" & linefeed & "We believed the accuser. And the dominion of this world changed hands."
			set presenter notes to "Don't moralize the fruit; the issue is allegiance — whose word about God did humanity trust? The answer rearranged the planet."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“All this power will I give thee, and the glory of them: for that is delivered unto me; and to whomsoever I will I give it.”"
			set object text of text item 1 to "— Luke 4:5-6 (KJV) — the devil's claim. Jesus did not dispute it."
			set presenter notes to "Satan claims the world's kingdoms were 'DELIVERED' to him — and Jesus, who contradicts liars for a living, lets the claim stand. John 12:31 next: Jesus' own title for him."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Now is the judgment of this world: now shall the prince of this world be cast out.”"
			set object text of text item 1 to "— John 12:31 (KJV)"
			set presenter notes to "'The PRINCE of this world' — Jesus' own label for Satan. Note the verse for later: it is a CROSS saying (callback in §8). The world you see is under hostile management."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The wages"
			set object text of default body item to "“Wherefore, as by one man sin entered into the world, and death by sin; and so death passed upon all men…” — Romans 5:12" & linefeed & "“For the wages of sin is death; but the gift of God is eternal life…” — Romans 6:23"
			set presenter notes to "Death is an ENTRANT — 'sin ENTERED… and death BY sin' — not part of the original design. Gen 3:17-19 in the same breath: thorns, toil, decay — the broken economy of a cursed ground. And Rom 6:23 already smuggles in the rescue: 'but the GIFT.'"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "So whose world is this?"
			set object text of default body item to "The broken world you see is NOT the world God made." & linefeed & "It is the rebellion's exhibit — running its course in front of the watching universe."
			set presenter notes to "This reframe answers half the riddle from §2: the suffering you indict God for is the evidence-in-progress AGAINST the accuser. (2 Cor 4:4 — 'the god of this world hath blinded the minds' — even our seeing is contested ground; say it gently.)"
		end tell

		-- ===== §7 SUFFERING EXPLAINED (48-56) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "WHY SUFFERING, THEN?"
			set presenter notes to "Now the mechanics — four honest pieces: harvest, hostile author, entanglement, and a God who climbs into it."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Harvest, not punishment"
			set object text of default body item to "“Be not deceived; God is not mocked: for whatsoever a man soweth, that shall he also reap.” — Galatians 6:7" & linefeed & "“They have sown the wind, and they shall reap the whirlwind.” — Hosea 8:7"
			set presenter notes to "Much suffering is CONSEQUENCE in a moral universe — compounding like interest (wind in, whirlwind out) — not lightning bolts from an offended deity. James 1:13-15 next makes the exoneration explicit."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Let no man say when he is tempted, I am tempted of God: for God cannot be tempted with evil, neither tempteth he any man… Then when lust hath conceived, it bringeth forth sin: and sin, when it is finished, bringeth forth death.”"
			set object text of text item 1 to "— James 1:13, 15 (KJV)"
			set presenter notes to "The chain runs desire → sin → death — internal to the human, explicitly NOT authored by God. The Book exonerates God of the very thing the riddle charges Him with."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "“An enemy hath done this”"
			set object text of default body item to "A man sowed good seed in his field — but while men slept, his enemy came and sowed tares among the wheat." & linefeed & "“He said unto them, An enemy hath done this.” — Matthew 13:24-28"
			set presenter notes to "Jesus' own theodicy parable. The field's owner did not plant the tares. Suffering has a HOSTILE AUTHOR — the third honest piece. [IMAGE: wheat field]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Then why not rip it out NOW?"
			set object text of default body item to "“Wilt thou then that we go and gather them up? But he said, Nay; lest while ye gather up the tares, ye root up also the wheat with them. Let both grow together until the harvest.” — Matthew 13:28-30"
			set presenter notes to "The servants ask the skeptic's exact question. The answer: every life is entangled with every other — a surgical strike on evil harvests the innocent with it (which abuser is also a father? which corrupt system also feeds people?). The only CLEAN end is at the harvest — which is scheduled (§10)."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“For he doth not afflict willingly nor grieve the children of men.”"
			set object text of text item 1 to "— Lamentations 3:33 (KJV)"
			set presenter notes to "Written from inside a national catastrophe (Jerusalem's ruins) — not from a podium. The explicit divine disposition: affliction is not His delight."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“In all their affliction he was afflicted… in his love and in his pity he redeemed them; and he bare them, and carried them all the days of old.”"
			set object text of text item 1 to "— Isaiah 63:9 (KJV)"
			set presenter notes to "Not a spectator God. 'In all THEIR affliction HE was afflicted' — He suffers WITH. The next two slides sharpen it to a point."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Jesus wept.”"
			set object text of text item 1 to "— John 11:35 (KJV) — the shortest verse in the Bible"
			set presenter notes to "At a graveside He was about to EMPTY — He still wept. Grief is not unbelief; God incarnate did it. Let this slide breathe; say almost nothing."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Not the armchair deity"
			set object text of default body item to "“For we have not an high priest which cannot be touched with the feeling of our infirmities; but was in all points tempted like as we are…” — Hebrews 4:15" & linefeed & "Whatever else you say about the Bible's God — He did not stay out of the pain."
			set presenter notes to "He has felt it from the inside: hunger, betrayal, injustice, torture, death. That is unique among the §2 answers — and it sets up the cross."
		end tell

		-- ===== §8 THE CROSS (57-66) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE ANSWER: THE CROSS"
			set presenter notes to "[IMAGE: cross silhouette — restrained] The trial's decisive exhibit."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The prosecutor's sharpest charge"
			set object text of default body item to "If the law is just, the lawbreaker cannot be pardoned." & linefeed & "Justice and mercy cannot coexist." & linefeed & "Pick one, God."
			set presenter notes to "(EGW shaping, notes only — DA 761.4: Satan 'declared… that justice was inconsistent with mercy… God could not be just, he urged, and yet show mercy to the sinner.') The dilemma is real — every human court faces it. The cross is the only answer that takes BOTH horns."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.”"
			set object text of text item 1 to "— Romans 5:8 (KJV)"
			set presenter notes to "Love demonstrated 'while we were yet sinners' — BEFORE any merit, for enemies. Evidence, not sentiment."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“For God so loved the world, that he gave his only begotten Son… For God sent not his Son into the world to condemn the world; but that the world through him might be saved.”"
			set object text of text item 1 to "— John 3:16-17 (KJV)"
			set presenter notes to "Verse 17 corrects the caricature most skeptics carry: the mission is RESCUE, not condemnation."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "He did not waive the law — He absorbed it"
			set object text of default body item to "He did not change the rules to excuse us." & linefeed & "He paid them. Himself." & linefeed & "“God was in Christ, reconciling the world unto himself.” — 2 Corinthians 5:19"
			set presenter notes to "(EGW shaping, notes only — DA 762.1: 'God did not change His law, but He sacrificed Himself, in Christ, for man's redemption.') Justice satisfied AND mercy extended — both horns taken at once. The charge of §8's opening slide collapses."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“But he was wounded for our transgressions, he was bruised for our iniquities… and with his stripes we are healed… and the LORD hath laid on him the iniquity of us all.”"
			set object text of text item 1 to "— Isaiah 53:5-6 (KJV) — written ~7 centuries early; preserved in the Great Isaiah Scroll, copied ~125 BC — before the event"
			set presenter notes to "HERE the Great Isaiah Scroll argument is VALID (v2 audit): the scroll (~125 BC) physically predates the crucifixion (AD 31) — unlike the Cyrus case, where it postdates the fulfillment. The substitution chapter was on parchment in a cave at Qumran while Rome was still a republic. Last night's method, applied to tonight's centerpiece."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The accuser unmasked"
			set object text of default body item to "At the cross the watching universe saw the accuser torture and kill the only innocent man." & linefeed & "Whatever sympathy his case still had — died there." & linefeed & "“…having spoiled principalities and powers, he made a shew of them OPENLY…” — Colossians 2:15"
			set presenter notes to "(EGW shaping, notes only — DA 761.2: 'He had revealed himself as a murderer… The last link of sympathy between Satan and the heavenly world was broken.') The prosecutor, given a free hand, produced Calvary — and the jury saw it. His OWN work condemned him."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Blotting out the handwriting of ordinances that was against us… nailing it to his cross; and having spoiled principalities and powers, he made a shew of them openly, triumphing over them in it.”"
			set object text of text item 1 to "— Colossians 2:14-15 (KJV)"
			set presenter notes to "Two things at once: the legal charge against US is cancelled ('nailed to his cross'), and the powers behind the accusation are publicly exposed. Courtroom language throughout — Paul saw the same trial."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Now is the judgment of this world: now shall the prince of this world be cast out. And I, if I be lifted up from the earth, will draw all men unto me.”"
			set object text of text item 1 to "— John 12:31-32 (KJV) — spoken days before the cross"
			set presenter notes to "Callback to §6: the 'prince of this world' verse was always a CROSS verse. The casting-out happens at the lifting-up. (1 John 3:8 — 'for this purpose the Son of God was manifested, that he might destroy the works of the devil'; Heb 2:14 — through DEATH he destroys him that had the power of death.)"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Greater love"
			set object text of default body item to "“Greater love hath no man than this, that a man lay down his life for his friends.” — John 15:13" & linefeed & "He would rather die than lose you." & linefeed & "That is criterion 5 — answered in blood."
			set presenter notes to "The benevolence criterion gets its verdict here, not at the end — the scorecard later just records it. Pause. [IMAGE: none — keep stark]"
		end tell

		-- ===== §9 WHY STILL RUNNING (67-71) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THEN WHY IS IT STILL RUNNING?"
			set presenter notes to "The honest follow-up: if the cross settled it, why am I still burying people?"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“The Lord is not slack concerning his promise, as some men count slackness; but is longsuffering to us-ward, not willing that any should perish, but that all should come to repentance.”"
			set object text of text item 1 to "— 2 Peter 3:9 (KJV)"
			set presenter notes to "The delay reframed: not absence, not impotence — mercy with a clock. Every extra day is somebody's rescue window. Maybe yours; that's why you're hearing this."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The delay is a rescue window"
			set object text of default body item to "“And this gospel of the kingdom shall be preached in all the world for a witness unto all nations; and THEN shall the end come.” — Matthew 24:14"
			set presenter notes to "A stated purpose and a defined endpoint — the timeline is mission-driven, not stalled. The harvest of §7 has a date."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“How long, O Lord, holy and true, dost thou not judge and avenge our blood…? And it was said unto them, that they should rest yet for a little season…”"
			set object text of text item 1 to "— Revelation 6:10-11 (KJV) — even the martyrs ask"
			set presenter notes to "Scripture validates the impatience — the Book's own heroes ask the skeptic's question — and gives the reason for the wait. The Book keeps owning the hard questions; that is its pattern."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“For the vision is yet for an appointed time, but at the end it shall speak, and not lie: though it tarry, wait for it; because it will surely come, it will not tarry.”"
			set object text of text item 1 to "— Habakkuk 2:3 (KJV)"
			set presenter notes to "The same prophet who opened §2 crying 'how long?' receives this answer — APPOINTED time, certain arrival. The loop closes. And after two nights of dated, fulfilled prophecy, 'appointed time' is not a brush-off; it has a track record."
		end tell

		-- ===== §10 HOW IT ENDS (72-82) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "HOW IT ENDS"
			set presenter notes to "[IMAGE: sunrise — restrained]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Let not your heart be troubled… I go to prepare a place for you. And if I go and prepare a place for you, I will come again, and receive you unto myself; that where I am, there ye may be also.”"
			set object text of text item 1 to "— John 14:1-3 (KJV)"
			set presenter notes to "The promise in His own words — personal: 'I will come again… receive YOU.'"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…this same Jesus, which is taken up from you into heaven, shall so come in like manner as ye have seen him go into heaven.”"
			set object text of text item 1 to "— Acts 1:11 (KJV)"
			set presenter notes to "Literal and visible — 'in like manner as ye have SEEN him go' — eyewitness-anchored; no spiritualized escape hatch."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“For the Lord himself shall descend from heaven with a shout… and the dead in Christ shall rise first: then we which are alive and remain shall be caught up together with them… and so shall we ever be with the Lord.”"
			set object text of text item 1 to "— 1 Thessalonians 4:16-17 (KJV)"
			set presenter notes to "Answers the grief in the room: the dead are not lost — they rise FIRST. Reunion is the mechanic of the return."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A transparent verdict"
			set object text of default body item to "“And I saw the dead, small and great, stand before God; and the books were opened… and the dead were judged out of those things which were written in the books, according to their works.” — Revelation 20:12"
			set presenter notes to "The judgment is evidence-based, recorded, PUBLIC — 'the books were opened.' God ends the case the way He ran it: in the open. (EGW shaping, notes only — GC 666-671: every question answered before the assembled universe; even the accuser concedes the verdict.) This vindicates §5's thesis — He said 'judge me,' and the final scene is exactly that."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“…he will make an utter end: affliction shall not rise up the second time.”"
			set object text of text item 1 to "— Nahum 1:9 (KJV)"
			set presenter notes to "The recurrence question — 'won't this just happen again?' — answered: NO. Why not? Because the question was answered in PUBLIC, once, before the whole universe. Destruction at the START would have planted fear; extermination at the END vindicates love — the same act means opposite things before and after the evidence is in. (EGW shaping, notes only — GC 504.1; DA 26.2: 'Rebellion can never again arise… By love's self-sacrifice, the inhabitants of earth and heaven are bound to their Creator in bonds of indissoluble union.')"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.”"
			set object text of text item 1 to "— Revelation 21:4 (KJV)"
			set presenter notes to "The payoff verse of the whole night. The tears of Ecclesiastes 4:1 — 'and they had no comforter' — wiped away PERSONALLY. Read it slowly; this is the verse the room came for, whether they know it or not."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "No more curse"
			set object text of default body item to "“And there shall be no more curse… and they shall see his face… and there shall be no night there.” — Revelation 22:3-5" & linefeed & "The tree of life. His face. Eden — bookended."
			set presenter notes to "Rev 22:1-5: the river, the tree of life, 'the leaves… for the healing of the nations.' Genesis 3's curse is explicitly reversed — the story is a ring, and it closes."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "A real, physical future"
			set object text of default body item to "“They shall build houses, and inhabit them; and they shall plant vineyards, and eat the fruit of them… they shall not labour in vain… The wolf and the lamb shall feed together.” — Isaiah 65:21-25" & linefeed & "Not clouds and harps. A restored EARTH."
			set presenter notes to "Isa 65:17, 21-25 — houses, vineyards, work that isn't futile (the exact reversal of Gen 3:17-19's cursed toil), predator and prey at peace. Tangible hope for people allergic to vaporous heaven-talk."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Eye hath not seen, nor ear heard, neither have entered into the heart of man, the things which God hath prepared for them that love him.”"
			set object text of text item 1 to "— 1 Corinthians 2:9 (KJV)"
			set presenter notes to "Humility cap: everything just shown is the FLOOR, not the ceiling."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The two questions, answered"
			set object text of default body item to "Where did suffering come from?" & linefeed & "An intruder — a real rebellion, a real fall." & linefeed & "Does it ever END?" & linefeed & "Abolished — person kept, world restored, guaranteed from outside the system."
			set presenter notes to "Hold the Bible's answer to the same two-question scale from §2 — out loud. It is the only answer on tonight's board that scores both, without dissolving the person, deferring everything, or denying the pain."
		end tell

		-- ===== §11 THE VERDICT + THE ASK (83-88) =====
		set s to make new slide at end with properties {base slide:master slide "Section"}
		tell s
			set object text of default title item to "THE VERDICT"
			set presenter notes to "Bring the series home."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "The scorecard"
			set object text of default body item to "1. Consistent written record ✓" & linefeed & "2. Above human origins ✓" & linefeed & "3. Practical ✓" & linefeed & "4. Universal ✓" & linefeed & "5. Benevolent ✓ — it explains the wound, it entered the wound, it ends the wound."
			set presenter notes to "Read line 5 exactly as written — it is the night in one sentence."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Three nights ago, you took a wager"
			set object text of default body item to "If a source met all five — would you follow it?" & linefeed & "You said yes." & linefeed & "The evidence is in. The next move is yours."
			set presenter notes to "And notice WHO won't force the move: the God of this Book runs the cosmos by evidence, and He recruits the same way. (EGW shaping, notes only — SC 105.2: 'God never asks us to believe, without giving sufficient evidence… Our faith must rest upon evidence, not demonstration. Those who wish to doubt will have opportunity; while those who really desire to know the truth will find plenty of evidence.') Doubt remains POSSIBLE on purpose — that is what freedom costs, and what love requires. Same logic as §5."
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“These were more noble… in that they received the word with all readiness of mind, and searched the scriptures daily, whether those things were so.”"
			set object text of text item 1 to "— Acts 17:11 (KJV) — the Bereans, commended for fact-checking the preacher"
			set presenter notes to "THE verse for this room: the Bible calls people NOBLE for verifying the preacher against the text. Don't take my word for any of this — check me. (John 5:39 — 'Search the scriptures' — it's a command, not a concession.)"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Quote"}
		tell s
			set object text of text item 2 to "“Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me.”"
			set object text of text item 1 to "— Revelation 3:20 (KJV)"
			set presenter notes to "He knocks. He does not break in. The door handle is on your side — consistent to the last page with everything tonight argued. [IMAGE: door, light under it — restrained]"
		end tell

		set s to make new slide at end with properties {base slide:master slide "Title"}
		tell s
			set object text of default title item to "Your move"
			set object text of default body item to "Study with me — one hour, your questions, any week night." & linefeed & "Or start alone: the Gospel of John, one chapter a night." & linefeed & "Test it the way we tested everything these three nights." & linefeed & "“O taste and see that the LORD is good.” — Psalm 34:8"
			set presenter notes to "The ask, both lanes: contact (study together — have a signup sheet or your number ready) and zero-pressure (read John alone). Close on Ps 34:8 — the Book's own empirical challenge, the same verse that opened the night. Prayer if the room allows; otherwise a warm thank-you and availability."
		end tell

	end tell

	save theDoc in POSIX file "/Users/cvr/Library/Mobile Documents/com~apple~Keynote/Documents/why_suffering.key"
	return "DECK3 DONE — slides: " & (count of slides of theDoc)
end tell
