/** §10 Milestone 8: "router classifies quoted / refcode / wordy inputs
 *  correctly". */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { countWords, parseRefcode, route, WORDY_WORD_THRESHOLD } from './router.js';

describe('§9.3 the query router', () => {
  describe('quoted string → exact phrase, lexical only', () => {
    it('routes a straight-quoted string to the phrase route', () => {
      const routed = route('"the daily"');
      expect(routed._tag).toBe('phrase');
      if (routed._tag !== 'phrase') return;
      // The quotes are stripped: what the FTS phrase wraps is the text, not the
      // punctuation the reader typed to ask for it.
      expect(routed.phrase).toBe('the daily');
    });

    it('routes typographic quotes the same way', () => {
      // A phrase pasted from a document carries smart quotes, and the reader
      // meant the same thing as one who typed straight ones.
      const routed = route('“the daily”');
      expect(routed._tag).toBe('phrase');
      if (routed._tag !== 'phrase') return;
      expect(routed.phrase).toBe('the daily');
    });

    it('a quoted refcode is a phrase, not a locate-jump', () => {
      // The ordering rule that matters: quoting is the only way to ask for the
      // literal text "GC 425", so the quote check must run before the refcode
      // check or the reader has no way to express it.
      const routed = route('"GC 425"');
      expect(routed._tag).toBe('phrase');
    });

    it('refuses an empty or unbalanced quote', () => {
      // `""` would send an empty MATCH to FTS; `"the daily` is a reader who
      // started typing a phrase and has not finished.
      expect(route('""')._tag).toBe('hybrid');
      expect(route('"the daily')._tag).toBe('hybrid');
    });

    it('a quote inside a question is a wordy hybrid query, not a phrase', () => {
      // The reader is asking a question *about* a term, not searching for a
      // literal string. §9.3 gives the quote one meaning — "the whole box is one
      // phrase" — so a quote that does not wrap the whole box must not change
      // the route at all.
      //
      // A router that searched for the inner text instead would answer a
      // five-word question with an exact-phrase lookup of two words, and drop
      // the vector leg that the wordiness threshold exists to reach.
      const routed = route('why "the daily" matters');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      // Wordy, so the vector leg runs: the quote must not have been stripped to
      // a two-word phrase on the way here.
      expect(routed.wordy).toBe(true);
      // The text reaches the legs as the reader typed it, quotes included —
      // `ftsQuery` escapes them, rather than the router removing them.
      expect(routed.text).toBe('why "the daily" matters');
    });
  });

  describe('refcode pattern → locate-jump', () => {
    it('routes a book code plus a page number', () => {
      const routed = route('GC 425');
      expect(routed._tag).toBe('locate');
      if (routed._tag !== 'locate') return;
      expect(routed.refcode).toBe('GC 425');
    });

    it('routes a book code plus page and paragraph', () => {
      const routed = route('1SM 12.3');
      expect(routed._tag).toBe('locate');
      if (routed._tag !== 'locate') return;
      expect(routed.refcode).toBe('1SM 12.3');
    });

    it('normalizes the code to upper case', () => {
      // "gc 425" and "GC 425" are the same location, and the corpus spells it
      // one way. Two spellings reaching the locate leg would be two lookups.
      expect(parseRefcode('gc 425')).toEqual(Option.some('GC 425'));
    });

    it('a bare book code is not a location', () => {
      // "DA", "MH", "EW" are all words or initials a reader might search for.
      // Routing a bare code to the locate-jump would hijack every short query
      // that happens to spell one.
      expect(route('GC')._tag).toBe('hybrid');
      expect(route('DA')._tag).toBe('hybrid');
    });

    it('a bare number pair is not a refcode', () => {
      // The code must contain a letter, or "1 2" would be a location.
      expect(parseRefcode('1 2')).toEqual(Option.none());
    });

    it('a refcode with trailing words is a description, not a reference', () => {
      // The pattern is anchored whole-string on purpose: "GC 425 and the loud
      // cry" is a reader describing a passage, not addressing one.
      expect(route('GC 425 and the loud cry')._tag).toBe('hybrid');
    });
  });

  describe('everything else → hybrid, wordy above the threshold', () => {
    it('a one-word query is not wordy', () => {
      const routed = route('sanctuary');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.words).toBe(1);
      expect(routed.wordy).toBe(false);
    });

    it('a two-word query is not wordy', () => {
      // Two words is how a reader spells a term they already know, and FTS
      // answers it better than embeddings do.
      const routed = route('latter rain');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.wordy).toBe(false);
    });

    it('the threshold is inclusive at three words', () => {
      const routed = route('close of probation');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.words).toBe(WORDY_WORD_THRESHOLD);
      expect(routed.wordy).toBe(true);
    });

    it('a described question is wordy', () => {
      const routed = route('what happens at the close of probation');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.wordy).toBe(true);
    });

    it('counts runs of non-whitespace, and collapses surrounding space', () => {
      expect(countWords('  close   of  probation  ')).toBe(3);
      const routed = route('  close   of  probation  ');
      if (routed._tag !== 'hybrid') return;
      expect(routed.text).toBe('close   of  probation');
    });
  });
});
