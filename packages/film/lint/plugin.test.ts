// The `film` oxlint plugin, run for real: oxlint lints each fixture in
// `fixtures/` with only this plugin on, and what it reports must be exactly the
// lines a fixture marks `// RED film/<rule>`, with corrective advice pinned
// for every rule the plugin defines. Every rule resolves names
// through scope, which only a real oxlint run provides, so its fixture is its
// test. drawing-literal has its fixture here too, and the lab locator it runs
// (`unlocatable`) is tested on source in src/tools/scene-source.test.ts.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import plugin from './plugin.ts';

/** The timeout of a test here that spawns (oxlint): a cold start's time is the machine's (effect/requireSpawnBudget). */
const SPAWNS_MS = 30_000;

const text = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.mkString(Stream.decodeText(stream));

/** The location and corrective message of every oxlint report in `--format unix`. */
const reported = (
  out: string,
): ReadonlyArray<{ readonly site: string; readonly message: string }> =>
  out
    .split('\n')
    .flatMap((line) =>
      Option.toArray(
        Option.map(
          Option.fromNullishOr(
            /^(?:.*\/)?([^/:]+):(\d+):\d+: (.*?) \[\w+\/film\(([\w-]+)\)\]$/.exec(line),
          ),
          (m) => ({ site: `${m[1]}:${m[2]} film/${m[4]}`, message: m[3] ?? '' }),
        ),
      ),
    );

/** `file:line rule` for every line a fixture marks RED. */
const marked = (file: string, source: string): ReadonlyArray<string> =>
  source
    .split('\n')
    .flatMap((line, i) =>
      Option.toArray(
        Option.map(
          Option.fromNullishOr(/\/\/ RED (film\/[\w-]+)/.exec(line)),
          (m) => `${file}:${i + 1} ${m[1]}`,
        ),
      ),
    );

/** Corrective advice users receive for each rule, including the two timing repairs. */
const MESSAGES = {
  'no-history-comment.ts:4 film/no-history-comment':
    'a pass number in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.',
  'no-history-comment.ts:21 film/no-history-comment':
    'a ledger id in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.',
  'no-unprobed-ink.ts:11 film/no-unprobed-ink':
    "ctx.stroke bypasses the probe, so film check cannot see it cross text. Draw it with the kit's stroke/write, or wrap it in the kit's unprobed(ctx, () => …) to say it is texture.",
  'span-ends-on-anchor.ts:10 film/span-ends-on-anchor':
    'a span that ends on its anchor writes its length twice (offset: -d, dur: d): drop the offset and add `ends: true`, so a dur edit keeps the landing.',
  'span-ends-on-anchor.ts:19 film/span-ends-on-anchor':
    "a part that ends on its parent's end only because its offset and dur add up to the parent's dur: write `{ after: parent, dur, ends: true }` (keeps its length) or `{ with: parent, until: { cue: parent } }` (keeps its start), so a drag of the parent carries it.",
  'no-ease-on-cue.ts:15 film/no-ease-on-cue':
    "a cue's progress eased a second time: f.at(cue) is already eased by the span's `ease`, which the lab sets. A camera push is a shotPath stop with pushInto; another curve is its own cue or f.keys.",
  'no-ease-on-cue.ts:20 film/no-cue-remap':
    'a cue split by a fraction written in the draw: declare the part as its own cue ({ with: cue, dur }, or { after: cue, dur, ends: true } for its last part) and read it with f.at, where the lab can reach it.',
  'no-cue-remap.ts:24 film/no-cue-remap':
    "a cue's last part split by a fraction written in the draw: declare it as its own cue that lands on the cue's end ({ after: cue, dur, ends: true }) and read it with f.at, so a drag of the cue carries it.",
  'no-cue-remap.ts:36 film/no-cue-remap':
    "a step part way through a cue, written in the draw: declare the instant as its own cue ({ with: cue, offset, dur: 0 }) and read f.at(instant) > 0, where the lab can reach it and a sound can follow it; an instant the drawing's own shape makes is read from that shape (Math.cos(f.at('flip') * Math.PI) < 0).",
  'pages-in-case-scope.ts:10 film/pages-in-case-scope':
    "a scope made by hand in a browser test: a step that fails before it is closed keeps its page open, and the process's next touching case dies. Open the page in the case's scope, or in Scope.fork(yield* Effect.scope) to close it early.",
  'no-lazy-test-fixture.ts:12 film/no-lazy-test-fixture':
    "a fixture the file's cases share, made on first use: the case that asks first builds it inside its time limit, and which case pays moves with their order. Build it as the file loads (const x = await Effect.runPromise(…)), or make it in each case.",
  'test-git-config.ts:10 film/test-git-config':
    "a git config written in a test file: run a test repository's git with TEST_GIT (packages/scripts/src/testing.ts) ahead of its arguments, which also turns git's automatic maintenance off, whose lock file breaks the folder's delete.",
  'touches-serial.ts:17 film/touches-serial':
    "a touch outside test.serial: while one tab's touches are under way Chrome drops, or lands as a bare click, the touches the file's other cases send their own tabs at the same time. Run this case alone: test.serial, or a runner's .serial form (it.live.serial).",
  'no-test-seam.ts:3 film/no-test-seam':
    "a test seam imported by product code: a testing.ts module holds a package's test-only doubles and fixtures, so a shipped import never reaches one. Move what this file needs out of the seam, into the module it belongs to.",
  'no-data-url.tsx:3 film/no-data-url':
    'a data URL in a served module: an image written inside another file is one the build walk does not read, so no approval holds it. Ship the image as a file of its own, which the walk reads by its bytes.',
  'no-read-once.ts:23 film/no-read-once':
    'evaluate reads the page once, whatever it had drawn at that instant: wait for the value instead (textIs, textHas, valueIs, attributeIs, countIs, evaluates or until in lab/fixtures/settled.ts).',
  'told-after-answer.ts:18 film/told-after-answer':
    'a fake route completes a Deferred itself: the case waiting on it runs on at once, inside the call, and an answer made after reads what the case changed then. Tell through the harness: told(Deferred.done(asked, Exit.void), json(…)) runs the tell once its answer is made.',
  'drawing-literal.ts:18 film/drawing-literal':
    "drawing's timeline is not an object literal or a module-level const literal: the lab cannot locate or edit it.",
  'host-events-through-adapter.ts:10 film/host-events-through-adapter':
    "window.addEventListener('keydown') hears the host directly: use Keys.listen (packages/film/src/browser/keys.ts).",
  'host-events-through-adapter.ts:12 film/host-events-through-adapter':
    "window.addEventListener('popstate') hears the host directly: use @bible/url-state's Location.",
  'host-events-through-adapter.ts:15 film/host-events-through-adapter':
    "self.addEventListener('pointercancel') hears the host directly: use Pointer.press (packages/film/src/browser/pointer.ts).",
  'host-events-through-adapter.ts:19 film/host-events-through-adapter':
    "document.body.addEventListener('pointercancel') hears the host directly: use Pointer.press (packages/film/src/browser/pointer.ts).",
  'host-events-through-adapter.ts:21 film/host-events-through-adapter':
    'el.setPointerCapture holds a press outside its owner: use Pointer.press (packages/film/src/browser/pointer.ts).',
  'host-events-through-adapter.ts:33 film/host-events-through-adapter':
    "addEventListener('popstate') hears the host directly: use @bible/url-state's Location.",
  'host-events-through-adapter.ts:41 film/host-events-through-adapter':
    'document.onkeydown hears the host directly: use Keys.listen (packages/film/src/browser/keys.ts).',
  'host-events-through-adapter.ts:43 film/host-events-through-adapter':
    'el.onpointerup ends a press outside its owner: use Pointer.press (packages/film/src/browser/pointer.ts).',
  'host-events-through-adapter.ts:46 film/host-events-through-adapter':
    'window.addEventListener hears the host with an event this rule cannot read, so it may be one an adapter owns: write the event out, and hear navigation, keys and drags through Location, Keys or Pointer.',
  'host-events-jsx.tsx:9 film/host-events-through-adapter':
    "a JSX handler for 'pointerup' ends a press outside its owner: use Pointer.press (packages/film/src/browser/pointer.ts).",
  'keys-named-as-bound.tsx:9 film/keys-named-as-bound':
    "keysOf reads the keymap once, so a command registered after it reads as unbound: name the key as bound now: hubKeys' titled or text (packages/film/src/lab/command/changes.ts).",
  'keys-named-as-bound.tsx:15 film/keys-named-as-bound':
    "a title written with its key: name the key as bound now: hubKeys' titled or text (packages/film/src/lab/command/changes.ts).",
  'keys-through-keymap.tsx:10 film/keys-through-keymap':
    'a JSX handler hears keydown on its own: declare a command with its keys (packages/film/src/command/command.ts), registered with the page hub.',
  'keys-through-keymap.tsx:18 film/keys-through-keymap':
    'addEventListener hears contextmenu on its own: open a context menu through @bible/ui ContextMenu over the selection’s commands (packages/film/src/lab/command/).',
  'focus-through-focus-for.ts:10 film/focus-through-focus-for':
    'a focus moved from script past focusFor: call focusFor(el, input) (packages/film/src/lab/focus.ts) with the input that asked, so the ring shows iff a key did.',
  'booleans-through-pressed.tsx:28 film/booleans-through-pressed':
    "a boolean written as a string by hand: pressed(on) (packages/film/src/lab/pressed.ts) types it 'true' | 'false'.",
  'history-through-host.ts:11 film/history-through-host':
    "a history move chosen here: a place's field declares its policy (Place.history, @bible/url-state), and the address bar is written through addressOn (packages/film/src/browser/host.ts).",
  'one-clock-epsilon.ts:12 film/one-clock-epsilon':
    'a nudge written beside a time: put the time on its grid through packages/film/src/core/time.ts (frameAtOrAfter, frameAtOrBefore, onTheMs, heardAtOrAfter, justBefore), or judge two times one with CLOCK_EPSILON, so one owner rounds every time.',
  'lock-through-sqlite.ts:11 film/lock-through-sqlite':
    "a manifest's lock file named outside its lock: SQLite alone opens it (packages/film/src/tools/manifest-lock-bun.ts), since closing any other handle on it lets go of the process's lock.",
  'media-through-player.tsx:7 film/media-through-player':
    "a media element made by hand: play sound and pictures through the player's media module (packages/film/src/browser/media.ts), which owns what an element does a page cannot see.",
  'one-breakpoint.ts:8 film/one-breakpoint':
    "a breakpoint written out: ask the studio's one breakpoint through PHONE or WIDE (packages/film/src/lab/viewport.ts), so the width is declared once.",
  'framing-is-a-knob.ts:10 film/framing-is-a-knob':
    'a framing written in the scene: make it knobs (a point and a zoom, read with knobCamera), a move between framings a shotPath of them, and a push that keeps going pushOn with a number knob, so the lab can reach it.',
  'no-hand-timed-seconds.ts:23 film/no-hand-timed-seconds':
    "an offset over 1 s from its mark or scene landmark: a hand-timed second. Declare a cue in the drawing's timeline and read f.at / f.keys / f.stagger / f.cue, anchored to a mark, a word ({ mark, word }), another cue or the voice's end.",
  'no-hand-timed-seconds.ts:34 film/no-hand-timed-seconds':
    "an untilOffset over 1 s from its until point: a hand-timed second. Declare a cue in the drawing's timeline and read f.at / f.keys / f.stagger / f.cue, anchored to a mark, a word ({ mark, word }), another cue or the voice's end.",
  'synth-own-math.ts:5 film/synth-own-math':
    "code from outside the sound graph, which may compute with the host's Math: import values from packages/film/src/core/synth/graph/ or core/random.ts, and from effect only Predicate, Schema and Match by name; a type import passes.",
  'synth-own-math.ts:29 film/synth-own-math':
    "a host's Math in the sound graph: its sin, exp, log, pow and tanh round apart between hosts. Use the graph's own (packages/film/src/core/synth/graph/math.ts: sinTurn, cosTurn, exp, exp2, log, tanh, dbToGain); of Math, read only abs, ceil, floor, round, trunc, sign, min, max, sqrt, fround, imul, clz32 and the constants, by name.",
  'synth-own-math.ts:37 film/synth-own-math':
    "`**` is the host's pow, which rounds apart between hosts: write the product out, or use exp2, or exp and log, from packages/film/src/core/synth/graph/math.ts.",
  'tests-keep-their-strength.ts:13 film/tests-keep-their-strength':
    '`only` runs a test less than every time: a test runs every time and passes as written. Fix what it tests and drop `only`, or delete the test with the code it held.',
  'tests-keep-their-strength.ts:19 film/tests-keep-their-strength':
    "a timeout over bun's 5 s, or of 0 (none), on a test that starts no process: make the test fast (share its setup, use TestClock, run its work concurrently), never give it more time. A test that spawns names its spawn budget (effect/requireSpawnBudget).",
  'tests-keep-their-strength.ts:23 film/tests-keep-their-strength':
    'a retry passes a test that fails: find why it fails (a race, a shared fixture, a wall clock) and fix that.',
  'tests-keep-their-strength.ts:24 film/tests-keep-their-strength':
    "a default timeout over bun's 5 s, or of 0 (none), raises every test after it: make the slow tests fast, and give a test that spawns its own spawn budget.",
} as const satisfies Readonly<Record<string, string>>;

/** oxlint over the fixtures with the fixtures' config: what it reported, and its exit code. */
const lintFixtures = Effect.fn('test.lintFixtures')(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = yield* Path.Path;
  const cwd = path.join(import.meta.dir, 'fixtures');
  const oxlint = path.join(import.meta.dir, '..', '..', '..', 'node_modules', '.bin', 'oxlint');
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(oxlint, ['-c', 'oxlint.json', '--format', 'unix', '.'], {
          cwd,
          forceKillAfter: '5 seconds',
        }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      return { exitCode: Number(exitCode), out: `${stdout}${stderr}` };
    }),
  );
});

describe('film oxlint plugin', () => {
  it.effect('pins a corrective message for every rule it defines', () =>
    Effect.sync(() => {
      const pinned = new Set(Object.keys(MESSAGES).map((site) => site.split(' film/')[1]));
      expect([...pinned].sort()).toEqual(Object.keys(plugin.rules).sort());
    }),
  );

  it.effect.layer(BunServices.layer)(
    'fires on every RED fixture line and gives the corrective advice',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = path.join(import.meta.dir, 'fixtures');
        // A fixture may sit in a folder its module tests read (`core/`); oxlint reports it by its name.
        const files = (yield* fs.readDirectory(dir, { recursive: true })).filter((f) =>
          /\.tsx?$/.test(f),
        );
        const expected = (yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(path.join(dir, file)), (source) =>
            marked(path.basename(file), source),
          ),
        ))
          .flat()
          .sort();
        const run = yield* lintFixtures();
        expect(expected.length).toBeGreaterThan(0);
        const diagnostics = reported(run.out);
        expect(diagnostics.map((diagnostic) => diagnostic.site).sort()).toEqual(expected);
        const messages = new Map(
          diagnostics.map((diagnostic) => [diagnostic.site, diagnostic.message]),
        );
        for (const [site, message] of Object.entries(MESSAGES))
          expect(messages.get(site)).toBe(message);
        expect(run.exitCode).not.toBe(0);
      }),
    SPAWNS_MS,
  );
});
