export interface StrongsEntry {
  number: string;
  language: 'hebrew' | 'greek';
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  definition: string;
  kjvDefinition: string | null;
}

export interface VerseWord {
  wordIndex: number;
  wordText: string;
  strongsNumbers: readonly string[] | null;
}

export interface MarginNote {
  noteIndex: number;
  noteType: string;
  phrase: string;
  noteText: string;
}

export interface StrongsVerseHit {
  book: number;
  chapter: number;
  verse: number;
  wordText: string | null;
}
