export interface EGWCommentaryEntry {
  refcode: string;
  bookCode: string;
  bookTitle: string;
  content: string;
  puborder: number;
  source: 'indexed' | 'search';
}

export interface EGWContextParagraph {
  refcode: string;
  bookCode: string;
  content: string;
  puborder: number;
}
