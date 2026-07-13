export interface StudyCollection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: number;
}

export interface CollectionVerse {
  collectionId: string;
  book: number;
  chapter: number;
  verse: number;
  addedAt: number;
}
