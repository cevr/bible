// The shell is one look on every page: at each place (`STATES`' first case,
// the place as it opens), on each device, every part of the page bar and its
// header draws with the computed style the Lab's draws it with. A page's own
// element rule that outweighs a shell part (a link's `color`, a `font`) shows
// here as the part and the property it moved. The Lab draws every part, and a
// page draws each its place has (the timecode where it has a playhead), so no
// part goes unmatched by being missing from either.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { evaluates } from '../../src/lab/fixtures/settled.ts';
import { jsonOf } from '../../src/lab/fixtures/tab.ts';
import { Places } from '../../src/core/api.ts';
import { DEVICES, LAPTOP, SLOW, STATES, byPlace, labCue, type PlaceName } from './studio-states.ts';

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

/**
 * Whether a page at `place` has a playhead: its place keeps the playhead's
 * time in the URL (`#t=`), and the header shows that time as the timecode
 * (`page-shell.tsx`).
 */
const hasPlayhead = (place: PlaceName) => Places[place].policies.hash.has('t');

/** The parts a page at `place` draws, but those its own state leaves out (`LEFT_OUT`): every one, the timecode only with a playhead. */
const requiredAt = (place: PlaceName): ReadonlyArray<string> =>
  Object.keys(PARTS).filter((part) => part !== 'timecode' || hasPlayhead(place));

/** An expression run in the page: the parts `looks` (`LOOKS` as the page reads) has none of, by name; a whole reference, none. */
const MISSING = (looks: string) =>
  `Object.keys(${jsonOf(PARTS)}).filter((part) => !(part in ${looks}))`;

/**
 * What the page draws otherwise than `lab`, a whole reference (`MISSING`),
 * as sentences: a part of `required` it lacks, a property off the Lab's. A
 * part it need not draw is matched when it draws it.
 */
const DIFFERENCES = (lab: string, required: ReadonlyArray<string>) => `(() => {
  const lab = ${lab};
  const parts = ${jsonOf(PARTS)};
  const leftOut = ${jsonOf(LEFT_OUT)};
  const required = ${jsonOf(required)};
  const looks = ${jsonOf(LOOK)};
  return Object.keys(parts).flatMap((part) => {
    if (part in leftOut && document.querySelector(leftOut[part]) !== null) return [];
    const el = document.querySelector(parts[part]);
    if (el === null && !required.includes(part)) return [];
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
    for (const [place, state] of OTHER_PLACES) {
      it.live(
        `${state.name}: each draws as the Lab's do`,
        () =>
          Effect.gen(function* () {
            const labPage = yield* labCue(device.viewport);
            // The Lab draws every part, the reference each is matched against.
            yield* evaluates(labPage, MISSING(LOOKS), []);
            const lab = yield* labPage.evaluate<unknown>(LOOKS);
            const page = yield* state.open(device.viewport);
            yield* evaluates(page, DIFFERENCES(jsonOf(lab), requiredAt(place)), []);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}

describe("the shell guard's own probe", () => {
  it.live(
    'a playhead page with no timecode, and a reference with no Go to, are found',
    () =>
      Effect.gen(function* () {
        const page = yield* labCue(LAPTOP.viewport);
        const lab = yield* page.evaluate<unknown>(LOOKS);
        yield* page.evaluate(`document.querySelector('.sh-tc').remove()`);
        yield* evaluates(page, DIFFERENCES(jsonOf(lab), requiredAt('lab')), ['draws no timecode']);
        // A place with no playhead does not ask for one.
        yield* evaluates(page, DIFFERENCES(jsonOf(lab), requiredAt('folder')), []);
        yield* page.evaluate(`document.querySelector('.sh-goto').remove()`);
        yield* evaluates(page, MISSING(LOOKS), ['timecode', 'goto']);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
