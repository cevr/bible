/** §3.6's non-blocking toast, on both visual hosts.
 *
 *  Mounted once by the shell, beside the command palette, so a reader is told
 *  that newer topic content exists wherever they happen to be — and told once,
 *  rather than by every surface that reads a topic page.
 *
 *  **Non-blocking is structural here, not a promise.** It is a `role="status"`
 *  live region, which announces without moving focus; it takes no focus, traps
 *  none, and renders after `<main>` so it is last in the tab order. A reader who
 *  never looks at it is never stopped by it, and a screen-reader user hears it
 *  without losing their place.
 *
 *  **Nothing here decides what to say.** The line comes from `contentView` in
 *  `../reading/content-update-state.js`, which is what makes §10 M9's "identical
 *  toast on web and desktop" a property of one function rather than of two
 *  files agreeing. The plan is memoized from the settled status — an immutable
 *  snapshot, never a live read inside JSX.
 */

import { Errored, Loading, Show } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';
import { Option } from 'effect';

import { contentView } from '../reading/content-update-state.js';
import { useContentStatus } from '../runtime/index.js';

const ToastBody = () => {
  const status = useContentStatus();
  const [dismissed, setDismissed] = createSignal(false);

  /** The snapshot the line and the link both read. */
  const view = createMemo(() => contentView(status()));

  /** Only §3.6's `notice` tone raises a toast, and only until the reader waves
   *  it away. Being current, being offline, or holding content this build
   *  cannot read are facts for the settings entry, not interruptions. */
  const line = createMemo(() => {
    if (dismissed()) return Option.none<string>();
    if (view().tone !== 'notice') return Option.none<string>();
    return view().toast;
  });

  return (
    <Show when={Option.getOrUndefined(line())}>
      {(message) => (
        <div class="bible-content-toast" role="status">
          <p class="bible-form-status">{message()}</p>
          {/* Straight to the entry that can act on it — the toast reports, the
              settings section installs. */}
          <a href="/settings/content">Review</a>
          <button type="button" onClick={() => setDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}
    </Show>
  );
};

/** The toast with its own boundaries, both of which render nothing.
 *
 *  A manifest read that is slow or that fails must not put a spinner or an error
 *  panel in the reader's chrome: §3.6 makes "we could not check" a state the
 *  settings entry reports, and the whole point of this surface is that it is
 *  ignorable. So while the status is unsettled, and if reading it fails outright,
 *  the shell shows nothing at all. */
export const ContentUpdateToast = () => (
  <Errored fallback={() => <></>}>
    <Loading fallback={<></>}>
      <ToastBody />
    </Loading>
  </Errored>
);
