# Confirm

A visitor opens the link in the confirm letter. In a browser with script the
page opens on a quiet skeleton of the notice to come (the mark, grey lines,
a status "Confirming your email") while its script posts the page's form;
after at least 600 ms the answer, "You are on the list", is drawn in the
skeleton's place with a staged entrance, the page never reloads, and the
address bar reads `/subscribe/confirmed`, so a reload shows that page and
posts nothing. With script off the page shows "Confirm your email" and one
button, "Confirm my email", whose press answers the confirmed page. Opening
the link alone confirms no one (mail scanners open links). A link older than
seven days, replaced, or cut short leads to "This link has run out".

## Sub-features

- `confirm-skeleton`: the skeleton shows as the link opens (status, `aria-busy=true`).
- `confirm-in-place`: the answer drawn in place: one load, one POST, the address bar `/subscribe/confirmed`, the title "You are on the list · First the Blade".
- `confirm-reload`: a reload shows the confirmed page and posts nothing.
- `confirm-noscript`: script off: the button, its press, 303 to the confirmed page.
- `confirm-held`: the write holds: a second sign-up of the confirmed address sends no letter.
- `confirm-expired`: a link that ran out or was cut short: "This link has run out", "Sign up again".

## How to get to it (user POV)

- The link in the confirm letter (`$ROOT/tmp/outbox/<n>.txt` on the preview),
  opened in a browser with script, or with script off.
- A cut-short or stale copy of that link.

## Driving it with verify:drive

- **Preconditions:** a build of the commit under test; a free port; a root
  with no preview running. `verify:drive` launches its own preview and signs
  up through the form itself.
- **States:** loading (the skeleton), default (the confirmed notice), error
  (expired, by agent-browser below). Empty, open and focus-visible are n/a.
- **Regression:** `apps/firsttheblade/src/confirm.test.ts`,
  `apps/firsttheblade/src/mail/mail.test.ts`,
  `apps/firsttheblade/src/mail/tokens.test.ts`.

1. **Both journeys.**

   ```bash
   bun run --cwd apps/firsttheblade verify:drive confirm confirm-noscript \
     --root "$PWD/$ROOT" --port $PORT --evidence "$PWD/$EVIDENCE"
   ```

   It prints `{"passed":true,…}`, or `JourneyFailed` with the step, what it
   saw and the evidence dir. Each journey's `steps` are:
   - `confirm`: `sign-up` (check page), `letter` (the confirm letter, its
     token kept as `<token>`), `skeleton` (status `aria-busy=true` saying
     "Confirming your email"), `confirmed` ("You are on the list" in place,
     its time after the open, one load, one POST, `/subscribe/confirmed`, no
     `aria-busy`), `reload` (no POST), `again` (`subscribe.quiet`, one letter).
   - `confirm-noscript`: `sign-up`, `letter`, `button` (heading "Confirm your
     email", the button, no skeleton), `confirmed` (after the press),
     `reload`, `again`.

2. **Read the proof.** `$EVIDENCE/confirm/03-skeleton.png` shows the grey
   skeleton under the mark; `04-confirmed.png` the notice mid-entrance;
   `confirm.webm` the whole journey. Check that the `confirmed` step's time
   is at least the 600 ms hold.
3. **Expired, by agent-browser.** On a `verify:launch` preview:
   `ab open "$O/subscribe/confirm?token=cut-short"`. `ab get url` ends
   `/subscribe/expired`; the h1 is "This link has run out", and
   `ab find role link click --name "Sign up again" --exact` lands on `/#signup`.
4. **By hand, with script.** `verify:outbox --to <address>` gives the link;
   `ab open <link>` then `ab snapshot` at once may catch the status before
   the answer, but only `verify:drive` holds the 600 ms reliably.

## Gotchas

- The skeleton holds 600 ms at least, from when the page's script starts: a
  step that screenshots after `load` and a pause misses it. `verify:drive`
  waits for DOM content and looks at once.
- The answer's words arrive in a staged entrance: a screenshot right after
  the heading shows may catch the button mid-blur. That is the entrance, not
  a defect.
- A reload after the answer must show the confirmed page without a POST: a
  reload that posts again means the address bar kept the token.
- `/subscribe/confirm` with no token, or with any token the run did not
  sign, answers 303 to `/subscribe/expired`: it is not the confirm page.
- With script off, the status skeleton is hidden by `@media (scripting)`;
  a visible status there is a defect.
- A run's tokens are signed by a key made at launch: a link from an earlier
  launch is "run out".
