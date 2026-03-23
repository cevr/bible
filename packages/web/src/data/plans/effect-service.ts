import { Effect, Layer, ServiceMap } from 'effect';
import { DbClientService } from '../db-client-service';
import type { DatabaseQueryError } from '../errors';
import type { ReadingPlan, ReadingPlanItem, PlanItemInput } from './types';

interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  source_id: string | null;
  start_date: number | null;
  created_at: number;
}

interface PlanItemRow {
  id: number;
  plan_id: string;
  day_number: number;
  book: number;
  start_chapter: number;
  end_chapter: number | null;
  label: string | null;
}

interface WebReadingPlanServiceShape {
  readonly getPlans: () => Effect.Effect<ReadingPlan[], DatabaseQueryError>;
  readonly getPlanItems: (planId: string) => Effect.Effect<ReadingPlanItem[], DatabaseQueryError>;
  readonly getPlanProgress: (planId: string) => Effect.Effect<Set<number>, DatabaseQueryError>;
  readonly createPlan: (
    name: string,
    description: string | null,
    type: 'builtin' | 'custom',
    sourceId: string | null,
    items: PlanItemInput[],
  ) => Effect.Effect<ReadingPlan, DatabaseQueryError>;
  readonly removePlan: (id: string) => Effect.Effect<void, DatabaseQueryError>;
  readonly markItemComplete: (
    planId: string,
    itemId: number,
  ) => Effect.Effect<void, DatabaseQueryError>;
  readonly markItemIncomplete: (
    planId: string,
    itemId: number,
  ) => Effect.Effect<void, DatabaseQueryError>;
  readonly setPlanStartDate: (
    planId: string,
    startDate: number,
  ) => Effect.Effect<void, DatabaseQueryError>;
}

export class WebReadingPlanService extends ServiceMap.Service<
  WebReadingPlanService,
  WebReadingPlanServiceShape
>()('@bible-web/ReadingPlanService') {
  static Live = Layer.effect(
    WebReadingPlanService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getPlans = Effect.fn('WebReadingPlanService.getPlans')(function* () {
        const rows = yield* db.query<PlanRow>(
          'state',
          'SELECT id, name, description, type, source_id, start_date, created_at FROM reading_plans ORDER BY created_at DESC',
        );
        return rows.map(mapPlan);
      });

      const getPlanItems = Effect.fn('WebReadingPlanService.getPlanItems')(function* (
        planId: string,
      ) {
        const rows = yield* db.query<PlanItemRow>(
          'state',
          'SELECT id, plan_id, day_number, book, start_chapter, end_chapter, label FROM reading_plan_items WHERE plan_id = ? ORDER BY day_number, id',
          [planId],
        );
        return rows.map(mapItem);
      });

      const getPlanProgress = Effect.fn('WebReadingPlanService.getPlanProgress')(function* (
        planId: string,
      ) {
        const rows = yield* db.query<{ item_id: number }>(
          'state',
          'SELECT item_id FROM reading_plan_progress WHERE plan_id = ?',
          [planId],
        );
        return new Set(rows.map((r) => r.item_id));
      });

      const createPlan = Effect.fn('WebReadingPlanService.createPlan')(function* (
        name: string,
        description: string | null,
        type: 'builtin' | 'custom',
        sourceId: string | null,
        items: PlanItemInput[],
      ) {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        yield* db.exec(
          'INSERT INTO reading_plans (id, name, description, type, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, name, description, type, sourceId, createdAt],
        );
        for (const item of items) {
          yield* db.exec(
            'INSERT INTO reading_plan_items (plan_id, day_number, book, start_chapter, end_chapter, label) VALUES (?, ?, ?, ?, ?, ?)',
            [
              id,
              item.dayNumber,
              item.book,
              item.startChapter,
              item.endChapter ?? null,
              item.label ?? null,
            ],
          );
        }
        return {
          id,
          name,
          description,
          type,
          sourceId,
          startDate: null,
          createdAt,
        } satisfies ReadingPlan;
      });

      const removePlan = Effect.fn('WebReadingPlanService.removePlan')(function* (id: string) {
        // CASCADE deletes reading_plan_items and reading_plan_progress
        yield* db.exec('DELETE FROM reading_plans WHERE id = ?', [id]);
      });

      const markItemComplete = Effect.fn('WebReadingPlanService.markItemComplete')(function* (
        planId: string,
        itemId: number,
      ) {
        yield* db.exec(
          'INSERT OR IGNORE INTO reading_plan_progress (plan_id, item_id, completed_at) VALUES (?, ?, ?)',
          [planId, itemId, Date.now()],
        );
      });

      const markItemIncomplete = Effect.fn('WebReadingPlanService.markItemIncomplete')(function* (
        planId: string,
        itemId: number,
      ) {
        yield* db.exec('DELETE FROM reading_plan_progress WHERE plan_id = ? AND item_id = ?', [
          planId,
          itemId,
        ]);
      });

      const setPlanStartDate = Effect.fn('WebReadingPlanService.setPlanStartDate')(function* (
        planId: string,
        startDate: number,
      ) {
        yield* db.exec('UPDATE reading_plans SET start_date = ? WHERE id = ?', [startDate, planId]);
      });

      return WebReadingPlanService.of({
        getPlans,
        getPlanItems,
        getPlanProgress,
        createPlan,
        removePlan,
        markItemComplete,
        markItemIncomplete,
        setPlanStartDate,
      });
    }),
  );
}

function mapPlan(r: PlanRow): ReadingPlan {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type as 'builtin' | 'custom',
    sourceId: r.source_id,
    startDate: r.start_date,
    createdAt: r.created_at,
  };
}

function mapItem(r: PlanItemRow): ReadingPlanItem {
  return {
    id: r.id,
    planId: r.plan_id,
    dayNumber: r.day_number,
    book: r.book,
    startChapter: r.start_chapter,
    endChapter: r.end_chapter,
    label: r.label,
  };
}
