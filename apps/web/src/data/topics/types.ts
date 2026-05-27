export interface Topic {
  id: number;
  name: string;
  parentId: number | null;
  description: string | null;
}

export interface TopicVerse {
  topicId: number;
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number | null;
  note: string | null;
}
