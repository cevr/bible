import type { AstNode, SolidRule } from './ast.ts';
import { getNodeArrayField, getNodeField, getStringField, SETTER_NAME } from './ast.ts';

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
export const noEffectAsMemo: SolidRule = {
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
};
