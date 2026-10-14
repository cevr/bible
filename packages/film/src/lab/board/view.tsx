// The Board's column (`/films/<film>/board…`), as compound components:
// `Board.Column` holds the film's beats in play order; each `Board.Beat`
// under its id and start (one press shows its first frame) and its approval
// (Approve once every picture panel keeps a try; a pick since makes it
// stale), its picture's brief, its line with a chip at each mark, and its
// panels in the order they are said (`Board.Panel`: the try shown, its mark,
// its tries, the kept one, its notes). The panel picked opens under its beat:
// how it is shown (the animatic, the compare beside the scene's own frame at
// its mark, the draw), `Panel.Tries` (each try, previewed on the picture, and
// Keep with why), the composer (a comment, or a tweak an agent makes, the
// sketch riding along), and `Panel.Notes` (the panel's notes and their
// threads). On a laptop it is a column beside the picture; on a phone it
// scrolls under the picture and its track.

import { For, Portal, Show, useHead } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Equal, Option, Order, Predicate } from 'effect';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { BOARD_VIEWS, type BoardView, stillUrl } from '../../core/api.ts';
import {
  type BoardFile,
  type Panel as BoardPanel,
  approvalOf,
  panelsOf,
  shownTry,
} from '../../core/board.ts';
import { sketchSummary } from '../../core/sketch.ts';
import type { Note } from '../../core/schema.ts';
import { counted } from '../../core/words.ts';
import { NOTE_STATE, ReplyForm, Thread } from '../notes/list.tsx';
import { Timecode } from '../page-shell.tsx';
import { pressed } from '../pressed.ts';
import { Lab, useLab } from '../shell.tsx';
import { Sketch } from '../sketch/surface.tsx';
import { panelTime } from './animatic.ts';
import { Asked, type BoardBeat, BoardRead, type PickedPanel, useBoard } from './context.tsx';
import { type PanelAsking, tweakCommand } from './note.ts';
import { BOARD_CSS } from './style.ts';

/** Each view's name, as the column offers it. */
const VIEW_NAME: Readonly<Record<BoardView, string>> = {
  animatic: 'Animatic',
  compare: 'Compare',
  draw: 'Draw',
};

/** What each approval state says beside a beat. */
const APPROVAL: Readonly<Record<'none' | 'approved' | 'stale', string>> = {
  none: 'not approved',
  approved: 'approved',
  stale: 'approved, then changed',
};

/** The badge state an approval wears: none for a beat not approved. */
const approvalBadge = (a: keyof typeof APPROVAL): Option.Option<'approved' | 'stale'> =>
  Option.liftPredicate(a, (s): s is 'approved' | 'stale' => s !== 'none');

/** A card's or a verse's words, as the engine sets them. */
type PanelText = NonNullable<BoardPanel['text']>;

/** What a card's or a verse's thumb says. */
const thumbSaid = (t: PanelText): string => {
  if (t._tag === 'Card') return `card · “${t.payoff}”`;
  return `verse · ${t.ref}`;
};

/** What the column says of a card or a verse the engine sets, said from mark `at`. */
const setSaid = (t: PanelText, at: string): string => {
  if (t._tag === 'Card')
    return `A full-screen card in the film's card style: the line's words as said from {${at}}, the payoff “${t.payoff}”.`;
  return `A verse card in the film's card style: “${t.text}” (${t.ref}), its phrase “${t.phrase}” swept as it is said.`;
};

/** How many tries a panel has, said: `1 try`, `2 tries`. */
const triesSaid = (n: number): string =>
  Bool.match(n === 1, { onTrue: () => '1 try', onFalse: () => `${n} tries` });

/** The board as read, when it is. */
const useRead = () => {
  const board = useBoard();
  return createMemo((): Option.Option<BoardFile> =>
    BoardRead.$match(board.state.read(), {
      Reading: () => Option.none(),
      Read: (r) => Option.some(r.board),
      Refused: () => Option.none(),
    }),
  );
};

/** The column's head: how many beats and panels the film has, and how many beats are approved. */
const Head = () => {
  const board = useBoard();
  const read = useRead();
  const said = () =>
    Option.match(read(), {
      onNone: () => counted(board.state.beats.length, 'beat'),
      onSome: (b) =>
        [
          counted(board.state.beats.length, 'beat'),
          counted(b.panels.length, 'panel'),
          `${board.state.beats.filter((beat) => approvalOf(b, beat.id) === 'approved').length} approved`,
        ].join(' · '),
    });
  return (
    <header class="lab-board-head">
      <span class="lab-board-count lab-clamp">{said()}</span>
    </header>
  );
};

/** The board's read: a line while it is read, the server's words and Read again when refused. */
const Status = () => {
  const board = useBoard();
  return (
    <Show when={board.state.read()._tag !== 'Read'}>
      <div class="lab-board-status" role="status">
        <span class="lab-board-note">
          {BoardRead.$match(board.state.read(), {
            Reading: () => 'Reading the board…',
            Read: () => '',
            Refused: (r) => `The board could not be read: ${r.reason}`,
          })}
        </span>
        <Show when={board.state.read()._tag === 'Refused'}>
          <button type="button" class="sh-btn" onClick={() => board.actions.retry()}>
            Read again
          </button>
        </Show>
      </div>
    </Show>
  );
};

/** A beat's line: its words, a chip at each mark before the word it is said at. */
const Line = (props: { readonly beat: BoardBeat }) => (
  <p class="lab-board-line">
    <For each={props.beat.line}>
      {(word) => (
        <>
          <For each={word.marks}>{(mark) => <span class="lab-board-mark">{mark}</span>}</For>
          {`${word.text} `}
        </>
      )}
    </For>
  </p>
);

/** What a panel shows as its thumb: its try's image, or what a card or a verse says. */
const Thumb = (props: { readonly panel: BoardPanel; readonly file: Option.Option<string> }) => {
  const board = useBoard();
  return (
    <Show
      when={props.panel.text}
      fallback={
        <Show
          when={Option.getOrUndefined(props.file)}
          fallback={<span class="lab-board-thumb lab-board-thumb-empty">no try yet</span>}
        >
          {(file) => (
            <img
              class="lab-board-thumb"
              src={board.meta.url(file())}
              alt=""
              loading="lazy"
              width="160"
              height="90"
            />
          )}
        </Show>
      }
    >
      {(text) => (
        <span class="lab-board-thumb lab-board-thumb-card" data-kind={text()._tag}>
          {thumbSaid(text())}
        </span>
      )}
    </Show>
  );
};

/** One of a beat's panels, as a press that picks it. */
export const PanelChip = (props: { readonly beat: BoardBeat; readonly panel: BoardPanel }) => {
  const board = useBoard();
  const picked = () => Option.exists(board.state.picked(), (p) => p.panel.id === props.panel.id);
  const notes = () => board.state.notesOf(props.panel.id).filter((n) => n.status !== 'resolved');
  return (
    <button
      type="button"
      class="lab-board-panel"
      data-panel={props.panel.id}
      aria-current={pressed(picked())}
      onClick={() =>
        board.actions.pick(
          props.beat.id,
          Option.some(props.panel.at).pipe(Option.filter(() => !picked())),
        )
      }
    >
      <Thumb panel={props.panel} file={Option.map(shownTry(props.panel), (t) => t.file)} />
      <span class="lab-board-panel-label">
        <span class="lab-board-panel-at">{props.panel.at}</span>
        <Timecode
          class="lab-board-panel-time"
          seconds={panelTime(props.beat, props.panel)}
          fps={useLab().meta.film.fps}
        />
      </span>
      <span class="lab-board-panel-meta">
        <Show when={!props.panel.text}>
          <span>{triesSaid(props.panel.tries.length)}</span>
        </Show>
        <Show when={Predicate.isNotUndefined(props.panel.kept)}>
          <span class="sh-badge" data-state="approved">
            kept {props.panel.kept}
          </span>
        </Show>
        <Show when={notes().length > 0}>
          <span class="sh-badge" data-state="note">
            {counted(notes().length, 'note')}
          </span>
        </Show>
      </span>
    </button>
  );
};

/** How the picked panel is shown: the animatic, the compare, the draw. */
const Views = () => {
  const board = useBoard();
  return (
    <div class="lab-board-views" role="group" aria-label="Show the panel">
      <For each={BOARD_VIEWS}>
        {(v) => (
          <button
            type="button"
            class="sh-btn"
            aria-pressed={pressed(board.state.view() === v)}
            onClick={() => board.actions.show(v)}
          >
            {VIEW_NAME[v]}
          </button>
        )}
      </For>
    </div>
  );
};

/** The picked panel's tries: each one previewed on the picture by a press; Keep, with why. */
export const Tries = (props: { readonly picked: PickedPanel }) => {
  const board = useBoard();
  const [why, setWhy] = createSignal('', { ownedWrite: true });
  const shown = () => Option.map(props.picked.tried, (t) => t.n);
  return (
    <Show
      when={props.picked.panel.text}
      fallback={
        <section class="lab-board-tries" aria-label="Tries">
          <div class="lab-board-tries-row">
            <For each={props.picked.panel.tries}>
              {(t) => (
                <button
                  type="button"
                  class="lab-board-try"
                  aria-pressed={pressed(Option.contains(shown(), t.n))}
                  onClick={() =>
                    board.actions.pick(
                      props.picked.beat.id,
                      Option.some(props.picked.panel.at),
                      Option.some(t.n),
                    )
                  }
                >
                  <img
                    src={board.meta.url(t.file)}
                    alt={`Try ${t.n}`}
                    loading="lazy"
                    width="160"
                    height="90"
                  />
                  <span class="lab-board-try-label">
                    {`try ${t.n} · ${t.made}`}
                    <Show when={props.picked.panel.kept === t.n}>
                      <span class="sh-badge" data-state="approved">
                        kept
                      </span>
                    </Show>
                  </span>
                </button>
              )}
            </For>
          </div>
          <Show when={props.picked.panel.why}>
            {(w) => <p class="lab-board-why">{`Kept: ${w()}`}</p>}
          </Show>
          <Show when={Option.getOrUndefined(shown())}>
            {(n) => (
              <form
                class="lab-board-keep"
                onSubmit={(e) => {
                  e.preventDefault();
                  board.actions.keep(n(), why());
                  setWhy('');
                }}
              >
                <input
                  class="lab-board-why-input"
                  aria-label={`Why keep try ${n()}`}
                  placeholder="Why this one…"
                  value={why()}
                  onInput={(e) => setWhy(e.currentTarget.value)}
                />
                <button
                  type="submit"
                  class="sh-btn"
                  disabled={props.picked.panel.kept === n() && why() === ''}
                >
                  {`Keep try ${n()}`}
                </button>
              </form>
            )}
          </Show>
        </section>
      }
    >
      {(text) => (
        <p class="lab-board-set">
          {setSaid(text(), props.picked.panel.at)} The engine sets it; no image is drawn.
        </p>
      )}
    </Show>
  );
};

/** The composer: a comment, or a tweak an agent makes, the sketch riding along; where the last request stands. */
const Composer = (props: { readonly picked: PickedPanel }) => {
  const board = useBoard();
  const [text, setText] = createSignal('', { ownedWrite: true });
  const drawn = () => board.state.sketch().items;
  const sending = () => board.state.asked()._tag === 'Sending';
  const post = (asking: 'note' | 'tweak') => {
    board.actions.post(asking, text());
    setText('');
  };
  return (
    <section class="lab-board-compose" aria-label="Note the panel">
      <textarea
        class="lab-board-text"
        aria-label="Note on the panel"
        placeholder={Bool.match(Predicate.isNotUndefined(props.picked.panel.text), {
          onTrue: () => 'Say what to change in the card…',
          onFalse: () => 'Say what to change; draw on the panel (Draw) to show it…',
        })}
        rows="3"
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <Show when={drawn().length > 0}>
        <p class="lab-board-drawn">{`Sketch: ${sketchSummary(drawn())}. It rides along with the note.`}</p>
      </Show>
      <div class="lab-board-actions">
        <button
          type="button"
          class="sh-btn"
          disabled={sending() || (text().trim() === '' && drawn().length === 0)}
          onClick={() => post('note')}
        >
          Comment
        </button>
        <Show when={!props.picked.panel.text && Option.isSome(props.picked.tried)}>
          <button
            type="button"
            class="sh-btn"
            disabled={sending() || (text().trim() === '' && drawn().length === 0)}
            onClick={() => post('tweak')}
          >
            Ask for a tweak
          </button>
        </Show>
      </div>
      <p class="lab-board-asked" aria-live="polite">
        {Asked.$match(board.state.asked(), {
          Idle: () => '',
          Sending: (a) => `${a.what}…`,
          Done: (a) =>
            Option.match(a.note, {
              onNone: () => `${a.what}.`,
              onSome: (n) => POSTED[n.asking](board.meta.name, n.id),
            }),
          Failed: (a) => `${a.what} failed: ${a.reason}`,
        })}
      </p>
    </section>
  );
};

/** One note on the panel: who asked what, its still, its thread, and a reply while it is selected. */
const PanelNote = (props: { readonly note: Note }) => {
  const { state: lab, actions } = useLab();
  const board = useBoard();
  const open = () => Option.contains(lab.note(), props.note.id);
  return (
    <li class="lab-board-noted" data-note={props.note.id} aria-current={pressed(open())}>
      <button
        type="button"
        class="lab-board-noted-head"
        onClick={() =>
          actions.selectNote(Option.some(props.note.id).pipe(Option.filter(() => !open())))
        }
      >
        <span class="sh-badge" data-state={NOTE_STATE[props.note.status]}>
          {props.note.id}
        </span>
        <Show when={props.note.panel?.ask === 'tweak'}>
          <span class="sh-badge" data-state="warning">
            tweak
          </span>
        </Show>
        <span class="lab-board-noted-text">{props.note.text}</span>
      </button>
      <Show when={open()}>
        <Show when={props.note.still}>
          {(still) => (
            <img
              class="lab-board-noted-still"
              src={stillUrl(board.meta.name, still())}
              alt={`The panel as ${props.note.id} drew on it`}
              loading="lazy"
            />
          )}
        </Show>
        <Thread film={board.meta.name} note={props.note} />
        <Show when={props.note.status !== 'resolved'}>
          <ReplyForm note={props.note} />
        </Show>
      </Show>
    </li>
  );
};

/** What a note posted says next: who acts on it, and how. */
const POSTED: Readonly<Record<PanelAsking, (film: string, id: string) => string>> = {
  note: (film, id) => `Posted ${id}. An agent reads it with: bun run notes ${film}`,
  tweak: (film, id) => `Posted ${id}. An agent makes the tweak with: ${tweakCommand(film, id)}`,
};

/** The picked panel's notes, oldest first. */
export const Notes = (props: { readonly picked: PickedPanel }) => {
  const board = useBoard();
  const notes = () => board.state.notesOf(props.picked.panel.id);
  return (
    <Show when={notes().length > 0}>
      <section class="lab-board-notes" aria-label="Notes on the panel">
        <ol class="lab-board-notes-list">
          <For each={notes()}>{(note) => <PanelNote note={note} />}</For>
        </ol>
      </section>
    </Show>
  );
};

/** The picked panel, open under its beat. */
const Opened = (props: { readonly picked: PickedPanel }) => {
  const board = useBoard();
  return (
    <section class="lab-board-open" aria-label={`Panel ${props.picked.panel.id}`}>
      <header class="lab-board-open-head">
        <span class="lab-board-open-id">{props.picked.panel.id}</span>
        <Views />
        <button
          type="button"
          class="sh-btn lab-board-close"
          onClick={() => board.actions.pick(props.picked.beat.id, Option.none())}
        >
          Close
        </button>
      </header>
      <Show when={board.state.view() === 'compare'}>
        <figure class="lab-board-beside">
          <Show
            when={Option.getOrUndefined(props.picked.tried)}
            fallback={
              <figcaption>
                The card is the frame: the picture shows the scene at its mark.
              </figcaption>
            }
          >
            {(t) => (
              <img src={board.meta.url(t().file)} alt={`${props.picked.panel.id}, try ${t().n}`} />
            )}
          </Show>
          <figcaption>
            Board, beside the scene's own frame at {`{${props.picked.panel.at}}`} on the picture.
          </figcaption>
        </figure>
      </Show>
      <Show when={board.state.view() === 'draw'}>
        <Sketch.Toolbar />
      </Show>
      <Tries picked={props.picked} />
      <Composer picked={props.picked} />
      <Notes picked={props.picked} />
    </section>
  );
};

/** One beat: its head, its brief and line, its panels, and the panel picked in it. */
export const Beat = (props: { readonly beat: BoardBeat }) => {
  const board = useBoard();
  const { state: lab, meta } = useLab();
  const read = useRead();
  const panels = createMemo(() =>
    Option.match(read(), {
      onNone: () => [],
      onSome: (b) =>
        Arr.sort(
          panelsOf(b, props.beat.id),
          Order.mapInput(Order.Number, (p: BoardPanel) => panelTime(props.beat, p)),
        ),
    }),
  );
  const approval = () => Option.map(read(), (b) => approvalOf(b, props.beat.id));
  const live = () => lab.T() >= props.beat.start && lab.T() < props.beat.end;
  const opened = () => Option.filter(board.state.picked(), (p) => p.beat.id === props.beat.id);
  return (
    <article class="lab-board-beat" data-scene={props.beat.id} data-live={pressed(live())}>
      <header class="lab-board-beat-head">
        <button
          type="button"
          class="lab-board-id"
          onClick={() => board.actions.seekBeat(props.beat.id)}
        >
          {props.beat.id}
          <Timecode class="lab-board-at" seconds={props.beat.start} fps={meta.film.fps} />
        </button>
        <Show when={Option.getOrUndefined(approval())}>
          {(a) => (
            <>
              <span class="sh-badge" data-state={Option.getOrUndefined(approvalBadge(a()))}>
                {APPROVAL[a()]}
              </span>
              <Show
                when={a() === 'approved'}
                fallback={
                  <button
                    type="button"
                    class="sh-btn lab-board-approve"
                    disabled={panels().length === 0}
                    onClick={() => board.actions.approve(props.beat.id)}
                  >
                    Approve
                  </button>
                }
              >
                <button
                  type="button"
                  class="sh-btn lab-board-approve"
                  onClick={() => board.actions.withdraw(props.beat.id)}
                >
                  Withdraw
                </button>
              </Show>
            </>
          )}
        </Show>
      </header>
      <Show when={Option.getOrUndefined(board.state.brief(props.beat.id))}>
        {(brief) => <p class="lab-board-brief">{brief()}</p>}
      </Show>
      <Show when={props.beat.line.length > 0}>
        <Line beat={props.beat} />
      </Show>
      <Show
        when={panels().length > 0}
        fallback={
          <p class="lab-board-none">
            No panel yet: {`bun run board ${meta.name} --beat ${props.beat.id}`}
          </p>
        }
      >
        <div class="lab-board-panels">
          <For each={panels()}>{(panel) => <PanelChip beat={props.beat} panel={panel} />}</For>
        </div>
      </Show>
      <Show when={Option.getOrUndefined(opened())}>{(p) => <Opened picked={p()} />}</Show>
    </article>
  );
};

/** The picked panel's sketch surface over the picture, while the panel is drawn on (the draw view). */
export const Canvas = () => {
  const board = useBoard();
  const { meta } = useLab();
  return (
    <Show when={board.state.view() === 'draw' && Option.isSome(board.state.picked())}>
      <Lab.Overlay>
        <Sketch.Surface width={meta.film.width} height={meta.film.height} />
      </Lab.Overlay>
      <Sketch.Keys hub={meta.hub} />
    </Show>
  );
};

/**
 * The Board's column: a column beside the picture on a laptop, under it on a
 * phone. Its styles are in the page's head while it is there, and only then
 * (`page-css-budget.test.ts`).
 */
export const Column = () => {
  useHead({ tag: 'style', props: { 'data-part-style': 'board', children: BOARD_CSS } });
  const board = useBoard();
  const { state: lab, meta } = useLab();
  // Follow: while the animatic plays, the playhead's beat stays in sight.
  let scroll = Option.none<HTMLDivElement>();
  const following = createMemo(
    () => {
      const T = lab.T();
      return Option.filter(
        Option.map(
          Arr.findFirst(board.state.beats, (b) => T >= b.start && T < b.end),
          (b) => b.id,
        ),
        () => meta.player.playing(),
      );
    },
    { equals: Equal.equals },
  );
  // The panel picked, by a tap or by the address, is opened in sight.
  const opened = createMemo(() => Option.map(board.state.picked(), (p) => p.panel.id), {
    equals: Equal.equals,
  });
  createEffect(opened, (id) => {
    Option.map(
      Option.flatMap(id, () =>
        Option.flatMap(scroll, (s) => Option.fromNullishOr(s.querySelector('.lab-board-open'))),
      ),
      (el) => el.scrollIntoView({ block: 'nearest' }),
    );
  });
  createEffect(following, (beat) => {
    Option.map(
      Option.flatMap(beat, (id) =>
        Option.flatMap(scroll, (s) =>
          Option.fromNullishOr(s.querySelector(`[data-scene="${CSS.escape(id)}"]`)),
        ),
      ),
      (el) => el.scrollIntoView({ block: 'nearest' }),
    );
  });
  return (
    <Portal mount={document.body}>
      <section class="lab-board" data-role="board" aria-label="Board">
        <Head />
        <Status />
        <div
          class="lab-board-scroll"
          role="region"
          aria-label="Beats"
          tabindex="0"
          ref={(el) => {
            scroll = Option.some(el);
          }}
        >
          <For each={board.state.beats}>{(beat) => <Beat beat={beat} />}</For>
        </div>
      </section>
    </Portal>
  );
};
