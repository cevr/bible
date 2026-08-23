/** The content-update surfaces, asserted where they are decidable.
 *
 *  There is no DOM here and no rendered component: Solid 2 compiles JSX with a
 *  Babel transform rather than shipping a runtime factory, so mounting a
 *  component under plain `bun test` needs a transform this package does not run.
 *  What the *markup* does — the toast appearing without stealing focus, the
 *  settings entry being reachable — is asserted against the compiled renderer in
 *  `apps/desktop/e2e/content-update.spec.ts`.
 *
 *  What is left here is the part that is a decision rather than a rendering, and
 *  it is the part §10 M9's parity rule is actually about: web and desktop show
 *  the same words because they call the same function, and these tests are what
 *  pin those words down.
 */

import {
  ContentFloor,
  ContentManifestEntry,
  ContentStatus,
  ContentUpdateOutcome,
} from '@bible/core/content-update';
import { corpusGeneration, corpusRevision } from '@bible/core/corpus-supply';
import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { activationSummary, contentView } from './content-update-state.js';

const entry = ContentManifestEntry.make({
  revision: corpusRevision('content-v4'),
  url: 'https://example.test/topics.db',
  sha256: `sha256:${'a'.repeat(64)}`,
  size: 16_384,
  schema_major: 1,
  // §3.6's ordinal. Above the floor below, so this entry is a genuine offer
  // rather than a fixture the policy would have declined.
  generation: corpusGeneration(4),
});

const statusWith = (input: {
  readonly installed: Option.Option<string>;
  readonly decision: ContentStatus['decision'];
}): ContentStatus =>
  ContentStatus.make({
    corpus: 'topics',
    installed: Option.map(input.installed, corpusRevision),
    // The view under test renders revisions, not generations — these carry the
    // ordering the policy already applied upstream.
    installedGeneration: Option.map(input.installed, () => corpusGeneration(3)),
    floor: ContentFloor.make({
      pinned: Option.none(),
      pinnedGeneration: Option.none(),
      schemaMajor: 1,
    }),
    decision: input.decision,
  });

describe('the content-update surfaces', () => {
  test('an offer is the one state that raises a toast', () => {
    const view = contentView(
      statusWith({ installed: Option.some('content-v3'), decision: { _tag: 'offer', entry } }),
    );

    // §3.6's own example sentence, both versions in it.
    expect(Option.getOrNull(view.toast)).toBe(
      'Topic content: content-v3 installed, content-v4 available',
    );
    expect(view.tone).toBe('notice');
    // And the settings entry offers the control that acts on it.
    expect(view.canUpdate).toBe(true);
  });

  test('being up to date says so and interrupts nobody', () => {
    const view = contentView(
      statusWith({ installed: Option.some('content-v4'), decision: { _tag: 'up-to-date' } }),
    );

    expect(Option.isNone(view.toast)).toBe(true);
    expect(view.tone).toBe('quiet');
    expect(view.canUpdate).toBe(false);
    expect(view.summary).toContain('up to date');
  });

  test('a refusal names the version and the remedy', () => {
    const view = contentView(
      statusWith({
        installed: Option.some('content-v3'),
        decision: { _tag: 'refused', reason: 'schema-major', available: entry },
      }),
    );

    // The two facts a reader can act on. A refusal rendered as a bare tag would
    // leave them with a state and no idea what clears it.
    expect(view.summary).toContain('content-v4');
    expect(view.summary).toContain('newer app version');
    // And never an "Update now" button: pressing it would run an update that
    // then declined, which reads as a broken control rather than a report.
    expect(view.canUpdate).toBe(false);
    expect(Option.isNone(view.toast)).toBe(true);
  });

  test('offline reports the check, not the content', () => {
    const view = contentView(
      statusWith({
        installed: Option.some('content-v3'),
        decision: { _tag: 'offline', detail: 'manifest unreachable: TransportError' },
      }),
    );

    // §3.6: the pinned floor stands and this is not an error. The installed
    // version is still named, because it is still working.
    expect(view.summary).toContain('content-v3 installed');
    expect(view.summary).toContain('Could not check');
    expect(view.tone).toBe('quiet');
    expect(view.canUpdate).toBe(false);
  });

  test('a host with nothing installed says so rather than leaving a blank', () => {
    const view = contentView(
      statusWith({ installed: Option.none(), decision: { _tag: 'offer', entry } }),
    );

    expect(view.summary).toContain('none installed');
    expect(Option.getOrNull(view.toast)).toBe(
      'Topic content: none installed, content-v4 available',
    );
  });

  test('an update that activated nothing says the installed content still works', () => {
    // The mismatch posture at the reader's seam: §10 M9 makes a digest or size
    // mismatch leave the installed generation active, and the sentence a reader
    // gets has to say that rather than reading as a failure.
    expect(
      activationSummary(
        ContentUpdateOutcome.make({
          status: statusWith({
            installed: Option.some('content-v3'),
            decision: { _tag: 'up-to-date' },
          }),
          activated: Option.none(),
        }),
      ),
    ).toContain('still active');
    expect(
      activationSummary(
        ContentUpdateOutcome.make({
          status: statusWith({
            installed: Option.some('content-v4'),
            decision: { _tag: 'up-to-date' },
          }),
          activated: Option.some(corpusRevision('content-v4')),
        }),
      ),
    ).toBe('Installed content-v4.');
  });

  /** The same "nothing activated" value on a host that has **nothing
   *  installed** — a first install that failed. Telling that reader their
   *  installed content is still active is false: there is none (round-4 B3). */
  test('a failed first install does not claim installed content is still active', () => {
    const summary = activationSummary(
      ContentUpdateOutcome.make({
        status: statusWith({ installed: Option.none(), decision: { _tag: 'offer', entry } }),
        activated: Option.none(),
      }),
    );

    expect(summary).not.toContain('still active');
    expect(summary).toContain('no content is active');
  });
});
