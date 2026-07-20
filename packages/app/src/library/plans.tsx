import {
  LibraryEntityId,
  type LibraryStateCommand,
  type ReadingPlan,
} from '@bible/core/library-state';
import { A, useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { DateTime, Effect, Schema } from 'effect';
import { createSignal } from 'solid-js';

import { ReaderFailure, ReaderLoading } from '../reading/index.js';
import { useCapabilities } from '../application/capabilities-context.js';
import { failureCategory, useReadingData } from '../runtime/index.js';
import { Button, Input } from '../ui/index.js';

export interface PlansProps {
  readonly planId?: string;
}

const failureMessage = (cause: unknown): string => {
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return message.replace(/\s+/g, ' ').trim();
};

const plansHeading = (planId: string | undefined): string => {
  if (planId !== undefined) return 'Reading plan';
  return 'Plans';
};

export const Plans = (props: PlansProps) => {
  const data = useReadingData();
  const capabilities = useCapabilities();
  const navigate = useNavigate();
  const plans = () => data.readingPlans.get()();
  const selectedPlan = () => plans().find((plan) => plan.id === props.planId);
  const [title, setTitle] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [stepTitle, setStepTitle] = createSignal('');
  const [stepRoute, setStepRoute] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();

  const mutate = (
    operation: 'save' | 'delete' | 'progress',
    command: LibraryStateCommand,
    onSuccess?: () => void,
  ) => {
    setBusy(true);
    setFailure(undefined);
    void data.readingPlans.mutate(command).then(
      () => {
        setBusy(false);
        onSuccess?.();
      },
      (cause: unknown) => {
        const message = failureMessage(cause);
        Effect.runFork(
          Effect.logError(
            `[plans] mutation-failed operation=${operation} category=${failureCategory(cause)}`,
          ),
        );
        setFailure(message);
        setBusy(false);
      },
    );
  };

  const createPlan = (event: SubmitEvent) => {
    event.preventDefault();
    const planTitle = title().trim();
    const firstStepTitle = stepTitle().trim();
    const firstStepRoute = stepRoute().trim();
    if (planTitle.length === 0 || firstStepTitle.length === 0 || firstStepRoute.length === 0)
      return;
    const identity = capabilities.identity;
    if (identity === undefined) {
      setFailure('This platform cannot create reading plans because identity is unavailable.');
      return;
    }

    const id = Schema.decodeUnknownSync(LibraryEntityId)(identity.randomUuid());
    mutate(
      'save',
      {
        _tag: 'SaveReadingPlan',
        id,
        title: planTitle,
        description: description().trim() || null,
        steps: [{ id: identity.randomUuid(), title: firstStepTitle, route: firstStepRoute }],
      },
      () => {
        setTitle('');
        setDescription('');
        setStepTitle('');
        setStepRoute('');
        navigate(`/plans/${encodeURIComponent(id)}`);
      },
    );
  };

  const removePlan = (plan: ReadingPlan) =>
    mutate('delete', { _tag: 'DeleteReadingPlan', id: plan.id }, () => navigate('/plans'));

  const toggleStep = (plan: ReadingPlan, stepId: string) => {
    const progress = plan.progress.find((entry) => entry.stepId === stepId);
    let completedAt: string | null = DateTime.formatIso(Effect.runSync(DateTime.now));
    if (progress?.completedAt) completedAt = null;
    mutate('progress', {
      _tag: 'SetReadingPlanProgress',
      planId: plan.id,
      stepId,
      completedAt,
    });
  };

  return (
    <article class="bible-library bible-plans">
      <header class="bible-reader__heading bible-library__heading">
        <p class="bible-reader__eyebrow">A steady path through Scripture</p>
        <h1>{plansHeading(props.planId)}</h1>
      </header>
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Loading reading plans" />}>
          <Show
            when={props.planId}
            fallback={
              <>
                <Show
                  when={plans().length > 0}
                  fallback={
                    <section class="bible-library__empty" aria-labelledby="plans-empty-title">
                      <p class="bible-reader__eyebrow">Begin simply</p>
                      <h2 id="plans-empty-title">No reading plans yet</h2>
                      <p>Create a plan below with the first passage you want to read.</p>
                    </section>
                  }
                >
                  <section aria-labelledby="plans-list-title">
                    <h2 id="plans-list-title">Your plans</h2>
                    <ul class="bible-library-list">
                      <For each={plans()}>
                        {(plan) => {
                          const completed = () =>
                            plan.progress.filter((entry) => entry.completedAt !== null).length;
                          return (
                            <li>
                              <A href={`/plans/${encodeURIComponent(plan.id)}`}>
                                <strong>{plan.title}</strong>
                                <span>
                                  {completed()} of {plan.steps.length} complete
                                </span>
                              </A>
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                  </section>
                </Show>
                <PlanForm
                  title={title()}
                  description={description()}
                  stepTitle={stepTitle()}
                  stepRoute={stepRoute()}
                  busy={busy()}
                  setTitle={setTitle}
                  setDescription={setDescription}
                  setStepTitle={setStepTitle}
                  setStepRoute={setStepRoute}
                  submit={createPlan}
                />
              </>
            }
          >
            <Show
              when={selectedPlan()}
              fallback={
                <section class="bible-library__empty" role="status">
                  <p class="bible-reader__eyebrow">Plan not found</p>
                  <h2>This reading plan is no longer in your library.</h2>
                  <A href="/plans">Return to plans</A>
                </section>
              }
            >
              {(plan) => {
                const completed = () =>
                  plan().progress.filter((entry) => entry.completedAt !== null).length;
                return (
                  <section class="bible-library-detail" aria-labelledby="plan-title">
                    <A href="/plans">All plans</A>
                    <div>
                      <p class="bible-reader__eyebrow">
                        {completed()} of {plan().steps.length} complete
                      </p>
                      <h2 id="plan-title">{plan().title}</h2>
                      <Show when={plan().description}>{(value) => <p>{value()}</p>}</Show>
                    </div>
                    <ol class="bible-plan-steps">
                      <For each={plan().steps}>
                        {(step) => {
                          const isComplete = () =>
                            plan().progress.some(
                              (entry) => entry.stepId === step.id && entry.completedAt !== null,
                            );
                          return (
                            <li>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={isComplete()}
                                  disabled={busy()}
                                  onChange={() => toggleStep(plan(), step.id)}
                                />
                                <span>{step.title}</span>
                              </label>
                              <A href={step.route}>Read</A>
                            </li>
                          );
                        }}
                      </For>
                    </ol>
                    <Button disabled={busy()} onClick={() => removePlan(plan())}>
                      Delete plan
                    </Button>
                  </section>
                );
              }}
            </Show>
          </Show>
          <MutationStatus busy={busy()} failure={failure()} />
        </Loading>
      </Errored>
    </article>
  );
};

const PlanForm = (props: {
  readonly title: string;
  readonly description: string;
  readonly stepTitle: string;
  readonly stepRoute: string;
  readonly busy: boolean;
  readonly setTitle: (value: string) => void;
  readonly setDescription: (value: string) => void;
  readonly setStepTitle: (value: string) => void;
  readonly setStepRoute: (value: string) => void;
  readonly submit: (event: SubmitEvent) => void;
}) => (
  <section class="bible-library-form" aria-labelledby="new-plan-title">
    <p class="bible-reader__eyebrow">New plan</p>
    <h2 id="new-plan-title">Choose your next passage</h2>
    <form onSubmit={props.submit}>
      <label>
        <span>Plan title</span>
        <Input
          required
          value={props.title}
          onInput={(event) => props.setTitle(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>
          Description <small>(optional)</small>
        </span>
        <Input
          value={props.description}
          onInput={(event) => props.setDescription(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>First reading</span>
        <Input
          required
          value={props.stepTitle}
          placeholder="John 3"
          onInput={(event) => props.setStepTitle(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Reading route</span>
        <Input
          required
          value={props.stepRoute}
          placeholder="/bible/43/3"
          onInput={(event) => props.setStepRoute(event.currentTarget.value)}
        />
      </label>
      <Button type="submit" tone="accent" disabled={props.busy}>
        Create plan
      </Button>
    </form>
  </section>
);

const MutationStatus = (props: { readonly busy: boolean; readonly failure?: string }) => (
  <>
    <Show when={props.busy}>
      <p class="bible-form-status" role="status">
        Saving…
      </p>
    </Show>
    <Show when={props.failure}>
      {(message) => (
        <p class="bible-form-status bible-form-status--error" role="alert">
          {message()}
        </p>
      )}
    </Show>
  </>
);
