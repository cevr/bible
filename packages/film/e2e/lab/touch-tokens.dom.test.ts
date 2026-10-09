// In each state the touch guard opens (`studio-states.ts`), on both devices,
// everything drawn is drawn in the tokens (`untokened`,
// `fixtures/drawn-tokens.ts`), a failure naming each value off them.

import { describe, it } from 'effect-bun-test';
import { SLOW, DEVICES, byPlace, STATES, drawnIn } from './studio-states.ts';

for (const device of DEVICES) {
  describe(`drawn only in its tokens on ${device.name} (G9, DL-9)`, () => {
    for (const [place, state] of byPlace(STATES))
      it.live(
        `${state.name}: every colour, family, size, weight, leading, radius, spacing, shadow and gradient drawn is a token's`,
        () => drawnIn(place, state, device),
        SLOW,
      );
  });
}
