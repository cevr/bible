export {
  CatalogCrossRefSource,
  CROSS_REF_TYPES,
  CROSS_REF_ABBREVIATIONS,
  CROSS_REF_LABELS,
  CrossRefType,
} from '@bible/core/bible-cross-refs';
export type {
  CatalogCrossReference,
  UserCrossReference,
  ClassifiedCrossReference,
} from '@bible/core/bible-cross-refs';

import type { CrossRefType } from '@bible/core/bible-cross-refs';

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
