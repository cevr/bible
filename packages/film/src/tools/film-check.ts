// The legs of `film check`, each an Effect over the services it needs, so
// what a leg may cost is in its type. The static leg reads the film's files
// and the master's length and stamp (FileSystem, Media): the lab runs it after
// every write. The sound leg renders the mix the film makes now (Mixer). The
// layout leg draws frames (Checker, Looker). The short leg checks one short
// (Checker). Each hands back its findings; `report` levels and addresses them
// as one Report.

import { Effect, FileSystem, Option } from 'effect';
import { type Placed, everyTakeRecorded } from '../core/layout.ts';
import type { Short } from '../core/schema.ts';
import type { SafeZoneName } from '../core/shorts.ts';
import { mixFindings, staticFindings } from './check.ts';
import { Checker } from './checker.ts';
import type { LoadedFilm } from './film-repo.ts';
import { actsOf, lookFindings } from './look.ts';
import { Looker } from './looker.ts';
import { Media } from './media.ts';
import { Mixer, planKey, readMaster } from './mixer.ts';
import type { FlagRule } from './render-plan.ts';

/** `film check` flags that would each run a different set of legs. */
export const CHECK_RULES: ReadonlyArray<FlagRule> = [
  ['sound', 'excludes', 'static', '--static leaves the mix out, --sound runs it'],
  ['sound', 'excludes', 'short', 'a short has no mix of its own'],
];

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
 * the layout at every sampled frame, then the look pass over the film. Acts
 * are judged only over the whole film; a misnamed act fails before any page
 * opens.
 */
export const layoutLeg = Effect.fn('check.layout')(function* (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  options: { readonly workers: number; readonly scenes: Option.Option<ReadonlySet<string>> },
) {
  const declared = Option.filter(film.look, () => Option.isNone(options.scenes));
  const acts = yield* Effect.fromResult(actsOf(declared, placed));
  const layout = yield* (yield* Checker).layout(film, options);
  const looked = yield* (yield* Looker).look(film, options.workers, options.scenes);
  return [...layout, ...lookFindings(looked, acts).map((r) => r.finding)];
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
