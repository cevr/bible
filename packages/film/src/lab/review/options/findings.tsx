// The film's findings on Choices and Project: the check after the last write
// and the sound check after the last pick or knob, read when asked for and
// never over the player. Show findings (⌘K, the page's long-press menu)
// opens the Findings sheet, in the one sheet frame (`Sheet`: beside the page
// on a laptop, a bottom sheet swiped down on a phone), with both checks as
// groups, each finding's time a button that moves the clock to it. F and ⇧F
// walk the clock to the next or previous finding with a time, as they do in
// the lab. At rest only Project shows each check's count, a chip in the
// film's panel that opens the sheet too (design language §7); Choices keeps
// the sheet, its command and its keys. Until the check answers its chip and
// its group say it is checking, with no count, and a check that failed says
// so: only an answer counts as clean.

import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createSignal, onCleanup } from 'solid-js';
import { type Command, quietly } from '../../../command/command.ts';
import { type Toward, walkFrom } from '../../../command/walk.ts';
import type { CheckLine } from '../../../core/schema.ts';
import { timecode } from '../../../core/time.ts';
import type { LabFailure } from '../../api.ts';
import { useReview } from '../context.tsx';
import { failedText } from '../format.ts';
import { Sheet } from '../../sheet.tsx';
import { SyncEvent } from '../machine.ts';
import { useFilm } from './context.tsx';
import { countState } from '../../scenes/marks.ts';
import { findingsText } from './receipt.ts';

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

/** How many findings `check` has, as its chip and group are marked: none until it answers. */
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

/**
 * A check's chip's state: still checking, failed, clean, warnings only, or
 * an error among them (`countState`, the one count of the check Scenes'
 * legend and chips read too).
 */
const stateOf = (check: Check): 'checking' | 'failed' | 'clean' | 'warning' | 'findings' =>
  Option.getOrElse(unanswered(check), () =>
    Option.getOrElse(countState(foundBy(check)), () => 'clean' as const),
  );

/**
 * A check's chip as the film's panel on Project says it (design language
 * §7): the check's own findings by their count alone (`21 findings`, `no
 * findings`), another check by its name too (`sound check: clean`).
 */
const countText = (name: string, n: number): string =>
  Match.value({ name, n }).pipe(
    Match.when({ name: 'check', n: 0 }, () => 'no findings'),
    Match.when({ name: 'check', n: 1 }, () => '1 finding'),
    Match.when({ name: 'check' }, () => `${n} findings`),
    Match.orElse(() => findingsText(name, n)),
  );

/** What a check that has not answered says: `checking…` or `check failed`. */
const unansweredText = (name: string, state: 'checking' | 'failed'): string =>
  Match.value(state).pipe(
    Match.when('checking', () => 'checking…'),
    Match.orElse(() => `${name} failed`),
  );

/** What `check`'s chip says: still checking, failed, or what it found. */
const chipText = (check: Check) =>
  Option.match(unanswered(check), {
    onSome: (state) => unansweredText(check.name, state),
    onNone: () => countText(check.name, foundBy(check).length),
  });

/**
 * The film's findings sheet, Show findings and F/⇧F; with `chips`, the
 * count chips that open the sheet too (the film panel's on Project).
 */
export const Findings = (props: { readonly chips?: boolean }) => {
  const { meta } = useReview();
  const { findings, soundCheck, picture, sync, send } = useFilm();
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
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
        touch: "long-press the page, then Show findings; on Project, tap a check's count",
        when: () => !open(),
        run: quietly(() => setOpen(true)),
      },
      walkCommand('next', 'Next finding', 'f'),
      walkCommand('previous', 'Previous finding', 'shift+f'),
    ),
  );
  return (
    <>
      <Show when={props.chips === true}>
        <For each={checks()} keyed={(c) => c.name}>
          {(check) => (
            <button
              type="button"
              class="sh-btn"
              data-act="findings"
              data-check={check().name}
              data-findings={Option.getOrUndefined(countOf(check()))}
              data-state={stateOf(check())}
              onClick={() => setOpen(true)}
            >
              {chipText(check())}
            </button>
          )}
        </For>
      </Show>
      <Show when={open()}>
        <Sheet
          host={meta.host}
          hub={meta.hub}
          role="findings"
          title="Findings"
          initialFocus={() => true}
          onClose={() => setOpen(false)}
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
    </>
  );
};
