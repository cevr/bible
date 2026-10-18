// A film's script (`script.ts`, or a version folder's) as the lab rewrites
// it: the `export const script = defineScript([…])` literal, parsed with
// oxc-parser and never imported (the lab runs for days and never loads a
// film's module). Each edit is a splice of the one place it changes, read
// back from the formatted text before it lands:
//
// - a mark edit, of one beat's `say` string literal and nothing else: its
//   words, cues and turns stay as they read, and only its delivery marks
//   (`core/delivery.ts`) are written as the reader asked (`withDelivery`);
//   it reads back only when the beat's line parses from the new text with
//   the same words and exactly the marks asked for (`sayMissed`), so a mark
//   never lands on another word;
// - a move, of the beats array's elements: each beat's text, with the
//   comments and blank lines above it, put in its new place
//   (`editOrder`); it reads back only when the beats read in exactly the
//   order asked, each one's text as it was (`orderMissed`);
// - a hold, of one beat's `lead` or `tail`: its number replaced, the field
//   added after the beat's last field, or taken away for a default
//   (`editHold`); it reads back only when the beat holds exactly that
//   (`holdMissed`).

import { Array as Arr, Option, Predicate, Result } from 'effect';
import type {
  ArrayExpression,
  Expression,
  ObjectExpression,
  ObjectProperty,
  StringLiteral,
} from 'oxc-parser';
import { type HoldEdge, type MovedBefore, type PartOn, movedOrder } from '../core/beat-edit.ts';
import { type LineRead, type Mark, marksRefusal } from '../core/delivery.ts';
import { parse, withDelivery } from '../core/narration.ts';
import { SourceRefused } from '../core/refusals.ts';
import {
  commaBetween,
  numberOf,
  numberText,
  objectOf,
  parseModule,
  propertyOf,
  refuse,
  removal,
  spliced,
  stringText,
  valueOf,
} from './scene-source.ts';

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

/** The array of beats `source` exports as `script`. */
const scriptArray = (source: string): Result.Result<ArrayExpression, SourceRefused> =>
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
        refuse<ArrayExpression>(
          SCRIPT_FILE,
          'the script',
          'it exports no `script` array literal (`export const script = defineScript([…])`)',
        ),
      onSome: Result.succeed,
    });
  });

/** The beats `source` exports as `script`, each an object literal. */
const scriptBeats = (
  source: string,
): Result.Result<ReadonlyArray<ObjectExpression>, SourceRefused> =>
  Result.map(scriptArray(source), (beats) =>
    beats.elements.flatMap((e) => {
      if (!Predicate.isNotNullish(e) || e.type === 'SpreadElement') return [];
      return Option.toArray(objectOf(e));
    }),
  );

/** A beat's id, when it is an object literal whose `id` is a plain string. */
const idOf = (b: ObjectExpression): Option.Option<string> =>
  Result.match(propertyOf(SCRIPT_FILE, 'the script', b, 'id'), {
    onFailure: () => Option.none<string>(),
    onSuccess: (id) =>
      Option.flatMap(id, (p) =>
        Option.liftPredicate(p.value, (v): v is StringLiteral => v.type === 'Literal').pipe(
          Option.flatMap((v) => Option.liftPredicate(v.value, Predicate.isString)),
        ),
      ),
  });

/** The one beat of `beats` whose id is `beat`; refused when the script names it never or twice. */
const beatObject = (
  beats: ReadonlyArray<ObjectExpression>,
  beat: string,
  target: string,
): Result.Result<ObjectExpression, SourceRefused> => {
  const named = beats.filter((b) => Option.contains(idOf(b), beat));
  return Option.match(
    Option.filter(Arr.head(named), () => named.length === 1),
    {
      onNone: () =>
        refuse<ObjectExpression>(
          SCRIPT_FILE,
          target,
          `the script names beat "${beat}" ${named.length} times`,
        ),
      onSome: Result.succeed,
    },
  );
};

/** A beat's `say`, when the beat is an object literal whose `say` is a plain string. */
const sayLiteral = (
  beats: ReadonlyArray<ObjectExpression>,
  beat: string,
  target: string,
): Result.Result<StringLiteral, SourceRefused> =>
  Result.flatMap(beatObject(beats, beat, target), (one) =>
    Result.flatMap(propertyOf(SCRIPT_FILE, target, one, 'say'), (say) =>
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
    ),
  );

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

// ---------------------------------------------------------------------------
// Moves

/** What a move writes, as an answer and the history name it. */
export const moveTarget = (beat: string, before: MovedBefore) =>
  Option.match(before, {
    onNone: () => `move ${beat} to the end`,
    onSome: (b) => `move ${beat} before ${b}`,
  });

/** One element of the beats array: its id (none for one written as no object literal) and its text with what leads it. */
interface Element {
  readonly id: Option.Option<string>;
  /** The blanks and comments between the comma before it (or the array's `[`) and it. */
  readonly lead: string;
  readonly text: string;
}

/**
 * The beats array of `source` as elements, and the text after the last one
 * (a trailing comma, blanks and comments, up to the `]`): refused when an
 * element is a hole or a spread, or a comma does not stand between two.
 */
const elementsOf = (source: string, target: string) =>
  Result.flatMap(scriptArray(source), (array) => {
    const elements: Array<Element> = [];
    let from = array.start + 1;
    for (const e of array.elements) {
      if (!Predicate.isNotNullish(e) || e.type === 'SpreadElement')
        return refuse<{
          readonly array: ArrayExpression;
          readonly elements: ReadonlyArray<Element>;
          readonly tail: string;
        }>(
          SCRIPT_FILE,
          target,
          'the beats array holds a hole or a spread, so its order is not provable',
        );
      elements.push({
        id: Option.flatMap(objectOf(e), idOf),
        lead: source.slice(from, e.start),
        text: source.slice(e.start, e.end),
      });
      // The next element is led from just after the comma that ends this one.
      const next = Option.match(Arr.get(array.elements, elements.length), {
        onNone: () => array.end - 1,
        onSome: (n) =>
          Option.match(Option.fromNullishOr(n), {
            onNone: () => array.end - 1,
            onSome: (m) => m.start,
          }),
      });
      const comma = commaBetween(source, e.end, next);
      from = Option.getOrElse(
        Option.map(comma, (c) => c + 1),
        () => e.end,
      );
      if (Option.isNone(comma) && elements.length < array.elements.length)
        return refuse<{
          readonly array: ArrayExpression;
          readonly elements: ReadonlyArray<Element>;
          readonly tail: string;
        }>(SCRIPT_FILE, target, 'two beats stand with no comma between them');
    }
    return Result.succeed({ array, elements, tail: source.slice(from, array.end - 1) });
  });

/**
 * `source` with beat `beat` moved before beat `before` (to the end when
 * none): each element's text, with the comments and blanks that lead it,
 * put in its new place, and nothing else changed. Refused when the script
 * names either beat more than once, or when `movedOrder`
 * refuses the move on the order `source` holds, `parts` (the acts, the
 * score's movements) kept: judged on the text the writer's lock holds.
 */
export const editOrder = (
  source: string,
  beat: string,
  before: MovedBefore,
  parts: ReadonlyArray<ReadonlyArray<PartOn>> = [],
): Result.Result<string, SourceRefused> => {
  const target = moveTarget(beat, before);
  return Result.flatMap(elementsOf(source, target), ({ array, elements, tail }) => {
    const index = (id: string) => elements.findIndex((e) => Option.contains(e.id, id));
    const named = (id: string) => elements.filter((e) => Option.contains(e.id, id)).length;
    for (const id of [beat, ...Option.toArray(before)])
      if (named(id) > 1)
        return refuse<string>(
          SCRIPT_FILE,
          target,
          `the script names beat "${id}" ${named(id)} times`,
        );
    const judged = movedOrder(
      elements.map((e) => Option.getOrElse(e.id, () => '')),
      beat,
      before,
      parts,
    );
    if (Result.isFailure(judged)) return refuse<string>(SCRIPT_FILE, target, judged.failure);
    const moving = Arr.getUnsafe(elements, index(beat));
    const rest = elements.filter((e) => e !== moving);
    const at = Option.match(before, {
      onNone: () => rest.length,
      onSome: (b) => rest.findIndex((e) => Option.contains(e.id, b)),
    });
    const order = [...rest.slice(0, at), moving, ...rest.slice(at)];
    const inner = order.map((e) => `${e.lead}${e.text}`).join(',');
    return spliced(SCRIPT_FILE, source, [
      { start: array.start + 1, end: array.end - 1, text: `${inner}${tail}` },
    ]);
  });
};

/**
 * What a move of `beat` before `before` missed, read back from the formatted
 * text `after` against `was`, the text it was made from: none when the
 * beats read in exactly the order asked and each one's text is as it was.
 */
export const orderMissed = (
  after: string,
  was: string,
  beat: string,
  before: MovedBefore,
): Result.Result<ReadonlyArray<string>, SourceRefused> => {
  const target = moveTarget(beat, before);
  return Result.flatMap(elementsOf(was, target), (then) =>
    Result.map(elementsOf(after, target), (now) => {
      const ids = (es: ReadonlyArray<Element>) => es.map((e) => Option.getOrElse(e.id, () => '?'));
      const rest = ids(then.elements).filter((id) => id !== beat);
      const at = Option.match(before, {
        onNone: () => rest.length,
        onSome: (b) => rest.indexOf(b),
      });
      const asked = [...rest.slice(0, at), beat, ...rest.slice(at)];
      const read = ids(now.elements);
      const textOf = (es: ReadonlyArray<Element>, id: string) =>
        Option.map(
          Arr.findFirst(es, (e) => Option.contains(e.id, id)),
          (e) => e.text,
        );
      const changed = asked.filter(
        (id) =>
          Option.getOrElse(textOf(then.elements, id), () => '') !==
          Option.getOrElse(textOf(now.elements, id), () => ''),
      );
      return [
        ...Arr.filter(
          [`the beats read ${read.join(', ')}, not ${asked.join(', ')}`],
          () => read.join(',') !== asked.join(','),
        ),
        ...changed.map((id) => `beat "${id}" no longer reads as it did`),
      ];
    }),
  );
};

// ---------------------------------------------------------------------------
// Holds

/** What a hold writes, as an answer and the history name it. */
export const holdTarget = (beat: string, edge: HoldEdge) => `hold ${beat} ${edge}`;

/** The hold beat `beat` declares at `edge` in `source`: none when it declares none, refused when it is no number. */
const declaredHold = (
  source: string,
  beat: string,
  edge: HoldEdge,
): Result.Result<Option.Option<number>, SourceRefused> => {
  const target = holdTarget(beat, edge);
  return Result.flatMap(
    Result.flatMap(scriptBeats(source), (beats) => beatObject(beats, beat, target)),
    (one) =>
      Result.flatMap(propertyOf(SCRIPT_FILE, target, one, edge), (prop) =>
        Option.match(prop, {
          onNone: () => Result.succeed(Option.none<number>()),
          onSome: (p) =>
            Option.match(Option.flatMap(valueOf(p), numberOf), {
              onNone: () =>
                refuse<Option.Option<number>>(
                  SCRIPT_FILE,
                  target,
                  `beat "${beat}" holds its ${edge} by no number`,
                ),
              onSome: (v) => Result.succeed(Option.some(v)),
            }),
        }),
      ),
  );
};

/**
 * `source` with beat `beat`'s `edge` written as `value` (none: taken away,
 * the beat on its default): the number replaced where it is one, added after
 * the beat's last field where it is not there. Refused over a hold the
 * script computes, which the lab cannot prove it replaced.
 */
export const editHold = (
  source: string,
  beat: string,
  edge: HoldEdge,
  value: Option.Option<number>,
): Result.Result<string, SourceRefused> => {
  const target = holdTarget(beat, edge);
  return Result.flatMap(
    Result.flatMap(scriptBeats(source), (beats) => beatObject(beats, beat, target)),
    (one) =>
      Result.flatMap(propertyOf(SCRIPT_FILE, target, one, edge), (prop) => {
        if (Option.exists(prop, (p) => Option.isNone(Option.flatMap(valueOf(p), numberOf))))
          return refuse<string>(
            SCRIPT_FILE,
            target,
            `beat "${beat}" holds its ${edge} by no number`,
          );
        return Option.match(value, {
          onNone: () =>
            Option.match(prop, {
              onNone: () => Result.succeed(source),
              onSome: (p: ObjectProperty) => spliced(SCRIPT_FILE, source, removal(source, one, p)),
            }),
          onSome: (v) =>
            Option.match(prop, {
              onSome: (p: ObjectProperty) =>
                spliced(SCRIPT_FILE, source, [
                  { start: p.value.start, end: p.value.end, text: numberText(v) },
                ]),
              onNone: () =>
                Option.match(Arr.last(one.properties), {
                  onNone: () =>
                    refuse<string>(SCRIPT_FILE, target, `beat "${beat}" is an empty object`),
                  onSome: (last) =>
                    spliced(SCRIPT_FILE, source, [
                      { start: last.end, end: last.end, text: `, ${edge}: ${numberText(v)}` },
                    ]),
                }),
            }),
        });
      }),
  );
};

/**
 * What a hold write that meant `value` at `edge` of beat `beat` missed, read
 * back from the formatted text: none when the beat holds exactly that (none:
 * declares none).
 */
export const holdMissed = (
  after: string,
  beat: string,
  edge: HoldEdge,
  value: Option.Option<number>,
): Result.Result<ReadonlyArray<string>, SourceRefused> =>
  Result.map(declaredHold(after, beat, edge), (read) => {
    const said = (v: Option.Option<number>) =>
      Option.match(v, { onNone: () => 'none', onSome: (n) => `${n}` });
    return Arr.filter(
      [`beat "${beat}" holds its ${edge} as ${said(read)}, not ${said(value)}`],
      () => said(read) !== said(value),
    );
  });
