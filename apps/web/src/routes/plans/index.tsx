import { Suspense, useTransition } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Plus, Trash2, Check, ChevronLeft, BookOpen } from 'lucide-react';
import { useApp } from '@/providers/db-context';
import { useBible } from '@/providers/bible-context';
import { toBookSlug } from '@/data/bible';
import { BUILTIN_PLANS } from '@/data/plans/builtin-plans';
import type { ReadingPlan, ReadingPlanItem } from '@/data/plans/types';

export default function PlansRoute() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan');

  return planId ? (
    <Suspense fallback={<p className="text-muted-foreground">Loading plan…</p>}>
      <PlanDetail planId={planId} />
    </Suspense>
  ) : (
    <Suspense fallback={<p className="text-muted-foreground">Loading plans…</p>}>
      <PlanList />
    </Suspense>
  );
}

function PlanList() {
  const app = useApp();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  const plans = app.plans();

  const handleAddBuiltin = (sourceId: string) => {
    const def = BUILTIN_PLANS.find((p) => p.sourceId === sourceId);
    if (!def) return;
    // Check if already added
    if (plans.some((p) => p.sourceId === sourceId)) return;
    startTransition(async () => {
      await app.createPlan(def.name, def.description, 'builtin', def.sourceId, def.items);
      app.plans.invalidateAll();
    });
  };

  const handleRemove = (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}"? All progress will be lost.`)) return;
    startTransition(async () => {
      await app.removePlan(id);
      app.plans.invalidateAll();
    });
  };

  // Split available builtins (not yet added) from user plans
  const addedSourceIds = new Set(plans.filter((p) => p.sourceId).map((p) => p.sourceId));
  const availableBuiltins = BUILTIN_PLANS.filter((bp) => !addedSourceIds.has(bp.sourceId));

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-sans text-2xl font-semibold text-foreground text-balance">
          Reading Plans
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your progress through structured Bible reading.
        </p>
      </header>

      {/* Active plans */}
      {plans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Your Plans
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onOpen={() => navigate(`/plans?plan=${plan.id}`)}
                onRemove={() => handleRemove(plan.id, plan.name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Available built-in plans */}
      {availableBuiltins.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Available Plans
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {availableBuiltins.map((bp) => (
              <div
                key={bp.sourceId}
                className="rounded-lg border border-dashed border-border p-4 space-y-2"
              >
                <h3 className="font-semibold text-foreground">{bp.name}</h3>
                <p className="text-sm text-muted-foreground">{bp.description}</p>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 rounded transition-colors"
                  onClick={() => handleAddBuiltin(bp.sourceId)}
                  disabled={isPending}
                >
                  <Plus className="size-4" />
                  Start Plan
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {plans.length === 0 && availableBuiltins.length === 0 && (
        <p className="text-center text-muted-foreground py-12">No reading plans available.</p>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  onOpen,
  onRemove,
}: {
  plan: ReadingPlan;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between">
        <button className="text-left flex-1" onClick={onOpen}>
          <h3 className="font-semibold text-foreground">{plan.name}</h3>
          {plan.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
          )}
        </button>
        <button
          className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove plan"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <Suspense fallback={null}>
        <PlanProgressBar planId={plan.id} />
      </Suspense>
    </div>
  );
}

function PlanProgressBar({ planId }: { planId: string }) {
  const app = useApp();
  const items = app.planItems(planId);
  const progress = app.planProgress(planId);

  const total = items.length;
  const done = items.filter((i) => progress.has(i.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          {done}/{total} readings
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PlanDetail({ planId }: { planId: string }) {
  const app = useApp();
  const bible = useBible();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  const plans = app.plans();
  const plan = plans.find((p) => p.id === planId);
  const items = app.planItems(planId);
  const progress = app.planProgress(planId);

  if (!plan) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Plan not found.</p>
        <button
          className="mt-4 text-sm text-primary hover:underline"
          onClick={() => navigate('/plans')}
        >
          Back to plans
        </button>
      </div>
    );
  }

  // Group items by day
  const dayMap = new Map<number, ReadingPlanItem[]>();
  for (const item of items) {
    const existing = dayMap.get(item.dayNumber);
    if (existing) existing.push(item);
    else dayMap.set(item.dayNumber, [item]);
  }
  const days = Array.from(dayMap.entries()).sort((a, b) => a[0] - b[0]);

  // Today's day (relative to start date)
  const todayDayNumber = plan.startDate
    ? Math.floor((Date.now() - plan.startDate) / (1000 * 60 * 60 * 24)) + 1
    : null;

  const handleToggle = (itemId: number) => {
    const isComplete = progress.has(itemId);
    startTransition(async () => {
      if (isComplete) {
        await app.markItemIncomplete(planId, itemId);
      } else {
        await app.markItemComplete(planId, itemId);
      }
      app.planProgress.invalidate(planId);
    });
  };

  const handleSetStartDate = () => {
    startTransition(async () => {
      await app.setPlanStartDate(planId, Date.now());
      app.plans.invalidateAll();
    });
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          onClick={() => navigate('/plans')}
        >
          <ChevronLeft className="size-4" />
          Back to plans
        </button>
        <h1 className="font-sans text-2xl font-semibold text-foreground text-balance">
          {plan.name}
        </h1>
        {plan.description && (
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
        )}
        {!plan.startDate && (
          <button
            className="mt-2 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 rounded transition-colors"
            onClick={handleSetStartDate}
          >
            Start today
          </button>
        )}
      </header>

      <div className="space-y-4">
        {days.map(([day, dayItems]) => {
          const isToday = todayDayNumber === day;
          const allDone = dayItems.every((i) => progress.has(i.id));

          return (
            <div
              key={day}
              className={`rounded-lg border p-4 ${
                isToday
                  ? 'border-primary/50 bg-primary/5'
                  : allDone
                    ? 'border-border bg-accent/30'
                    : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-foreground">Day {day}</span>
                {isToday && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Today
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {dayItems.map((item) => {
                  const isDone = progress.has(item.id);
                  const book = bible.getBook(item.book);
                  const label =
                    item.label ??
                    `${book?.name ?? `Book ${item.book}`} ${item.startChapter}${
                      item.endChapter ? `\u2013${item.endChapter}` : ''
                    }`;

                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <button
                        className={`size-5 rounded border flex items-center justify-center transition-colors ${
                          isDone
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border hover:border-foreground/40'
                        }`}
                        onClick={() => handleToggle(item.id)}
                        disabled={isPending}
                        role="checkbox"
                        aria-checked={isDone}
                        aria-label={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                      >
                        {isDone && <Check className="size-3" />}
                      </button>
                      <span
                        className={`text-sm flex-1 ${
                          isDone ? 'text-muted-foreground line-through' : 'text-foreground'
                        }`}
                      >
                        {label}
                      </span>
                      <button
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                        onClick={() => {
                          if (book) {
                            navigate(`/bible/${toBookSlug(book.name)}/${item.startChapter}`);
                          }
                        }}
                        aria-label="Read chapter"
                      >
                        <BookOpen className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
