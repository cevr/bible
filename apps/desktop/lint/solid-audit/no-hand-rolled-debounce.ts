import type { AstNode, SolidRule } from './ast.ts';
import { getNodeArrayField, getNodeField, getStringField } from './ast.ts';

/**
 * R10 — `solid/no-hand-rolled-debounce`
 *
 * Catches the hand-rolled debounce shape: same function scope contains
 * BOTH a `setTimeout(...)` call whose result is assigned to a binding
 * AND a `clearTimeout(<binding>)` call. The recurring pattern is:
 *
 *   let timer: number | undefined;
 *   const onChange = () => {
 *     if (timer !== undefined) clearTimeout(timer);
 *     timer = setTimeout(() => doIt(), 200);
 *   };
 *
 * Replace with `Effect.debounce` or `Stream.debounce` so cancellation
 * and timing live in the effect runtime.
 *
 * Heuristic: walk function scopes; per scope, collect identifier names
 * referenced from `clearTimeout(<id>)` and binding names assigned
 * `<id> = setTimeout(...)` (or declared `const/let <id> = setTimeout(...)`).
 * Report when any name appears in both sets.
 */
export const noHandRolledDebounce: SolidRule = {
  create(context) {
    type Frame = {
      fn: AstNode;
      setTimeoutTargets: Map<string, AstNode>;
      clearTimeoutTargets: Set<string>;
    };
    const stack: Frame[] = [];

    const pushFrame = (node: AstNode) =>
      stack.push({
        fn: node,
        setTimeoutTargets: new Map(),
        clearTimeoutTargets: new Set(),
      });

    const popFrame = () => {
      const frame = stack.pop();
      if (frame === undefined) return;
      for (const [name, node] of frame.setTimeoutTargets) {
        if (!frame.clearTimeoutTargets.has(name)) continue;
        context.report({
          message:
            `Hand-rolled debounce on \`${name}\` (setTimeout + clearTimeout in same scope). ` +
            'Use `Effect.debounce` or `Stream.debounce` so cancellation and timing live in ' +
            'the effect runtime. See SOLID_AUDIT.md §A7.',
          node,
        });
      }
    };

    const calleeIdentifierName = (call: AstNode): string | undefined => {
      const callee = getNodeField(call, 'callee');
      if (callee?.type !== 'Identifier') return undefined;
      return getStringField(callee, 'name');
    };

    return {
      FunctionDeclaration(node) {
        pushFrame(node);
      },
      'FunctionDeclaration:exit': popFrame,
      FunctionExpression(node) {
        pushFrame(node);
      },
      'FunctionExpression:exit': popFrame,
      ArrowFunctionExpression(node) {
        pushFrame(node);
      },
      'ArrowFunctionExpression:exit': popFrame,
      CallExpression(node) {
        const top = stack[stack.length - 1];
        if (top === undefined) return;
        const name = calleeIdentifierName(node);
        if (name !== 'clearTimeout') return;
        const args = getNodeArrayField(node, 'arguments');
        if (args === undefined || args.length === 0) return;
        const arg0 = args[0];
        if (arg0?.type !== 'Identifier') return;
        const id = getStringField(arg0, 'name');
        if (id !== undefined) top.clearTimeoutTargets.add(id);
      },
      AssignmentExpression(node) {
        // `timer = setTimeout(...)`
        const top = stack[stack.length - 1];
        if (top === undefined) return;
        if (getStringField(node, 'operator') !== '=') return;
        const left = getNodeField(node, 'left');
        const right = getNodeField(node, 'right');
        if (left?.type !== 'Identifier') return;
        if (right === undefined || right.type !== 'CallExpression') return;
        if (calleeIdentifierName(right) !== 'setTimeout') return;
        const name = getStringField(left, 'name');
        if (name !== undefined) top.setTimeoutTargets.set(name, node);
      },
      VariableDeclarator(node) {
        // `const timer = setTimeout(...)` or `let timer = setTimeout(...)`
        const top = stack[stack.length - 1];
        if (top === undefined) return;
        const init = getNodeField(node, 'init');
        if (init === undefined || init.type !== 'CallExpression') return;
        if (calleeIdentifierName(init) !== 'setTimeout') return;
        const id = getNodeField(node, 'id');
        if (id?.type !== 'Identifier') return;
        const name = getStringField(id, 'name');
        if (name !== undefined) top.setTimeoutTargets.set(name, node);
      },
    };
  },
};
