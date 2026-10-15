// A film's script (`script.ts`) as the Script reader's mark edits rewrite it:
// the `export const script = defineScript([…])` literal, parsed with
// oxc-parser and never imported (the lab runs for days and never loads a
// film's module). A mark edit is a splice of one beat's `say` string literal
// and nothing else: its words, cues and turns stay as they read, and only its
// delivery marks (`core/delivery.ts`) are written as the reader asked
// (`withDelivery`). The write reads back only when the beat's line parses
// from the new text with the same words and exactly the marks asked for
// (`sayMissed`), so a mark never lands on another word.

import { Array as Arr, Option, Predicate, Result } from 'effect';
import type { ArrayExpression, Expression, ObjectExpression, StringLiteral } from 'oxc-parser';
import { type LineRead, type Mark, marksRefusal } from '../core/delivery.ts';
import { parse, withDelivery } from '../core/narration.ts';
import { SourceRefused } from '../core/refusals.ts';
import { objectOf, parseModule, propertyOf, refuse, spliced, stringText } from './scene-source.ts';

/** A film's script, in its folder. */
export const SCRIPT_FILE = 'script.ts';

/** What a mark write is, as an answer names it. */
export const marksTarget = (beat: string) => `marks:${beat}`;

/** The array of beats `defineScript([…])` (or a bare array) holds. */
const beatsArray = (e: Expression): Option.Option<ArrayExpression> => {
  if (e.type === 'ArrayExpression') return Option.some(e);
  if (e.type === 'TSAsExpression' || e.type === 'TSSatisfiesExpression')
    return beatsArray(e.expression);
  if (e.type === 'CallExpression')
    return Option.flatMap(
      Option.filter(Arr.head(e.arguments), (a): a is Expression => a.type !== 'SpreadElement'),
      beatsArray,
    );
  return Option.none();
};

/** The beats `source` exports as `script`, each an object literal. */
const scriptBeats = (
  source: string,
): Result.Result<ReadonlyArray<ObjectExpression>, SourceRefused> =>
  Result.flatMap(parseModule(SCRIPT_FILE, source), (program) => {
    const found = program.body.flatMap((s) => {
      if (s.type !== 'ExportNamedDeclaration' || s.declaration?.type !== 'VariableDeclaration')
        return [];
      return s.declaration.declarations.flatMap((d) => {
        if (d.id.type !== 'Identifier' || d.id.name !== 'script' || !Predicate.isNotNullish(d.init))
          return [];
        return Option.toArray(beatsArray(d.init));
      });
    });
    return Option.match(Arr.head(found), {
      onNone: () =>
        refuse<ReadonlyArray<ObjectExpression>>(
          SCRIPT_FILE,
          'the script',
          'it exports no `script` array literal (`export const script = defineScript([…])`)',
        ),
      onSome: (beats) =>
        Result.succeed(
          beats.elements.flatMap((e) => {
            if (!Predicate.isNotNullish(e) || e.type === 'SpreadElement') return [];
            return Option.toArray(objectOf(e));
          }),
        ),
    });
  });

/** A beat's `say`, when the beat is an object literal whose `say` is a plain string. */
const sayLiteral = (
  beats: ReadonlyArray<ObjectExpression>,
  beat: string,
  target: string,
): Result.Result<StringLiteral, SourceRefused> => {
  const named = beats.filter((b) =>
    Result.match(propertyOf(SCRIPT_FILE, target, b, 'id'), {
      onFailure: () => false,
      onSuccess: (id) =>
        Option.exists(id, (p) => p.value.type === 'Literal' && p.value.value === beat),
    }),
  );
  const one = Option.filter(Arr.head(named), () => named.length === 1);
  if (Option.isNone(one))
    return refuse(SCRIPT_FILE, target, `the script names beat "${beat}" ${named.length} times`);
  return Result.flatMap(propertyOf(SCRIPT_FILE, target, one.value, 'say'), (say) =>
    Option.match(
      Option.filter(
        Option.map(say, (p) => p.value),
        (v): v is StringLiteral => v.type === 'Literal' && Predicate.isString(v.value),
      ),
      {
        onNone: () =>
          refuse<StringLiteral>(SCRIPT_FILE, target, `beat "${beat}" says no plain string`),
        onSome: Result.succeed,
      },
    ),
  );
};

/** Beat `beat`'s line as `source` writes it. */
const sayIn = (source: string, beat: string, target: string) =>
  Result.map(
    Result.flatMap(scriptBeats(source), (beats) => sayLiteral(beats, beat, target)),
    (literal) => ({ literal, text: literal.value }),
  );

/**
 * `source` with beat `beat`'s line marked `marks` and nothing else changed:
 * refused when the line does not parse, it is no longer `read` (the words
 * and marks the new marks were made on; none from a page older than the
 * lab), or a mark does not fit its words (`marksRefusal`).
 */
export const editMarks = (
  source: string,
  beat: string,
  marks: ReadonlyArray<Mark>,
  read: Option.Option<LineRead>,
): Result.Result<string, SourceRefused> => {
  const target = marksTarget(beat);
  return Result.flatMap(sayIn(source, beat, target), ({ literal, text }) =>
    Result.flatMap(
      Result.mapError(parse(beat, text), (e) =>
        SourceRefused.make({ file: SCRIPT_FILE, target, reason: e.message }),
      ),
      (line) =>
        Option.match(marksRefusal(marks, { spoken: line.spoken, marks: line.delivery }, read), {
          onSome: (why) => refuse<string>(SCRIPT_FILE, target, why),
          onNone: () =>
            spliced(SCRIPT_FILE, source, [
              {
                start: literal.start,
                end: literal.end,
                text: stringText(withDelivery(text, marks)),
              },
            ]),
        }),
    ),
  );
};

/**
 * What a mark write that meant `marks` on beat `beat` missed, read back from
 * the formatted text: none when the line parses with the words it had and
 * exactly those marks.
 */
export const sayMissed = (
  after: string,
  before: string,
  beat: string,
  marks: ReadonlyArray<Mark>,
): Result.Result<ReadonlyArray<string>, SourceRefused> => {
  const target = marksTarget(beat);
  const lineOf = (source: string) =>
    Result.flatMap(sayIn(source, beat, target), ({ text }) =>
      Result.mapError(parse(beat, text), (e) =>
        SourceRefused.make({ file: SCRIPT_FILE, target, reason: e.message }),
      ),
    );
  return Result.flatMap(lineOf(before), (was) =>
    Result.map(lineOf(after), (now) => {
      // The marks compared where they stand: each written into the words.
      const asked = withDelivery(was.spoken, marks);
      const read = withDelivery(was.spoken, now.delivery);
      return [
        ...Arr.filter(
          [`beat "${beat}" no longer says what it said`],
          () => now.spoken !== was.spoken,
        ),
        ...Arr.filter([`beat "${beat}" reads “${read}”, not “${asked}”`], () => read !== asked),
      ];
    }),
  );
};
