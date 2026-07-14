import type { AstNode, SolidRule } from './ast.ts';
import { getNodeField, getStringField } from './ast.ts';

/**
 * R2 — `solid/runpromise-needs-cleanup`
 *
 * Catches a Solid component body that contains `<expr>.runPromise(...)`
 * or `<expr>.runFork(...)` without a sibling `onCleanup(...)` call in the
 * same function scope. The broader version of R1: even when the fire-
 * and-forget shape isn't `.then(setX)`, the fiber/promise still escapes
 * unless ownership is established with onCleanup.
 *
 * AST shape: walk function nodes (FunctionDeclaration / FunctionExpression /
 * ArrowFunctionExpression). For each, count runPromise/runFork calls
 * (MemberExpression with property name in the set) and onCleanup calls
 * (Identifier callee named `onCleanup`). On function exit, report each
 * runPromise/runFork node when the function has none.
 *
 * Scoped to component files: file path must include
 * `apps/desktop/src/components/`. Carve-out: `// solid/runpromise-needs-cleanup: allow <reason>`
 * — implemented via the standard oxlint disable-line mechanism.
 */
export const runpromiseNeedsCleanup: SolidRule = {
  create(context) {
    const filename = context.filename;
    if (!filename.includes('/apps/desktop/src/components/')) return {};

    const RUN_METHODS = new Set(['runPromise', 'runPromiseExit', 'runPromiseWith', 'runFork']);

    type Frame = {
      fn: AstNode;
      unfencedRuns: AstNode[];
      hasCleanup: boolean;
      returnsJsx: boolean;
    };
    const stack: Frame[] = [];

    const isRunCall = (node: AstNode): boolean => {
      const callee = getNodeField(node, 'callee');
      if (callee?.type !== 'MemberExpression') return false;
      const prop = getNodeField(callee, 'property');
      if (prop?.type !== 'Identifier') return false;
      const name = getStringField(prop, 'name');
      return name !== undefined && RUN_METHODS.has(name);
    };

    const isOnCleanupCall = (node: AstNode): boolean => {
      const callee = getNodeField(node, 'callee');
      if (callee === undefined) return false;
      if (callee.type !== 'Identifier') return false;
      return getStringField(callee, 'name') === 'onCleanup';
    };

    // Does the function look like a Solid component? Heuristic: its
    // expression body is JSX, or its block body returns JSX directly,
    // or contains a `return <JSX…>` statement (single-line scan: we
    // can't AST-walk children here without re-implementing the visitor;
    // we mark on the function's body fields we can reach.)
    const isJsxBody = (body: AstNode | undefined): boolean => {
      if (body === undefined) return false;
      return body.type === 'JSXElement' || body.type === 'JSXFragment';
    };

    const pushFrame = (node: AstNode) => {
      const body = getNodeField(node, 'body');
      stack.push({
        fn: node,
        unfencedRuns: [],
        hasCleanup: false,
        returnsJsx: isJsxBody(body),
      });
    };

    const popFrame = () => {
      const frame = stack.pop();
      if (frame === undefined) return;
      if (frame.hasCleanup) return;
      // Only report on functions that look like Solid components.
      if (!frame.returnsJsx) return;
      for (const node of frame.unfencedRuns) {
        context.report({
          message:
            '`runPromise` / `runFork` inside a component without a sibling `onCleanup` ' +
            'leaks the fiber on unmount. Capture the fiber from `runtime.runFork(...)` and ' +
            '`onCleanup(() => runtime.runFork(Fiber.interrupt(fiber)))`. ' +
            'See SOLID_AUDIT.md §A5 / §A9.',
          node,
        });
      }
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
      // Detect `return <JSX…>` inside a function body — the BlockStatement
      // case (most components use this form).
      ReturnStatement(node) {
        const top = stack[stack.length - 1];
        if (top === undefined) return;
        if (top.returnsJsx) return;
        const arg = getNodeField(node, 'argument');
        if (arg === undefined) return;
        if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') {
          top.returnsJsx = true;
        }
      },
      CallExpression(node) {
        // Only count runs/cleanups in the immediately-enclosing function
        // frame. Nested functions get their own frame (and their own
        // judgement on whether they need cleanup).
        const top = stack[stack.length - 1];
        if (top === undefined) return;
        if (isOnCleanupCall(node)) {
          top.hasCleanup = true;
          return;
        }
        if (isRunCall(node)) top.unfencedRuns.push(node);
      },
    };
  },
};
