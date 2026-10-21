# Pages

A visitor lands on the home page (the morning field, the four series on torn
paper, the night close with Mark 4:27 and the sign-up), follows a series to
its page (what it covers, its films, or "None are out yet"), reads About, and
moves between them by the header, the footer's Site navigation, or on a phone
the Menu dialog. Nothing on these pages needs script except the phone menu,
which falls back to a link to the footer.

## Sub-features

- `home`: the home page, its h1 "First the Blade" and the series list.
- `series`: each of the four series pages, from the home page's series links.
- `about`: the About page.
- `header`: the Main navigation (Series, About, Subscribe on YouTube).
- `footer`: the Site navigation (Home, Series, About, YouTube, Instagram, Facebook, Privacy).
- `phone-menu`: the Menu button and its dialog at the phone board.
- `skip-link`: "Skip to content".

## How to get to it (user POV)

- Typing the address: `/`, `/about`, `/series/the-path-of-the-just`,
  `/series/dwell-in-the-land`, `/series/taught-of-the-lord`,
  `/series/the-true-remedies`.
- The home page's series headings, each a link.
- The header: the wordmark link "First the Blade" (home), "Series" (`/#series`), "About".
- The footer's Site navigation, on every page.
- On a phone, the "Menu" button, then the dialog's Main navigation.
- "More about the channel" on the home page (About).

## Driving it with agent-browser

- **Preconditions:** the baseline; nothing more.
- **States:** default, open (the phone menu), focus-visible (the skip link
  with `ab press Tab`). Loading, empty and error are n/a: the pages are
  static. A series with no films shows its empty line ("None are out yet").
- **Regression:** `apps/firsttheblade/src/pages.test.ts`,
  `apps/firsttheblade/src/structured.test.ts`,
  `apps/firsttheblade/src/buttons.test.ts`, and the gate's
  `bun run --cwd apps/firsttheblade contrast`.

1. **Home.** `ab open $O/`. The snapshot holds the heading "First the Blade"
   (level 1), a region named "Short films and plain talks…" with four level-3
   headings, and the form's textbox "Or have each one sent to you by email".
2. **Series from home.** `ab find role link click --name "The Path of the Just" --exact`.
   The URL ends `/series/the-path-of-the-just`; the h1 is "The Path of the
   Just", with the regions "About the series", "What it covers" and "The
   films". Repeat for "Dwell in the Land", "Taught of the Lord" and "The True
   Remedies".
3. **Header.** `ab find role link click --name "About" --exact` inside the
   Main navigation (the first match); the URL ends `/about`. "Series" lands on
   `/#series`.
4. **Footer.** `ab find role link click --name "Privacy" --exact`; the URL
   ends `/privacy`.
5. **Phone menu.** `ab set viewport 390 844`, `ab open $O/`, then
   `ab find role button click --name "Menu" --exact`. A dialog "Menu" opens
   with a "Close menu" button and the Main navigation (Series, About,
   Subscribe on YouTube). `ab press Escape` closes it; the button's
   `aria-expanded` is `false` again.
6. **Proof.** `ab snapshot > $EVIDENCE/pages/<n>-<step>.aria.txt` and
   `ab screenshot $EVIDENCE/pages/<n>-<step>.png` after each step.

## Gotchas

- The header and the footer both have "Series" and "About" links: a name
  match finds the header's first. Scope with the snapshot's ref (`@e…`) when
  the footer's is meant.
- At the phone board the header shows "Subscribe" and the "Menu" button,
  not "Series" and "About"; at the desktop board the Menu button is not there.
- The local preview answers `/about/` and `/series/<slug>/` with 404, while
  Cloudflare redirects them (Not found and redirects): write paths without
  the trailing slash.
- "Subscribe on YouTube" leaves the site for youtube.com: do not follow it
  in a drive.
