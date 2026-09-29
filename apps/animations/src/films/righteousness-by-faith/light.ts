// The colour script, lit (CRAFT rule 11; `look` in film.ts holds the targets
// it is measured against). Each scene is lit by its act's light: a colour over
// the middle of the frame, falling to a deeper one at the corners, so the page
// dims round the subject rather than all over, and gold stays the brightest
// thing on it. The parchment itself stays the parchment; the light is what
// changes, act by act:
//   - cold open: a cool, even room without sun;
//   - message: the peach afternoon going toward dusk;
//   - faith: a hazed noon, the dark world's own black in `spoke`;
//   - forgiveness, the valley: sunset on `declared` and the cross, the court
//     at first light after it, and the day coming up in `robe` as the loom
//     weaves, so the robe is white again when it settles on him;
//   - power: early gold morning, warm cream;
//   - landing: teal day, the lightest touch.

import type { Frame, Light } from '@bible/film/canvas';

/** How much of the first light is left once `robe`'s loom has woven: the rest is day. */
const WOVEN = 0.5;

/** The lights, by the act that owns them. */
export const LIGHT = {
  room: { color: '#e6e6e6', edge: '#a9adb4' },
  dusk: { color: '#f2f2f4', edge: '#cccfd8' },
  haze: { color: '#e6e8f0', edge: '#aab2c8' },
  sunset: { color: '#c8ac9a', edge: '#3e3034' },
  firstLight: { color: '#d2ccc8', edge: '#4a4652' },
  morning: { color: '#f0eadf', edge: '#b6aa98' },
  day: { color: '#f6f8f7', edge: '#d6e0dd' },
} as const satisfies Record<string, Light>;

/** `robe`'s first light, its amount rewritten each frame (scratch). */
const DAWN = { ...LIGHT.firstLight, amount: 1 };
/** The first light lifting as the loom weaves the robe. */
const dawn = (f: Frame): Light => {
  DAWN.amount = 1 - (1 - WOVEN) * f.at('weave');
  return DAWN;
};

/** Each drawn scene's light. */
export const lights = new Map<string, Light | ((f: Frame) => Light)>(
  Object.entries({
    cold: LIGHT.room,
    title: LIGHT.room,
    word: LIGHT.room,
    mirror: LIGHT.room,
    message: LIGHT.dusk,
    roof: LIGHT.dusk,
    woman: LIGHT.dusk,
    spoke: LIGHT.haze,
    centurion: LIGHT.haze,
    look: LIGHT.haze,
    declared: LIGHT.sunset,
    exchange: LIGHT.sunset,
    accuser: LIGHT.firstLight,
    robe: dawn,
    within: LIGHT.morning,
    daily: LIGHT.morning,
    rain: LIGHT.day,
    name: LIGHT.day,
    thesis: LIGHT.day,
    end: LIGHT.day,
  }),
);
