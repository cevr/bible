#!/bin/sh
# Writes the first two productions' ledgers (the look, and Righteousness by
# Faith) from the dated sets, picks.md and the unit journals, through the
# `film production` CLI. Run from apps/animations of the checkout whose lab
# should show them; FILMS_LAB picks the lab folder (the owner's: p5's
# apps/animations/lab). A decision that closed a version is dated a minute
# before the move it made, so it sits in the version it closed. Each `new` refuses a ledger that is already there,
# so a second run stops at the first line.
set -eu
film() { bun cli.ts "$@"; }

# --- The look (art direction): a track every film is drawn in -------------
film production new look --title "The look" --first "Paper-cut knobs" --at 2026-10-12T12:00:00-04:00 \
  --blurb "The house look every film is drawn in: the paper-cut knobs, K1, seven other styles, then K1-minimal (9005)."
film production note look "Open choices go ahead on the agents' recommendations, provisionally, as knobs" \
  --quote "continue without solidifying the choices" --at 2026-10-13T01:00:00-04:00
film production file look choices-2026-10-13 --version 1

film production forward look --after 1 --title "K1 paper-cut" --at 2026-10-13T08:00:00-04:00 \
  --because "K1 picked after watching the Opening set: a thick outline with a light inner edge, warm ink, a hue per garment, the head a third"
film production decide look "K1 is the paper-cut look (A3 + B1 + C2 + D2)" --quote "i like k1" \
  --set choices-2026-10-13 --at 2026-10-13T07:59:00-04:00
film production note look "The cast's hair often looks strange; the heads look stitched on" \
  --quote "it just looks stitched on" --set cast-2026-10-13 --at 2026-10-13T12:00:00-04:00
for set in shading-2026-10-13 cast-2026-10-13 ensembles-2026-10-13 bible-cast-2026-10-13 picks-2026-10-13 heads-2026-10-13; do
  film production file look "$set" --version 2
done

film production forward look --after 2 --title "Seven other styles" --at 2026-10-13T20:00:00-04:00 \
  --because "Try other 2D styles that are stylistic, attractive, expressive and minimal: seven prototypes, one in the Paper Mario line"
film production note look "Prototype seven 2D styles; one in the Paper Mario line, the rest widely different" \
  --quote "maybe prototype for another of 2d art style thats stylistic, attactive, expressive and minimal? use seeds to generate a number and then try - use max, lets go for 7 prototypes" \
  --at 2026-10-13T20:00:00-04:00
for set in styles-preview-2026-10-13 styles-2026-10-13; do
  film production file look "$set" --version 3
done

film production forward look --after 3 --title "Concept art, then K1-minimal" --at 2026-10-14T09:09:00-04:00 \
  --because "The seed concept art is liked: can it be rendered and animated reliably?"
film production note look "Can the concept art be animated reliably? Make a K1 concept too, and render against it" \
  --quote "i like a lot of the concept art that we had made with the seeds, but can we reliably animate that?" \
  --at 2026-10-14T09:09:00-04:00
film production note look "K1 minimal: the gripe with K1 was hair and ornaments; clothes plain but for distinguishing marks" \
  --quote "minimal when it comes to k1 - my main gripe with k1 was hair and ornaments" --at 2026-10-14T11:51:00-04:00
film production note look "Favourite seeds: 9002, 8880, 6176, 7831" --set concepts-2026-10-14 --at 2026-10-14T11:55:00-04:00
film production decide look "Mid-century Shapes and Riso are dropped" --quote "no need for mid century or riso" \
  --at 2026-10-14T13:01:00-04:00
for set in k1-concept-2026-10-14 concepts-2026-10-14; do
  film production file look "$set" --version 4
done

film production forward look --after 4 --title "9005: K1-minimal, plain" --at 2026-10-14T12:30:00-04:00 \
  --because "9005 picked: one-shape heads with an inner edge, a flat beard, plain clothes, the crease, grain and cast shadows"
film production decide look "9005 is the look" --quote "i like 9005" --set concepts-2026-10-14 \
  --at 2026-10-14T12:29:00-04:00
film production note look "Explore the One Line concept: give it the storyboard-to-render treatment" \
  --quote "also lets try exploring the one line concept - i kinda like it, give it the storyboard -> render etc treatment" \
  --at 2026-10-14T15:26:00-04:00
film production file look seedanim-2026-10-14 --version 5

# --- Righteousness by Faith ---------------------------------------------
film production new righteousness-by-faith --title "Righteousness by Faith" --film righteousness-by-faith \
  --first "Canvas cut" --at 2026-09-25T09:00:00-04:00 --blurb "The 1888 message in 20 scenes: the court, the robe, the exchange."
film production file righteousness-by-faith righteousness-by-faith-v1 --version 1
film production file righteousness-by-faith righteousness-by-faith --version 1

film production forward righteousness-by-faith --after 1 --title "Rive, in the new look" \
  --at 2026-10-14T13:00:00-04:00 \
  --because "Rive is the main engine (2026-10-12) and the look is moving to K1-minimal: redraw the cold open in each chosen style"
film production note righteousness-by-faith "Draw the cold open (the court, then Job's question) as concept art in every chosen style" \
  --quote "render the righteousness by faith opening court + job scene in these styles as the concept" \
  --at 2026-10-14T13:00:00-04:00
film production note righteousness-by-faith "Render the cold open in Rive in every chosen style" \
  --quote "also render in rive the scene please in all these styles we've chosen" --at 2026-10-14T13:03:00-04:00
film production note righteousness-by-faith "We start with storyboards, like a real studio" \
  --quote "and part of our lab process, we start with storyboards, like a real studio" --at 2026-10-14T13:43:00-04:00
film production note righteousness-by-faith "Job's question is a full-screen card" \
  --quote "remember about the full screen cards with text" --at 2026-10-14T13:54:00-04:00
film production note righteousness-by-faith "Try punchy subtitles, cut out over a full-screen card" \
  --quote "lets try rendering with punchy subtitles" --set rbf-rive-2026-10-14 --at 2026-10-14T14:08:00-04:00
film production ask righteousness-by-faith "Which style holds the cold open?" \
  --set rbf-rive-2026-10-14 --point render:cold --at 2026-10-14T14:30:00-04:00
film production ask righteousness-by-faith "Punchy subtitles or the clean master?" \
  --set rbf-rive-2026-10-14 --point render:subtitles --at 2026-10-14T14:45:00-04:00
film production decide righteousness-by-faith "9005 over 9006" --quote "ok 9005 over 9006 for sure" \
  --set rbf-rive-2026-10-14 --point render:cold --variant 9005 --at 2026-10-14T15:10:00-04:00
for set in rbf-concepts-2026-10-14 rbf-rive-2026-10-14; do
  film production file righteousness-by-faith "$set" --version 2
done
