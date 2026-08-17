/** The segment renderer the Bible reader has never had (§4.6, §10 M6).
 *
 *  `packages/core/src/bible-rendering/segments.ts` has produced a typed
 *  `TextSegment[]` since long before the wiki layer, and until this file nothing
 *  outside its own directory consumed it — the reader rendered `{verse.text}`
 *  as a raw string, so italics, red letter and margin anchors were modelled and
 *  never drawn. Milestone 6 pays that debt because the phrase span is a segment
 *  variant and needs somewhere to land, and paying it delivers the three
 *  editorial layers as well.
 *
 *  One component for both hosts. There is no second renderer to keep in step:
 *  web and desktop mount this same module, which is what makes "italics and red
 *  letter render identically on both" a structural fact rather than a test
 *  result.
 *
 *  Nothing here computes. The segments and the occurrence ids both arrive from
 *  the chapter's match plan, which ran the matcher once for the whole chapter —
 *  see `match-plan.ts` for why a reactive renderer must never be the thing that
 *  calls a mutating matcher, and why an occurrence id counted from the segment
 *  list at render time was not stable.
 */

import type { TextSegment } from '@bible/core/bible-rendering';
import { For, Match, Show, Switch, type JSX } from '@solidjs/web';
import type { Option } from 'effect';

import { verseOccurrence, type VersePlan } from './match-plan.js';
import type { Peeked, PhraseOccurrenceId } from './peek-state.js';
import { PhraseSpan } from './phrase-span.js';

export interface VerseSegmentsProps {
  /** This verse's finished plan: the segments to draw and the occurrence id of
   *  each phrase among them. */
  readonly plan: VersePlan;
  /** Which occurrence is currently peeked, so the span can mark itself. */
  readonly peeked: Option.Option<PhraseOccurrenceId>;
  /** A tapped phrase, carrying the occurrence id the plan minted. */
  readonly onPhrase: (tapped: Peeked) => void;
  /** Renders one margin anchor. Absent on surfaces with no margin-note popover
   *  to open, in which case the anchor is drawn as a plain marker. */
  readonly marginAnchor?: (noteIndex: number) => JSX.Element;
}

/** Which phrase this segment is, among the verse's phrases.
 *
 *  A prefix count over the plan's own segment list — a pure function of a value
 *  that no longer changes, because the plan is immutable. The previous version
 *  counted over a segment list the reader *recomputed* on each read, which is
 *  how two different phrases came to share an id. */
const phraseIndexAt = (segments: readonly TextSegment[], index: number): number =>
  segments.slice(0, index).filter((segment) => segment.type === 'phrase').length;

export const VerseSegments = (props: VerseSegmentsProps) => (
  <For each={props.plan.segments}>
    {(segment, index) => (
      <Switch>
        <Match when={segment.type === 'text'}>
          {() => {
            if (segment.type !== 'text') return <></>;
            return segment.text;
          }}
        </Match>
        <Match when={segment.type === 'italic'}>
          {() => {
            if (segment.type !== 'italic') return <></>;
            return <em class="bible-supplied">{segment.text}</em>;
          }}
        </Match>
        <Match when={segment.type === 'highlight'}>
          {() => {
            if (segment.type !== 'highlight') return <></>;
            return <mark>{segment.text}</mark>;
          }}
        </Match>
        <Match when={segment.type === 'redLetter'}>
          {() => {
            if (segment.type !== 'redLetter') return <></>;
            return <span class="bible-red-letter">{segment.text}</span>;
          }}
        </Match>
        <Match when={segment.type === 'redLetterItalic'}>
          {() => {
            if (segment.type !== 'redLetterItalic') return <></>;
            return <em class="bible-red-letter bible-supplied">{segment.text}</em>;
          }}
        </Match>
        <Match when={segment.type === 'redLetterQuote'}>
          {() => {
            if (segment.type !== 'redLetterQuote') return <></>;
            return <span class="bible-red-letter">{segment.text}</span>;
          }}
        </Match>
        <Match when={segment.type === 'margin'}>
          {() => {
            if (segment.type !== 'margin') return <></>;
            const noteIndex = segment.noteIndex;
            return (
              <Show
                when={props.marginAnchor}
                fallback={
                  <sup class="bible-margin-anchor" aria-hidden="true">
                    {noteIndex + 1}
                  </sup>
                }
              >
                {(render) => render()(noteIndex)}
              </Show>
            );
          }}
        </Match>
        <Match when={segment.type === 'phrase'}>
          {() => {
            if (segment.type !== 'phrase') return <></>;
            return (
              <PhraseSpan
                text={segment.text}
                slug={segment.slug}
                occurrence={verseOccurrence(
                  props.plan,
                  phraseIndexAt(props.plan.segments, index()),
                )}
                peeked={props.peeked}
                onPhrase={props.onPhrase}
              />
            );
          }}
        </Match>
      </Switch>
    )}
  </For>
);
