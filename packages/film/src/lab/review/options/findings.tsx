// The film's findings on Choices and Project (UR-37/38): the check after the
// last write and the sound check after the last pick or knob, read when asked
// for and never over the player. At rest the write bar holds each check's
// count, a chip; the chip, Show findings (⌘K, the page's long-press menu)
// open one Findings sheet beside the page with both checks as groups, each
// finding's time a button that moves the clock to it. F and ⇧F walk the
// clock to the next or previous finding with a time, as they do in the lab.
// On Project the chips sit in the film's panel, the check's by its count.
// Until the check answers its chip says it is checking, and a check that
// failed says so: only an answer counts as clean.

import { Drawer } from '@bible/ui/drawer';
import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Effect, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createSignal, onCleanup } from 'solid-js';
import { type Command, quiet } from '../../../command/command.ts';
import { type Toward, walkFrom } from '../../../command/walk.ts';
import type { CheckLine } from '../../../core/schema.ts';
import { timecode } from '../../../core/time.ts';
import type { LabFailure } from '../../api.ts';
import { useReview } from '../context.tsx';
import { failedText } from '../format.ts';
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

/** What a check that has not answered says: `checking…` or `check failed` (with `named`, `check: checking…`). */
const unansweredText = (name: string, state: 'checking' | 'failed', named: boolean): string =>
  Match.value({ state, named }).pipe(
    Match.when({ state: 'checking', named: false }, () => 'checking…'),
    Match.when({ state: 'failed', named: false }, () => `${name} failed`),
    Match.when({ state: 'checking' }, () => `${name}: checking…`),
    Match.orElse(() => `${name}: failed`),
  );

/**
 * The film's findings sheet, the count chips that open it (the write bar's,
 * each check by its name; with `counts`, the film panel's, by its count),
 * and F/⇧F.
 */
export const Findings = (props: { readonly counts?: boolean }) => {
  const counts = props.counts === true;
  const words = Bool.match(counts, {
    onTrue: () => countText,
    onFalse: () => findingsText,
  });
  /** What `check`'s chip says: still checking, failed, or what it found. */
  const chipText = (check: Check) =>
    Option.match(unanswered(check), {
      onSome: (state) => unansweredText(check.name, state, !counts),
      onNone: () => words(check.name, foundBy(check).length),
    });
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
    run: () =>
      Effect.sync(() => {
        Option.map(walk(toward), seek);
        return quiet;
      }),
  });
  onCleanup(
    meta.hub.commands.register(
      {
        id: 'review.findings',
        label: 'Show findings',
        group: 'View',
        about: ['Page'],
        touch: "tap a check's count, or long-press the page, then Show findings",
        when: () => !open(),
        run: () =>
          Effect.sync(() => {
            setOpen(true);
            return quiet;
          }),
      },
      walkCommand('next', 'Next finding', 'f'),
      walkCommand('previous', 'Previous finding', 'shift+f'),
    ),
  );
  return (
    <>
      <For each={checks()} keyed={(c) => c.name}>
        {(check) => (
          <button
            type="button"
            class="sh-btn"
            data-act="findings"
            data-check={check().name}
            data-findings={Option.getOrUndefined(
              Option.map(found(check()), (lines) => String(lines.length)),
            )}
            data-state={stateOf(check())}
            onClick={() => setOpen(true)}
          >
            {chipText(check())}
          </button>
        )}
      </For>
      <Show when={open()}>
        <Drawer.Root
          open
          modal={false}
          disablePointerDismissal
          swipeDirection="right"
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
        >
          <Drawer.Portal>
            <Drawer.Viewport class="lab-inspector-viewport">
              <Drawer.Popup class="lab-inspector-sheet lab-inspector" data-role="findings">
                <header class="lab-inspector-head">
                  <Drawer.Title class="lab-sheet-title">Findings</Drawer.Title>
                  <Drawer.Close class="lab-inspector-close" data-act="close-findings">
                    Close
                  </Drawer.Close>
                </header>
                <Drawer.Content class="lab-inspector-body">
                  <For each={checks()} keyed={(c) => c.name}>
                    {(check) => (
                      <section class="rv-group" data-check={check().name}>
                        <h3>
                          {check().name} <span class="lab-count">{foundBy(check()).length}</span>
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
                </Drawer.Content>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </Show>
    </>
  );
};
