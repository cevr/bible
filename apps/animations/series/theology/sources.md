# Sources and searches · From Milk to Meat

How the material was gathered (2026-10-10/11), what was found per topic, and the refs the credits will name. Refs and short snippets only; every snippet below was printed by a tool in this session and copied verbatim.

## Tools and one caveat

- **KJV:** the repo's `bible` CLI (`bun packages/cli/src/main.ts verse "<ref>" --json`, wrapped as `scratchpad/bible`). Every Scripture line in `scripts/` came from it.
- **EGW and pioneers:** on this box `bible egw search|lookup|books` fail (`SQLiteError: no such column: book_id`): `~/.bible/egw-paragraphs.db` holds only a `(refcode_short, para_id)` table of 3,011,990 rows and an empty `books` table, no paragraph text. I did not repair it (outside the allowed write area). Instead every EGW and pioneer search went to the owner's deployed egw-search service, `https://egw.cvr.im/api/search?q=…&scope=egw|pioneer&context=N&noref=1`, which serves the same corpus the CLI indexes (refcodes in the corpus's own form). Helper: `scratchpad/es.py`. Worth fixing on the box before scripts move into `apps/animations` (the film skill's "Fetch, then write" step and the frame verifier, `verify-quotes.py`, both read `~/.bible/egw-paragraphs.db`).
- **The frame:** `.claude/skills/film/frame/<topic>.md` (verified pioneer quotes per doctrine, with Film direction). Used first wherever a topic file exists; marked (frame) below.
- **Verifier:** `scratchpad/verify.py` checks each “…” in a script's `say` against the KJV text of that beat's Scripture `cite`s, each paraphrase-source snippet against the corpus by refcode, and counts the quoted share. Results for 01–03 are at the end. It is a scratch tool for this draft only, not a proposed repo check (owner: content is never checked by code).
- **Full search log:** `searches.log` beside this file (every query, its scope and hit count, including the research agents' queries for 04–37).

## Series frame (the order, the name)

Searches (scope: query):

- egw: first principles of the oracles of God milk babes · milk and not with meat for hitherto ye were not able to bear it · as they are able to bear it present the truth carefully objectionable · strong meat of the word deeper truths · great truth around which all other truths cluster · do not present the most objectionable features of our faith first · of whom we have many things to say Melchisedec dull of hearing
- pioneer: first principles of the doctrine of Christ · milk of the word · strong meat belongeth to them that are of full age · Bible readings for the home circle

Key passages:

- MEDM September 1904, page 286.4, 286.6, 286.8 (E. J. Waggoner, _The Medical Missionary_, devotional readings on Heb 5:13–14; 6:1; Isa 28:9) — milk "good and absolutely necessary for babes"; teeth as the sign for solid food; "swallow it without chewing, that is, without thought"; "we leave them only in the sense that we do not use them detached, but in combination. The man who eats hard food, instead of milk, does not reject any element that is in milk, but gets it all and more." **The series' thesis.**
- PTUK January 31, 1895, page 65.4 (Waggoner, "Principles and Perfection") — "Leaving the principles does not mean repudiating them, but applying them in the higher branches."
- PTUK August 17, 1893, page 315.16 (Waggoner) — "the heavenly milk is the pure, unmixed word of God."
- PTUK May 4, 1899, page 277.2 (Waggoner, on Isa 28:9–10) — "Constant repetition of simple truths which, although simple, contain infinity". (277.1 beside it names a church; not used.)
- GW 315.2 (EGW) — the cross "the great truth around which all other truths cluster"; every truth "studied in the light that streams from the cross of Calvary." Also 7ABC 457.1, Ev 190.1, 5BC 1137.7.
- Ev 199.3 (EGW) — "Strongest Meat Not for Babes—Let the truth be presented as it is in Jesus, line upon line, precept upon precept".
- Ev 141.2 (EGW) — "Do not at the outset press before the people the most objectionable features of our faith". (Ev 201.1 the same counsel.)
- PH130 26.1 (EGW) — first let people know "we are believers in Christ, that we believe in His divinity, and in His pre-existence."
- RH June 16, 1903, Art. A, par. 1; 13LtMs, Ms 115, 1898, par. 32–33; 14LtMs, Lt 207, 1899, par. 10 (EGW) — Heb 5:8–14 applied to believers who stay babes; Ms 115 ties it to character ("The great aim of our life should be to overcome all that is disagreeable in us", par. 31).
- MM 124.2 (EGW) — 1 Pet 2:2 "in perception, in likeness to the character of Christ".
- Steps to Christ chapter order (SC 9 God's Love for Man · SC 17 The Sinner's Need of Christ · SC 49 Faith and Acceptance · SC 67 Growing Up Into Christ · SC 115 Rejoicing in the Lord) — Tier One's inner order.

## 01 · Milk and Meat

Searches — egw: first the blade then the ear germination of the seed beginning of spiritual life · the soul must be fed by the word as the body by food · no limit to the growth … no more truth to be revealed · babes in Christ always need milk never grow ought to be teachers. pioneer: many things to say hard to be uttered Melchisedec priesthood strong meat (0 hits) · weaned from the milk precept upon precept line upon line.

Used (credits): MEDM September 1904, 286.4, 286.6 · PTUK January 31, 1895, 65.4 · PTUK August 17, 1893, 315.16 · PTUK May 4, 1899, 277.2 · GW 315.2 · Ed 105.3 (= TEd 63.4; "There can be no life without growth") · MM 124.2 · ST June 25, 1902, par. 17 ("As our physical life is sustained by food, so our spiritual life is sustained by the Word of God"; also RH June 11, 1908, par. 16; SW February 23, 1904).
Found, not used: 7LtMs, Ms 9, 1891, par. 36 (= 3SM 193.1, "Let us be growing Christians. We are not to stand still"); AG 312.4 ("There is no limit to his improvement"); 10LtMs, Lt 47a, 1895, par. 13 (seeds of truth, blade/ear/corn).
Not found: a pioneer passage that names the Melchisedec priesthood as Hebrews' "strong meat" in so many words. 01 says only what Hebrews itself does (5:10–11 runs into 5:12; 6:20 closes the digression), with no pioneer credit for that move.

## 02 · The Oracles of God

Searches — pioneer: rules of interpretation scripture must be its own expositor · every word must have its proper bearing … · Scripture must be its own expositor … If I depend on a teacher · To understand doctrine, bring all the scriptures together … · Nothing revealed in the scripture can or will be hid … · How to know when a word is used figuratively … · the most important rule of all is that you must have faith · his guess, desire, creed, or wisdom is my rule. egw: the language of the Bible should be explained according to its obvious meaning … · The Bible is its own expositor … · The Bereans searched the scriptures daily noble · the humblest mind may understand the Bible.

Used (credits): Miller's rules — MWV1 20.2 (I), 20.6 (III), 20.8 (IV), 22.3 (XI), 22.8 (XIV, "though they may not understand Hebrew or Greek"); rule V in full at HST May 15, 1840, page 25.42 (MWV1 20.10 is cut off mid-sentence in the corpus; MWM 70.6 and SLWM 49.2 carry it whole) · RCASDA 75.4 (Uriah Smith, 1887; frame) · FP1889 148.1 (frame) · 4SP 413.2 = GC 595.1 (frame) · GC 598.3 · Ed 190.2 ("The Bible is its own expositor") · AA 231.2 (the Bereans "compared scripture with scripture").
Found, not used: AWLF 13.4 (1847, visions "given to lead us to God, and his written word"; frame; belongs with the gift of prophecy, later series); 7LtMs, Lt 2c, 1892, par. 13 (Ps 119:130 and the unlearned); ST June 26, 1901, par. 8 (Bereans).

## 03 · God Is Love

Searches — egw: Nature and revelation alike testify of God's love · Satan led men to conceive of God as a being whose chief attribute is stern justice · Jesus came to live among men to reveal the infinite love of God · the things of nature thorn … · It is the darkness of misapprehension of God … · The Father loves us, not because of the great propitiation … · prodigal father ran fell on his neck · Love is of quick sight …. pioneer: God is love the law is love character of God · the Lord passed by before him and proclaimed … · Satan misrepresented the character of God (0 hits).

Used (credits): SC 9.3, 10.1, 10.2, 10.3, 11.1, 12.1, 13.2 (Steps to Christ, 1892; the manuscript is 7LtMs, Ms 41, 1892, par. 4, 7, 15) · COL 203.1 (first printed GCB December 1, 1895, Art. A, par. 8) · PTUK September 27, 1888, page 292.5 (Waggoner; the same in SITI December 22, 1887, 775.1: "the love of God runs parallel with his law") · SITI December 7, 1888, page 742.6 (Waggoner: "This does not mean that God has love for his creatures, but that he is love itself … goodness is tenderness").
Found, not used: COL 415.3 ("It is the darkness of misapprehension of God that is enshrouding the world"); 22LtMs, Ms 139, 1907, par. 4 ("He loved before He gave"); GCDB February 5, 1893, page 146.2 (Moses in the cleft, the Sabbath as love; the hit is tagged with the Bulletin's editor and the speaker is not named in the paragraph, so it is not credited to anyone; 146.4 beside it tells 1844 movement history, not used).

## 04–37 (research notes per episode)

Three research agents gathered 04–37 with the same brief (`brief-for-research-agents.txt`) and the same two tools. Their rules:

- Every refcode and snippet they report was printed by `es.py`, `bible verse` or a frame file during this session.
- A gap stays a gap.

Below, each episode gets its key refs with the thought each supplies, its shape, its pictures, its must-not list, and the searches (scope: query). The credit lines are collected in `series.md`.

### 04 · The Serpent's Question

- **Key refs:**
  - GC 492.2: "Sin is an intruder, for whose presence no reason can be given"; there is no excuse.
  - DA 21.3: "Sin originated in self-seeking". Lucifer slandered God as self-exalting.
  - YI June 2, 1898, par. 3: Eden's question "insinuated doubts of God's wisdom".
  - PP 54.2: the bait, "a more exalted sphere".
  - EB xi.2–xi.3 and x.3 (Jones 1904): evil is choosing "apart from God"; "Freedom of choice is essential to morals".
  - SITI December 8, 1887, 742.5–742.6 (Waggoner): Lucifer's pride and "ye shall be as gods" are one claim.
  - SITI January 7, 1886, 8.9 (Jones): "It is impossible for both to be true".
  - ARSH April 7, 1859, 156.21: doubt first, then contradiction.
  - Ed 27.1: hope spoken before the thorn and thistle.
- **Shape:** freedom and love → the cherub's choice → question, contradiction, counter-offer → distrust and death (Rom 5:12) → the promise before the curse (Gen 3:15).
- **Pictures:** God's word as a solid line that the question frays; two signboards, "Thou shalt surely die" and "Ye shall not surely die".
- **Must not:** explain why sin arose; show an immortal spark; draw a pitchfork devil.
- **Searches:**
  - egw: sin is an intruder …; Lucifer covering cherub desire for self-exaltation; insinuated doubts of God's wisdom; the tempter intimated; By partaking of this tree; I will put enmity … sentence pronounced upon Satan.
  - pioneer: origin of evil (+ctx); how alone could sin ever enter; Ye shall not surely die; GOD SAID SATAN SAID; ye shall be as gods; unbelief was the first sin; covering cherub; Lucifer.

### 05 · The Word Made Flesh

- **Key refs:**
  - PP 34.1 (frame): "one in nature, in character, in purpose".
  - DA 530.3 (frame): "original, unborrowed, underived".
  - DA 19.1–19.2: "God's thought made audible".
  - ST November 15, 1899, par. 2: "As speech is to thought, so is Christ to the invisible God".
  - CHR 24.3: "Originally only Divine, He took upon Himself human nature".
  - CHR 24.1: worship the Son.
  - PTUK May 9, 1895, 292.5: "Not God with Him only, but God with us".
  - CHR 21.2 and LUJ 10.1 (frame): to be used only for "not created".
- **Shape:** the Word before the beginning → all things made through Him → He empties Himself (Phil 2) → Immanuel, the Father seen in the Son → life underived (Lazarus).
- **Pictures:** the manger set against the throne room; a spoken word taking human form.
- **Must not:** Trinity words or emblems, "God the Son", "eternally begotten"; animating the Son's beginning; showing the Father with a face; touching the question of His human nature (that is 15).
- **Searches:**
  - egw: From the days of eternity …; God's thought made audible.
  - pioneer: Is Christ God; God with us Immanuel (+ctx); the Word was made flesh; God manifest in the flesh (+ctx CHR); divinity of Christ; thought it not robbery.

### 06 · Behold the Lamb

- **Key refs:**
  - CIS 5.1: "a shadow of the cross, extending from Calvary back to the gate of Eden".
  - ST January 2, 1893, par. 6: every sacrifice typified the Lamb.
  - DA 25.2: "treated as we deserve".
  - DA 753.2: the separation was the weight.
  - PTUK July 20, 1893, 242.12: "no one but He has ever suffered the sins of the world".
  - AERS 146.1–146.2: substitution vindicates the law.
  - DA 57.2: "love and selfishness stood face to face".
  - FP1889 147.3 note (frame): "a divine sacrifice … sufficient to save all".
- **Shape:** Eden's first sacrifice, Isaac, Passover → "Behold the Lamb" → the cross (sin laid on Him, separation) → love unmasks selfishness (answers 04) → provided for all, and on to the Priest.
- **Pictures:** Moriah, "God will provide himself a lamb"; the cross's shadow cast back over every altar to Eden.
- **Must not:** "the atonement" at the cross, or "It is finished" as the completed atonement; ending Christ's work at the cross; the scapegoat as Christ; a merely human death.
- **Searches:**
  - egw: Behold the Lamb of God; the great truth around which all other truths cluster; The Saviour could not see through the portals of the tomb; every lamb slain pointed to Christ; Christ was treated as we deserve; love and selfishness; Christ became sin for the fallen race.
  - pioneer: Lamb slain from the foundation of the world; the Son of God died (+ctx AERS ch. V); the cross of Christ; sins of men nailed Christ to the cross; The Cross and Its Shadow.

### 07 · Repentance from Dead Works

- **Key refs:**
  - SC 23.2: definition.
  - SC 23.3: "They lament the suffering rather than the sin" (Esau, Balaam, Judas, Pharaoh).
  - SC 24.3: David.
  - RH April 1, 1890, par. 3: "Repentance is as much the gift of Christ as is forgiveness".
  - SC 26.4: the goodness of God leads.
  - RH November 4, 1890, par. 2: "nothing of the nature of merit".
  - AMS May 24, 1894, 162.9: "needs no punishing of ourselves".
  - SSP 368.2: hands on the offering's head.
- **Shape:** "What shall we do?" → counterfeit sorrow against David → the exalted Christ gives repentance → confession on the Lamb → dead works left behind for a cleansed conscience (Heb 9:14).
- **Pictures:** David writing Psalm 51 after Nathan; the worshipper's hands on the lamb's head.
- **Must not:** repentance as a price; penance imagery; dropping the law.
- **Searches:**
  - egw: Repentance includes sorrow for sin (+ctx); We can no more repent without the Spirit of Christ; Christ is the source of every right impulse (+ctx); David's repentance was genuine; Repentance is associated with faith; purge your conscience from dead works.
  - pioneer: repentance is the gift of God; dead works; purge your conscience; sinner laid his hand upon the head.

### 09 · Buried and Raised

- **Key refs:**
  - 1SG 112.2 (frame): "raised up out of the watery grave".
  - HSFD 154.1 (frame): "not the day of the resurrection, but the resurrection itself".
  - TOB 38.1 (frame): immersion.
  - BIC 94.3 (frame): the saints' resurrection confessed.
  - DA 111.2: the Jordan, "He identified Himself with sinners".
  - Lt 125, 1900, par. 5: "a solemn pledge".
  - SITI February 11, 1889, 88.10–88.11: the plural "baptisms" (water and the Spirit), the bridge to 10.
- **Shape:** repentance and faith first → the Jordan → water as the tomb, rising as the empty tomb → two memorials (bread and cup; water) → the saints' resurrection.
- **Pictures:** the Jordan; the tomb and the water side by side, match-cut.
- **Must not:** sprinkling as equal; Sunday as the resurrection's memorial; infants; joining a community as the main image; baptism by fire as a blessing.
- **Searches:**
  - all: doctrine of baptisms.
  - pioneer: baptized with the Holy Ghost and with fire (+full ctx).
  - egw: Christ has made baptism the sign of entrance; By baptism you have taken upon you a solemn pledge; Jesus did not receive baptism as a confession of guilt.

### 10 · The Promise of the Father (the laying on of hands)

- **Key refs:**
  - FP1889 147.2, 150.5, 150.7 (frame): "his representative"; the Spirit leads "to an understanding of that word which it had inspired".
  - DA 669.2 (frame): "accessible to all".
  - ST May 17, 1899, par. 2–3: the ascension, then Pentecost.
  - AA 49.2: "not limited to any age or to any race".
  - SITI January 1, 1885, 9.15–9.16 (signed E. J. W.): "not given in a fixed, arbitrary manner".
  - PTUK December 16, 1897, 790.3: the hands impart what the giver has.
  - AA 161.2: "added no new grace".
  - GTI 208.3–208.4: the Spirit as the earnest of the inheritance.
- **Shape:** Ps 139 → "another Comforter" → enthronement, then Pentecost (no hands), Samaria (hands), Cornelius (no hands) → conviction, understanding, a new heart → ask (Luke 11:13).
- **Pictures:** Pentecost as wind and flame, with no figure; Ps 139's flight to horizons that are already lit.
- **Must not:** a body, face or third enthroned figure; settling the Spirit's nature either way; the Spirit apart from Scripture; gifts over regeneration.
- **Searches:**
  - pioneer: laying on of hands (+ctx=8); LAYING ON OF HANDS (+ctx); the Comforter; the gift of the Holy Ghost; the promise of the Spirit.
  - egw: laying on of hands added no new grace; Christ ascended … Pentecost; The office of the Holy Spirit; promise of the Holy Spirit is not limited; Cumbered with humanity.

### 11 · Growing Up Into Him

- **Key refs:**
  - SC 67.3: plants grow "by receiving".
  - SC 68.1: "an atmosphere of grace".
  - SC 70.1: "Consecrate yourself to God in the morning".
  - SC 93.2: prayer as "the opening of the heart to God as to a friend".
  - Ms 30a, 1896, par. 2: "The Bible is God's voice".
  - SITI March 18, 1889, 155.49–155.50: a tree "keeps all that it gains, and adds more".
  - GOSC 42.4: house and plant, the living stone.
- **Shape:** a newborn's hunger → seed, blade, ear → three daily channels → abiding (John 15) → the Psalm 1 tree.
- **Pictures:** the seed growing secretly (Mark 4:26–29); tree rings, one added each year and none lost.
- **Must not:** growth as anxiety or effort; the Spirit apart from Scripture; faith pushing the law aside.
- **Searches:**
  - egw: germination of the seed; Chapter 8—Growing Up Into Christ (+ctx); Prayer is the opening of the heart; Consecrate yourself to God in the morning; God has encircled the whole world; The Bible is God's voice.
  - pioneer: as newborn babes; grow in grace; As ye have therefore received Christ Jesus; the secret of growth; secret prayer; Christ liveth in me; the word of God has in itself the power.
  - Not found: any Haskell text on prayer or the Word.

### 12 · Asleep in Jesus

- **Key refs:**
  - HHMLD 42.1 (frame): "a lifeless man; afterward, a living one".
  - BQACM 4.3 (frame): "Man, being mortal, has it not; God has it".
  - BQACM 7.3: "Death is wholly an unconscious sleep".
  - DBC 7.4 (frame): "The departure is by death; the being with Christ is by the resurrection".
  - GC 549.3 (frame): "Time … is but a moment to them".
  - GC 556.1 (frame): the dead know nothing of the living.
  - DA 527.3 and DA 787.1: death as sleep.
- **Shape:** dust plus breath → breath goes and thoughts perish → "Lazarus sleepeth" → "depart … be with Christ", with the grave between → the last trump.
- **Pictures:** Bethany, from "sleepeth" to "come forth"; a clock that stops at death and resumes at the trumpet.
- **Must not:** a soul leaving the body; the dead watching the living; the label "soul sleep".
- **Searches:**
  - pioneer: when a man is dead he is asleep; a silent dreamless sleep; Death is wholly an unconscious sleep (--full).
  - egw: Christ represents death as a sleep; To the believer death is but a small matter; Time be it long or short.

### 13 · Eternal Judgment

- **Key refs:**
  - RH November 22, 1898, par. 8: "In his super-added humanity consists the reason of Christ's appointment".
  - GC 484.2: "He lifts His wounded hands before the Father".
  - GC 421.3 (last sentence only): the reward.
  - JEO 103.3: John 5:27.
  - MOI 86.2: "eternal" means a final verdict, not endless torment.
  - TAR 130.2 (frame): punishment "according to his deserts".
- **Shape:** every work is judged → the Judge is the risen Man (Acts 17:31) → why Him: the Son of man → the Judge is also the Advocate → boldness, and a final verdict.
- **Pictures:** a courtroom where the Judge's own scarred hands hold the defence brief. Zech 3 is saved for 24.
- **Must not:** any timing (pre-advent, 1844, Dan 8:14); "one day at the end of the world"; eternal torment; erasure; the scapegoat.
- **Searches:**
  - pioneer: eternal judgment; boldness in the day of judgment; hath given him authority to execute judgment; the Judgment its events and their order; God shall bring every work into judgment.
  - egw: committed all judgment unto the Son; In his super-added humanity; Jesus does not excuse their sins; lifts His wounded hands.

### 14 · After the Order of Melchisedec

- **Key refs:**
  - RDAC 117.4–117.5: Melchisedec "presented … to make up this deficiency" in Aaron; "without father" means no genealogy is recorded.
  - EVCO 324.1: "Their priesthood was only outward … a life that saves to the uttermost".
  - AMS December 10, 1891, 378.7: "his priesthood is on a throne".
  - GC 416.3: "now set down with the Father in His throne", "Not now 'upon the throne of His glory'".
  - TTKGG 2.2 (frame): two thrones.
  - CWCP 102.2: "when Christ was on earth he was not a priest" (ARSH April 9, 1857, 179.1 says the same).
  - RH February 18, 1890, par. 10: "Melchisedec was not Christ".
  - 2SP 13.1.
- **Shape:** Heb 5:11's hinge → Abraham and the king of Salem → why not Aaron → a priest on a throne → "if he were on earth" leads into 16.
- **Pictures:** Gen 14, bread and wine; two genealogy scrolls, Aaron's ending in deaths and Melchisedec's blank, sealed with an oath.
- **Must not:** Melchisedec as Christ or as a mystic being; Christ's work ending at the cross; Christ on the throne of His glory now.
- **Searches:**
  - pioneer: Melchisedec king and priest without father; order of Melchisedec not after the order of Aaron; a priest upon his throne Melchisedec; power of an endless life; Christ was not a priest on earth.
  - egw: Melchisedec priest of the most high God; counsel of peace between them both; high priest was designed in an especial manner.
  - Not found: Haskell on Melchisedec; any pioneer tying Heb 5:11–14 to Melchisedec explicitly.

### 15 · Made Like His Brethren

- **Key refs:**
  - FP1889 147.3 (frame).
  - CHR 26.2 (frame): "it must have been sinful man that He was made like".
  - GCB February 21, 1895, 266.9 (frame): "not in himself, but in his flesh".
  - DA 48.6 (frame): "the great law of heredity".
  - RH December 15, 1896, par. 7 (frame): "no guile or sinfulness; … yet he took upon him our sinful nature".
  - 10LtMs, Lt 8, 1895, par. 14, 16: "not for one moment was there in Him an evil propensity"; "a taint of, or inclination to corruption".
  - CWCP 51.1: His nature is "the essential foundation" of His priesthood.
- **Shape:** "took part of the same" → for priesthood → tempted in all points, yet without sin, condemning sin in the flesh → no taint → come boldly.
- **Pictures:** Eden and the wilderness side by side; Matthew 1's genealogy as a heredity ribbon.
- **Must not:** a stain on Christ; "sinful tendencies" without "not in himself"; "a sinless nature" set against "our sinful nature".
- **Searches:**
  - pioneer: made like unto his brethren; foundation of His high priesthood.
  - egw: inclination to corruption rested upon Christ; the great law of heredity; propensities of sin; taking upon Himself our fallen nature.

### 16 · The Pattern in the Mount

- **Key refs:**
  - SOTB 8.4 (frame), 7.7: a shadow and a pattern.
  - LUJ 120.2 (= STTHD 217.1): the monument with "a shadow with two shafts".
  - AERS 218.2: "unless the heavenly had also two holy places".
  - CIS 5.1 and 6.1: "Every gospel truth centers in the sanctuary service".
  - PP 343.2: "a miniature representation of the heavenly temple".
  - GC 414.3: two apartments above.
- **Shape:** "that I may dwell among them" → the copy and the shadow → two rooms need an original with two rooms → the whole system is a shadow of the cross.
- **Pictures:** Moses' forty days, then the craftsmen; a heavenly temple casting a two-room tent shadow on the sand.
- **Must not:** Hebrews retiring the sanctuary; a one-room heaven; the most holy place entered at the ascension.
- **Searches:**
  - pioneer: cross and its shadow; heavenly sanctuary two apartments; the sanctuary in heaven has two holy places; Moses pattern heavenly sanctuary; true tabernacle which the Lord pitched.
  - egw: Moses was shown the heavenly sanctuary; every part of the tabernacle was made after the pattern; a view of the heavenly sanctuary; As the sanctuary on earth had two apartments.

### 17 · The Holy Place

- **Key refs:**
  - GC 420.3: Christ pleading His blood with "the prayers of penitent believers".
  - PP 354.2: blood "sprinkled before the veil".
  - S23D 80.1: sins "transferred to the sanctuary itself".
  - CIS 183.2: "The sinner could not look within … but by faith he knew".
  - PP 353.2: incense = Christ's merits.
  - PP 354.1: the bread.
  - CIS 54: the lamps and the Spirit.
  - CIS 63.1: morning and evening prayer.
- **Shape:** the lamb and the laver in the court → confession, with blood carried inside → lamp, bread, incense → Christ now in the first apartment, with the record still standing.
- **Pictures:** Zacharias at the incense hour (Luke 1:10); a worshipper at the curtain who trusts the priest.
- **Must not:** forgiveness as erasure; Christ in the most holy place now; the altar and laver inside the Holy Place; Haskell's laver hint as doctrine.
- **Searches:**
  - pioneer: candlestick seven lamps Holy Spirit; brazen laver; golden altar incense; morning and evening sacrifice; sin transferred to the sanctuary.
  - all: incense righteousness of Christ; table of shewbread.
  - egw: The most important part of the daily ministration; shewbread was kept ever before the Lord; the ministration … in the first apartment.

### 18 · The Better Covenant

- **Key refs:**
  - PP 371.1: "the new covenant was valid in the days of Abraham".
  - PP 371.4: "did not realize the sinfulness of their own hearts".
  - PP 372.1: "Obey and live" against "better promises".
  - GTI 184.1: Hagar.
  - EVCO 327.2: the promises depended on the people.
  - EVCO 328.1: "a covenant of faith".
  - SSW 11.4 (= ARSH January 7, 1890, 14.42).
- **Shape:** the oath to Abraham → "we will do", then the calf → old against new → Hagar and Sarah → the Mediator of the better covenant.
- **Pictures:** Ex 19, 24 and 32 as one sequence; two contracts, one signed only by the people and one sealed with God's "I will".
- **Must not:** faith pushing the law aside; the Sabbath or the Ten Commandments as the old covenant.
- **Searches:**
  - pioneer: the two covenants; old covenant promise of the people; covenant with Abraham everlasting covenant; better promises; covenant from Sinai.
  - egw: Obey and live better promises; did not realize the sinfulness of their own hearts; view of the covenants … Brother Waggoner (found, not used: history).

### 19 · What Was in the Ark

- **Key refs:**
  - WWNC 2.1: the tables inside the ark, the book of the law outside.
  - DAR 507.4 (frame): the law "unaltered".
  - JEO 70.1: ark, veil and tabernacle "of the testimony".
  - CIS 46.1: "covered the broken law with a mercy-seat".
  - GC 415.2: "the union of justice and mercy".
  - GC 433.2 and GC88 434.1: the heavenly original.
  - STTHD 150.1: 1 Kings 8:9.
- **Shape:** the finger of God → the tables inside, the book beside → named for the testimony; mercy over law → the heavenly ark (Rev 11:19) → the law written in the heart.
- **Pictures:** an ark cutaway; Moses carving the second tables.
- **Must not:** the law as one Torah that expired; Col 2:14 over the tables; Dan 7:25 (save it for 28).
- **Searches:**
  - pioneer: ark of the testament tables of stone mercy seat; mercy seat covered the law; pot of manna Aaron's rod; ten commandments lay in unapproachable majesty.
  - egw: mercy-seat law ark cherubim justice; The ark was merely a receptacle; great original.

### 20 · A Rest That Remains

- **Key refs:**
  - GCDB March 8, 1897, 303.7 (frame): "the Sabbath is righteousness by faith".
  - GCDB March 8, 1897, 299.10: finished work, then rest.
  - PTUK November 4, 1897, 692.3: "finished work means rest".
  - SDSNA 16.6 (frame): "not a shadow; but a body of itself".
  - SOSL 65.3: "a keeping of the Sabbath".
  - DA 769.2: Christ's Sabbath in the tomb.
  - 6T 350.1: Creator and Sanctifier.
  - TSPL 20.2 (frame): the Sabbath in Paradise restored.
- **Shape:** God finishes and rests → unbelief keeps Israel out → "There remaineth … a rest" → a sign from Eden to the new earth.
- **Pictures:** the spies' report (Num 13–14); a craftsman setting down his tools, and the viewer invited into the same chair.
- **Must not:** the Sabbath fulfilled into a "rest in Jesus" that replaces the day; "Jewish Sabbath"; Sunday as the Lord's day.
- **Searches:**
  - pioneer: sabbatismos keeping of a sabbath; there remaineth therefore a rest; the works were finished from the foundation of the world; For if Joshua had given them rest.
  - egw: sign of Him as the Sanctifier; Jesus rested from the work of redemption.

### 21 · The Day of Atonement

- **Key refs:**
  - LOM 40.1 (frame): "forgiveness" against "blotting out".
  - PP 355.5: "had not made full atonement".
  - CIS 210.1: the ritual.
  - PP 358.3: "the final purification of the universe".
  - GC 422.2 (frame): the scapegoat as Satan.
  - CIS 216.2 and LUJ 260.2: Azazel.
  - AERS 220.1 (frame): the judgment, blotting out and cleansing "are identical".
  - CIS 222.1: afflict your souls.
- **Shape:** a year of forgiveness → the high priest enters once → the camp searches its heart → only after the cleansing, the live goat.
- **Pictures:** Lev 16 as one staged day; a ledger wiped, with the ink returned to its author.
- **Must not:** the scapegoat as Christ; "It is finished" as the completed atonement; erasure before the day; the scapegoat before the cleansing.
- **Searches:**
  - pioneer: scapegoat Azazel Satan; day of atonement afflict your souls; the Lord's goat blood sprinkled upon the mercy seat.
  - egw: Once a year, on the great Day of Atonement; Important truths concerning the atonement; the people were taught each day.

### 22 · Messiah the Prince

- **Key refs:**
  - DA 233.1: the decree "went into effect in the autumn of B. C. 457".
  - LUJ 189.1: the Messiah "manifested … at his baptism".
  - GC 327.3: AD 31, "Type had met antitype".
  - DA 233.3: AD 34 and Stephen.
  - SOTB 5.3 (frame).
  - STTHD 198.1: the seventieth week is Christ's.
  - DAR 206.1: "all come in in their exact place".
  - S23D 19.1 and DAR 192.1: "determined" means "cut off".
- **Shape:** Daniel's prayer → seventy weeks cut off, a day for a year → 457 BC to AD 27, the anointing → AD 31 → AD 34, and a longer period from which the seventy weeks are cut.
- **Pictures:** Gabriel at the evening oblation, then the Jordan; a 490-segment ruler.
- **Must not:** a detached or future seventieth week; literal days; the "he" of 9:27 as antichrist.
- **Searches:**
  - egw: The time is fulfilled … A.D. 27; the decree of Artaxerxes 457; In the spring of A.D. 31; the stoning of Stephen A.D. 34.
  - pioneer: decree of Artaxerxes 457 seventy weeks; seventy weeks cut off 2300; Messiah the Prince; confirm the covenant.
  - Queries containing "A.D." fail in search.

### 23 · Then Shall the Sanctuary Be Cleansed

- **Key refs:**
  - LUJ 177.1 (also STTHD 65.1): the seventy weeks are the first 490 of the 2300.
  - LUJ 152.3, 159.3 and DAR 151.1: Rome "waxed exceeding great".
  - GC 417.1: "no sanctuary on earth for many centuries".
  - LOM 38.7 (frame): the sanctuary of the new covenant is in heaven.
  - LUJ 145.2 and DAR 172.3: "a cleansing accomplished with blood".
  - GC 417.3: the cleansing must be "accomplished with blood".
  - CIS 211.2 and SOTB 7.3: the cleansing removes the sins.
- **Shape:** ram, goat, horn, "How long?" → "none understood", then Gabriel in Dan 9 → 457 BC to AD 1844 → which sanctuary → what "cleansed" means.
- **Pictures:** Daniel fainting by the Ulai; one timeline bar with the 490 block cut off its front.
- **Must not:** the earth or the church as the sanctuary; literal days; a period that reaches the advent; a ruling on "the daily".
- **Searches:**
  - pioneer: heavenly things themselves with better sacrifices; what is the sanctuary; ram which thou sawest; little horn Rome exceeding great; 2300 days end 1844; daily paganism; daily service.
  - egw: 2300 days began when the commandment of Artaxerxes; The sanctuary to which the 2300 days refer; The true meaning of the daily is not to be made a test question.

### 24 · The Hour of His Judgment

- **Key refs:**
  - GC 421.3 (frame).
  - GC 479.3: "He comes to the Ancient of Days in heaven".
  - GC 480.1: the professed people of God.
  - JEO 15.1: the books.
  - JEO 9.2: "accounting worthy" precedes the resurrection.
  - JEO 126.2: the Advocate at the tribunal.
  - CIS 232.1: investigation, decision, execution.
  - GC 484.2: wounded hands.
  - SITI June 8, 1888, 342.20: the Advocate now, the Judge later.
- **Shape:** the Ancient of Days and the books → investigation before execution → it begins at God's house → the Advocate and the accuser → "is come".
- **Pictures:** Zech 3, Joshua's garments with the accuser present; a counsel who also paid the penalty.
- **Must not:** judgment only at the end; erasure; the robe scene without the accuser.
- **Searches:**
  - pioneer: the judgment was set and the books were opened; investigative judgment before the advent; advocate in the judgment; our advocate is the judge; names in the book of life blotted out.
  - egw: Jesus will appear as their advocate; holy of holies … judgment; graven them on the palms of My hands.

### 25 · Within the Veil

- **Key refs:**
  - GC 421.1: "Here their hopes centered".
  - GC 420.3: the first veil.
  - LOM 41.2: the anchor covers "both the forgiveness and the blotting out".
  - LUJ 130.2: "Christ, our forerunner, is entered within the vail".
  - CWCP 82.2: "a way from where we are to where He now is".
  - 10LtMs, Lt 100, 1895, par. 16: "His ship will outride the storm".
  - SC 62.2: "just as if you had not sinned".
  - GC 484.2.
- **Shape:** promise and oath → the anchor goes where we cannot see → a new and living way → the Intercessor in the judgment → "appear the second time".
- **Pictures:** a ship whose anchor line runs up through cloud behind a curtain; Stephen's "I see … the Son of man standing" (Acts 7:56, fetched).
- **Must not:** the most holy place at the ascension; judgment as fear without the Advocate; Smith's "transposition" of Heb 10:20 on screen.
- **Searches:**
  - pioneer: new and living way which he hath consecrated; anchor of the soul within the veil.
  - egw: hope anchor of the soul … forerunner; character of Christ stands in place of your character.

### 26 · The Sure Word of Prophecy

- **Key refs:**
  - PK 535.1: the four empires, each tested.
  - PK 536.3: prophecy "traced on the pages of history".
  - RAR 41.2: the stone replaces the image.
  - DAR 70.1 and 70.3: the church is not the stone; at the cross the image had reached "only … to the thighs".
  - MON 39.3: the whole statue falls at once.
  - DAR 532.2 (frame).
  - FUMP 18.2 (frame): "Down among the feet and toes".
- **Shape:** God reveals secrets so "ye might believe" → the metals → iron and clay → the stone at the feet → "you are here".
- **Pictures:** Daniel before the king; the statue as a timeline with a pin in the toes, ending as chaff.
- **Must not:** the stone as the church filling the earth now; a gap or a revived empire; prophecy as timeless symbol.
- **Searches:**
  - egw: rise and fall of empires; link after link in the prophetic chain; Every nation that has come upon the stage.
  - pioneer: five universal kingdoms; smiting of the image; stone strikes the image upon the feet; feet and toes divided kingdom; covers the same ground.

### 27 · War in Heaven

- **Key refs:**
  - PP 42.3: love must rest on "a conviction of His justice and benevolence".
  - DA 758.3: Satan's character was not clear "until the death of Christ".
  - DA 761.2: "his disguise was torn away".
  - PTUK December 26, 1895, 818.11: war from the fall in heaven onwards.
  - AMS October 19, 1899, 642.2: "the first war that ever was".
  - USLP 25.1: the dragon is "primarily … the devil".
  - SSP 212.3: the woman is God's faithful.
- **Shape:** two signs → pride, war, cast out → the dragon before the Child → the cross casts down the accuser → wrath on the remnant, and overcoming by the blood.
- **Pictures:** the magi, Herod and the flight into Egypt; a heavenly courtroom whose accuser's seat empties at Calvary.
- **Must not:** naming the remnant; tying 12:17 to a person; naming the persecutor of the 1260 days.
- **Searches:**
  - pioneer: war in heaven; dragon primarily Satan; woman clothed with the sun.
  - egw: there was war in heaven; last link of sympathy; Satan's disguise was torn away; Infinite Wisdom did not destroy Satan; Not until the death of Christ.

### 28 · Four Winds, Four Beasts

- **Key refs:**
  - DAR 113.4: the literal interprets the figurative.
  - DAR 114.1 and 114.3: wind means strife; sea means peoples.
  - DAR1909 127.1: "The ground is passed over again and again".
  - RDAC 37.2: Daniel 7 covers the ground of Daniel 2.
  - SDP 90.1: the beasts rise out of the multitudes.
  - DAR 118.1: the nondescript fourth beast.
  - ARSH January 26, 1864, 68.10: "Time, in prophetic language, for a year".
  - DAR 118.4 and DAR 141.1 were found, and they name the horn; they are held for the later series.
- **Shape:** the winds and the sea → Daniel 2 again → the ten horns and a different horn → the throne and the books → the kingdom to the saints.
- **Pictures:** the image and the beasts side by side, metal for beast; Daniel troubled on his bed.
- **Must not:** a future single Antichrist; a gap; the beasts as generic empire.
- **Searches:**
  - pioneer: four winds of heaven strove upon the great sea; VERSE 2 (+ctx); same ground as the image; ground is passed over again and again; lion eagle's wings; little horn came up among them; seven times of Leviticus 26.

### 29 · The Everlasting Gospel

- **Key refs:**
  - GC 355.3: a message possible "only in the last days".
  - COL 227.2: the judgment proclaimed "is called the everlasting gospel".
  - GC88 436.1: worship the Creator and obey.
  - ARSH January 16, 1900, 40.2 (= GNT 242.2): "not that it will come, but that it 'IS come'".
  - HSFD 510.2: Creator and creature as "the true ground of divine worship".
  - PTUK December 8, 1898, 775.9: the Sabbath as "the fulness of the everlasting Gospel".
  - PTUK June 23, 1898, 389.13.
- **Shape:** the same gospel → "Fear God" is Solomon's conclusion → "is come" → "him that made" echoes Ex 20:11.
- **Pictures:** Jonah at Nineveh; an hourglass already running behind the angel.
- **Must not:** literal angels preaching; the judgment hour only at the advent; the messengers drawn as the 1840s preachers.
- **Searches:**
  - egw: Sabbath as the memorial of creation; Without obedience no worship; hour of his judgment is come everlasting gospel; The message itself sheds light as to the time.
  - pioneer: everlasting gospel; worship him that made heaven creation; is come not will come; TMR hour of his judgment.

### 30 · Come Out of Her

- **Key refs:**
  - GC88 380.3: a woman as a church.
  - GC88 388.1: the cup is false doctrine.
  - GC 390.1: "the great body of Christ's true followers are still to be found in their communion".
  - GC88 390.2: the call succeeds.
  - TAR 51.2 (frame): "a moral fall".
  - GNT 137.3–137.4 (= ARSH February 6, 1900, 88.4): Babel as the "Gate of God", turned to confusion.
  - ARSH March 24, 1859, 140.14: come out to the Book of God.
  - ST December 29, 1890, par. 2: Belshazzar's fall as a type.
- **Shape:** Babel → Belshazzar's feast → the woman with the cup → "is fallen" → "Come out of her, my people".
- **Pictures:** the temple cups at the feast, and Cyrus in the dry riverbed; a gold cup passed among the nations.
- **Must not:** Babylon as Rome alone; any church's members as lost; any named church.
- **Searches:**
  - egw: great body of Christ's true followers; A woman is a symbol of a church; cup of intoxication; Revelation 18 points to the time; God still has a people in Babylon; Belshazzar feast golden vessels.
  - pioneer: Babylon signifies confusion; come out of her my people.

### 31 · The Seal of the Living God

- **Key refs:**
  - DAR 438.2: "The idea of law is inseparable from a seal".
  - DAR 439.4: name, title and dominion.
  - DAR 440.2: sign, seal, token and mark are synonyms.
  - ARSH December 25, 1860, 45.1: the Sabbath commandment as the seal.
  - 17LtMs, Ms 173, 1902, par. 25: "not any seal or mark that can be seen, but a settling into the truth".
  - 21LtMs, Ms 10, 1906, par. 14: the winds held.
  - 8T 117.3: the Sabbath as the sign.
  - SLG 23.1 (frame).
  - GC88 449.1 and TMR 108.3 (frame): the mark is received only when the issue is plain.
- **Shape:** the winds held → what a seal is → which commandment bears His name → settling into truth → a counterfeit that is chosen, never stamped on the unaware.
- **Pictures:** the man with the writer's inkhorn (Ezek 9); a signet pressing name, title and domain into wax.
- **Must not:** a chip or tattoo; Sunday-keepers marked now; the Sabbath as Jewish or as a shadow; any meaning for the number 144,000.
- **Searches:**
  - egw: settling into the truth; likeness to Christ in character; The sign, or seal, of God is revealed; holding the four winds; mark upon the foreheads of the men that sigh.
  - pioneer: seal of the living God; fourth commandment seal of the law; seal of God's law; frontlets between thine eyes.

### 32 · The Latter Rain

- **Key refs:**
  - GCB 1893, 183.5: the latter rain is "the teaching of righteousness".
  - GCB 1893, 359.3: "How much of that latter rain comes out of me?"
  - HEVI 73.4: Pentecost, "the Comforter as a teacher".
  - RH November 22, 1892, par. 7: "the revelation of the righteousness of Christ".
  - RH December 31, 1857, par. 9: truth "in great power … It is the latter rain".
  - RH March 2, 1897, par. 1–2: "the spiritual grace that prepares the church".
  - 7LtMs, Ms 35, 1891, par. 48.
  - ARSH September 2, 1851, 23.2 (unsigned).
  - GC 613.2.
- **Shape:** two rains → rain is doctrine (Deut 32:2; Isa 55:10–11; Hos 10:12) → Pentecost, the Spirit as teacher → the fulness of truth ripening character → asked for, not produced.
- **Pictures:** a field from blade to full corn under two rains; the upper room.
- **Must not:** the rain as feeling or miracles cut off from truth; a latter rain without the former.
- **Searches:**
  - all: my doctrine shall drop as the rain; as the rain cometh down so shall my word be.
  - pioneer: former rain moderately teacher of righteousness; latter rain teaching of righteousness.
  - egw: latter rain, ripening earth's harvest; It is the latter rain, the refreshing; loud cry … has already begun; Let the latter rain come into my vessel.
  - Not found: any corpus text applying Deut 32:2 or Isa 55 to the latter rain.

### 33 · When the Door Is Shut

- **Key refs:**
  - GC 613.2: "Every case has been decided".
  - GC 491.1: Noah's door and the seven days.
  - GC 614.1: "without an intercessor".
  - ExV 58.2: the sealed are protected.
  - SCOC 78.1: the close comes at the end of Christ's ministry; Matt 25:10 is not the close of probation.
  - DAR1909 321.1: "stand up" means to reign.
  - FEE 244.4: the plagues fall when no priestly service remains.
  - GC 616.2: Jacob.
  - GC 628.2: "These plagues are not universal".
- **Shape:** the censer laid down → Noah's door → Michael stands up → the plagues, limited, with bread and water sure → deliverance of all "written in the book".
- **Pictures:** Jacob at the Jabbok; a censer set down in a smoke-filled temple.
- **Must not:** a secret rapture; a datable close; the scapegoat as Christ; Matt 25:10 as proof.
- **Searches:**
  - egw: When the third angel's message closes; When He leaves the sanctuary; Before the Flood, after Noah entered the ark; Jacob's night of anguish; plagues are not universal.
  - pioneer: Michael stand up close of probation; seven last plagues after probation closes; standing up of Michael.

### 34 · Every Eye Shall See Him

- **Key refs:**
  - PTUK April 13, 1899, 228.5 (frame): "no secret coming".
  - DAR 333.3 (frame): two comings "wholly unwarranted".
  - DAR 609.4: "literal, personal, visible".
  - GC 641.1 (fuller in the compilation FLB 349.4): "Who shall be able to stand?" … "My grace is sufficient".
  - GC88 645.1 (frame).
- **Shape:** "in like manner" → lightning and trump → graves open and the living are changed → the wicked hide → together to the city.
- **Pictures:** the ascension reversed; one sky seen from every continent at once.
- **Must not:** a secret rapture; two stages; "as a thief" as unseen; the wicked living on through the millennium.
- **Searches:**
  - egw: small black cloud (not landed); No crown of thorns now mars; Let rocks and mountains fall on us.
  - pioneer: personal, and visible to all; dark day May 19, 1780 (found, not used: history).

### 35 · A Thousand Years

- **Key refs:**
  - DAR 696.2 (frame).
  - GC88 659.1 (frame): bound by having "none remaining".
  - TTKGG 9.1 (frame): no temporal or mixed millennium.
  - GC 660.4: the saints judge, "comparing their acts with the statute book".
  - FP1889 151.6 (frame).
- **Shape:** the earth emptied → Satan chained by circumstance → thrones and books → the city descends and the wicked rise.
- **Pictures:** the pit as the Gen 1:2 void; open books before the redeemed.
- **Must not:** a reign over mortal nations on earth; a converted world first; a literal chain.
- **Searches:**
  - egw: During the thousand years between the first and the second resurrection.
  - pioneer: thousand years bottomless pit.

### 36 · The Fire That Ends

- **Key refs:**
  - SSII 46.2, TAR 130.2, WDNP 3.2, HHMLD 277.1, 1SG 118.1 and GC 674.1 (all frame).
  - GC88 673.1: "Some are destroyed as in a moment, while others suffer many days".
  - GC88 627.1: forbearance does not mean impunity.
  - The "strange act" sentence printed only in compilations (HB 384.2, EP 455.5), so it is not credited.
- **Shape:** wages of death → fire from heaven → graded, then finished → Sodom's fire went out (Jude 7) → God's strange act.
- **Pictures:** Abraham seeing Sodom's smoke in the morning; a fire burning down to clean ground.
- **Must not:** a hell burning now; eternal torment; devils as torturers.
- **Searches:**
  - egw: destroyed as in a moment others suffer many days; punishment is a strange act.

### 37 · All Things New

- **Key refs:**
  - PT November 1, 1850, par. 8; TTKGG 12.1; SAIN 3.1; DTIS 23.1; DAR 609.3; GC 675.1 (all frame).
  - GC88 678.3: "The great controversy is ended … declare that God is love".
  - 4SP 492.3: the earlier form.
- **Shape:** the fire purifies → the capital city → a real country → "from one sabbath to another" → "God is love".
- **Pictures:** the Dan 2 stone grown into a mountain; the tree of life.
- **Must not:** floating spirits; the earth thrown away; the new earth at the advent; a merely symbolic inheritance.
- **Searches:**
  - egw: The great controversy is ended; From the minutest atom to the greatest world.

### Doctrinal tensions found (dated, both sides; the films pick no side's gloss)

1. **Atonement at the cross (06, 20, 21).**
   - "Not made upon the cross": FP1889 147.3 note (1889); LUJ 238.2 (Smith, 1898).
   - "The sacrifice of Christ as an atonement for sin": Ms 70, 1901, par. 9 (EGW); DA 769.2 (1898), "Christ's completed work".
   - Wording: "sacrifice" and "offering" at the cross.
2. **The Son's origin (05).** CHR 21.2 (Waggoner, by 1891), "proceeded forth"; LUJ 10.1 (Smith, 1898); DA 530.3 (1898), "underived". Left unresolved.
3. **The Spirit's nature (10).**
   - James White 1861: "his representative".
   - J. H. Waggoner 1877: personality not entered on.
   - Smith 1898: "divine afflatus".
   - DA 671.2 (1898): "Third Person of the Godhead".
   - ST May 17, 1899: "it … a representation of Himself".
   - EGW, Ms 1906: "a person".
   - AA 52.1 (1911): "silence is golden".
   - Unsigned Review editorials of 1898: "himself".
4. **What the hands conveyed (10).**
   - SITI 1885: in view of "an especial work".
   - PTUK 1897: "an open question".
   - AA 161.2 (1911): "added no new grace".
5. **Sin's origin (04).** GC 492.2 (1888/1911): no reason can be given. EB xi.2 (Jones, 1904): how it could enter. Compatible if the film shows "how" and never "why".
6. **Christ's human nature (15).**
   - "Sinful tendencies … not in himself": CHR 26.2 (c. 1891); GCB 1895.
   - "Not for one moment … an evil propensity": Lt 8, 1895; but also "took upon him our sinful nature" (RH December 15, 1896) and "the great law of heredity" (DA 48.6, 1898).
7. **What God offered at Sinai (18).**
   - Waggoner against himself: SSW 1890 against GTI 185.2.
   - GTI 185.2 against PP 371.1 and 371.4 (EGW).
   - EVCO 326.3 puts the new covenant in the future, against PP 371.1, "valid in the days of Abraham".
8. **The rest of Heb 4:9 (20).** AERS 317.1 (J. H. Waggoner, 1884): "beyond literal Sabbath-keeping". SOSL 65.3 (Andrews): "a keeping of the Sabbath". GCDB 1897 (E. J. Waggoner): rest by faith now. AERS 317.1 is not adopted.
9. **The daily (23).** STTHD 41.4 (Smith): paganism. CWCP 99.1 (Jones, 1905): the continual service. Ms 11, 1910 (EGW): "not … a test question". Left out.
10. **The veil of Heb 6:19 and 10:20 (25).** CWCP 82.2 (Jones, 1905); LUJ 131.2 (Smith, 1898): "not to Christ's flesh"; LOM 41.2 (Crosier, 1846): the first veil. The KJV words are kept on screen.
11. **The ark's contents (19).** Heb 9:4 (pot, rod, tables) against 1 Kings 8:9 ("nothing … save the two tables"). STTHD 150.1 reads "wherein" as the tabernacle. The episode's title question lives inside this tension.
12. **Are believers judged? (24).** PTUK August 2, 1894, 486.11 (John 5:24, "shall not come into judgment") against JEO 22.1 and GC 480.1.
13. **The war in heaven (27).** DAR 513.2–513.3 (Smith, 1897): the war belongs to Christ's earthly ministry, and the dragon is pagan Rome. PP 42.3, DA 758.3 and PTUK 1895: the war began at the fall in heaven. USLP 25.1 (Smith): the dragon is "primarily … the devil".
14. **The latter rain (32).** Jones 1893: teaching. RH 1897: the ripening of character. EW 271 and RH 1892 join the two.
15. **The seal (31).** 8T 117.3 (1904): the outward sign. Ms 173, 1902: "settling into the truth". 7BC 970.3: "likeness to Christ in character". These are layered, not contradictory.
16. **When the mark is received.** James White 1850: first-day keeping as such. GC88 449.1 (1888): only under enforcement and light. The 1888 framing is used.

### Not found (all tiers)

- A pioneer naming the Melchisedec priesthood as Hebrews' "strong meat" in so many words; Haskell on Melchisedec.
- Any Haskell text on prayer or the Word.
- Under its common title, Andrews' _The Sanctuary and Its Cleansing_. The corpus has S23D, SOTB, JEO, STTHD and TTHDS.
- Originals of DA 805 ("breath of spiritual life"), RH May 21, 1895 ("likeness to Christ in character"), GC 640 ("small black cloud") and the "strange act" sentence. Only compilations printed them, so none is credited.
- Any corpus text applying Deut 32:2 or Isa 55:10–11 to the latter rain; any pioneer use of Deut 6:8 for the seal and the mark.
- Years missing from the corpus: EVCO, GTI, CIS, STTHD, S23D, JEO, RDAC, SOSL, 2SP, GNT, MON, RAR, HSFD.
- Bylines not confirmed:
  - SITI January 7, 1886 (Jones);
  - PTUK May 9, 1895 (Jones);
  - PTUK July 20, 1893, December 16, 1897, August 2, 1894 and November 4, 1897 (Waggoner);
  - AMS May 24, 1894 (Jones);
  - ARSH April 7, 1859 ("UrSe");
  - SITI March 18, 1889;
  - ARSH September 2, 1851 (unsigned).
- Credited by the corpus to Jones as editor but written by Waggoner, per the frame: GCDB March 8, 1897, pages 297–303.
- `bible verse` does not print KJV margins, so the Joel 2:23 "teacher of righteousness" margin cannot be quoted as KJV text.

## Verifier results for 01–03

`scratchpad/verify.py` was last run 2026-10-11, after the final edits. It checks three things:

- every “…” in a `say` line against the beat's KJV `cite` text (the CLI's text, with brackets dropped);
- every paraphrase-source snippet against the corpus, by refcode;
- the quoted share.

| Script                | Words | Quoted | Share  | KJV quotes | Source snippets                |
| --------------------- | ----- | ------ | ------ | ---------- | ------------------------------ |
| 01 Milk and Meat      | 741   | 130    | 17.5 % | all exact  | all found                      |
| 02 The Oracles of God | 652   | 110    | 16.9 % | all exact  | 2 flagged: MWV1 20.8, GC 598.3 |
| 03 God Is Love        | 582   | 94     | 16.2 % | all exact  | 2 flagged: SC 10.2, SC 11.1    |

The four flags are false negatives of the scratch tool. I fetched each paragraph by hand with `es.py` and found the snippet word for word. The search ranks a different paragraph first when a snippet opens on curly-quoted Scripture (“Show me Thy glory,” “He that hath seen Me …”, “If any man will do His will …”), and it does so for MWV1 20.8 as well.

Every beat has at most one quotation, and every script is under the 20 % cap. Each script's header records its landing position and its thesis line.

## Round 2026-10-12 · "Is Jesus the Lord God Almighty?" (asitreads.com) → 05, with hand-offs to 14 and 27

**What this round did.**

- Folded one third-party article into the series: Jason Smith, "Is Jesus the Lord God Almighty?" (posted June 12, 2018; originally on Facebook, December 11, 2017). Its URL is https://asitreads.com/2017-12-17-is-jesus-the-lord-god-almighty/, fetched with `curl`.
- Verified every quotation in it and gathered the wider pioneer witness.
- The extraction, verification table and tensions are in `asitreads-jesus-lord-god-almighty.md`. The script is `scripts/05-the-word-made-flesh.md`.

**Tools this round.** These ran on the laptop, where the local corpus works:

- `bible egw lookup <refcode>` and `bible egw search --scope egw|pioneer|all [--full]`, which are lexical (no vector index on this machine);
- `bible egw search --remote`, once;
- `bible verse`.

Every snippet below was printed by the CLI on 2026-10-12. Scratch checks (not repo tools) did two things:

- re-fetched every paraphrase snippet in the 05 script by refcode and matched it segment by segment: 28 of 28 pass, after one fix to the DA 24.3 quote marks;
- counted the quoted share: 124 of 666 words, 18.6 %.

### The article's quotations

| Article's ref                    | Corpus refcode                                                      | Status                                                                                |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| YI Dec 16, 1897, par. 5          | YI December 16, 1897, par. 5                                        | VERIFIED                                                                              |
| Ms 43b, 1891, par. 3             | 7LtMs, Ms 43b, 1891, par. 3                                         | VERIFIED ("UNDER GOD" caps are the article's emphasis)                                |
| Ms 64, 1895, par. 5              | 10LtMs, Ms 64, 1895, par. 5 (printed: RH February 18, 1896, par. 5) | VERIFIED (article typo "PATMOST"; drops a comma and "[Revelation 1:8.]")              |
| RH March 12, 1908, par. 4        | RH March 12, 1908, par. 4                                           | VERIFIED (mid-paragraph excerpt; antecedent is Christ)                                |
| Ms 140, 1903, par. 28            | 18LtMs, Ms 140, 1903, par. 28                                       | VERIFIED. Par. 27 read for context. The article's "was, not is" reading is its gloss. |
| YI May 27, 1897, par. 3          | YI May 27, 1897, par. 3                                             | VERIFIED (drops the first sentence)                                                   |
| DA 336                           | DA 336.1                                                            | VERIFIED                                                                              |
| ST May 10, 1899, par. 16         | same                                                                | VERIFIED                                                                              |
| ST May 10, 1899, par. 17         | same                                                                | VERIFIED                                                                              |
| DA 21                            | DA 21.2                                                             | VERIFIED                                                                              |
| James White, RH October 12, 1876 | (none)                                                              | NOT FOUND. ARSH vols. 28–53 are not installed.                                        |
| 3SG 37.3                         | 3SG 37.3                                                            | VERIFIED (page number 38 embedded)                                                    |
| Eugene Prewitt (modern)          | (none)                                                              | NOT FOUND (outside the corpus)                                                        |

Tally: 13 quotations, 11 VERIFIED, 0 DIFFER, 2 NOT FOUND.

The article's KJV quotations match `bible verse` except for typos in 1 Tim 6:14–16 ("unrebukable", "to hom"), a dropped comma in Matt 2:11, and "Her 1:6" for Heb 1:6.

Unsupported claim: that the speaker of Gen 17:1 is the pre-incarnate Son. No corpus witness was found; PP 370.3 quotes the verse without naming Him.

### Witnesses gathered (all VERIFIED by `bible egw lookup` on 2026-10-12)

- **Statements:** FP1872 4.3; FP1889 147.3 (frame).
- **J. H. Waggoner, The Atonement (1884):** AERS 152.1, 153.1 (the Son "should bear the name and title of his Father", "in a sense subordinate"), 154.1, 155.1, 164.3, 170.1 (John 12:41 = "Adonai, the Son, and not … Jehovah"; = ARSH November 3, 1863, page 182.15), 173.1.
- **E. J. Waggoner:**
  - CHR 9.1, 11.4 ("A son always rightfully takes the name of the father"), 14.3, 18.1, 19.1 (1 Cor 8:6), 22.1, 24.1, 25.1.
  - SITI July 7, 1887, page 407.2–407.4. The piece ends "W." at 407.8, though the corpus tags the volume to A. T. Jones. It reads Isaiah 6 as Christ's glory, and 407.4 says the infant of Bethlehem was "the same person whom all the angels had worshiped".
- **Uriah Smith:** LUJ 10.1 (frame), 10.2, 11.1, 17.2 (1898); DAR 335.2 (1897) and DAR1909 362.4 (Rev 1:8 = the Father).
- **James White:** LIFIN 343.2 (1868, frame).
- **Other Review writers:**
  - G. W. Amadon, ARSH September 24, 1861, page 136.1–136.9, signed; the corpus tags James White. "We do not believe that Christ is at all meant by the phrase, the Almighty."
  - Unsigned editorial on Revelation 1, ARSH June 3, 1862, page 4.7–4.27. The writer reports "a … Bible-class conducted by Bro. Uriah Smith", so he is not Smith; the corpus tags James White, but the byline is not established. At 4.18: "the Almighty, a name never given to Jesus Christ".
  - J. M. Stephenson, ATO 149.1 (= ARSH November 21, 1854, page 113.13): Rev 1:8 is "the testimony of the faithful witness himself".
  - SITI November 26, 1885, page 711.3, an unsigned Sabbath-school note tagged Jones; byline not confirmed. Isaiah's "Lord of hosts" "was Christ our Lord".
- **Ellen G. White:**
  - PH130 26.1; PP 34.1 (frame), 36.2, 311.4 (Ex 23:21 read of Christ), 370.3.
  - DA 19.1, 19.2, 21.2, 23.3, 24.3, 336.1, 530.3 (frame).
  - ST August 29, 1900, par. 13 (original of Ev 615.2); ST May 3, 1899, par. 18 ("Jehovah is the name given to Christ"); ST May 10, 1899, par. 16–17; ST December 30, 1889, par. 5.
  - RH April 5, 1906, par. 6–7; RH September 18, 1894, par. 3; RH February 18, 1896, par. 5; RH March 12, 1908, par. 4.
  - 12LtMs, Ms 71, 1897, par. 22; 18LtMs, Ms 140, 1903, par. 27–29; YI December 16, 1897, par. 5; YI May 27, 1897, par. 3; 7LtMs, Ms 43b, 1891, par. 3; 3SG 37.3.

**Used in the 05 script (credits).**

- FP1889 147.3; AERS 153.1; CHR 11.4, 14.3, 19.1, 24.1, 25.1; SITI July 7, 1887, 407.2, 407.4; LUJ 10.2; LIFIN 343.2.
- PP 34.1, 36.2; DA 19.1, 19.2, 21.2, 23.3, 24.3, 336.1; YI December 16, 1897, par. 5; YI May 27, 1897, par. 3; ST August 29, 1900, par. 13; ST May 10, 1899, par. 17; RH September 18, 1894, par. 3.

**Handed on.**

- To 14: ST May 10, 1899, par. 16–17; PP 36.2; LIFIN 343.2.
- To 27: 7LtMs, Ms 43b, 1891, par. 3; 3SG 37.3.

### Doctrinal tensions added (continuing the list above)

17. **"The Almighty" / "Lord God Almighty" (Rev 1:8; 4:8) (05, 14).**
    - Christ: Stephenson 1854 (ATO 149.1); EGW 1895/1896 (Ms 64 = RH February 18, 1896) and 1908 (RH March 12, 1908).
    - The Father: Amadon 1861; the Review in 1862 (4.18, "never given to Jesus Christ"); Smith 1897 (DAR 335.2).
    - EGW 1903 (Ms 140, par. 28): "The man Christ Jesus was not the Lord God Almighty, yet Christ and the Father are one".
    - The series voices none of these; see series.md, Open questions 11.
18. **Isaiah 6 and John 12:41 (05).**
    - The whole vision is Christ's: E. J. Waggoner 1887 (SITI 407.2); the unsigned SITI 1885 note; EGW 1894 and 1897.
    - Verse 10 and "Adonai" are the Son's, but "the LORD of hosts" (Jehovah) is the Father's: J. H. Waggoner 1863/1884 (AERS 170.1).
    - The script quotes Isa 6:1 and John 12:41 only.
19. **"God" said of the Son (05).** "In a sense subordinate" (AERS 153.1, 1884); "of the very substance and nature of God" (CHR 22.1, by 1891); "equal with the Father" (LUJ 10.2, 1898; Ms 140, 1903, par. 27); "God essentially, and in the highest sense" (RH April 5, 1906). The script uses PP 34.1's "one in nature, in character, in purpose".

### Not found (this round)

- James White, Review and Herald, October 12, 1876 (the volume is not installed).
- Any corpus witness that the speaker of Gen 17:1 is the Son.
- The Prewitt quotation (modern; outside the corpus).
- Any James White statement on Christ's divinity beyond LIFIN 343.2 in the installed Review volumes.
- Bylines that remain unconfirmed: the ARSH June 3, 1862 editorial; SITI November 26, 1885, 711.3.

### Searches (scope: query; full list with hit counts appended to `searches.log`)

- **egw:**
  - covering cherub prepared his request that he should be made prince to govern the world
  - It was He that revealed Himself to John on the isle of Patmos
  - crowning glory of Christ's attributes was his holiness
  - man Christ Jesus was not the Lord God Almighty
  - Jehovah is the name given to Christ
  - It was Christ who from the bush on Mount Horeb spoke to Moses I AM THAT I AM
  - pre-existent, self-existent Son of God
  - Christ was God essentially and in the highest sense
  - my name is in him the angel Christ leader of Israel
  - If Christ made all things, He existed before all things. Christ was God essentially
  - Isaiah saw the glory of Christ holy holy holy seraphim
  - These things said Esaias when he saw his glory and spake of him
  - I am the Almighty God walk before me and be thou perfect Christ appeared to Abraham
  - God informs Satan that this he can never know
  - gave back into his Father's hand the scepter
- **pioneer:**
  - hold the divinity of Christ so nearly with the trinitarian that we apprehend no trial here
  - the divinity of the Son of God death of the Son of God AERS
  - divinity of Christ (also `--book AERS`)
  - Son of God divine pre-existent (`--book AERS`)
  - Alpha and Omega the beginning and the ending saith the Lord which is and which was the Almighty
  - when he saw his glory and spake of him Isaiah Christ
  - thought it not robbery to be equal with God divinity of the Son James White
  - the Son of God is worthy of worship angels
  - pre-existence of Christ
  - the Son of God laid aside his glory
  - glory which I had with thee before the world was
  - Christ equal with God James White Philippians form of God
  - Before Abraham was I am I AM THAT I AM hath sent me
- **all:** so nearly with the trinitarian · apprehend no trial · ultimate executive of the universe.
- **remote:** so nearly with the trinitarian.
