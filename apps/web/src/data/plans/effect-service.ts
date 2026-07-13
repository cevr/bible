import { Effect, Layer, Context, Schema } from 'effect';
import { DbClientService, type DatabaseQueryError } from '../db-client-service';
import type { ReadingPlan, ReadingPlanItem, PlanItemInput } from './types';

export class ReadingPlanDataError extends Schema.TaggedErrorClass<ReadingPlanDataError>()(
  'ReadingPlanDataError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

const PlanRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  type: Schema.String,
  source_id: Schema.NullOr(Schema.String),
  start_date: Schema.NullOr(Schema.Number),
  created_at: Schema.Number,
});
type PlanRow = typeof PlanRow.Type;

const PlanItemRow = Schema.Struct({
  id: Schema.Number,
  plan_id: Schema.String,
  day_number: Schema.Number,
  book: Schema.Number,
  start_chapter: Schema.Number,
  end_chapter: Schema.NullOr(Schema.Number),
  label: Schema.NullOr(Schema.String),
});
type PlanItemRow = typeof PlanItemRow.Type;

const PlanProgressRow = Schema.Struct({ item_id: Schema.Number });

interface WebReadingPlanServiceShape {
  readonly getPlans: () => Effect.Effect<ReadingPlan[], ReadingPlanDataError>;
  readonly getPlanItems: (planId: string) => Effect.Effect<ReadingPlanItem[], ReadingPlanDataError>;
  readonly getPlanProgress: (planId: string) => Effect.Effect<Set<number>, ReadingPlanDataError>;
  readonly createPlan: (
    name: string,
    description: string | null,
    type: 'builtin' | 'custom',
    sourceId: string | null,
    items: PlanItemInput[],
  ) => Effect.Effect<ReadingPlan, ReadingPlanDataError>;
  readonly removePlan: (id: string) => Effect.Effect<void, ReadingPlanDataError>;
  readonly markItemComplete: (
    planId: string,
    itemId: number,
  ) => Effect.Effect<void, ReadingPlanDataError>;
  readonly markItemIncomplete: (
    planId: string,
    itemId: number,
  ) => Effect.Effect<void, ReadingPlanDataError>;
  readonly setPlanStartDate: (
    planId: string,
    startDate: number,
  ) => Effect.Effect<void, ReadingPlanDataError>;
}

export class WebReadingPlanService extends Context.Service<
  WebReadingPlanService,
  WebReadingPlanServiceShape
>()('@bible-web/ReadingPlanService') {
  static Live = Layer.effect(
    WebReadingPlanService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getPlans = Effect.fn('WebReadingPlanService.getPlans')(function* () {
        const rows = yield* db.query(
          PlanRow,
          'state',
          'SELECT id, name, description, type, source_id, start_date, created_at FROM reading_plans ORDER BY created_at DESC',
        );
        return rows.map(mapPlan);
      });

      const getPlanItems = Effect.fn('WebReadingPlanService.getPlanItems')(function* (
        planId: string,
      ) {
        const rows = yield* db.query(
          PlanItemRow,
          'state',
          'SELECT id, plan_id, day_number, book, start_chapter, end_chapter, label FROM reading_plan_items WHERE plan_id = ? ORDER BY day_number, id',
          [planId],
        );
        return rows.map(mapItem);
      });

      const getPlanProgress = Effect.fn('WebReadingPlanService.getPlanProgress')(function* (
        planId: string,
      ) {
        const rows = yield* db.query(
          PlanProgressRow,
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

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, DatabaseQueryError>) =>
        effect.pipe(Effect.mapError((cause) => new ReadingPlanDataError({ cause, operation })));

      return WebReadingPlanService.of({
        getPlans: () => mapDataError('getPlans', getPlans()),
        getPlanItems: (planId) => mapDataError('getPlanItems', getPlanItems(planId)),
        getPlanProgress: (planId) => mapDataError('getPlanProgress', getPlanProgress(planId)),
        createPlan: (name, description, type, sourceId, items) =>
          mapDataError('createPlan', createPlan(name, description, type, sourceId, items)),
        removePlan: (id) => mapDataError('removePlan', removePlan(id)),
        markItemComplete: (planId, itemId) =>
          mapDataError('markItemComplete', markItemComplete(planId, itemId)),
        markItemIncomplete: (planId, itemId) =>
          mapDataError('markItemIncomplete', markItemIncomplete(planId, itemId)),
        setPlanStartDate: (planId, startDate) =>
          mapDataError('setPlanStartDate', setPlanStartDate(planId, startDate)),
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
