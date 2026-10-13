// Follow: the one rule by which a view's scroll box keeps what the frame
// lights in sight, shared by the Source view (the playing literal's line,
// `source/view.tsx`) and the cue strip (the live lanes, `editor/strip.tsx`).
// The view names a target as a key that only changes when the target does
// (so a frame that moves nothing reads no layout), and a span of rows for it.
// When the key changes, or the box or its content is resized, and the span is
// not inside the box (its edges kept clear by `clear`), one instant scroll
// brings its first row a third of the way down, its last in sight if it fits.
// A scroll is the view's when it lands where the view put the box, and
// layout's when it lands where the box's geometry now clamps that; any other
// scroll is a reader's, however it came (wheel, finger and its momentum,
// keys, the scrollbar, find-in-page, assistive tech), and `reader` is told,
// so the view stops placing until it is taken back. A placement asks the same
// before it scrolls, so a reader's scroll whose event is still on its way is
// not undone, and so may the view before it moves on the page's word (the
// Source face settling on a line once a read names it). Play is told too.
// What a press opens under the rows (the Script's box under a line) is named
// as a key too (`opened`), and brought into sight as it opens, by the least
// scroll, whoever holds the box: the press was the reader's own. Layout that
// moves it while it is open brings it back, until a reader scrolls the box.

import { Option } from 'effect';
import { type Accessor, createEffect, createSignal, untrack } from 'solid-js';
import { useLab } from './shell.tsx';

/** How far a scroll may land from where the view put the box and still be the view's: rounding to the device's pixels. */
const SLACK = 1;

/** The rows a target spans in its box: one row, or the first and the last of several. */
interface Span {
  readonly first: HTMLElement;
  readonly last: HTMLElement;
}

interface FollowOptions {
  /** The box that scrolls, once it is laid out. */
  readonly box: () => Option.Option<HTMLElement>;
  /** What the box scrolls, watched for a resize too. */
  readonly content: () => Option.Option<HTMLElement>;
  /** The target as a key: `''` for none. A frame that does not move the target keeps the key. */
  readonly target: Accessor<string>;
  /** The rows the target `key` spans, as they stand. */
  readonly span: (key: string) => Option.Option<Span>;
  /** How much of the box's top and bottom a row must keep clear of to count as in sight. */
  readonly clear: (box: HTMLElement) => { readonly top: number; readonly bottom: number };
  /** Whether the view places the box now: no reader has taken it, and no press holds it. */
  readonly placing: Accessor<boolean>;
  /** A reader scrolled the box. */
  readonly reader: () => void;
  /** Play pressed: what takes the view back. */
  readonly played: () => void;
  /**
   * What a press opened under the rows, as a key (`''` for none; its rows
   * from `span`, the last the box it opened): brought into sight once, as
   * the key changes, whether or not the view is placing.
   */
  readonly opened?: Accessor<string>;
}

/**
 * The span's top and bottom in the box's own scroll coordinates, whatever sits
 * between them: each of its rows asked once, so a one-row span is one read.
 */
const extentOf = (box: HTMLElement, span: Span) => {
  const origin = box.getBoundingClientRect().top - box.scrollTop;
  const first = span.first.getBoundingClientRect();
  const last = Option.getOrElse(
    Option.liftPredicate(span.last, (row) => row !== span.first).pipe(
      Option.map((row) => row.getBoundingClientRect()),
    ),
    () => first,
  );
  return { top: first.top - origin, bottom: last.bottom - origin };
};

/**
 * Follow `options.target` in `options.box` while `options.placing()`, by the rule above. Mount it with the view.
 * Answers whether a reader has the box now, its scroll event heard or still on its way (`reader` told if so): what
 * anything that would move the view on the page's word (a settle on a line) asks first.
 */
export const useFollow = (options: FollowOptions): (() => boolean) => {
  const { state: lab, meta } = useLab();
  // Where the view last authored the box: the scroll it wrote, read back (so clamping and rounding are in it), or
  // the clamp layout made of it. A reader's scroll is measured from here, so steps too small to tell one by one add up.
  let anchor = 0;
  // Each resize of the box or its content: the view measures its target again.
  const [laidOut, setLaidOut] = createSignal(0);
  // Whether the box stands where a reader put it: off the anchor, and off the clamp layout made of it (that clamp
  // becomes the anchor). Asked by each scroll event and before each placement, since a busy page may deliver a
  // reader's scroll event only after the view has measured again.
  const readerMoved = (box: HTMLElement): boolean => {
    const at = box.scrollTop;
    if (Math.abs(at - anchor) <= SLACK) return false;
    const clamped = Math.min(anchor, box.scrollHeight - box.clientHeight);
    if (Math.abs(at - clamped) > SLACK) return true;
    anchor = clamped;
    return false;
  };

  // Play takes the view back.
  let wasPlaying = false;
  createEffect(
    () => lab.drawn(),
    () => {
      const playing = meta.player.playing();
      // The view's answer is a reaction to the press, not a read this effect tracks.
      if (playing && !wasPlaying) untrack(options.played);
      wasPlaying = playing;
    },
  );

  // Once, after mount: the box and its content are found from the refs the view's markup set.
  createEffect(
    () => true,
    () =>
      Option.match(Option.all({ box: options.box(), content: options.content() }), {
        onNone: () => () => {},
        onSome: ({ box, content }) => {
          anchor = box.scrollTop;
          const o = new ResizeObserver(() => setLaidOut((n) => n + 1));
          o.observe(box);
          o.observe(content);
          const scrolled = () => {
            if (readerMoved(box)) options.reader();
          };
          box.addEventListener('scroll', scrolled, { passive: true });
          return () => {
            o.disconnect();
            box.removeEventListener('scroll', scrolled);
          };
        },
      }),
  );

  /** What a press opened under the rows, as its key: `''` while nothing is open, or for a view that opens nothing. */
  const opened = () =>
    Option.getOrElse(
      Option.map(Option.fromUndefinedOr(options.opened), (o) => o()),
      () => '',
    );

  // One effect places the box, and first takes it back when placing turns on (Follow, Play, a line held again): the
  // box where it stands is the view's from then. In one effect, the take-back comes before the placement's own check
  // for a reader's scroll by the code's order, not by the scheduler's.
  let wasPlacing = false;
  createEffect(
    () => [options.target(), laidOut(), options.placing()] as const,
    ([key, , on]) => {
      const takenBack = on && !wasPlacing;
      wasPlacing = on;
      if (takenBack)
        Option.map(options.box(), (box) => {
          anchor = box.scrollTop;
        });
      if (!on || key === '') return;
      // What a press opened holds the box while the film stands still: neither the press's own seek nor the resize its
      // opening made places the frame's row over it. Play, or the view taken back, places it.
      if (!takenBack && untrack(opened) !== '' && !meta.player.playing()) return;
      Option.map(
        Option.flatMap(options.box(), (box) =>
          Option.map(options.span(key), (span) => ({ box, span })),
        ),
        ({ box, span }) => {
          // A row with no box (its lane folded away in this mode) has no place to scroll to.
          if (span.first.getClientRects().length === 0) return;
          // A reader's scroll not heard yet is the reader's all the same: the view lets go rather than undo it.
          if (readerMoved(box)) return options.reader();
          const clear = options.clear(box);
          const { top, bottom } = extentOf(box, span);
          const inView =
            top >= box.scrollTop + clear.top &&
            bottom <= box.scrollTop + box.clientHeight - clear.bottom;
          if (inView) return;
          // The first row a third of the way down; the last brought up into sight if the span fits; the first never
          // pushed above the clear top.
          const third = top - box.clientHeight / 3;
          const toLast = bottom - box.clientHeight + clear.bottom;
          const to = Math.min(Math.max(third, toLast), top - clear.top);
          // Instant, so the move is one scroll that lands on the anchor, never a smooth run of them.
          box.scrollTo({ top: Math.max(0, to), behavior: 'instant' });
          anchor = box.scrollTop;
        },
      );
    },
  );

  // What a press opened comes into sight as it opens, by the least scroll: the box it opened (the span's last row)
  // and the first row it is about with it when both fit between the clear edges; else the box alone, its top never
  // pushed above the clear top. Placing or not: the press was the reader's. A resize while it stays open (the page
  // still settling, the box growing as it is typed in) brings it into sight again, while the film stands still and
  // no reader has scrolled the box since. The scroll is the view's, so it is never taken for a reader's; a reader's
  // not heard yet is told first.
  let revealed = '';
  createEffect(
    () => [opened(), laidOut()] as const,
    ([key]) => {
      const fresh = key !== revealed;
      revealed = key;
      if (key === '' || (!fresh && meta.player.playing())) return;
      Option.map(
        Option.flatMap(options.box(), (box) =>
          Option.map(options.span(key), (span) => ({ box, span })),
        ),
        ({ box, span }) => {
          if (span.first.getClientRects().length === 0) return;
          if (readerMoved(box)) {
            options.reader();
            // Since it opened, the box is the reader's: only a press brings what it opens into sight over that.
            if (!fresh) return;
          }
          const clear = options.clear(box);
          const { top, bottom } = extentOf(box, span);
          const room = box.clientHeight - clear.top - clear.bottom;
          const kept = Option.getOrElse(
            Option.liftPredicate(top, () => bottom - top <= room),
            () => extentOf(box, { first: span.last, last: span.last }).top,
          );
          const to = Math.min(
            Math.max(box.scrollTop, bottom - box.clientHeight + clear.bottom),
            kept - clear.top,
          );
          if (Math.abs(to - box.scrollTop) > SLACK)
            box.scrollTo({ top: Math.max(0, to), behavior: 'instant' });
          // Where it stands now is the view's, scrolled or let be: a resize measures from here.
          anchor = box.scrollTop;
        },
      );
    },
  );

  return () =>
    Option.match(options.box(), {
      onNone: () => false,
      onSome: (box) => {
        if (!untrack(options.placing)) return true;
        if (!readerMoved(box)) return false;
        options.reader();
        return true;
      },
    });
};
