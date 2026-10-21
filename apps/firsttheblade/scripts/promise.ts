/**
 * `bun run promise`: the email list's promise, read in what a reader gets
 * (`docs/lessons.md` `email-cadence-limits`). The script builds the app
 * fresh first, so no page from another build is read.
 *
 * The rule is about what a reader is told, so the check reads the built
 * output, not the sources: every file of `dist/` (each page parsed as a
 * browser parses it, its text and every attribute a reader sees or hears, the
 * strings of the stylesheets, the text files, the manifest), every letter the
 * list sends (its subject, its text and its HTML, built as the Worker builds
 * them), and the channel kit (`kit/channel.md`, and the words drawn on each
 * picture a viewer sees, `kit/draw.ts` `SEEN`).
 *
 * In all of it, every sentence that holds a word of mail, of the list or of
 * how often (`NET`) is a promise sentence (`PROMISE_SENTENCES`, each built
 * from `PROMISE`, pinned here) or a sentence held word for word on its
 * artefact (`HELD`). Each artefact states the promise as often as `STATED`
 * pins, every held sentence is still said where it is held, a word the net
 * takes in one layout of a page and not in the other fails (`layout:`), and a
 * file of `dist/` no reader here reads fails the run. `promise-census.ts`
 * holds the check to every way the promise was lost before, each injected
 * into the sources and built.
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
 * A word of mail, of the list, or of how often: a sentence with one of them
 * may say how often we email or write, so it is a promise sentence or held.
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

/** The header's link, on every page. */
const PAGE: ReadonlyArray<string> = ['Subscribe on YouTube'];

/** The sign-up form in the night close, on every page that carries it. */
const SIGNUP: ReadonlyArray<string> = [
  'Email me new films',
  'Or get them by email',
  'See each new film',
  'Subscribe to the channel on YouTube: @firsttheblade',
  'Your email address',
  '“And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.”',
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
    'dist/404.html': [...PAGE],
    'dist/about.html': [
      ...PAGE,
      ...SIGNUP,
      'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
      'Every verse is quoted from the King James Version.',
      'So each series starts at the beginning and builds from there.',
    ],
    'dist/assets/client.css': ['Times New Roman'],
    'dist/index.html': [...PAGE, ...SIGNUP, 'Every verse is quoted from the King James Version.'],
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
    ],
    'dist/series/dwell-in-the-land.html': [...PAGE, ...SIGNUP],
    'dist/series/health-and-cure.html': [
      ...PAGE,
      ...SIGNUP,
      'Each talk takes one remedy, or one question, and ends with what you can do about it at home.',
    ],
    'dist/series/taught-of-the-lord.html': [...PAGE, ...SIGNUP],
    'dist/series/the-path-of-the-just.html': [
      ...PAGE,
      ...SIGNUP,
      'Each film builds on the ones before it, and every one comes back to the cross.',
      'The Bible teaches some things first and saves others for later, when we are ready for them.',
      'These films go in that order, one short film at a time.',
      '“But the path of the just is as the shining light, that shineth more and more unto the perfect day.”',
    ],
    'dist/subscribe/address.html': [
      ...PAGE,
      'Check your email address',
      'Check your email address · First the Blade',
      'Please check it and try again.',
      'Sign up again',
      'That does not look like an email address.',
    ],
    'dist/subscribe/busy.html': [
      ...PAGE,
      'Sign up again',
      'Too many sign-ups came from your connection just now.',
      'Wait a minute, then try again.',
    ],
    'dist/subscribe/check.html': [
      ...PAGE,
      'Check your inbox',
      'Check your inbox · First the Blade',
      'If nothing comes in a few minutes, check your spam folder.',
      'If this address is not on the list yet, we are sending it an email now.',
      'Open the link inside to join.',
      'We will not send another one for an hour.',
    ],
    'dist/subscribe/confirm.html': [
      ...PAGE,
      'Confirm my email',
      'Confirm your email',
      'Confirm your email · First the Blade',
      'Confirming your email',
      'Press the button to join.',
    ],
    'dist/subscribe/confirmed.html': [
      ...PAGE,
      'You are on the list',
      'You are on the list · First the Blade',
      'You can leave at any time, from the link in any of our emails.',
    ],
    'dist/subscribe/expired.html': [
      ...PAGE,
      'A confirm link works for seven days, and only the newest one works.',
      'Sign up again',
      'Sign up again and we will send you a new link.',
    ],
    'dist/unsubscribe.html': [
      ...PAGE,
      'Leave the list',
      'Leave the list · First the Blade',
      'Leave the list?',
      'Press the button and we will stop emailing you.',
    ],
    'dist/unsubscribe/done.html': [
      ...PAGE,
      'If you change your mind, you can sign up again at the bottom of any page.',
      'We will not email you again.',
      'You have left the list',
      'You have left the list · First the Blade',
    ],
    'dist/unsubscribe/invalid.html': [
      ...PAGE,
      'To leave the list, use the link at the bottom of any of our emails, or your mail app’s unsubscribe button.',
    ],
    'letter confirm html': [
      'Confirm my email',
      'Confirm your email for First the Blade',
      'The link works for seven days.',
      'Times New Roman',
      'We will not send any films to this address unless the link is opened.',
    ],
    'letter confirm text': [
      'Confirm your email for First the Blade',
      'The link works for seven days.',
      'We will not send any films to this address unless the link is opened.',
      'https://firsttheblade.com/subscribe/confirm?token=c.token',
    ],
    'letter film html': ['Leave the list', 'Times New Roman'],
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

/** The words a file holds: its runs of words, and what in it the check cannot read whole. */
interface Words {
  readonly blocks: ReadonlyArray<string>;
  readonly problems: ReadonlyArray<string>;
}

/** A thing a reader gets, by its kind: its sentences, and what in it the check cannot read whole. */
interface Artefact {
  readonly name: string;
  readonly kind: string;
  readonly sentences: ReadonlyArray<string>;
  readonly problems: ReadonlyArray<string>;
}

/** A string of a JSON document, as its text spells it. */
const JSON_STRING = /"(?:[^"\\]|\\.)*"/g;
const decodeJsonString = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.String));

/** The strings of a JSON document, keys and values, each its own run of words. */
const jsonWords = (json: string): Words => ({
  blocks: [...json.matchAll(JSON_STRING)].flatMap((m) => Option.toArray(decodeJsonString(m[0]))),
  problems: [],
});

/**
 * The tokens of a stylesheet that matter here: a comment and a `url()` read
 * as nothing, a string (any of them can be drawn as text: `content`, a
 * custom property, `quotes`) reads as its words, and an `attr()` draws an
 * attribute's words, which the check does not follow.
 */
const CSS_TOKENS =
  /\/\*[\s\S]*?\*\/|\burl\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\s*\)|"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|\battr\(\s*([\w-]+)/gi;

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

/** The strings of a stylesheet, each its own run of words. */
const cssWords = (css: string): Words => {
  const tokens = [...css.matchAll(CSS_TOKENS)];
  return {
    blocks: tokens.flatMap((m) =>
      Option.toArray(Option.map(Option.fromNullishOr(m[1] ?? m[2]), cssUnescape)),
    ),
    problems: tokens.flatMap((m) =>
      Option.toArray(Option.map(Option.fromNullishOr(m[3]), (name) => `unread: attr(${name})`)),
    ),
  };
};

/** The runs of words of a Markdown or plain text file: each line, its marks taken off. */
const textWords = (text: string): Words => ({
  blocks: text.split('\n').map((line) =>
    line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|`/g, '')
      .replace(/^\s*(?:#+|-|\d+\.)\s+/, '')
      .replace(/\|/g, '\n'),
  ),
  problems: [],
});

/**
 * The HTML elements a browser lays out as a box of their own (the HTML
 * standard's rendering section, display other than inline): their edges end
 * a run of words. Every other element, one this list misses too, joins the
 * words beside it, as an inline element does.
 */
const BLOCKS = new Set([
  ...['html', 'head', 'title', 'body', 'address', 'blockquote', 'center', 'dialog', 'div'],
  ...['figure', 'figcaption', 'footer', 'form', 'header', 'hr', 'legend', 'listing', 'main'],
  ...['p', 'plaintext', 'pre', 'search', 'xmp', 'article', 'aside', 'hgroup', 'nav'],
  ...['section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dir', 'dd', 'dl', 'dt', 'menu', 'ol'],
  ...['ul', 'li', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr'],
  ...['td', 'th', 'fieldset', 'details', 'summary', 'optgroup', 'option', 'br', 'video'],
]);
/** The SVG elements that join the words beside them; every other SVG or MathML element ends a run. */
const SVG_INLINE = new Set(['tspan', 'textpath', 'a']);
const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** The attributes whose words a reader sees or hears. */
const SEEN_ATTRIBUTES = new Set([
  ...['alt', 'title', 'placeholder', 'value', 'label'],
  ...[
    'aria-label',
    'aria-description',
    'aria-roledescription',
    'aria-placeholder',
    'aria-valuetext',
  ],
]);
/** The meta tags a page's link card, tab or search result shows, by their name or property. */
const SEEN_META = /title|description|alt|site_name/;

/** A text node, or an element's edge: whether it ends a run of words, and whether it opens or closes. */
type Piece = { readonly text: string } | { readonly breaks: boolean; readonly opens: boolean };
/** Where two runs of text meet, in the text read, and whether the reading breaks them there. */
interface Gap {
  readonly at: number;
  readonly breaks: boolean;
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
 * Each gap whose words the net takes in one layout and not in the other. A
 * stylesheet can show a box inline or an inline element as a box, so a gap
 * read as a break may be joined on the screen and a joined one broken. The
 * check reads each gap one way (`BLOCKS`), and the net must take the other
 * way's words too: a word split by a break (`wee</p><p>kly`) or merged by a
 * join (`list<span>en</span>`) is a problem.
 */
const layoutProblems = (text: string, gaps: ReadonlyArray<Gap>): ReadonlyArray<string> =>
  gaps.flatMap(({ at, breaks }) => {
    const before =
      text
        .slice(Math.max(0, at - REACH), at)
        .split(SENTENCE_EDGE)
        .at(-1) ?? '';
    const after = text.slice(at + Number(breaks), at + REACH).split(SENTENCE_EDGE)[0] ?? '';
    if (before.trim() === '' || after.trim() === '') return [];
    const joined = NET.test(before + after);
    const apart = NET.test(before) || NET.test(after);
    const missed = (breaks && joined && !apart) || (!breaks && apart && !joined);
    return [`layout: ${before.trim()}|${after.trim()}`].filter(() => missed);
  });

/**
 * An HTML page, an SVG or an XML file, parsed as a browser parses it, read as
 * a reader gets it: the text of the document, a run ending at each box's edge
 * (at every element when `breakAll`, for XML), the words of every seen
 * attribute and meta tag, the strings of its structured data and of its
 * stylesheets. Comments and scripts read as nothing.
 */
const markupWords =
  (breakAll: boolean) =>
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
      const attribute = (name: string) =>
        Option.fromNullishOr(node.attrs.find((attr) => attr.name === name)?.value);
      const hidden = tag === 'input' && Option.contains(attribute('type'), 'hidden');
      node.attrs.forEach(({ name, value }) => {
        if (SEEN_ATTRIBUTES.has(name) && !hidden) blocks.push(value);
        if (name === 'style') take(cssWords(value));
        if (name === 'srcdoc') problems.push('unread: srcdoc');
      });
      if (tag === 'meta') {
        const named = Option.orElse(attribute('name'), () => attribute('property'));
        if (Option.exists(named, (name) => SEEN_META.test(name))) {
          blocks.push(...Option.toArray(attribute('content')));
        }
        return;
      }
      const inner = node.childNodes.filter(isText).map((child) => child.value);
      if (tag === 'script') {
        if (Option.exists(attribute('type'), (type) => type.includes('ld+json'))) {
          take(jsonWords(inner.join('')));
        }
        return;
      }
      if (tag === 'style') {
        take(cssWords(inner.join('')));
        return;
      }
      const html = node.namespaceURI === HTML_NS;
      const breaks = breakAll || (html && BLOCKS.has(tag)) || (!html && !SVG_INLINE.has(tag));
      pieces.push({ breaks, opens: true });
      Option.match(Option.liftPredicate(node, isTemplate), {
        onNone: () => node.childNodes,
        onSome: (template) => template.content.childNodes,
      }).forEach(visit);
      pieces.push({ breaks, opens: false });
    };
    visit(parse(html, { scriptingEnabled: false }));
    const gaps: Array<Gap> = [];
    let text = '';
    let pending: Option.Option<boolean> = Option.none();
    let closed = false;
    pieces.forEach((piece) => {
      if ('breaks' in piece) {
        // Two elements side by side, with no text between (`</a><a>`), are two items: a break.
        const sideBySide = closed && piece.opens;
        closed = !piece.opens;
        pending = Option.some(sideBySide || Option.getOrElse(pending, () => false) || piece.breaks);
        return;
      }
      closed = false;
      if (piece.text === '') return;
      if (Option.isSome(pending)) {
        gaps.push({ at: text.length, breaks: pending.value });
        if (pending.value) text += '\n';
        pending = Option.none();
      }
      text += piece.text;
    });
    return {
      blocks: [text, ...blocks],
      problems: [...layoutProblems(text, gaps), ...problems],
    };
  };

const htmlWords = markupWords(false);

/** The sentences of runs of words, whitespace collapsed. */
const sentencesOf = (blocks: ReadonlyArray<string>): ReadonlyArray<string> =>
  blocks
    .flatMap((block) => block.split('\n'))
    .map((block) =>
      block
        .replace(/\s+/g, ' ')
        .replace(/ ([.,;:?!])/g, '$1')
        .trim(),
    )
    .flatMap((block) => block.split(/(?<=[.?!])\s+(?=\S)/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

/** An artefact of its words. */
const artefactOf = (name: string, kind: string, words: Words): Artefact => ({
  name,
  kind,
  sentences: sentencesOf(words.blocks),
  problems: words.problems,
});

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
  ['.xml', Option.some(markupWords(true))],
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
      if ((yield* fs.stat(full)).type !== 'File') return { artefacts: [], unread: [] };
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

/** A film beside every film the site lists, so the film letter is read before the first film is out. */
const FIXTURE_FILM: Film = {
  ref: 'path/00',
  series: Option.getOrThrow(Option.fromNullishOr(SERIES.find((series) => series.id === 'path'))),
  episode: {
    no: '00',
    title: 'A film to come',
    youtubeId: 'film-to-come',
    published: '2026-11-01',
    summary: 'A summary of a film to come.',
  },
};

/** Every letter the list sends, as the Worker builds them: the confirm letter, and each film's. */
const letterArtefacts = (): ReadonlyArray<Artefact> => {
  const films: ReadonlyArray<Film> = [
    FIXTURE_FILM,
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
  return letters.flatMap(({ name, kind, letter }) => {
    const text = textWords(letter.text);
    return [
      artefactOf(`${name} text`, `${kind} text`, {
        ...text,
        blocks: [letter.subject, ...text.blocks],
      }),
      artefactOf(`${name} html`, `${kind} html`, htmlWords(letter.html)),
    ];
  });
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
  }));
  const saidOn = (kind: string) =>
    new Set(
      netted.filter((artefact) => artefact.kind === kind).flatMap(({ netted: found }) => found),
    );
  return [
    ...unread.map((file) => `unread: ${file}`),
    ...artefacts.flatMap(({ name, problems }) => problems.map((problem) => `${name}: ${problem}`)),
    ...netted.flatMap(({ name, kind, netted: found }) => {
      const held = HELD.get(kind) ?? [];
      return found
        .filter((sentence) => !PROMISE_SENTENCES.includes(sentence) && !held.includes(sentence))
        .map((sentence) => `${name}: unheld: ${sentence}`);
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
  ];
};

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
  const problems = problemsOf(read);
  yield* Effect.forEach(problems, (problem) => Console.log(`promise ${problem}`));
  yield* Effect.logInfo('promise.checked').pipe(
    Effect.annotateLogs({ artefacts: read.artefacts.length, problems: problems.length }),
  );
  if (problems.length > 0) return yield* new PromiseBroken({ problems: problems.length });
});

check.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
