export interface MemoryVerse {
  id: string;
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number | null;
  createdAt: number;
}

export interface PracticeRecord {
  id: number;
  verseId: string;
  mode: 'reveal' | 'type';
  score: number | null;
  practicedAt: number;
}
