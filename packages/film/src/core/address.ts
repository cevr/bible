// An address: which part of a film a command works on. The whole film, one of
// its acts (`look.acts`), some of its scenes, or one of its shorts; a layer
// inside a scene comes later. It is named once (`addressOf`, from what a
// command was given) and resolved once against the placed film
// (`resolveAddress`), so render, check and the look pass read the same
// scenes, span and acts, and a misspelt name fails here with what the film
// has. Pure: it reads only the placed film and its declarations.

import { Array as Arr, Match, Option, Order, Result } from 'effect';
import type { Address } from './address-schema.ts';
import { type PartError, type Stretch, stretchesOf } from './acts.ts';
import {
  AddressConflict,
  ScenesApart,
  type ShortError,
  UnknownAct,
  UnknownShort,
  type UnknownScene,
} from './errors.ts';
import { type Placed, scenesOf } from './layout.ts';
import type { Act, Look, Short } from './schema.ts';
import { resolveShort } from './shorts.ts';
import { FILM_FPS, type Interval } from './time.ts';

export { Address, PartAddress, addressKey, sceneAddress } from './address-schema.ts';

/** What a command was given to name its part: `--act`, `--scene a,b`, `--short`. */
export interface AddressFlags {
  readonly act: Option.Option<string>;
  readonly scene: Option.Option<ReadonlyArray<string>>;
  readonly short: Option.Option<string>;
}

/** The address `flags` name: the film when none, else the one they name; two or more fail. */
export const addressOf = (flags: AddressFlags): Result.Result<Address, AddressConflict> => {
  const named: ReadonlyArray<Option.Option<Address>> = [
    Option.map(flags.act, (act): Address => ({ _tag: 'Act', act })),
    Option.flatMap(flags.scene, (ids) =>
      Option.map(Option.liftPredicate(ids, Arr.isReadonlyArrayNonEmpty), (nonEmpty): Address => ({
        _tag: 'Scenes',
        ids: nonEmpty,
      })),
    ),
    Option.map(flags.short, (id): Address => ({ _tag: 'Short', id })),
  ];
  const given = Arr.getSomes(named);
  if (given.length > 1)
    return Result.fail(
      AddressConflict.make({
        given: given.map((a) => a._tag.toLowerCase()),
      }),
    );
  return Result.succeed(Option.getOrElse(Arr.head(given), (): Address => ({ _tag: 'Film' })));
};

/** A film, as an address is resolved against it. */
export interface Addressable {
  readonly name: string;
  readonly placed: ReadonlyArray<Placed>;
  readonly look: Option.Option<Look>;
  readonly shorts: ReadonlyArray<Short>;
}

/** An address resolved against its film. */
export interface Scope {
  readonly address: Address;
  /** The placed scenes it covers, in film order: every one for the film. */
  readonly scenes: ReadonlyArray<Placed>;
  /**
   * Film seconds it spans when it is a stretch of the film (an act, scenes):
   * none for the whole film, whose range is the command's own, and for a
   * short, which runs on its own clock.
   */
  readonly span: Option.Option<Interval>;
  /** The acts it covers whole, so a colour script is judged on no part of an act. */
  readonly acts: ReadonlyArray<Stretch<Act>>;
  /** The short, for a short. */
  readonly short: Option.Option<Short>;
}

/** Why an address does not resolve: a name the film lacks, or acts or a short that do not lay out. */
export type AddressError =
  | UnknownScene
  | ScenesApart
  | UnknownAct
  | UnknownShort
  | PartError
  | ShortError;

/** The seconds from the first of `scenes` to start to the last to end. */
const spanOf = (scenes: ReadonlyArray<Placed>): Interval => ({
  from: Math.min(...scenes.map((p) => p.start)),
  to: Math.max(...scenes.map((p) => p.start + p.dur)),
});

/** `scenes` as the film orders them, each once. */
const inFilmOrder = (film: Addressable, ids: ReadonlySet<string>) =>
  film.placed.filter((p) => ids.has(p.spec.id));

/**
 * `address` resolved against `film`: its scenes, its span, the acts it
 * covers whole and its short. A short's spans are checked on the film's own
 * clock (`FILM_FPS`), so a misspelt scene, mark or cue fails before a page
 * opens; its page resolves it again on its own frame rate.
 */
export const resolveAddress = (
  film: Addressable,
  address: Address,
): Result.Result<Scope, AddressError> => {
  const acts = Option.match(film.look, {
    onNone: () => Result.succeed<ReadonlyArray<Stretch<Act>>>([]),
    onSome: (look) => stretchesOf(look.acts, film.placed),
  });
  const stretch = (scenes: ReadonlyArray<Placed>) => ({
    scenes,
    span: Option.some(spanOf(scenes)),
    short: Option.none<Short>(),
  });
  return Match.valueTags(address, {
    Film: (whole) =>
      Result.map(acts, (all): Scope => ({
        address: whole,
        scenes: film.placed,
        span: Option.none(),
        acts: all,
        short: Option.none(),
      })),
    Act: (named) =>
      Result.flatMap(acts, (all) =>
        Result.fromOption(
          Option.map(
            Arr.findFirst(all, (a) => a.part.name === named.act),
            (act): Scope => ({
              address: named,
              scenes: inFilmOrder(film, new Set(act.scenes)),
              span: Option.some({ from: act.from, to: act.to }),
              short: Option.none(),
              acts: [act],
            }),
          ),
          () => UnknownAct.make({ act: named.act, known: all.map((a) => a.part.name) }),
        ),
      ),
    // Named in any order, the scenes are one part: its address lists them as
    // the film plays them, so `b,a` and `a,b` key one slot and one stamp. The
    // part is one stretch, so its span covers exactly the scenes it names.
    Scenes: (named) =>
      Result.flatMap(scenesOf(film.placed, named.ids), (): Result.Result<Scope, ScenesApart> => {
        // Every id is the film's here: `scenesOf` refused any other.
        const ids = new Set(named.ids);
        const first = film.placed.findIndex((p) => ids.has(p.spec.id));
        const last = film.placed.findLastIndex((p) => ids.has(p.spec.id));
        const run = film.placed.slice(first, last + 1);
        const between = run.filter((p) => !ids.has(p.spec.id)).map((p) => p.spec.id);
        if (between.length > 0)
          return Result.fail(
            ScenesApart.make({ named: inFilmOrder(film, ids).map((p) => p.spec.id), between }),
          );
        const played = Order.mapInput(Order.Number, (id: string) =>
          run.findIndex((p) => p.spec.id === id),
        );
        return Result.succeed({
          address: { _tag: 'Scenes', ids: Arr.sort(Arr.dedupe(named.ids), played) },
          ...stretch(run),
          acts: [],
        });
      }),
    Short: (named) =>
      Result.flatMap(
        Result.fromOption(
          Arr.findFirst(film.shorts, (s) => s.id === named.id),
          () =>
            UnknownShort.make({
              film: film.name,
              id: named.id,
              known: film.shorts.map((s) => s.id),
            }),
        ),
        (short) =>
          Result.map(resolveShort(film.placed, short, FILM_FPS), (): Scope => ({
            address: named,
            scenes: inFilmOrder(film, new Set(short.spans.map((s) => s.scene))),
            span: Option.none(),
            acts: [],
            short: Option.some(short),
          })),
      ),
  });
};
