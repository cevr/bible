/**
 * The channel's name as it is drawn: logo 10, the painted mark in its disc
 * beside the wordmark, Newsreader 500 with “the” in italic. The wordmark is
 * the name as text, so it is read once, as it reads.
 */
import { MARK } from './art.ts';

export const Wordmark = () => (
  <span class="wordmark" data-logo="">
    First <i>the</i> Blade
  </span>
);

/** The mark beside the wordmark, as the link home. */
export const Lockup = () => (
  <a class="lockup" href="/">
    <img src={MARK.small} alt="" width="112" height="112" />
    <Wordmark />
  </a>
);
