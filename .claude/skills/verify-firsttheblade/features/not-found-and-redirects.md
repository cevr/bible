# Not found and redirects

A visitor who follows a broken link sees the not-found page, with a 404
status, the header and footer, and a way home. A form's answer moves the
visitor on with a 303 (the sign-up to "Check your inbox", the confirm to
"You are on the list", a stale confirm link to "This link has run out").
On Cloudflare, a page asked for with a trailing slash or as its `.html` file
is sent to its clean path (307), and `www.firsttheblade.com`,
firsttheblade.org, firsttheblade.net and their `www` are sent to
`https://firsttheblade.com` (301) with the same path.

## Sub-features

- `not-found`: a path with no page answers the not-found page, 404; `/404` itself is 404 too.
- `method-refused`: a POST to a page answers 405 with `allow: GET, HEAD`.
- `mail-redirects`: the list's 303s (sign-up, confirm, stale link).
- `clean-paths`: Cloudflare's 307 from `/about/` and `/about.html` to `/about` (stage and prod only).
- `host-redirects`: the 301s from the other hosts to firsttheblade.com (prod only).

## How to get to it (user POV)

- A mistyped or stale link to the site.
- Submitting the sign-up form, pressing "Confirm my email", opening a stale confirm link.
- Typing `www.firsttheblade.com`, `firsttheblade.org` or `firsttheblade.net`.

## Driving it with agent-browser

- **Preconditions:** the baseline for `not-found`, `method-refused` and
  `mail-redirects`; a stage (`verify:stage up`) for `clean-paths`; prod,
  read with GET only, for `host-redirects`. The stage is unproven: no `agent-` stage has been deployed by this helper; report its first run as such.
- **States:** error (the 404, the 405). Default for the redirects. The rest n/a.
- **Regression:** `apps/firsttheblade/src/worker/respond.test.ts`,
  `apps/firsttheblade/src/worker/assets.test.ts`,
  `apps/firsttheblade/src/mail/mail.test.ts`.

1. **Not found.** `ab open $O/no-such-page`. The page's h1 is the not-found
   page's, and its links lead home. The status, read without a browser:
   `curl -s -o /dev/null -w '%{http_code}' $O/no-such-page` prints `404`.
2. **Method refused.** `curl -s -o /dev/null -w '%{http_code}' -X POST $O/`
   prints `405`. This reads a refusal; it reaches no state.
3. **Mail redirects.** Driven by Sign up and Confirm: each lands on its
   notice's path (`/subscribe/check`, `/subscribe/confirmed`,
   `/subscribe/expired`).
4. **Clean paths, on a stage.** With the stage's `url` as `$S`:
   `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' $S/about/` prints
   `307 $S/about`; the same for `$S/about.html`, and `$S/index.html` to `$S/`.
5. **Host redirects, prod, GET only.**
   `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://www.firsttheblade.com/`
   prints `301 https://firsttheblade.com/`; `https://firsttheblade.org/about`
   prints `301 https://firsttheblade.com/about`.
6. **Proof.** The `curl` lines into `$EVIDENCE/redirects/statuses.txt`, and
   `ab snapshot` and `ab screenshot` of the not-found page.

## Gotchas

- The local preview has no `auto-trailing-slash`: `/about/` is a 404 there
  and `/about.html` answers 200. Only a stage or prod shows the 307s.
- prod's `workers.dev` host is switched off (404 from Cloudflare): it is not
  a way to reach the site.
- `curl -I` sends HEAD; use GET (`-o /dev/null`) to read what a browser gets.
- Never POST to prod: the list's routes there change real data.
