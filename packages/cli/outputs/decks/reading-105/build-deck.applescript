set rootPath to "/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/reading-105"
set savePath to rootPath & "/Reading 105 - The Two Resurrections.key"
tell application "Keynote Creator Studio"
  activate
  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
  tell theDoc
    set base slide of slide 1 to master slide "Blank"
    tell slide 1
      make new image with properties {file:(POSIX file (rootPath & "/images/title-full.png")), position:{0, 0}, width:1920, height:1080}
      set titleItem to make new text item with properties {object text:"The Two Resurrections", position:{140, 820}, width:1640, height:100}
      set the font of the object text of titleItem to "Helvetica Neue Light"
      set the size of the object text of titleItem to 66
      set the color of the object text of titleItem to {65535, 65535, 65535}
      set subItem to make new text item with properties {object text:"Bible Readings — Chapter 105 — A Scripture Narrative", position:{145, 925}, width:1500, height:60}
      set the font of the object text of subItem to "Helvetica Neue"
      set the size of the object text of subItem to 30
      set the color of the object text of subItem to {65535, 65535, 65535}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-romans-5-12-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Death has a pedigree: sin first, death its wage. One man opened the door and every man walks through it."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-romans-5-12-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Wherefore, as by one man sin entered into the world, and death by sin; and so death passed upon all men, for that all have sinned:", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Romans 5:12", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Death has a pedigree: sin first, death its wage. One man opened the door and every man walks through it."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-1-corinthians-15-22-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Two heads, two 'alls.' Every grave Adam filled, Christ empties. The remedy is as wide as the ruin."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-1-corinthians-15-22-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For as in Adam all die, even so in Christ shall all be made alive.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:22", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Two heads, two 'alls.' Every grave Adam filled, Christ empties. The remedy is as wide as the ruin."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-genesis-2-7-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Dust plus breath equals a living soul. Man does not have a soul; he became one. GC 533.1 — Adam could not transmit what he did not possess."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-genesis-2-7-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the LORD God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 2:7", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Dust plus breath equals a living soul. Man does not have a soul; he became one. GC 533.1 — Adam could not transmit what he did not possess."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-genesis-3-19-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The sentence reverses Gen 2:7. Dust returns to dust. Nothing in the sentence says the man lives on elsewhere."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-genesis-3-19-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"In the sweat of thy face shalt thou eat bread, till thou return unto the ground; for out of it wast thou taken: for dust thou art, and unto dust shalt thou return.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 3:19", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The sentence reverses Gen 2:7. Dust returns to dust. Nothing in the sentence says the man lives on elsewhere."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-ecclesiastes-9-10-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Four 'no's': no work, no device, no knowledge, no wisdom. And the address is plain — the grave, whither thou goest."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-ecclesiastes-9-10-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Whatsoever thy hand findeth to do, do it with thy might; for there is no work, nor device, nor knowledge, nor wisdom, in the grave, whither thou goest.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ecclesiastes 9:10", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Four 'no's': no work, no device, no knowledge, no wisdom. And the address is plain — the grave, whither thou goest."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-ecclesiastes-9-5-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Mind and affections both stopped. Love, hatred, envy — perished. The dead are not watching us."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-ecclesiastes-9-5-6-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the living know that they shall die: but the dead know not any thing, neither have they any more a reward; for the memory of them is forgotten. Also their love, and their hatred, and their envy, is now perished; neither have they any more a portion for ever in any thing that is done under the sun.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ecclesiastes 9:5-6", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Mind and affections both stopped. Love, hatred, envy — perished. The dead are not watching us."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-psalm-146-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "'In that very day his thoughts perish.' There is no interval of consciousness. GC 546.1 — Hezekiah saw no glorious prospect in death."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-psalm-146-4-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"His breath goeth forth, he returneth to his earth; in that very day his thoughts perish.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Psalm 146:4", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "'In that very day his thoughts perish.' There is no interval of consciousness. GC 546.1 — Hezekiah saw no glorious prospect in death."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-acts-2-29-34-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Peter's Pentecost argument. GC 546.2 — David remains in the grave until the resurrection; the righteous do not go to heaven at death."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-acts-2-29-34-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Men and brethren, let me freely speak unto you of the patriarch David, that he is both dead and buried, and his sepulchre is with us unto this day. ... For David is not ascended into the heavens: but he saith himself, The LORD said unto my Lord, Sit thou on my right hand,", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Acts 2:29, 34", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Peter's Pentecost argument. GC 546.2 — David remains in the grave until the resurrection; the righteous do not go to heaven at death."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-john-11-11-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ's own word for death is sleep — and His chosen errand is to awake. DA 527.3 — Christ represents death as a sleep to His believing children."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-john-11-11-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"These things said he: and after that he saith unto them, Our friend Lazarus sleepeth; but I go, that I may awake him out of sleep.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:11", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Christ's own word for death is sleep — and His chosen errand is to awake. DA 527.3 — Christ represents death as a sleep to His believing children."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-john-11-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The figure explained by its Author: sleep equals death. No third state. Lazarus came back with no report of four days in glory."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-john-11-14-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Then said Jesus unto them plainly, Lazarus is dead.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:14", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The figure explained by its Author: sleep equals death. No third state. Lazarus came back with no report of four days in glory."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-job-14-14-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Job waits in the grave for a call. 'Thou shalt call, and I will answer.' GC 549.3 — time, long or short, is but a moment to them."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-job-14-14-15-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"If a man die, shall he live again? all the days of my appointed time will I wait, till my change come. Thou shalt call, and I will answer thee: thou wilt have a desire to the work of thine hands.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Job 14:14-15", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Job waits in the grave for a call. 'Thou shalt call, and I will answer.' GC 549.3 — time, long or short, is but a moment to them."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-john-11-24-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Martha's creed: not 'he is in heaven,' but 'he shall rise again at the last day.' Luther — they shall seem to have slept scarce one minute (GC 549.2)."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-john-11-24-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Martha saith unto him, I know that he shall rise again in the resurrection at the last day.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:24", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Martha's creed: not 'he is in heaven,' but 'he shall rise again at the last day.' Luther — they shall seem to have slept scarce one minute (GC 549.2)."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-hosea-13-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "A promise addressed to the prison itself. God speaks to the grave by name and pledges to destroy it."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-hosea-13-14-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"I will ransom them from the power of the grave; I will redeem them from death: O death, I will be thy plagues; O grave, I will be thy destruction: repentance shall be hid from mine eyes.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Hosea 13:14", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "A promise addressed to the prison itself. God speaks to the grave by name and pledges to destroy it."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-1-corinthians-15-21-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The ransom had to be paid in Adam's own coin: a man. By man came death; by Man came the resurrection."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-1-corinthians-15-21-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For since by man came death, by man came also the resurrection of the dead.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:21", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The ransom had to be paid in Adam's own coin: a man. By man came death; by Man came the resurrection."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-john-3-16-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The alternatives are perish or life — not life in bliss or life in misery. Immortality is only in the Son."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-john-3-16-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 3:16", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The alternatives are perish or life — not life in bliss or life in misery. Immortality is only in the Son."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-job-19-25-27-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "A bodily hope, ages before Paul: 'in my flesh shall I see God... mine eyes shall behold, and not another.'"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-job-19-25-27-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For I know that my redeemer liveth, and that he shall stand at the latter day upon the earth: And though after my skin worms destroy this body, yet in my flesh shall I see God: Whom I shall see for myself, and mine eyes shall behold, and not another; though my reins be consumed within me.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Job 19:25-27", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "A bodily hope, ages before Paul: 'in my flesh shall I see God... mine eyes shall behold, and not another.'"
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-jeremiah-31-16-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Spoken to Rachel's slain children (Matt 2:17-18). The land of the enemy is the grave. Waggoner, AERS 282.4 — death is the enemy from whose land they will be brought."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-jeremiah-31-16-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Thus saith the LORD; Refrain thy voice from weeping, and thine eyes from tears: for thy work shall be rewarded, saith the LORD; and they shall come again from the land of the enemy.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Jeremiah 31:16", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Spoken to Rachel's slain children (Matt 2:17-18). The land of the enemy is the grave. Waggoner, AERS 282.4 — death is the enemy from whose land they will be brought."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-ezekiel-37-12-13-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "This is the Lord's own explanation of the vision: 'I will open your graves.' Waggoner, AERS 283.1 — no one should presume to explain the Lord's explanation."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-ezekiel-37-12-13-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Therefore prophesy and say unto them, Thus saith the Lord GOD; Behold, O my people, I will open your graves, and cause you to come up out of your graves, and bring you into the land of Israel. And ye shall know that I am the LORD, when I have opened your graves, O my people, and brought you up out of your graves,", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ezekiel 37:12-13", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "This is the Lord's own explanation of the vision: 'I will open your graves.' Waggoner, AERS 283.1 — no one should presume to explain the Lord's explanation."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-1-corinthians-15-16-18-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "No resurrection equals perished. That sentence is impossible if the saints are already in heaven. GC 546.3 — no resurrection would be necessary."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-1-corinthians-15-16-18-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For if the dead rise not, then is not Christ raised: And if Christ be not raised, your faith is vain; ye are yet in your sins. Then they also which are fallen asleep in Christ are perished.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:16-18", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "No resurrection equals perished. That sentence is impossible if the saints are already in heaven. GC 546.3 — no resurrection would be necessary."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-luke-14-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Pay-day is dated: at the resurrection of the just. Not at death. 2 Tim 4:8 — the crown is laid up 'at that day.'"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-luke-14-14-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And thou shalt be blessed; for they cannot recompense thee: for thou shalt be recompensed at the resurrection of the just.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 14:14", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Pay-day is dated: at the resurrection of the just. Not at death. 2 Tim 4:8 — the crown is laid up 'at that day.'"
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-luke-20-27-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "One party denied the resurrection outright. Another makes it needless — the immortal soul. GC 547.2 — hope of bliss at death led to neglect of the resurrection."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-luke-20-27-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Then came to him certain of the Sadducees, which deny that there is any resurrection; and they asked him,", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 20:27", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "One party denied the resurrection outright. Another makes it needless — the immortal soul. GC 547.2 — hope of bliss at death led to neglect of the resurrection."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-matthew-22-29-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Two roots of every denial: not knowing the Scriptures, nor the power of God."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-matthew-22-29-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Jesus answered and said unto them, Ye do err, not knowing the scriptures, nor the power of God.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 22:29", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Two roots of every denial: not knowing the Scriptures, nor the power of God."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s23-luke-20-37-38-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ cites the bush to prove 'that the dead are raised' — not a present life. DA 606.1 — God counts the things that are not as though they were."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s23-luke-20-37-38-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Now that the dead are raised, even Moses shewed at the bush, when he calleth the Lord the God of Abraham, and the God of Isaac, and the God of Jacob. For he is not a God of the dead, but of the living: for all live unto him.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 20:37-38", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Christ cites the bush to prove 'that the dead are raised' — not a present life. DA 606.1 — God counts the things that are not as though they were."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s24-acts-26-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The Maker of Gen 2:7 can do it twice. Why should it be thought a thing incredible?"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s24-acts-26-8-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Why should it be thought a thing incredible with you, that God should raise the dead?", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Acts 26:8", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The Maker of Gen 2:7 can do it twice. Why should it be thought a thing incredible?"
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s25-1-corinthians-15-36-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Nature preaches the resurrection every spring. Death is not the obstacle to the harvest; it is the road."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s25-1-corinthians-15-36-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Thou fool, that which thou sowest is not quickened, except it die:", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:36", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Nature preaches the resurrection every spring. Death is not the obstacle to the harvest; it is the road."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s26-john-12-24-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Spoken first of Himself. One Seed buried at Calvary; a harvest of the risen. Wheat raises wheat."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s26-john-12-24-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Verily, verily, I say unto you, Except a corn of wheat fall into the ground and die, it abideth alone: but if it die, it bringeth forth much fruit.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 12:24", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Spoken first of Himself. One Seed buried at Calvary; a harvest of the risen. Wheat raises wheat."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s27-1-corinthians-15-20-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The first sheaf is already waved. DA 785.4 — His resurrection is the type and pledge of the resurrection of all the righteous dead."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s27-1-corinthians-15-20-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But now is Christ risen from the dead, and become the firstfruits of them that slept.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:20", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The first sheaf is already waved. DA 785.4 — His resurrection is the type and pledge of the resurrection of all the righteous dead."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s28-leviticus-23-10-11-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The type: first sheaf, first day of the week, before any sickle touches the field. Christ rose on the very day the sheaf was waved."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s28-leviticus-23-10-11-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Speak unto the children of Israel, and say unto them, When ye be come into the land which I give unto you, and shall reap the harvest thereof, then ye shall bring a sheaf of the firstfruits of your harvest unto the priest: And he shall wave the sheaf before the LORD, to be accepted for you: on the morrow after the sabbath the priest shall wave it.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Leviticus 23:10-11", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The type: first sheaf, first day of the week, before any sickle touches the field. Christ rose on the very day the sheaf was waved."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s29-matthew-27-52-53-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The sheaf was a handful, not one stalk. DA 786.1 — He brought from the grave a multitude of captives. Lazarus died again (DA 786.2); these did not."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s29-matthew-27-52-53-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the graves were opened; and many bodies of the saints which slept arose, And came out of the graves after his resurrection, and went into the holy city, and appeared unto many.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 27:52-53", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The sheaf was a handful, not one stalk. DA 786.1 — He brought from the grave a multitude of captives. Lazarus died again (DA 786.2); these did not."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s30-john-5-28-29-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "'All,' 'in the graves,' 'his voice.' They are called up from the dust — not called down from heaven. DA 787.2 — that voice will penetrate the graves."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s30-john-5-28-29-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Marvel not at this: for the hour is coming, in the which all that are in the graves shall hear his voice, And shall come forth; they that have done good, unto the resurrection of life; and they that have done evil, unto the resurrection of damnation.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 5:28-29", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "'All,' 'in the graves,' 'his voice.' They are called up from the dust — not called down from heaven. DA 787.2 — that voice will penetrate the graves."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s31-john-5-26-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Why His voice can do it. DA 530.3 — in Christ is life, original, unborrowed, underived."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s31-john-5-26-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For as the Father hath life in himself; so hath he given to the Son to have life in himself;", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 5:26", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Why His voice can do it. DA 530.3 — in Christ is life, original, unborrowed, underived."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s32-john-11-43-44-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The sample of the last day: a name called, a grave obeying."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s32-john-11-43-44-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And when he thus had spoken, he cried with a loud voice, Lazarus, come forth. And he that was dead came forth, bound hand and foot with graveclothes: and his face was bound about with a napkin. Jesus saith unto them, Loose him, and let him go.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:43-44", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The sample of the last day: a name called, a grave obeying."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s33-acts-24-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Two classes. Christ names them: resurrection of life, resurrection of damnation. U. Smith, DAR 298.1 — the general resurrection is not a mixed resurrection."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s33-acts-24-15-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And have hope toward God, which they themselves also allow, that there shall be a resurrection of the dead, both of the just and unjust.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Acts 24:15", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Two classes. Christ names them: resurrection of life, resurrection of damnation. U. Smith, DAR 298.1 — the general resurrection is not a mixed resurrection."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s34-1-thessalonians-4-16-17-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Shout, voice, trump. Dead first; the living 'together with them.' No saint arrives early. GC 644.2 — 'Awake, awake, awake, ye that sleep in the dust!'"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s34-1-thessalonians-4-16-17-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the Lord himself shall descend from heaven with a shout, with the voice of the archangel, and with the trump of God: and the dead in Christ shall rise first: Then we which are alive and remain shall be caught up together with them in the clouds, to meet the Lord in the air: and so shall we ever be with the Lord.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:16-17", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Shout, voice, trump. Dead first; the living 'together with them.' No saint arrives early. GC 644.2 — 'Awake, awake, awake, ye that sleep in the dust!'"
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s35-1-thessalonians-4-13-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The comfort offered is the resurrection, not a present heaven. Sorrow — but not as others which have no hope."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s35-1-thessalonians-4-13-14-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But I would not have you to be ignorant, brethren, concerning them which are asleep, that ye sorrow not, even as others which have no hope. For if we believe that Jesus died and rose again, even so them also which sleep in Jesus will God bring with him.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:13-14", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The comfort offered is the resurrection, not a present heaven. Sorrow — but not as others which have no hope."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s36-1-corinthians-15-51-52-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Same trump, two groups, one change. The living are changed in the twinkling of an eye — and gain no head start on the sleepers."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s36-1-corinthians-15-51-52-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Behold, I shew you a mystery; We shall not all sleep, but we shall all be changed, In a moment, in the twinkling of an eye, at the last trump: for the trumpet shall sound, and the dead shall be raised incorruptible, and we shall be changed.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:51-52", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Same trump, two groups, one change. The living are changed in the twinkling of an eye — and gain no head start on the sleepers."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s37-isaiah-25-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "'Lo, this is our God; we have waited for him.' GC 645.1 — little children are borne by holy angels to their mothers' arms."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s37-isaiah-25-9-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And it shall be said in that day, Lo, this is our God; we have waited for him, and he will save us: this is the LORD; we have waited for him, we will be glad and rejoice in his salvation.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Isaiah 25:9", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "'Lo, this is our God; we have waited for him.' GC 645.1 — little children are borne by holy angels to their mothers' arms."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s38-daniel-12-2-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "'Many of' — a partial, mixed awaking at the voice of God, before He appears. GC 637.1 — all who died in the faith of the third angel's message come forth glorified."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s38-daniel-12-2-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And many of them that sleep in the dust of the earth shall awake, some to everlasting life, and some to shame and everlasting contempt.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Daniel 12:2", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "'Many of' — a partial, mixed awaking at the voice of God, before He appears. GC 637.1 — all who died in the faith of the third angel's message come forth glorified."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s39-revelation-1-7-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "His murderers must be raised to see it. Promised to Caiaphas himself — Matt 26:64. GC 637.1 — those that mocked His dying agonies are raised to behold Him in His glory."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s39-revelation-1-7-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Behold, he cometh with clouds; and every eye shall see him, and they also which pierced him: and all kindreds of the earth shall wail because of him. Even so, Amen.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 1:7", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "His murderers must be raised to see it. Promised to Caiaphas himself — Matt 26:64. GC 637.1 — those that mocked His dying agonies are raised to behold Him in His glory."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s40-1-corinthians-15-42-44-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "'It... it' — one subject through all eight clauses. Same person, new body. GC 644.3 — all blemishes and deformities are left in the grave."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s40-1-corinthians-15-42-44-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"So also is the resurrection of the dead. It is sown in corruption; it is raised in incorruption: It is sown in dishonour; it is raised in glory: it is sown in weakness; it is raised in power: It is sown a natural body; it is raised a spiritual body. There is a natural body, and there is a spiritual body.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:42-44", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "'It... it' — one subject through all eight clauses. Same person, new body. GC 644.3 — all blemishes and deformities are left in the grave."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s41-philippians-3-20-21-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The pattern is Christ's own glorious body. A real body — 'in my flesh shall I see God' (Job 19:26)."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s41-philippians-3-20-21-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For our conversation is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ: Who shall change our vile body, that it may be fashioned like unto his glorious body, according to the working whereby he is able even to subdue all things unto himself.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Philippians 3:20-21", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The pattern is Christ's own glorious body. A real body — 'in my flesh shall I see God' (Job 19:26)."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s42-psalm-17-15-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "David's expectation: awake — and like Him. Satisfied 'when I awake,' not when I die."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s42-psalm-17-15-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"As for me, I will behold thy face in righteousness: I shall be satisfied, when I awake, with thy likeness.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Psalm 17:15", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "David's expectation: awake — and like Him. Satisfied 'when I awake,' not when I die."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s43-luke-20-36-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Not 'shall not' but 'cannot.' Equal unto the angels. EW 287.1 — friends whom death had separated were united, never more to part."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s43-luke-20-36-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Neither can they die any more: for they are equal unto the angels; and are the children of God, being the children of the resurrection.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 20:36", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Not 'shall not' but 'cannot.' Equal unto the angels. EW 287.1 — friends whom death had separated were united, never more to part."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s44-1-corinthians-15-54-55-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Hos 13:14 and Isa 25:8 cashed in the same moment. GC 549.3 — last thought the grave, first glad thought the shout: 'O death, where is thy sting?'"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s44-1-corinthians-15-54-55-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"So when this corruptible shall have put on incorruption, and this mortal shall have put on immortality, then shall be brought to pass the saying that is written, Death is swallowed up in victory. O death, where is thy sting? O grave, where is thy victory?", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:54-55", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Hos 13:14 and Isa 25:8 cashed in the same moment. GC 549.3 — last thought the grave, first glad thought the shout: 'O death, where is thy sting?'"
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s45-revelation-20-6-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Blessed and holy. On such the second death hath no power. Their standing, and their work for a thousand years."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s45-revelation-20-6-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Blessed and holy is he that hath part in the first resurrection: on such the second death hath no power, but they shall be priests of God and of Christ, and shall reign with him a thousand years.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:6", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Blessed and holy. On such the second death hath no power. Their standing, and their work for a thousand years."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s46-revelation-20-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The millennium is spent judging — in heaven. Every question about who is missing, and why, is answered from the books."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s46-revelation-20-4-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I saw thrones, and they sat upon them, and judgment was given unto them: and I saw the souls of them that were beheaded for the witness of Jesus, and for the word of God, and which had not worshipped the beast, neither his image, neither had received his mark upon their foreheads, or in their hands; and they lived and reigned with Christ a thousand years.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:4", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The millennium is spent judging — in heaven. Every question about who is missing, and why, is answered from the books."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s47-revelation-20-5-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "'Lived not' — no consciousness in between. 'Until' — they do live again. Isa 24:22 — after many days shall they be visited."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s47-revelation-20-5-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But the rest of the dead lived not again until the thousand years were finished. This is the first resurrection.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:5", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "'Lived not' — no consciousness in between. 'Until' — they do live again. Isa 24:22 — after many days shall they be visited."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s48-revelation-20-13-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Every holding-place surrenders. GC 662.1 — the wicked bear the traces of disease and death. GC 662.2 — they come forth with the same enmity to Christ."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s48-revelation-20-13-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the sea gave up the dead which were in it; and death and hell delivered up the dead which were in them: and they were judged every man according to their works.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:13", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Every holding-place surrenders. GC 662.1 — the wicked bear the traces of disease and death. GC 662.2 — they come forth with the same enmity to Christ."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s49-revelation-20-12-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Raised to stand and hear. Not a second chance — GC 662.2, no new probation. Every knee bows, every tongue confesses (Rom 14:11)."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s49-revelation-20-12-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I saw the dead, small and great, stand before God; and the books were opened: and another book was opened, which is the book of life: and the dead were judged out of those things which were written in the books, according to their works.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:12", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Raised to stand and hear. Not a second chance — GC 662.2, no new probation. Every knee bows, every tongue confesses (Rom 14:11)."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s50-revelation-20-7-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "What looses Satan is the return of his subjects. Their first act is a siege. The grave converts no one."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s50-revelation-20-7-8-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And when the thousand years are expired, Satan shall be loosed out of his prison, And shall go out to deceive the nations which are in the four quarters of the earth, Gog and Magog, to gather them together to battle: the number of whom is as the sand of the sea.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:7-8", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "What looses Satan is the return of his subjects. Their first act is a siege. The grave converts no one."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s51-revelation-20-9-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Fire from God out of heaven — and the verb is 'devoured.' Not preserved in misery: consumed."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s51-revelation-20-9-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And they went up on the breadth of the earth, and compassed the camp of the saints about, and the beloved city: and fire came down from God out of heaven, and devoured them.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:9", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Fire from God out of heaven — and the verb is 'devoured.' Not preserved in misery: consumed."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s52-revelation-21-8-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Scripture names the lake: the second death. The roll opens with 'the fearful, and unbelieving.' GC 544.2 — He deprives him of the existence his transgressions have forfeited."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s52-revelation-21-8-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But the fearful, and unbelieving, and the abominable, and murderers, and whoremongers, and sorcerers, and idolaters, and all liars, shall have their part in the lake which burneth with fire and brimstone: which is the second death.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 21:8", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Scripture names the lake: the second death. The roll opens with 'the fearful, and unbelieving.' GC 544.2 — He deprives him of the existence his transgressions have forfeited."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s53-malachi-4-1-3-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Neither root nor branch — ashes. GC 673.1 — in the cleansing flames the wicked are at last destroyed, root and branch. An end, not endless misery."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s53-malachi-4-1-3-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For, behold, the day cometh, that shall burn as an oven; and all the proud, yea, and all that do wickedly, shall be stubble: and the day that cometh shall burn them up, saith the LORD of hosts, that it shall leave them neither root nor branch. ... And ye shall tread down the wicked; for they shall be ashes under the soles of your feet in the day that I shall do this, saith the LORD of hosts.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Malachi 4:1, 3", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Neither root nor branch — ashes. GC 673.1 — in the cleansing flames the wicked are at last destroyed, root and branch. An end, not endless misery."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s54-1-corinthians-15-26-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Death is an enemy — never a friend or a doorway. And it is the last one standing."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s54-1-corinthians-15-26-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"The last enemy that shall be destroyed is death.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:26", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Death is an enemy — never a friend or a doorway. And it is the last one standing."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s55-revelation-20-14-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Death and the grave themselves die. Hos 13:14 kept to the letter: 'O grave, I will be thy destruction.'"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s55-revelation-20-14-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And death and hell were cast into the lake of fire. This is the second death.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 20:14", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Death and the grave themselves die. Hos 13:14 kept to the letter: 'O grave, I will be thy destruction.'"
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s56-revelation-21-4-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The last funeral has been held. In Adam all die — the last enemy destroyed — and between them stands one empty tomb."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s56-revelation-21-4-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 21:4", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The last funeral has been held. In Adam all die — the last enemy destroyed — and between them stands one empty tomb."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s57-revelation-1-18-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "At your graveside or a loved one's: He has the keys. Which resurrection is not decided at the trump — it is decided before you sleep."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s57-revelation-1-18-panel.png")), position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"I am he that liveth, and was dead; and, behold, I am alive for evermore, Amen; and have the keys of hell and of death.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 1:18", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "At your graveside or a loved one's: He has the keys. Which resurrection is not decided at the trump — it is decided before you sleep."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s58-john-11-25-26-full.png")), position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Two resurrections, and everyone here will be in one of them. Christ asks what He asked Martha: 'Believest thou this?'"
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s58-john-11-25-26-panel.png")), position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Jesus said unto her, I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live: And whosoever liveth and believeth in me shall never die. Believest thou this?", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:25-26", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Two resurrections, and everyone here will be in one of them. Christ asks what He asked Martha: 'Believest thou this?'"
    end tell
    save theDoc in POSIX file savePath
  end tell
  return "Built " & (count of slides of theDoc) & " slides at " & savePath
end tell
