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
// not undone. Play is told too.

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

/** Follow `options.target` in `options.box` while `options.placing()`, by the rule above. Mount it with the view. */
export const useFollow = (options: FollowOptions): void => {
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

  // Taken back (Follow, Play, a line held again): the box where it stands is the view's, then placed as its target needs.
  createEffect(
    () => options.placing(),
    (on) => {
      if (!on) return;
      Option.map(options.box(), (box) => {
        anchor = box.scrollTop;
      });
    },
  );

  createEffect(
    () => [options.target(), laidOut(), options.placing()] as const,
    ([key, , on]) => {
      if (!on || key === '') return;
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
};
