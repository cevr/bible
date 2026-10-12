// The legs of `film check`, each an Effect over the services it needs, so
// what a leg may cost is in its type. The static leg reads the film's files
// and the master's length and stamp (FileSystem, Media): the lab runs it after
// every write. The sound leg renders the mix the film makes now (Mixer). The
// layout leg draws frames (Checker, Looker). The draw leg draws every scene
// in this process, into the stand-in context, at its moments (no browser).
// The short leg checks one short (Checker). A talk is a vertical film of its
// own: what its words tell (`talkWords`: its length against its format's,
// its first word, its loop's silence) goes with the static leg, and the
// layout leg probes its page for text past every platform's zone and a still
// open. Each hands back its findings; `report` levels and addresses them as
// one Report.

import { Effect, FileSystem, Match, Option, Path, Predicate, Result, Schema } from 'effect';
import type { Film } from '../canvas/film.ts';
import { createTalk } from '../canvas/talk.ts';
import { type Narrated, narrationUrls } from '../player/narrated.ts';
import { drawFindings } from './draw-check.ts';
import { FilmModuleInvalid } from './errors.ts';
import { type Address, type AddressError, type Scope, resolveAddress } from '../core/address.ts';
import {
  type LayoutError,
  type Placed,
  everyTakeRecorded,
  filmEnd,
  layout,
  sceneAt,
} from '../core/layout.ts';
import type { Short } from '../core/schema.ts';
import type { SafeZoneName } from '../core/shorts.ts';
import { talkPhrases } from '../core/talk.ts';
import { mixFindings, staticFindings } from './check.ts';
import { Checker } from './checker.ts';
import {
  type ShortFinding,
  ShortHook,
  ShortLength,
  ShortLoop,
  type StaticFinding,
  ShortUnsafeText,
} from './findings.ts';
import { type LoadedFilm, importFilmModule, masterFile, placeFilm } from './film-repo.ts';
import { type TalkVertical, shortStaticFindings } from './short-check.ts';
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

/** `film` as a vertical film, when it is a talk: its length held to its format's, its phrases as its captions show them. */
const talkVertical = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Option.Option<TalkVertical> =>
  Option.map(film.talk, ({ talk, cut }) => ({
    film: { id: film.paths.name, duration: filmEnd(placed), format: talk.format },
    phrases: talkPhrases(talk, cut, placed),
  }));

/**
 * A vertical finding made on a talk, as the talk's: at the film's scene it is
 * at (a line of text at its second, a late first word at its start, a still
 * open or a title card at the first frame), or of the whole film (its length,
 * its loop). A talk is no short, so none is addressed as one.
 */
const asTalk =
  (placed: ReadonlyArray<Placed>) =>
  (finding: ShortFinding): ShortFinding => {
    const sceneOf = (t: number) =>
      Option.match(sceneAt(placed, t), {
        onNone: () => ({}),
        onSome: (p) => ({ scene: p.spec.id }),
      });
    return Match.value(finding).pipe(
      Match.tagsExhaustive({
        ShortUnsafeText: (f): ShortFinding => ShortUnsafeText.make({ ...f, ...sceneOf(f.at) }),
        ShortHook: (f): ShortFinding => {
          let at = 0;
          if (f.reason === 'late word') at = f.at;
          return ShortHook.make({ ...f, ...sceneOf(at) });
        },
        ShortLoop: (f): ShortFinding => ShortLoop.make({ ...f, talk: true }),
        ShortLength: (f): ShortFinding => ShortLength.make({ ...f, talk: true }),
      }),
    );
  };

/**
 * What a talk's words tell, from its files alone: its length against its
 * format's (`TALK_FORMATS`), its first word, its loop's silence, each the
 * talk's (`asTalk`). None for a film that is not a talk.
 */
const talkWords = (film: LoadedFilm, placed: ReadonlyArray<Placed>): ReadonlyArray<ShortFinding> =>
  Option.match(talkVertical(film, placed), {
    onNone: () => [],
    onSome: (talk) => shortStaticFindings(talk.film, talk.phrases).map(asTalk(placed)),
  });

/**
 * What the film's files tell without a mix or a frame: cues, takes, sounds,
 * the ending, and the master on disk (its length and the plan it was mixed
 * for, against the plan the film mixes to now), named by its place in the
 * film's folder with `/` whatever the platform's separator; and a talk's
 * words held to its format (`talkWords`).
 */
export const staticLeg = Effect.fn('check.static')(function* (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const master = yield* readMaster(fs, yield* Media, film.paths);
  const key = yield* planKey(film, placed);
  const file = path.relative(film.paths.dir, masterFile(film.paths)).split(path.sep).join('/');
  const found: ReadonlyArray<StaticFinding | ShortFinding> = [
    ...staticFindings(film, placed, { master, key, file }),
    ...talkWords(film, placed),
  ];
  return found;
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
 * opens. A talk's page is then probed as a vertical film (`Checker.talk`)
 * over the seconds `scope` spans: its text against every platform's zone,
 * its open for motion, each finding the talk's (`asTalk`).
 */
export const layoutLeg = Effect.fn('check.layout')(function* (
  film: LoadedFilm,
  scope: Scope,
  workers: number,
) {
  const checker = yield* Checker;
  const layout = yield* checker.layout(film, { workers, scope });
  const looked = yield* (yield* Looker).look(film, workers, scope);
  const placed = yield* placeFilm(film);
  const talk = yield* Effect.forEach(Option.toArray(talkVertical(film, placed)), (vertical) =>
    checker.talk(film, vertical, { workers, span: scope.span }),
  );
  return [...layout, ...lookFindings(looked, scope.acts), ...talk.flat().map(asTalk(placed))];
});

/** A film's `film.ts` as the draw leg reads it: the film, built from its narration. */
const FilmFile = Schema.Struct({
  film: Schema.declare((u): u is (narrated: Narrated) => Film => Predicate.isFunction(u)),
});

/** How a drawn film's page builds it: its `film.ts`, from the committed timings. */
const drawnFilm = Effect.fnUntraced(function* (film: LoadedFilm) {
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
  return (): Film => build(narrated);
});

/**
 * `check --draw`: the film as its page builds it (a drawn film's `film.ts`,
 * from the committed timings; a talk's page over its edit, takes and cut,
 * `createTalk`, its footage left undrawn), every moment of the scenes `scope`
 * covers drawn in this process into the stand-in context (`draw-check.ts`):
 * a scene that throws, a frame that is not pure, ink over a face. No browser.
 */
export const drawLeg = Effect.fn('check.draw')(function* (film: LoadedFilm, scope: Scope) {
  const build = yield* Option.match(film.talk, {
    onNone: () => drawnFilm(film),
    onSome: ({ talk, takes, cut }) => Effect.succeed((): Film => createTalk(talk, takes, cut)),
  });
  const scenes = new Set(scope.scenes.map((p) => p.spec.id));
  return yield* Effect.scoped(drawFindings(build, scenes));
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
