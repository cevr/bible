# The outbox

On the local preview no letter leaves the laptop: each one the list would
send is written to `$ROOT/tmp/outbox/<n>.txt`, numbered from 1 at each
launch: its headers (`To:`, `Subject:`, and a film's `List-Unsubscribe`), a
blank line, then its text with the link a person opens. A visitor's inbox is
this folder: the confirm journeys read their link here.

## Sub-features

- `outbox-confirm`: a sign-up's confirm letter, its subject "Confirm your
  email for First the Blade" and its `/subscribe/confirm?token=` link.
- `outbox-film`: a film's letter, its `/unsubscribe?token=` link and
  `List-Unsubscribe` headers (needs a film; see Leave).
- `outbox-quiet`: no letter for a confirmed address, nor a second within the hour.

## How to get to it (user POV)

- Signing up on the preview (Sign up); a film's send (Leave, once a film is listed).

## Driving it with verify:outbox

- **Preconditions:** a running preview (`verify:launch`) and a sign-up.
- **States:** default (letters), empty (a fresh launch: `"letters":[]`).
- **Regression:** `apps/firsttheblade/scripts/verify/verify.test.ts` reads
  letters the preview's own mailer wrote; `apps/firsttheblade/src/mail/letters.test.ts`.

1. **List.** `bun run --cwd apps/firsttheblade verify:outbox --root "$PWD/$ROOT"`
   prints `{"outbox":…,"letters":[{"n":1,"to":…,"subject":…,"kind":"confirm","link":…}]}`.
2. **One address.** Add `--to <address>`: only that address's letters, oldest first.
3. **Open the link.** `ab open <link>`: the Confirm feature.
4. **Proof.** The JSON into `$EVIDENCE/outbox/letters.json`, with each
   token replaced by `<token>` before it is kept.

## Gotchas

- The letter is written after the sign-up's answer: retry for a second
  before calling it missing.
- The outbox and the list are empty at each launch, and a link from an
  earlier launch is "run out" (its key is gone).
- The outbox is the run's own, under its root, never the app's own tmp outbox, which a plain
  `bun run --cwd apps/firsttheblade preview` fills.
