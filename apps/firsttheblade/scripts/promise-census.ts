/**
 * `bun run promise:census`: holds the promise check (`./promise.ts`) to every
 * way the email list's promise was lost before (`docs/lessons.md`
 * `email-cadence-limits`, `email-promise-found-by-phrase`,
 * `email-promise-read-in-sources`, `email-promise-net-whole-words`,
 * `email-promise-tags-split-words`, `email-promise-unread-attributes`,
 * `email-promise-held-anywhere`, and the rewrite's round 2 findings, from
 * `email-promise-invisible-characters` on), and to every source of words it
 * refuses (`email-promise-fails-closed`). Each case injects one into a copy of the
 * app's sources, builds the copy as the gate builds the app, runs the check
 * there, and passes only when the check fails and says each line of the case
 * (a `*` in a line stands for a build's content hash, a `…` for any words).
 * A case whose words the sources no longer hold fails too, so no case goes
 * stale unseen. The gate runs it after the check.
 *
 *   bun run promise:census    # prints `promise-census <case> red` per case; exits 1 when one is not
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Data, Effect, FileSystem, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/**
 * One way the promise was lost, or one source of words the check refuses:
 * the words put in a file of the app (after the build when `after`, so
 * `dist/` is no longer the build of what the app holds), and what the check
 * must say of it.
 */
interface Case {
  readonly name: string;
  readonly file: string;
  readonly find: string;
  readonly put: string;
  readonly said: ReadonlyArray<string>;
  readonly after?: boolean;
}

const CONFIRMED = 'Thank you. We will send you ${PROMISE}.';
const LABEL = '      Or get them by email\n';
const LEAVE_ANY_TIME = "'You can leave at any time, from the link in any of our emails.'";
const NOTICE_WORDS = '<For each={notice.words}>{(words) => <p>{words}</p>}</For>';
const BUTTON =
  '<button class="button button-night" type="submit">\n        <span class="button-label">Email me new films</span>\n      </button>';
const LABEL_CSS = '.signup-label {\n  display: block;';
const LABEL_END = '    </label>\n    <div class="signup-row">';
const THEME_META = '<meta name="theme-color" content={THEME_COLOR} />';
const PAGE_BODY = '`<body style="margin:0;padding:0;background:${PALETTE.paper};">`,';
const ONE_CLICK = "'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',";

/** A case that says one more sentence after the promise, on the confirmed page. */
const confirmedSays = (name: string, sentence: string): Case => ({
  name,
  file: 'src/ui/mail.tsx',
  find: `\`${CONFIRMED}\``,
  put: `\`${CONFIRMED} ${sentence}\``,
  said: [`dist/subscribe/confirmed.html: unheld: ${sentence}`],
});

/** A case whose markup every notice page prints as it is, after its words; the lines are the confirmed page's. */
const noticePrints = (name: string, html: string, said: ReadonlyArray<string>): Case => ({
  name,
  file: 'src/ui/mail.tsx',
  find: NOTICE_WORDS,
  put: `${NOTICE_WORDS}\n      <div innerHTML={String.raw\`${html}\`} />`,
  said: said.map((line) => `dist/subscribe/confirmed.html: ${line}`),
});

/** The census: every trigger of the promise's findings (rounds 2 to 4 of `ftb-copy`, rounds 1 and 2 of its rewrite), and every source the check refuses. */
const CASES: ReadonlyArray<Case> = [
  {
    name: 'r2-M1 the confirmed page drops "and nothing else"',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you. We will email you when each new film is out.'",
    said: ['dist/subscribe/confirmed.html: unheld: We will email you when each new film is out.'],
  },
  {
    name: 'r2-M1 the confirmed page drops the promise whole',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you.'",
    said: ['dist/subscribe/confirmed.html: states the promise 0 times, not 1'],
  },
  {
    name: 'r3-F1 the confirmed page drops "each new film"',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you. We will email you when a new film is out.'",
    said: ['dist/subscribe/confirmed.html: unheld: We will email you when a new film is out.'],
  },
  {
    name: 'r3-F1 the film letter says "one email per film"',
    file: 'src/mail/letters.ts',
    find: 'which sends ${PROMISE}.`',
    put: 'which sends one email per film.`',
    said: [
      'letter film path/00 text: unheld: You get this because you joined the First the Blade list, which sends one email per film.',
      'letter film path/00 html: unheld: You get this because you joined the First the Blade list, which sends one email per film.',
    ],
  },
  {
    name: 'r4-F1 a cadence with no mail word',
    file: 'src/ui/mail.tsx',
    find: LEAVE_ANY_TIME,
    put: "'We will be in touch every week. A new film reaches you every Friday. A note every week. Look for us here each Friday.'",
    said: [
      'dist/subscribe/confirmed.html: unheld: We will be in touch every week.',
      'dist/subscribe/confirmed.html: unheld: Look for us here each Friday.',
      'dist/subscribe/confirmed.html: unheld: A new film reaches you every Friday.',
      'dist/subscribe/confirmed.html: unheld: A note every week.',
    ],
  },
  {
    name: 'r4-F1 "Emails: weekly"',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      Emails: weekly\n',
    said: ['dist/index.html: unheld: Emails: weekly'],
  },
  {
    name: 'r4-F1 "EMAIL WEEKLY"',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      EMAIL WEEKLY\n',
    said: ['dist/index.html: unheld: EMAIL WEEKLY'],
  },
  {
    name: 'r4-F1 "Email · weekly"',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      Email · weekly\n',
    said: ['dist/index.html: unheld: Email · weekly'],
  },
  {
    name: 'r4-F1 a cadence split by a JSX expression',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      Email {"weekly"}\n',
    said: ['dist/index.html: unheld: Email weekly'],
  },
  {
    name: 'r4-F1 a cadence on a thumbnail',
    file: 'kit/draw.ts',
    find: "lines: ['You did it.']",
    put: "lines: ['We email you weekly.']",
    said: ['kit/out/thumb-court.png: unheld: We email you weekly.'],
  },
  {
    name: 'r4-F2 the form binds a PROMISE of its own',
    file: 'src/ui/mail.tsx',
    find: "import { PROMISE } from '../mail/promise.ts';",
    put: "const PROMISE = 'a note every week';",
    said: [
      'dist/index.html: unheld: We send you a note every week.',
      'dist/subscribe/confirmed.html: unheld: We will send you a note every week.',
    ],
  },
  {
    name: 'r4-F2 the privacy page binds a PROMISE of its own',
    file: 'src/views.tsx',
    find: "import { PROMISE } from './mail/promise.ts';",
    put: "const PROMISE = 'news from us now and then';",
    said: ['dist/privacy.html: unheld: We use it to send you news from us now and then.'],
  },
  // rw-r1 F1: a word of time inside a longer word.
  confirmedSays('rw-r1-F1 "biweekly"', 'Expect a new film from us biweekly.'),
  confirmedSays('rw-r1-F1 "on weekends"', 'A new film lands in your box on weekends.'),
  confirmedSays('rw-r1-F1 "quarterly"', 'Look for us quarterly.'),
  confirmedSays('rw-r1-F1 "semimonthly"', 'And a roundup from us semimonthly.'),
  confirmedSays('rw-r1-F1 "bimonthly"', 'Plus a bimonthly roundup.'),
  confirmedSays('rw-r1-F1 "tonight and tomorrow"', 'Expect us tonight and tomorrow.'),
  confirmedSays('rw-r1-F1 "nightly"', 'Expect a film from us nightly.'),
  confirmedSays('rw-r1-F1 "twice a month"', 'You will get a new film from us twice a month.'),
  confirmedSays(
    'rw-r1-F1 "at Easter and Christmas"',
    'Expect a roundup from us at Easter and Christmas.',
  ),
  confirmedSays('rw-r1-F1 "seasonal"', 'And our seasonal roundup.'),
  // rw-r1 F4: a sentence held on one page, said on another.
  confirmedSays(
    'rw-r1-F4 "for an hour" said on the confirmed page',
    'We will not send another one for an hour.',
  ),
  // rw-r1 F2: a word split by an inline element.
  {
    name: 'rw-r1-F2 the sign-up label splits "weekly" with <u>',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      Or get them <u>wee</u>kly\n',
    said: ['dist/index.html: unheld: Or get them weekly'],
  },
  noticePrints('rw-r1-F2 <u>wee</u>kly', '<p>Find us here <u>wee</u>kly.</p>', [
    'unheld: Find us here weekly.',
  ]),
  noticePrints('rw-r1-F2 <a>wee</a>kly', '<p>Find us here <a href=/x>wee</a>kly.</p>', [
    'unheld: Find us here weekly.',
  ]),
  noticePrints('rw-r1-F2 <s></s>every Friday', '<p>Find us here <s></s>every Friday.</p>', [
    'unheld: Find us here every Friday.',
  ]),
  // The layout check: a word the net takes in one layout and not in the other.
  noticePrints('rw-r1-F2 a word split across two boxes', '<p>Find us here wee</p><p>kly.</p>', [
    'layout: Find us here wee|kly.',
  ]),
  noticePrints(
    'rw-r1-F2 a list word merged into an inline element',
    '<p>Our list<span>ening</span> room.</p>',
    ['layout: Our list|ening room.'],
  ),
  // rw-r1 F3: words a reader sees in attributes and stylesheets.
  {
    name: 'rw-r1-F3 the sign-up button as <input type=submit value>',
    file: 'src/ui/mail.tsx',
    find: BUTTON,
    put: '<input class="button button-night" type="submit" value="Email me weekly" />',
    said: ['dist/index.html: unheld: Email me weekly', 'dist/index.html: gone: Email me new films'],
  },
  noticePrints(
    'rw-r1-F3 <input type=submit value>',
    '<input type="submit" value="Get our weekly digest">',
    ['unheld: Get our weekly digest'],
  ),
  noticePrints(
    'rw-r1-F3 aria-description',
    '<button aria-description="We email you weekly">x</button>',
    ['unheld: We email you weekly'],
  ),
  noticePrints('rw-r1-F3 alt in single quotes', "<img alt='We email you weekly'>", [
    'unheld: We email you weekly',
  ]),
  noticePrints('rw-r1-F3 title', '<abbr title="weekly">wk</abbr>', ['unheld: weekly']),
  noticePrints(
    'rw-r1-F3 CSS content in a <style>',
    "<style>.x::after{content:'Weekly emails'}</style>",
    ['unheld: Weekly emails'],
  ),
  {
    name: 'rw-r1-F3 CSS content in the built stylesheet',
    file: 'src/styles.css',
    find: LABEL_CSS,
    put: `.signup-label::after {\n  content: 'Weekly emails';\n}\n${LABEL_CSS}`,
    said: ['dist/assets/client-*.css: unheld: Weekly emails'],
  },
  // rw-r2 F1: a character a reader does not see, or sees as a plain letter, inside a word.
  noticePrints('rw-r2-F1 a soft hyphen inside "weekly"', '<p>Expect us wee&shy;kly.</p>', [
    'unheld: Expect us weekly.',
  ]),
  noticePrints('rw-r2-F1 a zero-width space inside "weekly"', '<p>Expect us wee&#8203;kly.</p>', [
    'unheld: Expect us weekly.',
  ]),
  noticePrints('rw-r2-F1 a zero-width joiner inside "weekly"', '<p>Expect us wee&zwj;kly.</p>', [
    'unheld: Expect us weekly.',
  ]),
  noticePrints(
    'rw-r2-F1 a full-width "weekly"',
    '<p>Expect us &#xff57;&#xff45;&#xff45;&#xff4b;&#xff4c;&#xff59;.</p>',
    ['unheld: Expect us weekly.'],
  ),
  noticePrints('rw-r2-F1 a Cyrillic letter in "weekly"', '<p>Expect us w&#x435;&#x435;kly.</p>', [
    'unread: character U+0435 in "Expect us w\u0435\u0435kly."',
  ]),
  // rw-r2 F2: generated content drawn beside an element's words.
  {
    name: 'rw-r2-F2 generated content after the sign-up button',
    file: 'src/styles.css',
    find: LABEL_CSS,
    put: `.button-label::after {\n  content: ' and our news';\n}\n${LABEL_CSS}`,
    said: ['dist/assets/client-*.css: unread: content: … and our news…'],
  },
  noticePrints(
    'rw-r2-F2 generated content that ends a word',
    '<style>.w::after{content:"kly"}</style><p>Expect us <span class="w">wee</span>.</p>',
    ['unread: content: "kly"'],
  ),
  noticePrints(
    'rw-r2-F2 generated content in two strings',
    "<style>.w::after{content:'wee' 'kly.'}</style>",
    ["unread: content: 'wee' 'kly.'"],
  ),
  // rw-r2 F3: a box shown inline beside a held sentence.
  {
    name: 'rw-r2-F3 an inline <div> after the sign-up label',
    file: 'src/ui/mail.tsx',
    find: LABEL_END,
    put: '    </label>\n    <div style={{ display: \'inline\' }}> and our news too</div>\n    <div class="signup-row">',
    said: ['dist/index.html: layout: …|Or get them by email | and our news too|…'],
  },
  noticePrints(
    'rw-r2-F3 two boxes shown inline',
    '<p>Get them by email</p><p> and our garden too.</p>',
    ['layout: Get them by email | and our garden too.'],
  ),
  // rw-r2 F4: the letters' sender, which every inbox shows.
  {
    name: 'rw-r2-F4 the letters are from "First the Blade Weekly"',
    file: 'src/mail/mailer.ts',
    find: "name: 'First the Blade', email",
    put: "name: 'First the Blade Weekly', email",
    said: ['letter sender: unheld: First the Blade Weekly'],
  },
  {
    name: 'rw-r2-F4 the letters are from weekly@',
    file: 'src/mail/mailer.ts',
    find: "email: 'films@firsttheblade.com'",
    put: "email: 'weekly@firsttheblade.com'",
    said: ['letter sender: unheld: weekly@firsttheblade.com'],
  },
  // rw-r2 F5: a meta tag the check does not know.
  {
    name: 'rw-r2-F5 <meta name="application-name">',
    file: 'src/document.tsx',
    find: THEME_META,
    put: `${THEME_META}\n        <meta name="application-name" content="First the Blade Weekly" />`,
    said: ['dist/index.html: unread: meta application-name'],
  },
  // rw-r2 F6: what we send beside the films.
  confirmedSays('rw-r2-F6 "our news and offers"', 'Plus our news and offers.'),
  // rw-r2 F7: the gate reads turbo's build, so a build older than its sources fails.
  {
    name: 'rw-r2-F7 a source changed after the build',
    file: 'src/ui/mail.tsx',
    find: LEAVE_ANY_TIME,
    put: "'We email you weekly.'",
    after: true,
    said: ['stale: dist/ was built from other sources; run bun run build'],
  },
  {
    name: 'rw-r2-F7 a built file changed after the build',
    file: 'dist/llms.txt',
    find: '# First the Blade\n',
    put: '# First the Blade\n\nWe email you weekly.\n',
    after: true,
    said: ['stale: dist/llms.txt changed after its build'],
  },
  // rw-r2 F8: a file name the browser shows.
  noticePrints(
    'rw-r2-F8 a download file name',
    '<a href="/x.pdf" download="weekly-digest.pdf">Get it</a>',
    ['unheld: weekly-digest.pdf'],
  ),
  // The letters: their subjects, a hidden preheader and their headers.
  {
    name: 'letters a cadence in a subject',
    file: 'src/mail/letters.ts',
    find: 'const subject = `Confirm your email for ${CHANNEL.name}`;',
    put: 'const subject = `Your weekly films from ${CHANNEL.name}`;',
    said: ['letter confirm text: unheld: Your weekly films from First the Blade'],
  },
  {
    name: 'letters a hidden preheader',
    file: 'src/mail/letters.ts',
    find: PAGE_BODY,
    put: `${PAGE_BODY}\n    '<div style="display:none">Your weekly digest</div>',`,
    said: [
      'letter confirm html: unheld: Your weekly digest',
      'letter film path/00 html: unheld: Your weekly digest',
    ],
  },
  {
    name: 'fail-closed a letter header the check does not know',
    file: 'src/mail/letters.ts',
    find: ONE_CLICK,
    put: `${ONE_CLICK}\n      'X-Note': 'One film a week',`,
    said: ['letter film path/00 text: unread: letter header X-Note'],
  },
  // Each source of words the check does not read fails the run.
  noticePrints(
    'fail-closed an element the check does not read',
    '<iframe src="/x.html"></iframe>',
    ['unread: element iframe'],
  ),
  noticePrints('fail-closed a custom element', '<film-note>x</film-note>', [
    'unread: element film-note',
  ]),
  noticePrints(
    'fail-closed an attribute the check does not read',
    '<span data-note="We email you weekly">x</span>',
    ['unread: attribute data-note on span'],
  ),
  noticePrints('fail-closed an inline script', "<script>document.write('Weekly')</script>", [
    'unread: inline script',
  ]),
  noticePrints(
    'fail-closed a stylesheet from elsewhere',
    '<link rel="stylesheet" href="https://example.com/x.css">',
    ['unread: stylesheet https://example.com/x.css'],
  ),
  noticePrints(
    'fail-closed generated content from a counter',
    '<style>.w::before{content:counter(n, lower-alpha)}</style>',
    ['unread: content: counter(n, lower-alpha)'],
  ),
  noticePrints(
    'fail-closed a stylesheet string with a letter',
    '<style>.w{--note:"Expect us"}</style>',
    ['unread: CSS string "Expect us"'],
  ),
  noticePrints('fail-closed an @import', '<style>@import url(https://example.com/x.css);</style>', [
    'unread: @import',
  ]),
  noticePrints(
    'fail-closed a mail link that fills in a subject',
    '<a href="mailto:hello@firsttheblade.com?subject=Weekly">Write</a>',
    ['unread: link words mailto:hello@firsttheblade.com?subject=Weekly'],
  ),
  noticePrints('fail-closed a meta tag with no name', '<meta http-equiv="refresh" content="0">', [
    'unread: meta',
  ]),
];

/** What a copy of the app needs to build and to run the check. */
const COPIED = [
  'src',
  'public',
  'kit',
  'scripts',
  'package.json',
  'tsconfig.json',
  'turbo.json',
  'vite.config.ts',
];

/** Cases run at once, each building its own copy. */
const CONCURRENCY = 6;

/** A case's line as the check prints it, a `*` standing for a build's content hash. */
const saying = (line: string) =>
  new RegExp(
    `^promise ${line
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '[\\w-]+')
      .replaceAll('…', '.*')}$`,
  );

class CaseFailed extends Data.TaggedError('CaseFailed')<{ readonly reason: string }> {}

class CensusMissed extends Data.TaggedError('CensusMissed')<{ readonly missed: number }> {
  override get message() {
    return `${this.missed} case(s) of the promise's census did not turn the check red`;
  }
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** A command's output, stdout then stderr, and its exit code. */
const exec = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    return { output: `${stdout}${stderr}`, code: Number(code) };
  }).pipe(Effect.scoped);

/** One case, in its own copy of the app under the repo's `tmp/` (two levels down, as the app is, so its tsconfig's `extends` holds). */
const runCase = (app: string, scratch: string, found: Case) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const copy = yield* fs.makeTempDirectoryScoped({
      directory: scratch,
      prefix: 'ftb-promise-census-',
    });
    yield* Effect.forEach(COPIED, (entry) =>
      fs.copy(path.join(app, entry), path.join(copy, entry)),
    );
    const inject = Effect.gen(function* () {
      const file = path.join(copy, found.file);
      const source = yield* fs.readFileString(file);
      const times = source.split(found.find).length - 1;
      if (times !== 1) {
        return yield* new CaseFailed({
          reason: `stale: ${found.file} holds its words ${times} times, not once`,
        });
      }
      yield* fs.writeFileString(
        file,
        source.replace(found.find, () => found.put),
      );
    });
    if (found.after !== true) yield* inject;
    const build = yield* exec('bun', ['run', 'build'], copy);
    if (build.code !== 0) {
      return yield* new CaseFailed({ reason: `the build failed:\n${build.output}` });
    }
    if (found.after === true) yield* inject;
    const check = yield* exec('bun', ['scripts/promise.ts'], copy);
    const lines = check.output.split('\n');
    const unsaid = found.said.filter((line) => !lines.some((said) => saying(line).test(said)));
    if (check.code === 0 || unsaid.length > 0) {
      return yield* new CaseFailed({
        reason: `the check exited ${check.code} and did not say:\n${unsaid.join('\n')}\nit said:\n${check.output}`,
      });
    }
  }).pipe(Effect.scoped);

const census = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = path.dirname(import.meta.dir);
  const scratch = path.join(app, '..', '..', 'tmp');
  yield* fs.makeDirectory(scratch, { recursive: true });
  const results = yield* Effect.forEach(
    CASES,
    (found) =>
      runCase(app, scratch, found).pipe(
        Effect.as(`promise-census ${found.name}: red`),
        Effect.catchTag('CaseFailed', (failed) =>
          Effect.succeed(`promise-census ${found.name}: NOT RED, ${failed.reason}`),
        ),
      ),
    { concurrency: CONCURRENCY },
  );
  yield* Effect.forEach(results, (line) => Console.log(line));
  const missed = results.filter((line) => !line.endsWith(': red')).length;
  if (missed > 0) return yield* new CensusMissed({ missed });
});

census.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
