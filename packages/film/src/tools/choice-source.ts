// A film's choices as its source declares them, read and rewritten where
// they are written:
//
// - a pick: the `play` string of an object a module exports, down a path of
//   keys: the score's in `sound.ts` (`sound.score.play`), a look's in
//   `palette.ts` (`looks.ground.play`);
// - a look's levels in `palette.ts` (the keys of its `options`), read only.
//
// A sound layer's level in `sound.ts` is the agents' to set, as every other
// literal of a film's source: no page draws a control for it.
//
// Parsed with oxc-parser (as a scene file is, `scene-source.ts`), so the one
// literal rewritten is the one the parser proves is the value in effect.
// Pure: text in, text out.

import { Array as Arr, Option, Predicate, Result } from 'effect';
import type { ObjectExpression, Program } from 'oxc-parser';
import type { SourceRefused } from '../core/refusals.ts';
import {
  declarations,
  keyName,
  objectOf,
  parseModule,
  propertyOf,
  refuse,
  spliced,
  stringText,
  textOf,
  valueOf,
} from './scene-source.ts';

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

/** The names of an object literal's keys, in order; refused when one is computed or spread. */
const keysOf = (
  file: string,
  target: string,
  obj: ObjectExpression,
): Result.Result<ReadonlyArray<string>, SourceRefused> =>
  Result.all(
    obj.properties.map((p) => {
      if (p.type === 'SpreadElement')
        return refuse<string>(
          file,
          target,
          'its object has a spread, so its keys are not provable',
        );
      return Option.match(keyName(p), {
        onNone: () =>
          refuse<string>(
            file,
            target,
            'its object has a computed key, so its keys are not provable',
          ),
        onSome: (name) => Result.succeed(name),
      });
    }),
  );

/**
 * Each look `palette.ts` declares (`export const looks`) and its levels (the
 * keys of its `options`), as the file is written now: what a wedge
 * (`tools/easel.ts`) may draw. A film with no `looks` export has none.
 */
export const lookLevels = (
  file: string,
  source: string,
): Result.Result<ReadonlyMap<string, ReadonlyArray<string>>, SourceRefused> =>
  Result.flatMap(parseModule(file, source), (program) => {
    const target = 'looks';
    const declared = declarations(program)
      .filter(({ exported }) => exported)
      .flatMap(({ decl }) => decl.declarations)
      .some((d) => d.id.type === 'Identifier' && d.id.name === target);
    if (!declared) return Result.succeed(new Map());
    return Result.flatMap(exportedObject(file, program, target, target), (root) =>
      Result.flatMap(keysOf(file, target, root), (looks) =>
        Result.map(
          Result.all(
            looks.map((look) =>
              Result.flatMap(objectAt(file, `look ${look}`, root, [look, 'options']), (options) =>
                Result.map(
                  keysOf(file, `look ${look}`, options),
                  (levels) => [look, levels] as const,
                ),
              ),
            ),
          ),
          (entries) => new Map(entries),
        ),
      ),
    );
  });
