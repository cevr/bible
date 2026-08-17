/** The §5 navigation model, as plain functions (Milestone 6).
 *
 *  Three decisions the wiki surface has to make, none of which are about
 *  markup — and which therefore live here rather than inside the components,
 *  for the reason `gesture.ts` and `study-pane-state.ts` do: this package's
 *  tests run under plain Bun with no DOM, and Solid 2 compiles JSX with a Babel
 *  transform rather than shipping a runtime factory, so a mounted component is
 *  not reachable from a unit test. What the *markup* does is asserted against
 *  the compiled components in `apps/desktop/e2e/wiki-phrase.spec.ts`.
 *
 *  1. **Peek, then navigate.** §5: "first tap peeks, second tap on the same
 *     phrase navigates, tapping elsewhere dismisses." That is a three-case
 *     transition on one piece of state, and getting it wrong in either
 *     direction is a real defect — a peek that navigates immediately makes the
 *     card unreachable, and a peek that never navigates makes the topic page
 *     unreachable.
 *  2. **The breadcrumb trail.** A history stack of hops with tap-to-jump that
 *     truncates, and which is cleared on leaving the wiki surface.
 *  3. **Which sections arrive open.** From the page model's own `defaultOpen`
 *     flag (§6.1), never from a hardcoded index.
 */

import { Option, Schema } from 'effect';
import { createEffect } from 'solid-js';

import { TopicSlug, type WikiSectionKind, type WikiSectionLineup } from '@bible/core/wiki';

/** A slug arriving from outside the model — a URL segment, or the `slug` a
 *  `phrase` `TextSegment` carries as a plain string because `bible-rendering`
 *  cannot import the wiki's branded schema without closing an import cycle.
 *
 *  `Option` rather than `topicSlug`'s `decodeSync`: a route is user input and an
 *  empty or malformed segment must render a not-found page, not throw inside a
 *  render. Every branded slug in this package is minted here. */
export const readSlug: (input: string) => Option.Option<TopicSlug> = Schema.decodeOption(TopicSlug);

// ---------------------------------------------------------------------------
// Peek, then navigate (§5)
// ---------------------------------------------------------------------------

/** Which phrase occurrence the peek card is about.
 *
 *  The slug alone is not enough: a chapter can carry two links to the same
 *  topic, and "second tap on the **same phrase**" means the same occurrence, not
 *  the same destination. Tapping a second `sanctuary` further down the chapter
 *  is a first tap on a new phrase — it should peek, not jump. So the identity is
 *  the occurrence's own address, which the renderer already has to mint for the
 *  DOM id.
 *
 *  A branded-free plain string, because it is an opaque key: nothing reads its
 *  parts, and giving it structure would invite someone to. */
export type PhraseOccurrenceId = string;

/** The occurrence key for one phrase span, from the three coordinates that make
 *  it unique on a surface: the §4.5 **section** it was matched in (the chapter
 *  address, the page address, a topic page's section kind), which item inside
 *  that section it is in (a verse number, a paragraph id), and which link it is
 *  within that item.
 *
 *  The section is part of the key and not context the caller keeps separately,
 *  because the peek signal outlives a section change: the router keeps the
 *  reader mounted across `/bible/1/1` → `/bible/1/2`, and an id of
 *  `"1#0"` would name a phrase in both chapters. With the section in the key,
 *  turning the page invalidates the open peek by construction — no id the new
 *  plan mints can equal the one that is open. */
export const occurrenceId = (input: {
  readonly section: string;
  readonly container: string;
  readonly index: number;
}): PhraseOccurrenceId => `${input.section}|${input.container}#${String(input.index)}`;

/** What a peek card is showing.
 *
 *  `None` is closed. The peeked value carries the occurrence *and* the topic,
 *  because the card needs the topic to fetch its title and thesis, and the
 *  occurrence to decide what a second tap means and where to anchor.
 *
 *  `slug` is the unbranded string the `phrase` segment carries, plus the surface
 *  text of the span so the card can name what the reader tapped. Branding
 *  happens once, where a slug is about to become an RPC payload — see
 *  {@link readSlug}. */
export interface Peeked {
  readonly occurrence: PhraseOccurrenceId;
  readonly slug: string;
  readonly phrase: string;
}

export type PeekState = Option.Option<Peeked>;

export const noPeek: PeekState = Option.none();

/** What a tap on a phrase does, given what is already peeked.
 *
 *  Two outcomes and no third: either the card opens on this phrase, or the
 *  reader goes to the topic. `dismiss` is not here because dismissal is not a
 *  phrase tap — it is a tap *elsewhere*, which {@link dismissPeek} handles. */
export type PhraseTap =
  | { readonly _tag: 'peek'; readonly state: PeekState }
  | { readonly _tag: 'navigate'; readonly slug: string };

/** §5's double-tap rule.
 *
 *  A second tap on the **same occurrence** navigates. A tap on any other phrase
 *  — including another link to the same topic — moves the peek there, because
 *  from the reader's side that is a first tap on a phrase they have not asked
 *  about yet. Keying on the occurrence rather than the slug is the whole
 *  content of that distinction. */
export const phraseTap = (current: PeekState, tapped: Peeked): PhraseTap => {
  if (Option.isSome(current) && current.value.occurrence === tapped.occurrence) {
    return { _tag: 'navigate', slug: tapped.slug };
  }
  return { _tag: 'peek', state: Option.some(tapped) };
};

/** A tap that landed outside the card and outside any phrase. */
export const dismissPeek = (): PeekState => noPeek;

/** Closes the card whenever the plan the reader's spans came from is
 *  **replaced**.
 *
 *  Occurrence ids are position-based (`occurrenceId` above), so they are only
 *  stable for as long as the plan that minted them is. A route change is not the
 *  only thing that replaces a plan: installing a book invalidates
 *  `WRITINGS_LIBRARY_KEY` and recomposes the topic page under the same slug, and
 *  the bible reader's margin anchors arrive on a second read and rebuild the
 *  chapter plan under the same chapter address. Both leave the section key
 *  identical while renumbering the spans underneath it, so an id that was open
 *  over "sanctuary" can land on whatever phrase now occupies that address — an
 *  expanded highlight on one phrase and a card explaining another.
 *
 *  So the rule keys on the **plan value's identity**, not on its key: any
 *  replacement of the plan object while a card is open closes the card. Cheap,
 *  and never wrong in the direction that matters — the refinement of keeping the
 *  peek when its occurrence demonstrably survived would need the plan to be
 *  re-searched for the same phrase at the same span, and buys the reader a card
 *  they can reopen with one tap. The first run is not a replacement: Solid hands
 *  the effect no previous value there, and nothing can be open over a plan that
 *  has not rendered.
 *
 *  One helper rather than the same effect written out in `bible-reader.tsx`,
 *  `writings-reader.tsx` and `wiki-topic-page.tsx`. The three surfaces had three
 *  copies of it keyed three different ways — a chapter address, a page address,
 *  a slug — and each copy independently missed the in-place refresh, which is
 *  what a rule stated once cannot do. It also puts the rule somewhere this
 *  package's DOM-less suites can drive it: Solid's reactivity runs headless, so
 *  `peek-state.test.ts` swaps a plan and watches the card close, which a mounted
 *  component would not let it do. */
export const dismissOnPlanChange = <A>(plan: () => A, dismiss: (next: PeekState) => void): void => {
  createEffect(plan, (current, previous) => {
    // `previous` is Solid's own "no prior run" marker on the first pass. Read
    // through `Option` rather than compared to a literal, and never widened into
    // this module's own types — the optionality belongs to the scheduler.
    if (Option.isNone(Option.fromNullishOr(previous))) return;
    if (previous === current) return;
    dismiss(dismissPeek());
  });
};

/** The class every rendered phrase span carries, so "was this tap on a phrase?"
 *  is one selector rather than one per surface. */
export const PHRASE_CLASS = 'bible-phrase';

/** The class the peek card's own root carries, in both presentations. */
export const PEEK_CLASS = 'bible-peek';

/** Whether a tap on a reading surface should dismiss the card.
 *
 *  §5's "tapping elsewhere dismisses" is a rule about *where* the tap landed,
 *  and there are exactly two places it must not fire:
 *
 *  - **Inside a phrase span.** That tap is the span's own, and it either
 *    re-peeks or navigates.
 *  - **Inside the card.** The reader is reaching for the thing they opened; the
 *    "Open" button in particular would be dismissed out from under the click.
 *
 *  Both are stated as selectors rather than left to the surface's DOM shape. The
 *  card exclusion used to be positional — the handler sat on the verse list and
 *  the card rendered outside it — which held only for as long as nobody moved
 *  either one, and stopped being true the moment the handler was widened to the
 *  whole reading surface so that a tap on the chapter heading would dismiss.
 *
 *  The check walks ancestors rather than testing the target, because both a span
 *  and the card wrap other elements.
 *
 *  Takes the minimal DOM shape rather than `Element`, exactly as `gesture.ts`
 *  does and for the same reason: this package's tests have no DOM, and a real
 *  `Element` is assignable to the parameter. */
export interface DismissTarget {
  readonly closest: (selector: string) => unknown;
}

export const dismissesPeek = (target: DismissTarget): boolean =>
  Option.isNone(Option.fromNullishOr(target.closest(`.${PHRASE_CLASS}, .${PEEK_CLASS}`)));

// ---------------------------------------------------------------------------
// The breadcrumb trail (§5)
// ---------------------------------------------------------------------------

/** One hop in the trail. The title is carried rather than looked up: a crumb has
 *  to render before the page it points at has loaded, and a trail that showed
 *  slugs until each hop's fetch settled would flicker on every jump. */
export interface Crumb {
  readonly slug: string;
  readonly title: string;
}

/** The hops a reader has taken through the wiki, oldest first. The last element
 *  is where they are. */
export type Trail = readonly Crumb[];

export const emptyTrail: Trail = [];

/** Arriving at a topic.
 *
 *  Three cases, and the middle one is what makes the trail a *trail* rather than
 *  a log:
 *
 *  - arriving where you already are appends nothing — a re-render, a refresh, or
 *    a reload of the same page must not grow the trail;
 *  - arriving at a page **already in the trail** truncates back to it rather
 *    than appending a second copy. Rabbit holes loop, and a trail that recorded
 *    sanctuary → judgment → sanctuary would offer two crumbs for one page and
 *    let the reader "jump" to the one they are standing on;
 *  - anything else is a new hop.
 *
 *  The title of an existing crumb is refreshed on the way past, so a hop first
 *  recorded from a peek card's summary picks up the composed page's own title. */
export const enterTopic = (trail: Trail, crumb: Crumb): Trail => {
  const existing = trail.findIndex((hop) => hop.slug === crumb.slug);
  if (existing === -1) return [...trail, crumb];
  return [...trail.slice(0, existing), crumb];
};

/** Tap-to-jump: the trail truncates to the tapped crumb, which becomes the
 *  last element.
 *
 *  §5 says "truncating to the tapped crumb". An out-of-range index leaves the
 *  trail alone rather than emptying it — the only way to produce one is a stale
 *  render of a trail that has already been truncated, and dropping the whole
 *  trail for that would be a much larger surprise than doing nothing. */
export const jumpTo = (trail: Trail, index: number): Trail => {
  if (index < 0 || index >= trail.length) return trail;
  return trail.slice(0, index + 1);
};

/** Leaving the wiki surface clears the trail (§5).
 *
 *  A function of the route rather than a `clear()` a component remembers to
 *  call: the trail is cleared *because* the reader is somewhere else, and
 *  deriving it from the destination means no exit path can forget. Any path
 *  outside `/wiki` ends the trail, including a jump into the Bible reader from
 *  a key verse — the reader has left the rabbit hole, and coming back should
 *  start a new one. */
export const trailForRoute = (trail: Trail, path: string): Trail => {
  if (path === '/wiki' || path.startsWith('/wiki/')) return trail;
  return emptyTrail;
};

// ---------------------------------------------------------------------------
// Arrival posture (§5, §6.1)
// ---------------------------------------------------------------------------

/** Which sections arrive open, read **off the page model**.
 *
 *  §10's Milestone 6 makes this an acceptance criterion in its own right: "the
 *  page model exposes a default-open flag on section 1 rather than the UI
 *  hardcoding it". `WikiSectionLineup` types that flag as the literal `true` on
 *  key verses and the literal `false` everywhere else, so the model cannot
 *  express a page whose arrival posture disagrees with §5 — and this function is
 *  the UI's only reader of it. Nothing in the components names `key-verses` to
 *  decide what is open.
 *
 *  A set of kinds rather than of indices: §6.1 makes the kind the identity a
 *  client keys rendering on precisely so a page cannot shift a section's meaning
 *  by moving it. */
export const openOnArrival = (sections: WikiSectionLineup): ReadonlySet<WikiSectionKind> =>
  new Set(sections.filter((section) => section.defaultOpen).map((section) => section._tag));

/** Whether one section is open, given the arrival set and what the reader has
 *  toggled since.
 *
 *  Toggles are held as the set of kinds whose state is *flipped* from arrival,
 *  not as the set of open sections. Holding the open set instead would need an
 *  initial value copied from `openOnArrival` at mount — and a second copy of the
 *  arrival rule is exactly what the acceptance criterion forbids. This way the
 *  model's flag stays the only source of the posture, and a page swap resets the
 *  posture correctly by construction. */
export const sectionOpen = (input: {
  readonly kind: WikiSectionKind;
  readonly arrival: ReadonlySet<WikiSectionKind>;
  readonly toggled: ReadonlySet<WikiSectionKind>;
}): boolean => input.arrival.has(input.kind) !== input.toggled.has(input.kind);

/** Flips one section's disclosure. */
export const toggleSection = (
  toggled: ReadonlySet<WikiSectionKind>,
  kind: WikiSectionKind,
): ReadonlySet<WikiSectionKind> => {
  const next = new Set(toggled);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  return next;
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/** The one wiki route, built in one place so the peek card's click-through, a
 *  related-topic link, and a breadcrumb jump cannot spell it three ways.
 *
 *  Takes a plain string rather than the brand: a `phrase` segment carries its
 *  slug unbranded, and requiring the brand here would force a decode at every
 *  render of every hot phrase to build a URL that is a string either way. The
 *  brand's job is to gate what reaches `v1.wiki.topic.get`, which {@link readSlug}
 *  does at the route boundary. */
export const topicPath = (slug: string): string => `/wiki/${encodeURIComponent(slug)}`;
