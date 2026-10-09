// The shell is one look on every page: at each place (`STATES`' first case,
// the place as it opens), on each device, every part of the page bar and its
// header draws with the computed style the Lab's draws it with. A page's own
// element rule that outweighs a shell part (a link's `color`, a `font`) shows
// here as the part and the property it moved.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { evaluates } from '../../src/lab/fixtures/settled.ts';
import { jsonOf } from '../../src/lab/fixtures/tab.ts';
import { DEVICES, SLOW, STATES, byPlace, labCue } from './studio-states.ts';

/** The parts of the shell, by name: the header, its page bar, a tab in each state, the film's switcher, the timecode and Go to. */
const PARTS = {
  header: '.sh-header',
  films: '.sh-films[data-active="false"]',
  switcher: '.sh-switcher',
  pagebar: '.sh-pagebar',
  currentTab: '.sh-tab[data-active="true"]',
  otherTab: '.sh-tab[data-active="false"]:not([data-disabled])',
  timecode: '.sh-tc',
  goto: '.sh-goto',
};

/** The computed properties that make a part look as it does. */
const LOOK = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textDecorationLine',
  'height',
  'borderTopColor',
  'borderTopWidth',
  'borderTopStyle',
  'borderBottomColor',
  'borderBottomWidth',
  'borderBottomStyle',
  'borderLeftColor',
  'borderLeftWidth',
  'borderRightColor',
  'borderRightWidth',
  'borderTopLeftRadius',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
];

/** An expression run in the page: each part present, with the computed value of each property of its look. */
const LOOKS = `Object.fromEntries(Object.entries(${jsonOf(PARTS)}).flatMap(([part, selector]) => {
  const el = document.querySelector(selector);
  if (el === null) return [];
  const style = getComputedStyle(el);
  return [[part, Object.fromEntries(${jsonOf(LOOK)}.map((property) => [property, style[property]]))]];
}))`;

/**
 * A part a page's own state leaves out, and what that state is: a page with no
 * film hides the page bar and its tabs, and Films, the page it links to, is
 * the current one there.
 */
const LEFT_OUT = {
  films: '.sh-films[data-active="true"]',
  pagebar: '.sh[data-film="false"]',
  currentTab: '.sh[data-film="false"]',
  otherTab: '.sh[data-film="false"]',
};

/** The parts only a page with a playhead shows (`page-shell.tsx`: its time in the header). */
const WITH_A_PLAYHEAD = ['timecode'];

/** What `lab` has drawn, and the page draws otherwise, as sentences: a part it lacks, a property off the Lab's. */
const DIFFERENCES = (lab: string) => `(() => {
  const lab = ${lab};
  const parts = ${jsonOf(PARTS)};
  const leftOut = ${jsonOf(LEFT_OUT)};
  const playheadOnly = ${jsonOf(WITH_A_PLAYHEAD)};
  const looks = ${jsonOf(LOOK)};
  return Object.keys(lab).flatMap((part) => {
    if (part in leftOut && document.querySelector(leftOut[part]) !== null) return [];
    const el = document.querySelector(parts[part]);
    if (el === null && playheadOnly.includes(part)) return [];
    if (el === null) return [\`draws no \${part}\`];
    const style = getComputedStyle(el);
    return looks
      .filter((property) => style[property] !== lab[part][property])
      .map((property) => \`\${part} \${property} is \${style[property]}, the Lab's \${lab[part][property]}\`);
  });
})()`;

/** Each place's first case, the place as it opens, but the Lab's own (`labCue`). */
const OTHER_PLACES = byPlace(STATES).filter(
  ([place], i, all) => place !== 'labScene' && all.findIndex(([first]) => first === place) === i,
);

for (const device of DEVICES) {
  describe(`the shell's parts on ${device.name}`, () => {
    for (const [, state] of OTHER_PLACES) {
      it.live(
        `${state.name}: each draws as the Lab's do`,
        () =>
          Effect.gen(function* () {
            const labPage = yield* labCue(device.viewport);
            // The Lab's header, page bar and tabs are there to be matched.
            yield* evaluates(labPage, `Object.keys(${LOOKS}).length >= 6`, true);
            const lab = yield* labPage.evaluate<unknown>(LOOKS);
            const page = yield* state.open(device.viewport);
            yield* evaluates(page, DIFFERENCES(jsonOf(lab)), []);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}
