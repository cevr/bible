import type { CrossRefType } from '@bible/core/bible-cross-refs';

export {
  CROSS_REF_TYPES,
  CROSS_REF_ABBREVIATIONS,
  CROSS_REF_LABELS,
} from '@bible/core/bible-cross-refs';
export type {
  CrossRefType,
  CatalogCrossReference,
  UserCrossReference,
  ClassifiedCrossReference,
} from '@bible/core/bible-cross-refs';

export interface UserCrossRef {
  id: string;
  refBook: number;
  refChapter: number;
  refVerse: number | null;
  refVerseEnd: number | null;
  type: CrossRefType | null;
  note: string | null;
  createdAt: number;
}
