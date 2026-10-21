# Privacy

A visitor reads what the email list keeps (the address, when it signed up
and confirmed, which films it was sent), why, how to leave, who sees it, and
the address to write to, `hello@firsttheblade.com`. The page closes at night
with the sign-up form like the others.

## Sub-features

- `privacy-page`: the h1 "Privacy" and its sections "What we keep", "Why",
  "How to leave", "Who sees it", "Write to us".
- `privacy-contact`: the contact address, a `mailto:` link.
- `privacy-signup`: the night close's form at its foot.

## How to get to it (user POV)

- "Privacy" in the footer's Site navigation, on every page.
- "How we keep your address" under the sign-up form.
- Typing `/privacy`.

## Driving it with agent-browser

- **Preconditions:** the baseline.
- **States:** default. The rest are n/a: the page is static.
- **Regression:** `apps/firsttheblade/src/pages.test.ts`.

1. **From the form.** `ab open $O/`, then
   `ab find role link click --name "How we keep your address" --exact`.
   `ab get url` ends `/privacy`; the h1 is "Privacy".
2. **Sections.** `ab snapshot` holds the five level-2 headings above, in order.
3. **Contact.** `ab get attr "a[href^='mailto:']" href` reads
   `mailto:hello@firsttheblade.com`. Do not follow it.
4. **From the footer.** `ab open $O/about`, then the footer's "Privacy": the
   same page.
5. **Proof.** `ab snapshot` and `ab screenshot` into `$EVIDENCE/privacy/`.

## Gotchas

- The header has no Privacy link; it is the footer's (and the form's).
- The contact address forwards to the owner's inbox: never send to it from
  a drive.
