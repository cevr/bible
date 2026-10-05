// The studio's section of the panel: the beats with where each take stands,
// the teleprompter (the selected beat's lines and quotations, as the reading
// sheet sets them), the microphone and its meter, the recorder's controls and
// status, the recording to hear before it is submitted, and the beat's
// earlier attempts to hear and keep. Every piece reads the studio's context.
//
// The studio's keys (R record, Space stop, K submit or accept, ←/→ beat,
// Esc cancel) are commands on the page's hub that run only while focus is
// in the section (`commands.ts`); there they are the studio's alone, so the
// lab's keys bound to the same chords (Space play, ←/→ frame, Esc) never
// fire from here, while its others ([ ] scene, c captions, n note, ⌘Z) do.
// A focused picker or player keeps its own keys.

import { For, Show } from '@solidjs/web';
import { type Accessor, createEffect, onCleanup, onSettled } from 'solid-js';
import { Option } from 'effect';
import type { Part } from '../../core/sheet.ts';
import { Lab, useLab } from '../shell.tsx';
import { studioCommands } from './commands.ts';
import { type AttemptRow, useStudio } from './context.tsx';
import { type Act, beatBadge } from './view.ts';

/** One stretch of the beat as the owner reads it: a line (its reader named), or a quotation set apart. */
const Stretch = (props: { readonly part: Part }) => {
  const part = props.part;
  if (part.kind === 'quotation')
    return (
      <blockquote class="studio-quotation">
        <p>{part.text}</p>
        <Show when={part.by}>{(by) => <cite>{by()}</cite>}</Show>
      </blockquote>
    );
  return (
    <p class="studio-line">
      <Show when={part.voice}>{(voice) => <span class="studio-voice">{voice()}: </span>}</Show>
      {part.text}
    </p>
  );
};

/** The selected beat's words, large, to read from. */
const Prompter = () => {
  const { state } = useStudio();
  return (
    <div class="studio-prompter" data-role="prompter">
      <Show when={Option.getOrUndefined(state.current())}>
        {(beat) => <For each={beat().parts}>{(part) => <Stretch part={part} />}</For>}
      </Show>
    </div>
  );
};

/** Every beat, where its take stands, and the counts. */
const Beats = () => {
  const { state, actions } = useStudio();
  return (
    <div class="studio-beats">
      <p class="studio-counts">{state.counts()}</p>
      <Show when={state.beatsStatus()}>{(status) => <p class="lab-status">{status()}</p>}</Show>
      <ol>
        <For each={state.beats()}>
          {(beat) => (
            <li>
              <button
                type="button"
                data-beat={beat.id}
                class={['sh-btn', { selected: beat.id === state.beat() }]}
                aria-pressed={`${beat.id === state.beat()}`}
                onClick={() => actions.select(beat.id)}
              >
                <span class="studio-beat-id">{beat.id}</span>
                <span class={['lab-badge', beat.state]} data-role="badge">
                  {beatBadge(beat)}
                </span>
              </button>
            </li>
          )}
        </For>
      </ol>
    </div>
  );
};

/** The microphone picked (remembered in this browser) and its level while it is open. */
const Mic = () => {
  const { state, actions } = useStudio();
  return (
    <div class="studio-mic">
      <label>
        <span class="lab-edit-key">mic</span>
        <select
          data-field="mic"
          onChange={(e) =>
            actions.pick(Option.filter(Option.some(e.currentTarget.value), (id) => id !== ''))
          }
        >
          <For each={state.mics()} keyed={(o) => o.id}>
            {(o) => (
              <option value={o().id} selected={o().selected}>
                {o().label}
              </option>
            )}
          </For>
        </select>
      </label>
      <Meter />
    </div>
  );
};

/** Peak and RMS in dBFS with a bar, and the clip warning at −1 dBFS; empty while the microphone is closed. */
const Meter = () => {
  const { state } = useStudio();
  return (
    <div class="studio-meter" data-role="meter">
      <Show when={Option.getOrUndefined(state.meter())}>
        {(m) => (
          <>
            <div class="studio-meter-bar">
              <div
                class={{ 'studio-meter-fill': true, clip: m().clip }}
                style={{ width: `${(m().fill * 100).toFixed(1)}%` }}
              />
            </div>
            <span class="studio-meter-text" data-role="peak">
              peak {m().peak}
            </span>
            <span class="studio-meter-text" data-role="rms">
              rms {m().rms}
            </span>
            <Show when={m().clip}>
              <span class="studio-clip" data-role="clip">
                clipping: turn the input down
              </span>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
};

/** The controls that start or end a take, in the recording's colour (design language §7); the rest are quiet. */
const STATE: Partial<Record<Act, 'recording'>> = { arm: 'recording', stop: 'recording' };

/** What the owner can do now, and where the recorder stands. */
const Controls = () => {
  const { state, actions } = useStudio();
  return (
    <div class="studio-controls">
      <div class="studio-buttons">
        <For each={state.controls()} keyed={(c) => c.act}>
          {(c) => (
            <button
              type="button"
              class="sh-btn"
              data-act={c().act}
              data-state={STATE[c().act]}
              onClick={() => actions.perform(c().act)}
            >
              {c().label}
            </button>
          )}
        </For>
      </div>
      <p class="studio-status" data-role="status" data-tone={state.tone()}>
        {state.status()}
      </p>
      <Show when={Option.getOrUndefined(state.review())}>
        {(src) => <audio class="studio-review" data-role="review" controls src={src()} />}
      </Show>
    </div>
  );
};

/** One recording's row: kept by its file, so a player in it keeps playing while the recorder moves. */
const Attempt = (props: { readonly row: Accessor<AttemptRow> }) => {
  const { state, actions } = useStudio();
  const row = props.row;
  return (
    <li class={['studio-attempt', { kept: row().kept }]} data-file={row().file}>
      <div class="studio-attempt-head">
        <span class="studio-attempt-line">{row().line}</span>
        <Show when={row().kept}>
          <span class="lab-badge recorded">kept</span>
        </Show>
        <Show when={!row().current}>
          <span class="lab-badge stale" title="recorded for the line as it read before">
            earlier line
          </span>
        </Show>
      </div>
      <div class="studio-attempt-row">
        <audio controls preload="none" src={row().src} />
        <button
          type="button"
          class="sh-btn"
          data-act="keep"
          disabled={!(state.keepable() && row().current && !row().kept)}
          onClick={() => actions.keep(row().file)}
        >
          Keep
        </button>
      </div>
    </li>
  );
};

/** The selected beat's recordings, newest first, each to hear and keep. */
const Attempts = () => {
  const { state } = useStudio();
  return (
    <div class="studio-attempts">
      <strong>Attempts</strong>
      <Show when={state.attemptsStatus()}>{(status) => <p class="lab-status">{status()}</p>}</Show>
      <ol>
        <For each={state.attempts()} keyed={(row) => row.file}>
          {(row) => <Attempt row={row} />}
        </For>
      </ol>
    </div>
  );
};

/** Focus moved to the section leaves the page where it is (a click lands where it was aimed). */
const STAY: FocusOptions = { preventScroll: true };

/** What the section holds of the DOM: itself, and the element in it that last had focus. */
interface Held {
  root: Option.Option<HTMLElement>;
  last: Option.Option<Element>;
}

/** Whether `target` is a button (or inside one). */
const onButton = (target: EventTarget) =>
  target instanceof Element && Option.isSome(Option.fromNullishOr(target.closest('button')));

/**
 * The studio: its keys while focus is in it, and its pieces. Focus stays in
 * it while its controls change under it: a button clicked leaves focus on the
 * section, not on the button (the next state may take the button away), an
 * element that had focus and is gone hands it back to the section, and focus
 * in the studio comes back after the reload a take kept causes.
 */
export const Section = () => {
  const { state, actions } = useStudio();
  const held: Held = { root: Option.none(), last: Option.none() };
  /** Whether the target is in the studio. */
  const within = (target: EventTarget) =>
    target instanceof Node && Option.exists(held.root, (root) => root.contains(target));
  // Focus lost with the element that had it (a control the new state took
  // away) goes back to the section. The effect runs once the DOM has changed.
  createEffect(
    () => [state.controls(), state.attempts()],
    () => {
      const lost = Option.exists(held.last, (el) => !el.isConnected);
      if (lost && document.activeElement === document.body)
        Option.map(held.root, (r) => r.focus(STAY));
    },
  );
  onSettled(() => {
    if (state.hadFocus) Option.map(held.root, (r) => r.focus(STAY));
  });
  const { meta } = useLab();
  onCleanup(meta.hub.commands.register(...studioCommands(actions)));
  const onMouseDown = (e: MouseEvent) => {
    if (!Option.exists(Option.fromNullishOr(e.target), onButton)) return;
    e.preventDefault();
    Option.map(held.root, (r) => r.focus(STAY));
  };
  const onFocusIn = (e: FocusEvent) => {
    held.last = Option.filter(Option.fromNullishOr(e.target), (t) => t instanceof Element);
    actions.focused(true);
  };
  return (
    <Lab.Fill at="record">
      <div
        class="studio"
        tabindex="0"
        data-role="studio"
        ref={(el) => {
          held.root = Option.some(el);
        }}
        onMouseDown={onMouseDown}
        onFocusIn={onFocusIn}
        onFocusOut={(e) =>
          actions.focused(Option.exists(Option.fromNullishOr(e.relatedTarget), within))
        }
      >
        <header>
          <strong>Studio</strong>
        </header>
        <Beats />
        <Prompter />
        <Mic />
        <Controls />
        <Attempts />
      </div>
    </Lab.Fill>
  );
};
