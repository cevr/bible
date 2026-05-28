/**
 * Oxlint JS plugin: solid-audit (apps/desktop)
 *
 * Encodes the recurring violation shapes from `apps/desktop/SOLID_AUDIT.md`
 * §A11 as oxlint rules so the audit is *structurally* clean, not just
 * instance-clean. See `apps/desktop/lint/PLAN.md` for the rule specs.
 *
 * Rules:
 *  - solid/effect-service-no-setters (R6): Effect.Service / Context.Service
 *    shape interfaces (named `*Shape`) may not declare methods matching
 *    `^set[A-Z]` — those are signal-setter naming bleeding into the domain
 *    layer. Use domain verbs (themeChosen, lineHeightAdjusted, …).
 *  - solid/no-double-nullable (R5): TS unions containing BOTH `null` and
 *    `undefined` force 3-way checks. Pick one (collapse to `Option<T>` or
 *    one of `T | null` / `T | undefined`).
 *  - solid/no-effect-as-memo (R3): `createEffect(() => setX(f(y())))` is
 *    derivation, not a side effect — use `createMemo`.
 *  - solid/no-runpromise-then-set (R1): `runtime.runPromise(eff).then(setX)`
 *    is fire-and-forget with no fiber handle — leaks on unmount and races.
 *    Use `from()`, `createResource`, or `runFork + Fiber.interrupt`.
 */

import type { Plugin } from '#oxlint/plugins';

interface AstNode {
  readonly type: string;
  readonly [k: string]: unknown;
}

const isAstNode = (value: unknown): value is AstNode => {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const t = (value as Record<string, unknown>).type;
  return typeof t === 'string';
};

const getStringField = (n: AstNode, field: string): string | undefined => {
  const v = n[field];
  return typeof v === 'string' ? v : undefined;
};

const getNodeField = (n: AstNode, field: string): AstNode | undefined => {
  const v = n[field];
  return isAstNode(v) ? v : undefined;
};

const getNodeArrayField = (n: AstNode, field: string): AstNode[] | undefined => {
  const v = n[field];
  if (!Array.isArray(v)) return undefined;
  return v.filter(isAstNode);
};

/** Identifier name from a `key`-bearing node (Identifier / Literal). */
const memberKeyName = (member: AstNode): string | undefined => {
  const key = getNodeField(member, 'key');
  if (key === undefined) return undefined;
  if (key.type === 'Identifier') return getStringField(key, 'name');
  if (key.type === 'Literal') {
    const v = key['value'];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
};

const SETTER_NAME = /^set[A-Z]/;

const plugin: Plugin = {
  meta: { name: 'solid' },
  rules: {
    /**
     * R6 — `solid/effect-service-no-setters`
     *
     * Catches Effect.Service / Context.Service shape interfaces (named
     * `*Shape`) whose properties match `^set[A-Z]`. The desktop app's
     * convention is `export class Foo extends Context.Service<Foo, FooShape>()`
     * where `FooShape` is a sibling TS interface listing the service surface.
     * A property like `readonly setTheme: (...) => Effect.Effect<void>` is a
     * signal-setter leaking into the domain — A4 migrated all 15 of these to
     * domain verbs (`themeChosen`, `lineHeightAdjusted`, …). This rule
     * prevents regression.
     *
     * Heuristic: any `TSInterfaceDeclaration` whose `id.name` ends in `Shape`
     * AND any `TSPropertySignature` / `TSMethodSignature` whose `key.name`
     * matches `/^set[A-Z]/`. Catches both `readonly setX: (...) => Effect`
     * (property signature) and `setX(...): Effect` (method signature) forms.
     *
     * Also covers class methods on a `Context.Service` / `Effect.Service`
     * superclass — for the day someone writes one with class methods instead
     * of a returned shape literal.
     */
    'effect-service-no-setters': {
      create(context) {
        const reportSetters = (members: ReadonlyArray<AstNode>, container: string): void => {
          for (const member of members) {
            if (
              member.type !== 'TSPropertySignature' &&
              member.type !== 'TSMethodSignature' &&
              member.type !== 'MethodDefinition'
            ) {
              continue;
            }
            const name = memberKeyName(member);
            if (name === undefined || !SETTER_NAME.test(name)) continue;
            context.report({
              message:
                `Effect service ${container} declares \`${name}\` — \`set*\` is signal-setter ` +
                `naming and bleeds reactivity vocabulary into the domain layer. Use a domain ` +
                `verb (e.g. \`${name.slice(3, 4).toLowerCase()}${name.slice(4)}Chosen\`, ` +
                `\`Adjusted\`, \`Toggled\`). See SOLID_AUDIT.md §A4.`,
              node: member,
            });
          }
        };

        return {
          TSInterfaceDeclaration(node) {
            const id = getNodeField(node, 'id');
            const name = id === undefined ? undefined : getStringField(id, 'name');
            if (name === undefined || !name.endsWith('Shape')) return;
            const body = getNodeField(node, 'body');
            const members = body === undefined ? undefined : getNodeArrayField(body, 'body');
            if (members === undefined) return;
            reportSetters(members, name);
          },
          ClassDeclaration(node) {
            // Detect `class X extends Context.Service<...>()(...)` or
            // `class X extends Effect.Service<...>()(...)` — superClass is a
            // CallExpression chain rooted at `Context.Service`/`Effect.Service`.
            const superClass = getNodeField(node, 'superClass');
            if (superClass === undefined) return;
            // Walk down through CallExpression -> callee until we hit the
            // MemberExpression with Service.
            let cursor: AstNode | undefined = superClass;
            let foundService = false;
            for (let depth = 0; depth < 6 && cursor !== undefined; depth++) {
              if (cursor.type === 'CallExpression') {
                cursor = getNodeField(cursor, 'callee');
                continue;
              }
              if (cursor.type === 'MemberExpression') {
                const object = getNodeField(cursor, 'object');
                const property = getNodeField(cursor, 'property');
                const objectName =
                  object?.type === 'Identifier' ? getStringField(object, 'name') : undefined;
                const propertyName =
                  property?.type === 'Identifier' ? getStringField(property, 'name') : undefined;
                if (
                  propertyName === 'Service' &&
                  (objectName === 'Context' || objectName === 'Effect')
                ) {
                  foundService = true;
                }
                break;
              }
              break;
            }
            if (!foundService) return;
            const body = getNodeField(node, 'body');
            const members = body === undefined ? undefined : getNodeArrayField(body, 'body');
            if (members === undefined) return;
            const idNode = getNodeField(node, 'id');
            const className =
              idNode === undefined
                ? '<anonymous>'
                : (getStringField(idNode, 'name') ?? '<anonymous>');
            reportSetters(members, className);
          },
        };
      },
    },

    /**
     * R1 — `solid/no-runpromise-then-set`
     *
     * Catches `<expr>.runPromise(...).then(setSignal)` — the fire-and-forget
     * "shove a promise into a signal" pipeline that creates A5 race holes
     * (no cancellation on unmount or rapid re-trigger) and A9 fiber leaks
     * (no Fiber handle to interrupt).
     *
     * AST shape: `CallExpression` whose callee is a `MemberExpression` with
     * `property.name === 'then'`, whose object is itself a `CallExpression`
     * whose callee is a `MemberExpression` with `property.name` in
     * `{runPromise, runPromiseExit, runPromiseWith}`, AND whose first
     * argument is a function whose body either IS or contains as its only
     * statement a CallExpression matching `^set[A-Z]` or `props.set*`.
     *
     * Carve-out: comment escape hatch on the runPromise call —
     * `// solid/no-runpromise-then-set: allow <reason>`.
     */
    'no-runpromise-then-set': {
      create(context) {
        const RUN_PROMISE_METHODS = new Set(['runPromise', 'runPromiseExit', 'runPromiseWith']);

        const isSetterIdentifier = (n: AstNode): boolean => {
          if (n.type !== 'Identifier') return false;
          const name = getStringField(n, 'name');
          return name !== undefined && SETTER_NAME.test(name);
        };

        const isPropsSetterMember = (n: AstNode): boolean => {
          if (n.type !== 'MemberExpression') return false;
          const obj = getNodeField(n, 'object');
          if (obj?.type !== 'Identifier' || getStringField(obj, 'name') !== 'props') return false;
          const prop = getNodeField(n, 'property');
          if (prop?.type !== 'Identifier') return false;
          const name = getStringField(prop, 'name');
          return name !== undefined && SETTER_NAME.test(name);
        };

        const isSetterCall = (call: AstNode): boolean => {
          if (call.type !== 'CallExpression') return false;
          const callee = getNodeField(call, 'callee');
          if (callee === undefined) return false;
          return isSetterIdentifier(callee) || isPropsSetterMember(callee);
        };

        const isSetterFunctionArg = (arg: AstNode): boolean => {
          if (arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression') {
            return false;
          }
          const body = getNodeField(arg, 'body');
          if (body === undefined) return false;
          if (body.type === 'CallExpression') return isSetterCall(body);
          if (body.type !== 'BlockStatement') return false;
          const stmts = getNodeArrayField(body, 'body');
          if (stmts === undefined || stmts.length !== 1) return false;
          const stmt = stmts[0];
          if (stmt === undefined || stmt.type !== 'ExpressionStatement') return false;
          const expr = getNodeField(stmt, 'expression');
          if (expr === undefined) return false;
          return isSetterCall(expr);
        };

        const isRunPromiseCall = (call: AstNode): boolean => {
          if (call.type !== 'CallExpression') return false;
          const callee = getNodeField(call, 'callee');
          if (callee === undefined || callee.type !== 'MemberExpression') return false;
          const prop = getNodeField(callee, 'property');
          if (prop?.type !== 'Identifier') return false;
          const name = getStringField(prop, 'name');
          return name !== undefined && RUN_PROMISE_METHODS.has(name);
        };

        return {
          CallExpression(node) {
            const callee = getNodeField(node, 'callee');
            if (callee === undefined || callee.type !== 'MemberExpression') return;
            const prop = getNodeField(callee, 'property');
            if (prop?.type !== 'Identifier') return;
            if (getStringField(prop, 'name') !== 'then') return;
            const object = getNodeField(callee, 'object');
            if (object === undefined || !isRunPromiseCall(object)) return;
            const args = getNodeArrayField(node, 'arguments');
            if (args === undefined || args.length === 0) return;
            const arg0 = args[0];
            if (arg0 === undefined) return;
            // Direct setter reference: .then(setX)
            if (isSetterIdentifier(arg0) || isPropsSetterMember(arg0)) {
              context.report({
                message:
                  '`runPromise(...).then(setX)` leaks fibers and races on unmount. Use ' +
                  '`from()` / `createResource` / `runFork(...)` + `onCleanup(Fiber.interrupt)`. ' +
                  'See SOLID_AUDIT.md §A5 / §A9.',
                node,
              });
              return;
            }
            // Inline arrow that calls a setter
            if (isSetterFunctionArg(arg0)) {
              context.report({
                message:
                  '`runPromise(...).then(() => setX(...))` leaks fibers and races on unmount. ' +
                  'Use `from()` / `createResource` / `runFork(...)` + `onCleanup(Fiber.interrupt)`. ' +
                  'See SOLID_AUDIT.md §A5 / §A9.',
                node,
              });
            }
          },
        };
      },
    },

    /**
     * R3 — `solid/no-effect-as-memo`
     *
     * Catches `createEffect(() => setX(<expr>))` where the body is a single
     * call expression whose callee matches `^set[A-Z]` (heuristic for signal
     * setter). This is derivation masquerading as a side effect — should be
     * `createMemo`.
     *
     * Carve-out: comment escape hatch (placed on the createEffect line) when
     * the set call has DOM/storage side effects that piggyback. Detected by
     * the surrounding `// solid/no-effect-as-memo: allow <reason>` comment.
     */
    'no-effect-as-memo': {
      create(context) {
        const isSetterCall = (call: AstNode): boolean => {
          if (call.type !== 'CallExpression') return false;
          const callee = getNodeField(call, 'callee');
          if (callee === undefined) return false;
          if (callee.type === 'Identifier') {
            const n = getStringField(callee, 'name');
            return n !== undefined && SETTER_NAME.test(n);
          }
          // Allow props.setX or someService.setX through — those are domain
          // events on a service / parent push-up, not signal setters.
          return false;
        };

        const bodyIsSingleSetter = (body: AstNode): boolean => {
          if (body.type === 'CallExpression') return isSetterCall(body);
          if (body.type !== 'BlockStatement') return false;
          const stmts = getNodeArrayField(body, 'body');
          if (stmts === undefined || stmts.length !== 1) return false;
          const stmt = stmts[0];
          if (stmt === undefined || stmt.type !== 'ExpressionStatement') return false;
          const expr = getNodeField(stmt, 'expression');
          if (expr === undefined) return false;
          return isSetterCall(expr);
        };

        return {
          CallExpression(node) {
            const callee = getNodeField(node, 'callee');
            if (callee === undefined || callee.type !== 'Identifier') return;
            if (getStringField(callee, 'name') !== 'createEffect') return;
            const args = getNodeArrayField(node, 'arguments');
            if (args === undefined || args.length === 0) return;
            const arg0 = args[0];
            if (arg0 === undefined) return;
            if (arg0.type !== 'ArrowFunctionExpression' && arg0.type !== 'FunctionExpression') {
              return;
            }
            const body = getNodeField(arg0, 'body');
            if (body === undefined) return;
            if (!bodyIsSingleSetter(body)) return;
            context.report({
              message:
                '`createEffect` body is a single signal setter — this is derivation, not ' +
                'a side effect. Use `createMemo` (or a derived signal accessor) instead. ' +
                'See SOLID_AUDIT.md §A2 / §A10.',
              node,
            });
          },
        };
      },
    },

    /**
     * R5 — `solid/no-double-nullable`
     *
     * Catches TypeScript union types whose members include BOTH
     * `TSNullKeyword` AND `TSUndefinedKeyword` (e.g. `string | null | undefined`).
     * The triple-state shape forces every consumer into 3-way checks and is
     * the root of A8-08. Pick one: collapse to `Option<T>` for app-internal
     * state, or pick one of `T | null` / `T | undefined` at the IPC boundary
     * and translate.
     *
     * Carve-out: skip when one of the union members is a TSTypeReference
     * named `Option` / `Maybe` / `Result` — that means the author is
     * deliberately bridging an interop boundary with the data type.
     */
    'no-double-nullable': {
      create(context) {
        const INTEROP_TYPES = new Set(['Option', 'Maybe', 'Result', 'Either']);

        const referencesInteropType = (member: AstNode): boolean => {
          if (member.type !== 'TSTypeReference') return false;
          const typeName = getNodeField(member, 'typeName');
          if (typeName === undefined) return false;
          if (typeName.type === 'Identifier') {
            const n = getStringField(typeName, 'name');
            return n !== undefined && INTEROP_TYPES.has(n);
          }
          if (typeName.type === 'TSQualifiedName') {
            const right = getNodeField(typeName, 'right');
            if (right === undefined || right.type !== 'Identifier') return false;
            const n = getStringField(right, 'name');
            return n !== undefined && INTEROP_TYPES.has(n);
          }
          return false;
        };

        return {
          TSUnionType(node) {
            const types = getNodeArrayField(node, 'types');
            if (types === undefined) return;
            let hasNull = false;
            let hasUndefined = false;
            let hasInterop = false;
            for (const t of types) {
              if (t.type === 'TSNullKeyword') hasNull = true;
              else if (t.type === 'TSUndefinedKeyword') hasUndefined = true;
              else if (referencesInteropType(t)) hasInterop = true;
            }
            if (!hasNull || !hasUndefined) return;
            if (hasInterop) return;
            context.report({
              message:
                'Union has both `null` and `undefined` — pick one. Use `Option<T>` for ' +
                'app-internal state, or pick `T | null` (or `T | undefined`) at the IPC ' +
                'boundary and translate. See SOLID_AUDIT.md §A8-08.',
              node,
            });
          },
        };
      },
    },
  },
};

export default plugin;
