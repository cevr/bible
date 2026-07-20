import type { SolidRule } from './ast.ts';

/**
 * R8 — `solid/component-max-loc`
 *
 * Catches `.tsx` files under `apps/desktop/src/components/` exceeding
 * the configured LOC ceiling (default 1000). The ratchet pattern: when
 * a current offender can't be split immediately, add a per-file override
 * at its current LOC in `.oxlintrc.json` overrides[].rules. The ceiling
 * MUST monotonically decrease as A3 splits land — never raise it.
 *
 * Options:
 *   ["error", 1000]            — default cap
 *   ["error", { max: 1000 }]   — explicit object form
 *
 * Reports on the Program node when `sourceCode.lines.length > max`.
 */
export const componentMaxLoc: SolidRule = {
  meta: {
    schema: [
      {
        oneOf: [
          { type: 'integer', minimum: 1 },
          {
            type: 'object',
            properties: { max: { type: 'integer', minimum: 1 } },
            additionalProperties: false,
          },
        ],
      },
    ],
  },
  create(context) {
    const filename = context.filename;
    if (!filename.endsWith('.tsx')) return {};
    if (!filename.includes('/apps/desktop/src/components/')) return {};

    const opts = context.options;
    let rawOpt: unknown;
    if (Array.isArray(opts)) rawOpt = opts[0];
    let max = 1000;
    if (typeof rawOpt === 'number' && Number.isFinite(rawOpt) && rawOpt > 0) {
      max = rawOpt;
    } else if (typeof rawOpt === 'object' && rawOpt !== null && 'max' in rawOpt) {
      const m = (rawOpt satisfies object as { readonly max?: unknown }).max;
      if (typeof m === 'number' && Number.isFinite(m) && m > 0) max = m;
    }

    return {
      Program(node) {
        const loc = context.sourceCode.lines.length;
        if (loc <= max) return;
        context.report({
          message:
            `Component file is ${loc} LOC (cap ${max}). Split per SOLID_AUDIT §A3 ` +
            `(extract subcomponents, lift state to a context provider, or move pure ` +
            `row-builders to module scope). If you must defer, add a per-file override ` +
            `in .oxlintrc.json with the CURRENT LOC as the ceiling (ratchet only down).`,
          node,
        });
      },
    };
  },
};
