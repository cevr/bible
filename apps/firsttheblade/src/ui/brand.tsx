/**
 * The channel's name as it is drawn: mark E (the shoot in its disc) and
 * wordmark W1/A, Fraunces 600 with “the” in italic and the blade standing in
 * for the l. The drawn letters are hidden from assistive technology, which
 * reads the name once, as text.
 */
import { CHANNEL } from '../site.ts';
import { MARK } from './art.ts';

/**
 * The blade as the l (`bladeLPath` in the prototype's `blade/marks.ts`, at
 * 100 units to the em): the face's own stem, 0.119 em wide on a 0.245 em
 * advance, drawn to a point that leans over the a and stands 0.8 em tall.
 */
const BLADE_L = 'M6.3 80.6L6.3 33.6C6.3 16 13.25 4 21.4 0C17.61 8 18.2 20 18.2 37.6L18.2 80.6Z';

export const Wordmark = () => (
  <span class="wordmark">
    <span class="visually-hidden">{CHANNEL.name}</span>
    <span aria-hidden="true">
      First <i>the</i> B
      <svg viewBox="0 0 24.5 80">
        <path d={BLADE_L} />
      </svg>
      ade
    </span>
  </span>
);

/** The mark beside the wordmark, as the link home. */
export const Lockup = () => (
  <a class="lockup" href="/">
    <img src={MARK} alt="" width="54" height="54" />
    <Wordmark />
  </a>
);
