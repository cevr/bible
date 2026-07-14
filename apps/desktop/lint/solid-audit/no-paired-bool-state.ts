import type { AstNode, SolidRule } from './ast.ts';
import { getNodeArrayField, getNodeField, getStringField } from './ast.ts';

/**
 * R4 — `solid/no-paired-bool-state`
 *
 * Catches the antipattern of two consecutive `createSignal` calls in a
 * function body where one is `<boolean>` and the next is `<T | null>` or
 * `<T | undefined>`. These pairs always represent a discriminated union
 * struggling to be expressed — the "flag says open, payload says what".
 * Use a tagged union (`{ _tag: 'closed' } | { _tag: 'open'; payload: T }`)
 * to make impossible states unrepresentable.
 *
 * AST shape: BlockStatement body scanned for consecutive
 * VariableDeclarations whose init is `createSignal<...>()` (CallExpression
 * with `typeArguments`); first must be `TSBooleanKeyword`, second must be
 * a TSUnionType containing `TSNullKeyword` or `TSUndefinedKeyword`.
 *
 * Carve-out: comment escape hatch on either signal line:
 * `// solid/no-paired-bool-state: allow <reason>`.
 */
export const noPairedBoolState: SolidRule = {
  create(context) {
    const isCreateSignalCall = (n: AstNode | undefined): AstNode | undefined => {
      if (n === undefined || n.type !== 'CallExpression') return undefined;
      const callee = getNodeField(n, 'callee');
      if (callee?.type !== 'Identifier') return undefined;
      if (getStringField(callee, 'name') !== 'createSignal') return undefined;
      return n;
    };

    // Read the lone type-argument from a createSignal<...>() call.
    const signalTypeArg = (call: AstNode): AstNode | undefined => {
      // ESTree uses `typeArguments`; @typescript-eslint historically used
      // `typeParameters`. Handle both.
      const ta = getNodeField(call, 'typeArguments') ?? getNodeField(call, 'typeParameters');
      if (ta === undefined) return undefined;
      const params = getNodeArrayField(ta, 'params');
      if (params === undefined || params.length !== 1) return undefined;
      return params[0];
    };

    const isBooleanType = (t: AstNode): boolean => {
      if (t.type === 'TSBooleanKeyword') return true;
      if (t.type === 'TSLiteralType') {
        const literal = getNodeField(t, 'literal');
        if (literal === undefined) return false;
        // boolean literal: { type: 'Literal', value: true/false }
        const v = literal['value'];
        return typeof v === 'boolean';
      }
      return false;
    };

    const isNullableUnion = (t: AstNode): boolean => {
      if (t.type !== 'TSUnionType') return false;
      const types = getNodeArrayField(t, 'types');
      if (types === undefined) return false;
      for (const u of types) {
        if (u.type === 'TSNullKeyword' || u.type === 'TSUndefinedKeyword') return true;
      }
      return false;
    };

    // For each decl, recover the type-arg node if it is a createSignal call.
    const declSignalType = (decl: AstNode): AstNode | undefined => {
      if (decl.type !== 'VariableDeclaration') return undefined;
      const declarations = getNodeArrayField(decl, 'declarations');
      if (declarations === undefined || declarations.length !== 1) return undefined;
      const declarator = declarations[0];
      if (declarator === undefined) return undefined;
      const init = getNodeField(declarator, 'init');
      const call = isCreateSignalCall(init);
      if (call === undefined) return undefined;
      return signalTypeArg(call);
    };

    const scanStatementList = (stmts: ReadonlyArray<AstNode>): void => {
      for (let i = 0; i + 1 < stmts.length; i++) {
        const a = stmts[i];
        const b = stmts[i + 1];
        if (a === undefined || b === undefined) continue;
        const ta = declSignalType(a);
        const tb = declSignalType(b);
        if (ta === undefined || tb === undefined) continue;
        if (!isBooleanType(ta)) continue;
        if (!isNullableUnion(tb)) continue;
        context.report({
          message:
            'Paired `createSignal<boolean>` + `createSignal<T | null/undefined>` is the ' +
            'flag-plus-payload antipattern. Use a discriminated union ' +
            "(`{ _tag: 'closed' } | { _tag: 'open'; payload: T }`) so impossible " +
            'states are unrepresentable. See SOLID_AUDIT.md §A1.',
          node: b,
        });
      }
    };

    return {
      BlockStatement(node) {
        const body = getNodeArrayField(node, 'body');
        if (body === undefined) return;
        scanStatementList(body);
      },
      Program(node) {
        const body = getNodeArrayField(node, 'body');
        if (body === undefined) return;
        scanStatementList(body);
      },
    };
  },
};
