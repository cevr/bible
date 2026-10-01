// A film's choices as its source declares them, read and rewritten where
// they are written:
//
// - a pick: the `play` string of an object a module exports, down a path of
//   keys: the score's in `sound.ts` (`sound.score.play`), a look's in
//   `palette.ts` (`looks.ground.play`);
// - a sound layer's level in `sound.ts`: a bed's (`beds[i].level`), an
//   effect's (`effects.gavel.level`) or the score's (`score.under`,
//   `score.alone`). A level written as a module constant (`level: PAPER`)
//   is that constant's, shared by every layer that names it, so it is
//   written once, where it is declared; a level left out is added.
//
// Parsed with oxc-parser (as a scene file is, `scene-source.ts`), so the one
// literal rewritten is the one the parser proves is the value in effect.
// Pure: text in, text out.

import { Array as Arr, Match, Option, Predicate, Result } from 'effect';
import type { ArrayExpression, Expression, ObjectExpression, Program } from 'oxc-parser';
import { type LevelTarget, type SoundLayer, pointIdOf } from '../core/point.ts';
import { SourceRefused } from '../core/refusals.ts';
import { toMs } from '../core/time.ts';
import {
  declarations,
  objectOf,
  parseModule,
  propertyOf,
  spliced,
  stringText,
  valueOf,
} from './scene-source.ts';

const refuse = <A>(file: string, target: string, reason: string): Result.Result<A, SourceRefused> =>
  Result.fail(SourceRefused.make({ file, target, reason }));

const textOf = (source: string, e: Expression) => source.slice(e.start, e.end);

/** The object literal `export const <name> = {...}` declares (through `satisfies` and `as`). */
const exportedObject = (
  file: string,
  program: Program,
  name: string,
  target: string,
): Result.Result<ObjectExpression, SourceRefused> => {
  const found = declarations(program)
    .filter(({ exported }) => exported)
    .flatMap(({ decl }) => decl.declarations)
    .find((d) => d.id.type === 'Identifier' && d.id.name === name);
  const init = Option.flatMap(Option.fromUndefinedOr(found), (d) => Option.fromNullishOr(d.init));
  return Option.match(Option.flatMap(init, objectOf), {
    onNone: () => refuse(file, target, `it exports no \`${name}\` object literal`),
    onSome: (obj) => Result.succeed(obj),
  });
};

/** The object literal at `path` under `obj`: each key's value an object literal. */
const objectAt = (
  file: string,
  target: string,
  obj: ObjectExpression,
  path: ReadonlyArray<string>,
): Result.Result<ObjectExpression, SourceRefused> => {
  const root: Result.Result<ObjectExpression, SourceRefused> = Result.succeed(obj);
  return Arr.reduce(path, root, (at, key) =>
    Result.flatMap(at, (o) =>
      Result.flatMap(propertyOf(file, target, o, key), (prop) =>
        Option.match(Option.flatMap(Option.flatMap(prop, valueOf), objectOf), {
          onNone: () =>
            refuse<ObjectExpression>(file, target, `its \`${key}\` is not an object literal`),
          onSome: (inner) => Result.succeed(inner),
        }),
      ),
    ),
  );
};

// ---------------------------------------------------------------------------
// A pick: `play`.

/** Where a pick names its variant: `play` in the object `exported` declares, down `path`. */
interface PickSite {
  readonly exported: string;
  readonly path: ReadonlyArray<string>;
  /** How the write names itself: `score play`, `look ground play`. */
  readonly target: string;
}

/** The score's pick: `sound.score.play` in `sound.ts`. */
export const SCORE_PLAY: PickSite = { exported: 'sound', path: ['score'], target: 'score play' };

/** A look's pick: `looks.<look>.play` in `palette.ts`. */
export const lookPlay = (look: string): PickSite => ({
  exported: 'looks',
  path: [look],
  target: `look ${look} play`,
});

/** Where `play` names its option in the text, and the name. */
interface PlayLiteral {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

const playLiteral = (
  file: string,
  source: string,
  site: PickSite,
): Result.Result<PlayLiteral, SourceRefused> =>
  Result.flatMap(parseModule(file, source), (program) =>
    Result.flatMap(exportedObject(file, program, site.exported, site.target), (root) =>
      Result.flatMap(objectAt(file, site.target, root, site.path), (obj) =>
        Result.flatMap(propertyOf(file, site.target, obj, 'play'), (play) => {
          const value = Option.flatMap(play, valueOf);
          if (Option.isNone(value)) return refuse(file, site.target, 'it names no `play`');
          const e = value.value;
          if (e.type !== 'Literal' || !Predicate.isString(e.value))
            return refuse(file, site.target, `it is \`${textOf(source, e)}\`, not a string`);
          return Result.succeed({ start: e.start, end: e.end, value: e.value });
        }),
      ),
    ),
  );

/** The variant `site` plays, as the file declares it now. */
export const readPick = (
  file: string,
  source: string,
  site: PickSite,
): Result.Result<string, SourceRefused> =>
  Result.map(playLiteral(file, source, site), (literal) => literal.value);

/** The file with `site`'s `play` set to `option`: only that string changes. */
export const editPick = (
  file: string,
  source: string,
  site: PickSite,
  option: string,
): Result.Result<string, SourceRefused> =>
  Result.flatMap(playLiteral(file, source, site), (literal) =>
    spliced(file, source, [{ start: literal.start, end: literal.end, text: stringText(option) }]),
  );

// ---------------------------------------------------------------------------
// A sound layer's level.

/** How a layer's level is written now. */
export type LevelWritten =
  /** Its own number. */
  | { readonly _tag: 'Own'; readonly value: number }
  /** A module constant's (`level: PAPER`), which every layer naming it shares. */
  | { readonly _tag: 'Shared'; readonly name: string; readonly value: number }
  /** Left out: the library's, else the default, plays. */
  | { readonly _tag: 'Absent' }
  /** Something no knob can rewrite. */
  | { readonly _tag: 'Computed'; readonly text: string };

/** A level knob's point id: `level:bed:3:amb.hall`, `level:const:PAPER`. */
const levelId = (target: LevelTarget): string => pointIdOf({ _tag: 'Level', target });

/** A number literal, negative ones included. */
const numberOf = (e: Expression): Option.Option<number> => {
  if (e.type === 'Literal' && Predicate.isNumber(e.value)) return Option.some(e.value);
  if (
    e.type === 'UnaryExpression' &&
    e.operator === '-' &&
    e.argument.type === 'Literal' &&
    Predicate.isNumber(e.argument.value)
  )
    return Option.some(-e.argument.value);
  return Option.none();
};

/** A string literal's text. */
const stringOf = (e: Expression): Option.Option<string> => {
  if (e.type === 'Literal' && Predicate.isString(e.value)) return Option.some(e.value);
  return Option.none();
};

/** An identifier's name. */
const nameOf = (e: Expression): Option.Option<string> => {
  if (e.type === 'Identifier') return Option.some(e.name);
  return Option.none();
};

/** Module-level `const NAME = <number>`: the constants a level may name. */
const numberConsts = (program: Program): ReadonlyMap<string, Expression> =>
  new Map(
    declarations(program)
      .filter(({ decl }) => decl.kind === 'const')
      .flatMap(({ decl }) => decl.declarations)
      .flatMap((d) => {
        const init = Option.fromNullishOr(d.init);
        if (d.id.type !== 'Identifier' || !Option.exists(init, (e) => Option.isSome(numberOf(e))))
          return [];
        const name = d.id.name;
        return Option.toArray(Option.map(init, (e) => [name, e] as const));
      }),
  );

const layerTarget = (layer: SoundLayer): string => levelId({ _tag: 'Layer', layer });

/** The object literal that holds `layer`'s `level` (a bed, an effect, the score). */
const layerObject = (
  file: string,
  source: string,
  sound: ObjectExpression,
  layer: SoundLayer,
): Result.Result<ObjectExpression, SourceRefused> => {
  const target = layerTarget(layer);
  if (layer._tag === 'Score') return objectAt(file, target, sound, ['score']);
  if (layer._tag === 'Effect') return objectAt(file, target, sound, ['effects', layer.name]);
  return Result.flatMap(propertyOf(file, target, sound, 'beds'), (prop) => {
    const beds = Option.flatMap(prop, valueOf);
    if (Option.isNone(beds) || beds.value.type !== 'ArrayExpression')
      return refuse<ObjectExpression>(file, target, 'its `beds` is not an array literal');
    const elements: ArrayExpression['elements'] = beds.value.elements;
    const element = Option.flatMap(Arr.get(elements, layer.index), Option.fromNullishOr);
    const bed = Option.flatMap(
      Option.filter(element, (e): e is Expression => e.type !== 'SpreadElement'),
      objectOf,
    );
    if (Option.isNone(bed))
      return refuse<ObjectExpression>(file, target, `it has no bed literal at ${layer.index}`);
    return Result.flatMap(propertyOf(file, target, bed.value, 'sound'), (named) => {
      const said = Option.flatMap(Option.flatMap(named, valueOf), stringOf);
      if (!Option.contains(said, layer.sound))
        return refuse<ObjectExpression>(
          file,
          target,
          `bed ${layer.index} plays ${Option.getOrElse(said, () => textOf(source, bed.value))} now, not ${layer.sound}`,
        );
      return Result.succeed(bed.value);
    });
  });
};

/** The property a layer's level is: `level`, or the score's `under` or `alone`. */
const levelKey = (layer: SoundLayer): string => {
  if (layer._tag === 'Score') return layer.which;
  return 'level';
};

/** Where a layer's level is written in the parsed `sound.ts`, and how. */
interface LevelSite {
  readonly written: LevelWritten;
  /** The literal to rewrite (its own, or the constant's), or where to add one. */
  readonly splice: Option.Option<{
    readonly start: number;
    readonly end: number;
    readonly add: boolean;
  }>;
}

const levelSite = (
  file: string,
  source: string,
  program: Program,
  layer: SoundLayer,
): Result.Result<LevelSite, SourceRefused> => {
  const target = layerTarget(layer);
  return Result.flatMap(exportedObject(file, program, 'sound', target), (sound) =>
    Result.flatMap(layerObject(file, source, sound, layer), (obj) =>
      Result.map(propertyOf(file, target, obj, levelKey(layer)), (prop): LevelSite => {
        const value = Option.flatMap(prop, valueOf);
        if (Option.isNone(value)) {
          // Left out: added after the last property, so the object's other fields stay as they are.
          const last = Arr.last(obj.properties);
          return {
            written: { _tag: 'Absent' },
            splice: Option.map(last, (p) => ({ start: p.end, end: p.end, add: true })),
          };
        }
        const e = value.value;
        const own = numberOf(e);
        if (Option.isSome(own))
          return {
            written: { _tag: 'Own', value: own.value },
            splice: Option.some({ start: e.start, end: e.end, add: false }),
          };
        const shared = Option.flatMap(nameOf(e), (name) =>
          Option.map(Option.fromUndefinedOr(numberConsts(program).get(name)), (literal) => ({
            name,
            literal,
          })),
        );
        if (Option.isSome(shared)) {
          const { name, literal } = shared.value;
          return {
            written: { _tag: 'Shared', name, value: Option.getOrElse(numberOf(literal), () => 0) },
            splice: Option.some({ start: literal.start, end: literal.end, add: false }),
          };
        }
        return { written: { _tag: 'Computed', text: textOf(source, e) }, splice: Option.none() };
      }),
    ),
  );
};

/** How a level reads, in words. */
const writtenText = (written: LevelWritten): string =>
  Match.valueTags(written, {
    Own: (w) => String(w.value),
    Shared: (w) => `the constant ${w.name}`,
    Absent: () => 'left out',
    Computed: (w) => `\`${w.text}\``,
  });

/** How `layer`'s level is written in `sound.ts` now. */
export const readLevel = (
  file: string,
  source: string,
  layer: SoundLayer,
): Result.Result<LevelWritten, SourceRefused> =>
  Result.flatMap(parseModule(file, source), (program) =>
    Result.map(levelSite(file, source, program, layer), (site) => site.written),
  );

/** `sound.ts` with `target`'s level set to `value` dB: only that number changes (or is added). */
export const editLevel = (
  file: string,
  source: string,
  target: LevelTarget,
  value: number,
): Result.Result<string, SourceRefused> => {
  const text = String(toMs(value));
  const id = levelId(target);
  return Result.flatMap(parseModule(file, source), (program) => {
    if (target._tag === 'Const')
      return Option.match(Option.fromUndefinedOr(numberConsts(program).get(target.name)), {
        onNone: () => refuse<string>(file, id, `it declares no number constant ${target.name}`),
        onSome: (e) => spliced(file, source, [{ start: e.start, end: e.end, text }]),
      });
    return Result.flatMap(levelSite(file, source, program, target.layer), (site) => {
      if (site.written._tag === 'Shared')
        return refuse<string>(
          file,
          id,
          `its level is the constant ${site.written.name}, which other layers share: write level:const:${site.written.name}`,
        );
      const written = site.written;
      return Option.match(site.splice, {
        onNone: () =>
          refuse<string>(file, id, `its level is ${writtenText(written)}, not a literal`),
        onSome: (at) =>
          spliced(file, source, [
            {
              start: at.start,
              end: at.end,
              text: Match.value(at.add).pipe(
                Match.when(true, () => `, ${levelKey(target.layer)}: ${text}`),
                Match.orElse(() => text),
              ),
            },
          ]),
      });
    });
  });
};
