# shared UI and Impeccable audit

Status: **PASS**

Reviewed commits: `5253853f3d07ee489b16fc14dd09782905aa4b47`, `4dc2dd3469220f704174188c3d34d322f0ffc4f7`
Generated: 2026-07-19T17:47:00.000Z
Repository root: `/Users/cvr/Developer/personal/bible-tools`

## Commands and representative inspection

- `bun run gate` — PASS (21/21 tasks; 149 core, 25 app, 13 desktop, 19 web, 82 CLI, and 9 performance tests passed; 3 platform-dependent CLI tests skipped).
- `bun run --cwd apps/web test:e2e` — PASS in Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- `bun run --cwd apps/desktop test:e2e` — PASS in Electron.
- Agent Browser inspection at 1440 by 1000 and 390 by 844 — PASS for dark, light, and sepia; default and maximum type size; command palette; settings; mobile navigation; and wide Scripture/study split.
- Emulated `prefers-reduced-motion: reduce` — PASS: shared animation duration resolved to `0s` and transition duration to the global near-zero safety value.

## UI audit findings and resolutions

### PASS — the text remains the primary surface

- Scripture owns the primary pane and the study rail starts at a restrained 38 percent while remaining keyboard and pointer resizable: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/reading/bible-reader.tsx:69` and `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/split-pane.tsx:13`.
- Reader-selected theme, typeface, size, leading, tracking, and measure flow through shared CSS variables rather than platform branches: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/application/reading-shell.tsx:31`.
- The wide layout keeps study tools immediately available; the narrow layout removes the divider and stacks tools after the uninterrupted reading surface: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/styles.css:662` and `/Users/cvr/Developer/personal/bible-tools/packages/app/src/styles.css:1432`.

### PASS — navigation is quiet and progressively disclosed

- One shared shell owns desktop navigation, a compact mobile menu, skip navigation, command trigger, canonical destinations, and route-aware current state: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/application/reading-shell.tsx:70`.
- The command palette is a shared dialog-backed destination filter with empty state and keyboard selection: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/command-palette.tsx:22`.
- The visible `/` and Control/Command-K routes do not fire while the reader is editing text: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/application/reading-shell.tsx:86`.

### PASS — primitives own their accessibility behavior

- Dialog owns modal semantics, focus entry/trap/restoration, topmost Escape handling, outside dismissal, scroll locking, portal cleanup, and explicit trigger restoration for WebKit: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/dialog.tsx:17`.
- Menu owns controlled/uncontrolled state, arrow/Home/End navigation, typeahead, outside dismissal, focus restoration, and first/last entry semantics: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/menu.tsx:20` and `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/menu.tsx:107`.
- The audit found pointer-only verse context invocation. It was fixed with standard ContextMenu and Shift-F10 keyboard entry plus restoration to the invoking verse: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/menu.tsx:162` and `/Users/cvr/Developer/personal/bible-tools/apps/web/e2e/smoke.spec.ts:67`.
- Tabs have stable ARIA relationships, roving tab order, and arrow/Home/End navigation: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/tabs.tsx:18`.
- Split panes expose separator value semantics and support pointer, arrow, shifted-arrow, Home, and End resizing: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/ui/split-pane.tsx:13`.

### PASS — study tools remain contextual and honest

- Verse actions open the same study route or a canonical encoded search rather than creating a second navigation model: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/reading/bible-reader.tsx:21`.
- Notes, references, collections, bookmark state, and marker state use real synced mutations with accessible failure/loading states; no decorative placeholder action remains: `/Users/cvr/Developer/personal/bible-tools/packages/app/src/library/annotation-tools.tsx:49` and `/Users/cvr/Developer/personal/bible-tools/packages/app/src/library/annotation-tools.tsx:209`.

### PASS — responsive and cross-host behavior is executable evidence

- Web acceptance covers focus restoration, command routing, keyboard split resizing, pointer and keyboard context menus, roving tabs, search, mobile navigation, overflow, and browser errors in one session: `/Users/cvr/Developer/personal/bible-tools/apps/web/e2e/smoke.spec.ts:28`.
- Electron acceptance proves the same command, route, split, tabs, reading, and search surface through the desktop procedure runtime: `/Users/cvr/Developer/personal/bible-tools/apps/desktop/e2e/smoke.spec.ts:6`.
- Shared reduced-motion and narrow-layout rules are centralized at `/Users/cvr/Developer/personal/bible-tools/packages/app/src/styles.css:1344` and `/Users/cvr/Developer/personal/bible-tools/packages/app/src/styles.css:1450`.

## Effect lint ownership

This wave added Solid presentation primitives and route composition only; it did not migrate an additional Effect-native module. Existing Effect-owned packages remained under the repository's full `oxlint-plugin-effect` recommended preset, and `bun run lint` passed before every typecheck and focused test run.

## Findings

- No blocking UI or Impeccable findings remain.
