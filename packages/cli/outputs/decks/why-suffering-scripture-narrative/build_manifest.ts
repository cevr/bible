import { mkdir } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"

type Beat = {
  readonly ref: string
  readonly lookupRef?: string
  readonly lookupRefs?: ReadonlyArray<string>
  readonly section: string
  readonly sourceImage: string
  readonly sourceSlide?: number
  readonly note?: string
}

const root = dirname(import.meta.path)
const beatmapPath = resolve(root, "../what-is-truth/day3-beatmap.json")
const beatmap = (await Bun.file(beatmapPath).json()) as ReadonlyArray<{
  readonly slide: number
  readonly note: string
}>

const beats: ReadonlyArray<Beat> = [
  { ref: "Habakkuk 1:2-3", section: "The Question", sourceImage: "../what-is-truth/images/day3/n02-suffering-weight.png", sourceSlide: 3 },
  { ref: "1 John 4:8", section: "The Answer Begins", sourceImage: "../what-is-truth/images/day3/n09-heart-of-god.png", sourceSlide: 17 },
  { ref: "Job 38:4-7", section: "A Universe Before Us", sourceImage: "../what-is-truth/images/day3/02-stars-before-creation.png", note: "The answer begins before humanity. An intelligent created order watched and rejoiced when God laid the foundations of earth." },
  { ref: "Colossians 1:16", section: "A Universe at Peace", sourceImage: "../what-is-truth/images/day3/n04-host-at-peace.png", note: "Christ created every rank and order of heavenly being. Sin was not the first state of the universe." },
  { ref: "2 Peter 2:4", section: "Sin Before Eden", sourceImage: "../reading-102/images/s01-2pet-2-4.png", note: "The Bible starts the problem of evil before Eden. Angels sinned before humans did. The suffering of earth belongs to a larger conflict." },
  { ref: "Ezekiel 28:14", section: "The Covering Cherub", sourceImage: "../reading-102/images/s02-eze-28-14.png", note: "Lucifer was not created as a devil. God placed him near the throne as an anointed covering cherub." },
  { ref: "Ezekiel 28:13", section: "The Covering Cherub", sourceImage: "../reading-102/images/s03-eze-28-13.png", note: "His beauty and gifts came from God. Evil did not begin with a defect in his creation." },
  { ref: "Ezekiel 28:15", section: "The Fall of Lucifer", sourceImage: "../what-is-truth/images/day3/01-covering-cherub.png", sourceSlide: 7 },
  { ref: "Ezekiel 28:17", section: "Beauty Turned Inward", sourceImage: "../what-is-truth/images/day3/n10b-lucifer-envy.png", note: "Lucifer turned his eyes from the Giver to his own beauty. Pride corrupted the wisdom that God had given him." },
  { ref: "Romans 13:10", section: "The Law of Love", sourceImage: "../what-is-truth/images/day3/04-ark-cherubim.png", sourceSlide: 11 },
  { ref: "Isaiah 14:12", section: "The First Rebellion", sourceImage: "../reading-102/images/s05-isa-14-12.png", note: "Lucifer fell from heaven. The one called the son of the morning became the enemy of God and man." },
  { ref: "Isaiah 14:13-14", section: "The First Rebellion", sourceImage: "../what-is-truth/images/day3/n11-pride-dawns.png", sourceSlide: 9 },
  { ref: "Psalm 2:6-7", section: "The Son Revealed", sourceImage: "../reading-102/images/s07-ps-2-6-7.png", note: "The Father declared the Son before the heavenly host. The conflict concerns the place, authority, and character of Christ." },
  { ref: "Hebrews 1:5-6", section: "The Son Revealed", sourceImage: "../reading-102/images/s08-heb-1-5-6.png", note: "The angels receive a command to worship the Son. Christ is not one angel among others." },
  { ref: "Revelation 12:7-8", section: "War in Heaven", sourceImage: "../reading-102/images/s09-rev-12-7-8.png", note: "The dispute became open war. The dragon and his angels could not keep their place in heaven." },
  { ref: "Revelation 12:7-9", section: "War in Heaven", sourceImage: "../what-is-truth/images/day3-v2/d3-r-war.png", sourceSlide: 15 },
  { ref: "Jude 6", lookupRef: "Jude 1:6", section: "Why God Did Not End It At Once", sourceImage: "../reading-102/images/s11-jude-6.png", note: "God restrained the rebels for judgment. He did not remove the need for an open verdict." },
  { ref: "Matthew 25:41", section: "His End Is Prepared", sourceImage: "../reading-102/images/s13-matt-25-41.png", note: "The final fire was prepared for the devil and his angels. It was never God's first purpose for the human family." },
  { ref: "Deuteronomy 19:15", section: "The Open Trial", sourceImage: "../what-is-truth/images/day3/n14-cosmic-courtroom.png", sourceSlide: 22 },
  { ref: "1 Corinthians 4:9", section: "The Watching Universe", sourceImage: "../what-is-truth/images/day3/07-human-before-cosmos.png", sourceSlide: 23 },
  { ref: "Genesis 1:26-27", section: "Created as Witnesses", sourceImage: "../reading-102/images/s13b-gen-1-26-27.png", note: "Human beings entered the conflict as free creatures made in God's image. The earth became a public display of the two governments." },
  { ref: "Ephesians 3:9-10", section: "Created as Witnesses", sourceImage: "../reading-102/images/s13c-eph-3-9-10.png", note: "God makes His wisdom known to the powers in heavenly places through His work in the church." },
  { ref: "Genesis 1:31", section: "A World Without Suffering", sourceImage: "../what-is-truth/images/day3-v2/d3-c-six-days.png", sourceSlide: 24 },
  { ref: "Genesis 2:7", section: "A Living Soul", sourceImage: "../what-is-truth/images/day3-v2/d3-c-breath.png", sourceSlide: 25 },
  { ref: "Genesis 2:2-3", section: "The Creation Sabbath", sourceImage: "../what-is-truth/images/day3-v2/d3-c-sabbath.png", note: "The seventh day was blessed before sin, before Israel, and before any nation. It belongs to the finished creation." },
  { ref: "Genesis 2:16-17", section: "Freedom With a Real Choice", sourceImage: "../what-is-truth/images/day3/n17-the-tree.png", sourceSlide: 28 },
  { ref: "Joshua 24:15", section: "Love Requires Choice", sourceImage: "../what-is-truth/images/day3/06-open-hands.png", note: "God invites allegiance. He does not compel it. A real choice gives love its meaning." },
  { ref: "Genesis 3:1", section: "The First Lie", sourceImage: "../what-is-truth/images/day3-v2/d3-e-hath-dragon.png", sourceSlide: 29 },
  { ref: "Genesis 3:4-5", section: "The Second Lie", sourceImage: "../what-is-truth/images/day3-v2/d3-e-die-dragon.png", sourceSlide: 30 },
  { ref: "Genesis 3:6", section: "Humanity Changes Sides", sourceImage: "../what-is-truth/images/day3/n18-the-fall.png", sourceSlide: 31 },
  { ref: "Genesis 3:15", section: "War Declared on the Serpent", sourceImage: "../reading-102/images/s15-gen-3-15.png", note: "The sentence on the serpent also carried the first gospel promise. The Seed of the woman would crush the serpent's head." },
  { ref: "2 Corinthians 10:4-5", section: "The War for the Mind", sourceImage: "../reading-102/images/s15b-2cor-10-4-5.png", note: "The conflict now enters the mind. God's weapons pull down lies and bring thought back under Christ." },
  { ref: "John 8:44", section: "The Father of Lies", sourceImage: "../reading-102/images/s16-john-8-44.png", note: "Jesus identifies the enemy by his works. Murder and falsehood grow from the same rejected truth." },
  { ref: "2 Corinthians 4:4", section: "The Stolen Dominion", sourceImage: "../what-is-truth/images/day3-v2/d3-d-dominion-claimed.png", sourceSlide: 34 },
  { ref: "John 3:16-17", section: "The Plan of Salvation", sourceImage: "images/s16-plan.png", sourceSlide: 35 },
  { ref: "Job 1:6-7", section: "The Usurper at the Gate", sourceImage: "../reading-102/images/s16b-job-1-6-7.png", note: "Satan appeared as the claimant of earth. He spoke as one who had walked through his seized domain." },
  { ref: "Zechariah 3:1-2", section: "The Accuser at Court", sourceImage: "../reading-102/images/s17-zech-3-1-2.png", note: "The accuser points to real guilt. The Lord answers with rebuke and redemption." },
  { ref: "Romans 8:33-34", section: "The Advocate at Court", sourceImage: "../reading-102/images/s18-rom-8-33-34.png", note: "The accusation fails because Christ died, rose, and now intercedes. The same court has an Advocate." },
  { ref: "Genesis 4:8", section: "The Two Seeds", sourceImage: "../what-is-truth/images/day3-v2/d3-g-altars.png", sourceSlide: 40 },
  { ref: "Genesis 4:16-17, 26", lookupRefs: ["Genesis 4:16-17", "Genesis 4:26"], section: "Two Civilizations", sourceImage: "../what-is-truth/images/day3-v2/d3-g-two-lines.png", note: "Cain's line built life away from God's presence. Seth's line called on the name of the Lord. The two seeds became two societies." },
  { ref: "Genesis 5:24", section: "Enoch Walked With God", sourceImage: "../what-is-truth/images/day3-v2/d3-s-enoch.png", note: "Enoch lived with God inside a corrupt golden age. His life proved that the enemy could not make obedience impossible." },
  { ref: "Genesis 6:5", section: "The First Golden Age", sourceImage: "../what-is-truth/images/day3-v2/d3-n-golden.png", note: "Human power and knowledge grew while the mind turned away from God. The outward brilliance hid inward violence and corruption." },
  { ref: "2 Peter 2:5", section: "The Long Warning", sourceImage: "../what-is-truth/images/day3-v2/d3-n-noah.png", sourceSlide: 44 },
  { ref: "Genesis 7:16", section: "The Door Closed", sourceImage: "../what-is-truth/images/day3-v2/d3-h-warning.png", note: "God kept the door open through the long warning. God also closed it when the time of decision ended." },
  { ref: "Matthew 24:37-39", section: "The Flood and the Last Days", sourceImage: "../what-is-truth/images/day3-v2/d3-n-flood-marble.png", sourceSlide: 45 },
  { ref: "Genesis 11:4", section: "Babel", sourceImage: "../what-is-truth/images/day3-v2/d3-h-babel-build.png", sourceSlide: 46 },
  { ref: "Genesis 11:7-9", section: "Babel Scattered", sourceImage: "../what-is-truth/images/day3-v2/d3-h-babel-scatter.png", note: "God did not break His promise with another flood. He confused the one language that held the rebel project together." },
  { ref: "Genesis 12:1-3", section: "The Promise Gets an Address", sourceImage: "../what-is-truth/images/day3-v2/d3-i-patriarchs.png", note: "God called Abraham out of the nations. Through his seed, the promised Deliverer would bless every family of earth." },
  { ref: "Deuteronomy 32:17", section: "The Gods Behind the Masks", sourceImage: "../what-is-truth/images/day3-v2/d3-h-pantheon.png", sourceSlide: 49 },
  { ref: "Genesis 22:8", section: "The Promised Lamb", sourceImage: "../what-is-truth/images/day3-v2/d3-moriah.png", sourceSlide: 54 },
  { ref: "Exodus 14:13-14", section: "The Deliverer", sourceImage: "../what-is-truth/images/day3-v2/d3-i-exodus.png", sourceSlide: 55 },
  { ref: "Deuteronomy 18:10-12", section: "The Spirit World Forbidden", sourceImage: "../what-is-truth/images/day3-v2/d3-l-seance.png", note: "The prohibition protects the living. Fallen spirits can answer, but the answer does not come from the dead." },
  { ref: "Hebrews 8:5", section: "The Sanctuary Pattern", sourceImage: "../what-is-truth/images/day3/n07b-moses-pattern.png", sourceSlide: 55 },
  { ref: "1 Kings 18:36-39", section: "The Counterfeit Confronted", sourceImage: "../what-is-truth/images/day3-v2/d3-carmel.png", note: "Carmel brings the two systems into public view. God answers a plain prayer and turns the people back to Himself." },
  { ref: "Jeremiah 25:4", section: "Mercy Kept Calling", sourceImage: "../what-is-truth/images/day3-v2/d3-i-unprotected.png", note: "God sent messenger after messenger. Judgment came after repeated warning, not before it." },
  { ref: "Jeremiah 32:35", section: "The Slander of God", sourceImage: "../what-is-truth/images/day3-v2/d3-molech.png", sourceSlide: 50 },
  { ref: "Daniel 9:25", section: "The Published Appointment", sourceImage: "../what-is-truth/images/day3-v2/d3-i-daniel.png", sourceSlide: 61 },
  { ref: "John 1:14", section: "God Enters the Suffering", sourceImage: "../what-is-truth/images/day3-v2/d3-i-unprepared.png", sourceSlide: 65 },
  { ref: "John 1:29", section: "The Lamb Arrives", sourceImage: "../what-is-truth/images/day3-v2/d3-g-behold-lamb.png", note: "Every altar and every lamb pointed forward to this moment. John sees Jesus and names Him in one sentence. The promised Lamb has arrived." },
  { ref: "Matthew 4:4", section: "The Wilderness Rematch", sourceImage: "../what-is-truth/images/day3-v2/d3-j-temptation.png", sourceSlide: 66 },
  { ref: "Hebrews 4:15", section: "The Wilderness Rematch", sourceImage: "../reading-102/images/s20-heb-4-15.png", note: "Christ met every line of human temptation without sin. Where Adam distrusted the word, Christ stood on the word." },
  { ref: "John 8:10-11", section: "Mercy for the Condemned", sourceImage: "../what-is-truth/images/day3/n28-grace-received.png", note: "The only sinless person in the court refused to condemn the woman. His mercy also called her away from sin." },
  { ref: "John 11:35", section: "God Weeps With Us", sourceImage: "../what-is-truth/images/day3/n23-jesus-weeps.png", sourceSlide: 64 },
  { ref: "Zechariah 9:9", section: "The King Comes Lowly", sourceImage: "../what-is-truth/images/day3-v2/d3-i-triumphal.png", note: "Christ entered Jerusalem in the exact manner prophecy named. The nation saw the sign but misunderstood the kingdom." },
  { ref: "2 Corinthians 5:21", section: "The Great Exchange", sourceImage: "../what-is-truth/images/day3-v2/d3-nature-taken.png", note: "Christ took our sin without becoming a sinner. He gives us His righteousness without hiding what sin costs." },
  { ref: "Matthew 26:38-39", section: "Gethsemane", sourceImage: "../what-is-truth/images/day3-v2/d3-g-gethsemane.png", note: "Before the courtroom and before the nails, there is a garden. Christ sees the full cup. He can still leave. He submits His will and chooses us." },
  { ref: "2 Corinthians 5:19", section: "God at the Cross", sourceImage: "../what-is-truth/images/day3/n25-calvary.png", sourceSlide: 69 },
  { ref: "Psalm 85:10", section: "Mercy and Justice Meet", sourceImage: "../what-is-truth/images/day3/n27-mercy-justice-meet.png", note: "The cross answers the accuser's sharpest charge. God remains just while He extends mercy to the guilty." },
  { ref: "Colossians 2:15", section: "The Accuser Exposed", sourceImage: "../what-is-truth/images/day3/n26-accuser-exposed.png", sourceSlide: 70 },
  { ref: "John 12:31", section: "The Accuser Cast Out", sourceImage: "../reading-102/images/s21-john-12-31.png", note: "The cross judged the rebel's government. His mask fell before the universe." },
  { ref: "Hebrews 2:14", section: "The Power of Death Broken", sourceImage: "../reading-102/images/s22-heb-2-14.png", note: "Christ entered death and broke the devil's claim from inside it. The destroyer will himself be destroyed." },
  { ref: "Revelation 12:10", section: "The Accuser Cast Down", sourceImage: "../reading-102/images/s22b-rev-12-10.png", note: "At the cross, the accuser lost his standing in heaven. The verdict exposed him. The Advocate entered the court." },
  { ref: "Luke 10:18", section: "The Accuser Cast Down", sourceImage: "../reading-102/images/s22c-luke-10-18.png", note: "Jesus saw Satan fall as lightning. His defeat was certain before the disciples saw its final result." },
  { ref: "Revelation 12:9", section: "The Dragon Identified", sourceImage: "../reading-102/images/s22d-rev-12-9.png", note: "The dragon, serpent, Devil, and Satan are one enemy. Eden and Revelation name the same deceiver." },
  { ref: "Revelation 1:18", section: "The Grave Defeated", sourceImage: "../what-is-truth/images/day3-v2/d3-j-resurrection.png", sourceSlide: 76 },
  { ref: "Acts 1:9-11", section: "The Promise of Return", sourceImage: "../what-is-truth/images/day3-v2/d3-j-ascension.png", sourceSlide: 77 },
  { ref: "Acts 2:2-4", section: "The Witness Goes to the Nations", sourceImage: "../what-is-truth/images/day3-v2/d3-j-pentecost.png", note: "The Spirit gave the church languages for witness. The gospel moved out toward every nation that Babel had scattered." },
  { ref: "Hebrews 7:25", section: "The Present Mediator", sourceImage: "../what-is-truth/images/day3-v2/d3-g-mediator.png", note: "The risen Christ did not retire from the story. He entered the true sanctuary. He lives now to intercede for us. The Advocate is present and active." },
  { ref: "Revelation 12:6", section: "The Woman in the Wilderness", sourceImage: "../what-is-truth/images/day3-v2/d3-i-wilderness.png", note: "The dragon turned from Christ to the church. God preserved the woman through the wilderness years." },
  { ref: "Revelation 11:3", section: "The Word in Sackcloth", sourceImage: "../what-is-truth/images/day3-v2/d3-w-buried.png", note: "The witnesses still spoke, but under restraint and mourning. The enemy tried to hide the word from ordinary people." },
  { ref: "Psalm 119:130", section: "The Word Returns to the People", sourceImage: "../what-is-truth/images/day3-v2/d3-w-dusty.png", note: "Translation and the open Bible brought light back into common homes. The buried witness rose again." },
  { ref: "Revelation 12:11", section: "The Witness Continues", sourceImage: "../what-is-truth/images/day3-v2/d3-w-martyrs.png", sourceSlide: 82 },
  { ref: "Revelation 12:12", section: "Cast Down With Great Wrath", sourceImage: "../reading-102/images/s22d-rev-12-9.png", note: "The enemy knows his time is short. His great wrath is the rage of a defeated power that reads its own sentence." },
  { ref: "Revelation 12:17", section: "The Dragon Is Wroth With the Woman", sourceImage: "../reading-102/images/s23-rev-12-17.png", note: "The final battlefield has two marks. The remnant keeps God's commandments and holds the testimony of Jesus." },
  { ref: "Daniel 12:4", section: "The Second Golden Age", sourceImage: "../what-is-truth/images/day3-v2/d3-l-golden-age-2.png", note: "Knowledge and movement increase near the time of the end. Power and information do not remove the old spiritual conflict." },
  { ref: "Luke 21:34", section: "Distraction Without End", sourceImage: "../what-is-truth/images/day3-v2/d3-l-distraction.png", note: "The final danger is not only persecution. Care, excess, and constant distraction can make the day arrive as a trap." },
  { ref: "Mark 7:7-9", section: "The First Lie Returns", sourceImage: "images/endtime-law-change.png", note: "Eden's first question returns through religious tradition. Human authority sets aside a plain command while it still claims to worship God." },
  { ref: "Daniel 7:25", section: "Times and Laws Changed", sourceImage: "images/endtime-law-change.png", note: "Prophecy identifies a power that attempts to change God's times and law. The attempt does not change the law in heaven." },
  { ref: "Exodus 20:8-11", section: "What God Said", sourceImage: "../what-is-truth/images/day3-v2/d3-c-sabbath.png", note: "The answer to 'Hath God said?' is the command itself. God named the seventh day and tied it to His work as Creator." },
  { ref: "Ecclesiastes 9:5-6", section: "The Second Lie Returns", sourceImage: "../what-is-truth/images/day3-v2/d3-e-die-dragon.png", note: "The Bible answers Eden's second lie. The dead do not return with new counsel. A spirit that wears a dead person's face is not that person." },
  { ref: "Isaiah 8:19-20", section: "Do Not Seek the Dead", sourceImage: "../reading-102/images/s27-isa-8-20.png", note: "God forbids the living to seek messages from the dead. Every voice must meet the law and the testimony." },
  { ref: "Revelation 16:13-14", section: "Spiritism in the Last Conflict", sourceImage: "../reading-102/images/s26b-rev-16-13-14.png", note: "The old lie becomes a world power. Spirits of devils use miracles to gather rulers and nations." },
  { ref: "Matthew 24:24", section: "False Signs", sourceImage: "../reading-102/images/s26-matt-24-24.png", note: "Christ warns that signs alone cannot prove a message. The deception will be strong enough to press even the elect." },
  { ref: "2 Thessalonians 2:9-10", section: "Lying Wonders", sourceImage: "../reading-102/images/s26c-2thess-2-9-10.png", note: "The danger starts when people do not love truth. A wonder then replaces the word as the test of truth." },
  { ref: "Revelation 13:13-14", section: "The Two Lies Unite", sourceImage: "images/endtime-forced-worship.png", note: "Miracles and public power now work together. The second lie supplies the wonders. The first lie directs worship away from God's command." },
  { ref: "Revelation 13:15-17", section: "Worship Enforced", sourceImage: "images/endtime-forced-worship.png", note: "The conflict moves from persuasion to force. Worship, law, and economic pressure join in one test of allegiance." },
  { ref: "1 Thessalonians 5:3", section: "The Counterfeit Peace", sourceImage: "../what-is-truth/images/day3-v2/d3-l-peace.png", note: "The final unity will sound safe and beautiful. Scripture warns that the cry of peace can cover the last danger." },
  { ref: "Revelation 14:9-10", section: "The Final Warning", sourceImage: "images/endtime-final-warning.png", note: "God sends an open warning before the test closes. No person must receive the mark without first hearing the result." },
  { ref: "Revelation 14:11-12", section: "The Final Contrast", sourceImage: "images/endtime-final-warning.png", note: "The final contrast is clear. The beast demands worship. The saints keep the commandments of God and the faith of Jesus." },
  { ref: "2 Corinthians 11:14", section: "The Last Deception", sourceImage: "../reading-102/images/s25-2cor-11-14.png", sourceSlide: 92 },
  { ref: "Isaiah 8:20", section: "The Bible Test", sourceImage: "../reading-102/images/s27-isa-8-20.png", note: "The defense is simple and complete. Test every doctrine, spirit, sign, and claimed christ by the written word." },
  { ref: "1 Peter 5:8-9", section: "Stand in the Faith", sourceImage: "../reading-102/images/s29-1pet-5-8-9.png", note: "God does not call His people to panic. He calls them to sober attention and steady resistance in the faith." },
  { ref: "Revelation 18:4", section: "Come Out of Babylon", sourceImage: "../what-is-truth/images/day3-v2/d3-l-light.png", note: "The last call is an act of mercy. God calls His people out before Babylon receives its plagues." },
  { ref: "John 14:6", section: "The One Way Home", sourceImage: "../what-is-truth/images/day3-v2/d3-l-one-way.png", note: "The answer to a universal counterfeit is not another system. Christ Himself is the way, the truth, and the life." },
  { ref: "Matthew 24:27", section: "The True Coming", sourceImage: "images/endtime-true-coming-fire-hail.png", sourceSlide: 96 },
  { ref: "Revelation 18:2", section: "Babylon Falls", sourceImage: "../what-is-truth/images/day3/e02-babylon-falls.png", note: "The world system that looked permanent falls. Its wealth, force, and religious claims cannot stand before Christ." },
  { ref: "1 Thessalonians 4:16-17", section: "The Resurrection Reunion", sourceImage: "../what-is-truth/images/day3-v2/d3-g-first-resurrection.png", note: "The final answer to the graveside is not an explanation. It is a voice. The dead in Christ rise. The living and the restored meet the Lord together." },
  { ref: "Revelation 20:1-3", section: "Bound in the Pit", sourceImage: "../reading-102/images/s30-rev-20-1-3.png", note: "The deceiver loses every nation and every subject. The ruined earth becomes his prison during the thousand years." },
  { ref: "Revelation 20:12", section: "The Open Judgment", sourceImage: "../what-is-truth/images/day3/e03-white-throne.png", sourceSlide: 99 },
  { ref: "Leviticus 16:21-22", section: "The Final Responsibility", sourceImage: "../reading-102/images/s31-lev-16-21-22.png", note: "The Day of Atonement pattern places final responsibility on the one who caused the rebellion. The scapegoat bears the confessed sins away from the camp." },
  { ref: "Revelation 20:7-8", section: "The Last Campaign", sourceImage: "../reading-102/images/s32-rev-20-7-8.png", note: "Even after a thousand years, Satan's character does not change. He deceives again and gathers the lost for one last attack." },
  { ref: "Philippians 2:10-11", section: "Every Knee Agrees", sourceImage: "../what-is-truth/images/day3-v2/d3-z-every-knee.png", note: "The evidence closes every mouth. Every knee bows and every tongue acknowledges the rightful lordship of Christ." },
  { ref: "Revelation 20:9", section: "The Last Campaign Ends", sourceImage: "../what-is-truth/images/day3/e04-world-fire.png", note: "The attack reaches the city and ends. Fire from God closes the rebellion." },
  { ref: "2 Peter 3:10", section: "The End of the Old World", sourceImage: "../what-is-truth/images/day3/e04-world-fire.png", sourceSlide: 98 },
  { ref: "Ezekiel 28:18-19", section: "An Utter End", sourceImage: "../reading-102/images/s33-eze-28-18-19.png", note: "The covering cherub becomes ashes. The being who began the conflict will never exist again." },
  { ref: "Malachi 4:1, 3", lookupRefs: ["Malachi 4:1", "Malachi 4:3"], section: "Ashes Underfoot", sourceImage: "../reading-102/images/s34-mal-4-1-3.png", note: "The fire leaves neither root nor branch. Sin and its author reach a complete end." },
  { ref: "Revelation 21:1", section: "A New Earth", sourceImage: "../what-is-truth/images/day3-v2/d3-sin-no-more.png", note: "The fire is not the last picture. John sees a new heaven and a new earth after the old order passes away." },
  { ref: "Revelation 21:4", section: "The World Restored", sourceImage: "../what-is-truth/images/day3/n30-new-earth.png", sourceSlide: 101 },
  { ref: "Nahum 1:9", section: "Never Again", sourceImage: "../what-is-truth/images/day3-v2/d3-z-never-again-v2.png", sourceSlide: 102 },
  { ref: "Revelation 5:13", section: "A Clean Universe", sourceImage: "../reading-102/images/s36-rev-5-13.png", note: "Every part of creation agrees with the verdict. Worship fills a universe that is free from doubt and force." },
  { ref: "Romans 16:20", section: "The Promise to the Church", sourceImage: "../reading-102/images/s37-rom-16-20.png", note: "The victory of Christ becomes the victory of His people. God will bruise Satan under their feet." },
  { ref: "James 4:7-8", section: "Submit and Resist", sourceImage: "../reading-102/images/s38-james-4-7-8.png", note: "The order matters. Submit to God first. Then resist the devil and draw near to God." },
  { ref: "Revelation 3:20", section: "Love Still Does Not Force", sourceImage: "../what-is-truth/images/day3/10-door-light.png", sourceSlide: 103 },
  { ref: "Psalm 34:8", section: "The Invitation", sourceImage: "../what-is-truth/images/day3/n33-invitation.png", sourceSlide: 105 },
]

const clean = (text: string) => text.replace(/[\[\]¶‹›]/g, "").replace(/\s+/g, " ").trim()
const slug = (ref: string) => ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const slides = []
for (const [index, beat] of beats.entries()) {
  const verseTexts = []
  for (const lookupRef of beat.lookupRefs ?? [beat.lookupRef ?? beat.ref]) {
    const result = Bun.spawnSync(["bible", "verse", lookupRef, "--json"], { stderr: "inherit" })
    if (result.exitCode !== 0) throw new Error(`Verse lookup failed: ${lookupRef}`)
    const payload = JSON.parse(result.stdout.toString()) as { verses: ReadonlyArray<{ text: string }> }
    if (payload.verses.length === 0) throw new Error(`No verses returned: ${lookupRef}`)
    verseTexts.push(...payload.verses.map((verse) => verse.text))
  }
  const sourceNote = beat.sourceSlide === undefined ? undefined : beatmap.find((item) => item.slide === beat.sourceSlide)?.note
  const number = String(index + 1).padStart(2, "0")
  slides.push({
    id: `s${number}-${slug(beat.ref)}`,
    ref: beat.ref,
    section: beat.section,
    text: clean(verseTexts.join(" ")),
    sourceImage: beat.sourceImage,
    side: index % 2 === 0 ? "right" : "left",
    note: beat.note ?? sourceNote ?? "",
  })
}

await mkdir(resolve(root, "images"), { recursive: true })
await Bun.write(
  resolve(root, "manifest.json"),
  `${JSON.stringify({
    title: "Why Suffering?",
    subtitle: "The Great Controversy — A Scripture Narrative",
    titleConcept: "a wounded earth beneath an open heaven, the darkness of suffering breaking toward a restored world in white-gold light",
    canvas: { w: 1920, h: 1080 },
    layouts: {
      A_imageRight: { text: [131, 408, 805, 264], image: [1037, 75, 750, 903] },
      B_imageLeft: { image: [133, 75, 750, 903], text: [984, 408, 805, 264] },
    },
    slides,
  }, null, 2)}\n`,
)

console.log(`Wrote ${slides.length} Scripture beats to ${basename(resolve(root, "manifest.json"))}`)
