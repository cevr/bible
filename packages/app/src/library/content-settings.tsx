/** §3.6's settings entry, on both visual hosts.
 *
 *  Its own component rather than another arm inside `settings.tsx`, for one
 *  structural reason: `useContentStatus` suspends, and Settings' other sections
 *  must not wait on a network manifest read to render. A component boundary is
 *  where that suspension is scoped.
 *
 *  **Nothing here decides what to say.** Every string comes from
 *  `contentView` / `activationSummary` in
 *  `../reading/content-update-state.js`, which is what makes §10 M9's "identical
 *  settings entry on web and desktop" a property of one function rather than of
 *  two files agreeing. The plan is memoized from the settled status — an
 *  immutable snapshot, never a live read inside JSX, so a heading and a button
 *  in the same render cannot describe two different versions.
 */

import { Errored, Loading, Show } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';
import { Option } from 'effect';

import { failureCategory, failureMessage } from '@bible/core/observability';
import { ReaderFailure, ReaderLoading } from '../reading/index.js';
import { activationSummary, contentView } from '../reading/content-update-state.js';
import { useContentStatus, useContentUpdate } from '../runtime/index.js';
import { Button } from '../ui/index.js';

const ContentEntry = () => {
  const status = useContentStatus();
  const runUpdate = useContentUpdate();
  const [running, setRunning] = createSignal(false);
  const [outcome, setOutcome] = createSignal(Option.none<string>());
  const [failure, setFailure] = createSignal(Option.none<string>());

  /** The snapshot both the heading and the button read. One memo, so they
   *  cannot disagree about a version within a render. */
  const view = createMemo(() => contentView(status()));

  const update = (): void => {
    setRunning(true);
    setOutcome(Option.none());
    setFailure(Option.none());
    void runUpdate()
      .then((result) => {
        setRunning(false);
        setOutcome(Option.some(activationSummary(result)));
      })
      .catch((cause: unknown) => {
        setRunning(false);
        setFailure(Option.some(`${failureMessage(cause)} (${failureCategory(cause)})`));
      });
  };

  return (
    <section class="bible-settings__section bible-settings__notice">
      <div>
        <p class="bible-reader__eyebrow">Topic content</p>
        <h2>Runtime updates</h2>
        <p>{view().summary}</p>
      </div>
      <Show when={view().canUpdate}>
        <div class="bible-settings__data-actions">
          <Button onClick={update} disabled={running()}>
            Update now
          </Button>
        </div>
      </Show>
      <Show when={Option.getOrUndefined(outcome())}>
        {(message) => (
          <p class="bible-form-status" role="status">
            {message()}
          </p>
        )}
      </Show>
      <Show when={Option.getOrUndefined(failure())}>
        {(message) => (
          <p class="bible-form-status bible-form-status--error" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </section>
  );
};

/** The entry with its own boundaries.
 *
 *  A manifest read that is slow or that fails is a fact about *this* section and
 *  nothing else — the rest of Settings has no dependency on it — so the
 *  boundaries sit here rather than around the page. */
export const ContentSettings = () => (
  <Errored fallback={(error) => <ReaderFailure error={error()} />}>
    <Loading fallback={<ReaderLoading label="Checking topic content" />}>
      <ContentEntry />
    </Loading>
  </Errored>
);
