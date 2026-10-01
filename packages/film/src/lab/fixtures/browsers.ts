// The browser tests' Chrome: Bun's one per test process (`tools/chrome.ts`),
// launched by the first case that opens a tab, every case's tab one of its
// own. A tab gets an origin of its own (`https://<n>.lab.test`, secure, so
// the microphone may be asked for), so cases running at once share no
// storage and no permissions. The process's flags are the same for every
// case: the renderer's software 2D canvas, media that plays without a
// gesture, and one fake microphone every case shares (`FAKE_MIC`).

import { BunServices } from '@effect/platform-bun';
import { Config, Effect, FileSystem, Option, Path, Schema, Scope, Semaphore } from 'effect';
import { openView } from '../../tools/chrome.ts';
import { type Logged, type Request, type Response, type Tab, makeTab } from './tab.ts';
import { tone } from './tone.ts';

/**
 * The fake microphone every tab hears: a 440 Hz sine at half scale on input
 * 1 of a two-input interface, input 2 silent, four seconds looped. Chromium's
 * fake device runs at 44.1 kHz, as the file does.
 */
const FAKE_MIC = { seconds: 4, amplitude: 0.5, rate: 44100 } as const;

/**
 * The microphone's WAV in the system's temp folder: the same bytes for every
 * run and process, so it is written whole (to a file of this process's, then
 * renamed over the name) and left for the next run.
 */
const micFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const temp = yield* Config.String('TMPDIR').pipe(Config.withDefault('/tmp'));
  const wav = (yield* Path.Path).join(temp, 'film-fake-mic.wav');
  const own = `${wav}.${process.pid}`;
  yield* fs.writeFile(
    own,
    tone(FAKE_MIC.seconds, FAKE_MIC.amplitude, { rate: FAKE_MIC.rate, channels: 'left-only' }),
  );
  yield* fs.rename(own, wav);
  return wav;
}).pipe(Effect.orDie, Effect.provide(BunServices.layer));

/** Every test tab's Chrome flags, worked out once per process. */
const flags = Effect.runSync(
  Effect.cached(
    Effect.map(micFile, (wav) => [
      // The renderer's software 2D canvas (`tools/browser.ts`), as every test draws.
      '--disable-accelerated-2d-canvas',
      // Plays media without a gesture: the test is the reviewer, and it never clicks first.
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
    ]),
  ),
);

/**
 * Lets an origin use the microphone. Chrome drops every permission it was
 * told of when the protocol session that told it closes, so a tab closing
 * would take the others' with it: they are told through a view of their own,
 * opened with the first tab and left open until the process ends.
 */
const allowMicrophone = Effect.runSync(
  Effect.cached(
    Effect.gen(function* () {
      const view = yield* openView(yield* flags, { width: 1, height: 1 }).pipe(
        Effect.provideService(Scope.Scope, yield* Scope.make()),
        Effect.orDie,
      );
      yield* Effect.promise(() => view.navigate('about:blank'));
      const one = yield* Semaphore.make(1);
      return (origin: string) =>
        one.withPermits(1)(
          Effect.promise(() =>
            view.cdp('Browser.setPermission', {
              origin,
              permission: { name: 'microphone' },
              setting: 'granted',
            }),
          ),
        );
    }).pipe(Effect.provide(BunServices.layer)),
  ),
);

let tabs = 0;

/** An object a page logged, as Chrome hands it over: its description. */
const described = Schema.decodeUnknownOption(Schema.Struct({ description: Schema.String }));

/** How a test tab opens: its viewport, whether it may use the microphone, and its server. */
interface TabOptions {
  readonly width: number;
  readonly height: number;
  /** Allowed the microphone, or refused it (the browser's prompt, answered no). */
  readonly microphone: boolean;
  /** Answers every request to the tab's origin; `None` holds it unanswered. */
  readonly serve: (request: Request) => Effect.Effect<Option.Option<Response>>;
  /** Scripts run before the page's own on every load. */
  readonly init: ReadonlyArray<string>;
}

/** A fresh tab on an origin of its own, at `about:blank`, closed with the scope. */
export const openTab = (options: TabOptions): Effect.Effect<Tab, never, Scope.Scope> =>
  Effect.gen(function* () {
    const logged: Array<Logged> = [];
    const errors: Array<string> = [];
    const view = yield* openView(yield* flags, {
      width: options.width,
      height: options.height,
      console: (type, ...args) => {
        // A primitive as itself, an object as Chrome describes it.
        const text = args
          .map((arg) =>
            Option.match(described(arg), {
              onNone: () => String(arg),
              onSome: (d) => d.description,
            }),
          )
          .join(' ');
        logged.push({ type, text });
        // Solid's reactivity diagnostics: a read or a write the page does not mean.
        if (type.startsWith('warn') && text.startsWith('[STRICT_')) errors.push(text);
      },
    }).pipe(Effect.orDie);
    yield* Effect.promise(() => view.navigate('about:blank'));
    tabs += 1;
    const origin = `https://t${tabs}.lab.test`;
    if (options.microphone) yield* (yield* allowMicrophone)(origin);
    return yield* makeTab(view, {
      origin,
      serve: options.serve,
      init: options.init,
      logged,
      errors,
    });
  }).pipe(Effect.provide(BunServices.layer));

/** A response of `type` with `body`, at `status`. */
export const respond = (body: Uint8Array | string, type: string, status = 200): Response => ({
  status,
  type,
  body,
});

/** A server that answers the paths `answers` names, and a 404 to anything else. */
export const servePaths =
  (answers: Readonly<Record<string, Response>>) =>
  (request: Request): Effect.Effect<Option.Option<Response>> =>
    Effect.succeedSome(answers[request.url.pathname] ?? respond('no such page', 'text/plain', 404));
