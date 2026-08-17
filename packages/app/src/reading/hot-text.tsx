/** One plain string, rendered with its planned phrase spans hot (§4.6, §4.7).
 *
 *  The EGW paragraph renderer and the topic page both hand the matcher plain
 *  strings and both draw the same alternating run of text and links, so the slice
 *  and the span live here once. The Bible reader does not use this: its phrase
 *  spans arrive as `phrase` `TextSegment`s from the pipeline, because that is the
 *  shape `SEGMENT_APPLICATION_ORDER` is defined over.
 */

import { For, Match, Switch } from '@solidjs/web';
import type { Option } from 'effect';

import { phrasePieces, type PlannedSpan } from './match-plan.js';
import type { Peeked, PhraseOccurrenceId } from './peek-state.js';
import { PhraseSpan } from './phrase-span.js';

export interface HotTextProps {
  readonly text: string;
  /** The spans the section's single matcher pass decided for this run, already
   *  numbered. A pure lookup — never a matcher call, which would consume the
   *  section state on every read Solid makes of this prop. */
  readonly spans: readonly PlannedSpan[];
  readonly peeked: Option.Option<PhraseOccurrenceId>;
  readonly onPhrase: (tapped: Peeked) => void;
}

export const HotText = (props: HotTextProps) => {
  /** Computed once per read of the pieces rather than inline in the `For`, so
   *  the slice walk happens once. Pure in its inputs: the same props produce the
   *  same pieces however many times Solid asks. */
  const pieces = () => phrasePieces(props.text, props.spans);

  return (
    <For each={pieces()}>
      {(piece) => (
        <Switch>
          <Match when={piece.kind === 'text'}>{piece.text}</Match>
          <Match when={piece.kind === 'phrase'}>
            {() => {
              if (piece.kind !== 'phrase') return <></>;
              return (
                <PhraseSpan
                  text={piece.text}
                  slug={piece.slug}
                  occurrence={piece.occurrence}
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
};
