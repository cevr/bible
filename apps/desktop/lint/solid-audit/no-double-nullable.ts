import type { AstNode, SolidRule } from './ast.ts';
import { getNodeArrayField, getNodeField, getStringField } from './ast.ts';

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
export const noDoubleNullable: SolidRule = {
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
};
