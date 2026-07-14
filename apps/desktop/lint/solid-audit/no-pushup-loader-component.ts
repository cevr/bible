import type { AstNode, SolidRule } from './ast.ts';
import { getNodeArrayField, getNodeField, getStringField, isAstNode } from './ast.ts';

/**
 * R7 — `solid/no-pushup-loader-component`
 *
 * Catches the push-up loader antipattern: a function component whose
 * entire return is `null` (so it renders nothing) and whose body
 * contains `createEffect(() => props.<setter>(...))`. The component
 * exists only as a side-effect carrier — load data, push the result up
 * to a parent via `props.setX`. This is the StrongsLoader /
 * MarginNotesLoader / etc. pattern flagged across A2 / A10.
 *
 * Migration target: lift the state to the parent (via a context
 * provider or a service) so the child doesn't have to push-up.
 *
 * AST shape: FunctionDeclaration / FunctionExpression /
 * ArrowFunctionExpression where:
 *   - body returns `null` (expression body `null` literal OR last
 *     return statement is `return null`)
 *   - body contains at least one `createEffect` whose body calls
 *     `props.<setterName>` (`^set[A-Z]`). Parent-supplied `props.on*`
 *     callbacks are NOT push-ups (parent gives child a hook).
 *   - no other JSX is returned anywhere in the function
 */
export const noPushupLoaderComponent: SolidRule = {
  create(context) {
    const filename = context.filename;
    if (!filename.includes('/apps/desktop/src/components/')) return {};

    type Frame = {
      fn: AstNode;
      returnsNonNull: boolean;
      returnsNull: boolean;
      createEffectPushupCount: number;
      createEffectCount: number;
    };
    const stack: Frame[] = [];

    const isPropsSetterCall = (call: AstNode): boolean => {
      if (call.type !== 'CallExpression') return false;
      const callee = getNodeField(call, 'callee');
      if (callee?.type !== 'MemberExpression') return false;
      const obj = getNodeField(callee, 'object');
      if (obj?.type !== 'Identifier' || getStringField(obj, 'name') !== 'props') return false;
      const prop = getNodeField(callee, 'property');
      if (prop?.type !== 'Identifier') return false;
      const name = getStringField(prop, 'name');
      if (name === undefined) return false;
      // Only `props.set*` is a push-up. `props.on*` is a parent-supplied
      // callback (e.g. `props.onClose()` dismissing a dialog), which is
      // a different pattern and benign.
      return /^set[A-Z]/.test(name);
    };

    const bodyTouchesPropsPushup = (body: AstNode | undefined): boolean => {
      if (body === undefined) return false;
      let found = false;
      const walk = (n: unknown): void => {
        if (found) return;
        if (Array.isArray(n)) {
          for (const child of n) walk(child);
          return;
        }
        if (!isAstNode(n)) return;
        if (isPropsSetterCall(n)) {
          found = true;
          return;
        }
        for (const key in n) {
          if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') continue;
          walk(n[key]);
        }
      };
      walk(body);
      return found;
    };

    const popFrame = () => {
      const frame = stack.pop();
      if (frame === undefined) return;
      if (frame.createEffectPushupCount === 0) return;
      if (frame.returnsNonNull) return;
      if (!frame.returnsNull) return;
      context.report({
        message:
          'Push-up loader component (returns `null`, body is `createEffect(() => props.setX(...))`) — ' +
          'this component exists only to forward loaded state to a parent. Lift the state to a ' +
          'context provider or service so the parent reads directly. See SOLID_AUDIT.md §A2 / §A10.',
        node: frame.fn,
      });
    };

    return {
      FunctionDeclaration(node) {
        const body = getNodeField(node, 'body');
        stack.push({
          fn: node,
          returnsNonNull: false,
          returnsNull: body !== undefined && body.type === 'Literal' && body['value'] === null,
          createEffectPushupCount: 0,
          createEffectCount: 0,
        });
      },
      'FunctionDeclaration:exit': popFrame,
      FunctionExpression(node) {
        stack.push({
          fn: node,
          returnsNonNull: false,
          returnsNull: false,
          createEffectPushupCount: 0,
          createEffectCount: 0,
        });
      },
      'FunctionExpression:exit': popFrame,
      ArrowFunctionExpression(node) {
        const body = getNodeField(node, 'body');
        // Arrow with expression body `() => null`
        const exprNull = body !== undefined && body.type === 'Literal' && body['value'] === null;
        stack.push({
          fn: node,
          returnsNonNull:
            body !== undefined && (body.type === 'JSXElement' || body.type === 'JSXFragment'),
          returnsNull: exprNull,
          createEffectPushupCount: 0,
          createEffectCount: 0,
        });
      },
      'ArrowFunctionExpression:exit': popFrame,
      ReturnStatement(node) {
        const top = stack[stack.length - 1];
        if (top === undefined) return;
        const arg = getNodeField(node, 'argument');
        if (arg === undefined) {
          // `return;` — counts as non-JSX, treat as nothing returned
          return;
        }
        if (arg.type === 'Literal' && arg['value'] === null) {
          top.returnsNull = true;
          return;
        }
        if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') {
          top.returnsNonNull = true;
          return;
        }
        // Any other non-null return value → not a null-loader
        top.returnsNonNull = true;
      },
      CallExpression(node) {
        const top = stack[stack.length - 1];
        if (top === undefined) return;
        const callee = getNodeField(node, 'callee');
        if (callee === undefined || callee.type !== 'Identifier') return;
        if (getStringField(callee, 'name') !== 'createEffect') return;
        top.createEffectCount += 1;
        const args = getNodeArrayField(node, 'arguments');
        if (args === undefined || args.length === 0) return;
        const arg0 = args[0];
        if (arg0 === undefined) return;
        if (arg0.type !== 'ArrowFunctionExpression' && arg0.type !== 'FunctionExpression') {
          return;
        }
        const body = getNodeField(arg0, 'body');
        if (bodyTouchesPropsPushup(body)) {
          top.createEffectPushupCount += 1;
        }
      },
    };
  },
};
