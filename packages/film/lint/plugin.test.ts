// The `film` oxlint plugin, run for real: oxlint lints each fixture in
// `fixtures/` with only this plugin on, and what it reports must be exactly the
// lines a fixture marks `// RED film/<rule>`, with corrective advice pinned
// for each rule. no-unprobed-ink resolves names
// through scope, which only a real oxlint run provides, so its fixture is its
// test. drawing-literal has its fixture here too, and the lab locator it runs
// (`unlocatable`) is tested on source in src/tools/scene-source.test.ts.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The timeout of a test here that spawns (oxlint): a cold start's time is the machine's (film/spawn-budget). */
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
  'no-unprobed-ink.ts:9 film/no-unprobed-ink':
    "ctx.stroke bypasses the probe, so film check cannot see it cross text. Draw it with the kit's stroke/write, or wrap it in the kit's unprobed(ctx, () => …) to say it is texture.",
  'span-ends-on-anchor.ts:10 film/span-ends-on-anchor':
    'a span that ends on its anchor writes its length twice (offset: -d, dur: d): drop the offset and add `ends: true`, so a dur edit keeps the landing.',
  'span-ends-on-anchor.ts:19 film/span-ends-on-anchor':
    "a part that ends on its parent's end only because its offset and dur add up to the parent's dur: write `{ after: parent, dur, ends: true }` (keeps its length) or `{ with: parent, until: { cue: parent } }` (keeps its start), so a drag of the parent carries it.",
  'no-point-free-log.ts:8 film/no-point-free-log':
    'Console.log passed point-free: it is variadic, and this call passes the index too, which it prints after each line. Write (line) => Console.log(line).',
  'no-ease-on-cue.ts:12 film/no-ease-on-cue':
    "a cue's progress eased a second time: f.at(cue) is already eased by the span's `ease`, which the lab sets. A camera push is a shotPath stop with pushInto; another curve is its own cue or f.keys.",
  'no-ease-on-cue.ts:15 film/no-cue-remap':
    'a cue split by a fraction written in the draw: declare the part as its own cue ({ with: cue, dur }, or { after: cue, dur, ends: true } for its last part) and read it with f.at, where the lab can reach it.',
  'no-cue-remap.ts:23 film/no-cue-remap':
    "a cue's last part split by a fraction written in the draw: declare it as its own cue that lands on the cue's end ({ after: cue, dur, ends: true }) and read it with f.at, so a drag of the cue carries it.",
  'no-cue-remap.ts:35 film/no-cue-remap':
    "a step part way through a cue, written in the draw: declare the instant as its own cue ({ with: cue, offset, dur: 0 }) and read f.at(instant) > 0, where the lab can reach it and a sound can follow it; an instant the drawing's own shape makes is read from that shape (Math.cos(f.at('flip') * Math.PI) < 0).",
  'spawn-budget.ts:14 film/spawn-budget':
    "this test spawns a process and has no timeout: a cold start's time is the machine's, so give it its budget in milliseconds as the last argument.",
  'no-read-once.ts:23 film/no-read-once':
    'evaluate reads the page once, whatever it had drawn at that instant: wait for the value instead (textIs, textHas, valueIs, attributeIs, countIs, evaluates or until in lab/fixtures/settled.ts).',
  'drawing-literal.ts:18 film/drawing-literal':
    "drawing's timeline is not an object literal or a module-level const literal: the lab cannot locate or edit it.",
  'host-events-through-adapter.ts:8 film/host-events-through-adapter':
    "window.addEventListener('keydown') hears the host directly: use Keys.listen (packages/film/src/browser/keys.ts).",
  'host-events-through-adapter.ts:10 film/host-events-through-adapter':
    "window.addEventListener('popstate') hears the host directly: use @bible/url-state's Location.",
  'host-events-through-adapter.ts:13 film/host-events-through-adapter':
    "self.addEventListener('pointercancel') hears the host directly: use Pointer.drag (packages/film/src/browser/pointer.ts).",
  'keys-through-keymap.tsx:10 film/keys-through-keymap':
    'a JSX handler hears keydown on its own: declare a command with its keys (packages/film/src/command/command.ts), registered with the page hub.',
  'keys-through-keymap.tsx:18 film/keys-through-keymap':
    'addEventListener hears contextmenu on its own: open a context menu through @bible/ui ContextMenu over the selection’s commands (packages/film/src/lab/command/).',
  'framing-is-a-knob.ts:9 film/framing-is-a-knob':
    'a framing written in the scene: make it knobs (a point and a zoom, read with knobCamera), a move between framings a shotPath of them, and a push that keeps going pushOn with a number knob, so the lab can reach it.',
  'no-history-comment.ts:4 film/no-history-comment':
    'a pass number in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.',
  'no-hand-timed-seconds.ts:22 film/no-hand-timed-seconds':
    "an offset over 1 s from its mark or scene landmark: a hand-timed second. Declare a cue in the drawing's timeline and read f.at / f.keys / f.stagger / f.cue, anchored to a mark, a word ({ mark, word }), another cue or the voice's end.",
  'no-hand-timed-seconds.ts:33 film/no-hand-timed-seconds':
    "an untilOffset over 1 s from its until point: a hand-timed second. Declare a cue in the drawing's timeline and read f.at / f.keys / f.stagger / f.cue, anchored to a mark, a word ({ mark, word }), another cue or the voice's end.",
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
        ChildProcess.make(oxlint, ['-c', 'oxlint.json', '--format', 'unix', '.'], { cwd }),
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
  it.effect.layer(BunServices.layer)(
    'fires on every RED fixture line and gives the corrective advice',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = path.join(import.meta.dir, 'fixtures');
        const files = (yield* fs.readDirectory(dir)).filter((f) => /\.tsx?$/.test(f));
        const expected = (yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(path.join(dir, file)), (source) => marked(file, source)),
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
