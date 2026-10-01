// A scene file as the lab reads and edits it: the `drawing({...})` calls a
// module exports, the `timeline` and `knobs` object literals inside them (or
// the module-level `const` literal they name), and the splices that change one
// value there. Parsed with oxc-parser, so every position is the parser's,
// never a regex's guess. Pure: text in, text out.
//
// An edit rewrites only a value the parser proves is a literal: a number
// (`0.4`, `-0.2`), a string (`'inQuad'`) or a two-number array (`[960, 800]`).
// A computed value, a spread, a shorthand or a duplicate key is refused, since
// the lab could not say what it would be changing. A missing `offset`, `dur`,
// `until`, `ease` or `stagger` is added after the span's anchor, in that order; a span
// ends one way, so a `dur` written replaces its `until`, and an `until` its `dur`.

import { Array as Arr, Match, Option, Predicate, Result, Schema } from 'effect';
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
import { type CuePatch, EaseName, type Knob, Span } from '../core/schema.ts';
import { SourceRefused } from './errors.ts';

/** A `timeline` or `knobs` property: an object literal, something else, or not there. */
export type Slot =
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

interface EditableCue {
  readonly name: string;
  readonly offset: FieldState;
  readonly dur: FieldState;
  readonly until: FieldState;
  readonly ease: FieldState;
  readonly stagger: FieldState;
}

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
const TIMING = ['offset', 'dur', 'until', 'ease', 'stagger'] satisfies ReadonlyArray<
  keyof CuePatch
>;
type TimingKey = (typeof TIMING)[number];

/** Seconds and pixels to the thousandth: what the lab writes (and never `-0`). */
export const roundValue = (v: number): number => Math.round(v * 1000) / 1000 + 0;

const numberText = (v: number) => String(roundValue(v));

/** A single-quoted string literal. */
export const stringText = (v: string) => `'${v.replace(/[\\']/g, (c) => `\\${c}`)}'`;

const refuse = <A>(file: string, target: string, reason: string): Result.Result<A, SourceRefused> =>
  Result.fail(SourceRefused.make({ file, target, reason }));

const textOf = (source: string, e: Expression) => source.slice(e.start, e.end);

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
const keyName = (p: ObjectProperty): Option.Option<string> => {
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

const stringOf = (e: Expression): Option.Option<string> => {
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
    until: state('until', isStringLiteral),
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
    case 'ease':
      return Option.map(Option.fromUndefinedOr(patch.ease), stringText);
    case 'stagger':
      return Option.map(Option.fromUndefinedOr(patch.stagger), numberText);
  }
};

const isLiteralFor = (key: TimingKey) => {
  if (key === 'ease' || key === 'until') return isStringLiteral;
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
 * Set a cue's `offset`, `dur`, `until`, `ease` or `stagger` in the drawing exported as `name`: the
 * value's text replaced where it is a literal, or the field added after the
 * span's anchor. The result is the whole new source.
 */
export const editCue = (
  file: string,
  source: string,
  name: string,
  cue: string,
  patch: CuePatch,
): Result.Result<string, SourceRefused> =>
  Result.flatMap(spanOf(file, source, name, cue), (span) => {
    const splices: Array<Splice> = [];
    const inserts = new Map<number, Array<string>>();
    for (const key of TIMING) {
      const text = valueText(key, patch);
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

const decodeEase = Schema.decodeUnknownOption(EaseName);

/** A cue's literal timing fields as the source declares them (what a write reads back). */
export const readCue = (
  file: string,
  source: string,
  name: string,
  cue: string,
): Result.Result<CuePatch, SourceRefused> =>
  Result.flatMap(spanOf(file, source, name, cue), (span) => {
    const read = (key: TimingKey) =>
      Result.map(propertyOf(file, `cue ${cue}`, span, key), (prop) =>
        Option.flatMap(prop, valueOf),
      );
    return Result.map(
      Result.all({
        offset: read('offset'),
        dur: read('dur'),
        until: read('until'),
        ease: read('ease'),
        stagger: read('stagger'),
      }),
      (f): CuePatch => ({
        ...Option.match(Option.flatMap(f.offset, numberOf), {
          onNone: () => ({}),
          onSome: (offset) => ({ offset }),
        }),
        ...Option.match(Option.flatMap(f.dur, numberOf), {
          onNone: () => ({}),
          onSome: (dur) => ({ dur }),
        }),
        ...Option.match(Option.flatMap(f.until, stringOf), {
          onNone: () => ({}),
          onSome: (until) => ({ until }),
        }),
        ...Option.match(Option.flatMap(Option.flatMap(f.ease, stringOf), decodeEase), {
          onNone: () => ({}),
          onSome: (ease) => ({ ease }),
        }),
        ...Option.match(Option.flatMap(f.stagger, numberOf), {
          onNone: () => ({}),
          onSome: (stagger) => ({ stagger }),
        }),
      }),
    );
  });

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

/** An expression of literals only (numbers, strings, arrays, objects), as plain data. */
const plain = (e: Expression): Option.Option<unknown> => {
  const scalar = Option.orElse(numberOf(e), () => stringOf(e));
  if (Option.isSome(scalar)) return scalar;
  if (e.type === 'ArrayExpression')
    return Option.all(e.elements.map((x) => Option.flatMap(expressionOf(Option.some(x)), plain)));
  if (e.type !== 'ObjectExpression') return Option.none();
  return Option.map(
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
    Object.fromEntries,
  );
};

const decodeSpan = Schema.decodeUnknownOption(Span);

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
