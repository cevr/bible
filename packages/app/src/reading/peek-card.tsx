/** The §5 peek card: **topic title, thesis paragraph, click-through. Nothing
 *  else.**
 *
 *  The restraint is the decision, not an omission. `prototypes/rabbit-hole/`
 *  settled Mode A against sliding panes on geometry — a card that grew key
 *  verses, or a witness or two, would be a pane by another name and would cover
 *  the sentence the reader is in the middle of.
 *
 *  Two presentations, one component. Wide: a floating card anchored under the
 *  phrase. Narrow: the bottom sheet, "so it never covers the phrase it
 *  explains" — the same `Dialog surface='sheet'` the study pane uses at narrow,
 *  so the focus trap, the restore, the scroll lock and the Escape handling are
 *  the ones that already work rather than a second hand-rolled copy. The
 *  breakpoint is `usePanePresentation`'s, which is `matchMedia` over the exact
 *  query text the stylesheet states — one definition for both.
 *
 *  Reduced motion needs no code here: the card has no enter transition of its
 *  own, and the stylesheet's `prefers-reduced-motion` block already neutralizes
 *  every transition on the page. What this component owes the setting is not
 *  animating *around* it, which is why the wide card appears rather than slides.
 */

import type { TopicSlug } from '@bible/core/wiki';
import { Errored, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';

import { useWikiTopic } from '../runtime/index.js';
import { Dialog } from '../ui/index.js';
import { readSlug, topicPath } from './peek-state.js';
import { usePanePresentation } from './verse-study-pane.js';
import { WikiBlocks } from './wiki-blocks.js';

export interface PeekCardProps {
  /** The topic, as the `phrase` segment carries it — unbranded, because the
   *  segment model lives in `bible-rendering` and cannot import the wiki's
   *  schema. Branded here, once, on its way into the procedure payload. */
  readonly slug: string;
  /** The phrase's own surface text, so the card names what the reader tapped
   *  rather than only where it goes. */
  readonly phrase: string;
  /** Dismiss — a tap outside, Escape, or the sheet's backdrop. */
  readonly onDismiss: () => void;
  /** The click-through. Routed through the caller rather than a bare `<a>`
   *  because arriving at a topic is also a breadcrumb hop, and the trail is the
   *  caller's to keep. */
  readonly onOpen: (crumb: { readonly slug: string; readonly title: string }) => void;
}

/** The card's contents, presentation-independent: the two facts and the one
 *  action §5 allows. Dismissal is not among them — it belongs to whichever
 *  surface is holding the card, which is the sheet's backdrop at narrow and the
 *  reading surface's own outside-tap at wide. */
const PeekBody = (
  props: Omit<PeekCardProps, 'onDismiss' | 'slug'> & { readonly slug: TopicSlug },
) => {
  const page = useWikiTopic(() => ({ slug: props.slug }));
  /** The thesis, or nothing.
   *
   *  A catalog page has no authored core by definition (§2.1), so the honest
   *  peek for one is its title and the click-through with no thesis between
   *  them — rather than a placeholder sentence the page does not actually make. */
  const thesis = () => Option.getOrUndefined(Option.map(page().core, (core) => core.thesis));

  return (
    <>
      <p class="bible-peek__eyebrow">{props.phrase}</p>
      <h2 class="bible-peek__title">{page().title}</h2>
      <Show when={thesis()}>
        {(blocks) => (
          <div class="bible-peek__thesis">
            <WikiBlocks blocks={blocks()} />
          </div>
        )}
      </Show>
      <button
        type="button"
        class="bible-peek__open"
        onClick={() => props.onOpen({ slug: String(props.slug), title: page().title })}
        // The route the button mirrors, so a reader can see and a test can
        // assert where it goes; the click is handled rather than followed,
        // because arriving at a topic is a breadcrumb hop the caller records.
        data-topic={topicPath(String(props.slug))}
      >
        Open {page().title}
      </button>
    </>
  );
};

const PeekLoading = () => (
  <p class="bible-peek__state" role="status">
    Looking this up…
  </p>
);

const PeekFailure = () => (
  <p class="bible-peek__state bible-peek__state--error" role="alert">
    This topic could not be opened.
  </p>
);

export const PeekCard = (props: PeekCardProps) => {
  const presentation = usePanePresentation();
  /** The one place a slug is branded on this surface. A phrase span's slug came
   *  from the compiled dictionary and is a valid slug by construction, so a
   *  failure here means an artifact that violated its own schema — which reads
   *  as the same "could not be opened" the fetch failure does, rather than as a
   *  thrown decode inside a render. */
  const slug = () => Option.getOrUndefined(readSlug(props.slug));

  const body = () => (
    <Errored fallback={() => <PeekFailure />}>
      <Loading fallback={<PeekLoading />}>
        <Show when={slug()} fallback={<PeekFailure />}>
          {(branded) => <PeekBody slug={branded()} phrase={props.phrase} onOpen={props.onOpen} />}
        </Show>
      </Loading>
    </Errored>
  );

  return (
    <>
      {/* Narrow: the bottom sheet, so the card never covers the phrase.
          `surface='sheet'` is the study pane's own narrow surface — see
          `ui/dialog.tsx` for why the two share one modal rather than two. */}
      <Show when={presentation() === 'overlay'}>
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) props.onDismiss();
          }}
          title={`About ${props.phrase}`}
          surface="sheet"
        >
          <div class="bible-peek bible-peek--sheet">{body()}</div>
        </Dialog>
      </Show>
      {/* Wide: a card anchored to the phrase.
          Not a `Dialog`, and not `role="dialog"` either. It does not cover the
          reading, so announcing it as a modal would tell a screen reader the
          chapter was unreachable — and the attribute without a focus trap makes
          a promise the markup does not keep, which is the exact defect the study
          pane shipped with and had to be rewritten to fix. A labelled region
          says what it is and claims nothing more. The tap that dismisses it is
          the surface's own outside-tap handler, which is where §5's "tapping
          elsewhere dismisses" already lives. */}
      <Show when={presentation() === 'rail'}>
        <aside class="bible-peek bible-peek--card" aria-label={`About ${props.phrase}`}>
          {body()}
        </aside>
      </Show>
    </>
  );
};
