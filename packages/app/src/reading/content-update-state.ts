/** What the two visual hosts say about topic content (§3.6, Milestone 9).
 *
 *  §3.6 asks for two surfaces — "a non-blocking toast and a settings entry" —
 *  and §10 M9 asks that they be **identical on web and desktop**. Identical is
 *  not something two `.tsx` files can be; it is something one function can be.
 *  So the whole of what either host shows is decided here, from the one
 *  `ContentStatus` both hosts get from `v1.content.status`, and the components
 *  render the result without adding a word to it.
 *
 *  Everything is a plain function of an immutable value. The plan a component
 *  memoizes is a snapshot, never a live signal read inside JSX: a toast whose
 *  text was recomputed mid-render could show one version in its heading and
 *  another in its button, which is the exact drift the parity rule exists to
 *  prevent.
 *
 *  It lives here rather than inside a component for the reason
 *  `study-pane-state.ts` does: this package's tests run under plain Bun with no
 *  DOM, and Solid 2 compiles JSX with a Babel transform rather than shipping a
 *  runtime factory. What the *markup* does — that the toast does not trap focus
 *  and the settings entry is reachable — is asserted against the compiled
 *  renderer in `apps/desktop/e2e/content-update.spec.ts`.
 */

import type {
  ContentDecision,
  ContentStatus,
  ContentUpdateOutcome,
} from '@bible/core/content-update';
import { Match, Option } from 'effect';

/** How urgently a surface presents itself.
 *
 *  `notice` is the only level that raises a toast. §3.6 calls it non-blocking,
 *  and the operative half of that is *which* states are allowed to interrupt at
 *  all: an offer is worth a line the reader can ignore, and being current, being
 *  offline, or holding content this build cannot read are not — they are facts
 *  the settings entry carries for whoever goes looking. */
export type ContentTone = 'quiet' | 'notice';

/** One rendered content view: everything either host puts on screen.
 *
 *  A single record rather than a handful of accessors, because a component that
 *  asked four questions could answer them against four different reads. This is
 *  the snapshot. */
export interface ContentView {
  /** The settings entry's one-line summary. Always present — the entry exists
   *  in every state, including the states with nothing to do. */
  readonly summary: string;
  /** The toast's text, or `None` when this state does not raise one. */
  readonly toast: Option.Option<string>;
  readonly tone: ContentTone;
  /** Whether the settings entry offers an "Update now" control. Only an offer
   *  does: there is nothing to install when the answer is current, offline, or
   *  refused, and a button that ran an update which then declined would read as
   *  a broken control rather than as an honest report. */
  readonly canUpdate: boolean;
}

/** The installed version, as a reader-facing phrase.
 *
 *  "none installed" rather than an empty string or a dash: the state is
 *  ordinary — every install has it until the first content release — and a
 *  blank where a version belongs reads as a bug rather than as a fact. */
const installedPhrase = (installed: ContentStatus['installed']): string =>
  Option.match(installed, {
    onNone: () => 'none installed',
    onSome: (revision) => `${String(revision)} installed`,
  });

/** The view for one decision, exhaustive over §3.6's four cases.
 *
 *  `Match.tagsExhaustive` over `_tag` rather than a lookup keyed by string:
 *  adding a decision to §3.6 is then a compile error here until both hosts have
 *  been told what to show for it. */
const viewFor = (decision: ContentDecision, installed: string): ContentView =>
  Match.value(decision).pipe(
    Match.tagsExhaustive({
      offer: (offer): ContentView => ({
        summary: `Topic content: ${installed}, ${String(offer.entry.revision)} available`,
        // §3.6's own example sentence. The only state that interrupts.
        toast: Option.some(
          `Topic content: ${installed}, ${String(offer.entry.revision)} available`,
        ),
        tone: 'notice',
        canUpdate: true,
      }),
      'up-to-date': (): ContentView => ({
        summary: `Topic content: ${installed}, up to date`,
        toast: Option.none(),
        tone: 'quiet',
        canUpdate: false,
      }),
      // Names the version *and* the remedy. A refusal that said only "refused"
      // would leave the reader with a state they cannot act on and no idea that
      // updating the app is what clears it.
      refused: (refused): ContentView => ({
        summary: `Topic content: ${installed}. ${String(refused.available.revision)} needs a newer app version.`,
        toast: Option.none(),
        tone: 'quiet',
        canUpdate: false,
      }),
      // §3.6: the pinned floor stands and this is not an error. Said as a
      // fact about the *check*, not about the content — the content is working.
      offline: (): ContentView => ({
        summary: `Topic content: ${installed}. Could not check for updates.`,
        toast: Option.none(),
        tone: 'quiet',
        canUpdate: false,
      }),
    }),
  );

/** The one entry point both hosts call.
 *
 *  Pure and total over `ContentStatus`, so the toast and the settings entry on
 *  web and on desktop are the same four strings by construction rather than by
 *  four files agreeing. */
export const contentView = (status: ContentStatus): ContentView =>
  viewFor(status.decision, installedPhrase(status.installed));

/** What an `update` run reports back, as the line the settings entry replaces
 *  its status with.
 *
 *  Separate from {@link contentView} because it answers a different question:
 *  not "what state is this host in" but "what did the run just do".
 *
 *  It takes the whole outcome rather than only `activated`, because "nothing
 *  was activated" has **two** meanings and only one of them is good news. On a
 *  host that already holds a generation it is the mismatch posture: §3.6's
 *  "leaves the installed version active", and nothing failed. On a host whose
 *  *first* install just failed there is nothing installed at all, and telling
 *  that reader their content is still active is simply false (round-4 B3). The
 *  post-run `status.installed` is what tells the two apart, and it is already
 *  in the value. */
export const activationSummary = (outcome: ContentUpdateOutcome): string =>
  Option.match(outcome.activated, {
    onNone: () => unactivatedSummary(outcome.status),
    onSome: (revision) => `Installed ${String(revision)}.`,
  });

const unactivatedSummary = (status: ContentStatus): string => {
  if (Option.isNone(status.installed)) {
    return 'No content was installed — this update did not complete, and no content is active.';
  }
  return 'No new content was activated — your installed content is still active.';
};
