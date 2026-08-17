/** §8.5's gesture rule, asserted before the layer it protects exists.
 *
 *  The rule — verse tap opens the study pane, wiki phrase tap opens the peek
 *  card, and the verse surface owns the tap *outside* a phrase span — is a hard
 *  rule the spec states, not a preference. Milestone 6 adds the phrase spans;
 *  this file pins the precedence now, so the milestone that adds them finds the
 *  contract already tested rather than having to introduce it alongside the
 *  feature it constrains.
 *
 *  There is no DOM here: this package's tests run under plain Bun, and adding a
 *  DOM library would touch `bun.lock`. It does not need one. `claimedGesture`
 *  reads four members of its target, `GestureTarget` names them, and `element`
 *  below builds that shape — no cast, and a real `Element` is assignable to the
 *  same parameter, which is what keeps the test honest about the reader's call.
 */

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { CLAIMS_GESTURE_ATTRIBUTE, claimedGesture, type GestureTarget } from './gesture.js';
import { dismissesPeek, noPeek, phraseTap } from './peek-state.js';

interface ElementSpec {
  readonly tag: string;
  readonly role?: string;
  readonly claimsGesture?: true;
  readonly children?: readonly ElementSpec[];
}

/** Builds a `GestureTarget` tree and returns every node by tag path, so a test
 *  can name the node it taps.
 *
 *  `matches` handles only the one selector the rule uses. A general selector
 *  engine here would be a reimplementation of the DOM with its own bugs; the
 *  rule's dependency is `[role="listitem"]` and nothing else. */
const build = (spec: ElementSpec) => {
  const all: GestureTarget[] = [];
  const make = (node: ElementSpec, parent: Option.Option<GestureTarget>): GestureTarget => {
    const element: GestureTarget = {
      tagName: node.tag.toUpperCase(),
      parentElement: Option.getOrNull(parent),
      matches: (selector) => selector === '[role="listitem"]' && node.role === 'listitem',
      hasAttribute: (name) => name === CLAIMS_GESTURE_ATTRIBUTE && node.claimsGesture === true,
    };
    all.push(element);
    for (const child of node.children ?? []) make(child, Option.some(element));
    return element;
  };
  return { root: make(spec, Option.none()), all };
};

/** The verse as the reader renders it: the `role="listitem"` surface, a verse
 *  number anchor, and the verse text — with whatever Milestone 6 adds appended
 *  inside the paragraph. */
const verse = (extra: readonly ElementSpec[] = []) =>
  build({
    tag: 'div',
    role: 'listitem',
    children: [{ tag: 'p', children: [{ tag: 'a' }, ...extra] }],
  });

/** The node a test taps, found by tag.
 *
 *  Returns an `Option` and lets the caller unwrap with `Option.getOrThrow`: a
 *  missing node is a broken fixture rather than a failed assertion, and
 *  `getOrThrow` says so at the exact call site without this helper needing a
 *  throw of its own. */
const byTag = (tree: { readonly all: readonly GestureTarget[] }, tag: string): GestureTarget =>
  Option.getOrThrow(
    Option.fromNullishOr(tree.all.find((element) => element.tagName === tag.toUpperCase())),
  );

describe('claimedGesture', () => {
  test('the verse surface owns a tap on the verse text', () => {
    const tree = verse();
    // Nothing inner claimed it, so the reader navigates and the pane opens.
    expect(Option.isNone(claimedGesture(byTag(tree, 'p')))).toBe(true);
  });

  test('the verse surface owns a tap on itself', () => {
    expect(Option.isNone(claimedGesture(verse().root))).toBe(true);
  });

  test('the verse-number anchor claims its own tap', () => {
    // The browser is already activating the link; running the verse handler as
    // well would push the same route twice.
    const claimed = claimedGesture(byTag(verse(), 'a'));
    expect(Option.map(claimed, (element) => element.tagName)).toEqual(Option.some('A'));
  });

  test('a button claims its own tap', () => {
    const tree = verse([{ tag: 'button' }]);
    const claimed = claimedGesture(byTag(tree, 'button'));
    expect(Option.map(claimed, (element) => element.tagName)).toEqual(Option.some('BUTTON'));
  });

  test('a Milestone 6 phrase span claims the tap, and the verse surface does not', () => {
    // The shape §4.7 will render: an inline span inside the verse text, marked
    // as claiming its own gesture. Nothing in `bible-reader.tsx` changes for
    // this to take precedence — that is the point of the seam.
    const tree = verse([{ tag: 'span', claimsGesture: true }]);
    const phrase = byTag(tree, 'span');
    expect(claimedGesture(phrase)).toEqual(Option.some(phrase));
  });

  test('a tap on a phrase span’s child still belongs to the phrase', () => {
    // A phrase span wraps text and may wrap an icon; a tap on a child is a tap
    // on the phrase, which is why the rule is a walk rather than a check on the
    // target alone.
    const tree = verse([{ tag: 'span', claimsGesture: true, children: [{ tag: 'em' }] }]);
    expect(claimedGesture(byTag(tree, 'em'))).toEqual(Option.some(byTag(tree, 'span')));
  });

  // -------------------------------------------------------------------------
  // §8.5 both directions, on a **web-reachable** layer
  //
  // `apps/desktop/e2e/wiki-phrase.spec.ts` asserts both directions against the
  // compiled components in a real browser engine. The web host has no
  // equivalent: `apps/web/e2e` currently boots into a pre-existing OPFS startup
  // failure (found in Milestone 5), so a web spec would assert nothing. The two
  // directions are asserted here instead, over the *same two functions* both
  // hosts call — `claimedGesture` decides whether the verse handler runs, and
  // `phraseTap` decides what a phrase tap does — so a regression in either
  // direction fails on web's own code path even though the browser leg is
  // unavailable. This is a narrower claim than the desktop e2e's and is stated
  // as such: it does not prove the compiled markup carries the attribute.
  // -------------------------------------------------------------------------

  test('§8.5 direction one: a tap inside a phrase span never opens the study pane', () => {
    const tree = verse([{ tag: 'button', claimsGesture: true }]);
    const phrase = byTag(tree, 'button');

    // The reader's own guard, verbatim: `openStudy` returns early when the tap
    // was claimed, so the pane does not open and the route does not move.
    expect(Option.isSome(claimedGesture(phrase))).toBe(true);

    // And the phrase's own handler peeks rather than navigating, because this
    // is the first tap on this occurrence.
    const tapped = { occurrence: 'Dan/8|11#0', slug: 'sanctuary', phrase: 'sanctuary' };
    expect(phraseTap(noPeek, tapped)).toEqual({ _tag: 'peek', state: Option.some(tapped) });
  });

  test('§8.5 direction two: a tap outside a phrase span never opens a peek card', () => {
    const tree = verse([{ tag: 'button', claimsGesture: true }]);

    // The verse paragraph, clear of the phrase: nothing claimed it, so the
    // verse handler runs and the pane opens.
    expect(Option.isNone(claimedGesture(byTag(tree, 'p')))).toBe(true);

    // The same tap reaches the surface's dismiss predicate, which fires because
    // the target is neither a phrase span nor the card. A card that was open is
    // therefore closed, and no card is opened — the phrase handler was never
    // called at all.
    //
    // The DOM's `closest` answers the element or `null`, and `dismissesPeek`
    // reads that through `Option.fromNullishOr`. A stub therefore has to produce
    // the nullish answer the real API produces — but it produces it the way
    // production code is allowed to, by unwrapping an `Option` at the boundary
    // rather than writing the literal.
    const found = (present: Option.Option<object>) => Option.getOrNull(present);
    expect(dismissesPeek({ closest: () => found(Option.none()) })).toBe(true);

    // The two exclusions the predicate does make, so this is not a function that
    // says yes to everything.
    const ancestor = (kind: string) => ({
      closest: (selector: string) =>
        found(
          Option.map(
            Option.liftPredicate(selector, (value) => value.includes(kind)),
            () => ({}),
          ),
        ),
    });
    expect(dismissesPeek(ancestor('bible-phrase'))).toBe(false);
    expect(dismissesPeek(ancestor('bible-peek'))).toBe(false);
  });

  test('the walk stops at the verse surface', () => {
    // An ancestor outside the verse must not suppress a verse tap: the whole
    // scripture column sits inside a scroll viewport, and a claiming element
    // above the verse would silently disable the pane for every verse.
    const tree = build({
      tag: 'a',
      children: [{ tag: 'div', role: 'listitem', children: [{ tag: 'p' }] }],
    });
    expect(Option.isNone(claimedGesture(byTag(tree, 'p')))).toBe(true);
  });
});
