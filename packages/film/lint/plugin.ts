// The repo's `film` oxlint plugin: guardrails for the films and the film
// tools that are true of their syntax, read as `film/<rule>`. The root
// `.oxlintrc.json` loads it as a local `.ts` (`jsPlugins`) and turns each rule
// on for the paths it governs with an `overrides` entry.

import { Plugin } from 'oxlint-plugin-effect/rule-bindings';
import { drawingLiteral } from './drawing-literal.ts';
import { framingIsAKnob } from './framing-is-a-knob.ts';
import { noCueRemap } from './no-cue-remap.ts';
import { noEaseOnCue } from './no-ease-on-cue.ts';
import { noHandTimedSeconds } from './no-hand-timed-seconds.ts';
import { noPointFreeLog } from './no-point-free-log.ts';
import { noUnprobedInk } from './no-unprobed-ink.ts';
import { spanEndsOnAnchor } from './span-ends-on-anchor.ts';

export default Plugin.define({
  name: 'film',
  rules: {
    'drawing-literal': drawingLiteral,
    'framing-is-a-knob': framingIsAKnob,
    'no-cue-remap': noCueRemap,
    'no-ease-on-cue': noEaseOnCue,
    'no-hand-timed-seconds': noHandTimedSeconds,
    'no-point-free-log': noPointFreeLog,
    'no-unprobed-ink': noUnprobedInk,
    'span-ends-on-anchor': spanEndsOnAnchor,
  },
});
