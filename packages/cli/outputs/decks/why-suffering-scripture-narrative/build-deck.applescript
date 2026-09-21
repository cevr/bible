set rootPath to "/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/why-suffering-scripture-narrative"
set savePath to rootPath & "/Why Suffering - Scripture Narrative.key"
tell application "Keynote Creator Studio"
  activate
  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
  tell theDoc
    set base slide of slide 1 to master slide "Blank"
    tell slide 1
      make new image with properties {file:(POSIX file (rootPath & "/images/title-full.png")), position:{0, 0}, width:1920, height:1080}
      set titleItem to make new text item with properties {object text:"Why Suffering?", position:{140, 820}, width:1640, height:100}
      set the font of the object text of titleItem to "Helvetica Neue Light"
      set the size of the object text of titleItem to 66
      set the color of the object text of titleItem to {65535, 65535, 65535}
      set subItem to make new text item with properties {object text:"The Great Controversy — A Scripture Narrative", position:{145, 925}, width:1500, height:60}
      set the font of the object text of subItem to "Helvetica Neue"
      set the size of the object text of subItem to 30
      set the color of the object text of subItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-habakkuk-1-2-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Name the ache honestly — most people aren't skeptics because of arguments, but because of pain. Honor it. The whole night answers this, not with a formula, but with a Person."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-habakkuk-1-2-3-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"O LORD, how long shall I cry, and thou wilt not hear! even cry out unto thee of violence, and thou wilt not save! Why dost thou shew me iniquity, and cause me to behold grievance? for spoiling and violence are before me: and there are that raise up strife and contention.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Habakkuk 1:2-3", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-1-john-4-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "1 John 4:8 — not 'God loves,' God IS love. His very essence. Everything tonight must stay true to this. Let the audience feel it, not just hear it."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-1-john-4-8-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"He that loveth not knoweth not God; for God is love.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 John 4:8", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-job-38-4-7-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The answer begins before humanity. An intelligent created order watched and rejoiced when God laid the foundations of earth."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-job-38-4-7-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Where wast thou when I laid the foundations of the earth? declare, if thou hast understanding. Who hath laid the measures thereof, if thou knowest? or who hath stretched the line upon it? Whereupon are the foundations thereof fastened? or who laid the corner stone thereof; When the morning stars sang together, and all the sons of God shouted for joy?", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Job 38:4-7", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-colossians-1-16-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ created every rank and order of heavenly being. Sin was not the first state of the universe."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-colossians-1-16-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For by him were all things created, that are in heaven, and that are in earth, visible and invisible, whether they be thrones, or dominions, or principalities, or powers: all things were created by him, and for him:", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Colossians 1:16", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-2-peter-2-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The Bible starts the problem of evil before Eden. Angels sinned before humans did. The suffering of earth belongs to a larger conflict."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-2-peter-2-4-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For if God spared not the angels that sinned, but cast them down to hell, and delivered them into chains of darkness, to be reserved unto judgment;", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Peter 2:4", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-ezekiel-28-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Lucifer was not created as a devil. God placed him near the throne as an anointed covering cherub."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-ezekiel-28-14-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Thou art the anointed cherub that covereth; and I have set thee so: thou wast upon the holy mountain of God; thou hast walked up and down in the midst of the stones of fire.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ezekiel 28:14", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-ezekiel-28-13-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "His beauty and gifts came from God. Evil did not begin with a defect in his creation."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-ezekiel-28-13-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Thou hast been in Eden the garden of God; every precious stone was thy covering, the sardius, topaz, and the diamond, the beryl, the onyx, and the jasper, the sapphire, the emerald, and the carbuncle, and gold: the workmanship of thy tabrets and of thy pipes was prepared in thee in the day that thou wast created.", position:{131, 358}, width:805, height:294}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ezekiel 28:13", position:{131, 674}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-ezekiel-28-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The most beautiful and exalted of all created beings — Lucifer, the anointed covering cherub (Ezekiel 28:12-15). Perfect in his ways… until iniquity was found in him. Hold on the tragedy of that 'until.' IF ASKED (fact-check honesty): on the surface Ezekiel 28 addresses the king of Tyre, and Isaiah 14 the king of Babylon — own that first. Then note the language that overshoots any human king: 'perfect from the day thou wast CREATED,' 'the anointed CHERUB that covereth,' 'thou wast upon the holy mountain of God.' Readers ancient and modern have seen a second figure behind those thrones — the power the kings mirrored. Same move as Tyre and Babylon on Night 2: name the surface referent, then show why the text points beyond it."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-ezekiel-28-15-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Thou wast perfect in thy ways from the day that thou wast created, till iniquity was found in thee.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ezekiel 28:15", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-ezekiel-28-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Lucifer turned his eyes from the Giver to his own beauty. Pride corrupted the wisdom that God had given him."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-ezekiel-28-17-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Thine heart was lifted up because of thy beauty, thou hast corrupted thy wisdom by reason of thy brightness: I will cast thee to the ground, I will lay thee before kings, that they may behold thee.", position:{131, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ezekiel 28:17", position:{131, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-romans-13-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Look at the posture — wings spread over the seat of God’s presence: that is the covering position, the same stance as the two cherubim over the ark of the law. The payoff of the chain: Lucifer was 'the anointed cherub that covereth' (Ezekiel 28:14) — a covering cherub, like the two over the ark. What he stood over — what he guarded — was the law at the heart of God's government. And that law is simply love (Romans 13:10; Matthew 22:37-40). Land it: the being who declared 'the law must be wrong' had spent ages guarding that very law. He of all creatures KNEW it was love — and attacked it anyway."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-romans-13-10-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Love worketh no ill to his neighbour: therefore love is the fulfilling of the law.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Romans 13:10", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-isaiah-14-12-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Lucifer fell from heaven. The one called the son of the morning became the enemy of God and man."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-isaiah-14-12-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"How art thou fallen from heaven, O Lucifer, son of the morning! how art thou cut down to the ground, which didst weaken the nations!", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Isaiah 14:12", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-isaiah-14-13-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Not a sudden event — a slow self-exaltation (Isaiah 14:13-14, the five 'I wills'). He began to admire his own brightness more than the throne. The saddest turning in all of history."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-isaiah-14-13-14-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For thou hast said in thine heart, I will ascend into heaven, I will exalt my throne above the stars of God: I will sit also upon the mount of the congregation, in the sides of the north: I will ascend above the heights of the clouds; I will be like the most High.", position:{984, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Isaiah 14:13-14", position:{984, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-psalm-2-6-7-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The Father declared the Son before the heavenly host. The conflict concerns the place, authority, and character of Christ."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-psalm-2-6-7-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Yet have I set my king upon my holy hill of Zion. I will declare the decree: the LORD hath said unto me, Thou art my Son; this day have I begotten thee.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Psalm 2:6-7", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-hebrews-1-5-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The angels receive a command to worship the Son. Christ is not one angel among others."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-hebrews-1-5-6-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For unto which of the angels said he at any time, Thou art my Son, this day have I begotten thee? And again, I will be to him a Father, and he shall be to me a Son? And again, when he bringeth in the firstbegotten into the world, he saith, And let all the angels of God worship him.", position:{984, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Hebrews 1:5-6", position:{984, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-revelation-12-7-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The dispute became open war. The dragon and his angels could not keep their place in heaven."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-revelation-12-7-8-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And there was war in heaven: Michael and his angels fought against the dragon; and the dragon fought and his angels, And prevailed not; neither was their place found any more in heaven.", position:{131, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:7-8", position:{131, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-revelation-12-7-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The question became a war. Michael and his angels fought against the dragon. Notice what the rebels lost: not their power, not their intelligence — their place. Neither was their place found any more in heaven. They were cast down — to us."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-revelation-12-7-9-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And there was war in heaven: Michael and his angels fought against the dragon; and the dragon fought and his angels, And prevailed not; neither was their place found any more in heaven. And the great dragon was cast out, that old serpent, called the Devil, and Satan, which deceiveth the whole world: he was cast out into the earth, and his angels were cast out with him.", position:{984, 316}, width:805, height:378}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:7-9", position:{984, 716}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-jude-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God restrained the rebels for judgment. He did not remove the need for an open verdict."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-jude-6-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the angels which kept not their first estate, but left their own habitation, he hath reserved in everlasting chains under darkness unto the judgment of the great day.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Jude 6", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-matthew-25-41-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The final fire was prepared for the devil and his angels. It was never God's first purpose for the human family."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-matthew-25-41-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Then shall he say also unto them on the left hand, Depart from me, ye cursed, into everlasting fire, prepared for the devil and his angels:", position:{984, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 25:41", position:{984, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-deuteronomy-19-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "So the conflict becomes — formally — a trial over God's character, heard before the whole universe. And a fair trial needs witnesses outside the original dispute (Deuteronomy 19:15) — the angels had already taken sides."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-deuteronomy-19-15-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"One witness shall not rise up against a man for any iniquity, or for any sin, in any sin that he sinneth: at the mouth of two witnesses, or at the mouth of three witnesses, shall the matter be established.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Deuteronomy 19:15", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-1-corinthians-4-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Same courtroom — nothing has changed but one thing: look who is standing in it now. Not an angel. You. THE REVEAL — you were created because you were needed: an honest, third-party witness, made after the conflict, given the facts. Not to flatter God — to SEE Him truly. 'For His glory' = to vindicate His character. Let it land."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-1-corinthians-4-9-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For I think that God hath set forth us the apostles last, as it were appointed to death: for we are made a spectacle unto the world, and to angels, and to men.", position:{984, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 4:9", position:{984, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-genesis-1-26-27-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Human beings entered the conflict as free creatures made in God's image. The earth became a public display of the two governments."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-genesis-1-26-27-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And God said, Let us make man in our image, after our likeness: and let them have dominion over the fish of the sea, and over the fowl of the air, and over the cattle, and over all the earth, and over every creeping thing that creepeth upon the earth. So God created man in his own image, in the image of God created he him; male and female created he them.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 1:26-27", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-ephesians-3-9-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God makes His wisdom known to the powers in heavenly places through His work in the church."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-ephesians-3-9-10-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And to make all men see what is the fellowship of the mystery, which from the beginning of the world hath been hid in God, who created all things by Jesus Christ: To the intent that now unto the principalities and powers in heavenly places might be known by the church the manifold wisdom of God,", position:{984, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ephesians 3:9-10", position:{984, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s23-genesis-1-31-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "So watch God build the witness stand. Six days — and the Book gives them in order: light; the firmament; land and green things; sun, moon and stars set to rule; the waters and the skies filled; then the living creatures of the earth — and last of all, man. ‘And God saw every thing that he had made, and, behold, it was very good’ (Genesis 1:31). Mark what is NOT in it: no death anywhere, no suffering woven into the design. That matters for this whole night — suffering is an intruder in this story, not a building material. Six days, and six times the verdict: good."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s23-genesis-1-31-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And God saw every thing that he had made, and, behold, it was very good. And the evening and the morning were the sixth day.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 1:31", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s24-genesis-2-7-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Day six — and watch the wording. Scripture does not say God gave Adam a soul. It says God formed dust, breathed into it the breath of life — and man BECAME a living soul. A soul is not something you have; it is something you are. Body plus breath equals a living soul. Hold on to that — because the serpent is about to make a promise that only works if you forget it."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s24-genesis-2-7-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the LORD God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul.", position:{984, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 2:7", position:{984, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s25-genesis-2-2-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The seventh day was blessed before sin, before Israel, and before any nation. It belongs to the finished creation."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s25-genesis-2-2-3-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And on the seventh day God ended his work which he had made; and he rested on the seventh day from all his work which he had made. And God blessed the seventh day, and sanctified it: because that in it he had rested from all his work which God created and made.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 2:2-3", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s26-genesis-2-16-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The tree was not a trap — it was the one place the accuser was permitted to make his case to the new witnesses (Genesis 2:16-17). Total abundance, one boundary, stakes disclosed, nothing forced. A fair trial hears both sides."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s26-genesis-2-16-17-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the LORD God commanded the man, saying, Of every tree of the garden thou mayest freely eat: But of the tree of the knowledge of good and evil, thou shalt not eat of it: for in the day that thou eatest thereof thou shalt surely die.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 2:16-17", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s27-joshua-24-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God invites allegiance. He does not compel it. A real choice gives love its meaning."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s27-joshua-24-15-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And if it seem evil unto you to serve the LORD, choose you this day whom ye will serve; whether the gods which your fathers served that were on the other side of the flood, or the gods of the Amorites, in whose land ye dwell: but as for me and my house, we will serve the LORD.", position:{131, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Joshua 24:15", position:{131, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s28-genesis-3-1-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The first weapon ever drawn against the human race was a question mark. Yea, hath God said? Not an argument — a doubt. Get her to question the Word of God, and everything else follows."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s28-genesis-3-1-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Now the serpent was more subtil than any beast of the field which the LORD God had made. And he said unto the woman, Yea, hath God said, Ye shall not eat of every tree of the garden?", position:{984, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 3:1", position:{984, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s29-genesis-3-4-5-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Then the second lie, built on the first: ye shall not surely die. The first sermon on the immortal soul — preached by a serpent. For that promise to work, Eve had to forget Genesis 2:7 — she did not HAVE a soul that could float free of death; she WAS one. And souls that sin, die."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s29-genesis-3-4-5-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the serpent said unto the woman, Ye shall not surely die: For God doth know that in the day ye eat thereof, then your eyes shall be opened, and ye shall be as gods, knowing good and evil.", position:{131, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 3:4-5", position:{131, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s30-genesis-3-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "And she did not fall alone — she went looking for Adam. 'She took of the fruit thereof, and did eat, and gave also unto her husband with her; and he did eat' (Genesis 3:6). But Paul adds the detail that changes the whole scene: 'Adam was not deceived' (1 Timothy 2:14). He was not fooled for a moment. He stood there with heaven's command in one ear and the woman he loved in front of him — and he could not face Eden without her. So with open eyes he chose to fall with her rather than live without her. Hold that picture — a man walking into death for love of his bride — because the rest of this story is God answering it with the true version."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s30-genesis-3-6-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And when the woman saw that the tree was good for food, and that it was pleasant to the eyes, and a tree to be desired to make one wise, she took of the fruit thereof, and did eat, and gave also unto her husband with her; and he did eat.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 3:6", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s31-genesis-3-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The sentence on the serpent also carried the first gospel promise. The Seed of the woman would crush the serpent's head."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s31-genesis-3-15-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I will put enmity between thee and the woman, and between thy seed and her seed; it shall bruise thy head, and thou shalt bruise his heel.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 3:15", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s32-2-corinthians-10-4-5-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The conflict now enters the mind. God's weapons pull down lies and bring thought back under Christ."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s32-2-corinthians-10-4-5-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"(For the weapons of our warfare are not carnal, but mighty through God to the pulling down of strong holds;) Casting down imaginations, and every high thing that exalteth itself against the knowledge of God, and bringing into captivity every thought to the obedience of Christ;", position:{984, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 10:4-5", position:{984, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s33-john-8-44-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Jesus identifies the enemy by his works. Murder and falsehood grow from the same rejected truth."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s33-john-8-44-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Ye are of your father the devil, and the lusts of your father ye will do. He was a murderer from the beginning, and abode not in the truth, because there is no truth in him. When he speaketh a lie, he speaketh of his own: for he is a liar, and the father of it.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 8:44", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s34-2-corinthians-4-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "And mark what that conquest meant in heaven's court. Dominion over this world had been ADAM's — 'let them have dominion… over all the earth' (Genesis 1:26). When Adam surrendered to the serpent, the usurper seized his title. 'That is delivered unto me,' Satan boasts later, offering the kingdoms of the world, 'and to whomsoever I will I give it' (Luke 4:6) — and he styled himself the prince of this world. And here is the detail almost nobody has seen: the stolen title gave him standing. 'There was a day when the sons of God came to present themselves before the LORD, and Satan came also among them' (Job 1:6). Asked where he came from: 'From going to and fro in the earth' (Job 1:7). Cast out of his place as covering cherub — yet still walking into heaven's councils, not as an angel now but as EARTH'S representative, holding Adam's forfeited crown, accusing the brethren 'day and night.' Let the weight of that land: the trial now had the accuser standing inside the courtroom. Remember this scene — because the day is coming, later tonight, when that door closes on him forever."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s34-2-corinthians-4-4-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"In whom the god of this world hath blinded the minds of them which believe not, lest the light of the glorious gospel of Christ, who is the image of God, should shine unto them.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 4:4", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s35-john-3-16-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "He had not reckoned with the depths of the Father's and the Son's love — a plan already in place to do two things at once: redeem the witnesses, and conclude the case. Conceived in love, at infinite cost."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s35-john-3-16-17-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 3:16-17", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s36-job-1-6-7-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Satan appeared as the claimant of earth. He spoke as one who had walked through his seized domain."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s36-job-1-6-7-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Now there was a day when the sons of God came to present themselves before the LORD, and Satan came also among them. And the LORD said unto Satan, Whence comest thou? Then Satan answered the LORD, and said, From going to and fro in the earth, and from walking up and down in it.", position:{984, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Job 1:6-7", position:{984, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s37-zechariah-3-1-2-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The accuser points to real guilt. The Lord answers with rebuke and redemption."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s37-zechariah-3-1-2-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he shewed me Joshua the high priest standing before the angel of the LORD, and Satan standing at his right hand to resist him. And the LORD said unto Satan, The LORD rebuke thee, O Satan; even the LORD that hath chosen Jerusalem rebuke thee: is not this a brand plucked out of the fire?", position:{131, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Zechariah 3:1-2", position:{131, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s38-romans-8-33-34-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The accusation fails because Christ died, rose, and now intercedes. The same court has an Advocate."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s38-romans-8-33-34-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Who shall lay any thing to the charge of God's elect? It is God that justifieth. Who is he that condemneth? It is Christ that died, yea rather, that is risen again, who is even at the right hand of God, who also maketh intercession for us.", position:{984, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Romans 8:33-34", position:{984, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s39-genesis-4-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Watch how fast the poison runs. This is not a stranger killing a stranger — it is the first brothers, and the trigger is worship. 'Cain talked with Abel his brother: and it came to pass, when they were in the field, that Cain rose up against Abel his brother' (Genesis 4:8). The first human being ever to die dies over an offering — killed by a worshipper whose religion was refused, for the crime of being accepted. Mark the pattern; it runs to the end of the Book: false worship never just disagrees with true worship — sooner or later, it reaches for a stone."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s39-genesis-4-8-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Cain talked with Abel his brother: and it came to pass, when they were in the field, that Cain rose up against Abel his brother, and slew him.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 4:8", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s40-genesis-4-16-17-26-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Cain's line built life away from God's presence. Seth's line called on the name of the Lord. The two seeds became two societies."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s40-genesis-4-16-17-26-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Cain went out from the presence of the LORD, and dwelt in the land of Nod, on the east of Eden. And Cain knew his wife; and she conceived, and bare Enoch: and he builded a city, and called the name of the city, after the name of his son, Enoch. And to Seth, to him also there was born a son; and he called his name Enos: then began men to call upon the name of the LORD.", position:{984, 316}, width:805, height:378}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 4:16-17, 26", position:{984, 716}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s41-genesis-5-24-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Enoch lived with God inside a corrupt golden age. His life proved that the enemy could not make obedience impossible."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s41-genesis-5-24-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Enoch walked with God: and he was not; for God took him.", position:{131, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 5:24", position:{131, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s42-genesis-6-5-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Human power and knowledge grew while the mind turned away from God. The outward brilliance hid inward violence and corruption."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s42-genesis-6-5-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And GOD saw that the wickedness of man was great in the earth, and that every imagination of the thoughts of his heart was only evil continually.", position:{984, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 6:5", position:{984, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s43-2-peter-2-5-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Into that brilliant, corrupt world God sent one last sermon — and gave it a hundred and twenty years to run (Genesis 6:3). Noah, 'a preacher of righteousness' (2 Peter 2:5), preached it with a hammer: every plank of that ark was a warning, every blow rang across the plain — the door is open, come inside. The geniuses of that age came, looked, and laughed: rain had never fallen; there was no sea for a thousand miles. 'By faith Noah, being warned of God of things not seen as yet, moved with fear, prepared an ark to the saving of his house' (Hebrews 11:7). And mark the pattern of mercy: in this Book, judgment never falls without a long, patient, unmistakable warning first. It will not fall any other way at the end, either."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s43-2-peter-2-5-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And spared not the old world, but saved Noah the eighth person, a preacher of righteousness, bringing in the flood upon the world of the ungodly;", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Peter 2:5", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s44-genesis-7-16-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God kept the door open through the long warning. God also closed it when the time of decision ended."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s44-genesis-7-16-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And they that went in, went in male and female of all flesh, as God had commanded him: and the LORD shut him in.", position:{984, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 7:16", position:{984, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s45-matthew-24-37-39-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "And the door shut. 'The flood came, and took them all away' (Matthew 24:39). The world of the geniuses — the towers, the philosophy, the art, all that brilliance — went under the water it laughed at. And Jesus reached for exactly that era to describe ours: 'as the days of Noe were, so shall also the coming of the Son of man be' (Matthew 24:37). An age of astonishing intellect, dazzling achievement, and total spiritual blindness — those days return before He comes. We are not drifting toward the days of Noah. We are living in them."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s45-matthew-24-37-39-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But as the days of Noe were, so shall also the coming of the Son of man be. For as in the days that were before the flood they were eating and drinking, marrying and giving in marriage, until the day that Noe entered into the ark, And knew not until the flood came, and took them all away; so shall also the coming of the Son of man be.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 24:37-39", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s46-genesis-11-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Now come back from that flash-forward to the world just after the flood. One family came through, and God hung His bow in the clouds — never again. Yet within a few generations, on the plain of Shinar, the rebellion regrouped: 'Go to, let us build us a city and a tower, whose top may reach unto heaven; and let us make us a name, lest we be scattered abroad' (Genesis 11:4). Listen to it. A tower against His promise — as if the bow could not be trusted. Unity against His command to fill the earth. A name to replace His name. The old religion of self, going up fired brick by fired brick — and heaven watching it rise."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s46-genesis-11-4-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And they said, Go to, let us build us a city and a tower, whose top may reach unto heaven; and let us make us a name, lest we be scattered abroad upon the face of the whole earth.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 11:4", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s47-genesis-11-7-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God did not break His promise with another flood. He confused the one language that held the rebel project together."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s47-genesis-11-7-9-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Go to, let us go down, and there confound their language, that they may not understand one another's speech. So the LORD scattered them abroad from thence upon the face of all the earth: and they left off to build the city. Therefore is the name of it called Babel; because the LORD did there confound the language of all the earth: and from thence did the LORD scatter them abroad upon the face of all the earth.", position:{131, 295}, width:805, height:420}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 11:7-9", position:{131, 737}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s48-genesis-12-1-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God called Abraham out of the nations. Through his seed, the promised Deliverer would bless every family of earth."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s48-genesis-12-1-3-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Now the LORD had said unto Abram, Get thee out of thy country, and from thy kindred, and from thy father's house, unto a land that I will shew thee: And I will make of thee a great nation, and I will bless thee, and make thy name great; and thou shalt be a blessing: And I will bless them that bless thee, and curse him that curseth thee: and in thee shall all families of the earth be blessed.", position:{984, 316}, width:805, height:378}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 12:1-3", position:{984, 716}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s49-deuteronomy-32-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "So the same rebel angels came back under new names. Egypt, Babylon, Greece, Rome — a thousand gods, one author. Paul removes the mask: the things the Gentiles sacrifice, they sacrifice to devils, and not to God. Every idol demanding blood and fear was another brushstroke painted over the face of God — the same two lies, dressed in local costume."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s49-deuteronomy-32-17-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"They sacrificed unto devils, not to God; to gods whom they knew not, to new gods that came newly up, whom your fathers feared not.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Deuteronomy 32:17", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s50-genesis-22-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "And He did more than quarantine — He had kept a counter-witness alive from the beginning. Generations before Sinai, He drew the line on Moriah: He stopped Abraham's hand and provided the ram Himself. The true God does not take your child — He gives His own Son."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s50-genesis-22-8-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Abraham said, My son, God will provide himself a lamb for a burnt offering: so they went both of them together.", position:{984, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 22:8", position:{984, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s51-exodus-14-13-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "When that family had grown into a nation of slaves, God came down. Ten plagues — each one a public execution of a god of Egypt — then a sea standing up in two walls and a nation walking out between them on dry ground (Exodus 14). And then forty years of school in the wilderness: manna from heaven, water from the rock, the law spoken from Sinai, the sanctuary with its Lamb — every statute a vaccination against the serpent's lies. 'What nation is there so great, who hath God so nigh unto them?' (Deuteronomy 4:7). They, of all peoples on earth, were equipped never to be deceived again."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s51-exodus-14-13-14-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Moses said unto the people, Fear ye not, stand still, and see the salvation of the LORD, which he will shew to you to day: for the Egyptians whom ye have seen to day, ye shall see them again no more for ever. The LORD shall fight for you, and ye shall hold your peace.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Exodus 14:13-14", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s52-deuteronomy-18-10-12-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The prohibition protects the living. Fallen spirits can answer, but the answer does not come from the dead."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s52-deuteronomy-18-10-12-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"There shall not be found among you any one that maketh his son or his daughter to pass through the fire, or that useth divination, or an observer of times, or an enchanter, or a witch, Or a charmer, or a consulter with familiar spirits, or a wizard, or a necromancer. For all that do these things are an abomination unto the LORD: and because of these abominations the LORD thy God doth drive them out from before thee.", position:{984, 295}, width:805, height:420}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Deuteronomy 18:10-12", position:{984, 737}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s53-hebrews-8-5-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "When that family had grown into a nation of slaves, God came down. Ten plagues — each one a public execution of a god of Egypt — then a sea standing up in two walls and a nation walking out between them on dry ground (Exodus 14). And then forty years of school in the wilderness: manna from heaven, water from the rock, the law spoken from Sinai, the sanctuary with its Lamb — every statute a vaccination against the serpent's lies. 'What nation is there so great, who hath God so nigh unto them?' (Deuteronomy 4:7). They, of all peoples on earth, were equipped never to be deceived again."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s53-hebrews-8-5-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Who serve unto the example and shadow of heavenly things, as Moses was admonished of God when he was about to make the tabernacle: for, See, saith he, that thou make all things according to the pattern shewed to thee in the mount.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Hebrews 8:5", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s54-1-kings-18-36-39-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Carmel brings the two systems into public view. God answers a plain prayer and turns the people back to Himself."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s54-1-kings-18-36-39-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And it came to pass at the time of the offering of the evening sacrifice, that Elijah the prophet came near, and said, LORD God of Abraham, Isaac, and of Israel, let it be known this day that thou art God in Israel, and that I am thy servant, and that I have done all these things at thy word. Hear me, O LORD, hear me, that this people may know that thou art the LORD God, and that thou hast turned their heart back again. Then the fire of the LORD fell, and consumed the burnt sacrifice, and the wood, and the stones, and the dust, and licked up the water that was in the trench. And when all the people saw it, they fell on their faces: and they said, The LORD, he is the God; the LORD, he is the God.", position:{984, 201}, width:805, height:608}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 30
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Kings 18:36-39", position:{984, 831}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s55-jeremiah-25-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God sent messenger after messenger. Judgment came after repeated warning, not before it."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s55-jeremiah-25-4-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the LORD hath sent unto you all his servants the prophets, rising early and sending them; but ye have not hearkened, nor inclined your ear to hear.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Jeremiah 25:4", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s56-jeremiah-32-35-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Satan didn't stop at blinding minds — he built religions in God's face. Bronze gods that demanded parents burn their own children. Every such altar preached a slander: this is what deity is like. Hear God's own answer: it never even came into His mind."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s56-jeremiah-32-35-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And they built the high places of Baal, which are in the valley of the son of Hinnom, to cause their sons and their daughters to pass through the fire unto Molech; which I commanded them not, neither came it into my mind, that they should do this abomination, to cause Judah to sin.", position:{984, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Jeremiah 32:35", position:{984, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s57-daniel-9-25-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Because even in Babylon, in the palace of the power that burned His house, He was showing His servant Daniel the timetable of hope: 'Seventy weeks are determined upon thy people… unto the Messiah the Prince' (Daniel 9:24-25) — a prophecy so precise it dated the Messiah's arrival, His ministry, and His death, centuries in advance. Anyone who searched could know the time. And some did: a quiet remnant waited — Simeon watching, Anna praying in the temple courts — and wise men far in the east read heaven's clock and saddled their camels. Mark this: the Advent was never meant to be a surprise. It was published."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s57-daniel-9-25-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Know therefore and understand, that from the going forth of the commandment to restore and to build Jerusalem unto the Messiah the Prince shall be seven weeks, and threescore and two weeks: the street shall be built again, and the wall, even in troublous times.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Daniel 9:25", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s58-john-1-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "And where did that entering begin? A manger. Jesus took upon Himself human nature in all its frailties. He was hungry, tired, tempted — and He carried that nature through suffering and blood to death, that we might be redeemed."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s58-john-1-14-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.", position:{984, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 1:14", position:{984, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s59-john-1-29-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Every altar and every lamb pointed forward to this moment. John sees Jesus and names Him in one sentence. The promised Lamb has arrived."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s59-john-1-29-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"The next day John seeth Jesus coming unto him, and saith, Behold the Lamb of God, which taketh away the sin of the world.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 1:29", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s60-matthew-4-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "And before His public ministry, He walked into a rematch. Eden again — reversed in every detail. The first Adam fell in a garden, full-fed, surrounded by every delight; the last Adam stood in a desert, starving after forty days. And the enemy came with the same three-stranded rope: appetite — 'command that these stones be made bread'; presumption — 'cast thyself down'; and the old original offer — the kingdoms of the world for one act of worship, the same bargain he had been selling to nations for four thousand years. Now watch the Champion's weapon. Not one bolt of Deity. Three times, only this: 'It is written' (Matthew 4:4, 7, 10). The Book the serpent had spent forty centuries burying was the sword that beat him — wielded by a man. Where the first Adam fell, the second stood. And He stood using nothing that is not also in your hands."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s60-matthew-4-4-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But he answered and said, It is written, Man shall not live by bread alone, but by every word that proceedeth out of the mouth of God.", position:{984, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 4:4", position:{984, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s61-hebrews-4-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ met every line of human temptation without sin. Where Adam distrusted the word, Christ stood on the word."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s61-hebrews-4-15-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For we have not an high priest which cannot be touched with the feeling of our infirmities; but was in all points tempted like as we are, yet without sin.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Hebrews 4:15", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s62-john-8-10-11-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The only sinless person in the court refused to condemn the woman. His mercy also called her away from sin."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s62-john-8-10-11-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"When Jesus had lifted up himself, and saw none but the woman, he said unto her, Woman, where are those thine accusers? hath no man condemned thee? She said, No man, Lord. And Jesus said unto her, Neither do I condemn thee: go, and sin no more.", position:{984, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 8:10-11", position:{984, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s63-john-11-35-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "'In all their affliction He was afflicted' (Isaiah 63:9). Heaven was never a spectator. Long before Bethlehem, every tear down here was felt up there — the Son at the edge of glory, weeping over a world He would not abandon. And when He finally came down, the shortest verse in the Book records what He carried: 'Jesus wept' (John 11:35). The God of this Book feels the suffering from the inside. Unique among all the answers. Let it breathe."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s63-john-11-35-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Jesus wept.", position:{131, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:35", position:{131, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s64-zechariah-9-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ entered Jerusalem in the exact manner prophecy named. The nation saw the sign but misunderstood the kingdom."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s64-zechariah-9-9-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Rejoice greatly, O daughter of Zion; shout, O daughter of Jerusalem: behold, thy King cometh unto thee: he is just, and having salvation; lowly, and riding upon an ass, and upon a colt the foal of an ass.", position:{984, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Zechariah 9:9", position:{984, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s65-2-corinthians-5-21-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ took our sin without becoming a sinner. He gives us His righteousness without hiding what sin costs."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s65-2-corinthians-5-21-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For he hath made him to be sin for us, who knew no sin; that we might be made the righteousness of God in him.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:21", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s66-matthew-26-38-39-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Before the courtroom and before the nails, there is a garden. Christ sees the full cup. He can still leave. He submits His will and chooses us."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s66-matthew-26-38-39-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Then saith he unto them, My soul is exceeding sorrowful, even unto death: tarry ye here, and watch with me. And he went a little further, and fell on his face, and prayed, saying, O my Father, if it be possible, let this cup pass from me: nevertheless not as I will, but as thou wilt.", position:{984, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 26:38-39", position:{984, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s67-2-corinthians-5-19-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God did not change the rules to excuse us — He absorbed the penalty Himself (2 Corinthians 5:19). Justice satisfied AND mercy extended. The Lawgiver pays the law's own price. Reverent; let the weight of it land."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s67-2-corinthians-5-19-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"To wit, that God was in Christ, reconciling the world unto himself, not imputing their trespasses unto them; and hath committed unto us the word of reconciliation.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:19", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s68-psalm-85-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The cross answers the accuser's sharpest charge. God remains just while He extends mercy to the guilty."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s68-psalm-85-10-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Mercy and truth are met together; righteousness and peace have kissed each other.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Psalm 85:10", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s69-colossians-2-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "At the cross the powers of darkness were publicly exposed in what they did to the only innocent man who ever lived (Colossians 2:15 — 'made a shew of them openly'). The accuser's own cause condemned him: the government he promised was better ended by killing the Author of life. Whatever sympathy his case still had died at the cross, in full view of the watching universe. (Revelation 12:10-11 names him 'the accuser' cast down by 'the blood of the Lamb' — same scene, same verdict.)"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s69-colossians-2-15-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And having spoiled principalities and powers, he made a shew of them openly, triumphing over them in it.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Colossians 2:15", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s70-john-12-31-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The cross judged the rebel's government. His mask fell before the universe."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s70-john-12-31-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Now is the judgment of this world: now shall the prince of this world be cast out.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 12:31", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s71-hebrews-2-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ entered death and broke the devil's claim from inside it. The destroyer will himself be destroyed."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s71-hebrews-2-14-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Forasmuch then as the children are partakers of flesh and blood, he also himself likewise took part of the same; that through death he might destroy him that had the power of death, that is, the devil;", position:{131, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Hebrews 2:14", position:{131, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s72-revelation-12-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "At the cross, the accuser lost his standing in heaven. The verdict exposed him. The Advocate entered the court."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s72-revelation-12-10-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I heard a loud voice saying in heaven, Now is come salvation, and strength, and the kingdom of our God, and the power of his Christ: for the accuser of our brethren is cast down, which accused them before our God day and night.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:10", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s73-luke-10-18-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Jesus saw Satan fall as lightning. His defeat was certain before the disciples saw its final result."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s73-luke-10-18-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he said unto them, I beheld Satan as lightning fall from heaven.", position:{131, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 10:18", position:{131, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s74-revelation-12-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The dragon, serpent, Devil, and Satan are one enemy. Eden and Revelation name the same deceiver."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s74-revelation-12-9-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the great dragon was cast out, that old serpent, called the Devil, and Satan, which deceiveth the whole world: he was cast out into the earth, and his angels were cast out with him.", position:{984, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:9", position:{984, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s75-revelation-1-18-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "But do not leave Him on the cross — because the grave could not keep Him. Before dawn on the third day the sealed stone was hurled aside, the Roman guard fell as dead men, and He came forth: 'I am he that liveth, and was dead; and, behold, I am alive for evermore… and have the keys of hell and of death' (Revelation 1:18). And heaven underlined the point: 'the graves were opened; and many bodies of the saints which slept arose' (Matthew 27:52-53) — a firstfruits harvest walking out of their tombs behind Him. Remember the serpent's second lie — 'thou shalt not surely die'? Here is the truth that beats it: not that death is unreal, but that death is BEATEN. The empty tomb is God's answer to every graveside since Abel's."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s75-revelation-1-18-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"I am he that liveth, and was dead; and, behold, I am alive for evermore, Amen; and have the keys of hell and of death.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 1:18", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s76-acts-1-9-11-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Forty days later, from the Mount of Olives, He rose in blessing — hands still lifted over them as the cloud received Him. And as the disciples stood staring up, two angels in white stood beside them with the single most load-bearing promise of this whole night: 'Ye men of Galilee, why stand ye gazing up into heaven? this same Jesus, which is taken up from you into heaven, shall so come in like manner as ye have seen him go into heaven' (Acts 1:11). Mark every word of it. This SAME Jesus — not a spirit, not a symbol, not a secret inner experience. Shall so come — bodily, visibly, in the clouds — in like manner as they watched Him go. Every counterfeit advent you are about to meet breaks against that one sentence."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s76-acts-1-9-11-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And when he had spoken these things, while they beheld, he was taken up; and a cloud received him out of their sight. And while they looked stedfastly toward heaven as he went up, behold, two men stood by them in white apparel; Which also said, Ye men of Galilee, why stand ye gazing up into heaven? this same Jesus, which is taken up from you into heaven, shall so come in like manner as ye have seen him go into heaven.", position:{984, 295}, width:805, height:420}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Acts 1:9-11", position:{984, 737}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s77-acts-2-2-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The Spirit gave the church languages for witness. The gospel moved out toward every nation that Babel had scattered."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s77-acts-2-2-4-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And suddenly there came a sound from heaven as of a rushing mighty wind, and it filled all the house where they were sitting. And there appeared unto them cloven tongues like as of fire, and it sat upon each of them. And they were all filled with the Holy Ghost, and began to speak with other tongues, as the Spirit gave them utterance.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Acts 2:2-4", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s78-hebrews-7-25-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The risen Christ did not retire from the story. He entered the true sanctuary. He lives now to intercede for us. The Advocate is present and active."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s78-hebrews-7-25-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Wherefore he is able also to save them to the uttermost that come unto God by him, seeing he ever liveth to make intercession for them.", position:{984, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Hebrews 7:25", position:{984, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s79-revelation-12-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The dragon turned from Christ to the church. God preserved the woman through the wilderness years."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s79-revelation-12-6-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the woman fled into the wilderness, where she hath a place prepared of God, that they should feed her there a thousand two hundred and threescore days.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:6", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s80-revelation-11-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The witnesses still spoke, but under restraint and mourning. The enemy tried to hide the word from ordinary people."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s80-revelation-11-3-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I will give power unto my two witnesses, and they shall prophesy a thousand two hundred and threescore days, clothed in sackcloth.", position:{984, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 11:3", position:{984, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s81-psalm-119-130-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Translation and the open Bible brought light back into common homes. The buried witness rose again."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s81-psalm-119-130-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"The entrance of thy words giveth light; it giveth understanding unto the simple.", position:{131, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Psalm 119:130", position:{131, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s82-revelation-12-11-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "But the Book would not stay buried either. Wycliffe translated it, and they dug up his bones to burn them. Hus preached it, and they burned him alive. Tyndale gave it English lungs and was strangled at a stake, praying with his last breath, 'Lord, open the king of England's eyes' — and within a few years of that prayer the Bible stood open by royal command in every parish church in the land. The presses ran faster than the fires. Understand what you hold: every Bible on your shelf has the fingerprints of burned men on it. 'And they overcame him by the blood of the Lamb, and by the word of their testimony; and they loved not their lives unto the death' (Revelation 12:11)."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s82-revelation-12-11-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And they overcame him by the blood of the Lamb, and by the word of their testimony; and they loved not their lives unto the death.", position:{984, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:11", position:{984, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s83-revelation-12-12-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The enemy knows his time is short. His great wrath is the rage of a defeated power that reads its own sentence."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s83-revelation-12-12-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Therefore rejoice, ye heavens, and ye that dwell in them. Woe to the inhabiters of the earth and of the sea! for the devil is come down unto you, having great wrath, because he knoweth that he hath but a short time.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:12", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s84-revelation-12-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The final battlefield has two marks. The remnant keeps God's commandments and holds the testimony of Jesus."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s84-revelation-12-17-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the dragon was wroth with the woman, and went to make war with the remnant of her seed, which keep the commandments of God, and have the testimony of Jesus Christ.", position:{984, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 12:17", position:{984, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s85-daniel-12-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Knowledge and movement increase near the time of the end. Power and information do not remove the old spiritual conflict."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s85-daniel-12-4-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But thou, O Daniel, shut up the words, and seal the book, even to the time of the end: many shall run to and fro, and knowledge shall be increased.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Daniel 12:4", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s86-luke-21-34-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The final danger is not only persecution. Care, excess, and constant distraction can make the day arrive as a trap."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s86-luke-21-34-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And take heed to yourselves, lest at any time your hearts be overcharged with surfeiting, and drunkenness, and cares of this life, and so that day come upon you unawares.", position:{984, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 21:34", position:{984, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s87-mark-7-7-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Eden's first question returns through religious tradition. Human authority sets aside a plain command while it still claims to worship God."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s87-mark-7-7-9-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Howbeit in vain do they worship me, teaching for doctrines the commandments of men. For laying aside the commandment of God, ye hold the tradition of men, as the washing of pots and cups: and many other such like things ye do. And he said unto them, Full well ye reject the commandment of God, that ye may keep your own tradition.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Mark 7:7-9", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s88-daniel-7-25-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Prophecy identifies a power that attempts to change God's times and law. The attempt does not change the law in heaven."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s88-daniel-7-25-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he shall speak great words against the most High, and shall wear out the saints of the most High, and think to change times and laws: and they shall be given into his hand until a time and times and the dividing of time.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Daniel 7:25", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s89-exodus-20-8-11-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The answer to 'Hath God said?' is the command itself. God named the seventh day and tied it to His work as Creator."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s89-exodus-20-8-11-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Remember the sabbath day, to keep it holy. Six days shalt thou labour, and do all thy work: But the seventh day is the sabbath of the LORD thy God: in it thou shalt not do any work, thou, nor thy son, nor thy daughter, thy manservant, nor thy maidservant, nor thy cattle, nor thy stranger that is within thy gates: For in six days the LORD made heaven and earth, the sea, and all that in them is, and rested the seventh day: wherefore the LORD blessed the sabbath day, and hallowed it.", position:{131, 296}, width:805, height:418}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 30
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Exodus 20:8-11", position:{131, 736}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s90-ecclesiastes-9-5-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The Bible answers Eden's second lie. The dead do not return with new counsel. A spirit that wears a dead person's face is not that person."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s90-ecclesiastes-9-5-6-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the living know that they shall die: but the dead know not any thing, neither have they any more a reward; for the memory of them is forgotten. Also their love, and their hatred, and their envy, is now perished; neither have they any more a portion for ever in any thing that is done under the sun.", position:{984, 358}, width:805, height:294}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ecclesiastes 9:5-6", position:{984, 674}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s91-isaiah-8-19-20-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God forbids the living to seek messages from the dead. Every voice must meet the law and the testimony."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s91-isaiah-8-19-20-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And when they shall say unto you, Seek unto them that have familiar spirits, and unto wizards that peep, and that mutter: should not a people seek unto their God? for the living to the dead? To the law and to the testimony: if they speak not according to this word, it is because there is no light in them.", position:{131, 358}, width:805, height:294}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Isaiah 8:19-20", position:{131, 674}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s92-revelation-16-13-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The old lie becomes a world power. Spirits of devils use miracles to gather rulers and nations."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s92-revelation-16-13-14-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I saw three unclean spirits like frogs come out of the mouth of the dragon, and out of the mouth of the beast, and out of the mouth of the false prophet. For they are the spirits of devils, working miracles, which go forth unto the kings of the earth and of the whole world, to gather them to the battle of that great day of God Almighty.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 16:13-14", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s93-matthew-24-24-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ warns that signs alone cannot prove a message. The deception will be strong enough to press even the elect."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s93-matthew-24-24-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For there shall arise false Christs, and false prophets, and shall shew great signs and wonders; insomuch that, if it were possible, they shall deceive the very elect.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 24:24", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s94-2-thessalonians-2-9-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The danger starts when people do not love truth. A wonder then replaces the word as the test of truth."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s94-2-thessalonians-2-9-10-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Even him, whose coming is after the working of Satan with all power and signs and lying wonders, And with all deceivableness of unrighteousness in them that perish; because they received not the love of the truth, that they might be saved.", position:{984, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Thessalonians 2:9-10", position:{984, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s95-revelation-13-13-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Miracles and public power now work together. The second lie supplies the wonders. The first lie directs worship away from God's command."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s95-revelation-13-13-14-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he doeth great wonders, so that he maketh fire come down from heaven on the earth in the sight of men, And deceiveth them that dwell on the earth by the means of those miracles which he had power to do in the sight of the beast; saying to them that dwell on the earth, that they should make an image to the beast, which had the wound by a sword, and did live.", position:{131, 316}, width:805, height:378}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 13:13-14", position:{131, 716}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s96-revelation-13-15-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The conflict moves from persuasion to force. Worship, law, and economic pressure join in one test of allegiance."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s96-revelation-13-15-17-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he had power to give life unto the image of the beast, that the image of the beast should both speak, and cause that as many as would not worship the image of the beast should be killed. And he causeth all, both small and great, rich and poor, free and bond, to receive a mark in their right hand, or in their foreheads: And that no man might buy or sell, save he that had the mark, or the name of the beast, or the number of his name.", position:{984, 315}, width:805, height:380}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 30
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 13:15-17", position:{984, 717}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s97-1-thessalonians-5-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The final unity will sound safe and beautiful. Scripture warns that the cry of peace can cover the last danger."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s97-1-thessalonians-5-3-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For when they shall say, Peace and safety; then sudden destruction cometh upon them, as travail upon a woman with child; and they shall not escape.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 5:3", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s98-revelation-14-9-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God sends an open warning before the test closes. No person must receive the mark without first hearing the result."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s98-revelation-14-9-10-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the third angel followed them, saying with a loud voice, If any man worship the beast and his image, and receive his mark in his forehead, or in his hand, The same shall drink of the wine of the wrath of God, which is poured out without mixture into the cup of his indignation; and he shall be tormented with fire and brimstone in the presence of the holy angels, and in the presence of the Lamb:", position:{984, 316}, width:805, height:378}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 14:9-10", position:{984, 716}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s99-revelation-14-11-12-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The final contrast is clear. The beast demands worship. The saints keep the commandments of God and the faith of Jesus."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s99-revelation-14-11-12-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the smoke of their torment ascendeth up for ever and ever: and they have no rest day nor night, who worship the beast and his image, and whosoever receiveth the mark of his name. Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus.", position:{131, 289}, width:805, height:432}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 14:11-12", position:{131, 743}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s100-2-corinthians-11-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "And before He comes, the masquerade reaches its peak: Satan himself as an angel of light, with all power and signs and lying wonders. Wonders in place of the Word — and the crowning wonder: the dead appearing to speak and preach. Both Eden lies at once. Because if the dead are alive, the serpent was right. Mark the difference from what you saw a moment ago — the true Christ comes with clouds and every eye sees Him at once (Revelation 1:7); this one descends to a hillside crowd, working wonders instead of speaking the Word."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s100-2-corinthians-11-14-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And no marvel; for Satan himself is transformed into an angel of light.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 11:14", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s101-isaiah-8-20-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The defense is simple and complete. Test every doctrine, spirit, sign, and claimed christ by the written word."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s101-isaiah-8-20-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"To the law and to the testimony: if they speak not according to this word, it is because there is no light in them.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Isaiah 8:20", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s102-1-peter-5-8-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God does not call His people to panic. He calls them to sober attention and steady resistance in the faith."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s102-1-peter-5-8-9-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Be sober, be vigilant; because your adversary the devil, as a roaring lion, walketh about, seeking whom he may devour: Whom resist stedfast in the faith, knowing that the same afflictions are accomplished in your brethren that are in the world.", position:{984, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Peter 5:8-9", position:{984, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s103-revelation-18-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The last call is an act of mercy. God calls His people out before Babylon receives its plagues."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s103-revelation-18-4-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I heard another voice from heaven, saying, Come out of her, my people, that ye be not partakers of her sins, and that ye receive not of her plagues.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 18:4", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s104-john-14-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The answer to a universal counterfeit is not another system. Christ Himself is the way, the truth, and the life."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s104-john-14-6-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 14:6", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s105-matthew-24-27-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Everything so far is settled history — the cross is behind us. But the Book has pages not yet turned. It says this present world is almost over, and One is coming back: 'Behold, he cometh with clouds; and every eye shall see him' (Revelation 1:7). Pivot the room here: from what God HAS done to what He has PROMISED to do. Soon. And the nearer that day comes, the harder the old deceiver works — with the same two lies he drew in Eden."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s105-matthew-24-27-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For as the lightning cometh out of the east, and shineth even unto the west; so shall also the coming of the Son of man be.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 24:27", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s106-revelation-18-2-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The world system that looked permanent falls. Its wealth, force, and religious claims cannot stand before Christ."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s106-revelation-18-2-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he cried mightily with a strong voice, saying, Babylon the great is fallen, is fallen, and is become the habitation of devils, and the hold of every foul spirit, and a cage of every unclean and hateful bird.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 18:2", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s107-1-thessalonians-4-16-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The final answer to the graveside is not an explanation. It is a voice. The dead in Christ rise. The living and the restored meet the Lord together."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s107-1-thessalonians-4-16-17-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the Lord himself shall descend from heaven with a shout, with the voice of the archangel, and with the trump of God: and the dead in Christ shall rise first: Then we which are alive and remain shall be caught up together with them in the clouds, to meet the Lord in the air: and so shall we ever be with the Lord.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:16-17", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s108-revelation-20-1-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The deceiver loses every nation and every subject. The ruined earth becomes his prison during the thousand years."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s108-revelation-20-1-3-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I saw an angel come down from heaven, having the key of the bottomless pit and a great chain in his hand. And he laid hold on the dragon, that old serpent, which is the Devil, and Satan, and bound him a thousand years, And cast him into the bottomless pit, and shut him up, and set a seal upon him, that he should deceive the nations no more, till the thousand years should be fulfilled: and after that he must be loosed a little season.", position:{984, 315}, width:805, height:380}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 30
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:1-3", position:{984, 717}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s109-revelation-20-12-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "A great final reckoning — 'the books were opened… and the dead were judged… according to their works' (Revelation 20:11-12). Frame it inside the trial the night built: this is the SAME open court, the same just Judge whose fairness the universe watched Him prove at infinite cost — not a new threat. IF ASKED 'judged by works — but saved not by works?': no contradiction — the books establish the facts of the case; the book of LIFE holds those who accepted the rescue. Judged by works, saved by grace. Sober, not threatening — this is why the invitation matters."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s109-revelation-20-12-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I saw the dead, small and great, stand before God; and the books were opened: and another book was opened, which is the book of life: and the dead were judged out of those things which were written in the books, according to their works.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:12", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s110-leviticus-16-21-22-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The Day of Atonement pattern places final responsibility on the one who caused the rebellion. The scapegoat bears the confessed sins away from the camp."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s110-leviticus-16-21-22-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Aaron shall lay both his hands upon the head of the live goat, and confess over him all the iniquities of the children of Israel, and all their transgressions in all their sins, putting them upon the head of the goat, and shall send him away by the hand of a fit man into the wilderness: And the goat shall bear upon him all their iniquities unto a land not inhabited: and he shall let go the goat in the wilderness.", position:{984, 295}, width:805, height:420}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Leviticus 16:21-22", position:{984, 737}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s111-revelation-20-7-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Even after a thousand years, Satan's character does not change. He deceives again and gathers the lost for one last attack."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s111-revelation-20-7-8-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And when the thousand years are expired, Satan shall be loosed out of his prison, And shall go out to deceive the nations which are in the four quarters of the earth, Gog and Magog, to gather them together to battle: the number of whom is as the sand of the sea.", position:{131, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:7-8", position:{131, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s112-philippians-2-10-11-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The evidence closes every mouth. Every knee bows and every tongue acknowledges the rightful lordship of Christ."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s112-philippians-2-10-11-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"That at the name of Jesus every knee should bow, of things in heaven, and things in earth, and things under the earth; And that every tongue should confess that Jesus Christ is Lord, to the glory of God the Father.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Philippians 2:10-11", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s113-revelation-20-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The attack reaches the city and ends. Fire from God closes the rebellion."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s113-revelation-20-9-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And they went up on the breadth of the earth, and compassed the camp of the saints about, and the beloved city: and fire came down from God out of heaven, and devoured them.", position:{131, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:9", position:{131, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s114-2-peter-3-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The old earth itself passes away in fire: 'the heavens shall pass away with a great noise, and the elements shall melt… the earth also and the works that are therein shall be burned up' (2 Peter 3:10). Not annihilation for its own sake — a cleansing, the doorway the world passes through. The destruction is real, and it is not the end of the story."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s114-2-peter-3-10-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But the day of the Lord will come as a thief in the night; in the which the heavens shall pass away with a great noise, and the elements shall melt with fervent heat, the earth also and the works that are therein shall be burned up.", position:{984, 337}, width:805, height:336}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Peter 3:10", position:{984, 695}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s115-ezekiel-28-18-19-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The covering cherub becomes ashes. The being who began the conflict will never exist again."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s115-ezekiel-28-18-19-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Thou hast defiled thy sanctuaries by the multitude of thine iniquities, by the iniquity of thy traffick; therefore will I bring forth a fire from the midst of thee, it shall devour thee, and I will bring thee to ashes upon the earth in the sight of all them that behold thee. All they that know thee among the people shall be astonished at thee: thou shalt be a terror, and never shalt thou be any more.", position:{131, 316}, width:805, height:378}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ezekiel 28:18-19", position:{131, 716}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s116-malachi-4-1-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The fire leaves neither root nor branch. Sin and its author reach a complete end."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s116-malachi-4-1-3-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For, behold, the day cometh, that shall burn as an oven; and all the proud, yea, and all that do wickedly, shall be stubble: and the day that cometh shall burn them up, saith the LORD of hosts, that it shall leave them neither root nor branch. And ye shall tread down the wicked; for they shall be ashes under the soles of your feet in the day that I shall do this, saith the LORD of hosts.", position:{984, 316}, width:805, height:378}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Malachi 4:1, 3", position:{984, 716}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s117-revelation-21-1-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The fire is not the last picture. John sees a new heaven and a new earth after the old order passes away."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s117-revelation-21-1-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I saw a new heaven and a new earth: for the first heaven and the first earth were passed away; and there was no more sea.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 21:1", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s118-revelation-21-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Revelation 21:4 — no more death, sorrow, crying, or pain. Not clouds and harps — a restored earth, the home you were made for. The groaning of the world, ended personally. After the fire: 'I saw a new heaven and a new earth' (Revelation 21:1). THIS is what the destruction was making room for."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s118-revelation-21-4-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.", position:{984, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 21:4", position:{984, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s119-nahum-1-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Affliction shall not rise up the second time (Nahum 1:9). Secured not by force, but by a verdict the whole universe witnessed — which is why this peace is permanent. The case is closed forever. (Same Nahum context note as earlier: Nineveh's local promise is the pattern — when God ends a thing, He ends it so completely it cannot rise again.)"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s119-nahum-1-9-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"What do ye imagine against the LORD? he will make an utter end: affliction shall not rise up the second time.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Nahum 1:9", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s120-revelation-5-13-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Every part of creation agrees with the verdict. Worship fills a universe that is free from doubt and force."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s120-revelation-5-13-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And every creature which is in heaven, and on the earth, and under the earth, and such as are in the sea, and all that are in them, heard I saying, Blessing, and honour, and glory, and power, be unto him that sitteth upon the throne, and unto the Lamb for ever and ever.", position:{984, 313}, width:805, height:384}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 5:13", position:{984, 719}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s121-romans-16-20-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The victory of Christ becomes the victory of His people. God will bruise Satan under their feet."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s121-romans-16-20-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the God of peace shall bruise Satan under your feet shortly. The grace of our Lord Jesus Christ be with you. Amen.", position:{131, 393}, width:805, height:224}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Romans 16:20", position:{131, 639}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s122-james-4-7-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The order matters. Submit to God first. Then resist the devil and draw near to God."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s122-james-4-7-8-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Submit yourselves therefore to God. Resist the devil, and he will flee from you. Draw nigh to God, and he will draw nigh to you. Cleanse your hands, ye sinners; and purify your hearts, ye double minded.", position:{984, 361}, width:805, height:288}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"James 4:7-8", position:{984, 671}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s123-revelation-3-20-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Revelation 3:20 — He knocks; He does not break in. The God who refused to win the cosmos by force will not force you either. Consistent to the last page. He knocks — and the door only opens from the inside. This is that door, opened; the hand reaching through is the one that would never push it."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s123-revelation-3-20-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me.", position:{131, 365}, width:805, height:280}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 3:20", position:{131, 667}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s124-psalm-34-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The ask, both lanes: study with me (one hour, any week night), or start alone in the Gospel of John. 'O taste and see that the LORD is good' (Psalm 34:8). You've met His character tonight — the next move is yours. One more pull: everything after the cross tonight — the return, the judgment, the world made new — came from Daniel and Revelation. That is exactly where the studies go next; the story you just heard has chapters still ahead. Close warm; prayer if the room allows."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s124-psalm-34-8-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"O taste and see that the LORD is good: blessed is the man that trusteth in him.", position:{984, 415}, width:805, height:180}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Psalm 34:8", position:{984, 617}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
    end tell
    save theDoc in POSIX file savePath
  end tell
  return "Built " & (count of slides of theDoc) & " slides at " & savePath
end tell
