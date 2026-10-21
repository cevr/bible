# Proof: the confirm journeys, run by this skill

The first run of this skill end to end, on the laptop (macOS, Google Chrome),
2026-10-21 (base 54017f2c7). It proves the email list's confirm in place,
merged as 0e9dc24f0 (the page posts its own form and draws the answer over
itself) and 549db804e (it opens on a skeleton), and it shows the same drive
red on the commit before them.

## The run

Run from the repo root as the skill writes it, on port 8590, with the
checkout's own build (no file under the app's `src/` or `public/` changed
after it; the doctor's `head` check held each time). Steps 1 to 4 ran at
8a5b9e159 in `tmp/verify/ftb-proof`; step 5 ran at 4b1df29a1, the commit
that keeps tokens out of a step's URL, in `tmp/verify/ftb-proof2`. The
`files` in each `steps.json` name the scratch root the run wrote to; the
copies kept here sit beside it.

1. `verify:launch`: the ready line is [run/launch/launch.json](run/launch/launch.json).
2. `verify:doctor`: every check passed, load 3.17 on 12 cores, so timings
   hold ([run/launch/doctor.json](run/launch/doctor.json)).
3. Confirm, expired link, by `agent-browser` (session `ftb-proof`, muted):
   `/subscribe/confirm?token=cut-short` lands on `/subscribe/expired`,
   "This link has run out"; "Sign up again" lands on `/#signup`
   ([01-expired.png](run/confirm-expired/01-expired.png),
   [02-sign-up-again.png](run/confirm-expired/02-sign-up-again.png),
   [confirm-expired.webm](run/confirm-expired/confirm-expired.webm), 0.8 s, 24 frames).
4. `verify:stop`: stopped by its recorded PID; the port was free after
   ([run/launch/stop.json](run/launch/stop.json)).
5. `verify:drive confirm confirm-noscript`: passed, exit 0; its own doctor
   read load 2.56 on 12 cores ([run/drive.json](run/drive.json); the
   preview's log is [run/preview.txt](run/preview.txt), kept as `.txt`
   since the repo ignores `*.log`). After it, port
   8590 was free and no preview it launched was left.

### confirm (script on)

| Step      | Seen                                                                                                                                               | Proof                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| sign-up   | `/subscribe/check`, "Check your inbox"                                                                                                             | [01-sign-up.png](run/confirm/01-sign-up.png)                                                |
| letter    | the confirm letter, its link `/subscribe/confirm`                                                                                                  | [02-letter.txt](run/confirm/02-letter.txt) (token kept as `<token>`)                        |
| skeleton  | status `aria-busy=true`, "Confirming your email", grey lines under the mark                                                                        | [03-skeleton.png](run/confirm/03-skeleton.png), [aria](run/confirm/03-skeleton.aria.txt)    |
| confirmed | "You are on the list" drawn in place 831 ms after the page opened (the hold is 600 ms), one load, one POST, the address bar `/subscribe/confirmed` | [04-confirmed.png](run/confirm/04-confirmed.png), [aria](run/confirm/04-confirmed.aria.txt) |
| reload    | the confirmed page as served, no POST                                                                                                              | [05-reload.png](run/confirm/05-reload.png)                                                  |
| again     | a second sign-up of the confirmed address: the log says `subscribe.quiet`, the outbox still holds one letter to it                                 | [06-again.png](run/confirm/06-again.png)                                                    |

Video: [confirm.webm](run/confirm/confirm.webm), 2.12 s, 53 frames. Steps:
[steps.json](run/confirm/steps.json).

### confirm-noscript (script off)

| Step      | Seen                                                                | Proof                                                     |
| --------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| sign-up   | the form posts with no script: the check page                       | [01-sign-up.png](run/confirm-noscript/01-sign-up.png)     |
| letter    | the confirm letter                                                  | [02-letter.txt](run/confirm-noscript/02-letter.txt)       |
| button    | "Confirm your email" and the button "Confirm my email"; no skeleton | [03-button.png](run/confirm-noscript/03-button.png)       |
| confirmed | the press posts, 303 to `/subscribe/confirmed`                      | [04-confirmed.png](run/confirm-noscript/04-confirmed.png) |
| reload    | no POST                                                             | [05-reload.png](run/confirm-noscript/05-reload.png)       |
| again     | `subscribe.quiet`, one letter                                       | [06-again.png](run/confirm-noscript/06-again.png)         |

Video: [confirm-noscript.webm](run/confirm-noscript/confirm-noscript.webm), 1.4 s, 35 frames.

## Red on base

The same drive, from a copy of the app at f9a84776d (the commit before
0e9dc24f0), built and driven with this skill's helpers at 8a5b9e159 on
port 8591: it exits 1 at `skeleton`, as it should. There the page's script
pressed the button, and the browser loaded `/subscribe/confirmed` as a new
page, with no skeleton before it
([base/drive.out.txt](base/drive.out.txt); the page it stopped on,
"You are on the list", is [03-failed.png](base/confirm/03-failed.png) and
[its aria](base/confirm/03-failed.aria.txt);
[steps.json](base/confirm/steps.json);
[confirm.webm](base/confirm/confirm.webm), 7.12 s, 178 frames).

## What this run does not cover

- The Workbox (Linux): no run there yet; `pmset` is absent and Chrome must be
  installed for `verify:drive`.
- A stage: `verify:stage` was not deployed in this run; its name guard is
  tested (`apps/firsttheblade/scripts/verify/verify.test.ts`).
- Leave: unreachable while no series lists a film.
