// `film/framing-is-a-knob`: a scene's framing is knobs, a point and a zoom the
// lab gives a reticle (`face: [800, 610], faceZoom: 1.22`, made a camera with
// `knobCamera`), and a camera move between framings is a `shotPath` of them or
// a `pushOn` with a number knob. A framing written out in a scene, `{ x: 1060,
// y: 580, zoom: 1.18 }`, or blended by hand, `zoom: lerp(1, 1.12, f.at('hold'))`,
// is a value a review may ask to move that the lab cannot reach, and no other
// guard sees it (`KnobRepeated` compares knobs only).
//
// The rule reads, in a scene file:
//
// 1. a camera-shaped object literal (plain `x`, `y` and `zoom` keys) whose
//    point is written out, `x` and `y` both numbers (written, or module
//    consts holding one), other than the unmoved frame (960, 540, zoom 1);
// 2. such a literal, or one spread from another camera that writes any of
//    `x`, `y` or `zoom` over it (`{ ...cam, zoom: lerp(cam.zoom, 1, roof) }`),
//    with any of them blended by hand,
//    `lerp(a, b, …)` whose `a` or `b` is a number (the unmoved frame's
//    included: a blend from it is a `shotPath` from `REST`) or an element of
//    a module const's number tuple (`JUDGED_ZOOM[0]`);
// 3. a scratch camera's zoom blended that way, `AT_ARK.zoom = lerp(…, 2.75, …)`.
//
// A framing derived from the scene's geometry (`{ x: HOUSE_X - 20, y: 790,
// zoom: 2.8 }`, a push sized past the frame's corners) stays code: a point
// that is not two numbers is read as derived. A framing shared across scenes
// lives in a set file, which the rule does not read.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { UNMOVED } from '../src/canvas/camera.ts';
import { declared, memberName, numberOf, programOf, property } from './nodes.ts';

/** The unmoved frame's `x`, `y` and `zoom`: the engine's `UNMOVED`, the canvas itself. */
const UNMOVED_AT: Readonly<Record<'x' | 'y' | 'zoom', number>> = {
  x: UNMOVED.x,
  y: UNMOVED.y,
  zoom: UNMOVED.zoom ?? 1,
};

const KEYS = ['x', 'y', 'zoom'] as const;
type Key = (typeof KEYS)[number];

/** A number written out or a module const naming one, other than the unmoved frame's `key`. */
const handWritten = (n: ESTree.Node, key: Key): boolean =>
  Option.exists(numberOf(n), (v) => v !== UNMOVED_AT[key]);

/** A declarator's initializer, without its `as const`. */
const initOf = (d: ESTree.VariableDeclarator): Option.Option<ESTree.Node> =>
  Option.map(Option.fromNullOr(d.init), (init) => {
    if (init.type === 'TSAsExpression') return init.expression;
    return init;
  });

/** An array literal of numbers only. */
const numbersOnly = (n: ESTree.Node): boolean =>
  n.type === 'ArrayExpression' &&
  n.elements.every((e) => e?.type === 'Literal' && Predicate.isNumber(e.value));

/** Whether the file names `name` at its top level as a `const` array of numbers. */
const numberTuple = (n: ESTree.Node, name: string): boolean => {
  const program = programOf(n);
  if (program.type !== 'Program') return false;
  return program.body.some((statement) => {
    const declaration = declared(statement);
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') return false;
    return declaration.declarations.some((d) => {
      if (d.id.type !== 'Identifier' || d.id.name !== name) return false;
      return Option.exists(initOf(d), numbersOnly);
    });
  });
};

/**
 * `lerp`'s end that is a number of the scene's own, the unmoved frame's
 * included (a blend from it is a `shotPath` from `REST`): written out, a
 * module const, or read off a number tuple.
 */
const handEnd = (n: ESTree.Node): boolean => {
  if (Option.isSome(numberOf(n))) return true;
  return (
    n.type === 'MemberExpression' &&
    n.computed &&
    n.object.type === 'Identifier' &&
    numberTuple(n, n.object.name)
  );
};

/** A `lerp(a, b, …)` call anywhere in `n` with a hand-written end. */
const handBlend = (n: ESTree.Node): boolean => {
  switch (n.type) {
    case 'CallExpression': {
      const isLerp = n.callee.type === 'Identifier' && n.callee.name === 'lerp';
      if (isLerp && n.arguments.slice(0, 2).some(handEnd)) return true;
      return n.arguments.some(handBlend);
    }
    case 'BinaryExpression':
      return handBlend(n.left) || handBlend(n.right);
    case 'ParenthesizedExpression':
      return handBlend(n.expression);
    default:
      return false;
  }
};

/** Whether a camera literal's fields are a hand framing: a point written out, or a blend by hand. */
const handFraming = (fields: ReadonlyArray<readonly [Key, ESTree.Node]>): boolean => {
  if (fields.some(([, value]) => handBlend(value))) return true;
  const written = fields
    .filter(([key]) => key !== 'zoom')
    .every(([, v]) => Option.isSome(numberOf(v)));
  return written && fields.some(([key, value]) => handWritten(value, key));
};

/** A camera-shaped literal's fields, and whether it writes all three (a spread may carry the rest). */
interface CameraFields {
  readonly fields: ReadonlyArray<readonly [Key, ESTree.Node]>;
  readonly whole: boolean;
}

/**
 * The fields of a camera-shaped literal, when it is one: `x`, `y` and `zoom`
 * all written, or a spread of another camera with any of them written over it
 * (`{ ...cam, y: cam.y - 60 * roof }`).
 */
const cameraFields = (n: ESTree.ObjectExpression): Option.Option<CameraFields> => {
  const fields = KEYS.flatMap((key) =>
    Option.toArray(Option.map(property(n, key), (p) => [key, p.value] as const)),
  );
  const whole = fields.length === KEYS.length;
  const spread = n.properties.some((p) => p.type === 'SpreadElement');
  return Option.liftPredicate({ fields, whole }, () => whole || (spread && fields.length > 0));
};

/**
 * Whether a camera literal is a hand framing: all three written, a point
 * written out or a blend by hand; spread from another camera, a blend by hand
 * of what it writes over it (its point is the other camera's, so derived).
 */
const handCamera = ({ fields, whole }: CameraFields): boolean => {
  if (whole) return handFraming(fields);
  return fields.some(([, value]) => handBlend(value));
};

/** `cam.zoom = lerp(…, 2.75, …)`: a scratch camera's zoom blended by hand. */
const zoomBlend = (n: ESTree.AssignmentExpression): boolean =>
  n.left.type === 'MemberExpression' &&
  Option.contains(memberName(n.left), 'zoom') &&
  handBlend(n.right);

const MESSAGE =
  'a framing written in the scene: make it knobs (a point and a zoom, read with knobCamera), a move between framings a shotPath of them, and a push that keeps going pushOn with a number knob, so the lab can reach it.';

export const framingIsAKnob = Rule.define({
  name: 'framing-is-a-knob',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A scene's framing is knobs: a camera written or blended by hand from numbers is a value the lab cannot reach.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node) =>
      context.report(Diagnostic.make({ node, message: MESSAGE }));
    return Visitor.merge(
      Visitor.on('ObjectExpression', (node) =>
        Option.match(cameraFields(node), {
          onNone: () => Effect.void,
          onSome: (camera) =>
            Effect.asVoid(Effect.when(report(node), Effect.succeed(handCamera(camera)))),
        }),
      ),
      Visitor.on('AssignmentExpression', (node) =>
        Effect.asVoid(Effect.when(report(node), Effect.succeed(zoomBlend(node)))),
      ),
    );
  },
});
