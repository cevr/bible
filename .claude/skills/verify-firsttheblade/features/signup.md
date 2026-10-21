# Sign up

In the night close at the foot of the home page and every series page, a
visitor types an email address and presses "Email me new films". Every
address gets the same answer, the "Check your inbox" page, whether it is new,
pending, confirmed or a bot's, so the page never tells who is on the list. A
new or pending address is sent one letter to confirm, at most once an hour.
An address the list cannot read leads to "Check your email address", and a
sixth sign-up in a minute from one place to "Too many tries".

## Sub-features

- `signup-new`: a new address; the check page, and one confirm letter in the outbox.
- `signup-again`: the same address within the hour; the check page, and no second letter.
- `signup-address`: an address the browser takes but the list does not (`a@b`); "Check your email address".
- `signup-busy`: the sixth sign-up in a minute; "Too many tries" (429).
- `signup-noscript`: the form posts with script off, the same answers.
- `signup-privacy-link`: "How we keep your address" under the form leads to Privacy.

## How to get to it (user POV)

- The form at the foot of the home page (`/#signup`).
- The same form at the foot of each series page.
- "Sign up again" on the expired-link and address notices (it leads to `/#signup`).

## Driving it with agent-browser

- **Preconditions:** the baseline; a fresh launch when the five-a-minute
  allowance may be spent.
- **States:** default, error (the address and busy notices), empty (the
  field's own `required` check). Loading and open are n/a: the form posts
  and the browser loads the answer.
- **Regression:** `apps/firsttheblade/src/mail/mail.test.ts`,
  `apps/firsttheblade/src/mail/list.test.ts`,
  `apps/firsttheblade/src/mail/letters.test.ts`.

1. **New address.** `ab open $O/`, then
   `ab find role textbox fill "verify-signup@example.com" --name "Or have each one sent to you by email" --exact`
   and `ab find role button click --name "Email me new films" --exact`.
   `ab get url` ends `/subscribe/check`; the h1 is "Check your inbox".
2. **The letter.** `bun run --cwd apps/firsttheblade verify:outbox --root "$PWD/$ROOT" --to verify-signup@example.com`
   lists one letter, `kind` `confirm`, subject "Confirm your email for First the Blade".
3. **Again.** Repeat step 1 with the same address. The same check page;
   `verify:outbox --to` still lists one letter, and `$ROOT/preview.log`
   gains `[mail] subscribe.quiet`.
4. **Not an address.** Fill `a@b` and press the button. The URL ends
   `/subscribe/address`, h1 "Check your email address", and a link "Sign up again".
5. **Too many.** Sign up with new addresses until the sixth in the minute:
   the URL ends `/subscribe` with the h1 "Too many tries".
6. **Proof.** `ab snapshot` and `ab screenshot` into `$EVIDENCE/signup/`
   after each step, and the `verify:outbox` JSON beside them.

## Gotchas

- `ab fill` with a value the browser's `type=email` refuses (`not-an-email`)
  does not submit at all: the browser blocks it. Use `a@b`, which the browser
  takes and the list refuses.
- The answer does not wait for the letter: read the outbox after the check
  page, and retry for a second (`verify:outbox`, or `verify:drive`'s wait).
- The honeypot field ("Leave this empty") is hidden from people; filling it
  is a bot's path, not a visitor's, and is covered by the tests only.
- The allowance is per place and every local request is one place: steps 1
  to 5 spend it. Relaunch for a clean count.
