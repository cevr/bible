// The shell is one look on every page: at each place (`STATES`' first case,
// the place as it opens), on each device, every part of its header draws
// with the computed style a Set's draws it with: each match of a part, its
// first child (the Films link's icon), and each control with the pointer over
// it and with the keyboard's focus on it. A page's own element rule that
// outweighs a shell part (a link's `color`, a `font`, a margin) shows here as
// the part and the property it moved. A Set (`STATES.set`'s first case) is
// the reference: it is a film's, so it draws the Studio link, and it has a
// playhead, so it draws the timecode; a page draws each part its place has,
// so no part goes unmatched by being missing from either. The studio draws a
// header of its own (`film-studio/`), not the shell's, so it is no place here.
// Each state is checked to hold before it is read: a state the reference
// never took, or a control its pointer cannot reach, is a failure, and so is
// a control the page draws (and does not leave out by its own state) that a
// layer keeps from the pointer. A kit button in a state's colour reads at AA on
// the ground it draws, at rest, hovered, pressed and focused.

import { Array as Arr, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { evaluates } from '../../src/lab/fixtures/settled.ts';
import { type Tab, jsonOf } from '../../src/lab/fixtures/tab.ts';
import { Places } from '../../src/core/api.ts';
import {
  DEVICES,
  type Device,
  LAPTOP,
  SLOW,
  STATES,
  byPlace,
  type PlaceName,
} from './studio-states.ts';

/** The parts of the shell, by name: the header, Films, the film's switcher, its Studio link, the timecode and Go to. */
const PARTS = {
  header: '.sh-header',
  films: '.sh-films',
  switcher: '.sh-switcher',
  studio: '.sh-studio',
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

/** Each part in any state: its selector up to its first attribute or pseudo-class (`.sh-films`). */
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

/** A part a page's own state leaves out, and what that state is: a page with no film has no studio to link. */
const LEFT_OUT = {
  studio: '.sh[data-film="false"]',
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
 * What the page draws otherwise than `reference`, a whole one (`MISSING`),
 * as sentences: a part of `required` it lacks, and for each match of a part
 * (the second Studio link is `studio 2`), a property off the reference's
 * first match, its first child missing or a property of it off the reference's. A part
 * it need not draw is matched when it draws it.
 */
const DIFFERENCES = (reference: string, required: ReadonlyArray<string>) => `(() => {
  ${LOOK_OF}
  const ref = ${reference};
  const parts = ${jsonOf(PARTS)};
  const leftOut = ${jsonOf(LEFT_OUT)};
  const required = ${jsonOf(required)};
  const looks = ${jsonOf(LOOK)};
  const off = (name, mine, theirs) => looks
    .filter((property) => mine[property] !== theirs[property])
    .map((property) => \`\${name} \${property} is \${mine[property]}, the reference's \${theirs[property]}\`);
  return Object.keys(parts).flatMap((part) => {
    if (part in leftOut && document.querySelector(leftOut[part]) !== null) return [];
    const all = [...document.querySelectorAll(parts[part])];
    if (all.length === 0 && !required.includes(part)) return [];
    if (all.length === 0) return [\`draws no \${part}\`];
    const first = ref[part][0];
    return all.flatMap((el, i) => {
      const name = i === 0 ? part : \`\${part} \${i + 1}\`;
      const child = childLook(el);
      const children = () => {
        if (typeof first.child === 'string' || child === 'part') return [];
        if (child === 'none') return [\`\${name} draws no child\`];
        return off(\`\${name} child\`, child, first.child);
      };
      return [...off(name, look(el), first.self), ...children()];
    });
  });
})()`;

/** The controls of the shell, which a pointer and the keyboard's focus land on. */
const CONTROLS: ReadonlyArray<Part> = ['films', 'switcher', 'studio', 'goto'];

/** The controls each device's header shows: a phone's no Studio link (the film menu's Open the studio is its way there). */
const CONTROLS_ON: Readonly<Record<Device['budget'], ReadonlyArray<Part>>> = {
  phone: CONTROLS.filter((part) => part !== 'studio'),
  laptop: CONTROLS,
};

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
 * that did not hold on the page is one (`held`). The reference (a Set) is
 * the one read against: a state it never took is no look to match, so that is the sentence, and
 * neither taking a state is a failure, never a match.
 */
const heldOff = (name: string, mine: Look, theirs: Look): ReadonlyArray<string> => {
  if (theirs['held'] !== 'yes')
    return [`${name}: the reference's never took it (${theirs['held']})`];
  return HELD_READ.filter((property) => mine[property] !== theirs[property]).map(
    (property) => `${name} ${property} is ${mine[property]}, the reference's ${theirs[property]}`,
  );
};

/**
 * Each control a viewer can hold both on `page` and on the reference (`ref`),
 * focused and under the pointer, read against the reference's held the same way.
 * The reference holds every one of `controls` (one it cannot is a sentence); a page
 * holds each it draws but those its own state leaves out (`LEFT_OUT`), and a
 * control it draws that the pointer cannot reach is a sentence, never one
 * skipped.
 */
const heldDifferences = (ref: Tab, page: Tab, controls: ReadonlyArray<Part> = CONTROLS) =>
  Effect.gen(function* () {
    const refHolds = yield* ref.evaluate<Holds>(HOLDS);
    const pageHolds = yield* page.evaluate<Holds>(HOLDS);
    const held = controls.filter((part) => part in refHolds.at && part in pageHolds.at);
    const theirs = yield* heldLooks(ref, refHolds, held);
    const mine = yield* heldLooks(page, pageHolds, held);
    return [
      ...controls
        .filter((part) => !(part in refHolds.at))
        .map((part) => `${part}: the reference's cannot be held`),
      ...pageHolds.covered.map((part) => `${part}: the page's cannot be held`),
      ...held.flatMap((part) => [
        ...heldOff(`${part} focus`, mine.focus[part] ?? {}, theirs.focus[part] ?? {}),
        ...heldOff(`${part} hover`, mine.hover[part] ?? {}, theirs.hover[part] ?? {}),
      ]),
    ];
  });

/** The reference every place is read against: a Set as it opens (`STATES.set`'s first case). */
const reference = (viewport: Device['viewport']) =>
  Option.match(
    Arr.findFirst(byPlace(STATES), ([place]) => place === 'set'),
    {
      onNone: () => Effect.die('STATES opens no Set'),
      onSome: ([, state]) => state.open(viewport),
    },
  );

/** Each place's first case, the place as it opens, but the reference's own (a Set) and the studio's. */
const OTHER_PLACES = byPlace(STATES).filter(
  ([place], i, all) =>
    place !== 'set' && place !== 'studio' && all.findIndex(([first]) => first === place) === i,
);

for (const device of DEVICES) {
  describe(`the shell's parts on ${device.name}`, () => {
    for (const [place, state] of OTHER_PLACES) {
      it.live(
        `${state.name}: each draws as a Set's do, held or not`,
        () =>
          Effect.gen(function* () {
            const refPage = yield* reference(device.viewport);
            // The Set draws every part, the reference each is matched against, and each match
            // of a part draws as its first does.
            yield* evaluates(refPage, MISSING(LOOKS), []);
            const ref = yield* refPage.evaluate<unknown>(LOOKS);
            yield* evaluates(refPage, DIFFERENCES(jsonOf(ref), requiredAt('set')), []);
            const page = yield* state.open(device.viewport);
            yield* evaluates(page, DIFFERENCES(jsonOf(ref), requiredAt(place)), []);
            expect(yield* heldDifferences(refPage, page, CONTROLS_ON[device.budget])).toEqual([]);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}

/** In the page: a sheet of `css` added over the shell, as a page's own rule would be. */
const plant = (css: string) =>
  `(() => { const s = document.createElement('style'); s.textContent = ${jsonOf(css)}; document.head.append(s); return true; })()`;

/** In the page: `differences`' sentences, each up to its property (`studio 2 color`). */
const named = (differences: string) => `${differences}.map((d) => d.split(' is ')[0])`;

describe("the shell guard's own probe", () => {
  it.live(
    'a playhead page with no timecode, and a reference with no Go to, are found',
    () =>
      Effect.gen(function* () {
        const page = yield* reference(LAPTOP.viewport);
        const ref = yield* page.evaluate<unknown>(LOOKS);
        yield* page.evaluate(`document.querySelector('.sh-tc').remove()`);
        yield* evaluates(page, DIFFERENCES(jsonOf(ref), requiredAt('set')), ['draws no timecode']);
        // A place with no playhead does not ask for one.
        yield* evaluates(page, DIFFERENCES(jsonOf(ref), requiredAt('folder')), []);
        yield* page.evaluate(`document.querySelector('.sh-goto').remove()`);
        yield* evaluates(page, MISSING(LOOKS), ['timecode', 'goto']);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a page's rule that moves a later match, a part's spacing, a child, a corner or the type is found",
    () =>
      Effect.gen(function* () {
        const page = yield* reference(LAPTOP.viewport);
        const ref = yield* page.evaluate<unknown>(LOOKS);
        // A second Studio link after the first: a later match of a part.
        yield* page.evaluate(
          `(() => { const a = document.querySelector(${jsonOf(PARTS.studio)}); a.after(a.cloneNode(true)); return true; })()`,
        );
        yield* page.evaluate(
          plant(
            [
              // Each a property no child inherits and no colour follows (`currentColor`), but
              // the italic, which the Films link's icon takes: so each sentence is the plant's own.
              `${PARTS.studio} ~ ${PARTS.studio} { background-color: rgb(255, 0, 0) !important; }`,
              '.sh-header { opacity: 0.4 !important; margin-left: 12px !important; column-gap: 30px !important; }',
              '.sh-switcher > :first-child { background-color: rgb(255, 0, 0) !important; }',
              `${PARTS.films} { border-bottom-right-radius: 9px !important; font-style: italic !important; }`,
            ].join('\n'),
          ),
        );
        yield* evaluates(page, named(DIFFERENCES(jsonOf(ref), requiredAt('set'))), [
          'header opacity',
          'header marginLeft',
          'header columnGap',
          'films fontStyle',
          'films borderBottomRightRadius',
          'films child fontStyle',
          'switcher child backgroundColor',
          'studio 2 backgroundColor',
        ]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a page's rule for a control under the pointer or the keyboard's focus is found, and a state the page never takes is one",
    () =>
      Effect.gen(function* () {
        const ref = yield* reference(LAPTOP.viewport);
        const page = yield* reference(LAPTOP.viewport);
        expect(yield* heldDifferences(ref, page)).toEqual([]);
        yield* page.evaluate(
          plant(
            [
              `${PARTS.studio}:hover { background-color: rgb(255, 0, 0) !important; }`,
              '.sh-header .sh-goto:focus-visible { box-shadow: none !important; }',
            ].join('\n'),
          ),
        );
        expect((yield* heldDifferences(ref, page)).map((d) => d.split(' is ')[0])).toEqual([
          'studio hover backgroundColor',
          'goto focus boxShadow',
        ]);
        // A control the keyboard cannot focus takes no focus state: its read says so, and a
        // state the page never takes, the reference's taken, is a difference.
        const disable = `document.querySelector('.sh-goto').setAttribute('disabled', '')`;
        yield* page.evaluate(disable);
        yield* evaluates(page, `${FOCUSED(['goto'])}.goto.held`, 'not :focus-visible');
        const unheld = (differences: ReadonlyArray<string>) =>
          differences.filter((d) => d.startsWith('goto focus') && !d.includes(' is '));
        expect(
          (yield* heldDifferences(ref, page)).filter((d) => d.startsWith('goto focus held')),
        ).toEqual(["goto focus held is not :focus-visible, the reference's yes"]);
        // Neither taking it is no match: the reference never took it.
        yield* ref.evaluate(disable);
        expect(unheld(yield* heldDifferences(ref, page))).toEqual([
          "goto focus: the reference's never took it (not :focus-visible)",
        ]);
        // Nor is a control the reference's pointer cannot reach.
        yield* ref.evaluate(plant('.sh-header .sh-goto { pointer-events: none !important; }'));
        expect((yield* heldDifferences(ref, page)).filter((d) => d.startsWith('goto'))).toEqual([
          "goto: the reference's cannot be held",
        ]);
        // Nor is a control of the page's a stray layer covers: the planted hover rule goes
        // unread under it, so each covered control is the sentence, never one skipped.
        yield* page.evaluate(
          `(() => { const layer = document.createElement('div'); layer.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; background: transparent'; document.body.append(layer); return true; })()`,
        );
        expect(
          (yield* heldDifferences(ref, page)).filter((d) =>
            d.endsWith("the page's cannot be held"),
          ),
        ).toEqual(CONTROLS.map((part) => `${part}: the page's cannot be held`));
      }).pipe(Effect.scoped),
    SLOW,
  );
});

/** The kit's states a button is drawn in (`.sh-btn[data-state]`, `page-shell-style.ts`). */
const KIT_STATES = ['findings', 'warning', 'recording'] as const;

/**
 * One kit button per state at the top of a page's body, its real ground,
 * and `window.kitRead(state, held)`: whether the button is in the state
 * `held` names (`rest`, `hover`, `pressed`, `focus`), then its words' and its
 * edge's WCAG contrast against the background it draws, each colour composed
 * (alpha and all) onto the grounds under it, as `kitShort` lines short of
 * 4.5:1 for the words (1.4.3) or 3:1 for the edge (1.4.11).
 */
const KIT_BUTTONS = `(() => {
  const host = document.querySelector('.sh-body');
  for (const state of ${jsonOf(KIT_STATES)}) {
    const button = document.createElement('button');
    button.className = 'sh-btn';
    button.dataset.state = state;
    button.dataset.kit = state;
    button.textContent = state;
    host.prepend(button);
  }
  const rgba = (c) => { const n = c.match(/[\\d.]+/g).map(Number); return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; };
  const over = (top, under) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]));
  // The page's canvas is white under every ground; each element's own fill goes on it, outermost first.
  const drawn = (el) => { const fills = []; for (let e = el; e !== null; e = e.parentElement) fills.push(rgba(getComputedStyle(e).backgroundColor)); return fills.reverse().reduce((under, fill) => over(fill, under), [255, 255, 255]); };
  const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const held = { rest: (b) => !b.matches(':hover, :focus') && b.getAttribute('aria-pressed') !== 'true', hover: (b) => b.matches(':hover'), pressed: (b) => b.getAttribute('aria-pressed') === 'true', focus: (b) => b.matches(':focus-visible') };
  window.kitShort = [];
  window.kitRead = (state, how) => {
    const b = document.querySelector('[data-kit="' + state + '"]');
    if (!held[how](b)) return window.kitShort.push(state + ' is not ' + how);
    const ground = drawn(b);
    const s = getComputedStyle(b);
    const words = ratio(over(rgba(s.color), ground), ground);
    const edge = ratio(over(rgba(s.borderTopColor), ground), ground);
    if (words < 4.5) window.kitShort.push(state + ' words ' + how + ' ' + words.toFixed(2));
    if (edge < 3) window.kitShort.push(state + ' edge ' + how + ' ' + edge.toFixed(2));
  };
  return true;
})()`;

describe("the kit's state colours", () => {
  it.live(
    "a button in a state's colour reads at AA (4.5:1) at rest, hovered, pressed and focused, over the background it draws; its edge at 3:1",
    () =>
      Effect.gen(function* () {
        const page = yield* reference(LAPTOP.viewport);
        yield* page.evaluate(KIT_BUTTONS);
        const at = (state: string) => `document.querySelector('[data-kit="${state}"]')`;
        for (const state of KIT_STATES) {
          // Each state driven as the viewer would, and read while it holds.
          yield* page.mouse.move(1, 1);
          yield* page.evaluate(`window.kitRead('${state}', 'rest'); true`);
          const box = yield* page.box(`[data-kit="${state}"]`);
          yield* page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          yield* page.evaluate(`window.kitRead('${state}', 'hover'); true`);
          yield* page.mouse.move(1, 1);
          yield* page.evaluate(
            `${at(state)}.setAttribute('aria-pressed', 'true'); window.kitRead('${state}', 'pressed'); ${at(state)}.removeAttribute('aria-pressed'); true`,
          );
          yield* page.evaluate(
            `${at(state)}.focus({ focusVisible: true }); window.kitRead('${state}', 'focus'); ${at(state)}.blur(); true`,
          );
        }
        // Each ratio short of its bar, and each state the button was not in when read.
        yield* evaluates(page, 'window.kitShort', []);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
