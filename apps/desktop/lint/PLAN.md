# `apps/desktop/lint/` — Oxlint Rule Plan

Companion to `apps/desktop/SOLID_AUDIT.md` §A11. Encodes recurring violations
from A1–A10 as structural oxlint rules so the audit is **structurally** clean
for that shape, not just instance-clean.

Pattern reference: `~/Developer/personal/gent/.oxlintrc.json` (real-world
deployment) + `~/Developer/personal/gent/lint/no-direct-env.ts` (15 rules in a
single Plugin file, ~1500 LOC).

---

## Setup (one-time)

1. **Create the plugin file**: `apps/desktop/lint/solid-audit.ts`

   ```ts
   import type { Plugin } from '#oxlint/plugins';

   const plugin: Plugin = {
     meta: { name: 'solid' },
     rules: {
       // … rule definitions below …
     },
   };

   export default plugin;
   ```

2. **Wire it up** in `/Users/cvr/Developer/personal/bible-tools/.oxlintrc.json`:

   ```json
   {
     "jsPlugins": ["./apps/desktop/lint/solid-audit.ts"],
     "rules": {
       "solid/no-runpromise-then-set": "error"
       // …
     }
   }
   ```

3. **Verify** with `bun run lint` from the repo root.

Notes:

- Oxlint JS plugins resolve `#oxlint/plugins` from the installed `oxlint`
  package — no `imports` map needed.
- Plugin rules can be scoped via `overrides[].files` if a rule should only
  fire under `apps/desktop/src/`.
- Each `create(context)` returns an object whose keys are AST node types
  (`CallExpression`, `ImportDeclaration`, etc.) and values are visitors.

---

## Rule specs

Each spec gives: **what to catch**, **AST shape**, **sourced findings**, and
**carve-outs**. Implement rules in the order listed — earlier ones unlock
mechanical fixes for later ones.

### R1 — `solid/no-runpromise-then-set`

**Catch:** `runtime.runPromise(effect).then(setSignal)` — the fire-and-forget
"shove a promise into a signal" pipeline that creates A5 race holes and A9
fiber leaks.

**AST shape:**

- `CallExpression` whose `callee` is `MemberExpression`
- `.property.name === "then"`
- `.object` is a `CallExpression` whose `callee` matches
  `runtime.runPromise` or `Effect.runPromise` (MemberExpression with
  `.property.name === "runPromise"` or `"runPromiseExit"`)
- `.arguments[0]` is a function whose body either:
  - is a single `CallExpression` ending in `set*` (Identifier name match)
  - or calls a signal setter passed as the only arg

**Sourced from:** A5-01..A5-09, A9-01..A9-13 (the dominant pattern across both
dimensions).

**Carve-outs:** allow when followed by `.catch(...)` AND wrapped in an
`onCleanup` scope (caller proved they own cancellation). Or require a comment
`// solid/no-runpromise-then-set: allow <reason>`.

**Auto-fix:** none — the structural fix is `from()` / `createResource` /
`runFork`+`Fiber.interrupt`, which is too contextual to codegen.

---

### R2 — `solid/runpromise-needs-cleanup`

**Catch:** `Effect.runPromise(...)` / `runtime.runPromise(...)` /
`runtime.runFork(...)` inside a Solid component body (a function returning
JSX, or a function passed to `createComponent` / `createRoot`) without a
sibling `onCleanup(...)` call referencing the resulting promise/fiber.

**AST shape:**

- File contains JSX (proxy for "Solid component file") OR file path matches
  `apps/desktop/src/components/**`
- Walk function declarations / arrow functions; for each, collect
  `CallExpression` matching `runPromise` / `runFork` AND `CallExpression` of
  `onCleanup` in the same scope
- Report when count of `runPromise`/`runFork` > count of `onCleanup` and the
  function appears to be a component (returns JSX).

**Sourced from:** A5, A9 (the unfenced-side of R1).

**Carve-outs:** comment escape hatch; or whitelist `runFork`-without-cleanup
when result is assigned to a top-level `const` (module scope, intentionally
long-lived).

---

### R3 — `solid/no-effect-as-memo`

**Catch:** `createEffect(() => setX(f(y())))` where the body is a single
expression of shape `set<Name>(<expr involving signals>)` — this is
derivation, not a side effect, and should be `createMemo`.

**AST shape:**

- `CallExpression` with `callee.name === "createEffect"`
- `.arguments[0]` is an ArrowFunctionExpression with body:
  - `BlockStatement` of length 1 containing `ExpressionStatement` of a
    `CallExpression`, OR
  - direct `CallExpression`
- That call's `callee` matches `^set[A-Z]` (heuristic for signal setter)
- The callee is NOT a member expression on a service tag (those are domain
  events, not signal setters)

**Sourced from:** A2, A10 findings about effect-as-derivation
(A2-01..A2-08, A10-02..A10-07).

**Carve-outs:** comment escape hatch when the "set" call has side effects
outside the signal world (e.g. `setHash(...)` that also calls
`history.pushState`).

---

### R4 — `solid/no-paired-bool-state`

**Catch:** two `createSignal` declarations in the same component body where
one is `<boolean>` and the next is `<T | null>` or `<T | undefined>` (paired
flag + nullable payload — the antipattern `make-impossible-states-unrepresentable`
calls out).

**AST shape:**

- In each FunctionBody, find consecutive `VariableDeclaration`s whose `init`
  is `CallExpression` of `createSignal`
- Inspect `init.typeParameters` (TS):
  - first must be `TSBooleanKeyword` or have boolean literal type
  - second must be a `TSUnionType` containing `TSNullKeyword` /
    `TSUndefinedKeyword`
- Report on the pair.

**Sourced from:** A1-07, A1-10, A1-13, A8-04, A8-06, A8-11.

**Carve-outs:** comment escape hatch.

---

### R5 — `solid/no-double-nullable`

**Catch:** any TypeScript type annotation of shape `T | null | undefined`
(triple state — pick one).

**AST shape:**

- `TSUnionType` whose `.types` contains both `TSNullKeyword` AND
  `TSUndefinedKeyword`
- Skip when one of the union members is itself an Option/Maybe/Result tag
  (caller is being explicit about an interop boundary).

**Sourced from:** A8-08 (`TocItem.para_id: string | null | undefined` forces
3-way checks across 3 files).

**Auto-fix:** strip `| undefined` (or `| null` — needs user pref); usually
the right move is to pick `null` consistently inside the Effect-using app and
fence undefined at IPC boundary.

---

### R6 — `solid/effect-service-no-setters`

**Catch:** Effect service classes (extends `Effect.Service` or define
`Context.Tag`) whose methods are named `^set[A-Z]` — should be domain verbs.

**AST shape:**

- `ClassDeclaration` whose superclass is `MemberExpression` rooted at
  `Effect` with `.property.name === "Service"`, OR file exports a
  `Context.Tag` / `Context.GenericTag`
- For each method whose `.key.name` matches `/^set[A-Z]/`, report.

**Sourced from:** A4-01..A4-15 (`ReaderSettings` 15-method setter bag is the
flagship).

**Carve-outs:** none — these should be migrated, not exempted. After
migration, the rule prevents regression.

---

### R7 — `solid/no-pushup-loader-component`

**Catch:** a component whose entire return value is `null` and whose body is
one or more `createEffect`s that call `props.set*` or `props.on*` — the
StrongsLoader/MarginNotesLoader push-up pattern flagged across A2 and A10.

**AST shape:**

- Function declaration / arrow returns `null` literal (or no JSX)
- Body contains ≥1 `createEffect` whose body calls
  `props.<setterName>(...)` or `props.<onEventName>(...)`
- No other behavior (no DOM, no `<` JSX)

**Sourced from:** A2-09..A2-13, A10-03..A10-07.

**Carve-outs:** comment escape hatch. Migration target: lift state to a
parent provider so the child doesn't need to push-up.

---

### R8 — `solid/component-max-loc`

**Catch:** a `.tsx` file under `apps/desktop/src/components/` exceeding 500
LOC.

**AST shape:** count source lines per file at `Program` entry.

**Sourced from:** A3 (`app.tsx` 1302, `bible-chapter-canvas` 774,
`command-palette` 672, `bible-drawer` 631, `folder-browser` 558, `book-feed`
512).

**Carve-outs:** per-file override during migration:

```json
"overrides": [{
  "files": ["**/apps/desktop/src/components/app.tsx"],
  "rules": { "solid/component-max-loc": ["error", 1400] }
}]
```

The override is removed as A3 fixes land — the per-file ceiling ratchets
down, never up.

---

### R9 — `solid/no-unused-export`

**Catch:** exports never imported anywhere under `apps/desktop/src/**`.

**AST shape:** requires a project-wide cross-reference pass — implement as a
secondary script (not a per-file rule) that runs in `bun run gate`. Oxlint
can't do whole-program analysis cleanly; do this as a separate
`apps/desktop/scripts/check-unused-exports.ts` invoked in CI.

**Sourced from:** A6-01..A6-13 (motion/ barrel leaks 13/4 used, ipc-cache
exposes 8 unused).

**Defer:** marked optional — TS's own `noUnusedLocals` won't catch
cross-file unused exports; investigate `oxlint`'s import-graph capabilities
before committing.

---

### R10 — `solid/no-hand-rolled-debounce`

**Catch:** code shape `let timer; ... clearTimeout(timer); timer =
setTimeout(...)` — replace with `Effect.debounce`.

**AST shape:**

- In a function scope, presence of both:
  - `CallExpression` of `setTimeout` whose result is assigned to a
    variable (or named identifier)
  - `CallExpression` of `clearTimeout` on the same identifier
- Heuristic — not airtight, but catches the recurring shape.

**Sourced from:** A7-04, A7-06, A7-09 (three sites of hand-rolled debounce).

**Carve-outs:** comment escape hatch. Migration target: `Effect.debounce`
or `pipe(stream, Stream.debounce(...))`.

---

## Order of implementation

1. **R6** (`effect-service-no-setters`) — easiest AST, biggest naming win,
   prevents regression of A4.
2. **R5** (`no-double-nullable`) — pure type-shape check, auto-fixable.
3. **R3** (`no-effect-as-memo`) — high count of A2/A10 fixes, low
   carve-out complexity.
4. **R1** (`no-runpromise-then-set`) — correctness, race-hole pattern.
5. **R4** (`no-paired-bool-state`) — structural A1/A8 enforcement.
6. **R8** (`component-max-loc`) — installs the ratchet for A3 migration.
7. **R2** (`runpromise-needs-cleanup`) — the broader R1.
8. **R7** (`no-pushup-loader-component`) — niche but kills the most
   load-bearing A10 antipattern.
9. **R10** (`no-hand-rolled-debounce`) — low count, finish the long tail.
10. **R9** (`no-unused-export`) — deferred; needs a script, not a rule.

## Workflow

Each rule lands as its own commit:

```
feat(desktop/lint): A11-R{N} — {slug} catches {pattern}
```

The commit:

1. Adds the rule body to `apps/desktop/lint/solid-audit.ts`
2. Adds the rule entry to `.oxlintrc.json` with severity (`warn` first if
   migration is incomplete, `error` once all known sites are clean)
3. Runs `bun run lint` — must be clean (any unfixed violations get an
   inline carve-out comment with the migration TODO)
