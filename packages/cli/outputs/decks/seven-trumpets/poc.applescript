-- Proof of concept: minimal white-on-black deck in the user's style
-- Slide types: title, quote (centered text + attribution), full-bleed image + caption

set imgPath to "/tmp/key-previews/sin_suffering_why.jpg" -- placeholder test image

tell application "Keynote"
	activate
	set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
	tell theDoc
		-- Slide 1: title (use the default first slide)
		set base slide of slide 1 to master slide "Title - Center"
		tell slide 1
			set object text of default title item to "The Forgotten Woe"
			set object text of default body item to "Proof of Concept"
		end tell

		-- Slide 2: quote slide — blank master, one centered text item
		set quoteSlide to make new slide at end with properties {base slide:master slide "Blank"}
		tell quoteSlide
			set quoteItem to make new text item with properties {object text:"\"The Gothic nation was in arms at the first sound of the trumpet.\"", width:1400}
			set position of quoteItem to {260, 380}
			set size of object text of quoteItem to 56
			set font of object text of quoteItem to "Helvetica Neue"
			set attrItem to make new text item with properties {object text:"— James White, The Sounding of the Seven Trumpets", width:1400}
			set position of attrItem to {260, 640}
			set size of object text of attrItem to 32
			set font of object text of attrItem to "Helvetica Neue Light"
		end tell

		-- Slide 3: image slide — blank master, full-bleed image + caption
		set imgSlide to make new slide at end with properties {base slide:master slide "Blank"}
		tell imgSlide
			set theImg to make new image with properties {file:POSIX file imgPath}
			set width of theImg to 1600
			set position of theImg to {160, 60}
			set capItem to make new text item with properties {object text:"The Sack of Rome — A.D. 410", width:1600}
			set position of capItem to {160, 980}
			set size of object text of capItem to 36
			set font of object text of capItem to "Helvetica Neue Light"
		end tell
	end tell
	-- save to a temp location for inspection
	save theDoc in POSIX file "/tmp/poc-trumpets.key"
end tell
return "OK"
