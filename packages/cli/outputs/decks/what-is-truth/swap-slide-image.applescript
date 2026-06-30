-- swap-slide-image.applescript
-- Replace ONE slide's full-bleed image in the live narrative deck, in place,
-- without rebuilding the whole thing. Targets the slide by a unique substring of
-- its caption, deletes the existing full-bleed image, inserts the new one at the
-- same {0,0} 1920x1080 geometry, and sends it to the back so the caption stays on top.
--
-- Usage: osascript swap-slide-image.applescript "<caption substring>" "<image filename>"
--   e.g. osascript swap-slide-image.applescript "Justice let the other side speak too" "n17-the-tree.png"

on run argv
	set captionMatch to item 1 of argv
	set imgFile to item 2 of argv
	set imgDir to "/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/what-is-truth/images/day3/"
	set imgPath to imgDir & imgFile

	tell application "System Events"
		if not (exists disk item imgPath) then return "ERROR: image not found — " & imgPath
	end tell

	tell application "Keynote"
		if (count of (documents whose name contains "why_suffering_narrative")) = 0 then ¬
			return "ERROR: narrative deck is not open"
		set theDoc to item 1 of (documents whose name contains "why_suffering_narrative")

		set hitIdx to 0
		repeat with i from 1 to (count of slides of theDoc)
			set s to slide i of theDoc
			set capText to ""
			repeat with t in (text items of s)
				set capText to capText & (object text of t)
			end repeat
			if capText contains captionMatch then
				set hitIdx to i
				exit repeat
			end if
		end repeat

		if hitIdx = 0 then return "ERROR: no slide caption contains — " & captionMatch

		set s to slide hitIdx of theDoc
		tell s
			-- remove existing full-bleed image(s); delete from the back so indices stay valid
			repeat with k from (count of images of s) to 1 by -1
				delete image k of s
			end repeat
			-- insert the replacement at the same geometry, behind the caption
			set newImg to make new image with properties {file:(POSIX file imgPath), position:{0, 0}, width:1920, height:1080}
		end tell

		save theDoc
		return "SWAPPED slide " & hitIdx & " <- " & imgFile
	end tell
end run
