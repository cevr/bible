// The film's findings on Choices and Project (UR-37/38): the check after the
// last write and the sound check after the last pick or knob, read when asked
// for and never over the player. At rest the write bar holds each check's
// count, a chip; the chip, Show findings (⌘K, the page's long-press menu)
// open one Findings sheet beside the page with both checks as groups, each
// finding's time a button that moves the clock to it. F and ⇧F walk the
// clock to the next or previous finding with a time, as they do in the lab.
// On Project the chips sit in the film's panel, the check's by its count.

import { Drawer } from '@bible/ui/drawer';
import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Effect, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createSignal, onCleanup } from 'solid-js';
import { type Command, quiet } from '../../../command/command.ts';
import { type Toward, walkFrom } from '../../../command/walk.ts';
import type { CheckLine } from '../../../core/schema.ts';
import { timecode } from '../../../core/time.ts';
import { useReview } from '../context.tsx';
import { SyncEvent } from '../machine.ts';
import { useFilm } from './context.tsx';
import { findingsText } from './receipt.ts';

/** A check's name and what it found. */
interface Check {
  readonly name: string;
  readonly findings: ReadonlyArray<CheckLine>;
}

/** The film second a finding starts at, when it has one. */
const timeOf = (finding: CheckLine): Option.Option<number> =>
  Option.flatMap(Option.fromUndefinedOr(finding.address), (at) => Option.fromUndefinedOr(at.time));

/** A check's count's state: clean, warnings only, or an error among them. */
const stateOf = (findings: ReadonlyArray<CheckLine>): 'clean' | 'warning' | 'findings' =>
  Match.value(findings).pipe(
    Match.when(
      (fs) => fs.some((f) => f.level === 'error'),
      () => 'findings' as const,
    ),
    Match.when(
      (fs) => fs.length > 0,
      () => 'warning' as const,
    ),
    Match.orElse(() => 'clean' as const),
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

/**
 * The film's findings sheet, the count chips that open it (the write bar's,
 * each check by its name; with `counts`, the film panel's, by its count),
 * and F/⇧F.
 */
export const Findings = (props: { readonly counts?: boolean }) => {
  const words = Bool.match(props.counts === true, {
    onTrue: () => countText,
    onFalse: () => findingsText,
  });
  const { meta } = useReview();
  const { findings, soundCheck, picture, sync, send } = useFilm();
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const checks = (): ReadonlyArray<Check> => [
    { name: 'check', findings: Option.getOrElse(findings(), () => []) },
    ...Option.toArray(
      Option.map(AsyncResult.value(soundCheck()), (s) => ({
        name: 'sound check',
        findings: s.findings,
      })),
    ),
  ];
  const times = () => checks().flatMap((c) => c.findings.flatMap((f) => Option.toArray(timeOf(f))));
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
            class="rv-chip rv-check"
            data-act="findings"
            data-check={check().name}
            data-findings={String(check().findings.length)}
            data-state={stateOf(check().findings)}
            onClick={() => setOpen(true)}
          >
            {words(check().name, check().findings.length)}
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
                          {check().name} <span class="lab-count">{check().findings.length}</span>
                        </h3>
                        <ul class="rv-findings">
                          <For each={check().findings}>
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
