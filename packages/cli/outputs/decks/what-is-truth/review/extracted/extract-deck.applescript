on run argv
	set deckPath to item 1 of argv
	tell application "Keynote"
		set theDoc to open POSIX file deckPath
		delay 2
		tell theDoc
			set n to count of slides
			set out to ""
			repeat with i from 1 to n
				set theSlide to slide i
				set ttl to ""
				try
					set ttl to object text of default title item of theSlide
				end try
				set bod to ""
				try
					set bod to object text of default body item of theSlide
				end try
				-- collect any extra text items not equal to title/body
				set extras to ""
				try
					repeat with ti in (text items of theSlide)
						set tx to ""
						try
							set tx to object text of ti
						end try
						if tx is not "" and tx is not ttl and tx is not bod then
							set extras to extras & tx & "
"
						end if
					end repeat
				end try
				set nts to ""
				try
					set nts to presenter notes of theSlide
				end try
				set out to out & "@@@SLIDE " & i & "@@@" & "
"
				set out to out & "###TITLE###" & "
" & ttl & "
"
				set out to out & "###BODY###" & "
" & bod & "
"
				set out to out & "###EXTRA###" & "
" & extras & "
"
				set out to out & "###NOTES###" & "
" & nts & "
"
			end repeat
		end tell
		close theDoc saving no
		return out
	end tell
end run
