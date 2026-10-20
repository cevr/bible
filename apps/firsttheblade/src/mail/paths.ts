/**
 * Where the list lives on the site, in one place: the Worker's routes
 * (`./routes.ts`) answer at these paths and read these fields, and the
 * prerender writes the pages the routes send people to (`../pages.ts`) and
 * the form that posts to them (`../ui/mail.tsx`).
 */

/** The routes the Worker answers before it looks for a file. */
export const MAIL_ROUTES = {
  /** POST: the sign-up form. */
  subscribe: '/subscribe',
  /** GET: the link in the confirm letter. */
  confirm: '/subscribe/confirm',
  /** GET: the leave page for a token; POST: leave (the page's button, or a mail app's one click). */
  unsubscribe: '/unsubscribe',
  /** POST, with the admin token: send a film to the list (`bun run mail:send`). */
  send: '/mail/send',
} as const;

/** The pages the routes answer with, each written by the prerender. */
export const MAIL_PAGES = {
  /** After a sign-up, whoever signed up. */
  check: '/subscribe/check',
  confirmed: '/subscribe/confirmed',
  /** A confirm link that ran out or was replaced. */
  expired: '/subscribe/expired',
  /** A sign-up whose address is not one. */
  address: '/subscribe/address',
  /** Too many sign-ups from one place at once. */
  busy: '/subscribe/busy',
  /** The one-button page; served only at the unsubscribe route, with its token. */
  leave: '/unsubscribe',
  left: '/unsubscribe/done',
  /** A leave link whose token does not read. */
  badLink: '/unsubscribe/invalid',
} as const;

/** The sign-up form's fields. */
export const SIGNUP_FIELDS = {
  email: 'email',
  /** The honeypot: a field no person sees, which a bot that fills every field fills. */
  honeypot: 'website',
} as const;
