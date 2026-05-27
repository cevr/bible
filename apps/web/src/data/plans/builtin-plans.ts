/**
 * Built-in reading plans — static data, inserted on first load.
 *
 * Book numbers: Matthew=40, Mark=41, Luke=42, John=43
 */
import type { PlanItemInput } from './types';

export interface BuiltinPlanDef {
  sourceId: string;
  name: string;
  description: string;
  items: PlanItemInput[];
}

// Gospels in 30 days — ~3 chapters/day across Matthew, Mark, Luke, John
const gospelsItems: PlanItemInput[] = [
  // Matthew 1-3
  { dayNumber: 1, book: 40, startChapter: 1, endChapter: 3, label: 'Matthew 1-3' },
  { dayNumber: 2, book: 40, startChapter: 4, endChapter: 6, label: 'Matthew 4-6' },
  { dayNumber: 3, book: 40, startChapter: 7, endChapter: 9, label: 'Matthew 7-9' },
  { dayNumber: 4, book: 40, startChapter: 10, endChapter: 12, label: 'Matthew 10-12' },
  { dayNumber: 5, book: 40, startChapter: 13, endChapter: 15, label: 'Matthew 13-15' },
  { dayNumber: 6, book: 40, startChapter: 16, endChapter: 18, label: 'Matthew 16-18' },
  { dayNumber: 7, book: 40, startChapter: 19, endChapter: 21, label: 'Matthew 19-21' },
  { dayNumber: 8, book: 40, startChapter: 22, endChapter: 24, label: 'Matthew 22-24' },
  { dayNumber: 9, book: 40, startChapter: 25, endChapter: 28, label: 'Matthew 25-28' },
  // Mark 1-16
  { dayNumber: 10, book: 41, startChapter: 1, endChapter: 4, label: 'Mark 1-4' },
  { dayNumber: 11, book: 41, startChapter: 5, endChapter: 8, label: 'Mark 5-8' },
  { dayNumber: 12, book: 41, startChapter: 9, endChapter: 12, label: 'Mark 9-12' },
  { dayNumber: 13, book: 41, startChapter: 13, endChapter: 16, label: 'Mark 13-16' },
  // Luke 1-24
  { dayNumber: 14, book: 42, startChapter: 1, endChapter: 3, label: 'Luke 1-3' },
  { dayNumber: 15, book: 42, startChapter: 4, endChapter: 6, label: 'Luke 4-6' },
  { dayNumber: 16, book: 42, startChapter: 7, endChapter: 9, label: 'Luke 7-9' },
  { dayNumber: 17, book: 42, startChapter: 10, endChapter: 12, label: 'Luke 10-12' },
  { dayNumber: 18, book: 42, startChapter: 13, endChapter: 15, label: 'Luke 13-15' },
  { dayNumber: 19, book: 42, startChapter: 16, endChapter: 18, label: 'Luke 16-18' },
  { dayNumber: 20, book: 42, startChapter: 19, endChapter: 21, label: 'Luke 19-21' },
  { dayNumber: 21, book: 42, startChapter: 22, endChapter: 24, label: 'Luke 22-24' },
  // John 1-21
  { dayNumber: 22, book: 43, startChapter: 1, endChapter: 3, label: 'John 1-3' },
  { dayNumber: 23, book: 43, startChapter: 4, endChapter: 6, label: 'John 4-6' },
  { dayNumber: 24, book: 43, startChapter: 7, endChapter: 9, label: 'John 7-9' },
  { dayNumber: 25, book: 43, startChapter: 10, endChapter: 12, label: 'John 10-12' },
  { dayNumber: 26, book: 43, startChapter: 13, endChapter: 15, label: 'John 13-15' },
  { dayNumber: 27, book: 43, startChapter: 16, endChapter: 18, label: 'John 16-18' },
  { dayNumber: 28, book: 43, startChapter: 19, endChapter: 21, label: 'John 19-21' },
  // Review days
  { dayNumber: 29, book: 40, startChapter: 5, endChapter: 7, label: 'Review: Sermon on the Mount' },
  {
    dayNumber: 30,
    book: 43,
    startChapter: 13,
    endChapter: 17,
    label: 'Review: Upper Room Discourse',
  },
];

export const BUILTIN_PLANS: BuiltinPlanDef[] = [
  {
    sourceId: 'gospels-30',
    name: 'Gospels in 30 Days',
    description: 'Read through all four Gospels in one month, with two review days.',
    items: gospelsItems,
  },
];
