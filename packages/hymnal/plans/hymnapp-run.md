# hymnapp — "to parallelize some of this work, use /ui guidance /react /composition-patterns and the react-native skills"

The work, in the owner's words (2026-10-16/17): a hymnal app on One (onestack.dev) whose chords match the sheet music, each chord "right above the syllable where the harmony changes"; transpose with a capo fret; light and dark; "a plain hymn first with a toggle somewhere that turns chords on"; full glass design (react-native-gpui videos, Android's closest equivalent); Effect wherever possible with the official Effect atom React integration, local-first, cached and fast; move S3 `cvr-hymns` to Cloudflare R2 with Alchemy; the 1941 Church Hymnal too; chords from the MIDI ("i think its fine, lets use the midi"); the hymn decks get the syllable splits, last.

Host: claude (laptop) · Units at once: 3 heavy · Gate: ~35 s warm (`bun run gate`, 31 tasks) · Reserved: publish, paid calls, force-push, any S3 deletion (the r2 deploy and copy are the orchestrator's after merge, owner 2026-10-18) · Repo: ~/Developer/personal/bible-tools · Base: b27a9471b
Workspaces: git worktrees under `~/Developer/personal/.rifts/bible-tools/<unit>` (rift fails on this repo), branch `hymnapp/<unit>`. Merge = rebase on origin/main, gate, `merge-audit --each`, `git push origin HEAD:main` (ff only).

| Unit     | Depends on              | Workspace                                          | Agents | Result                                                                                                    |
| -------- | ----------------------- | -------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| appbase  | —                       | .rifts/bible-tools/hymnal                          |        | merged 27d0cc3ae (2 rounds; verify pass r2)                                                               |
| simtools | —                       | none (host tools)                                  |        | done: agent-device 0.21.28 + idb 1.7.6, notes/simtools.md                                                 |
| compile  | —                       | .rifts/bible-tools/compile                         | impl a0c9e9b (r2 fresh; r1 a440a5f compacted 2x) |                                                                                                           |
| glass    | appbase                 | .rifts/bible-tools/glass                           | impl ab67b82 (r2 fresh; a879fd1 compacted 2x) |                                                                                                           |
| r2       | appbase                 | .rifts/bible-tools/r2                              | | merged ddd40f803 (3 rounds; verify pass r3); deploy by the orchestrator |
| android  | appbase (build leg)     | none (host tools), then .rifts/bible-tools/android |        | done: tools (NDK 27.1, openjdk@17) + build leg r3: app builds (cold 402 s, warm 5 s), launches on pixel_api36, Chords survives force-stop; recipe in notes/android.md |
| reader   | appbase, compile, glass | .rifts/bible-tools/reader                          |        |                                                                                                           |

Later, not yet planned: `ch1941` (1941 Church Hymnal chords from page scans), `inexact` (the 7 MIDI files whose verses do not split: 126 225 262 292 403 453 580), `decks` (syllable splits into feat/hymn-decks, last by the owner's word), `selah` (deferred: react-native-gpui is not buildable standalone).

## Decisions

- `apps/hymnal` `test` = `bun run test:app && bun run test:infra`; glass owns `test:app` (jest), r2 owns `test:infra` (bun test infra); the second to merge writes the combined line. — one owner per resource, glass/r2
- The app is React (One), not Solid 2: the owner chose One for this app (2026-10-17), so CLAUDE.md's Web UI rule does not apply to it. UI units load the `ui`, `react`, `composition-patterns`, `react-native-best-practices`, `react-native-testing`, `react-navigation` and `ios-simulator-skill` skills (owner, this run). — owner, all UI units
- Install layout: Bun's isolated linker with `publicHoistPattern = ["*", "!bun"]`, not the hoisted linker: One resolves its own dependencies from the app folder (isolated alone fails on `@vxrn/query-string`); hoisted put the npm `bun` (a peer of effect-bun-test) on `node_modules/.bin`, shadowing the Bun that runs scripts and breaking `merge-audit` (`--ignore-scripts`); `peer = false` dropped real peers (zod, RN babel). — fix the cause, appbase
- Host check: the gate is green at base + appbase's commit (31/31, 2026-10-17 19:45). The film e2e and browser suites are skipped: no unit touches packages/film, packages/ui or the lab, and the load (27 on 12 cores) belongs to the RBF agent. Host gaps for this run: no Simulator.app GUI, no `idb` → unit `simtools`. — smallest sufficient check
- Hymn data goes in git: MIDI, the compiled set, the alignment key and the hand charts under `packages/hymnal/data/` (owner, 2026-10-18: "you can keep all in git, its not a big deal"; replaces the earlier keep-out rule). The compile spec was rewritten before it started; r2's `data/` prefix stays for serving. — owner
- The r2 stack's plan, deploy and audio copy run by the orchestrator after r2 merges, not handed to the owner (owner, 2026-10-18: "you deploy yourself"). Stop at the first unexpected plan line. S3 deletion stays the owner's. — owner, r2
- appbase r2 also takes review o4 (root `turbo.json` `globalDependencies: ["bunfig.toml"]`) and o5 (CLAUDE.md's Web UI rule names the hymnal exception): both one-liners on files this unit's change makes wrong, so they land with it, not as later units. — fix the cause, appbase

- compile Decided 10, revised after r1 B1: every hymn's data, hymn 100 included, goes in git. The owner's word ("you can keep all in git, its not a big deal", 2026-10-18) covers all hymn data; the text of all 920 hymns, copyrighted ones too, is already tracked in `packages/core/data/hymnal.db`, so holding one 1923 hymn out protects nothing and leaves the compiled set incomplete. The tests still build small MIDI in code. — owner, compile

- reader lays chords out by structure, not by spacing: each syllable is its own box, its chord (and any `at` > 0 changes) stacked above it, the boxes flowing and wrapping in a proportional font, with no monospace and no padded spaces. The old app used "monospace fonts and percise spaces to put chords in their right positions, it would be nice to not need todo that for this app so chords can appear above the words/syllables" (owner, 2026-10-18). compile already attaches each chord to its syllable (`Placed { chord, at }`), so the data needs no change. — owner, reader

- The Cloudflare CLI `cf` (1.0.0-beta.17, OAuth login, authenticated, measured 2026-10-18) is a tool for the orchestrator around the r2 deploy: read-only checks before it (`cf r2 buckets list` showed no `cvr-hymns` yet, so the deploy creates the bucket rather than adopting it), checks after it (`cf r2 buckets domains custom list`, object listing). Not `cf r2 objects put` for retries: r2 r2 review measured that it percent-encodes the key's slashes despite its own help; a failed key is retried by rerunning the job (idempotent). The copy job stays Effect code. (owner, 2026-10-18: "you can also you use cloudflare cli too") — owner, r2

- glass: safe-area insets come from One's own `useSafeAreaInsets` (One's Root mounts its provider; a second package would read an empty context), replacing spec Decided 9's `react-native-safe-area-context`. glass's acceptance script now runs jest through `test:app` when it exists, so the shared `test` line cannot break it. — one owner per resource, glass

## Owner questions

- glass/android: may the Android build tools be downloaded onto the Mac: NDK 27.1.12297006 (via Android Studio's sdkmanager) and a JDK 17 (e.g. `brew install --cask zulu@17`)? The `pixel_api36` emulator boots (measured), but a native build needs both. Recommendation: yes, so a later `android` unit verifies the Android glass (One.UI.Blur). Until then the run is iOS-only. — answer: "yes you can download" (owner, 2026-10-18). Unit `android`: tools now; the app's Android build after appbase merges.
- simtools: trust the `facebook/fb` tap for idb? — withdrawn: the owner pointed at https://tester.army/e2e (2026-10-17); its driver `agent-device` (Callstack, MIT, npm) needs no tap trust. Decided: agent-device for taps. Then the owner ran `brew trust --formula facebook/fb/idb-companion` (2026-10-17): install both; idb serves the `ios-simulator-skill` scripts.

## Follow-ups

- idb on iOS 27: a zero-duration tap does not land; use `idb ui tap X Y --duration 0.15`. `screen_mapper.py` sees 0 interactive elements in RN screens (switches/text are not buttons) and `navigator.py` has no duration flag: patch the skill's source or prefer agent-device (simtools r2).
- Evaluate `e2e` (tester-army/e2e, Apache-2.0, 0.21.2, ~11k stars; TypeScript tests with deterministic locators plus agent steps, mobile via agent-device, BYO model) as the app's e2e runner and a `verify-hymnal` skill, once `reader` exists (owner pointer, 2026-10-17).
- A Fabric layout oddity: on the placeholder screen the `Switch` drew at the top while its label sat centred (row, alignItems center). Re-check in glass/reader.
- appbase r2 m1: `apps/hymnal/turbo.json` build inputs `app/**` also hash the git-ignored `app/routes.d.ts` that `one dev` writes (needless cache misses, never a false green). Add `"!app/routes.d.ts"`; carried into glass, which owns the app's files next.

- `bun run android` ignores the Metro port (`one run:android` takes no flags, `vite.config.ts` sets no `server.port`), so a unit on a port other than 8081 calls the community CLI with `--port`. Set per-unit ports through `server.port` or an env var in a unit that owns `vite.config.ts` (reader), not mid-glass. (android r3)
- Native screens show a default header titled "index" (Android r3 screenshot); glass hides it for the gallery only. reader owns the real header.

- r2 r3 m1: a malformed R2 reply (a non-string `etag`, a null listing item) throws a TypeError outside the typed errors and stops the copy run (fails safe: nothing verified wrongly). Decode R2's replies with a Schema so a bad field is that key's `StoreFailed`. Also: bun's junit gives every `it.effect` case line 166, so `redfirst` misses `it.effect` cases edited in place (a packages/scripts follow-up).

## Review later
