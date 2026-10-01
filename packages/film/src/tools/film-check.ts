// The legs of `film check`, each an Effect over the services it needs, so
// what a leg may cost is in its type. The static leg reads the film's files
// and the master's length and stamp (FileSystem, Media): the lab runs it after
// every write. The sound leg renders the mix the film makes now (Mixer). The
// layout leg draws frames (Checker, Looker). The draw leg draws every scene
// in this process, into the stand-in context, at its moments (no browser).
// The short leg checks one short (Checker). Each hands back its findings; `report` levels and addresses them
// as one Report.

import { Effect, FileSystem, Option, Path, Predicate, Result, Schema } from 'effect';
import type { Film } from '../canvas/film.ts';
import { type Narrated, narrationUrls } from '../player/narrated.ts';
import { drawFindings } from './draw-check.ts';
import { FilmModuleInvalid } from './errors.ts';
import { type Address, type AddressError, type Scope, resolveAddress } from '../core/address.ts';
import { type LayoutError, type Placed, everyTakeRecorded, layout } from '../core/layout.ts';
import type { Short } from '../core/schema.ts';
import type { SafeZoneName } from '../core/shorts.ts';
import { mixFindings, staticFindings } from './check.ts';
import { Checker } from './checker.ts';
import { type LoadedFilm, importFilmModule } from './film-repo.ts';
import { lookFindings } from './look.ts';
import { Looker } from './looker.ts';
import { Media } from './media.ts';
import { Mixer, planKey, readMaster } from './mixer.ts';
import type { FlagRule } from './render-plan.ts';

/** `film check` flags that would each run a different set of legs. */
export const CHECK_RULES: ReadonlyArray<FlagRule> = [
  ['sound', 'excludes', 'static', '--static leaves the mix out, --sound runs it'],
  ['sound', 'excludes', 'short', 'a short has no mix of its own'],
  ['draw', 'excludes', 'static', '--static draws nothing, --draw draws every scene'],
  ['draw', 'excludes', 'sound', '--sound hears the mix, --draw draws the scenes'],
  ['draw', 'excludes', 'short', 'a short is drawn by its page'],
];

/** The film laid out, and the part of it a check covers. */
interface LaidOut {
  readonly placed: ReadonlyArray<Placed>;
  readonly scope: Scope;
}

/**
 * The film laid out and `address` resolved on it, or the one error that
 * stops them: a timeline that does not resolve, a line that does not parse,
 * acts or a short that do not lay out, a part the film lacks. The check
 * reports it as its finding, addressed at its scene, rather than failing
 * the run, so the lab's findings show it where it is.
 */
export const laidOut = (
  film: LoadedFilm,
  address: Address,
): Result.Result<LaidOut, LayoutError | AddressError> =>
  Result.flatMap(layout(film.scenes, film.timings), (placed) =>
    Result.map(
      resolveAddress(
        { name: film.paths.name, placed, look: film.look, shorts: film.shorts },
        address,
      ),
      (scope): LaidOut => ({ placed, scope }),
    ),
  );

/**
 * What the film's files tell without a mix or a frame: cues, takes, sounds,
 * the ending, and the master on disk (its length and the plan it was mixed
 * for, against the plan the film mixes to now).
 */
export const staticLeg = Effect.fn('check.static')(function* (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
) {
  const fs = yield* FileSystem.FileSystem;
  const master = yield* readMaster(fs, yield* Media, film.paths);
  const key = yield* planKey(film, placed);
  return staticFindings(film, placed, { master, key });
});

/**
 * Dead air and the balance, measured on the mix the film makes now, rendered
 * in memory bus by bus as `mix` makes it (the master on disk may be stale:
 * the static leg says so). Nothing until every take is recorded.
 */
export const soundLeg = Effect.fn('check.sound')(function* (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
) {
  if (!everyTakeRecorded(placed)) return [];
  const { plan, mixed } = yield* (yield* Mixer).render(film.paths.name, {
    warn: false,
    score: Option.none(),
    take: Option.none(),
  });
  return mixFindings(placed, plan, mixed);
});

/**
 * The browser legs, on one server and browser that start only when they run:
 * the layout at every sampled frame of the scenes `scope` covers, then the
 * look pass over them. Each act the scope covers whole is judged against its
 * colour script; a misnamed act fails in `resolveAddress`, before any page
 * opens.
 */
export const layoutLeg = Effect.fn('check.layout')(function* (
  film: LoadedFilm,
  scope: Scope,
  workers: number,
) {
  const layout = yield* (yield* Checker).layout(film, { workers, scope });
  const looked = yield* (yield* Looker).look(film, workers, scope);
  return [...layout, ...lookFindings(looked, scope.acts)];
});

/** A film's `film.ts` as the draw leg reads it: the film, built from its narration. */
const FilmFile = Schema.Struct({
  film: Schema.declare((u): u is (narrated: Narrated) => Film => Predicate.isFunction(u)),
});

/**
 * `check --draw`: the film as its page builds it (its `film.ts`, from the
 * committed timings), every moment of the scenes `scope` covers drawn in this
 * process into the stand-in context (`draw-check.ts`): a scene that throws, a
 * frame that is not pure, ink over a face. No browser.
 */
export const drawLeg = Effect.fn('check.draw')(function* (film: LoadedFilm, scope: Scope) {
  const path = yield* Path.Path;
  const file = path.join(film.paths.dir, 'film.ts');
  const invalid = (reason: string) =>
    FilmModuleInvalid.make({ film: film.paths.name, module: 'film.ts', reason });
  const module = yield* Effect.tryPromise({
    try: () => importFilmModule(file),
    catch: (cause) => invalid(String(cause)),
  });
  const { film: build } = yield* Schema.decodeUnknownEffect(FilmFile)(module).pipe(
    Effect.mapError((error) => invalid(error.message)),
  );
  const narrated = { timings: film.timings, audio: narrationUrls(film.paths.name).audio };
  const scenes = new Set(scope.scenes.map((p) => p.spec.id));
  return yield* Effect.scoped(drawFindings(() => build(narrated), scenes));
});

/**
 * `check --short`: the short resolved on its page's frame rate, its words
 * (its length, its first word, its loop's silence), then, unless `static`,
 * its page's frames. `static` still opens the page, for its rate.
 */
export const shortLeg = Effect.fn('check.short')(function* (
  film: LoadedFilm,
  short: Short,
  options: { readonly static: boolean; readonly workers: number; readonly zone: SafeZoneName },
) {
  return yield* (yield* Checker).short(film, short, options);
});
