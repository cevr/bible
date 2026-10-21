/**
 * `bun run promise`: the email list's promise, read in what a reader gets
 * (`docs/lessons.md` `email-cadence-limits`). The script builds the app
 * fresh first; the gate runs the check alone on turbo's build, and the check
 * refuses a `dist/` that is not the build of the sources as they stand
 * (`stale:`, from the build's stamp, `./built.ts`).
 *
 * The rule is about what a reader is told, so the check reads the built
 * output, not the sources: every file of `dist/` (each page parsed as a
 * browser parses it), every letter the list sends (its sender, subject, text
 * and HTML, built as the Worker builds them), and the channel kit
 * (`kit/channel.md`, and the words drawn on each picture a viewer sees,
 * `kit/draw.ts` `SEEN`).
 *
 * The check fails closed: every source of words a reader can see or hear is
 * one it reads whole, or the run fails naming it (`unread:`). A page's
 * elements, attributes and meta tags are closed lists, a stylesheet string
 * with a letter in it and any generated content (`content:`) are held word
 * for word, a letter's headers are a closed list, and a character outside
 * plain text (`SEEN_CHARACTERS`) fails, after each string is folded (NFKC,
 * format characters dropped), so a word the reader sees whole is matched
 * whole.
 *
 * In all of it, every sentence that holds a word of mail, of the list or of
 * how often (`NET`) is a promise sentence (`PROMISE_SENTENCES`, each built
 * from `PROMISE`, pinned here) or a sentence held word for word on its
 * artefact (`HELD`). Where a stylesheet can lay two runs of words side by
 * side (each edge between two boxes), the sentence they make joined is held
 * too (`A|B`). Each artefact states the promise as often as `STATED` pins,
 * and every held sentence is still said where it is held.
 * `promise-census.ts` holds the check to every way the promise was lost
 * before, and to every source it refuses, each injected into the sources and
 * built.
 *
 *   bun scripts/promise.ts    # the check alone, on the dist/ there; prints `promise <problem>` per problem, exits 1 on any
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Data, Effect, FileSystem, Match, Option, Path, Schema } from 'effect';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import { SEEN } from '../kit/draw.ts';
import { SERIES } from '../src/content.ts';
import { Address } from '../src/mail/address.ts';
import type { Film } from '../src/mail/films.ts';
import { confirmLetter, filmLetter } from '../src/mail/letters.ts';
import { FROM } from '../src/mail/mailer.ts';
import { builtFiles, readStamp, sourcesHash, STAMP } from './built.ts';

/** The promise, pinned: how often we email, with both its limits. */
const PROMISE = 'one email when each new film is out, and nothing else';

/** The sentences that state the promise, each built from `PROMISE` word for word. */
const PROMISE_SENTENCES: ReadonlyArray<string> = [
  `We send you ${PROMISE}.`,
  `We will send you ${PROMISE}.`,
  `We use it to send you ${PROMISE}.`,
  `Someone, we hope it was you, asked First the Blade for ${PROMISE}.`,
  `You get this because you joined the First the Blade list, which sends ${PROMISE}.`,
];

/**
 * A word of mail, of the list, of what we send, or of how often: a sentence
 * with one of them may say how often or what we email, so it is a promise
 * sentence or held.
 * A word of time is found inside a longer word too (biweekly, semimonthly,
 * tonight, weekends, seasonal). The net is wide on purpose: a sentence it
 * takes by mistake costs a line of `HELD`, and a sentence it misses is not
 * checked at all. A cadence with none of these words is the residual
 * `email-promise-no-net-word`, which a skill line guards.
 */
const NET = new RegExp(
  String.raw`\b(?:${[
    // mail
    String.raw`e-?mail\w*|mail\w*|inbox\w*|newsletters?|letters?|notes?|messages?|digest\w*`,
    String.raw`roundups?|recaps?|bulletins?|dispatch\w*|editions?|issues?`,
    String.raw`send\w*|sent|writ(?:e|es|ing|ten)|wrote|hear(?:s|d|ing)?|touch|notif\w*|updates?|reach(?:es)? you`,
    // what we send, beside the films
    String.raw`news\w*|offers?|promo\w*|announce\w*|deals?|coupons?|discount\w*|sales?|specials?|extras?`,
    String.raw`bonus\w*|freebies?|gifts?|alerts?|reminders?|invit\w*|tips?|surveys?|podcasts?|products?|merch\w*|recipes?`,
    // the list
    String.raw`lists?|join\w*|subscri\w*|sign(?:ed|s|ing)?[- ]?ups?|members?\w*`,
    // a word of time, inside any word
    String.raw`\w*(?:week|daily|dailies|day|month|year|night|quarter|fortnight|annual|season|hour|minute)\w*`,
    String.raw`\w*(?:morning|evening|noon|tomorrow|morrow|summer|winter|autumn|time|period|frequen|occasion|regular|schedul|routine|cadence)\w*`,
    // how often
    String.raw`every\w*|each|per|often\w*|again|once|twice|thrice|whenever|now and then`,
    String.raw`seldom|rarely|always|never|soon\w*|later|christmas|easter`,
  ].join('|')})\b`,
  'i',
);

/** The runs a join is named by: a `|` at each break where a stylesheet can lay two runs side by side. */
const joined = (...runs: ReadonlyArray<string>) => runs.join('|');

/** The skip link and the header's links, between a page's title and its first words. */
const HEADER = [
  ...['Skip to content', 'First the Blade', 'Main', 'Series', 'About', 'Subscribe on YouTube'],
  'Menu',
];
/** A page's title (its tab's words), run on through its header into its first words. */
const opening = (tab: string, ...runs: ReadonlyArray<string>) => joined(tab, ...HEADER, ...runs);
/** A page's tab's words, from its title. */
const titled = (title: string) => `${title} · First the Blade`;
/** The footer's words, after a page's last ones. */
const FOOTER = [
  ...['Site', 'Home', 'Series', 'About', 'YouTube', 'Instagram', 'Facebook', 'Privacy'],
  ...['Scripture quotations from the King James Version', '© 2026'],
];
/** A page's last words, run on into its footer. */
const closing = (...runs: ReadonlyArray<string>) => joined(...runs, ...FOOTER);
/** The night close's verse, which the net takes ("night and day"). */
const NIGHT_VERSE =
  '“And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.”';

/** The header's link, on every page. */
const PAGE: ReadonlyArray<string> = ['Subscribe on YouTube'];

/** The sign-up form in the night close, on every page that carries it. */
const SIGNUP: ReadonlyArray<string> = [
  'Email me new films',
  'Or get them by email',
  'See each new film',
  'Subscribe to the channel on YouTube: @firsttheblade',
  'Your email address',
  NIGHT_VERSE,
  joined(
    ...['Mark 4:27', 'See each new film', 'Subscribe to the channel on YouTube: @firsttheblade'],
    ...['Subscribe on YouTube', 'Or get them by email', 'Your email address', 'Email me new films'],
    ...['Leave this empty', `We send you ${PROMISE}.`],
  ),
];

/**
 * Every other sentence the net takes, word for word, by the artefact it is
 * held on (its kind, as `STATED` names it). None of them says how often we
 * email: a sentence that does is a promise sentence. A sentence changed,
 * added, moved or removed here is a change to what the site tells a reader
 * about its email, and a review reads it as one.
 */
const HELD = new Map<string, ReadonlyArray<string>>(
  Object.entries({
    'dist/404.html': [
      ...PAGE,
      opening(titled('Page not found'), 'Page not found', 'There is no page here.'),
    ],
    'dist/about.html': [
      ...PAGE,
      ...SIGNUP,
      'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
      'Every verse is quoted from the King James Version.',
      'So each series starts at the beginning and builds from there.',
      opening(
        titled('About'),
        'About the channel',
        'What it is',
        'First the Blade is a new YouTube channel of short films and talks about the Bible.',
      ),
      joined('No talks out yet', NIGHT_VERSE),
      joined(
        'The name',
        'The name comes from a parable Jesus told:',
        'And he said, So is the kingdom of God, as if a man should cast seed into the ground;',
        'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
      ),
    ],
    'dist/assets/client.css': ['Newsreader', 'Times New Roman'],
    'dist/index.html': [
      ...PAGE,
      ...SIGNUP,
      'Every verse is quoted from the King James Version.',
      opening(
        'First the Blade',
        'First the Blade',
        '“For the earth bringeth forth fruit of herself; first the blade, then the ear, after that the full corn in the ear.”',
      ),
      joined('More about the channel', NIGHT_VERSE),
    ],
    'dist/llms.txt': [
      'Privacy · First the Blade: What the First the Blade email list keeps about you, and how to leave it.',
    ],
    'dist/privacy.html': [
      ...PAGE,
      ...SIGNUP,
      'After you leave, we keep your address only to mark it as left, so that no film is sent to it.',
      'Every email has a link at the bottom to leave the list.',
      'If you have a question about the list or your address, email us.',
      'If you join the email list, we keep your email address, whether you have confirmed it, when you signed up, confirmed or left, and which films we have emailed you.',
      'If you sign up and never confirm, we delete your address, and everything we kept with it, thirty days later.',
      'It is stored on Cloudflare, which also sends the emails for us.',
      'Most mail apps also show an unsubscribe button.',
      'Press either one and we will not email you again.',
      'The emails have no tracking, so we do not know if you open them or which links you click.',
      'To stop abuse, the sign-up form counts how many tries come from one connection each minute.',
      'We do not sell, rent or share the list.',
      'What the First the Blade email list keeps about you, and how to leave it.',
      'Write to us',
      opening(
        titled('Privacy'),
        'Privacy',
        'What we keep',
        'If you join the email list, we keep your email address, whether you have confirmed it, when you signed up, confirmed or left, and which films we have emailed you.',
      ),
      joined('Why', `We use it to send you ${PROMISE}.`),
      joined('How to leave', 'Every email has a link at the bottom to leave the list.'),
      joined('Write to us', 'If you have a question about the list or your address, email us.'),
      joined('hello@firsttheblade.com', NIGHT_VERSE),
    ],
    'dist/series/dwell-in-the-land.html': [
      ...PAGE,
      ...SIGNUP,
      opening(
        titled('Dwell in the Land'),
        'Dwell in the Land',
        'Country living · Cut-paper films',
        'About the series',
        '“Trust in the LORD, and do good; so shalt thou dwell in the land, and verily thou shalt be fed.”',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/series/health-and-cure.html': [
      ...PAGE,
      ...SIGNUP,
      'Each talk takes one remedy, or one question, and ends with what you can do about it at home.',
      opening(
        titled('Health and Cure'),
        'Health and Cure',
        'Health · Talks',
        'About the series',
        '“Behold, I will bring it health and cure, and I will cure them, and will reveal unto them the abundance of peace and truth.”',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/series/taught-of-the-lord.html': [
      ...PAGE,
      ...SIGNUP,
      opening(
        titled('Taught of the Lord'),
        'Taught of the Lord',
        'Christian education · Talks',
        'About the series',
        '“And all thy children shall be taught of the LORD; and great shall be the peace of thy children.”',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/series/the-path-of-the-just.html': [
      ...PAGE,
      ...SIGNUP,
      'Each film builds on the ones before it, and every one comes back to the cross.',
      'The Bible teaches some things first and saves others for later, when we are ready for them.',
      'These films go in that order, one short film at a time.',
      '“But the path of the just is as the shining light, that shineth more and more unto the perfect day.”',
      opening(
        titled('The Path of the Just'),
        'The Path of the Just',
        'Theology · Cut-paper films',
        'About the series',
        '“But the path of the just is as the shining light, that shineth more and more unto the perfect day.”',
      ),
      joined(
        'Proverbs 4:18',
        'The Bible teaches some things first and saves others for later, when we are ready for them.',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/subscribe/address.html': [
      ...PAGE,
      'Check your email address',
      'Check your email address · First the Blade',
      'Please check it and try again.',
      'Sign up again',
      'That does not look like an email address.',
      opening(
        titled('Check your email address'),
        'Check your email address',
        'That does not look like an email address.',
      ),
      closing('Sign up again'),
    ],
    'dist/subscribe/busy.html': [
      ...PAGE,
      'Sign up again',
      'Too many sign-ups came from your connection just now.',
      'Wait a minute, then try again.',
      opening(
        titled('Too many tries'),
        'Too many tries',
        'Too many sign-ups came from your connection just now.',
      ),
      closing('Sign up again'),
    ],
    'dist/subscribe/check.html': [
      ...PAGE,
      'Check your inbox',
      'Check your inbox · First the Blade',
      'If nothing comes in a few minutes, check your spam folder.',
      'If this address is not on the list yet, we are sending it an email now.',
      'Open the link inside to join.',
      'We will not send another one for an hour.',
      opening(
        titled('Check your inbox'),
        'Check your inbox',
        'If this address is not on the list yet, we are sending it an email now.',
      ),
    ],
    'dist/subscribe/confirm.html': [
      ...PAGE,
      'Confirm my email',
      'Confirm your email',
      'Confirm your email · First the Blade',
      'Confirming your email',
      'Press the button to join.',
      opening(
        titled('Confirm your email'),
        'Confirming your email',
        'Confirm your email',
        'Press the button to join.',
      ),
      closing('Confirm my email'),
    ],
    'dist/subscribe/confirmed.html': [
      ...PAGE,
      'You are on the list',
      'You are on the list · First the Blade',
      'You can leave at any time, from the link in any of our emails.',
      opening(titled('You are on the list'), 'You are on the list', 'Thank you.'),
    ],
    'dist/subscribe/expired.html': [
      ...PAGE,
      'A confirm link works for seven days, and only the newest one works.',
      'Sign up again',
      'Sign up again and we will send you a new link.',
      opening(
        titled('This link has run out'),
        'This link has run out',
        'A confirm link works for seven days, and only the newest one works.',
      ),
      closing('Sign up again'),
    ],
    'dist/unsubscribe.html': [
      ...PAGE,
      'Leave the list',
      'Leave the list · First the Blade',
      'Leave the list?',
      'Press the button and we will stop emailing you.',
      opening(titled('Leave the list'), 'Leave the list?'),
      closing('Leave the list'),
    ],
    'dist/unsubscribe/done.html': [
      ...PAGE,
      'If you change your mind, you can sign up again at the bottom of any page.',
      'We will not email you again.',
      'You have left the list',
      'You have left the list · First the Blade',
      opening(
        titled('You have left the list'),
        'You have left the list',
        'We will not email you again.',
      ),
    ],
    'dist/unsubscribe/invalid.html': [
      ...PAGE,
      'To leave the list, use the link at the bottom of any of our emails, or your mail app’s unsubscribe button.',
      opening(
        titled('This link does not work'),
        'This link does not work',
        'Part of it may have been lost when it was copied.',
      ),
    ],
    'letter confirm html': [
      'Confirm my email',
      'Confirm your email for First the Blade',
      'The link works for seven days.',
      'Times New Roman',
      'We will not send any films to this address unless the link is opened.',
      joined('Confirm my email', 'The link works for seven days.'),
      joined(
        'Confirm your email for First the Blade',
        'Hello,',
        `Someone, we hope it was you, asked First the Blade for ${PROMISE}.`,
      ),
    ],
    'letter confirm text': [
      'Confirm your email for First the Blade',
      'The link works for seven days.',
      'We will not send any films to this address unless the link is opened.',
      'https://firsttheblade.com/subscribe/confirm?token=c.token',
    ],
    'letter film html': [
      'Leave the list',
      'Times New Roman',
      ...SERIES.map((series) =>
        joined(
          'Watch it on YouTube',
          `The series: ${series.name}`,
          `You get this because you joined the First the Blade list, which sends ${PROMISE}.`,
        ),
      ),
    ],
    'letter film text': ['To leave the list: https://firsttheblade.com/unsubscribe?token=u.token'],
    'kit/channel.md': [
      'Add the link only once the site is live, because YouTube shows a dead link on the channel page.',
      'Contact email',
      'Create these in series order, each one Public.',
      'Each film builds on the ones before it, so start with 01.',
      'Every verse is quoted from the King James Version.',
      'First register firsttheblade.com and forward that address to your inbox.',
      'Paste everything from the verse down to "each new film." It is 911 characters long, and YouTube allows 1,000.',
      'Subscribe to see each new film.',
    ],
  }),
);

/**
 * How many promise sentences each artefact holds, by its kind (a page's
 * file in `dist/`, a letter's kind, a kit file): an artefact not named holds
 * none.
 */
const STATED = new Map(
  Object.entries({
    'dist/index.html': 1,
    'dist/about.html': 1,
    'dist/series/the-path-of-the-just.html': 1,
    'dist/series/dwell-in-the-land.html': 1,
    'dist/series/taught-of-the-lord.html': 1,
    'dist/series/health-and-cure.html': 1,
    // The form's fine print, and the "Why" of the privacy page.
    'dist/privacy.html': 2,
    'dist/subscribe/confirm.html': 1,
    'dist/subscribe/confirmed.html': 1,
    'letter confirm text': 1,
    'letter confirm html': 1,
    'letter film text': 1,
    'letter film html': 1,
  }),
);

/**
 * A string as the net reads it: NFKC (a full-width or ligature letter is its
 * plain letter), with every format character and default-ignorable code point
 * taken out (a soft hyphen, a zero-width space or joiner), so a word the
 * reader sees whole is one word here.
 */
const fold = (text: string) =>
  text.normalize('NFKC').replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '');

/**
 * The characters beyond printable ASCII a reader may be shown: typographic
 * marks only, no letter. Any other character (a letter of another script that
 * looks like a Latin one, a mark, a private glyph) fails the run, since the
 * net reads Latin letters.
 */
const SEEN_CHARACTERS = new Set(['“', '”', '‘', '’', '—', '–', '·', '•', '©', '\u00a0']);

/** Each character of a sentence the net cannot read, once per character. */
const characterProblems = (sentence: string): ReadonlyArray<string> =>
  [
    ...new Set(
      [...sentence].filter((char) => !/[\x20-\x7e]/.test(char) && !SEEN_CHARACTERS.has(char)),
    ),
  ].map(
    (char) =>
      `unread: character U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')} in "${sentence}"`,
  );

/** Two runs of words a stylesheet can lay side by side: how the check names them (`A|B`), and the sentence they make. */
interface Join {
  readonly shown: string;
  readonly sentence: string;
}

/** The words a file holds: its runs of words, the sentences its runs make joined, and what in it the check cannot read whole. */
interface Words {
  readonly blocks: ReadonlyArray<string>;
  readonly joins: ReadonlyArray<Join>;
  readonly problems: ReadonlyArray<string>;
}

/** A thing a reader gets, by its kind: its sentences, its joined sentences, and what in it the check cannot read whole. */
interface Artefact {
  readonly name: string;
  readonly kind: string;
  readonly sentences: ReadonlyArray<string>;
  readonly joins: ReadonlyArray<Join>;
  readonly problems: ReadonlyArray<string>;
}

/** A string of a JSON document, as its text spells it. */
const JSON_STRING = /"(?:[^"\\]|\\.)*"/g;
const decodeJsonString = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.String));

/** The strings of a JSON document, keys and values, each its own run of words. */
const jsonWords = (json: string): Words => ({
  blocks: [...json.matchAll(JSON_STRING)].flatMap((m) => Option.toArray(decodeJsonString(m[0]))),
  joins: [],
  problems: [],
});

/**
 * The tokens of a stylesheet that matter here: a comment and a `url()` read
 * as nothing, a string (any of them can be drawn as text: `content`, a
 * custom property, `quotes`) reads as its words, an `attr()` draws an
 * attribute's words, which the check does not follow, and an `@import` or
 * `@counter-style` brings words the check does not read.
 */
const CSS_TOKENS =
  /\/\*[\s\S]*?\*\/|\burl\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\s*\)|"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|\battr\(\s*([\w-]+)|(@import|@counter-style)\b/gi;

/** Each `content:` declaration of a stylesheet, its comments taken out: the value it draws. */
const CSS_CONTENT =
  /(?<=(?:^|[{;])\s*)content\s*:\s*((?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|[^;}"'])*)/gi;

/**
 * The stylesheet strings with a letter in them that draw no words: the font
 * names and font words the site's and the letters' stylesheets name. Any other
 * string with a letter fails the run (`unread: CSS string`), since a custom
 * property or `quotes` can draw it.
 */
const CSS_STRINGS = new Set(['Newsreader', 'Times New Roman', 'opsz', 'woff2']);

/**
 * The generated content the site draws, held word for word: a `content:`
 * value with anything but strings with no letter, `none` or `normal` in it
 * fails the run (`unread: content:`) unless it is here, since the check does
 * not resolve which element its selector draws it beside.
 */
const GENERATED = new Set<string>([]);

/** A stylesheet string's characters, its escapes (`\\201C `, `\\'`, a backslash and a line) spelled out. */
const cssUnescape = (text: string) =>
  text.replace(/\\([\da-f]{1,6}\s?|[\s\S])/gi, (_all, escaped: string) =>
    Match.value(escaped).pipe(
      Match.when(
        (code) => /^[\da-f]/i.test(code),
        (code) => String.fromCodePoint(Number.parseInt(code.trim(), 16)),
      ),
      Match.when('\n', () => ''),
      Match.orElse((char) => char),
    ),
  );

/** Whether a `content:` value draws no letter: strings with no letter, `none` or `normal`. */
const drawsNoLetter = (value: string) =>
  [...value.matchAll(/"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'/g)].every(
    (m) => !/\p{L}/u.test(fold(cssUnescape(m[1] ?? m[2] ?? ''))),
  ) &&
  /^(?:none|normal|)$/i.test(
    value
      .replace(/"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/g, '')
      .replace(/!important/i, '')
      .trim(),
  );

/** The strings of a stylesheet, each its own run of words, and what in it draws words the check does not read. */
const cssWords = (css: string): Words => {
  const tokens = [...css.matchAll(CSS_TOKENS)];
  const strings = tokens.flatMap((m) =>
    Option.toArray(Option.map(Option.fromNullishOr(m[1] ?? m[2]), (s) => fold(cssUnescape(s)))),
  );
  const content = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(CSS_CONTENT)].map((m) =>
    (m[1] ?? '').trim(),
  );
  return {
    blocks: strings,
    joins: [],
    problems: [
      ...tokens.flatMap((m) =>
        Option.toArray(Option.map(Option.fromNullishOr(m[3]), (name) => `unread: attr(${name})`)),
      ),
      ...tokens.flatMap((m) =>
        Option.toArray(
          Option.map(Option.fromNullishOr(m[4]), (rule) => `unread: ${rule.toLowerCase()}`),
        ),
      ),
      ...strings
        .filter((s) => /\p{L}/u.test(s) && !CSS_STRINGS.has(s))
        .map((s) => `unread: CSS string "${s}"`),
      ...content
        .filter((value) => !drawsNoLetter(value) && !GENERATED.has(value))
        .map((value) => `unread: content: ${value}`),
    ],
  };
};

/** A line's end, a break between two runs, as the joined reading marks it: with no space, and with one. */
const BREAK = '\ue000';
const SPACED_BREAK = '\ue001';

/**
 * The sentences runs of words make joined: the text, its breaks marked, cut
 * at each sentence's end (a stop and a space or a break). A sentence that
 * spans a break is a join, named with a `|` at each break.
 */
const joinsOf = (marked: string): ReadonlyArray<Join> =>
  marked
    .split(/(?<=[.?!]["”’')\]]*)[\s\ue000\ue001]+/)
    .filter((sentence) => /[\ue000\ue001]/.test(sentence))
    .map((sentence) => ({
      shown: tidy(sentence.replaceAll(SPACED_BREAK, ' | ').replaceAll(BREAK, '|')),
      sentence: tidy(sentence.replaceAll(SPACED_BREAK, ' ').replaceAll(BREAK, '')),
    }));

/** A sentence's whitespace collapsed, and no space before its stops. */
const tidy = (sentence: string) =>
  sentence
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:?!])/g, '$1')
    .trim();

/**
 * The runs of words of a Markdown or plain text file: each line, its marks
 * taken off. Plain text has no stylesheet, so its lines are never joined:
 * each is read where it stands, as a reader reads it.
 */
const textWords = (text: string): Words => ({
  blocks: text.split('\n').map((line) =>
    line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|`/g, '')
      .replace(/^\s*(?:#+|-|\d+\.)\s+/, '')
      .replace(/\|/g, '\n'),
  ),
  joins: [],
  problems: [],
});

/**
 * The HTML elements a browser lays out as a box of their own (the HTML
 * standard's rendering section, display other than inline): their edges end
 * a run of words. Every other element joins the words beside it, as an
 * inline element does.
 */
const BLOCKS = new Set([
  ...['html', 'head', 'title', 'body', 'address', 'blockquote', 'center', 'dialog', 'div'],
  ...['figure', 'figcaption', 'footer', 'form', 'header', 'hr', 'legend', 'listing', 'main'],
  ...['p', 'plaintext', 'pre', 'search', 'xmp', 'article', 'aside', 'hgroup', 'nav'],
  ...['section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dir', 'dd', 'dl', 'dt', 'menu', 'ol'],
  ...['ul', 'li', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr'],
  ...['td', 'th', 'fieldset', 'details', 'summary', 'optgroup', 'option', 'br', 'video'],
]);

/**
 * The HTML elements whose words the check reads whole: their text, and the
 * attributes it reads. Any other element (an `iframe`, an `object`, a
 * `canvas`, a `video` and its tracks, a custom element) draws words from
 * somewhere the check does not read, so it fails the run.
 */
const HTML_ELEMENTS = new Set([
  ...[...BLOCKS].filter((tag) => tag !== 'video'),
  ...['meta', 'link', 'style', 'script', 'noscript', 'template', 'base'],
  ...['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark'],
  ...['q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'],
  ...['del', 'ins', 'ruby', 'rt', 'rp', 'picture', 'source', 'img', 'button', 'datalist'],
  ...['input', 'label', 'meter', 'output', 'progress', 'select', 'textarea'],
]);
/** The SVG elements whose words the check reads: shapes draw none, and text, a title or a description is text. */
const SVG_ELEMENTS = new Set([
  ...['svg', 'g', 'defs', 'clippath', 'mask', 'path', 'circle', 'ellipse', 'line', 'rect'],
  ...['polygon', 'polyline', 'lineargradient', 'radialgradient', 'stop', 'symbol'],
  ...['title', 'desc', 'text', 'tspan', 'textpath', 'a'],
]);
/** The sitemap's elements, which a search engine reads, not a person. */
const XML_ELEMENTS = new Set(['html', 'head', 'body', 'urlset', 'url', 'loc', 'lastmod']);
/** The SVG elements that join the words beside them; every other SVG or MathML element ends a run. */
const SVG_INLINE = new Set(['tspan', 'textpath', 'a']);
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The attributes whose words a reader sees or hears. */
const SEEN_ATTRIBUTES = new Set([
  ...['alt', 'title', 'placeholder', 'value', 'label', 'abbr', 'download'],
  ...['aria-label', 'aria-description', 'aria-roledescription', 'aria-placeholder'],
  ...['aria-valuetext', 'aria-braillelabel', 'aria-brailleroledescription'],
]);
/**
 * The attributes no reader sees or hears as words: names, links, layout,
 * state, and the ids that point a label at words read where they are. Any
 * attribute in neither list fails the run.
 */
const UNSEEN_ATTRIBUTES = new Set([
  ...['action', 'as', 'autocomplete', 'charset', 'class', 'crossorigin', 'fetchpriority', 'for'],
  ...['height', 'href', 'id', 'inputmode', 'lang', 'loading', 'maxlength', 'method', 'name'],
  ...['rel', 'required', 'role', 'sizes', 'src', 'srcset', 'tabindex', 'type', 'width', 'xmlns'],
  ...['aria-busy', 'aria-current', 'aria-hidden', 'aria-labelledby', 'aria-describedby'],
  ...['data-count', 'data-logo', 'style'],
  // SVG drawing
  ...['viewbox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
  ...['clip-path', 'opacity'],
]);

/** The meta tags a page's link card, tab or search result shows, by their name or property: their words are read. */
const SEEN_META = new Set([
  ...['description', 'og:site_name', 'og:title', 'og:description', 'og:image:alt'],
  ...['twitter:title', 'twitter:description', 'twitter:image:alt'],
]);
/** The meta tags whose content no reader sees as words. Any meta tag in neither list fails the run. */
const UNSEEN_META = new Set([
  ...['viewport', 'robots', 'theme-color', 'og:type', 'og:url', 'og:image', 'og:image:width'],
  ...['og:image:height', 'og:locale', 'twitter:card', 'twitter:image'],
]);

/** A text node, or an element's edge: whether it ends a run of words, and whether it opens or closes. */
type Piece = { readonly text: string } | { readonly breaks: boolean; readonly opens: boolean };
/** Where two runs of text meet inside one box, in the text read. */
interface Gap {
  readonly at: number;
}

const isText = (node: DefaultTreeAdapterTypes.Node): node is DefaultTreeAdapterTypes.TextNode =>
  node.nodeName === '#text';
const isTemplate = (
  node: DefaultTreeAdapterTypes.Element,
): node is DefaultTreeAdapterTypes.Template => node.nodeName === 'template' && 'content' in node;

/** Where a sentence ends: a line, or a stop and the space after it. */
const SENTENCE_EDGE = /\n|(?<=[.?!])\s+/;
/** How far either way of a gap its sentence is read. */
const REACH = 600;

/**
 * Each place inside a box where two runs meet with no space between and a
 * stylesheet showing one of them as a box would split a word the net takes
 * whole into words it does not take (`list<span>en</span>` read apart is
 * "list" and "en"). A split at a break is read by its join (`joinsOf`).
 */
const layoutProblems = (text: string, gaps: ReadonlyArray<Gap>): ReadonlyArray<string> =>
  gaps.flatMap(({ at }) => {
    const before =
      text
        .slice(Math.max(0, at - REACH), at)
        .split(SENTENCE_EDGE)
        .at(-1) ?? '';
    const after = text.slice(at, at + REACH).split(SENTENCE_EDGE)[0] ?? '';
    if (before.trim() === '' || after.trim() === '') return [];
    const missed = (NET.test(before) || NET.test(after)) && !NET.test(before + after);
    return [`layout: ${before.trim()}|${after.trim()}`].filter(() => missed);
  });

/** Where the next run of words meets the last: whether a box's edge breaks them, and whether a space stands between. */
interface Edge {
  readonly breaks: boolean;
  readonly spaced: boolean;
}

/**
 * How a document's pieces read: `text`, a line at each break; `marked`, the
 * same with each break marked for the joined reading; and the gaps inside a
 * box where two runs meet with no space.
 */
interface Reading {
  text: string;
  marked: string;
  readonly gaps: Array<Gap>;
}

/** One run of words added to a reading, after the edge before it. */
const addRun = (reading: Reading, edge: Edge, words: string) => {
  const space = edge.spaced || /\s$/.test(reading.text) || /^\s/.test(words);
  if (edge.breaks) {
    reading.text = `${reading.text.trimEnd()}\n${words.trimStart()}`;
    reading.marked = `${reading.marked.trimEnd()}${[BREAK, SPACED_BREAK][Number(space)] ?? BREAK}${words.trimStart()}`;
    return;
  }
  if (!space) reading.gaps.push({ at: reading.text.length });
  const join = [' '].filter(() => edge.spaced && !/\s$/.test(reading.text) && !/^\s/.test(words));
  reading.text += `${join.join('')}${words}`;
  reading.marked += `${join.join('')}${words}`;
};

/** A document's pieces as a reader reads them, its edges between runs breaking or joining them. */
const readingOf = (pieces: ReadonlyArray<Piece>): Reading => {
  const reading: Reading = { text: '', marked: '', gaps: [] };
  let edge: Option.Option<Edge> = Option.none();
  let closed = false;
  pieces.forEach((piece) => {
    if ('breaks' in piece) {
      // Two elements side by side, with no text between (`</a><a>`), are two items: a break.
      const sideBySide = closed && piece.opens;
      closed = !piece.opens;
      const before = Option.getOrElse(edge, () => ({ breaks: false, spaced: false }));
      edge = Option.some({
        breaks: sideBySide || before.breaks || piece.breaks,
        spaced: before.spaced,
      });
      return;
    }
    closed = false;
    const words = fold(piece.text).replace(/\s+/g, ' ');
    if (words === '') return;
    if (words.trim() === '' && Option.isSome(edge)) {
      edge = Option.some({ ...edge.value, spaced: true });
      return;
    }
    if (reading.text === '' || Option.isNone(edge)) {
      reading.text += words;
      reading.marked += words;
    } else {
      addRun(reading, edge.value, words);
    }
    edge = Option.none();
  });
  return reading;
};

/** Which elements a reading of markup reads, and whether every element's edge ends a run (XML). */
interface Markup {
  readonly elements: ReadonlySet<string>;
  readonly breakAll: boolean;
}

/**
 * An HTML page, an SVG or an XML file, parsed as a browser parses it, read as
 * a reader gets it: the text of the document, a run ending at each box's edge,
 * the words of every seen attribute as a run of its own where its element
 * stands, the words of every seen meta tag, the strings of its structured
 * data and of its stylesheets. Comments read as nothing. An element, an
 * attribute or a meta tag the check does not know, an inline script, a
 * stylesheet from elsewhere and a mail link that fills in words fail the run.
 */
const markupWords =
  ({ elements, breakAll }: Markup) =>
  (html: string): Words => {
    const pieces: Array<Piece> = [];
    const blocks: Array<string> = [];
    const problems: Array<string> = [];
    const take = (words: Words) => {
      blocks.push(...words.blocks);
      problems.push(...words.problems);
    };
    const visit = (node: DefaultTreeAdapterTypes.Node): void => {
      if (isText(node)) {
        pieces.push({ text: node.value });
        return;
      }
      if (!('tagName' in node)) {
        if ('childNodes' in node) node.childNodes.forEach(visit);
        return;
      }
      const tag = node.tagName.toLowerCase();
      const html = node.namespaceURI === HTML_NS;
      const known =
        (html && elements.has(tag)) || (node.namespaceURI === SVG_NS && SVG_ELEMENTS.has(tag));
      if (!known) problems.push(`unread: element ${tag}`);
      const attribute = (name: string) =>
        Option.fromNullishOr(node.attrs.find((attr) => attr.name === name)?.value);
      if (tag === 'meta') {
        const named = Option.orElse(attribute('name'), () => attribute('property'));
        Option.match(named, {
          onNone: () => {
            if (node.attrs.some((attr) => attr.name !== 'charset')) problems.push('unread: meta');
          },
          onSome: (name) => {
            if (SEEN_META.has(name)) blocks.push(...Option.toArray(attribute('content')));
            else if (!UNSEEN_META.has(name)) problems.push(`unread: meta ${name}`);
          },
        });
        return;
      }
      const hidden =
        tag === 'input' &&
        Option.exists(attribute('type'), (type) => type.toLowerCase() === 'hidden');
      const seen: Array<string> = [];
      node.attrs.forEach(({ name, value }) => {
        const lower = name.toLowerCase();
        if (SEEN_ATTRIBUTES.has(lower)) {
          if (!(hidden && lower === 'value')) seen.push(value);
        } else if (!UNSEEN_ATTRIBUTES.has(lower)) {
          problems.push(`unread: attribute ${lower} on ${tag}`);
        }
        if (lower === 'style') take(cssWords(value));
        // A mail or text link's query fills in words the reader's app shows (`?subject=`, `?body=`).
        if (lower === 'href' && /^(?:mailto|sms):[^?]*\?/i.test(value)) {
          problems.push(`unread: link words ${value}`);
        }
      });
      if (
        tag === 'link' &&
        Option.exists(attribute('rel'), (rel) => /stylesheet|import/i.test(rel)) &&
        Option.exists(attribute('href'), (href) => /^(?:[a-z]+:)?\/\//i.test(href))
      ) {
        problems.push(`unread: stylesheet ${Option.getOrElse(attribute('href'), () => '')}`);
      }
      const inner = node.childNodes.filter(isText).map((child) => child.value);
      if (tag === 'script') {
        if (Option.exists(attribute('type'), (type) => type.includes('ld+json'))) {
          take(jsonWords(inner.join('')));
        } else if (inner.join('').trim() !== '') {
          problems.push('unread: inline script');
        }
        return;
      }
      if (tag === 'style') {
        take(cssWords(inner.join('')));
        return;
      }
      const breaks = breakAll || (html && BLOCKS.has(tag)) || (!html && !SVG_INLINE.has(tag));
      pieces.push({ breaks, opens: true });
      seen.forEach((text) => {
        pieces.push({ breaks: true, opens: true }, { text }, { breaks: true, opens: false });
      });
      Option.match(Option.liftPredicate(node, isTemplate), {
        onNone: () => node.childNodes,
        onSome: (template) => template.content.childNodes,
      }).forEach(visit);
      pieces.push({ breaks, opens: false });
    };
    visit(parse(html, { scriptingEnabled: false }));
    const reading = readingOf(pieces);
    return {
      blocks: [reading.text, ...blocks],
      joins: joinsOf(reading.marked),
      problems: [...layoutProblems(reading.text, reading.gaps), ...problems],
    };
  };

const htmlWords = markupWords({ elements: HTML_ELEMENTS, breakAll: false });

/** The sentences of runs of words, whitespace collapsed. */
const sentencesOf = (blocks: ReadonlyArray<string>): ReadonlyArray<string> =>
  blocks
    .flatMap((block) => fold(block).split('\n'))
    .map(tidy)
    .flatMap((block) => block.split(/(?<=[.?!])\s+(?=\S)/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

/** An artefact of its words; a character the net cannot read is a problem of it. */
const artefactOf = (name: string, kind: string, words: Words): Artefact => {
  const sentences = sentencesOf(words.blocks);
  return {
    name,
    kind,
    sentences,
    joins: words.joins,
    problems: [...new Set([...words.problems, ...sentences.flatMap(characterProblems)])],
  };
};

/** How a file's text is read into words. */
type Reader = (text: string) => Words;

/**
 * How each kind of file in `dist/` is read, by its extension. Pictures and
 * fonts hold no words a reader reads as text, and the browser script's are
 * the phone menu's, which the served pages print too
 * (`email-promise-browser-script`).
 */
const DIST_READERS = new Map<string, Option.Option<Reader>>([
  ['.html', Option.some(htmlWords)],
  ['.svg', Option.some(htmlWords)],
  ['.xml', Option.some(markupWords({ elements: XML_ELEMENTS, breakAll: true }))],
  ['.css', Option.some(cssWords)],
  ['.txt', Option.some(textWords)],
  ['.webmanifest', Option.some(jsonWords)],
  ...['.webp', '.jpg', '.png', '.ico', '.woff2', '.js'].map(
    (extension) => [extension, Option.none<Reader>()] as const,
  ),
]);

/** A built file's kind: its path, the build's content hash taken off, so a kind outlives a change of its bytes. */
const distKind = (file: string) => file.replace(/^(dist\/assets\/.*)-[\w-]{8}(?=\.\w+$)/, '$1');

/** What was read: the artefacts, and the files no reader is set for. */
interface Read {
  readonly artefacts: ReadonlyArray<Artefact>;
  readonly unread: ReadonlyArray<string>;
}

/** Every file of `dist/`, read by its kind. */
const distArtefacts = Effect.fn('Promise.dist')(function* (dist: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = (yield* fs.readDirectory(dist, { recursive: true })).sort();
  const read = yield* Effect.forEach(entries, (entry) =>
    Effect.gen(function* () {
      const full = path.join(dist, entry);
      const file = `dist/${entry}`;
      if ((yield* fs.stat(full)).type !== 'File' || entry === STAMP) {
        return { artefacts: [], unread: [] };
      }
      const reader = Option.fromNullishOr(DIST_READERS.get(path.extname(entry)));
      if (Option.isNone(reader)) return { artefacts: [], unread: [file] };
      if (Option.isNone(reader.value)) return { artefacts: [], unread: [] };
      const text = yield* fs.readFileString(full);
      return {
        artefacts: [artefactOf(file, distKind(file), reader.value.value(text))],
        unread: [],
      };
    }),
  );
  return {
    artefacts: read.flatMap(({ artefacts }) => artefacts),
    unread: read.flatMap(({ unread }) => unread),
  } satisfies Read;
});

const ORIGIN = 'https://firsttheblade.com';
const TO = Address.make('reader@example.com');

/**
 * A film to come in each series, beside every film the site lists, so each
 * series' film letter is read before its first film is out.
 */
const FIXTURE_FILMS: ReadonlyArray<Film> = SERIES.map((series) => ({
  ref: `${series.id}/00`,
  series,
  episode: {
    no: '00',
    title: 'A film to come',
    youtubeId: 'film-to-come',
    published: '2026-11-01',
    summary: 'A summary of a film to come.',
  },
}));

/**
 * The headers a letter carries beyond the sender's own, which no reader reads
 * as words (a mail app draws its own unsubscribe button from them). Any
 * other header fails the run.
 */
const LETTER_HEADERS = new Set(['List-Unsubscribe', 'List-Unsubscribe-Post']);

/**
 * Every letter the list sends, as the Worker builds them: who it is from
 * (`FROM`, which every inbox shows), the confirm letter, and each film's.
 */
const letterArtefacts = (): ReadonlyArray<Artefact> => {
  const films: ReadonlyArray<Film> = [
    ...FIXTURE_FILMS,
    ...SERIES.flatMap((series) =>
      series.episodes.map((episode) => ({ ref: `${series.id}/${episode.no}`, series, episode })),
    ),
  ];
  const letters = [
    {
      name: 'letter confirm',
      kind: 'letter confirm',
      letter: confirmLetter(TO, ORIGIN, 'c.token'),
    },
    ...films.map((film) => ({
      name: `letter film ${film.ref}`,
      kind: 'letter film',
      letter: filmLetter(TO, ORIGIN, film, 'u.token'),
    })),
  ];
  return [
    artefactOf('letter sender', 'letter sender', {
      blocks: [FROM.name, FROM.email],
      joins: [],
      problems: [],
    }),
    ...letters.flatMap(({ name, kind, letter }) => {
      const text = textWords(letter.text);
      const headers = Object.keys(letter.headers)
        .filter((header) => !LETTER_HEADERS.has(header))
        .map((header) => `unread: letter header ${header}`);
      return [
        artefactOf(`${name} text`, `${kind} text`, {
          ...text,
          blocks: [letter.subject, ...text.blocks],
          problems: [...text.problems, ...headers],
        }),
        artefactOf(`${name} html`, `${kind} html`, htmlWords(letter.html)),
      ];
    }),
  ];
};

/** The section of `kit/channel.md` whose words are pasted where viewers read them. */
const PASTED = /^## The text to paste\n([\s\S]*?)(?=^## )/m;

/** The channel kit: what is pasted (`kit/channel.md`), and the words on each picture a viewer sees. */
const kitArtefacts = Effect.fn('Promise.kit')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const channel = yield* fs.readFileString(path.join(app, 'kit', 'channel.md'));
  const pasted = Option.fromNullishOr(PASTED.exec(channel)?.[1]);
  const pictures = SEEN.map((picture) =>
    artefactOf(path.relative(app, picture.out), 'kit picture', htmlWords(picture.html)),
  );
  return Option.match(pasted, {
    onNone: () => ({
      artefacts: pictures,
      unread: ['kit/channel.md (its section "## The text to paste" is gone)'],
    }),
    onSome: (words) => ({
      artefacts: [artefactOf('kit/channel.md', 'kit/channel.md', textWords(words)), ...pictures],
      unread: [],
    }),
  }) satisfies Read;
});

/** What breaks the promise in what a reader gets. */
const problemsOf = ({ artefacts, unread }: Read): ReadonlyArray<string> => {
  const netted = artefacts.map((artefact) => ({
    ...artefact,
    netted: artefact.sentences.filter((sentence) => NET.test(sentence)),
    joined: [
      ...new Map(
        artefact.joins
          .filter((join) => NET.test(join.sentence) || NET.test(join.shown))
          .map((join) => [join.shown, join] as const),
      ).values(),
    ],
  }));
  const saidOn = (kind: string) =>
    new Set(
      netted
        .filter((artefact) => artefact.kind === kind)
        .flatMap(({ netted: found, joined }) => [...found, ...joined.map((join) => join.shown)]),
    );
  return [
    ...new Set([
      ...unread.map((file) => `unread: ${file}`),
      ...artefacts.flatMap(({ name, problems }) =>
        problems.map((problem) => `${name}: ${problem}`),
      ),
      ...netted.flatMap(({ name, kind, netted: found }) => {
        const held = HELD.get(kind) ?? [];
        return found
          .filter((sentence) => !PROMISE_SENTENCES.includes(sentence) && !held.includes(sentence))
          .map((sentence) => `${name}: unheld: ${sentence}`);
      }),
      ...netted.flatMap(({ name, kind, joined }) => {
        const held = HELD.get(kind) ?? [];
        return joined
          .filter(
            ({ shown, sentence }) => !PROMISE_SENTENCES.includes(sentence) && !held.includes(shown),
          )
          .map(({ shown }) => `${name}: layout: ${shown}`);
      }),
      ...netted.flatMap(({ name, kind, netted: found }) => {
        const stated = found.filter((sentence) => PROMISE_SENTENCES.includes(sentence)).length;
        const pinned = STATED.get(kind) ?? 0;
        return [`${name}: states the promise ${stated} times, not ${pinned}`].filter(
          () => stated !== pinned,
        );
      }),
      ...[...new Set([...STATED.keys(), ...HELD.keys()])]
        .filter((kind) => !artefacts.some((artefact) => artefact.kind === kind))
        .map((kind) => `${kind}: no such artefact`),
      ...[...HELD].flatMap(([kind, held]) => {
        const said = saidOn(kind);
        return held
          .filter((sentence) => !said.has(sentence))
          .map((sentence) => `${kind}: gone: ${sentence}`);
      }),
      ...PROMISE_SENTENCES.filter(
        (sentence) => !netted.some(({ netted: found }) => found.includes(sentence)),
      ).map((sentence) => `gone: ${sentence}`),
    ]),
  ];
};

/**
 * A `dist/` that is not the build of the sources as they stand: no stamp, a
 * stamp of other sources, a file the build did not write (one another build
 * left), one changed since, or one gone (`./built.ts`). The gate reads
 * turbo's build, cached or not, so this is what keeps it from reading a
 * stale one.
 */
const staleProblems = Effect.fn('Promise.stale')(function* (app: string) {
  const stamp = yield* readStamp(app);
  if (Option.isNone(stamp)) return [`stale: dist/${STAMP} is missing; run bun run build`];
  const wrote = stamp.value.files;
  const files = yield* builtFiles(app);
  const sources = yield* sourcesHash(app);
  return [
    ...['stale: dist/ was built from other sources; run bun run build'].filter(
      () => sources !== stamp.value.sources,
    ),
    ...Object.entries(files).flatMap(([file, hash]) =>
      Option.match(Option.fromNullishOr(wrote[file]), {
        onNone: () => [`stale: dist/${file} was not written by its build`],
        onSome: (written) =>
          [`stale: dist/${file} changed after its build`].filter(() => written !== hash),
      }),
    ),
    ...Object.keys(wrote)
      .filter((file) => !(file in files))
      .map((file) => `stale: dist/${file} is gone`),
  ];
});

class PromiseBroken extends Data.TaggedError('PromiseBroken')<{ readonly problems: number }> {
  override get message() {
    return `the email list's promise check found ${this.problems} problem(s)`;
  }
}

const check = Effect.gen(function* () {
  const path = yield* Path.Path;
  const app = path.dirname(import.meta.dir);
  const dist = yield* distArtefacts(path.join(app, 'dist'));
  const kit = yield* kitArtefacts(app);
  const read: Read = {
    artefacts: [...dist.artefacts, ...letterArtefacts(), ...kit.artefacts],
    unread: [...dist.unread, ...kit.unread],
  };
  const problems = [...(yield* staleProblems(app)), ...problemsOf(read)];
  yield* Effect.forEach(problems, (problem) => Console.log(`promise ${problem}`));
  yield* Effect.logInfo('promise.checked').pipe(
    Effect.annotateLogs({ artefacts: read.artefacts.length, problems: problems.length }),
  );
  if (problems.length > 0) return yield* new PromiseBroken({ problems: problems.length });
});

check.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
