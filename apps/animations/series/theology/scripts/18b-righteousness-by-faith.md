# 18b · Righteousness by Faith

Series: The Path of the Just · Tier Two (Meat) · after 18 · The Better Covenant (moved from stone 2 on 2026-10-19, owner)
Promise: the viewer knows how God can call a guilty man righteous without a cover-up: His word is a seed, and it brings faith, forgiveness and power.
Length: about 9:47 (1,181 spoken words: 7:37 at 155 wpm, 8:31 with the marked breaths and holds; plus the title, beat leads and tails, about 27 s of music alone after the thesis and 28 s of credits). The keep ask counted 157 wpm with no pauses: 7:31 of speech, 8:47 as a film. The landing (`court` and `thesis`, from its start to the last word) runs 36.25 s at 155 wpm, 34.35 s at 165: the owner kept its core marks and dropped nine breaths (2026-10-15, option B); it is measured again from his take.
Status: the v3 rewrite of the made film, kept (2026-10-15) and now the film's script: concepts kept, the Board under way, nothing narrated. Its source is `apps/animations/src/films/righteousness-by-faith/script.ts`, which keeps every picture brief in full (this draft gives each picture's first sentence), with sources.md and quotes.jsonl beside it: every KJV line printed by `bible verse`, every paraphrase source by the corpus search, all EXACT. Thesis: “The just shall live by faith.” Refrain: faith, forgiveness, power. 13.2 % of the words are Scripture read aloud. Marked for delivery 2026-10-15: `{*}` stress, `{/}` breath, `{//}` hold. v3 moved into the film on 2026-10-16 with every line as this draft has it (compared beat by beat); version 2's script stays in the film's `v2/` folder.

Each beat gives its register (STORY is the Bible scene, IDEA the parchment page), where it starts (at the marked pace), its line, its picture in one line and its sources. In a line, braces are never spoken: a name in braces is where the picture changes, `{*}` stresses the word after it, `{/}` is a breath, and `{//}` a hold of 0.6 s, or of the seconds it names. Words in “quotation marks” are the KJV, read as it reads.

## Cast

The built film draws its figures with the rigs in `src/films/righteousness-by-faith/rigs` (`rigs.ts`); the ids below are theirs.

| Figure | Kind | Scope | In the library? | Beats | The sheet must show |
| --- | --- | --- | --- | --- | --- |
| The accused, the film's lead (rigs `lead`, `leadHand`) | the film's lead: candidate 9, a young man of today, thick wavy mid-brown hair, no beard, a plain muted teal long-sleeved crew-neck top, khaki trousers, dark brown shoes (owner kept all three sheets, ask a8fb2170353) | film (his sheets are this film's; a later film may reuse him) | kept sheets in set `rbf-lead-sheets-2026-10-19` (picked from `rbf-lead-candidates-2026-10-18`), not in `src/library/cast` | `cold`, `title`, `word`, `seed`, `spoke`, `look`, `within`, `court`, `thesis` | his three kept sheets as they stand: stained in the dock, the gold seal on his top; beside the tablets, coming up short; the seed in his open palm; the tablets settling into his chest; the stride at "arose" (owner OK, ask a1cfb45a7cf); in white in the dock at the landing |
| The judge (rig `judge`, hands `skinHand`) | §5's official (casting.md 2.1: 50, 0.98, deep slate, gavel, warm brows, "a fair official"; cold.13's judge) | shared (§5's minor set) | the film's rig | `cold`, `title`, `court` | at the bench screen-right, saying one word (front, three-quarter) |
| The prosecutor (rig `prosecutor`, hands `skinHand`) | film minor: a head taller than the lead, jet-black hair (owner's pick in cold.21) | film | the film's rig | `cold`, `court` (his place empty) | reading the charge, pointing at the evidence (three-quarter) |
| Jesus Christ (rigs `christ`, `christFront`, `christHand`, `christHandOut1`–`4`; casting.md #1) | Bible figure, the locked figure in the court canon height band, never short | shared | yes: `src/library/cast/christ`; the film's rigs are traced from it | `roof`, `woman`, `grain`, `priest`, `accuser`, `robe`, `court` | on earth his earthly dress per casting.md (the linen coat and walnut mantle; the script's "white robe, gold sash" is conflict item 1, waiting on OQ5): looking up at the four, stooping to write in the dust; the cross in silhouette; the High Priest in the first room before the veil; the Angel at the bench in white and gold, holding the filthy garments; the Advocate beside the accused in the dock |
| The paralytic and the four (casting.md #17) | Bible figures | shared | listed, not drawn | `roof` | the four lifting tiles and lowering the bed on ropes (three-quarter, from above); the man rising, the bed under his arm |
| The house crowd and the scribes (casting.md #3, #25) | crowd from the story crowd kit | shared | listed | `roof` | packed into the room, varied heights and headcloths, never cloned; the scribes' faces hardening |
| The woman taken in adultery and her accusers (casting.md #26, #25) | Bible figures; the accusers a crowd from the kit | shared | listed, not drawn; the film draws her (`scenes/look.ts`, `scenes/within.ts`) | `woman`, `within` | standing head bowed, a flat scarlet blot soaked into the garment (front); walking out upright, screen-left (profile); the accusers holding stones, one holding up a scroll, the stones dropping |
| Moses and the bitten camp (casting.md #2, #14) | Bible figures; the camp a crowd from the kit | shared | listed, not drawn | `look` | Moses lifting the bronze serpent on the pole (three-quarter); the bitten turning to look (front) |
| Joshua the high priest (casting.md #16) | Bible figure, main in his beats | shared | listed, not drawn | `accuser`, `robe` | in a priest's turban, head bowed, garments with flat scarlet blots (front, three-quarter); clean, looking down at the white robe (front, close) |
| Satan, the accuser (casting.md #9) | Bible figure, minor: tall, angular, shadow-violet, his head no higher than the Advocate's (casting.md §4 item 15) | shared | listed, not drawn | `accuser`, `robe` | stepping up at Joshua's right hand and pointing (profile); silenced, in shadow at the court's edge (three-quarter) |
| Those that stand by (casting.md #7, angels) | Bible figures, a group | shared | listed, not drawn | `robe` | lifting the filthy garments off Joshua (three-quarter) |
| Rosa, the grandmother (ensemble.md, the recurring cast) | the recurring cast, cast by the owner as `garden`'s figure (2026-10-16) | shared | yes: ensemble.md | `garden` | kneeling at a bed (three-quarter), pressing seeds in and watering, sitting back on her heels, putting down her tools on the seventh day; plum skirt and shawl, wide garden hat |
| The farmer (rigs `farmer`, `farmerHand`) | film minor, James's farmer, no cast | film | the film's rig | `rain` | at the field's edge lifting his face to the rain (three-quarter, close); sleeves to the wrist (owner rule) |

Settings:

| Set | Scope | Beats | Light |
| --- | --- | --- | --- |
| The courtroom: a diorama on the parchment in `cold`, cardboard in the paper world at the landing (the bench screen-right, the dock screen-left, the high window) | series (T13, Judge and Advocate, can stand in it) | `cold`, `title`, `court`, `thesis`, `end` | warm sunlight from the high window; the landing's teal, the film's most saturated |
| The parchment page | series | `word`, `seed`, `spoke`, `look`, `within`, `garden` | peach |
| Genesis 1: the dark paper world, the sun, land and water | shared | `spoke` | black to dawn to teal |
| A house in Capernaum | shared | `roof` | peach afternoon |
| The temple court (05's court) | shared | `woman` | early morning peach |
| The desert camp with the pole | shared | `look` | peach |
| The hill at sunset with the cross, the ploughed field below (03's cross hill) | shared | `grain`, `priest` | sunset to black to dawn |
| The empty tomb | shared | `priest` | dawn |
| The sanctuary in heaven, two rooms in gold light | series (T14, Priest) | `priest` | teal and gold |
| Heaven's court in Zech 3, laid out as the cold open's court | series (T24) | `accuser`, `robe` | gold dawn |
| Rosa's garden in the hills: a gate, the beds, a bench under a fig tree | shared (ensemble.md, Rosa's gate) | `garden` | morning |
| Wide paper fields | shared (01's hillside field) | `rain` | the landing's teal; gold and silver rain |

Props:

| Prop | Scope | Beats |
| --- | --- | --- |
| The gold wax seal that turns over into a seed | film | `cold`, `seed`, `spoke`, `look`, `within`, `court` |
| The two stone tablets (03's and 03b's) | series | `word`, `within` |
| The three icons: the open hand, the white cloth, the green blade | film | `spoke`, `look`, `grain`, `robe`, `within` |
| The bronze serpent on its pole | shared | `look` |
| The grain of wheat and the furrow | film | `grain`, `priest` |
| The filthy garments and the white robe, the gold loom | series (the arc's robe of light is its kin) | `accuser`, `robe`, `court` |
| The judge's gavel | shared (§5's official) | `cold` |

New to the library: the lead (candidate 9) once a second film uses him; the courtroom set; Joshua; the accuser; the woman; Rosa's garden.

## 1. The verdict

_How can God call a guilty man righteous?_ · teal day

### `cold` · IDEA · at 0:00 (0 %) · 78 words

**say:** Picture a young man in a courtroom. {/} {evidence}Every piece of evidence says one thing: {/} {did}he {*}did it. {/} {judge}And the judge says one word. {//} {righteous}{*}Righteous. {/} {seal}Righteous? {/} {cover}That's not justice, that's a {*}cover-up. {/} {bible}Now, the Bible agrees: God will {*}not clear the guilty. {/} And yet it says He {*}justifies the ungodly. {//} {which}So the question is, how can God call a guilty man righteous? {/} And we all need the answer. {/} {asked}Job asked long ago: {/} {job}“How should man be {*}just with God?”

**picture:** IDEA: the court as a paper diorama on the parchment page, lit by a cool, even teal day from one high window (the act's light).

**cite:** Exodus 23:7; Exodus 34:7; Romans 4:5; Job 9:2

### `title` · IDEA · at 0:35 (6 %)

**picture:** IDEA: the court pulled wide from high in its back wall: the accused small in the dock, the crack across the floor at his feet, teal light falling through the high window.

## 2. The seed

_Is God’s verdict a cover-up?_ · peach parchment

### `word` · IDEA · at 0:38 (6 %) · 71 words

**say:** So is God's verdict a cover-up? {//} What does the word mean? {/} {right}Righteousness is right {*}doing. {/} {measure}Right by {*}whose measure? {/} {all}The psalm says, “All thy {*}commandments are righteousness.” {/} His law is a picture of His {*}character. {/} So how do we measure up? {/} {short}We {*}all come up short. {/} {cover}And we do what Adam and Eve did: {/} we cover up. {/} {fig}Fig leaves, excuses, a nicer coat over the stain. {/} {going}And how is that going?

**picture:** IDEA: a page turn into the act's peach parchment light.

**cite:** Ellen G. White, Christ's Object Lessons, 312; Psalm 119:172; E. J. Waggoner, Christ and His Righteousness, 48; Romans 3:23; Genesis 3:7; Ellen G. White, Christ's Object Lessons, 311

### `seed` · IDEA · at 1:10 (12 %) · 63 words

**say:** {label}But when God says righteous, it isn't a {*}label on the outside. {/} {seed}Jesus said, “The seed is the {*}word of God.” {//1} A seed looks like {*}nothing. {/} {alive}But it's {*}alive. {/} {folded}The life of the whole plant is folded up inside. {/} {life}In the same way, every word God speaks carries His {*}own life. {/} Take in His word by faith, {/} and you take in His life.

**picture:** IDEA: the dropped leaves blow aside and the camera pushes in on the gold wax seal on the accused's top, its R pressed in the wax and its ribbon tail hanging, in cold's shape and scale (CRAFT rule 8).

**cite:** Luke 8:11; Ellen G. White, Christ's Object Lessons, 38

### `spoke` · IDEA · at 1:37 (17 %) · 80 words

**say:** {first}How can a {*}word do that? {//} {dark}On the Bible's first page, the world is dark. {/} {light}God says, Let there be light, and there {*}is light. {/} {itself}No tools, just His {*}word. {/} {calleth}Paul says He “calleth those things which be {*}not as though they were.” {/} When He calls them, they {*}are. {//} {verdict}So is His verdict {cover}a cover-up? {/} {seed}No. {/} It's a {*}seed, and His word makes it {*}true. {/} {brings}And His word brings three things. {/} {faith}It brings faith. {/} {forgiveness}It brings forgiveness. {/} {power}It brings power.

**picture:** IDEA, then STORY, then IDEA.

**cite:** Genesis 1:2–3; Psalm 33:9; Romans 4:17; Ellen G. White, Education, 254; E. J. Waggoner, The Glad Tidings, 77

## 3. The three gifts

_What does that look like in a real person’s life?_ · peach afternoon

### `roof` · STORY · at 2:13 (23 %) · 105 words

**say:** {see}So what does that look like in a {*}real person's life? {//} {roof}In Capernaum the house is so packed that four friends open the roof. {/} They lower a man who can't walk, bed and all, at the feet of Jesus. {/} {saw}He sees their faith, and says, {son}“Son, thy sins be {*}forgiven thee.” {//} {easy}But who can {*}see a sin forgiven? {/} No one. {/} {arise}So Jesus says, Arise, take up your bed, go home. {/} {went}And the man {*}walks out in front of them all. {//} {count}So what did he receive? {/} {one}He came believing: {hand}that's {*}faith. {/} {two}Jesus pardoned him: {cloth}that's {*}forgiveness. {/} {three}And he walked: {blade}that's {*}power. {/} {proof}The walk proves the pardon.

**picture:** STORY: on see (the act's question) the camera pushes through the faith icon of spoke's row into the scene.

**cite:** Mark 2:1–12; Ellen G. White, The Desire of Ages, 268, 270

### `woman` · STORY · at 2:59 (30 %) · 92 words

**say:** {court}In the temple court, they drag in a woman caught in sin. {/} {law}They throw the law of Moses at Jesus: {/} stone her. {/} {dust}He stoops and writes in the dust. {/} {first}Then He stands: whoever is {*}without sin, throw the first stone. {//} {leave}One by one, they leave. {/} {alone}Woman, has no one condemned you? {/} {lord}No one, Lord. {/} {told}And Jesus says, {*}“Neither do I condemn thee: {/} go, and sin no more.” {//} {again}Do you see the three? {/} {one}She calls Him {*}Lord. {/} {two}He {*}doesn't condemn her. {/} {three}And she walks out into a {*}new life. {/} {order}Same three, same {*}order.

**picture:** STORY: on court cut to a temple court in the same peach light, early morning.

**cite:** John 8:2–11; Ellen G. White, The Desire of Ages, 461–462

### `look` · IDEA · at 3:40 (37 %) · 95 words

**say:** {faith}So where does faith come from? {/} {where}From {*}hearing the word. {/} {expects}Faith expects that word to do what it says. {/} {hand}It earns nothing: it's just the hand that {*}takes. {//1} {desert}In the desert the camp is full of snakes. {/} Imagine you've been bitten. {/} {pole}God has Moses set a bronze serpent on a pole, and whoever looks, {*}lives. {/} {harder}Now, we like to make it harder. {/} {climb}But no one has to {*}climb the pole. {/} {look}Just {*}look. {//} {lifted}Jesus said of Himself, “As Moses lifted up the serpent in the wilderness, even so must the {*}Son of man be lifted up.”

**picture:** IDEA, then STORY.

**cite:** Romans 10:17; A. T. Jones, The Bible Echo, May 22, 1899, 171; Ellen G. White, The Desire of Ages, 175; Numbers 21:6–9; Ellen G. White, Letter 85, 1891; John 3:14

## 4. The grain

_How can God forgive?_ · sunset to the one black moment

### `grain` · STORY · at 4:22 (45 %) · 90 words

**say:** {forgive}But how can God forgive? {//} {guilt}He will not clear the guilty. {/} {pays}So {*}who pays? {//} Jesus answers with a seed, a grain of wheat: {/} {except}“Except a corn of wheat fall into the ground and {*}die, it abideth alone: {/} but if it die, it bringeth forth much fruit.” {//1} {fruit}He was that seed. {/} {treated}He was treated as {*}we deserve, {/} so we could be treated as {*}He deserves. {/} {laid}He had no sin of His own, {/} but {*}ours were laid on Him. {/} He {*}Himself paid the price, {/} and gave Himself for us as a sacrifice. {//} {cross}Why? {/} Because He {*}loves us.

**picture:** STORY: the page opens on look's closing row; on forgive (the act's question) the white cloth pulses and the other two icons dim (forgiveness opens on its icon).

**cite:** Exodus 34:7; John 12:24; E. J. Waggoner, The Signs of the Times, November 29, 1899, 769; Ellen G. White, The Desire of Ages, 623; Ellen G. White, The Desire of Ages, 25; 2 Corinthians 5:21; Isaiah 53:6; Ephesians 5:2

## 5. He is still at work

_Does Jesus’s work end at the cross?_ · dawn to morning

### `priest` · STORY · at 5:08 (52 %) · 51 words

**say:** But does His work end at the cross? {//} {ground}No. {/} A seed doesn't {*}stay in the ground. {/} {rose}He rose. {/} {up}He went up as our High Priest, to stand before God for us. {/} {now}“He {*}ever liveth to make intercession.” {/} His pleading for us {*}now is as needed as His dying for us {*}then.

**picture:** STORY: dawn relights the world after the black (the act's light), on the act's question.

**cite:** Hebrews 8:1–2; Hebrews 9:24; Hebrews 7:25; Ellen G. White, The Great Controversy, 489

### `accuser` · STORY · at 5:30 (56 %) · 84 words

**say:** {zech}The prophet Zechariah saw His pleading in a vision: {/} a {*}courtroom. {/} {joshua}Joshua the high priest stands for his people before the Angel of the LORD, {filthy}in {*}filthy clothes. {/} {satan}Satan stands at his right hand to accuse him. {/} {points}And about the clothes, he isn't {*}wrong. {//} {day}The vision pictures the close of the great Day of Atonement. {/} On that day God's people are judged and made {*}clean from all their sins. {//} {angel}But the Angel is {*}Christ Himself. {/} And He answers: {/} {silence}“The LORD {*}rebuke thee, O Satan.”

**picture:** STORY: heaven's court, laid out like the cold open's courtroom (the same positions: the bench screen-right, the one accused screen-left; CRAFT rule 8), in gold dawn light.

**cite:** Zechariah 3:1–3; Ellen G. White, Testimonies for the Church, vol. 5, 467–472; Leviticus 16:30; Ellen G. White, The Great Controversy, 480

### `robe` · STORY · at 6:06 (62 %) · 65 words

**say:** {take}Then He has the filthy clothes taken off him, {/} {pass}and says, “Behold, I have caused thine iniquity to {*}pass from thee.” {//} {loom}And He dresses him in a robe from heaven's loom, without one thread of his own. {//} {exchange}It's an {*}exchange. {/} He asks for our sins, {/} and gives us His own {*}righteousness. {//} {nicer}Now, isn't that just a nicer coat over the stain? {/} {cloak}No. {/} He doesn't {*}cover the stain. {/} {away}He takes it {*}away. {//} {walk}And then He says, {*}walk in my ways.

**picture:** STORY: the same court, the silenced accuser in shadow at its edge from take to walk.

**cite:** Zechariah 3:4; Ellen G. White, Christ's Object Lessons, 311; Isaiah 61:10; E. J. Waggoner, Christ and His Righteousness, 64, 65; Ellen G. White, Thoughts From the Mount of Blessing, 114; Zechariah 3:7

### `within` · IDEA · at 6:36 (67 %) · 78 words

**say:** {power}And for the walk, He gives {*}power. {/} {remember}Remember what He told the woman: {/} go, and sin no more. {/} Is He {*}mocking her? {/} No. {/} {command}Every command He gives is a {*}seed, {/} and inside it is His own life. {/} {write}“I will put my laws into their mind, and write them in their {*}hearts.” {//} {bed}The man on the bed couldn't walk, however much he wished. {/} {we}We can't stop sinning, however much we wish. {/} {arose}But He said arise, {/} and the man {*}arose.

**picture:** IDEA: the page opens on robe's closing row; on power the green blade pulses and the other two icons dim (power opens on its icon).

**cite:** John 8:11; Ellen G. White, Christ's Object Lessons, 38; Hebrews 8:10; Ellen G. White, Steps to Christ, 47, 51; Mark 2:11–12

### `garden` · IDEA · at 7:10 (73 %) · 87 words

**say:** {part}So what's our part? {//} {picture}Picture a grandmother in her garden. {/} {sow}She digs, she sows, she waters. {/} {grow}But can she make {*}one seed grow? {/} No. {/} {power}Every seed grows by the power of {*}God. {/} {blade}And it grows the way Jesus said: {/} “First the blade, then the ear, after that the full corn in the ear.” {//} {morning}It's the same with us. {/} Each morning, {will}we give God our {*}will, {/} and He does the {*}growing. {//} {seventh}And on the seventh day {rest}she puts down her tools and rests. {/} Even that rest is {*}faith.

**picture:** IDEA: a garden in the hills, set on the page (a gate, the beds, a bench under a fig tree), in morning light, the dawn of robe gone on to morning.

**cite:** Ellen G. White, Christ's Object Lessons, 63, 65; 1 Corinthians 3:6; Mark 4:28; Ellen G. White, Steps to Christ, 47, 70; E. J. Waggoner, General Conference Daily Bulletin, March 8, 1897, 303; Hebrews 4:10

## 6. The harvest

_Where is all this heading?_ · teal day, the most saturated

### `rain` · STORY · at 7:49 (80 %) · 61 words

**say:** {heading}So where is all this heading? {//} {harvest}To a {*}harvest. {/} In Israel the latter rain, the last rain of spring, ripened the grain. {/} {like}And God's {*}word comes down like the rain. {/} {rain}Seek the LORD, the prophet says, {/} “till he come and rain {*}righteousness upon you.” {//} {blot}Even the {*}record of our sins will be blotted out. {/} {ripe}And sin in our lives will {*}end.

**picture:** STORY: wide paper fields under the landing's teal (the act's light).

**cite:** James 5:7; Deuteronomy 11:14; Joel 2:23; Ellen G. White, Testimonies to Ministers, 506; Isaiah 55:10–11; Hosea 10:12; Acts 3:19; Ellen G. White, The Great Controversy, 483; A. T. Jones, The Consecrated Way to Christian Perfection, 124

### `court` · STORY · at 8:16 (84 %) · 75 words

**say:** {back}Back to the courtroom. {charge}Who can accuse him {*}now? No one. {justifieth}“It is {*}God that justifieth.” {//} {beside}Christ, who died for him, stands beside him. {seed}It was never a cover-up. It was a {*}seed. {takes}And it makes a man righteous the moment he {*}takes it. {you}Today He holds the {*}same seed out to you: {faith}faith, {/} {forgiveness}forgiveness, {/} {power}power. {leaves}You can keep the fig leaves, or take the seed and {*}live. {/} {how}How should man be {*}just with God?

**picture:** STORY: the landing merges the registers: the cold open's courtroom (the same bench, the same positions, the same framing) now stands in the paper world under the landing's teal, the film's most saturated light.

**cite:** Romans 8:33–34; 1 John 2:1; Ellen G. White, Ms 46, 1891 (3SM 195); E. J. Waggoner, The Glad Tidings, 77; Job 9:2

### `thesis` · IDEA · at 8:49 (90 %) · 6 words

**say:** “The just shall live by {*}faith.”

**picture:** IDEA: after the held pause, the full-screen card, the film's last words: "The just shall live by faith.", "faith" large in gold, the card answering Job's "just" in cold; hard cut back to the court in the light.

**cite:** Habakkuk 2:4; Romans 1:17

### `end` · STORY · at 9:19 (95 %)

**picture:** STORY: the credits over the coda: the camera eases back from the court through the high window into the teal sky, while the film's name and its sources roll up a torn paper strip at the left for about 22 s; then the strip goes and the sky holds clear for the end screens.
