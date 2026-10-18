// earshot (github.com/Leonxlnx/earshot, MIT): the fitter `sfx fit` runs on a
// recording to get its model, a parametric account of the sound (struck
// modes, partial tracks, bands of noise) that core/synth/fit writes as code.
// It is downloaded code, so it runs as an external tool and is trusted with
// nothing:
//
// - pinned at one commit (`EARSHOT_PIN`), its clone and its virtualenv kept
//   outside the repo (`EARSHOT_HOME`, else ~/.cache/bible-film/earshot); a
//   clone at another commit, or with any change in it, is refused;
// - its packages installed from wheels only (no build or install scripts),
//   and none of the CLAP describer's (no torch or transformers): the fit
//   asks for no description;
// - run as `python -I -B` (no user site, no current folder, no bytecode
//   written), with an environment of its own (Hugging Face offline, its
//   caches in the run's scratch folder), under macOS's sandbox with no
//   network, reading only its clone, its virtualenv, the interpreter's
//   install and the recording's folder, and writing only the run's scratch
//   folder, where it leaves the model JSON and nothing else is kept;
// - never in CI or the gate: only `sfx fit` runs it, on the owner's machine.
//
// The driver decodes the recording itself (soundfile, resampled to 48 kHz
// with scipy) because earshot's own loader shells out to ffmpeg. A run past
// `EARSHOT_LIMIT` is stopped.

import { Config, Context, Duration, Effect, FileSystem, Layer, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { EarshotFailed, EarshotMissing } from './errors.ts';
import { collect, collectWithin } from './process.ts';
import { sandboxArgs } from './sandbox.ts';

/** The earshot commit every fit is made with: v0.2.0. */
const EARSHOT_PIN = '972132643583fc0b9a60c6c50983ed7dc1aa55bf';
const EARSHOT_REPO = 'https://github.com/Leonxlnx/earshot';
/** The packages the fit imports, pinned, each a wheel. */
const WHEELS = [
  'numpy==2.5.4',
  'scipy==1.18.1',
  'soundfile==0.14.0',
  'numba==0.68.0',
  'matplotlib==3.11.2',
  'threadpoolctl==3.7.0',
];
/** How long one fit may run: a 22 s bed takes about two minutes. */
const EARSHOT_LIMIT = Duration.minutes(10);

/** The lines that install earshot at its pin into `home`. */
const installOf = (home: string) =>
  [
    `git clone ${EARSHOT_REPO} ${home}/earshot && git -C ${home}/earshot checkout --detach ${EARSHOT_PIN}`,
    `uv venv --python 3.12 ${home}/venv`,
    `uv pip install --python ${home}/venv/bin/python --only-binary :all: ${WHEELS.join(' ')}`,
  ].join('\n');

/**
 * The driver, run as `python -I -B -c`: its clone, the recording and where
 * the model goes are its arguments. It fits with no description (`clap`
 * off) and saves the model; it prints its kind. Each candidate is scored on
 * seed 0, named here: earshot draws nothing else, so a refit of one
 * recording writes the same model, `fit_engine`'s timings aside.
 */
const DRIVER = `
import json, math, sys
clone, source, out = sys.argv[1:4]
sys.path.append(clone)
import numpy as np
import soundfile
from scipy.signal import resample_poly
from earshot.forge.fit import auto
x, rate = soundfile.read(source, dtype='float64', always_2d=True)
if rate != 48000:
    g = math.gcd(48000, rate)
    x = resample_poly(x, 48000 // g, rate // g, axis=0)
if x.shape[1] == 1:
    x = np.repeat(x, 2, axis=1)
model = auto.fit(x[:, :2], kind='auto', clap=False, seeds=(0,), name='fit', verbose=False)
auto.save(model, out)
print(json.dumps({'kind': auto.kind_of(model)}))
`;

/** The last lines a run printed, for its refusal. */
const tailOf = (text: string) => text.trim().split('\n').slice(-6).join('\n');

interface EarshotService {
  /** The commit every fit is made with. */
  readonly commit: string;
  /** `source` (an audio file) fitted by earshot: the model JSON it wrote. */
  readonly fit: (source: string) => Effect.Effect<string, EarshotMissing | EarshotFailed>;
}

export class Earshot extends Context.Service<Earshot, EarshotService>()(
  '@bible/film/tools/Earshot',
) {
  /** The earshot commit every fit is made with. */
  static readonly pin = EARSHOT_PIN;

  /** earshot at its pin in `EARSHOT_HOME` (else ~/.cache/bible-film/earshot), run in its sandbox. */
  static readonly layer = Layer.effect(
    Earshot,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const userHome = yield* Config.String('HOME').pipe(Config.withDefault('~'));
      const home = yield* Config.String('EARSHOT_HOME').pipe(
        Config.withDefault(path.join(userHome, '.cache', 'bible-film', 'earshot')),
      );
      const clone = path.join(home, 'earshot');
      const python = path.join(home, 'venv', 'bin', 'python');
      const missing = (reason: string) =>
        EarshotMissing.make({ home, reason, install: installOf(home) });

      /** The clone checked: at the pin, with nothing changed or added. */
      const pinned = Effect.gen(function* () {
        if (process.platform !== 'darwin')
          return yield* missing(
            `its sandbox is macOS's sandbox-exec, and this is ${process.platform}`,
          );
        for (const [what, at] of [
          ['its clone', clone],
          ['its virtualenv', python],
        ] as const)
          if (!(yield* fs.exists(at).pipe(Effect.orElseSucceed(() => false))))
            return yield* missing(`${what} is not at ${at}`);
        const git = (...args: ReadonlyArray<string>) =>
          collect(
            spawner,
            ChildProcess.make('git', ['-C', clone, ...args], {
              forceKillAfter: Duration.seconds(5),
            }),
          ).pipe(
            Effect.mapError((error) => missing(`git could not read its clone: ${error.message}`)),
          );
        const head = (yield* git('rev-parse', 'HEAD')).stdout.trim();
        if (head !== EARSHOT_PIN)
          return yield* missing(`its clone is at ${head}, not the pin ${EARSHOT_PIN}`);
        const changed = (yield* git('status', '--porcelain')).stdout.trim();
        if (changed !== '') return yield* missing(`its clone has changes:\n${changed}`);
      });

      const fit = Effect.fn('Earshot.fit')(function* (source: string) {
        yield* pinned;
        const failed = (reason: string) => EarshotFailed.make({ source, reason });
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const scratch = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
            const out = path.join(scratch, 'model.json');
            const real = yield* Effect.all({
              source: fs.realPath(source),
              clone: fs.realPath(clone),
              venv: fs.realPath(path.join(home, 'venv')),
              python: fs.realPath(python),
            });
            // The interpreter's install: its binary's folder's parent (uv's cpython-<version>-<platform>).
            const install = path.dirname(path.dirname(real.python));
            const command = sandboxArgs(
              {
                reads: [...new Set([real.clone, real.venv, install, path.dirname(real.source)])],
                writes: [scratch],
                offline: true,
              },
              [python, '-I', '-B', '-c', DRIVER, real.clone, real.source, out],
            );
            const [program = 'sandbox-exec', ...args] = command;
            yield* Effect.log(`earshot.fit source=${source} commit=${EARSHOT_PIN}`);
            const ran = yield* collectWithin(
              spawner,
              'earshot',
              ChildProcess.make(program, args, {
                cwd: scratch,
                env: {
                  PATH: '/usr/bin:/bin',
                  HOME: scratch,
                  HF_HUB_OFFLINE: '1',
                  TRANSFORMERS_OFFLINE: '1',
                  HF_HOME: path.join(scratch, 'hf'),
                  NUMBA_CACHE_DIR: path.join(scratch, 'numba'),
                  MPLCONFIGDIR: path.join(scratch, 'matplotlib'),
                  PYTHONDONTWRITEBYTECODE: '1',
                },
                forceKillAfter: Duration.seconds(5),
              }),
              EARSHOT_LIMIT,
            );
            if (ran.exitCode !== 0)
              return yield* failed(
                `it exited ${ran.exitCode}: ${tailOf(ran.stderr) || tailOf(ran.stdout)}`,
              );
            return yield* fs.readFileString(out);
          }),
        ).pipe(
          Effect.catchTags({
            PlatformError: (error) => Effect.fail(failed(error.message)),
            ProcessTimedOut: (error) => Effect.fail(failed(error.message)),
          }),
        );
      });

      return Earshot.of({ commit: EARSHOT_PIN, fit });
    }),
  );

  /** An earshot that answers `model(source)` for every fit, never running anything. */
  static readonly layerTest = (model: (source: string) => string, asked: Array<string> = []) =>
    Layer.succeed(
      Earshot,
      Earshot.of({
        commit: EARSHOT_PIN,
        fit: (source) => Effect.sync(() => (asked.push(source), model(source))),
      }),
    );
}
