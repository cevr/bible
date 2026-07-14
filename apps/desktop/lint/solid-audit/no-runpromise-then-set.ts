import type { AstNode, SolidRule } from './ast.ts';
import { getNodeArrayField, getNodeField, getStringField, SETTER_NAME } from './ast.ts';

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
export const noRunpromiseThenSet: SolidRule = {
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
};
