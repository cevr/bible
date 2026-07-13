export type MarkerColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export interface VerseMarker {
  id: string;
  book: number;
  chapter: number;
  verse: number;
  color: MarkerColor;
  createdAt: number;
}

export interface VerseNote {
  id: string;
  book: number;
  chapter: number;
  verse: number;
  content: string;
  createdAt: number;
}

export interface EgwNote {
  id: string;
  bookCode: string;
  puborder: number;
  content: string;
  createdAt: number;
}

export interface EgwMarker {
  id: string;
  bookCode: string;
  puborder: number;
  color: MarkerColor;
  createdAt: number;
}
