# First the Blade

The website for the First the Blade YouTube channel
([@firsttheblade](https://www.youtube.com/@firsttheblade)), and its email
list. Prerendered pages: home, about, one page per series, privacy, the
not-found page, and the email list's notices.

## How it is built

- **Pages** are Solid 2 components (`src/views.tsx`, `src/ui/`) drawn to whole
  HTML files at build time (`src/prerender.tsx`). Nothing hydrates.
- **The phone menu** is the one part that runs in the browser
  (`src/client.tsx`, `src/ui/phone-menu.tsx`): @bible/ui's Dialog, mounted in
  place of a link to the footer's links, so the menu works without script too.
  Its open state is a local signal; no state is shared or kept in the address,
  so @bible/atom-solid and @bible/url-state are not used.
- **The Worker** (`src/worker/Site.ts`) serves `dist/` from Cloudflare's static
  assets. Every request passes through `src/worker/respond.ts` first: the
  email list's routes, then GET and HEAD only, the not-found page as a 404,
  cache headers by kind of file, and the security headers (a strict content
  policy with no inline script or style; forms post only to this site).
- **Pages and words** are data: `src/pages.ts` (paths, titles, link cards),
  `src/content.ts` (the verse, the four series). A series lists its films once
  they are added to its `episodes`.
- **Search** reads each page's head and its JSON-LD graph (`src/structured.ts`):
  the channel as an Organization linked to its YouTube channel, the page, its
  breadcrumb, and on a series page the series and each film as a video. The
  sitemap dates a series page by its newest film (`src/meta.ts`), and
  `llms.txt` lists the pages.

## Publishing a film

The owner's choices (ask a358017aa44, 2026-10-20): each film gets a study page
on the site, its vertical cuts go to YouTube Shorts, Facebook, Instagram and
TikTok, and each film sends one email to the list. Pinterest waits until the
country living, education and health series have films. A Patreon link follows
once the first films are out; every film stays free, and Patreon is support
only (ask ab8011aa651).

1. Add the film to its series' `episodes` in `src/content.ts`, with its
   YouTube id and the day it went up (`published`).
2. Give it its study page: its words, the verses it cites and further reading.
   The page is not built yet; the first film builds it, from the film's script
   and sources.
3. Deploy, then send the film's email: `bun run mail:send path/01 --dry-run`
   counts who will get it, and `bun run mail:send path/01` sends it. Running
   it again finishes a send that stopped and sends no one the film twice.

## The email list

The list is the site's own, on Cloudflare (owner, ask a8b77b61c99): a sign-up,
a confirm, one-click leave, and one email per film. There is no tracking, no
template editor and no analytics.

- **Sign-up** is the form in the night close (`src/ui/mail.tsx`). It posts to
  `POST /subscribe` with no script; a honeypot field and a limit of five tries
  a minute from one connection keep bots out. Every address gets the same
  answer, and the answer does not wait for the work on the address, so neither
  the page nor its timing tells who is on the list. A new or pending address is sent one
  email to confirm, at most once an hour, even across leaving and joining again.
- **Confirm** is the link in that email, `GET /subscribe/confirm?token=`.
  Opening it only shows a page with one button, "Confirm my email", since
  mail scanners open links; the button's `POST` to the same address confirms.
  In a browser the page's script presses the button as it opens, so a person
  confirms in one step (owner, 2026-10-20); with no script the button is there
  to press. A GET never changes the list. A link works for seven days, and only the
  newest one, sent since the address last left, works.
- **Sign-ups never confirmed** are undone 30 days after the address last
  signed up, by the Worker's daily cron trigger (`src/mail/purge.ts`, 04:17
  UTC): an address that never confirmed is deleted with every row it owns,
  and one that left and signed up again is marked as left again. Its log
  line carries counts only (`purge.done deleted= sends= left=`).
- **Leave** is the link at the foot of every film's email, `GET /unsubscribe`
  (one button), and its `POST`, which a mail app's one-click unsubscribe also
  sends (`List-Unsubscribe`, RFC 8058); it answers 200, never a redirect.
- **A film's email** goes out through `bun run mail:send` (`scripts/mail-send.ts`),
  which calls `POST /mail/send` with the admin secret. The Worker puts one
  delivery per confirmed subscriber on a Cloudflare Queue and sends them a
  batch at a time; the `sends` table claims each before it goes, so no one gets
  a film twice. A send that stops between its claim and its outcome is counted
  `unsure` and not sent again, since its email may have gone.
  The email is built from the film's entry in `src/content.ts` (`src/mail/letters.ts`).
- **Where it lives:** the list is D1 (`migrations/`, applied on deploy), the
  emails go through Cloudflare Email Sending from `films@firsttheblade.com`,
  and the Worker binds both with the Queue and a Rate Limit (`src/worker/mail.ts`).
  The routes are `src/mail/routes.ts`; the logs name ids and counts only
  (`[mail] <action> key=value`), never an address or a token.
  The stack owns the sending domain (`src/worker/domain.ts`): it onboards
  firsttheblade.com to Email Sending, with its DNS records, and turns
  message previews off. Email Sending has no open or click tracking to turn
  off, and the letters carry none. Every stage takes the domain as it is and
  never deletes it, since prod and a throwaway stage send from it alike.
- **Contact:** `hello@firsttheblade.com` (`CONTACT` in `src/site.ts`, named on
  the privacy page) is forwarded to the owner's inbox by Cloudflare Email
  Routing, which the prod stack sets up: Email Routing on the zone, the
  inbox as a destination, and one rule. Cloudflare takes a forwarding rule
  only to a verified destination, so the rule is declared once `.env` says
  the inbox is verified (`MAIL_FORWARD_VERIFIED=true`), on the deploy after
  the owner opens Cloudflare's verification link.
  The flag stays set: a prod deploy without it removes the rule.
- **No postal address yet** (owner, 2026-10-20). A letter that asks for
  support is commercial email, which must carry one, so the P.O. box goes
  into `POSTAL_ADDRESS` (`src/mail/letters.ts`) before the first letter
  mentions Patreon: `src/mail/letters.test.ts` fails while any letter does
  and none is set. Once set, it is at the foot of every letter.

Two secrets sign the links and guard the send route, and prod needs the
inbox the contact address is forwarded to. They live in
`apps/firsttheblade/.env` (gitignored), which `bun run deploy` and
`bun run mail:send` both read; the deploy binds the secrets to the Worker:

```bash
MAIL_TOKEN_KEY=<openssl rand -hex 32>
MAIL_ADMIN_TOKEN=<openssl rand -hex 32>
MAIL_FORWARD_TO=<the owner's inbox, prod only>
MAIL_FORWARD_VERIFIED=true   # once the inbox's verification link is opened
```

Changing `MAIL_TOKEN_KEY` breaks every link already sent. The first prod
deploy adds `MAIL_FORWARD_TO` as an Email Routing destination, and
Cloudflare sends it a verification email. Once the owner opens its link,
`MAIL_FORWARD_VERIFIED=true` and one more prod deploy add the rule that
forwards `hello@firsttheblade.com` to it. Under
`bun run preview` the list runs in memory: each email is written to
`tmp/outbox/<n>.txt` instead of being sent, so a sign-up can be confirmed and
left from a laptop.

## Commands

```bash
bun run build      # vite build (browser) + vite build --ssr (pages) + prerender → dist/
bun run preview    # dist/ through the Worker's policy on http://localhost:8470 (PORT to change)
bun run test       # the Worker's policy, the email list, the pages' data, the sitemap
bun run typecheck
bun run plan       # build, then show what `prod` would change
bun run deploy     # build, then deploy `prod`
bun run mail:send <series>/<no> [--dry-run] [--origin <url>]   # send a film to the email list
bun run verify:drive confirm --root <dir> --port <p> --evidence <dir>   # drive the site as a visitor (verify:launch, :doctor, :outbox, :stop, :stage too)
```

How to run and drive the site to check a change, with the proof it keeps,
is the `verify-firsttheblade` skill (`.claude/skills/verify-firsttheblade`).

Alchemy asks before it changes anything. In a shell that can't prompt (Claude Code's `!`, CI), pass the approval through: `bun run deploy --yes`.

A throwaway copy goes to its own stage, on its own `workers.dev` host, and
never takes the site's hostnames. It does share the sending domain with
prod: its deploy onboards firsttheblade.com to Email Sending when it is not
yet, and sets message previews off; its destroy leaves the domain as it is.

```bash
bun run build && bunx alchemy deploy alchemy.run.ts --stage agent-<name> --yes
bunx alchemy destroy alchemy.run.ts --stage agent-<name> --yes
```

Deploying needs the Alchemy Cloudflare profile
(`bunx alchemy profile edit --profile default --reconfigure Cloudflare`, interactive).

## The domain

The site is served from firsttheblade.com, which is in this Cloudflare
account. The switch is one line in `src/site.ts`:

```ts
export const SERVED_FROM: ServedFrom = 'custom-domain';
```

With it, `bun run deploy` gives the Worker `firsttheblade.com`, redirects
`www.firsttheblade.com`, and firsttheblade.org and firsttheblade.net with their
`www` (`REDIRECTED_DOMAINS`), to it, and switches the `workers.dev` URL off. The
canonical URL, the link cards, the sitemap and robots.txt follow, since they
read the same value. `'workers.dev'` serves the site from that URL instead.

`WORKERS_DEV_SUBDOMAIN` in the same file is the account's `workers.dev`
subdomain; the canonical URL on the `workers.dev` host is built from it.

## The look

The site is brand round 4's choice (2026-10-19): logo 10 (the painted shoot in
its disc beside the Newsreader wordmark), site mix 1 “Day into night as you
read” (the morning field, the series on torn paper, a dusk band, the night
close with Mark 4:27), and palette 09, “Morning under a blue sky”, from Sanzo
Wada's combination no. 294. The colours have one source, `src/palette.ts`;
the stylesheet's `--color-*` tokens repeat them, and the tests hold the two
together. Round 5 (2026-10-19) sharpened two pieces: the hero is a repaint
of the field at 3072 px, and the dusk band blends in oklab.

```bash
bun run contrast   # every built page at 390 and 1440 px, and each link under the pointer, against WCAG AA (build first)
bun run kit        # the YouTube kit into kit/out/, and the link cards and icons into public/
bun run promise    # builds, then: every sentence a reader gets that speaks of email, of what we send or of how often is the list's promise, or held
bun run promise:census  # the promise check, red on each way the promise was lost before and on each source it refuses, each injected and built
```

The app's `gate` is `bun scripts/promise.ts && bun run promise:census`:
`bun run gate` runs it with the checks, after turbo's build, so the check
reads that build, cached or not. The build writes a stamp last
(`scripts/built.ts`, into `.prerender/`, so it is not served: the hash of
its sources, turbo's `build` inputs in `turbo.json`, and of each file it
wrote), and the check refuses a `dist/` that
is not the build of the sources as they stand (`email-promise-built-twice`);
`bun run promise` builds first. The promise
check reads what a reader gets, the built pages (parsed as a browser parses
them), every letter the list sends (its sender, subject, text and HTML) and
the channel kit, so a sentence about how often or what we email is checked
as the reader reads it, whatever source wrote it (`docs/lessons.md`
`email-cadence-limits`).

It fails closed: an element, an attribute, a meta tag or a letter header it
does not know, a built picture, font or script it does not list, a
stylesheet string with a letter in it, generated content (`content:`), an
escape in a stylesheet outside its strings, a link card picture the kit did
not draw, an inline script and a character outside plain text each fail
the run until the check reads them or holds them word for word
(`email-promise-fails-closed`). Where a stylesheet could lay two boxes side
by side, the sentence they make joined is held too, named with a `|` at each
break.

Each sentence it refuses (`unheld:`, `layout:`) comes with the entry that
holds it, printed ready to paste into `HELD` in `scripts/promise.ts` with
its indent: the line names the list it goes under, or `HELD` itself for a
kind it holds nothing on yet (`email-promise-paste-ready-entry`). A pasted
line is a change to what the site tells a reader about its email, and a
review reads it as one.

The check finds a sentence about how often or what we email by its words
(`NET`: of mail, of the list, of what we send, and of time, inside longer
words too), and no list of words holds every way to say it: "Expect a word
from us when there is one." and "Plus a few things we think you will like."
hold none of them and pass (`email-promise-no-net-word`,
`email-promise-what-we-send`). So, in anything a reader gets:
**Say how often and what we email only in the promise's words.**

The app's `gate:timed` is `bun run contrast`: `bun run gate` runs it after
the build, with the tests, alone under the host's test lock, since its
browser holds a 30 s limit on each shot; so does CI's gate job, in the
runner's Google Chrome.

### Known limits of `bun run promise`

The owner chose to ship the check as it stands and log these (ask
a3e589137f5, 2026-10-21), so a review reads for each:

- Hidden text reads as seen: a part of a promise sentence wrapped in `.visually-hidden`, `aria-hidden` or a hiding style passes, though a sighted reader does not see it (`email-promise-hidden-text`).
- Bidi controls are folded away: a word written backwards between U+202E and U+202C, or under `unicode-bidi: bidi-override`, reads as no word, though a reader sees it (`email-promise-bidi-controls`).
- The browser's scripts are not read: words only `src/ui/phone-menu.tsx` or `src/confirm.ts` draw reach a reader through `dist/assets/client.js` or `confirm.js` alone, which the check skips (`email-promise-browser-script-prose`).
- Runs are joined in the page's order: a positioned box or a reordered flex item that a stylesheet lays beside other words is not read joined with them (`email-promise-joins-in-document-order`).
- The stamp hashes turbo's `build` inputs only: a run of `bun scripts/promise.ts` after an edit of the root tsconfig, the lock or `@bible/ui` reads the old `dist/`; the gate builds through turbo, whose hash holds them (`email-promise-stamp-inputs`).

## The art and the fonts

The field (`src/art/field-*.webp`, 768 to 3072 px) is brand round 5's repaint
of round 4's field. The night and the mark (`src/art/`, and `kit/art/` at full
size) are round 4's paintings. The series emblems are round 3's, in the same
colours. The thumbnails' paintings (`kit/art/robe.webp`, `kit/art/court.webp`)
are from Righteousness by Faith. `bun run kit` draws the YouTube banner and the
link cards in `public/og/` from the site's field, and the icons from the mark.

Newsreader (`src/fonts/`) is under the SIL Open Font License 1.1, subset to
Latin and Latin Extended and served from this site.
