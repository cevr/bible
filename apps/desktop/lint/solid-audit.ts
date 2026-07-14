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
 *  - solid/no-paired-bool-state (R4): consecutive
 *    `createSignal<boolean>()` + `createSignal<T | null/undefined>()` —
 *    flag-plus-payload antipattern. Use a discriminated union.
 *  - solid/component-max-loc (R8): a component `.tsx` under
 *    `apps/desktop/src/components/` may not exceed 1000 LOC. Per-file
 *    overrides ratchet down as A3 splits land.
 *  - solid/runpromise-needs-cleanup (R2): a component body containing
 *    `<expr>.runPromise(...)` / `<expr>.runFork(...)` must also contain an
 *    `onCleanup(...)` call in the same function scope.
 *  - solid/no-pushup-loader-component (R7): a `null`-returning component
 *    whose body is `createEffect(() => props.set*(...))` is the
 *    StrongsLoader / MarginNotesLoader push-up pattern. Lift the state to
 *    a parent provider instead.
 *  - solid/no-hand-rolled-debounce (R10): same function scope contains
 *    both `setTimeout` (result assigned to a binding) and `clearTimeout`
 *    on the same binding — use `Effect.debounce` or `Stream.debounce`.
 */

import type { Plugin } from '#oxlint/plugins';

import { componentMaxLoc } from './solid-audit/component-max-loc.ts';
import { effectServiceNoSetters } from './solid-audit/effect-service-no-setters.ts';
import { noDoubleNullable } from './solid-audit/no-double-nullable.ts';
import { noEffectAsMemo } from './solid-audit/no-effect-as-memo.ts';
import { noHandRolledDebounce } from './solid-audit/no-hand-rolled-debounce.ts';
import { noPairedBoolState } from './solid-audit/no-paired-bool-state.ts';
import { noPushupLoaderComponent } from './solid-audit/no-pushup-loader-component.ts';
import { noRunpromiseThenSet } from './solid-audit/no-runpromise-then-set.ts';
import { runpromiseNeedsCleanup } from './solid-audit/runpromise-needs-cleanup.ts';

const plugin: Plugin = {
  meta: { name: 'solid' },
  rules: {
    'effect-service-no-setters': effectServiceNoSetters,
    'component-max-loc': componentMaxLoc,
    'no-hand-rolled-debounce': noHandRolledDebounce,
    'no-pushup-loader-component': noPushupLoaderComponent,
    'runpromise-needs-cleanup': runpromiseNeedsCleanup,
    'no-paired-bool-state': noPairedBoolState,
    'no-runpromise-then-set': noRunpromiseThenSet,
    'no-effect-as-memo': noEffectAsMemo,
    'no-double-nullable': noDoubleNullable,
  },
};

export default plugin;
