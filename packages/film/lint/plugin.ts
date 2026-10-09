// The repo's `film` oxlint plugin: guardrails for the films and the film
// tools that are true of their syntax, read as `film/<rule>`. The root
// `.oxlintrc.json` loads it as a local `.ts` (`jsPlugins`) and turns each rule
// on for the paths it governs with an `overrides` entry.

import { Plugin } from 'oxlint-plugin-effect/rule-bindings';
import { booleansThroughPressed } from './booleans-through-pressed.ts';
import { drawingLiteral } from './drawing-literal.ts';
import { framingIsAKnob } from './framing-is-a-knob.ts';
import { historyThroughHost } from './history-through-host.ts';
import { hostEventsThroughAdapter } from './host-events-through-adapter.ts';
import { keysNamedAsBound } from './keys-named-as-bound.ts';
import { keysThroughKeymap } from './keys-through-keymap.ts';
import { lockThroughSqlite } from './lock-through-sqlite.ts';
import { noCueRemap } from './no-cue-remap.ts';
import { noEaseOnCue } from './no-ease-on-cue.ts';
import { noHandTimedSeconds } from './no-hand-timed-seconds.ts';
import { noHistoryComment } from './no-history-comment.ts';
import { noHostAlias } from './no-host-alias.ts';
import { noPointFreeLog } from './no-point-free-log.ts';
import { noReadOnce } from './no-read-once.ts';
import { noUnprobedInk } from './no-unprobed-ink.ts';
import { oneBreakpoint } from './one-breakpoint.ts';
import { oneClockEpsilon } from './one-clock-epsilon.ts';
import { spanEndsOnAnchor } from './span-ends-on-anchor.ts';
import { spawnBudget } from './spawn-budget.ts';
import { touchesSerial } from './touches-serial.ts';

export default Plugin.define({
  name: 'film',
  rules: {
    'booleans-through-pressed': booleansThroughPressed,
    'drawing-literal': drawingLiteral,
    'framing-is-a-knob': framingIsAKnob,
    'history-through-host': historyThroughHost,
    'host-events-through-adapter': hostEventsThroughAdapter,
    'keys-named-as-bound': keysNamedAsBound,
    'keys-through-keymap': keysThroughKeymap,
    'lock-through-sqlite': lockThroughSqlite,
    'no-cue-remap': noCueRemap,
    'no-ease-on-cue': noEaseOnCue,
    'no-hand-timed-seconds': noHandTimedSeconds,
    'no-history-comment': noHistoryComment,
    'no-host-alias': noHostAlias,
    'no-point-free-log': noPointFreeLog,
    'no-read-once': noReadOnce,
    'no-unprobed-ink': noUnprobedInk,
    'one-breakpoint': oneBreakpoint,
    'one-clock-epsilon': oneClockEpsilon,
    'span-ends-on-anchor': spanEndsOnAnchor,
    'spawn-budget': spawnBudget,
    'touches-serial': touchesSerial,
  },
});
