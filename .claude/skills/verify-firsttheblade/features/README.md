# First the Blade verification map

The maintained source for verifying what a visitor to First the Blade can do.
Read this index before driving the site, then use the matching feature file
as the recipe.

## Baseline

- `bun run --cwd apps/firsttheblade build`, then
  `bun run --cwd apps/firsttheblade verify:launch --root "$PWD/$ROOT" --port $PORT`
  serves the site on `http://127.0.0.1:$PORT` with an empty list. Never port
  8470, the owner's own preview.
- `bun run --cwd apps/firsttheblade verify:doctor --root "$PWD/$ROOT"` passes
  before the first drive.
- `AGENT_BROWSER_SESSION=$RUN` and
  `AGENT_BROWSER_ARGS=--mute-audio,--disable-audio-output` are exported, and
  recipes write `agent-browser` as `ab`; `$O` is `http://127.0.0.1:$PORT`.
- The desktop board is `ab set viewport 1280 800`; the phone board is
  `ab set viewport 390 844`.
- The preview's list allows five sign-ups a minute from one place, and every
  local request is one place: a run that signs up more often waits a minute.

## Proof and skip reporting

- Each journey records a video, `$EVIDENCE/<feature>/<feature>.webm`
  (`ab record start` and `ab record stop`, or `verify:drive`'s own).
- Each step records the action, the URL after it, `ab snapshot` and
  `ab screenshot` into `$EVIDENCE/<feature>/`.
- A write is proved by a second view: a confirm by signing up again (the log
  says `[mail] subscribe.quiet`, no second letter comes).
- An unreachable entry point is reported with the command tried and the unmet
  precondition. It never counts as verified through another path.

## Entry contract

Each feature file has an H1, one paragraph of what a visitor sees, then
exactly these H2s in order:

1. `Sub-features`: short ids, one line each.
2. `How to get to it (user POV)`: every entry point a visitor has.
3. `Driving it with agent-browser` (or the helper that drives it): three
   lines first, then labeled steps that pair a visitor's action, an exact
   command and the observable result.
   - **Preconditions:** the state the steps need beyond the baseline.
   - **States:** which of default, focus-visible, open, loading, empty and
     error the steps exercise; the rest n/a.
   - **Regression:** the automated tests that cover the feature.
4. `Gotchas`: traps that waste or invalidate a run.

## Features

- [Pages](pages.md): the home page, the four series pages, About, the
  header, the footer and the phone menu.
- [Sign up](signup.md): the night close's form and the notices it leads to.
- [Confirm](confirm.md): the confirm link from the letter, its skeleton and
  in-place answer, the button with script off, a link that ran out.
- [Leave](leave.md): the leave link at the foot of a film's letter.
- [Privacy](privacy.md): what the list keeps and how to leave it.
- [Not found and redirects](not-found-and-redirects.md): the 404 page, the
  methods refused, the mail routes' 303s and the hosts' redirects.
- [The outbox](outbox.md): the letters the preview writes instead of sending.
- [Motion](motion.md): the field's wind and shimmer, the night's stars, the
  series cards' hover, and the stills kept still for less motion.
