export interface ReadingPlan {
  id: string;
  name: string;
  description: string | null;
  type: 'builtin' | 'custom';
  sourceId: string | null;
  startDate: number | null;
  createdAt: number;
}

export interface ReadingPlanItem {
  id: number;
  planId: string;
  dayNumber: number;
  book: number;
  startChapter: number;
  endChapter: number | null;
  label: string | null;
}

export interface PlanItemInput {
  dayNumber: number;
  book: number;
  startChapter: number;
  endChapter?: number;
  label?: string;
}
