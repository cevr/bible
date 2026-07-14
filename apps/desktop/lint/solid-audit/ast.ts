import type { Plugin } from '#oxlint/plugins';

export type SolidRule = NonNullable<Plugin['rules']>[string];

export interface AstNode {
  readonly type: string;
  readonly [k: string]: unknown;
}

export const isAstNode = (value: unknown): value is AstNode => {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const t = (value as Record<string, unknown>).type;
  return typeof t === 'string';
};

export const getStringField = (n: AstNode, field: string): string | undefined => {
  const v = n[field];
  return typeof v === 'string' ? v : undefined;
};

export const getNodeField = (n: AstNode, field: string): AstNode | undefined => {
  const v = n[field];
  return isAstNode(v) ? v : undefined;
};

export const getNodeArrayField = (n: AstNode, field: string): AstNode[] | undefined => {
  const v = n[field];
  if (!Array.isArray(v)) return undefined;
  return v.filter(isAstNode);
};

/** Identifier name from a `key`-bearing node (Identifier / Literal). */
export const memberKeyName = (member: AstNode): string | undefined => {
  const key = getNodeField(member, 'key');
  if (key === undefined) return undefined;
  if (key.type === 'Identifier') return getStringField(key, 'name');
  if (key.type === 'Literal') {
    const v = key['value'];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
};

export const SETTER_NAME = /^set[A-Z]/;
