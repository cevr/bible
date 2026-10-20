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
import { NOTICE_TITLES, type NoticeId, PRIVACY_PATH } from '../pages.ts';
import { MARK } from './art.ts';

/** Where the sign-up form sits on every page that closes at night. */
export const SIGNUP_ID = 'signup';

const SIGNUP_HREF = `/#${SIGNUP_ID}`;

/** The sign-up form, by night: one field, one button, and what joining means. */
export const SignUp = () => (
  <form class="signup" id={SIGNUP_ID} method="post" action={MAIL_ROUTES.subscribe}>
    <label class="signup-label" for="signup-email">
      Or have each one sent to you by email
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
      One email for each new film, and nothing else.{' '}
      <a href={PRIVACY_PATH}>How we keep your address</a>
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
      'If this address is not on the list yet, an email to confirm it is on its way. Open the link in it to join.',
      'If nothing comes in a few minutes, look in your spam folder. A second email is sent only after an hour.',
    ],
    action: HOME,
  },
  confirmed: {
    words: [
      'We will send you one email when each new film is out, and nothing else.',
      'Every email has a link to leave the list, at any time.',
    ],
    action: HOME,
  },
  expired: {
    words: [
      'A link to confirm works for seven days, and only the newest one works. Sign up again and we will send you a fresh one.',
    ],
    action: AGAIN,
  },
  address: {
    words: ['That does not look like an email address. Please check it and try again.'],
    action: AGAIN,
  },
  busy: {
    words: [
      'Too many sign-ups came from your connection in the last minute. Please wait a minute, then try again.',
    ],
    action: AGAIN,
  },
  left: {
    words: [
      'We will send you no more emails.',
      'You can join again at any time, from the foot of any page.',
    ],
    action: HOME,
  },
  badLink: {
    words: [
      'It may have been cut short when it was copied. Use the link at the foot of any email from us, or your mail app’s unsubscribe button.',
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
 * The confirm page. Opening the link in the confirm letter only shows it,
 * since mail scanners open links; in a browser its script presses the button
 * at once (`../client.tsx`), so confirming is one step, and with no script
 * the button is there to press. Its form names no action, so it posts back
 * to the page's own address, the token with it.
 */
export const Confirm = () => (
  <Lost title="Confirm your email">
    <p>Press the button and we will send you one email for each new film, and nothing else.</p>
    <form method="post" id={CONFIRM_FORM_ID}>
      <button class="button" type="submit">
        <span class="button-label">Confirm my email</span>
      </button>
    </form>
  </Lost>
);

/**
 * The leave page. Its form names no action, so it posts back to the page's
 * own address, the token with it.
 */
export const Leave = () => (
  <Lost title="Leave the list?">
    <p>Press the button and we will send you no more emails.</p>
    <form method="post">
      <button class="button" type="submit">
        <span class="button-label">Leave the list</span>
      </button>
    </form>
  </Lost>
);
