// A film's `sound.ts` as the review reads and edits it: the score's `play`,
// the one option the mix plays, in the `sound` object the module exports.
// Parsed with oxc-parser (as a scene file is, `scene-source.ts`), so the one
// string rewritten is the one the parser proves is the literal `play` names.
// Pure: text in, text out.

import { Option, Predicate, Result } from 'effect';
import type { ObjectExpression } from 'oxc-parser';
import { SourceRefused } from './errors.ts';
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

/** The object literal `export const sound = {...}` declares (through `satisfies` and `as`). */
const soundObject = (
  file: string,
  source: string,
  target: string,
): Result.Result<ObjectExpression, SourceRefused> =>
  Result.flatMap(parseModule(file, source), (program) => {
    const found = declarations(program)
      .filter(({ exported }) => exported)
      .flatMap(({ decl }) => decl.declarations)
      .find((d) => d.id.type === 'Identifier' && d.id.name === 'sound');
    const init = Option.flatMap(Option.fromUndefinedOr(found), (d) => Option.fromNullishOr(d.init));
    return Option.match(Option.flatMap(init, objectOf), {
      onNone: () => refuse(file, target, 'it exports no `sound` object literal'),
      onSome: (obj) => Result.succeed(obj),
    });
  });

/** Where `play` names its option in the text, and the name. */
interface PlayLiteral {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

const playLiteral = (file: string, source: string): Result.Result<PlayLiteral, SourceRefused> => {
  const target = 'score play';
  return Result.flatMap(soundObject(file, source, target), (sound) =>
    Result.flatMap(propertyOf(file, target, sound, 'score'), (score) => {
      const obj = Option.flatMap(Option.flatMap(score, valueOf), objectOf);
      if (Option.isNone(obj)) return refuse(file, target, 'its `score` is not an object literal');
      return Result.flatMap(propertyOf(file, target, obj.value, 'play'), (play) => {
        const value = Option.flatMap(play, valueOf);
        if (Option.isNone(value)) return refuse(file, target, 'its score names no `play`');
        const e = value.value;
        if (e.type !== 'Literal' || !Predicate.isString(e.value))
          return refuse(file, target, `it is \`${source.slice(e.start, e.end)}\`, not a string`);
        return Result.succeed({ start: e.start, end: e.end, value: e.value });
      });
    }),
  );
};

/** The option the score plays, as `sound.ts` declares it now. */
export const readPlay = (file: string, source: string): Result.Result<string, SourceRefused> =>
  Result.map(playLiteral(file, source), (literal) => literal.value);

/** `sound.ts` with its score's `play` set to `option`: only that string changes. */
export const editPlay = (
  file: string,
  source: string,
  option: string,
): Result.Result<string, SourceRefused> =>
  Result.flatMap(playLiteral(file, source), (literal) =>
    spliced(file, source, [{ start: literal.start, end: literal.end, text: stringText(option) }]),
  );
