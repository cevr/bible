// The film's findings on Choices: the check after the last write
// and the sound check after the last pick or knob, read when asked for and
// never over the player. Show findings (⌘K, the page's long-press menu)
// opens the Findings sheet, in the one sheet frame (`Sheet`: beside the page
// on a laptop, a bottom sheet swiped down on a phone), with both checks as
// groups, each finding's time a button that moves the clock to it. F and ⇧F
// walk the clock to the next or previous finding with a time, as they do in
// the lab. Until the check answers its group says it is checking, with no
// count, and a check that failed says so: only an answer counts as clean.

import { useAtomValue } from '@bible/atom-solid';
import { Place, UrlState } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Effect, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, onCleanup } from 'solid-js';
import { type Command, quietly } from '../../../command/command.ts';
import { type Toward, walkFrom } from '../../../command/walk.ts';
import type { CheckLine } from '../../../core/schema.ts';
import { timecode } from '../../../core/time.ts';
import type { LabFailure } from '../../api.ts';
import { useReview } from '../context.tsx';
import { failedText } from '../format.ts';
import { Sheet, useSheetDismissal } from '../../sheet.tsx';
import { SyncEvent } from '../machine.ts';
import { useFilm } from './context.tsx';

/**
 * A check's name and where it stands: still checking, failed, or what it
 * found. Only a check that answered has found anything: one still running,
 * or one that failed, is never clean.
 */
interface Check {
  readonly name: string;
  readonly result: AsyncResult.AsyncResult<ReadonlyArray<CheckLine>, LabFailure>;
}

/** What `check` found, once it has answered: none while it runs, nor once it failed. */
const found = (check: Check): Option.Option<ReadonlyArray<CheckLine>> =>
  Option.filter(AsyncResult.value(check.result), () => !AsyncResult.isFailure(check.result));

/** How many findings `check` has, as its group is marked: none until it answers. */
const countOf = (check: Check): Option.Option<string> =>
  Option.map(found(check), (lines) => String(lines.length));

/** What `check` found: nothing until it answers. */
const foundBy = (check: Check): ReadonlyArray<CheckLine> =>
  Option.getOrElse(found(check), () => []);

/** Where `check` stands before it has found anything: running, or failed. */
const unanswered = (check: Check): Option.Option<'checking' | 'failed'> =>
  Option.match(found(check), {
    onSome: () => Option.none(),
    onNone: () =>
      Option.some(
        Bool.match(AsyncResult.isFailure(check.result), {
          onTrue: () => 'failed' as const,
          onFalse: () => 'checking' as const,
        }),
      ),
  });

/** The film second a finding starts at, when it has one. */
const timeOf = (finding: CheckLine): Option.Option<number> =>
  Option.flatMap(Option.fromUndefinedOr(finding.address), (at) => Option.fromUndefinedOr(at.time));

/** Where the Findings sheet's open state lives, and how it is raised and dropped. */
interface FindingsSheet {
  readonly open: Accessor<boolean>;
  readonly show: () => void;
  readonly close: () => void;
}

/**
 * The Findings sheet kept in the page's URL (`?findings=1`), as every other
 * sheet is: raising it is a step of its own, so Back closes it, and Close,
 * Escape and a swipe drop it by the one rule (`useSheetDismissal`); a link
 * naming it opens it.
 */
export const useFindingsPlace = <A extends { readonly query: { readonly findings: boolean } }>(
  place: Place.Place<A>,
): FindingsSheet => {
  const { meta } = useReview();
  const at = useAtomValue(() => UrlAtom.place(place));
  const dismissal = useSheetDismissal(meta.host, (href) =>
    Option.exists(Place.decode(place, href), (v) => v.query.findings),
  );
  const now = () => Effect.runSyncWith(meta.host)(UrlState.get(place));
  const write = (findings: boolean) => {
    for (const v of Option.toArray(now()))
      Effect.runSyncWith(meta.host)(UrlState.set(place, { ...v, query: { ...v.query, findings } }));
  };
  const open = () => Option.exists(at(), (v) => v.query.findings);
  return {
    open,
    show: () => {
      if (open()) return;
      dismissal.opening('findings');
      write(true);
    },
    close: () =>
      dismissal.dismiss(() =>
        Option.map(
          Option.filter(now(), (v) => v.query.findings),
          (v) => Place.href(place, { ...v, query: { ...v.query, findings: false } }),
        ),
      ),
  };
};

/**
 * The film's findings sheet, Show findings and F/⇧F. Its open
 * state is the page's URL's (`sheet`: `useFindingsPlace`), its one owner.
 */
export const Findings = (props: { readonly sheet: FindingsSheet }) => {
  const { meta } = useReview();
  const { findings, soundCheck, picture, sync, send } = useFilm();
  const open = () => props.sheet.open();
  // The sound check shows once it has found something (it runs after a pick or a knob; its
  // receipt says while it runs, and why it failed).
  const checks = (): ReadonlyArray<Check> => [
    { name: 'check', result: findings() },
    ...Option.toArray(
      Option.map(AsyncResult.value(soundCheck()), (s) => ({
        name: 'sound check',
        result: AsyncResult.success(s.findings),
      })),
    ),
  ];
  const times = () => checks().flatMap((c) => foundBy(c).flatMap((f) => Option.toArray(timeOf(f))));
  const seek = (t: number) => {
    send(SyncEvent.ScrubMoved({ t }));
    send(SyncEvent.ScrubReleased);
  };
  // F and ⇧F move the clock only while there is a picture on it.
  const walk = (toward: Toward) =>
    Option.flatMap(picture(), () => walkFrom(times(), (t) => t, sync().t, toward));
  const walkCommand = (toward: Toward, label: string, key: string): Command => ({
    id: `check.finding-${toward}`,
    label,
    group: 'Check',
    keys: [key],
    about: ['Page'],
    touch: "Show findings, then tap a finding's time",
    when: () => Option.isSome(walk(toward)),
    run: quietly(() => Option.map(walk(toward), seek)),
  });
  onCleanup(
    meta.hub.commands.register(
      {
        id: 'review.findings',
        label: 'Show findings',
        group: 'View',
        about: ['Page'],
        touch: 'long-press the page, then Show findings',
        when: () => !open(),
        run: quietly(() => props.sheet.show()),
      },
      walkCommand('next', 'Next finding', 'f'),
      walkCommand('previous', 'Previous finding', 'shift+f'),
    ),
  );
  return (
    <Show when={open()}>
      <Sheet
        host={meta.host}
        hub={meta.hub}
        role="findings"
        title="Findings"
        initialFocus={() => true}
        onClose={() => props.sheet.close()}
      >
        <For each={checks()} keyed={(c) => c.name}>
          {(check) => (
            <section
              class="rv-group"
              data-check={check().name}
              data-findings={Option.getOrUndefined(countOf(check()))}
            >
              <h3>
                {check().name}{' '}
                <Show when={Option.getOrUndefined(countOf(check()))}>
                  {(n) => <span class="lab-count">{n()}</span>}
                </Show>
              </h3>
              <Show when={Option.getOrUndefined(unanswered(check()))}>
                {(state) => (
                  <p class="rv-hint" data-state={state()}>
                    {Match.value(state()).pipe(
                      Match.when('checking', () => 'checking…'),
                      Match.orElse(() => `failed: ${failedText(check().result)}`),
                    )}
                  </p>
                )}
              </Show>
              <ul class="rv-findings">
                <For each={foundBy(check())}>
                  {(f) => (
                    <li data-level={f.level}>
                      <Show when={Option.getOrUndefined(timeOf(f))}>
                        {(t) => (
                          <button
                            type="button"
                            class="rv-at"
                            data-at={String(t())}
                            disabled={Option.isNone(picture())}
                            onClick={() => seek(t())}
                          >
                            {timecode(t())}
                          </button>
                        )}
                      </Show>{' '}
                      <b>{f.tag}</b> {f.message}
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </Sheet>
    </Show>
  );
};
