// The repo's `film` oxlint plugin: guardrails for the films and the film
// tools that are true of their syntax, read as `film/<rule>`. The root
// `.oxlintrc.json` loads it as a local `.ts` (`jsPlugins`) and turns each rule
// on for the paths it governs with an `overrides` entry.

import { Plugin } from 'oxlint-plugin-effect/rule-bindings';
import { booleansThroughPressed } from './booleans-through-pressed.ts';
import { drawingLiteral } from './drawing-literal.ts';
import { focusThroughFocusFor } from './focus-through-focus-for.ts';
import { framingIsAKnob } from './framing-is-a-knob.ts';
import { historyThroughHost } from './history-through-host.ts';
import { hostEventsThroughAdapter } from './host-events-through-adapter.ts';
import { keysNamedAsBound } from './keys-named-as-bound.ts';
import { keysThroughKeymap } from './keys-through-keymap.ts';
import { lockThroughSqlite } from './lock-through-sqlite.ts';
import { mediaThroughPlayer } from './media-through-player.ts';
import { noCueRemap } from './no-cue-remap.ts';
import { noEaseOnCue } from './no-ease-on-cue.ts';
import { noHandTimedSeconds } from './no-hand-timed-seconds.ts';
import { noHistoryComment } from './no-history-comment.ts';
import { noLazyTestFixture } from './no-lazy-test-fixture.ts';
import { noReadOnce } from './no-read-once.ts';
import { noTestSeam } from './no-test-seam.ts';
import { noUnprobedInk } from './no-unprobed-ink.ts';
import { oneBreakpoint } from './one-breakpoint.ts';
import { oneClockEpsilon } from './one-clock-epsilon.ts';
import { pagesInCaseScope } from './pages-in-case-scope.ts';
import { spanEndsOnAnchor } from './span-ends-on-anchor.ts';
import { synthOwnMath } from './synth-own-math.ts';
import { testsKeepTheirStrength } from './tests-keep-their-strength.ts';
import { toldAfterAnswer } from './told-after-answer.ts';
import { touchesSerial } from './touches-serial.ts';

export default Plugin.define({
  name: 'film',
  rules: {
    'booleans-through-pressed': booleansThroughPressed,
    'drawing-literal': drawingLiteral,
    'focus-through-focus-for': focusThroughFocusFor,
    'framing-is-a-knob': framingIsAKnob,
    'history-through-host': historyThroughHost,
    'host-events-through-adapter': hostEventsThroughAdapter,
    'keys-named-as-bound': keysNamedAsBound,
    'keys-through-keymap': keysThroughKeymap,
    'lock-through-sqlite': lockThroughSqlite,
    'media-through-player': mediaThroughPlayer,
    'no-cue-remap': noCueRemap,
    'no-ease-on-cue': noEaseOnCue,
    'no-hand-timed-seconds': noHandTimedSeconds,
    'no-history-comment': noHistoryComment,
    'no-lazy-test-fixture': noLazyTestFixture,
    'no-read-once': noReadOnce,
    'no-test-seam': noTestSeam,
    'no-unprobed-ink': noUnprobedInk,
    'one-breakpoint': oneBreakpoint,
    'one-clock-epsilon': oneClockEpsilon,
    'pages-in-case-scope': pagesInCaseScope,
    'span-ends-on-anchor': spanEndsOnAnchor,
    'synth-own-math': synthOwnMath,
    'tests-keep-their-strength': testsKeepTheirStrength,
    'told-after-answer': toldAfterAnswer,
    'touches-serial': touchesSerial,
  },
});
