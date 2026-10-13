// The shell is one look on every page: at each place (`STATES`' first case,
// the place as it opens), on each device, every part of the page bar and its
// header draws with the computed style the Lab's draws it with: each match of
// a part (every other tab, not the first alone), its first child (a tab's
// icon), and each control with the pointer over it and with the keyboard's
// focus on it. A page's own element rule that outweighs a shell part (a
// link's `color`, a `font`, a margin) shows here as the part and the property
// it moved. The Lab draws every part, and a page draws each its place has
// (the timecode where it has a playhead), so no part goes unmatched by being
// missing from either. Each state is checked to hold before it is read: the
// Lab's is the reference, so a state it never took, or a control its pointer
// cannot reach, is a failure, and so is a control the page draws (and does
// not leave out by its own state) that a layer keeps from the pointer.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { evaluates } from '../../src/lab/fixtures/settled.ts';
import { type Tab, jsonOf } from '../../src/lab/fixtures/tab.ts';
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

type Part = keyof typeof PARTS;

/** The computed properties that make a part look as it does. */
const LOOK = [
  'color',
  'backgroundColor',
  'opacity',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
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
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'boxShadow',
  'outlineColor',
  'outlineStyle',
  'outlineWidth',
  'outlineOffset',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'rowGap',
  'columnGap',
];

/** A look, as the page computes it: each property of `LOOK` by name. */
type Look = { readonly [property: string]: string };

/** Each part in any state: its selector up to its first attribute or pseudo-class (`.sh-tab`). */
const ANY_PART = [
  ...new Set(Object.values(PARTS).map((selector) => selector.replace(/[[:].*$/, ''))),
];

/**
 * In the page: `look(el)`, the computed value of each property of `LOOK` on
 * `el`; and `childLook(el)`, its first child's look, or `none`, or `part`
 * when the child is itself a part (the header's Films link), matched as that
 * part in its own state.
 */
const LOOK_OF = `const look = (el) => {
  const style = getComputedStyle(el);
  return Object.fromEntries(${jsonOf(LOOK)}.map((property) => [property, style[property]]));
};
const childLook = (el) => {
  const child = el.firstElementChild;
  if (child === null) return 'none';
  if (child.matches(${jsonOf(ANY_PART.join(', '))})) return 'part';
  return look(child);
};`;

/** An expression run in the page: each part present, as every match of it, each with its look and its first child's. */
const LOOKS = `(() => {
  ${LOOK_OF}
  return Object.fromEntries(Object.entries(${jsonOf(PARTS)}).flatMap(([part, selector]) => {
    const all = [...document.querySelectorAll(selector)];
    if (all.length === 0) return [];
    return [[part, all.map((el) => ({ self: look(el), child: childLook(el) }))]];
  }));
})()`;

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
 * as sentences: a part of `required` it lacks, and for each match of a part
 * (the second other tab is `otherTab 2`), a property off the Lab's first
 * match, its first child missing or a property of it off the Lab's. A part
 * it need not draw is matched when it draws it.
 */
const DIFFERENCES = (lab: string, required: ReadonlyArray<string>) => `(() => {
  ${LOOK_OF}
  const lab = ${lab};
  const parts = ${jsonOf(PARTS)};
  const leftOut = ${jsonOf(LEFT_OUT)};
  const required = ${jsonOf(required)};
  const looks = ${jsonOf(LOOK)};
  const off = (name, mine, theirs) => looks
    .filter((property) => mine[property] !== theirs[property])
    .map((property) => \`\${name} \${property} is \${mine[property]}, the Lab's \${theirs[property]}\`);
  return Object.keys(parts).flatMap((part) => {
    if (part in leftOut && document.querySelector(leftOut[part]) !== null) return [];
    const all = [...document.querySelectorAll(parts[part])];
    if (all.length === 0 && !required.includes(part)) return [];
    if (all.length === 0) return [\`draws no \${part}\`];
    const reference = lab[part][0];
    return all.flatMap((el, i) => {
      const name = i === 0 ? part : \`\${part} \${i + 1}\`;
      const child = childLook(el);
      const children = () => {
        if (typeof reference.child === 'string' || child === 'part') return [];
        if (child === 'none') return [\`\${name} draws no child\`];
        return off(\`\${name} child\`, child, reference.child);
      };
      return [...off(name, look(el), reference.self), ...children()];
    });
  });
})()`;

/** The controls of the shell, which a pointer and the keyboard's focus land on. */
const CONTROLS: ReadonlyArray<Part> = ['films', 'switcher', 'currentTab', 'otherTab', 'goto'];

/** A point on the page, in its viewport's pixels. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Where a viewer can hold each control on a page: its middle, for each one
 * drawn and not left out by the page's own state (`LEFT_OUT`); `covered`, each
 * such control the pointer cannot reach at its middle (a layer over it), which
 * is a failure, never a control skipped; and `rest`, a point on the header
 * over none, for the pointer to wait on.
 */
interface Holds {
  readonly at: { readonly [part: string]: Point };
  readonly covered: ReadonlyArray<Part>;
  readonly rest: Point;
}

/** An expression run in the page: its `Holds`. */
const HOLDS = `(() => {
  const parts = ${jsonOf(PARTS)};
  const leftOut = ${jsonOf(LEFT_OUT)};
  const controls = ${jsonOf(CONTROLS)};
  const middle = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, r };
  };
  const drawn = controls.flatMap((part) => {
    if (part in leftOut && document.querySelector(leftOut[part]) !== null) return [];
    const el = document.querySelector(parts[part]);
    if (el === null) return [];
    const { x, y, r } = middle(el);
    if (r.width === 0 || r.height === 0) return [];
    const hit = document.elementFromPoint(x, y);
    return [{ part, x, y, reached: hit !== null && el.contains(hit) }];
  });
  const at = Object.fromEntries(drawn.filter((d) => d.reached).map((d) => [d.part, { x: d.x, y: d.y }]));
  const covered = drawn.filter((d) => !d.reached).map((d) => d.part);
  const anyControl = controls.map((part) => parts[part]).join(', ');
  const header = document.querySelector(parts.header).getBoundingClientRect();
  const rest = Array.from({ length: Math.floor(header.width / 4) }, (_, i) => ({ x: header.x + i * 4 + 2, y: header.y + header.height / 2 }))
    .find((p) => { const hit = document.elementFromPoint(p.x, p.y); return hit !== null && hit.closest(anyControl) === null; });
  return { at, covered, rest };
})()`;

/**
 * An expression run in the page: the look of each of `held`'s controls with
 * the keyboard's focus put on it (and taken off once read), with `held`: `yes`,
 * or why not (`not :focus-visible`), so a state the page never takes is a
 * difference, never a match.
 */
const FOCUSED = (held: ReadonlyArray<Part>) => `(() => {
  ${LOOK_OF}
  const parts = ${jsonOf(PARTS)};
  return Object.fromEntries(${jsonOf(held)}.map((part) => {
    const el = document.querySelector(parts[part]);
    el.focus({ focusVisible: true });
    const seen = { held: el.matches(':focus-visible') ? 'yes' : 'not :focus-visible', ...look(el) };
    el.blur();
    return [part, seen];
  }));
})()`;

/** An expression run in the page: the look of `part`'s first match, with whether the pointer is over it (`held`). */
const HOVERED = (part: Part) => `(() => {
  ${LOOK_OF}
  const el = document.querySelector(${jsonOf(PARTS[part])});
  return { held: el.matches(':hover') ? 'yes' : 'not :hover', ...look(el) };
})()`;

/** Each of `held`'s controls on `page`, by part, as it looks focused and under the pointer. */
interface HeldLooks {
  readonly focus: { readonly [part: string]: Look };
  readonly hover: { readonly [part: string]: Look };
}

/**
 * The look of each of `held`'s controls on `page` with the keyboard's focus on
 * it and with the pointer over it. The Tab offers no DevTools call to force a
 * state, so each is the viewer's own: the focus put on it as a key would, the
 * pointer waiting at `holds.rest` meanwhile, then the mouse moved to its middle.
 */
const heldLooks = (page: Tab, holds: Holds, held: ReadonlyArray<Part>) =>
  Effect.gen(function* () {
    yield* page.mouse.move(holds.rest.x, holds.rest.y);
    const focus = yield* page.evaluate<HeldLooks['focus']>(FOCUSED(held));
    const hover: { [part: string]: Look } = {};
    for (const part of held) {
      const { x, y } = holds.at[part] ?? holds.rest;
      yield* page.mouse.move(x, y);
      hover[part] = yield* page.evaluate<Look>(HOVERED(part));
    }
    return { focus, hover };
  });

/** What a held look is read for: whether the state held, then the look. */
const HELD_READ = ['held', ...LOOK];

/**
 * Each property `mine` holds otherwise than `theirs`, as a sentence; a state
 * that did not hold on the page is one (`held`). The Lab is the reference:
 * a state it never took is no look to match, so that is the sentence, and
 * neither taking a state is a failure, never a match.
 */
const heldOff = (name: string, mine: Look, theirs: Look): ReadonlyArray<string> => {
  if (theirs['held'] !== 'yes') return [`${name}: the Lab's never took it (${theirs['held']})`];
  return HELD_READ.filter((property) => mine[property] !== theirs[property]).map(
    (property) => `${name} ${property} is ${mine[property]}, the Lab's ${theirs[property]}`,
  );
};

/**
 * Each control a viewer can hold both on `page` and on the Lab (`lab`),
 * focused and under the pointer, read against the Lab's held the same way.
 * The Lab holds every control (a control it cannot is a sentence); a page
 * holds each it draws but those its own state leaves out (`LEFT_OUT`), and a
 * control it draws that the pointer cannot reach is a sentence, never one
 * skipped.
 */
const heldDifferences = (lab: Tab, page: Tab) =>
  Effect.gen(function* () {
    const labHolds = yield* lab.evaluate<Holds>(HOLDS);
    const pageHolds = yield* page.evaluate<Holds>(HOLDS);
    const held = CONTROLS.filter((part) => part in labHolds.at && part in pageHolds.at);
    const theirs = yield* heldLooks(lab, labHolds, held);
    const mine = yield* heldLooks(page, pageHolds, held);
    return [
      ...CONTROLS.filter((part) => !(part in labHolds.at)).map(
        (part) => `${part}: the Lab's cannot be held`,
      ),
      ...pageHolds.covered.map((part) => `${part}: the page's cannot be held`),
      ...held.flatMap((part) => [
        ...heldOff(`${part} focus`, mine.focus[part] ?? {}, theirs.focus[part] ?? {}),
        ...heldOff(`${part} hover`, mine.hover[part] ?? {}, theirs.hover[part] ?? {}),
      ]),
    ];
  });

/** Each place's first case, the place as it opens, but the Lab's own (`labCue`). */
const OTHER_PLACES = byPlace(STATES).filter(
  ([place], i, all) => place !== 'labScene' && all.findIndex(([first]) => first === place) === i,
);

for (const device of DEVICES) {
  describe(`the shell's parts on ${device.name}`, () => {
    for (const [place, state] of OTHER_PLACES) {
      it.live(
        `${state.name}: each draws as the Lab's do, held or not`,
        () =>
          Effect.gen(function* () {
            const labPage = yield* labCue(device.viewport);
            // The Lab draws every part, the reference each is matched against, and each match
            // of a part draws as its first does.
            yield* evaluates(labPage, MISSING(LOOKS), []);
            const lab = yield* labPage.evaluate<unknown>(LOOKS);
            yield* evaluates(labPage, DIFFERENCES(jsonOf(lab), requiredAt('lab')), []);
            const page = yield* state.open(device.viewport);
            yield* evaluates(page, DIFFERENCES(jsonOf(lab), requiredAt(place)), []);
            expect(yield* heldDifferences(labPage, page)).toEqual([]);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}

/** In the page: a sheet of `css` added over the shell, as a page's own rule would be. */
const plant = (css: string) =>
  `(() => { const s = document.createElement('style'); s.textContent = ${jsonOf(css)}; document.head.append(s); return true; })()`;

/** In the page: `differences`' sentences, each up to its property (`otherTab 2 color`). */
const named = (differences: string) => `${differences}.map((d) => d.split(' is ')[0])`;

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

  it.live(
    "a page's rule that moves a later match, a part's spacing, a child, a corner or the type is found",
    () =>
      Effect.gen(function* () {
        const page = yield* labCue(LAPTOP.viewport);
        const lab = yield* page.evaluate<unknown>(LOOKS);
        yield* evaluates(
          page,
          `document.querySelectorAll(${jsonOf(PARTS.otherTab)}).length > 1`,
          true,
        );
        yield* page.evaluate(
          plant(
            [
              // Each a property no child inherits and no colour follows (`currentColor`), but
              // the italic, which the tab's icon takes: so each sentence is the plant's own.
              `${PARTS.otherTab} ~ ${PARTS.otherTab} { background-color: rgb(255, 0, 0) !important; }`,
              '.sh-pagebar { opacity: 0.4 !important; margin-left: 12px !important; column-gap: 30px !important; }',
              '.sh-switcher > :first-child { background-color: rgb(255, 0, 0) !important; }',
              `${PARTS.currentTab} { border-bottom-right-radius: 9px !important; font-style: italic !important; }`,
            ].join('\n'),
          ),
        );
        yield* evaluates(page, named(DIFFERENCES(jsonOf(lab), requiredAt('lab'))), [
          'switcher child backgroundColor',
          'pagebar opacity',
          'pagebar marginLeft',
          'pagebar columnGap',
          'currentTab fontStyle',
          'currentTab borderBottomRightRadius',
          'currentTab child fontStyle',
          'otherTab 2 backgroundColor',
          'otherTab 3 backgroundColor',
          'otherTab 4 backgroundColor',
          'otherTab 5 backgroundColor',
        ]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a page's rule for a control under the pointer or the keyboard's focus is found, and a state the page never takes is one",
    () =>
      Effect.gen(function* () {
        const lab = yield* labCue(LAPTOP.viewport);
        const page = yield* labCue(LAPTOP.viewport);
        expect(yield* heldDifferences(lab, page)).toEqual([]);
        yield* page.evaluate(
          plant(
            [
              `${PARTS.otherTab}:hover { background-color: rgb(255, 0, 0) !important; }`,
              '.sh-header .sh-goto:focus-visible { box-shadow: none !important; }',
            ].join('\n'),
          ),
        );
        expect((yield* heldDifferences(lab, page)).map((d) => d.split(' is ')[0])).toEqual([
          'otherTab hover backgroundColor',
          'goto focus boxShadow',
        ]);
        // A control the keyboard cannot focus takes no focus state: its read says so, and a
        // state the page never takes, the Lab's taken, is a difference.
        const disable = `document.querySelector('.sh-goto').setAttribute('disabled', '')`;
        yield* page.evaluate(disable);
        yield* evaluates(page, `${FOCUSED(['goto'])}.goto.held`, 'not :focus-visible');
        const unheld = (differences: ReadonlyArray<string>) =>
          differences.filter((d) => d.startsWith('goto focus') && !d.includes(' is '));
        expect(
          (yield* heldDifferences(lab, page)).filter((d) => d.startsWith('goto focus held')),
        ).toEqual(["goto focus held is not :focus-visible, the Lab's yes"]);
        // Neither taking it is no match: the Lab's reference never took it.
        yield* lab.evaluate(disable);
        expect(unheld(yield* heldDifferences(lab, page))).toEqual([
          "goto focus: the Lab's never took it (not :focus-visible)",
        ]);
        // Nor is a control the Lab's pointer cannot reach.
        yield* lab.evaluate(plant('.sh-header .sh-goto { pointer-events: none !important; }'));
        expect((yield* heldDifferences(lab, page)).filter((d) => d.startsWith('goto'))).toEqual([
          "goto: the Lab's cannot be held",
        ]);
        // Nor is a control of the page's a stray layer covers: the planted hover rule goes
        // unread under it, so each covered control is the sentence, never one skipped.
        yield* page.evaluate(
          `(() => { const layer = document.createElement('div'); layer.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; background: transparent'; document.body.append(layer); return true; })()`,
        );
        expect(
          (yield* heldDifferences(lab, page)).filter((d) =>
            d.endsWith("the page's cannot be held"),
          ),
        ).toEqual(CONTROLS.map((part) => `${part}: the page's cannot be held`));
      }).pipe(Effect.scoped),
    SLOW,
  );
});
