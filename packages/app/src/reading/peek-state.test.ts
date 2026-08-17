/** §5's navigation model, and the §10 Milestone 6 acceptance that the arrival
 *  posture is read off the page model rather than hardcoded.
 *
 *  These are the decisions a mounted component would only demonstrate
 *  incidentally, and which the compiled-component e2e (`apps/desktop/e2e/`)
 *  cannot state as a property — "a second tap on the same phrase navigates" is
 *  a statement about a transition function, and asserting it through a browser
 *  proves it for one path through one page.
 */

import {
  WikiCommentarySection,
  WikiCrossReferencesSection,
  WikiEgwStatementsSection,
  WikiKeyVersesSection,
  WikiPioneerWitnessesSection,
  WikiRelatedTopicsSection,
  type WikiSectionKind,
  type WikiSectionLineup,
} from '@bible/core/wiki';
import { DANIEL_8_11, PHRASE_FIXTURE_DICTIONARY } from '@bible/core/wiki/testing';
import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { createMemo, createRoot, createSignal, flush } from 'solid-js';

import {
  buildChapterPlan,
  phraseSource,
  versePlan,
  type ChapterPlan,
  type ChapterVerse,
} from './match-plan.js';

/** The reader's stylesheet, as text — §4.7 is a rule about the shipped CSS, and
 *  importing it is how this file names the artifact the rule is about. */
import stylesheet from '../styles.css' with { type: 'text' };

import {
  dismissesPeek,
  dismissOnPlanChange,
  dismissPeek,
  emptyTrail,
  enterTopic,
  jumpTo,
  noPeek,
  occurrenceId,
  openOnArrival,
  phraseTap,
  readSlug,
  sectionOpen,
  toggleSection,
  topicPath,
  trailForRoute,
  type DismissTarget,
  type Peeked,
  type PeekState,
} from './peek-state.js';

const peeked = (input: {
  readonly section?: string;
  readonly container: string;
  readonly index: number;
  readonly slug: string;
}): Peeked => ({
  occurrence: occurrenceId({
    section: input.section ?? 'Dan/8',
    container: input.container,
    index: input.index,
  }),
  slug: input.slug,
  phrase: input.slug,
});

// ---------------------------------------------------------------------------
// §5 — peek, then navigate
// ---------------------------------------------------------------------------

describe('phraseTap', () => {
  const sanctuary = peeked({ container: '14', index: 0, slug: 'sanctuary' });

  test('first tap peeks', () => {
    const outcome = phraseTap(noPeek, sanctuary);
    expect(outcome._tag).toBe('peek');
    if (outcome._tag !== 'peek') return;
    expect(outcome.state).toEqual(Option.some(sanctuary));
  });

  test('second tap on the same occurrence navigates', () => {
    // The state after a first tap, taken from the transition itself rather than
    // written down — so the two taps really are consecutive applications of the
    // rule and not a hand-built state that happens to match it.
    const first = phraseTap(noPeek, sanctuary);
    const peekedState = Option.match(
      Option.liftPredicate(first, (tap) => tap._tag === 'peek'),
      {
        onNone: () => noPeek,
        onSome: (tap) => tap.state,
      },
    );
    expect(peekedState).toEqual(Option.some(sanctuary));
    expect(phraseTap(peekedState, sanctuary)).toEqual({ _tag: 'navigate', slug: 'sanctuary' });
  });

  test('a tap on a *different* occurrence of the same topic peeks, it does not navigate', () => {
    // The whole reason the state is keyed on the occurrence rather than on the
    // slug. A chapter can carry two links to one topic, and tapping the second
    // is a first tap on a phrase the reader has not asked about — jumping
    // straight to the page there would make the second link unpeekable.
    const elsewhere = peeked({ container: '21', index: 0, slug: 'sanctuary' });
    const outcome = phraseTap(Option.some(sanctuary), elsewhere);
    expect(outcome._tag).toBe('peek');
    if (outcome._tag !== 'peek') return;
    expect(outcome.state).toEqual(Option.some(elsewhere));
  });

  test('a tap on a different topic moves the peek', () => {
    const other = peeked({ container: '14', index: 1, slug: 'the-daily' });
    const outcome = phraseTap(Option.some(sanctuary), other);
    expect(outcome).toEqual({ _tag: 'peek', state: Option.some(other) });
  });

  test('dismissal closes the card', () => {
    expect(dismissPeek()).toEqual(noPeek);
  });
});

describe('dismissesPeek', () => {
  /** The minimal `closest` a real `Element` satisfies: it answers for the set of
   *  selectors the node's own ancestry matches.
   *
   *  The hit and the miss are both modelled as an `Option` and handed over with
   *  `Option.getOrUndefined`, so the nullish value the DOM contract requires is
   *  produced by Effect at the boundary rather than written as a literal — the
   *  same shape `dismissesPeek` reads back through `Option.fromNullishOr`. */
  const target = (matches: readonly string[]): DismissTarget => ({
    closest: (selector) => {
      const wanted = selector.split(',').map((part) => part.trim());
      const hit = Option.liftPredicate(matches, (ancestry) =>
        ancestry.some((match) => wanted.includes(match)),
      );
      return Option.getOrUndefined(Option.as(hit, { tag: 'element' }));
    },
  });

  test('a tap on ordinary reading surface dismisses', () => {
    expect(dismissesPeek(target([]))).toBe(true);
  });

  test('a tap inside a phrase span does not — that tap is the span’s own', () => {
    expect(dismissesPeek(target(['.bible-phrase']))).toBe(false);
  });

  test('a tap inside the card does not', () => {
    // The regression this rule was added for. The card exclusion used to be
    // positional — the handler sat on the verse list and the card rendered
    // outside it — so widening the handler to the whole reading surface (so that
    // a tap on the chapter heading would dismiss, which §5 requires and the
    // narrow scope silently failed to do) dismissed the card out from under the
    // reader's own click on it, including on the "Open" button.
    expect(dismissesPeek(target(['.bible-peek']))).toBe(false);
  });
});

describe('occurrenceId', () => {
  test('separates two links in one container and one link in two containers', () => {
    const first = occurrenceId({ section: 'Dan/8', container: '14', index: 0 });
    expect(first).not.toBe(occurrenceId({ section: 'Dan/8', container: '14', index: 1 }));
    expect(first).not.toBe(occurrenceId({ section: 'Dan/8', container: '21', index: 0 }));
  });

  test('the same verse in two chapters is two occurrences', () => {
    // The chapter turn case. The reader component stays mounted across
    // `/bible/1/1` -> `/bible/1/2`, so an id without the section in it would
    // name verse 1's first phrase in *both* chapters and leave the peek card
    // open over a phrase that is no longer on screen.
    expect(occurrenceId({ section: '1/1', container: '1', index: 0 })).not.toBe(
      occurrenceId({ section: '1/2', container: '1', index: 0 }),
    );
  });
});

// ---------------------------------------------------------------------------
// §5 — a card cannot outlive the plan its occurrence id names a position in
// ---------------------------------------------------------------------------

describe('dismissOnPlanChange', () => {
  /** A chapter plan over the fixture verses, built the way the reader builds it.
   *  Real plans rather than sentinel objects: the defect is that an id minted
   *  by one plan can *resolve* inside another, and only real plans can show it. */
  const chapterPlan = (verses: readonly ChapterVerse[]) =>
    buildChapterPlan({
      key: '27/8',
      source: phraseSource(PHRASE_FIXTURE_DICTIONARY),
      verses,
    });

  const BARE = [{ verse: 11, text: DANIEL_8_11, marginNotes: [] }];
  /** The same chapter after its margin anchors arrived. `bible-reader.tsx` reads
   *  them on a *second* query beside the chapter, so this is a real in-place
   *  refresh: same route, same section key, new plan. */
  const WITH_ANCHORS = [
    { verse: 11, text: DANIEL_8_11, marginNotes: [{ noteIndex: 0, phrase: 'prince' }] },
  ];

  /** Drives the rule the three reading surfaces share, headless: a plan behind a
   *  signal, a peek signal, and Solid's own scheduler. */
  const withPlan = (
    initial: ChapterPlan,
    run: (input: {
      readonly swap: (next: ChapterPlan) => void;
      readonly peek: () => PeekState;
      readonly open: (value: Peeked) => void;
    }) => void,
  ): void => {
    createRoot((dispose) => {
      const [source, setSource] = createSignal(initial);
      const plan = createMemo(() => source());
      const [peek, setPeek] = createSignal(noPeek);
      dismissOnPlanChange(plan, setPeek);
      flush();
      run({
        swap: (next) => {
          setSource(() => next);
          flush();
        },
        peek,
        open: (value) => {
          setPeek(Option.some(value));
          flush();
        },
      });
      dispose();
    });
  };

  test('an in-place refresh under the same route closes the card', () => {
    // The defect. The chapter address does not change when the margin anchors
    // land, so the old rule — keyed on `plan().key` — saw nothing happen. But
    // the spans were renumbered underneath the open id, which is position-based:
    // the card kept showing the old topic while the *new* phrase at that
    // position rendered expanded.
    withPlan(chapterPlan(BARE), ({ swap, peek, open }) => {
      const before = versePlan(chapterPlan(BARE), '11');
      const id = before.occurrences[0] ?? '';
      expect(id).not.toBe('');
      open({ occurrence: id, slug: 'the-daily', phrase: 'the daily' });
      expect(Option.isSome(peek())).toBe(true);

      const after = chapterPlan(WITH_ANCHORS);
      // The premise: the two plans carry the same section key, so a rule keyed
      // on the key cannot tell them apart…
      expect(after.key).toBe(chapterPlan(BARE).key);
      // …and the open id is still a live address in the new plan, so the marking
      // would follow it rather than going cold on its own.
      expect(versePlan(after, '11').occurrences).toContain(id);

      swap(after);

      expect(peek()).toEqual(noPeek);
    });
  });

  test('the first plan does not close anything', () => {
    // There is no previous plan at mount, so nothing was replaced. A rule that
    // fired here would dismiss a card the reader has not opened yet — harmless
    // today and wrong the moment a surface opens one during setup.
    withPlan(chapterPlan(BARE), ({ peek, open }) => {
      open({ occurrence: 'x', slug: 's', phrase: 'p' });
      expect(Option.isSome(peek())).toBe(true);
    });
  });

  test('a plan that is re-read but not replaced leaves the card alone', () => {
    // Solid re-runs a memo's readers on every notification; only a *different*
    // plan value is a replacement. Dismissing on a re-read would close the card
    // under the reader on any unrelated invalidation.
    const stable = chapterPlan(BARE);
    withPlan(stable, ({ swap, peek, open }) => {
      open({ occurrence: 'x', slug: 's', phrase: 'p' });
      swap(stable);
      expect(Option.isSome(peek())).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// §5 — the breadcrumb trail
// ---------------------------------------------------------------------------

describe('the trail', () => {
  const sanctuary = { slug: 'sanctuary', title: 'The Sanctuary' };
  const judgment = { slug: 'investigative-judgment', title: 'The Investigative Judgment' };
  const daily = { slug: 'the-daily', title: 'The Daily' };

  test('records each hop in order', () => {
    expect(enterTopic(enterTopic(emptyTrail, sanctuary), judgment)).toEqual([sanctuary, judgment]);
  });

  test('re-entering the page you are on records nothing', () => {
    const trail = enterTopic(emptyTrail, sanctuary);
    expect(enterTopic(trail, sanctuary)).toEqual(trail);
  });

  test('looping back truncates rather than appending a second copy', () => {
    // Rabbit holes loop. A trail that recorded sanctuary → judgment → sanctuary
    // would offer two crumbs for one page and let the reader "jump" to the page
    // they are standing on.
    const looped = enterTopic(enterTopic(enterTopic(emptyTrail, sanctuary), judgment), sanctuary);
    expect(looped).toEqual([sanctuary]);
  });

  test('refreshes a crumb title on the way past', () => {
    // A hop first recorded from a peek card may carry a summary title; arriving
    // at the composed page is when the real one is known.
    const stale = enterTopic(emptyTrail, { slug: 'sanctuary', title: 'sanctuary' });
    expect(enterTopic(enterTopic(stale, judgment), sanctuary)).toEqual([sanctuary]);
  });

  test('tap-to-jump truncates to the tapped crumb', () => {
    const trail = enterTopic(enterTopic(enterTopic(emptyTrail, sanctuary), judgment), daily);
    expect(jumpTo(trail, 0)).toEqual([sanctuary]);
    expect(jumpTo(trail, 1)).toEqual([sanctuary, judgment]);
    expect(jumpTo(trail, 2)).toEqual(trail);
  });

  test('an out-of-range jump leaves the trail alone', () => {
    const trail = enterTopic(emptyTrail, sanctuary);
    expect(jumpTo(trail, 5)).toEqual(trail);
    expect(jumpTo(trail, -1)).toEqual(trail);
  });

  test('is kept on the wiki surface and cleared off it', () => {
    const trail = enterTopic(enterTopic(emptyTrail, sanctuary), judgment);
    expect(trailForRoute(trail, '/wiki/the-daily')).toEqual(trail);
    // Leaving for the Bible reader — including by following a key verse — ends
    // the rabbit hole.
    expect(trailForRoute(trail, '/bible/27/8/14')).toEqual(emptyTrail);
    expect(trailForRoute(trail, '/topics/sanctuary')).toEqual(emptyTrail);
  });
});

// ---------------------------------------------------------------------------
// §5 / §6.1 — the arrival posture comes from the model
// ---------------------------------------------------------------------------

/** A lineup, with each section's `defaultOpen` exactly as the composer sets it.
 *
 *  Built through the model's own constructors rather than as a literal, so the
 *  literal-typed `defaultOpen` fields are the ones under test — a lineup that
 *  opened the wrong section would not compile, which is the property the model
 *  was designed to have. */
const lineup = (): WikiSectionLineup => [
  WikiKeyVersesSection.make({ items: [], total: 0, defaultOpen: true }),
  WikiEgwStatementsSection.make({
    items: [],
    total: 0,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCommentarySection.make({ items: [], total: 0, defaultOpen: false }),
  WikiPioneerWitnessesSection.make({
    items: [],
    total: 0,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCrossReferencesSection.make({ items: [], total: 0, defaultOpen: false }),
  WikiRelatedTopicsSection.make({ items: [], total: 0, defaultOpen: false }),
];

describe('arrival posture (§10 M6: read off the model, not hardcoded)', () => {
  test('derives the open set from each section’s own defaultOpen flag', () => {
    expect([...openOnArrival(lineup())]).toEqual(['key-verses']);
  });

  // The anti-hardcoding property — "the UI opens what the *model* says, not
  // `key-verses`" — used to be asserted here by rebuilding the lineup with
  // commentary's `defaultOpen` flipped, which needed an `as unknown as` because
  // `WikiCommentarySection.defaultOpen` is the literal `false` by design (§5's
  // arrival rule is part of the lineup's shape). A page that opens commentary is
  // one the model cannot express, so the cast was asserting over a value that
  // can never cross the wire. `wiki-page-identity.test.ts` now makes the same
  // claim over an input the model *can* produce — the reader's own toggle — by
  // testing `sectionOpen` as `arrival XOR toggled`, where nothing names
  // `key-verses` either.

  test('a toggle flips one section without disturbing the rest', () => {
    const arrival = openOnArrival(lineup());
    const empty: ReadonlySet<WikiSectionKind> = new Set<WikiSectionKind>();

    // Arrival: key verses open, commentary closed.
    expect(sectionOpen({ kind: 'key-verses', arrival, toggled: empty })).toBe(true);
    expect(sectionOpen({ kind: 'commentary', arrival, toggled: empty })).toBe(false);

    // Toggles are a delta from arrival, not the open set — so closing the
    // default-open section and opening a default-closed one are the same
    // operation, and neither needs a copy of the arrival rule.
    const toggled = toggleSection(toggleSection(empty, 'key-verses'), 'commentary');
    expect(sectionOpen({ kind: 'key-verses', arrival, toggled })).toBe(false);
    expect(sectionOpen({ kind: 'commentary', arrival, toggled })).toBe(true);
    expect(sectionOpen({ kind: 'cross-references', arrival, toggled })).toBe(false);

    // And a toggle is its own inverse.
    expect(
      sectionOpen({ kind: 'commentary', arrival, toggled: toggleSection(toggled, 'commentary') }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

describe('slugs and paths', () => {
  test('builds the one wiki route', () => {
    expect(topicPath('2300-days')).toBe('/wiki/2300-days');
  });

  test('brands a real slug and refuses an empty one', () => {
    expect(Option.isSome(readSlug('sanctuary'))).toBe(true);
    // A route is user input: an empty segment is a not-found page, not a throw
    // inside a render.
    expect(Option.isNone(readSlug(''))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4.7 — the restraint, read out of the stylesheet
//
// "Hot phrases render as a **muted dotted underline taking the surrounding text
// color**. No blue. No background fill." That is a rule about the shipped CSS,
// so it is asserted against the shipped CSS — the same pattern the study pane's
// breakpoint test uses, and for the same reason: a unit test over a constant
// would pass with the stylesheet saying anything at all.
//
// The expanded state used to carry `background: var(--bible-accent-soft)`, on
// the reasoning that a wash is not a fill. §4.7 states the rule without an
// exception for the expanded state, and to a reader a washed word is a
// highlighted word — which is the "soup" the restraint exists against. The
// expanded state now reads harder in the *same* mark: the underline goes solid
// and thickens.
// ---------------------------------------------------------------------------

/** One CSS rule's declaration block, by selector. Returns the text between the
 *  selector's `{` and its matching `}` — the phrase rules have no nested blocks,
 *  so a scan to the first `}` is exact rather than approximate. */
const ruleBody = (selector: string): string => {
  const at = stylesheet.indexOf(`${selector} {`);
  expect(at).toBeGreaterThan(-1);
  const open = stylesheet.indexOf('{', at);
  return stylesheet.slice(open + 1, stylesheet.indexOf('}', open));
};

describe('§4.7 — a hot phrase has no background fill, in any state', () => {
  test('the resting state paints nothing behind the words', () => {
    const body = ruleBody('.bible-phrase');
    // `background: none` is the button reset, and it is the opposite of a fill.
    expect(body).toContain('background: none;');
    expect(body).not.toContain('--bible-accent-soft');
    // The mark §4.7 does name.
    expect(body).toContain('text-decoration: underline dotted');
  });

  test('the expanded state marks itself with the underline, not a fill', () => {
    const body = ruleBody(".bible-phrase[aria-expanded='true']");
    expect(body).not.toContain('background');
    expect(body).not.toContain('--bible-accent-soft');
    expect(body).toContain('text-decoration: underline solid currentcolor;');
  });

  test('no phrase state introduces a fill anywhere', () => {
    // Every rule whose selector list mentions `.bible-phrase`, so a fourth state
    // added later is covered without this file being edited. Read as
    // selector-list-plus-body rather than through `ruleBody`, because a grouped
    // rule (`.bible-phrase:hover,\n.bible-phrase:focus-visible {`) has one body
    // under two selectors.
    const rules = [...stylesheet.matchAll(/([^{}]*\.bible-phrase[^{}]*)\{([^}]*)\}/g)];
    // Three today: the reset, the hover/focus pair, and the expanded state. A
    // count keeps the loop from passing vacuously if the regex stops matching.
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const [, , body] of rules) {
      // Any `background` declaration that is not the button reset paints
      // something behind the words, and §4.7 allows none.
      const painted = [...(body ?? '').matchAll(/background[^:]*:\s*([^;]+);/g)].map((match) =>
        (match[1] ?? '').trim(),
      );
      expect(painted.filter((value) => value !== 'none' && value !== 'transparent')).toEqual([]);
    }
  });

  test('and no blue: the colour is the surrounding text’s', () => {
    expect(ruleBody('.bible-phrase')).toContain('color: inherit;');
  });
});
