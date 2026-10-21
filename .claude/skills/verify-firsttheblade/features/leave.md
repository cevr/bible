# Leave

A subscriber leaves the list from the link at the foot of a film's letter:
the page "Leave the list?" has one button, "Leave the list", and its press
answers "You have left the list" (200, never a redirect). A mail app's
one-click unsubscribe sends the same POST. Opening the link alone changes
nothing. A link whose token does not read answers "This link does not work"
(400).

## Sub-features

- `leave-page`: the leave link opens "Leave the list?" with its button.
- `leave-press`: the press answers "You have left the list".
- `leave-twice`: leaving twice is leaving; the same answer.
- `leave-bad-link`: a cut-short link answers "This link does not work".

## How to get to it (user POV)

- The leave link at the foot of a film's letter (`/unsubscribe?token=…`).
- A mail app's unsubscribe button (the letter's `List-Unsubscribe` header):
  not a browser path.

## Driving it with agent-browser

- **Preconditions:** a film's letter in the outbox, which needs a film in a
  series' `episodes` (`apps/firsttheblade/src/content.ts`), a confirmed
  subscriber, and a send to the preview, which no helper offers yet (see
  Gotchas). **No series lists a film yet**, so the
  leave link has no entry point: `leave-page`, `leave-press` and
  `leave-twice` are unreachable, and a run reports them so, never by building
  a token.
- **States:** error (`leave-bad-link`). Default and the rest wait for a film.
- **Regression:** `apps/firsttheblade/src/mail/mail-send.test.ts`,
  `apps/firsttheblade/src/mail/mail.test.ts`.

1. **Bad link.** `ab open "$O/unsubscribe?token=cut-short"`. The h1 is
   "This link does not work"; `ab get url` keeps `/unsubscribe?token=cut-short`.
2. **Leave (once a film is listed and a helper sends to the preview).**
   Confirm an address (Confirm), send the film to the preview's list, take
   the `film` letter's link from `verify:outbox --to <address>`,
   `ab open <link>`: the h1 "Leave the list?".
   `ab find role button click --name "Leave the list" --exact`: the h1 "You
   have left the list", and the URL stays `/unsubscribe?token=…`.
3. **Twice.** `ab back`, press again: the same answer.
4. **Proof.** `ab snapshot` and `ab screenshot` into `$EVIDENCE/leave/` per step.

## Gotchas

- `mail:send` defaults to prod's origin and loads `.env`: never run it in a verify run until a helper owns the send.
- The preview reads no `.env`, so its admin token is made fresh at launch
  and no `mail:send` can name it.
- The leave press answers 200 at the same URL, not a redirect: wait for the
  heading, not for a URL change.
- `/unsubscribe` with no token is the bad-link page (400), not the leave page.
