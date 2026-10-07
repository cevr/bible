// A scene file as the lab reads and edits it: the `drawing({...})` calls a
// module exports, the `timeline` and `knobs` object literals inside them (or
// the module-level `const` literal they name), and the splices that change one
// value there. Parsed with oxc-parser, so every position is the parser's,
// never a regex's guess. Pure: text in, text out.
//
// An edit rewrites only a value the parser proves is a literal: a number
// (`0.4`, `-0.2`), a string (`'inQuad'`), a literal cue/landmark end
// (`{ cue: 'roll' }`) or a two-number array (`[960, 800]`).
// A computed value, a spread, a shorthand or a duplicate key is refused, since
// the lab could not say what it would be changing. A missing `offset`, `dur`,
// `until`, `untilOffset`, `ease` or `stagger` is added after the span's anchor, in
// that order; a span ends one way, so a `dur` written replaces its `until`, and an
// `until` its `dur`. A key the span `patchSpan` makes lacks is taken away: an
// `untilOffset` once a `dur` or a new `until` ends the span (or 0 puts the end
// back on its point), an `ends` once it runs `until` a point. A write is
// judged by the span its text holds (`cueLanded`), decoded, never rebuilt.

import { Array as Arr, Equal, Match, Option, Predicate, Result, Schema } from 'effect';
import {
  type ArrayExpression,
  type CallExpression,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  type Program,
  type Statement,
  Visitor,
  parseSync,
} from 'oxc-parser';
import { CUE_PATCH_KEYS, type CuePatch, type Knob, Span, Until } from '../core/schema.ts';
import { SourceRefused } from '../core/refusals.ts';
import { toMs } from '../core/time.ts';
import { patchSpan, writtenPatch } from '../core/timeline.ts';

/** A `timeline` or `knobs` property: an object literal, something else, or not there. */
type Slot =
  | { readonly _tag: 'Literal'; readonly node: ObjectExpression }
  | { readonly _tag: 'Computed'; readonly text: string }
  | { readonly _tag: 'Absent' };

/** One `drawing({...})` call a module exports: its names, and its timeline and knobs literals. */
export interface DrawingSite {
  /** Every name the module exports it under (`hand_`, and `hand` from `export { hand_ as hand }`). */
  readonly exports: ReadonlyArray<string>;
  /** Where the call starts: two export names with the same start are one drawing. */
  readonly at: number;
  readonly timeline: Slot;
  readonly knobs: Slot;
}

/** What a field holds in the source: a literal the lab may rewrite, nothing yet, or code. */
type FieldState = 'literal' | 'absent' | 'computed';

/** A cue, and what each field a patch may set holds in its source. */
type EditableCue = { readonly name: string } & {
  readonly [K in keyof CuePatch]-?: FieldState;
};

interface EditableKnob {
  readonly name: string;
  readonly state: FieldState;
}

/** Which of a drawing's cues and knobs the lab can rewrite. */
export interface Editable {
  readonly cues: ReadonlyArray<EditableCue>;
  readonly knobs: ReadonlyArray<EditableKnob>;
}

interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** The keys a span is anchored by; the lab writes the timing fields after them, in order. */
const ANCHORS: ReadonlyArray<string> = ['mark', 'word', 'after', 'with', 'at'];
const TIMING = CUE_PATCH_KEYS;
type TimingKey = keyof CuePatch;

/**
 * A number as the lab writes it: to the millisecond (`toMs`), never `-0`; the
 * rule `writtenPatch` applies to a cue write, so a cue's numbers come here
 * already rounded and print as judged.
 */
const numberText = (v: number) => String(toMs(v));

/** A single-quoted string literal. */
export const stringText = (v: string) => `'${v.replace(/[\\']/g, (c) => `\\${c}`)}'`;

/** A refusal to edit `target` in `file`, and why. */
export const refuse = <A>(
  file: string,
  target: string,
  reason: string,
): Result.Result<A, SourceRefused> => Result.fail(SourceRefused.make({ file, target, reason }));

/** An expression's text as the source writes it. */
export const textOf = (source: string, e: Expression) => source.slice(e.start, e.end);

/** Parse a module, or say where it fails to. */
export const parseModule = (
  file: string,
  source: string,
): Result.Result<Program, SourceRefused> => {
  const parsed = parseSync(file, source, { lang: 'ts', sourceType: 'module' });
  return Option.match(Arr.head(parsed.errors), {
    onNone: () => Result.succeed(parsed.program),
    onSome: (error) => refuse(file, 'the module', `it does not parse: ${error.message}`),
  });
};

/** A property key's name, when it is a plain name or string (not computed). */
export const keyName = (p: ObjectProperty): Option.Option<string> => {
  if (p.computed) return Option.none();
  if (p.key.type === 'Identifier') return Option.some(p.key.name);
  if (p.key.type === 'Literal' && Predicate.isString(p.key.value)) return Option.some(p.key.value);
  return Option.none();
};

/**
 * The property `name` of an object literal, when there is one. Refused when
 * the object could hide it: a spread, a computed key, or the key twice.
 */
export const propertyOf = (
  file: string,
  target: string,
  obj: ObjectExpression,
  name: string,
): Result.Result<Option.Option<ObjectProperty>, SourceRefused> => {
  const found: Array<ObjectProperty> = [];
  for (const p of obj.properties) {
    if (p.type === 'SpreadElement')
      return refuse(
        file,
        target,
        'its object has a spread, so the value in effect is not provable',
      );
    const key = keyName(p);
    if (Option.isNone(key))
      return refuse(file, target, 'its object has a computed key, so the value is not provable');
    if (key.value === name) found.push(p);
  }
  if (found.length > 1) return refuse(file, target, `"${name}" is declared ${found.length} times`);
  return Result.succeed(Arr.head(found));
};

/** A number literal, negative ones included. */
export const numberOf = (e: Expression): Option.Option<number> => {
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
export const stringOf = (e: Expression): Option.Option<string> => {
  if (e.type === 'Literal' && Predicate.isString(e.value)) return Option.some(e.value);
  return Option.none();
};

type Element = ArrayExpression['elements'][number];

/** An array element that is an expression (not a hole, not a spread). */
const expressionOf = (e: Option.Option<Element>): Option.Option<Expression> =>
  Option.filter(
    Option.flatMap(e, Option.fromNullishOr),
    (x): x is Expression => x.type !== 'SpreadElement',
  );

/** A two-number array literal's elements. */
const pointOf = (e: Expression): Option.Option<readonly [Expression, Expression]> => {
  if (e.type !== 'ArrayExpression' || e.elements.length !== 2) return Option.none();
  return Option.zipWith(
    expressionOf(Arr.get(e.elements, 0)),
    expressionOf(Arr.get(e.elements, 1)),
    (x, y) => [x, y] satisfies readonly [Expression, Expression],
  ).pipe(Option.filter(([x, y]) => Option.isSome(numberOf(x)) && Option.isSome(numberOf(y))));
};

const isNumberLiteral = (e: Expression) => Option.isSome(numberOf(e));
const isStringLiteral = (e: Expression) => Option.isSome(stringOf(e));
const isKnobLiteral = (e: Expression) => isNumberLiteral(e) || Option.isSome(pointOf(e));

/** A property's value, unless it is a shorthand (`{ palm }`: a name, not a literal). */
export const valueOf = (p: ObjectProperty): Option.Option<Expression> => {
  if (p.shorthand) return Option.none();
  return Option.some(p.value);
};

/** The variable declarations at the top of a module, with `export const` unwrapped. */
export const declarations = (program: Program) =>
  program.body.flatMap((s: Statement) => {
    if (s.type === 'VariableDeclaration') return [{ exported: false, decl: s }];
    if (s.type === 'ExportNamedDeclaration' && s.declaration?.type === 'VariableDeclaration')
      return [{ exported: true, decl: s.declaration }];
    return [];
  });

/** The local names `drawing` is imported under. */
const drawingNames = (program: Program): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const s of program.body) {
    if (s.type !== 'ImportDeclaration') continue;
    for (const sp of s.specifiers)
      if (
        sp.type === 'ImportSpecifier' &&
        sp.imported.type === 'Identifier' &&
        sp.imported.name === 'drawing'
      )
        names.add(sp.local.name);
  }
  return names;
};

/** `export { local as name }` (no `from`): local → the names it is exported as. */
const exportedAs = (program: Program): ReadonlyMap<string, ReadonlyArray<string>> => {
  const out = new Map<string, Array<string>>();
  for (const s of program.body) {
    if (s.type !== 'ExportNamedDeclaration' || Predicate.isNotNullish(s.source)) continue;
    for (const sp of s.specifiers) {
      if (sp.local.type !== 'Identifier' || sp.exported.type !== 'Identifier') continue;
      const names = out.get(sp.local.name) ?? [];
      names.push(sp.exported.name);
      out.set(sp.local.name, names);
    }
  }
  return out;
};

/** An object literal, seen through `as const` and `satisfies`. */
export const objectOf = (e: Expression): Option.Option<ObjectExpression> => {
  if (e.type === 'ObjectExpression') return Option.some(e);
  if (e.type === 'TSAsExpression' || e.type === 'TSSatisfiesExpression')
    return objectOf(e.expression);
  return Option.none();
};

/** Module-level `const name = {...}` bindings: a scene lifts its timeline to type its shots. */
const constObjects = (program: Program): ReadonlyMap<string, ObjectExpression> =>
  new Map(
    declarations(program)
      .filter(({ decl }) => decl.kind === 'const')
      .flatMap(({ decl }) =>
        decl.declarations.flatMap((d) => {
          if (d.id.type !== 'Identifier' || !Predicate.isNotNullish(d.init)) return [];
          const name = d.id.name;
          return Option.match(objectOf(d.init), {
            onNone: () => [],
            onSome: (node) => [[name, node] as const],
          });
        }),
      ),
  );

/** A slot's value: an object literal inline, or the const literal a name refers to. */
const literalValue = (
  consts: ReadonlyMap<string, ObjectExpression>,
  value: Expression,
): Option.Option<ObjectExpression> => {
  if (value.type === 'Identifier') return Option.fromUndefinedOr(consts.get(value.name));
  return objectOf(value);
};

const slotOf = (
  source: string,
  consts: ReadonlyMap<string, ObjectExpression>,
  obj: ObjectExpression,
  name: string,
): Slot => {
  for (const p of obj.properties) {
    if (p.type === 'SpreadElement' || !Option.contains(keyName(p), name)) continue;
    return Option.match(literalValue(consts, p.value), {
      onNone: (): Slot => ({ _tag: 'Computed', text: textOf(source, p.value) }),
      onSome: (node): Slot => ({ _tag: 'Literal', node }),
    });
  }
  return { _tag: 'Absent' };
};

/** The object passed to a top-level `drawing(...)` call, when a declarator's value is one. */
const drawingCall = (
  names: ReadonlySet<string>,
  value: Option.Option<Expression>,
): Option.Option<{ readonly at: number; readonly arg: ObjectExpression }> => {
  if (Option.isNone(value) || value.value.type !== 'CallExpression') return Option.none();
  const init = value.value;
  if (init.callee.type !== 'Identifier' || !names.has(init.callee.name)) return Option.none();
  const [arg] = init.arguments;
  if (!Predicate.isNotNullish(arg) || arg.type !== 'ObjectExpression') return Option.none();
  return Option.some({ at: init.start, arg });
};

/** Every exported `drawing({...})` call in a parsed module. */
export const drawingSites = (source: string, program: Program): ReadonlyArray<DrawingSite> => {
  const names = drawingNames(program);
  const renamed = exportedAs(program);
  const consts = constObjects(program);
  return declarations(program).flatMap(({ exported, decl }) =>
    decl.declarations.flatMap((d): ReadonlyArray<DrawingSite> => {
      if (d.id.type !== 'Identifier') return [];
      const local = d.id.name;
      const exports = [...Arr.filter([local], () => exported), ...(renamed.get(local) ?? [])];
      if (exports.length === 0) return [];
      return Option.match(drawingCall(names, Option.fromNullishOr(d.init)), {
        onNone: () => [],
        onSome: ({ at, arg }) => [
          {
            exports,
            at,
            timeline: slotOf(source, consts, arg, 'timeline'),
            knobs: slotOf(source, consts, arg, 'knobs'),
          },
        ],
      });
    }),
  );
};

/** A place in a module the lab cannot locate or edit: the source range to point at, and why. */
interface Unlocatable {
  readonly start: number;
  readonly end: number;
  readonly reason: string;
}

/** The slots of a drawing the lab writes to. */
const SLOTS: ReadonlySet<string> = new Set(['timeline', 'knobs']);

const unlocatableAt = (
  node: { readonly start: number; readonly end: number },
  reason: string,
): Unlocatable => ({ start: node.start, end: node.end, reason });

/** What the lab cannot prove in a located drawing's object: a spread, a slot twice, a slot that is not a literal. */
const argumentDefects = (
  consts: ReadonlyMap<string, ObjectExpression>,
  arg: ObjectExpression,
): ReadonlyArray<Unlocatable> => {
  const seen = new Set<string>();
  return arg.properties.flatMap((p): ReadonlyArray<Unlocatable> => {
    if (p.type === 'SpreadElement')
      return [
        unlocatableAt(p, 'A spread in drawing({…}): the lab cannot prove what it would edit.'),
      ];
    const slot = Option.filter(keyName(p), (k) => SLOTS.has(k));
    if (Option.isNone(slot)) return [];
    const name = slot.value;
    if (seen.has(name))
      return [
        unlocatableAt(
          p,
          `drawing's ${name} is declared twice: the lab would edit the first, and the film runs the last.`,
        ),
      ];
    seen.add(name);
    if (Option.isSome(literalValue(consts, p.value))) return [];
    return [
      unlocatableAt(
        p,
        `drawing's ${name} is not an object literal or a module-level const literal: the lab cannot locate or edit it.`,
      ),
    ];
  });
};

/** An object with both a `timeline` and a `draw`: a scene, typed or not. */
const isScene = (node: ObjectExpression): boolean => {
  const keys = node.properties.flatMap((p) => {
    if (p.type === 'SpreadElement') return [];
    return Option.toArray(keyName(p));
  });
  return keys.includes('timeline') && keys.includes('draw');
};

/** Why a `drawing(…)` call the locator skips is skipped. */
const skippedBecause = (arg: Option.Option<CallExpression['arguments'][number]>): string => {
  if (Option.exists(arg, (a) => a.type === 'ObjectExpression'))
    return 'This drawing({…}) is not a module-level `export const x = drawing({…})` (or a const exported by name): the lab locates only those, so it cannot find this scene.';
  return 'drawing(…) takes an object literal: the lab cannot locate a scene built elsewhere.';
};

/**
 * Everything in a module the lab's locator (`drawingSites`) cannot locate or
 * edit, where it is written: a `drawing(…)` call that is not an exported
 * module-level declarator, a slot that is not a literal the locator resolves,
 * `drawing` read off a namespace, and a scene object that skips `drawing()`.
 * The `film/drawing-literal` lint rule reports exactly these, so the rule and
 * the lab read a scene the same way.
 */
export const unlocatable = (source: string, program: Program): ReadonlyArray<Unlocatable> => {
  const names = drawingNames(program);
  const consts = constObjects(program);
  const located = new Set(drawingSites(source, program).map((s) => s.at));
  const found: Array<Unlocatable> = [];
  const passed = new Set<number>();
  const scenes: Array<ObjectExpression> = [];
  const pass = (call: CallExpression) =>
    Option.map(Arr.head(call.arguments), (arg) => {
      if (arg.type === 'ObjectExpression') passed.add(arg.start);
      return arg;
    });
  new Visitor({
    CallExpression: (call) => {
      const callee = call.callee;
      if (callee.type === 'MemberExpression') {
        if (callee.computed || callee.property.type !== 'Identifier') return;
        if (callee.property.name !== 'drawing') return;
        pass(call);
        found.push(
          unlocatableAt(
            call,
            'drawing is read off an object here: the lab resolves it only as a named import (`import { drawing } from …`).',
          ),
        );
        return;
      }
      if (callee.type !== 'Identifier' || !names.has(callee.name)) return;
      const arg = pass(call);
      if (!located.has(call.start)) {
        found.push(unlocatableAt(call, skippedBecause(arg)));
        return;
      }
      Option.map(
        Option.filter(arg, (a): a is ObjectExpression => a.type === 'ObjectExpression'),
        (obj) => found.push(...argumentDefects(consts, obj)),
      );
    },
    ObjectExpression: (obj) => {
      if (isScene(obj)) scenes.push(obj);
    },
  }).visit(program);
  const bare = scenes
    .filter((obj) => !passed.has(obj.start))
    .map((obj) =>
      unlocatableAt(
        obj,
        'A scene with a timeline goes through drawing(), so its cues are typed and the lab can locate it.',
      ),
    );
  return [...found, ...bare].sort((a, b) => a.start - b.start);
};

/** The drawing a module exports as `name`, read from its source now. */
const siteNamed = (
  file: string,
  source: string,
  name: string,
): Result.Result<DrawingSite, SourceRefused> =>
  Result.flatMap(parseModule(file, source), (program) =>
    Option.match(
      Arr.findFirst(drawingSites(source, program), (s) => s.exports.includes(name)),
      {
        onNone: () =>
          refuse(file, `drawing ${name}`, `the module exports no drawing({...}) named ${name}`),
        onSome: Result.succeed,
      },
    ),
  );

const matchSlot = Match.type<Slot>();

/** The `timeline` or `knobs` object literal of the drawing exported as `name`. */
const literalOf = (
  file: string,
  source: string,
  name: string,
  slot: 'timeline' | 'knobs',
): Result.Result<ObjectExpression, SourceRefused> =>
  Result.flatMap(siteNamed(file, source, name), (site) =>
    matchSlot.pipe(
      Match.tagsExhaustive({
        Literal: (s) => Result.succeed(s.node),
        Computed: (s) =>
          refuse<ObjectExpression>(file, slot, `it is \`${s.text}\`, not an object literal`),
        Absent: () => refuse<ObjectExpression>(file, slot, `drawing ${name} declares no ${slot}`),
      }),
    )(site[slot]),
  );

/** The object literal of cue `cue` in the drawing's timeline. */
const spanOf = (
  file: string,
  source: string,
  name: string,
  cue: string,
): Result.Result<ObjectExpression, SourceRefused> =>
  Result.flatMap(literalOf(file, source, name, 'timeline'), (timeline) =>
    Result.flatMap(propertyOf(file, `cue ${cue}`, timeline, cue), (prop) => {
      if (Option.isNone(prop)) return refuse(file, `cue ${cue}`, 'the timeline has no such cue');
      const p = prop.value;
      if (p.shorthand || p.value.type !== 'ObjectExpression')
        return refuse(
          file,
          `cue ${cue}`,
          `it is \`${textOf(source, p.value)}\`, not an object literal`,
        );
      return Result.succeed(p.value);
    }),
  );

/** A boolean literal's value (`ends: true`, `silence: true`). */
const booleanOf = (e: Expression): Option.Option<boolean> => {
  if (e.type === 'Literal' && Predicate.isBoolean(e.value)) return Option.some(e.value);
  return Option.none();
};

/** An expression of literals only (numbers, strings, booleans, arrays, objects), as plain data. */
const plain = (e: Expression): Option.Option<unknown> => {
  const scalar = Option.firstSomeOf<unknown>([numberOf(e), stringOf(e), booleanOf(e)]);
  if (Option.isSome(scalar)) return scalar;
  if (e.type === 'ArrayExpression')
    return Option.all(e.elements.map((x) => Option.flatMap(expressionOf(Option.some(x)), plain)));
  if (e.type !== 'ObjectExpression') return Option.none();
  return Option.map(
    Option.filter(
      Option.all(
        e.properties.map((p) => {
          if (p.type === 'SpreadElement') return Option.none();
          return Option.zipWith(
            keyName(p),
            Option.flatMap(valueOf(p), plain),
            (k, v): readonly [string, unknown] => [k, v],
          );
        }),
      ),
      (entries) => new Set(entries.map(([key]) => key)).size === entries.length,
    ),
    Object.fromEntries,
  );
};

const decodeUntil = Schema.decodeUnknownOption(Until, { onExcessProperty: 'error' });
const decodeSpan = Schema.decodeUnknownOption(Span);

/** A mark or cue/landmark object with every value declared literally. */
const isUntilLiteral = (e: Expression): boolean =>
  Option.isSome(Option.flatMap(plain(e), decodeUntil));

const fieldState = (prop: Option.Option<ObjectProperty>, literal: (e: Expression) => boolean) =>
  Option.match(prop, {
    onNone: (): FieldState => 'absent',
    onSome: (p): FieldState => {
      if (Option.exists(valueOf(p), literal)) return 'literal';
      return 'computed';
    },
  });

const editableCue = (file: string, cue: string, span: ObjectExpression): EditableCue => {
  const state = (key: TimingKey, literal: (e: Expression) => boolean) =>
    Result.match(propertyOf(file, cue, span, key), {
      onFailure: (): FieldState => 'computed',
      onSuccess: (prop) => fieldState(prop, literal),
    });
  return {
    name: cue,
    offset: state('offset', isNumberLiteral),
    dur: state('dur', isNumberLiteral),
    until: state('until', isUntilLiteral),
    untilOffset: state('untilOffset', isNumberLiteral),
    ease: state('ease', isStringLiteral),
    stagger: state('stagger', isNumberLiteral),
  };
};

const literalProperties = (slot: Slot): ReadonlyArray<ObjectProperty> => {
  if (slot._tag !== 'Literal') return [];
  return slot.node.properties.flatMap((p) => {
    if (p.type === 'SpreadElement') return [];
    return [p];
  });
};

/** Which cues and knobs of the drawing exported as `name` the lab can rewrite. */
export const editable = (
  file: string,
  source: string,
  name: string,
): Result.Result<Editable, SourceRefused> =>
  Result.map(siteNamed(file, source, name), (site) => ({
    cues: literalProperties(site.timeline).flatMap((p) =>
      Option.match(
        Option.zipWith(keyName(p), valueOf(p), (cue, span) => ({ cue, span })),
        {
          onNone: (): ReadonlyArray<EditableCue> => [],
          onSome: ({ cue, span }): ReadonlyArray<EditableCue> => {
            if (span.type !== 'ObjectExpression') return [];
            return [editableCue(file, cue, span)];
          },
        },
      ),
    ),
    knobs: literalProperties(site.knobs).flatMap((p) =>
      Option.match(keyName(p), {
        onNone: () => [],
        onSome: (knob) => [{ name: knob, state: fieldState(Option.some(p), isKnobLiteral) }],
      }),
    ),
  }));

const applySplices = (source: string, splices: ReadonlyArray<Splice>) =>
  [...splices]
    .sort((a, b) => b.start - a.start)
    .reduce((text, s) => text.slice(0, s.start) + s.text + text.slice(s.end), source);

/** The new source, once it still parses. */
export const spliced = (file: string, source: string, splices: ReadonlyArray<Splice>) => {
  const next = applySplices(source, splices);
  return Result.map(parseModule(file, next), () => next);
};

const valueText = (key: TimingKey, patch: CuePatch): Option.Option<string> => {
  switch (key) {
    case 'offset':
      return Option.map(Option.fromUndefinedOr(patch.offset), numberText);
    case 'dur':
      return Option.map(Option.fromUndefinedOr(patch.dur), numberText);
    case 'until':
      return Option.map(Option.fromUndefinedOr(patch.until), stringText);
    case 'untilOffset':
      // 0 is the point itself: the key is taken away (`droppedBy`), never written.
      return Option.map(
        Option.filter(Option.fromUndefinedOr(patch.untilOffset), (v) => toMs(v) !== 0),
        numberText,
      );
    case 'ease':
      return Option.map(Option.fromUndefinedOr(patch.ease), stringText);
    case 'stagger':
      return Option.map(Option.fromUndefinedOr(patch.stagger), numberText);
  }
};

const isLiteralFor = (key: TimingKey) => {
  if (key === 'until') return isUntilLiteral;
  if (key === 'ease') return isStringLiteral;
  return isNumberLiteral;
};

/** The field a span's other end is: a `dur` written replaces `until`, and the reverse. */
const otherEnd = (key: TimingKey): Option.Option<TimingKey> => {
  if (key === 'dur') return Option.some('until');
  if (key === 'until') return Option.some('dur');
  return Option.none();
};

/** Where a new field goes: after the last present field that comes before it. */
const insertAt = (span: ObjectExpression, key: TimingKey): Option.Option<number> => {
  const before = [...ANCHORS, ...TIMING.slice(0, TIMING.indexOf(key))];
  return Option.map(
    Arr.findLast(span.properties, (p) => {
      if (p.type === 'SpreadElement') return false;
      return Option.exists(keyName(p), (k) => before.includes(k));
    }),
    (p) => p.end,
  );
};

/**
 * The splice that writes `key` over the span's other end (`until` for a `dur`,
 * `dur` for an `until`), when it has one: the whole property is replaced.
 */
const replaceEnd = (
  file: string,
  source: string,
  span: ObjectExpression,
  cue: string,
  key: TimingKey,
  text: string,
): Result.Result<Option.Option<Splice>, SourceRefused> =>
  Option.match(otherEnd(key), {
    onNone: () => Result.succeed(Option.none()),
    onSome: (other) =>
      Result.flatMap(propertyOf(file, `cue ${cue} ${other}`, span, other), (prop) =>
        Option.match(prop, {
          onNone: () => Result.succeed(Option.none<Splice>()),
          onSome: (p) => {
            if (!Option.exists(valueOf(p), isLiteralFor(other)))
              return refuse<Option.Option<Splice>>(
                file,
                `cue ${cue} ${other}`,
                `it is \`${textOf(source, p.value)}\`, not a literal, so ${key} cannot replace it`,
              );
            return Result.succeed(
              Option.some({ start: p.start, end: p.end, text: `${key}: ${text}` }),
            );
          },
        }),
      ),
  });

/**
 * Where the comma in `source` between `from` and `to` is: text between two
 * properties, or a property and its object's brace, which holds blanks,
 * comments and at most that one comma.
 */
const commaBetween = (source: string, from: number, to: number): Option.Option<number> => {
  let i = from;
  while (i < to) {
    if (source.charAt(i) === ',') return Option.some(i);
    // A comment runs to its line's end, or its close; one that never ends holds no comma.
    const close = Match.value(source.slice(i, i + 2)).pipe(
      Match.when('//', () => Option.some([source.indexOf('\n', i), 0] as const)),
      Match.when('/*', () => Option.some([source.indexOf('*/', i + 2), 2] as const)),
      Match.orElse(() => Option.none()),
    );
    if (Option.isNone(close)) i += 1;
    else if (close.value[0] === -1) return Option.none();
    else i = close.value[0] + close.value[1];
  }
  return Option.none();
};

const isBlank = (c: string) => c === ' ' || c === '\t';

/**
 * `[start, end)` cut from `source`: its whole line when nothing else is on
 * it; with the blanks before it when it ends its line, so none trail; else
 * with the blanks after it when blanks are before it too, so one is left.
 */
const cut = (source: string, start: number, end: number): Splice => {
  let from = start;
  while (from > 0 && isBlank(source.charAt(from - 1))) from -= 1;
  let to = end;
  while (to < source.length && isBlank(source.charAt(to))) to += 1;
  const endsLine = to === source.length || source.charAt(to) === '\n';
  if (endsLine && (from === 0 || source.charAt(from - 1) === '\n'))
    return { start: from, end: to + 1, text: '' };
  if (endsLine) return { start: from, end: to, text: '' };
  if (from < start) return { start, end: to, text: '' };
  return { start, end, text: '' };
};

/** Whether `source` holds only blanks and line breaks from `from` to `to`. */
const onlySpace = (source: string, from: number, to: number) =>
  source.slice(from, to).trim() === '';

/**
 * The splices that take property `p` out of `span` with the comma that joins
 * it to its neighbour (the one after it, else the one before it), and
 * nothing else: a comment about it, or about a neighbour, stays.
 */
const removal = (
  source: string,
  span: ObjectExpression,
  p: ObjectProperty,
): ReadonlyArray<Splice> => {
  const at = span.properties.indexOf(p);
  const next = Option.match(Arr.get(span.properties, at + 1), {
    onSome: (after) => after.start,
    onNone: () => span.end,
  });
  return Option.match(commaBetween(source, p.end, next), {
    onSome: (comma) => {
      if (onlySpace(source, p.end, comma)) return [cut(source, p.start, comma + 1)];
      return [cut(source, p.start, p.end), cut(source, comma, comma + 1)];
    },
    onNone: () =>
      Option.match(
        Option.flatMap(Arr.get(span.properties, at - 1), (before) =>
          commaBetween(source, before.end, p.start),
        ),
        {
          onSome: (comma) => {
            if (onlySpace(source, comma + 1, p.start)) return [cut(source, comma, p.end)];
            return [cut(source, comma, comma + 1), cut(source, p.start, p.end)];
          },
          onNone: () => [cut(source, p.start, p.end)],
        },
      ),
  });
};

/** Every key a span of any kind declares (`Span`'s members together). */
type SpanKey = Span extends infer S ? (S extends unknown ? keyof S : never) : never;

/**
 * What stands in for a span's value the source computes (`until: MARK`), by
 * its key: a value of the key's type, so the span still decodes and reads the
 * same on both sides of a write that leaves that value be. Every key of
 * `Span` has one, so a key added there is a type error here until it does.
 */
const STAND_IN = {
  mark: '',
  word: '',
  after: '',
  with: '',
  at: 'start',
  offset: 0,
  dur: 0,
  ends: true,
  until: '',
  untilOffset: 0,
  ease: 'linear',
  stagger: 0,
  silence: true,
} satisfies Record<SpanKey, string | number | boolean>;

/** The stand-in for a value under `key`, a key a span declares; none for a key no span has. */
const standIn = (key: string): Option.Option<string | number | boolean> =>
  Option.flatMap(
    Option.liftPredicate(key, (k): k is SpanKey => Object.hasOwn(STAND_IN, k)),
    (k) => Option.some(STAND_IN[k]),
  );

/**
 * A span object as a `Span`: every literal value as the source declares it,
 * and every value it computes by its stand-in (`STAND_IN`). None when the
 * object does not decode as a span (an `until` beside an `ends`, say).
 */
const literalSpan = (span: ObjectExpression): Option.Option<Span> =>
  decodeSpan(
    Object.fromEntries(
      span.properties.flatMap((p) => {
        if (p.type === 'SpreadElement') return [];
        return Option.match(keyName(p), {
          onNone: () => [],
          onSome: (key) =>
            Option.toArray(
              Option.map(
                Option.orElse(Option.flatMap(valueOf(p), plain), () => standIn(key)),
                (value) => [key, value] as const,
              ),
            ),
        });
      }),
    ),
  );

/**
 * The splices that take away each key the span declares and the span `patch`
 * makes of it lacks (`patchSpan`): an `untilOffset` once the end is set
 * another way or put back on its point, an `ends` once it runs `until` a
 * point. A key the patch writes in its place (`otherEnd`: a `dur` over an
 * `until`) is replaced, not taken away. Refused over one in code; and an
 * `untilOffset` on a span that runs no `until`, and is given none, is refused:
 * it has no point to be off.
 */
const droppedBy = (
  file: string,
  source: string,
  span: ObjectExpression,
  cue: string,
  patch: CuePatch,
): Result.Result<ReadonlyArray<Splice>, SourceRefused> =>
  Result.flatMap(propertyOf(file, `cue ${cue} until`, span, 'until'), (until) => {
    if ('untilOffset' in patch && !('until' in patch) && Option.isNone(until))
      return refuse<ReadonlyArray<Splice>>(
        file,
        `cue ${cue} untilOffset`,
        'it runs no until, so its end has no point to be off (it ends by its dur)',
      );
    const declared = literalSpan(span);
    if (Option.isNone(declared)) return Result.succeed([]);
    const kept = patchSpan(declared.value, patch);
    const replaced = TIMING.flatMap((key) =>
      Option.toArray(Option.filter(otherEnd(key), () => Option.isSome(valueText(key, patch)))),
    );
    const gone = Object.keys(declared.value).filter(
      (key) => !Object.hasOwn(kept, key) && !replaced.some((r) => r === key),
    );
    return Result.map(
      Result.all(
        gone.map((key) => {
          const target = `cue ${cue} ${key}`;
          return Result.flatMap(propertyOf(file, target, span, key), (prop) =>
            Option.match(prop, {
              onNone: () => Result.succeed<ReadonlyArray<Splice>>([]),
              onSome: (p) => {
                if (Option.isNone(Option.flatMap(valueOf(p), plain)))
                  return refuse<ReadonlyArray<Splice>>(
                    file,
                    target,
                    `it is \`${textOf(source, p.value)}\`, not a literal, so the lab cannot take it away`,
                  );
                return Result.succeed(removal(source, span, p));
              },
            }),
          );
        }),
      ),
      (each) => each.flat(),
    );
  });

/**
 * Set a cue's `offset`, `dur`, `until`, `untilOffset`, `ease` or `stagger` in
 * the drawing exported as `name`: the value's text replaced where it is a
 * literal, or the field added after the span's anchor; a key the new span
 * lacks is taken away (`droppedBy`). The patch is written as a scene file
 * holds it (`writtenPatch`), the one rounding its check judges. The result is
 * the whole new source.
 */
export const editCue = (
  file: string,
  source: string,
  name: string,
  cue: string,
  patch: CuePatch,
): Result.Result<string, SourceRefused> =>
  Result.flatMap(spanOf(file, source, name, cue), (span) => {
    const written = writtenPatch(patch);
    const splices: Array<Splice> = [];
    const inserts = new Map<number, Array<string>>();
    const dropped = droppedBy(file, source, span, cue, written);
    if (Result.isFailure(dropped)) return Result.fail(dropped.failure);
    splices.push(...dropped.success);
    for (const key of TIMING) {
      const text = valueText(key, written);
      if (Option.isNone(text)) continue;
      const target = `cue ${cue} ${key}`;
      const prop = propertyOf(file, target, span, key);
      if (Result.isFailure(prop)) return Result.fail(prop.failure);
      if (Option.isSome(prop.success)) {
        const p = prop.success.value;
        if (!Option.exists(valueOf(p), isLiteralFor(key)))
          return refuse(file, target, `it is \`${textOf(source, p.value)}\`, not a literal`);
        splices.push({ start: p.value.start, end: p.value.end, text: text.value });
        continue;
      }
      const replaced = replaceEnd(file, source, span, cue, key, text.value);
      if (Result.isFailure(replaced)) return Result.fail(replaced.failure);
      if (Option.isSome(replaced.success)) {
        splices.push(replaced.success.value);
        continue;
      }
      const at = insertAt(span, key);
      if (Option.isNone(at))
        return refuse(file, target, 'the span has no anchor (mark, after, with or at)');
      const fields = inserts.get(at.value) ?? [];
      fields.push(`${key}: ${text.value}`);
      inserts.set(at.value, fields);
    }
    for (const [at, fields] of inserts)
      splices.push({ start: at, end: at, text: fields.map((f) => `, ${f}`).join('') });
    return spliced(file, source, splices);
  });

/** Set a knob of the drawing exported as `name`: a number, or each coordinate of a point. */
export const editKnob = (
  file: string,
  source: string,
  name: string,
  knob: string,
  value: Knob,
): Result.Result<string, SourceRefused> =>
  Result.flatMap(literalOf(file, source, name, 'knobs'), (knobs) =>
    Result.flatMap(propertyOf(file, `knob ${knob}`, knobs, knob), (prop) => {
      const target = `knob ${knob}`;
      if (Option.isNone(prop)) return refuse(file, target, 'the drawing declares no such knob');
      const p = prop.value;
      const text = textOf(source, p.value);
      if (Predicate.isNumber(value)) {
        if (!Option.exists(valueOf(p), isNumberLiteral))
          return refuse(file, target, `it is \`${text}\`, not a literal number`);
        return spliced(file, source, [
          { start: p.value.start, end: p.value.end, text: numberText(value) },
        ]);
      }
      return Option.match(Option.flatMap(valueOf(p), pointOf), {
        onNone: () => refuse<string>(file, target, `it is \`${text}\`, not a literal [x, y]`),
        onSome: ([x, y]) =>
          spliced(file, source, [
            { start: x.start, end: x.end, text: numberText(value[0]) },
            { start: y.start, end: y.end, text: numberText(value[1]) },
          ]),
      });
    }),
  );

const sameSpan = Schema.toEquivalence(Span);

/**
 * What of a write of `patch` to cue `cue` did not land in `after`, the text
 * written over `before`: none when the span `after` holds, decoded from its
 * text by `literalSpan` (a value it computes reads as its `STAND_IN`), is the span
 * `patch` makes of the one `before` held (`patchSpan` over `writtenPatch`);
 * else the cue, and the span it holds against the one it was to hold, or that
 * it holds none (it does not decode, as an `until` beside an `ends` would not).
 */
export const cueLanded = (
  file: string,
  before: string,
  after: string,
  name: string,
  cue: string,
  patch: CuePatch,
): Result.Result<ReadonlyArray<string>, SourceRefused> =>
  Result.flatMap(spanOf(file, before, name, cue), (was) =>
    Result.map(spanOf(file, after, name, cue), (now) => {
      const held = literalSpan(now);
      const meant = Option.map(literalSpan(was), (span) => patchSpan(span, writtenPatch(patch)));
      if (Option.isNone(held)) return [`cue ${cue} is not a span as written`];
      if (Option.isNone(meant)) return [`cue ${cue} was not a span before the write`];
      if (sameSpan(held.value, meant.value)) return [];
      const entries = (s: Span) => new Map(Object.entries(s));
      const [is, ought] = [entries(held.value), entries(meant.value)];
      return Arr.dedupe([...is.keys(), ...ought.keys()])
        .filter((key) => !Equal.equals(is.get(key), ought.get(key)))
        .map((key) => `cue ${cue} ${key}`);
    }),
  );

/** A knob's literal value as the source declares it; none when it is computed. */
export const readKnob = (
  file: string,
  source: string,
  name: string,
  knob: string,
): Result.Result<Option.Option<Knob>, SourceRefused> =>
  Result.flatMap(literalOf(file, source, name, 'knobs'), (knobs) =>
    Result.map(propertyOf(file, `knob ${knob}`, knobs, knob), (prop) =>
      Option.flatMap(Option.flatMap(prop, valueOf), (e): Option.Option<Knob> =>
        Option.orElse(numberOf(e), () =>
          Option.flatMap(pointOf(e), ([x, y]) =>
            Option.zipWith(numberOf(x), numberOf(y), (a, b): Knob => [a, b]),
          ),
        ),
      ),
    ),
  );

/**
 * The spans of the drawing's timeline that are literal through and through,
 * by cue, as the file declares them now; a computed span (or a timeline that
 * is not an object literal) is left out.
 */
export const readSpans = (
  file: string,
  source: string,
  name: string,
): Readonly<Record<string, Span>> =>
  Result.match(literalOf(file, source, name, 'timeline'), {
    onFailure: () => ({}),
    onSuccess: (node) =>
      Object.fromEntries(
        literalProperties({ _tag: 'Literal', node }).flatMap((p) =>
          Option.match(
            Option.zipWith(
              keyName(p),
              Option.flatMap(Option.flatMap(valueOf(p), plain), decodeSpan),
              (cue, span) => [cue, span] satisfies readonly [string, Span],
            ),
            { onNone: () => [], onSome: (entry) => [entry] },
          ),
        ),
      ),
  });

/**
 * The knobs of the drawing's `knobs` literal that are literal numbers or
 * points, by name, as the file declares them now; a computed knob is left out.
 */
export const readKnobs = (
  file: string,
  source: string,
  name: string,
): Readonly<Record<string, Knob>> =>
  Result.match(literalOf(file, source, name, 'knobs'), {
    onFailure: () => ({}),
    onSuccess: (node) =>
      Object.fromEntries(
        literalProperties({ _tag: 'Literal', node }).flatMap((p) =>
          Option.match(keyName(p), {
            onNone: () => [],
            onSome: (knob) =>
              Result.match(readKnob(file, source, name, knob), {
                onFailure: () => [],
                onSuccess: (v) =>
                  Option.match(v, {
                    onNone: () => [],
                    onSome: (value) => [[knob, value] satisfies readonly [string, Knob]],
                  }),
              }),
          }),
        ),
      ),
  });

/**
 * The module's code apart from the drawing's data: the source with the
 * `timeline` and `knobs` object literals of the drawing exported as `name`
 * blanked out. Two versions of a scene whose code is the same differ only in
 * data, which the lab can draw from values alone.
 */
export const codeOf = (
  file: string,
  source: string,
  name: string,
): Result.Result<string, SourceRefused> =>
  Result.map(siteNamed(file, source, name), (site) =>
    applySplices(
      source,
      [site.timeline, site.knobs].flatMap((slot) => {
        if (slot._tag !== 'Literal') return [];
        return [{ start: slot.node.start, end: slot.node.end, text: '{}' }];
      }),
    ),
  );
