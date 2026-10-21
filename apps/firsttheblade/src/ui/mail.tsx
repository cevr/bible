/**
 * The email list on the page: the sign-up form in the night close, the
 * notices its routes send people to, and the confirm and leave pages, one
 * button each (the privacy page is with the other pages, in
 * `../views.tsx`). Every form posts to this site with no script
 * (`../mail/routes.ts`), and no page says whether an address is on the list.
 */
import { For } from '@solidjs/web';
import type { JSX } from '@solidjs/web';

import { CONFIRM_FORM_ID, MAIL_ROUTES, SIGNUP_FIELDS } from '../mail/paths.ts';
import { PROMISE } from '../mail/promise.ts';
import { NOTICE_TITLES, type NoticeId, PRIVACY_PATH } from '../pages.ts';
import { MARK } from './art.ts';

/** Where the sign-up form sits on every page that closes at night. */
export const SIGNUP_ID = 'signup';

const SIGNUP_HREF = `/#${SIGNUP_ID}`;

/** The sign-up form, by night: one field, one button, and what joining means. */
export const SignUp = () => (
  <form class="signup" id={SIGNUP_ID} method="post" action={MAIL_ROUTES.subscribe}>
    <label class="signup-label" for="signup-email">
      Or get them by email
    </label>
    <div class="signup-row">
      <input
        class="signup-field"
        id="signup-email"
        type="email"
        name={SIGNUP_FIELDS.email}
        required
        autocomplete="email"
        inputmode="email"
        maxlength="254"
        placeholder="Your email address"
      />
      <button class="button button-night" type="submit">
        <span class="button-label">Email me new films</span>
      </button>
    </div>
    {/* No one sees this field; a bot that fills every field fills it. */}
    <div class="signup-trap" aria-hidden="true">
      <label for="signup-website">Leave this empty</label>
      <input
        id="signup-website"
        type="text"
        name={SIGNUP_FIELDS.honeypot}
        tabindex="-1"
        autocomplete="off"
      />
    </div>
    <p class="signup-fine">
      {`We send you ${PROMISE}.`} <a href={PRIVACY_PATH}>What we do with your address</a>
    </p>
  </form>
);

interface Action {
  readonly href: string;
  readonly label: string;
}

interface NoticeWords {
  readonly words: ReadonlyArray<string>;
  readonly action: Action;
}

const HOME: Action = { href: '/', label: 'Go to the home page' };
const AGAIN: Action = { href: SIGNUP_HREF, label: 'Sign up again' };

/** What each notice says under its title, and where it leads. */
const NOTICES: Readonly<Record<NoticeId, NoticeWords>> = {
  check: {
    words: [
      'If this address is not on the list yet, we are sending it an email now. Open the link inside to join.',
      'If nothing comes in a few minutes, check your spam folder. We will not send another one for an hour.',
    ],
    action: HOME,
  },
  confirmed: {
    words: [
      `Thank you. We will send you ${PROMISE}.`,
      'You can leave at any time, from the link in any of our emails.',
    ],
    action: HOME,
  },
  expired: {
    words: [
      'A confirm link works for seven days, and only the newest one works. Sign up again and we will send you a new link.',
    ],
    action: AGAIN,
  },
  address: {
    words: ['That does not look like an email address. Please check it and try again.'],
    action: AGAIN,
  },
  busy: {
    words: ['Too many sign-ups came from your connection just now. Wait a minute, then try again.'],
    action: AGAIN,
  },
  left: {
    words: [
      'We will not email you again.',
      'If you change your mind, you can sign up again at the bottom of any page.',
    ],
    action: HOME,
  },
  badLink: {
    words: [
      'Part of it may have been lost when it was copied. To leave the list, use the link at the bottom of any of our emails, or your mail app’s unsubscribe button.',
    ],
    action: HOME,
  },
};

interface LostProps {
  readonly title: string;
  readonly children: JSX.Element;
}

/** A short page of one message, laid out as the not-found page is. */
const Lost = (props: LostProps) => (
  <section class="section-band">
    <div class="wrap lost">
      <img src={MARK.large} alt="" width="320" height="320" />
      <h1>{props.title}</h1>
      {props.children}
    </div>
  </section>
);

interface NoticeProps {
  readonly notice: NoticeId;
}

export const Notice = (props: NoticeProps) => {
  const notice = NOTICES[props.notice];
  return (
    <Lost title={NOTICE_TITLES[props.notice]}>
      <For each={notice.words}>{(words) => <p>{words}</p>}</For>
      <a class="button" href={notice.action.href}>
        <span class="button-label">{notice.action.label}</span>
      </a>
    </Lost>
  );
};

/**
 * The confirm page. Opening the link in the confirm letter confirms no one,
 * since mail scanners open links: the confirm is the form's post. In a browser
 * with script the page opens on a quiet skeleton of the notice to come while
 * its script posts the form (`../confirm.ts`), and the answer's words arrive
 * in its place. With no script the skeleton is hidden and the button is there
 * to press (`.confirm-pending`, `.confirm-press`, by `@media (scripting)`).
 * Its form names no action, so it posts back to the page's own address, the
 * token with it.
 */
export const Confirm = () => (
  <>
    <section class="section-band confirm-pending">
      <div class="wrap lost" role="status" aria-busy="true">
        <img src={MARK.large} alt="" width="320" height="320" />
        <span class="visually-hidden">Confirming your email</span>
        <span class="skeleton skeleton-heading" aria-hidden="true" />
        <span class="skeleton-lines" aria-hidden="true">
          <span class="skeleton skeleton-line" />
          <span class="skeleton skeleton-line" />
        </span>
        <span class="skeleton-lines" aria-hidden="true">
          <span class="skeleton skeleton-line" />
          <span class="skeleton skeleton-line" />
        </span>
        <span class="skeleton skeleton-button" aria-hidden="true" />
      </div>
    </section>
    <div class="confirm-press">
      <Lost title="Confirm your email">
        <p>{`Press the button to join. We will send you ${PROMISE}.`}</p>
        <form method="post" id={CONFIRM_FORM_ID}>
          <button class="button" type="submit">
            <span class="button-label">Confirm my email</span>
          </button>
        </form>
      </Lost>
    </div>
  </>
);

/**
 * The leave page. Its form names no action, so it posts back to the page's
 * own address, the token with it.
 */
export const Leave = () => (
  <Lost title="Leave the list?">
    <p>Press the button and we will stop emailing you.</p>
    <form method="post">
      <button class="button" type="submit">
        <span class="button-label">Leave the list</span>
      </button>
    </form>
  </Lost>
);
