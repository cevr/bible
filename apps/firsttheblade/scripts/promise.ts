/**
 * `bun run promise`: the email list's promise, read in what a reader gets
 * (`docs/lessons.md` `email-cadence-limits`). The gate runs it after the
 * build.
 *
 * The rule is about what a reader is told, so the check reads the built
 * output, not the sources: every file of `dist/` (each prerendered page's
 * text and the attributes a reader sees, the text files, the manifest), every
 * letter the list sends (its subject, its text and its HTML, built as the
 * Worker builds them), and the channel kit (`kit/channel.md`, and the words
 * drawn on each picture a viewer sees, `kit/draw.ts` `SEEN`).
 *
 * In all of it, every sentence that holds a word of mail, of the list or of
 * how often (`NET`) is a promise sentence (`PROMISE_SENTENCES`, each built
 * from `PROMISE`, pinned here) or a sentence held word for word (`HELD`).
 * Each artefact states the promise as often as `STATED` pins, every held
 * sentence is still said somewhere, and a file of `dist/` no reader here
 * reads fails the run. `promise-census.ts` holds the check to every way the
 * promise was lost before, each injected into the sources and built.
 *
 *   bun run promise    # prints `promise <problem>` per problem; exits 1 on any
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Data, Effect, FileSystem, Option, Path } from 'effect';

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
 * The net is wide on purpose: a sentence it takes by mistake costs a line of
 * `HELD`, and a sentence it misses is not checked at all.
 */
const NET = new RegExp(
  String.raw`\b(?:${[
    // mail
    String.raw`e-?mail\w*|mail\w*|inbox\w*|newsletters?|letters?|notes?|messages?|digest\w*`,
    String.raw`send\w*|sent|writ(?:e|es|ing|ten)|wrote|hear(?:s|d|ing)?|touch|notif\w*|updates?|reach(?:es)? you`,
    // the list
    String.raw`lists?|join\w*|subscri\w*|sign(?:ed|s|ing)?[- ]?ups?|members?\w*`,
    // how often
    String.raw`weekly|daily|monthly|yearly|annual\w*|fortnight\w*|hourly|every\w*|each|per|often`,
    String.raw`regular\w*|again|once|twice|whenever|times?|weeks?|months?|years?|days?|hours?`,
    String.raw`(?:mon|tues|wednes|thurs|fri|satur|sun)days?|now and then|from time to time`,
    String.raw`occasional\w*|frequent\w*|seldom|rarely|always|never|soon|later`,
  ].join('|')})\b`,
  'i',
);

/**
 * Every other sentence the net takes, word for word. None of them says how
 * often we email: a sentence that does is a promise sentence. A sentence
 * changed, added or removed here is a change to what the site tells a reader
 * about its email, and a review reads it as one.
 */
const HELD: ReadonlyArray<string> = [
  'A confirm link works for seven days, and only the newest one works.',
  'Add the link only once the site is live, because YouTube shows a dead link on the channel page.',
  'After you leave, we keep your address only to mark it as left, so that no film is sent to it.',
  'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
  '“And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.”',
  '“But the path of the just is as the shining light, that shineth more and more unto the perfect day.”',
  'Check your email address',
  'Check your email address · First the Blade',
  'Check your inbox',
  'Check your inbox · First the Blade',
  'Confirm my email',
  'Confirm your email',
  'Confirm your email · First the Blade',
  'Confirm your email for First the Blade',
  'Confirming your email',
  'Contact email',
  'Create these in series order, each one Public.',
  'Each film builds on the ones before it, and every one comes back to the cross.',
  'Each film builds on the ones before it, so start with 01.',
  'Each talk takes one remedy, or one question, and ends with what you can do about it at home.',
  'Email me new films',
  'Every email has a link at the bottom to leave the list.',
  'Every verse is quoted from the King James Version.',
  'First register firsttheblade.com and forward that address to your inbox.',
  'https://firsttheblade.com/subscribe/confirm?token=c.token',
  'If this address is not on the list yet, we are sending it an email now.',
  'If you change your mind, you can sign up again at the bottom of any page.',
  'If you have a question about the list or your address, email us.',
  'If you join the email list, we keep your email address, whether you have confirmed it, when you signed up, confirmed or left, and which films we have emailed you.',
  'If you sign up and never confirm, we delete your address, and everything we kept with it, thirty days later.',
  'It is stored on Cloudflare, which also sends the emails for us.',
  'Leave the list',
  'Leave the list · First the Blade',
  'Leave the list?',
  'Most mail apps also show an unsubscribe button.',
  'Open the link inside to join.',
  'Or get them by email',
  'Paste everything from the verse down to "each new film." It is 911 characters long, and YouTube allows 1,000.',
  'Please check it and try again.',
  'Press either one and we will not email you again.',
  'Press the button and we will stop emailing you.',
  'Press the button to join.',
  'Privacy · First the Blade: What the First the Blade email list keeps about you, and how to leave it.',
  'See each new film',
  'Sign up again',
  'Sign up again and we will send you a new link.',
  'So each series starts at the beginning and builds from there.',
  'Subscribe on YouTube',
  'Subscribe to see each new film.',
  'Subscribe to the channel on YouTube: @firsttheblade',
  'That does not look like an email address.',
  'The Bible teaches some things first and saves others for later, when we are ready for them.',
  'The emails have no tracking, so we do not know if you open them or which links you click.',
  'The link works for seven days.',
  'These films go in that order, one short film at a time.',
  'To leave the list, use the link at the bottom of any of our emails, or your mail app’s unsubscribe button.',
  'To leave the list: https://firsttheblade.com/unsubscribe?token=u.token',
  'To stop abuse, the sign-up form counts how many tries come from one connection each minute.',
  'Too many sign-ups came from your connection just now.',
  'Wait a minute, then try again.',
  'We do not sell, rent or share the list.',
  'We will not email you again.',
  'We will not send another one for an hour.',
  'We will not send any films to this address unless the link is opened.',
  'What the First the Blade email list keeps about you, and how to leave it.',
  'Write to us',
  'You are on the list',
  'You are on the list · First the Blade',
  'You can leave at any time, from the link in any of our emails.',
  'You have left the list',
  'You have left the list · First the Blade',
  'Your email address',
];

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

/** A thing a reader gets, by its kind, and its sentences. */
interface Artefact {
  readonly name: string;
  readonly kind: string;
  readonly sentences: ReadonlyArray<string>;
}

/** The named characters a page may spell as an entity. */
const ENTITIES = new Map(
  Object.entries({
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    mdash: '—',
    ndash: '–',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    middot: '·',
    hellip: '…',
  }),
);

/** The character an entity's name (`#x2019`, `#8217`, `rsquo`) spells. */
const character = (name: string): Option.Option<string> =>
  Option.firstSomeOf([
    Option.map(Option.fromNullishOr(/^#x([\da-f]+)$/i.exec(name)?.[1]), (hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    ),
    Option.map(Option.fromNullishOr(/^#(\d+)$/.exec(name)?.[1]), (decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    ),
    Option.fromNullishOr(ENTITIES.get(name.toLowerCase())),
  ]);

const decode = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name: string) =>
    Option.getOrElse(character(name), () => whole),
  );

/**
 * What a tag leaves between the words beside it: nothing for a tag inside a
 * word run, a space for one that parts two words of a run, and a break for
 * any other, which ends a block.
 */
const TAG_GAPS = new Map([
  ...['i', 'em', 'b', 'strong', 'span', 'small', 'abbr', 'cite', 'q', 'mark'].map(
    (tag) => [tag, ''] as const,
  ),
  ...['a', 'br', 'wbr', 'img', 'input', 'sup', 'sub', 'code', 'time'].map(
    (tag) => [tag, ' '] as const,
  ),
]);

/** The attributes whose words a reader sees or hears. */
const SEEN_ATTRIBUTES = /\b(alt|aria-label|title|placeholder)="([^"]*)"/g;
/** The meta tags a page's link card, tab or search result shows. */
const SEEN_META =
  /<meta\s[^>]*(?:name|property)="[^"]*(?:title|description|alt|site_name)"[^>]*>/gi;

/**
 * The runs of words of an HTML page, as a reader gets them: the text of each
 * block, the words of its seen attributes and meta tags, and the strings of
 * its structured data. Comments, scripts and styles read as nothing.
 */
const htmlBlocks = (html: string): ReadonlyArray<string> => {
  const structured = [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].flatMap((m) => jsonStrings(m[1] ?? ''));
  const meta = [...html.matchAll(SEEN_META)].flatMap((tag) =>
    Option.toArray(Option.fromNullishOr(/\bcontent="([^"]*)"/.exec(tag[0])?.[1])),
  );
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '\n')
    .replace(/<meta\b[^>]*>/gi, '\n')
    .replace(/<\/a>\s*<a\b/gi, '</a>\n<a');
  const attributes = [...body.matchAll(SEEN_ATTRIBUTES)].map((m) => m[2] ?? '');
  const text = body.replace(/<\/?([a-z][\w-]*)\b[^>]*>/gi, (_tag, name: string) =>
    Option.getOrElse(Option.fromNullishOr(TAG_GAPS.get(name.toLowerCase())), () => '\n'),
  );
  return [...text.split('\n'), ...attributes, ...meta, ...structured].map(decode);
};

/** The runs of words of a Markdown or plain text file: each line, its marks taken off. */
const textBlocks = (text: string): ReadonlyArray<string> =>
  text.split('\n').map((line) =>
    line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|`/g, '')
      .replace(/^\s*(?:#+|-|\d+\.)\s+/, '')
      .replace(/\|/g, '\n'),
  );

/** The strings of a JSON document. */
const jsonStrings = (json: string): ReadonlyArray<string> =>
  [...json.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => {
    const raw = m[1] ?? '';
    return raw.replace(/\\(["\\/])/g, '$1').replace(/\\n/g, '\n');
  });

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

/** How a file's text is read into runs of words. */
type Reader = (text: string) => ReadonlyArray<string>;

/**
 * How each kind of file in `dist/` is read, by its extension. Pictures and
 * fonts hold no words a reader reads as text, and the browser script's are
 * the phone menu's, which the served pages print too.
 */
const DIST_READERS = new Map<string, Option.Option<Reader>>([
  ['.html', Option.some(htmlBlocks)],
  ['.svg', Option.some(htmlBlocks)],
  ['.xml', Option.some(htmlBlocks)],
  ['.txt', Option.some(textBlocks)],
  ['.webmanifest', Option.some(jsonStrings)],
  ...['.webp', '.jpg', '.png', '.ico', '.woff2', '.js', '.css'].map(
    (extension) => [extension, Option.none<Reader>()] as const,
  ),
]);

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
      const artefact = { name: file, kind: file, sentences: sentencesOf(reader.value.value(text)) };
      return { artefacts: [artefact], unread: [] };
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
  return letters.flatMap(({ name, kind, letter }) => [
    {
      name: `${name} text`,
      kind: `${kind} text`,
      sentences: sentencesOf([letter.subject, ...textBlocks(letter.text)]),
    },
    { name: `${name} html`, kind: `${kind} html`, sentences: sentencesOf(htmlBlocks(letter.html)) },
  ]);
};

/** The section of `kit/channel.md` whose words are pasted where viewers read them. */
const PASTED = /^## The text to paste\n([\s\S]*?)(?=^## )/m;

/** The channel kit: what is pasted (`kit/channel.md`), and the words on each picture a viewer sees. */
const kitArtefacts = Effect.fn('Promise.kit')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const channel = yield* fs.readFileString(path.join(app, 'kit', 'channel.md'));
  const pasted = Option.fromNullishOr(PASTED.exec(channel)?.[1]);
  const pictures = SEEN.map((picture) => ({
    name: path.relative(app, picture.out),
    kind: 'kit picture',
    sentences: sentencesOf(htmlBlocks(picture.html)),
  }));
  return Option.match(pasted, {
    onNone: () => ({
      artefacts: pictures,
      unread: ['kit/channel.md (its section "## The text to paste" is gone)'],
    }),
    onSome: (words) => ({
      artefacts: [
        {
          name: 'kit/channel.md',
          kind: 'kit/channel.md',
          sentences: sentencesOf(textBlocks(words)),
        },
        ...pictures,
      ],
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
  const said = new Set(netted.flatMap(({ netted: found }) => found));
  return [
    ...unread.map((file) => `unread: ${file}`),
    ...netted.flatMap(({ name, netted: found }) =>
      found
        .filter((sentence) => !PROMISE_SENTENCES.includes(sentence) && !HELD.includes(sentence))
        .map((sentence) => `${name}: unheld: ${sentence}`),
    ),
    ...netted.flatMap(({ name, kind, netted: found }) => {
      const stated = found.filter((sentence) => PROMISE_SENTENCES.includes(sentence)).length;
      const pinned = STATED.get(kind) ?? 0;
      return [`${name}: states the promise ${stated} times, not ${pinned}`].filter(
        () => stated !== pinned,
      );
    }),
    ...[...STATED.keys()]
      .filter((kind) => !artefacts.some((artefact) => artefact.kind === kind))
      .map((kind) => `${kind}: no such artefact`),
    ...[...PROMISE_SENTENCES, ...HELD]
      .filter((sentence) => !said.has(sentence))
      .map((sentence) => `gone: ${sentence}`),
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
