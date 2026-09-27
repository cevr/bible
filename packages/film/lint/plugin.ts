// The repo's `film` oxlint plugin: guardrails for the film draw path that are
// true of its syntax, read as `film/<rule>`. The root `.oxlintrc.json` loads
// it as a local `.ts` (`jsPlugins`) and turns each rule on for the films it
// governs with an `overrides` entry.

import { Plugin } from 'oxlint-plugin-effect/rule-bindings';
import { drawingLiteral } from './drawing-literal.ts';

export default Plugin.define({
  name: 'film',
  rules: {
    'drawing-literal': drawingLiteral,
  },
});
