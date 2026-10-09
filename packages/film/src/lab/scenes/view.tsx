// A film's Scenes (`/films/<film>/scenes[/<scene>]`, design language §6):
// the whole film end to end as stills, wrapped like lines of text (the tape,
// `tape.ts`), under the tape bar (the acts ruler, the preview's track of
// scene bands, ticks and playhead, then the legend's colour key and Follow).
// Each still is the frame at the middle of its step, drawn from the code as
// it stands by the one source of stills (`player/stills.ts`), the lines on
// screen first, with captions while the preview's captions are on (its
// toggle turned, the tape is drawn again). A line's time is its timecode; each cut is a rule at its
// scene's exact time with the scene's name where it has room, and a band
// under the line says each scene's state in its colour.
//
// A tap on a still selects its scene and moves the playhead there; a drag
// along a line scrubs it. The selected scene's card (`card.tsx`, the card
// the Project shows) stands in the one sheet (`Sheet`, the Project's scene
// inspector's) beside the tape, a sheet over the tab bar on a phone: the
// live frame, its act, in, out and length, its marks, Open in Lab (E) and
// Approve (A), its findings and a comment; its Close (and Escape, and a
// swipe) clears the selection, adding no entry, as an inspector's does.
// ⇧-click or ⌘-click adds scenes to the selection, and ⇧A approves them all
// in one say; an approve's receipt offers Undo, as Project's does.
// The selection is the URL's path and the playhead its `#t=` (`place.ts`):
// Back steps through the selections. ⌘+ and ⌘− step the tape between 2.5,
// 5 and 10 s a still (kept in this browser); the palette and the film's
// counts are in the view menu (⋯).

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Dialog } from '@bible/ui/dialog';
import { For, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, type Layer, Match, Option, Result } from 'effect';
import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { type Host, addressOn, monotonicMs, onTraverse } from '../../browser/host.ts';
import { Frames } from '../../browser/frames.ts';
import { PageLoad } from '../../browser/page-load.ts';
import { Pointer, Surface } from '../../browser/pointer.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import { type Command, quiet, quietly, refused, said } from '../../command/command.ts';
import { type Context, selected } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import { type ProjectView, type Say, pageHref } from '../../core/api.ts';
import { sceneAt } from '../../core/layout.ts';
import { isShortKey } from '../../core/shorts.ts';
import { onTheMs, timecode, timecodeParts } from '../../core/time.ts';
import { counted } from '../../core/words.ts';
import type { Player } from '../../player/main.ts';
import { makeStills } from '../../player/stills.ts';
import type { LabClient } from '../api.ts';
import { usePlayerTime } from '../page-shell.tsx';
import { approveUndo, tookText, undoApprove } from '../review/options/receipt.ts';
import { PHONE, useMatches } from '../viewport.ts';
import { pressed } from '../pressed.ts';
import { Sheet, useSheetDismissal } from '../sheet.tsx';
import { Comments, SayBox } from '../review/options/choice.tsx';
import { useOnScreenFirst } from '../review/options/stills.tsx';
import { SceneCard, SceneFindings, SceneState, sceneHue } from './card.tsx';
import { type Said, type ScenesRead, findingsOf, scenesCalls } from './data.ts';
import { bandState, legendOf, marksOf } from './marks.ts';
import { scenesPlaceOf, withScene } from './place.ts';
import {
  NO_CUT_NAME,
  STEPS,
  type TapeRow,
  type TapeScene,
  cutNames,
  perRowAt,
  placeOf,
  stepFrom,
  tapeOf,
  timeAt,
} from './tape.ts';

/** A still's width in canvas px: sharp at a laptop's 12 a line and a phone's 6, on a 2× screen. */
const STILL_W = 192;

/** A tape label's character width at `--fs-1` in the UI's monospace face, in px: what a cut's name needs. */
const CHAR_PX = 6.2;

/** The tape's step, kept in this browser (a per-viewer convenience, safe to lose). */
const keptStep = keptText(ViewerStore, 'film-studio.tape-step');

/** A signal written by the page's own listeners (a draw, a still landing). */
const fromHost = { ownedWrite: true } as const;

/** The step a kept text names, if it is one of the tape's. */
const stepOf = (kept: Option.Option<string>): number =>
  Option.getOrElse(
    Option.filter(Option.map(kept, Number), (s) => STEPS.some((step) => step === s)),
    () => 5,
  );

/** A line's timecode, as a line number: its minutes and seconds. */
const lineTime = (t: number, fps: number) => {
  const p = timecodeParts(t, fps);
  return Bool.match(Number(p.hh) > 0, {
    onTrue: () => `${p.hh}:${p.mm}:${p.ss}`,
    onFalse: () => `${p.mm}:${p.ss}`,
  });
};

/** `n` scenes, in words. */
const scenesText = (n: number) => counted(n, 'scene');

/**
 * What an approve's receipt says: what the catalogue says it gave
 * (`Project.gave`), not what was asked: `approved two`, `approved 2 scenes`,
 * or, when it gave none (each approved already, by another meanwhile),
 * `approved already`.
 */
const gaveText = (after: ProjectView): string =>
  Option.match(
    Option.flatMap(after.project.gave, (g) =>
      Arr.match(g.scenes, { onEmpty: Option.none, onNonEmpty: Option.some }),
    ),
    {
      onNone: () => 'approved already',
      onSome: (scenes) =>
        Bool.match(scenes.length === 1, {
          onTrue: () => `approved ${scenes[0]}`,
          onFalse: () => `approved ${scenesText(scenes.length)}`,
        }),
    },
  );

/** What a step reads as in Info: `5 s a still · a line a minute`. */
const stepText = (step: number, perRow: number) => {
  const line = step * perRow;
  const lineWords = Bool.match(line === 60, {
    onTrue: () => 'a minute',
    onFalse: () => `${line} s`,
  });
  return `${step} s a still · a line ${lineWords}`;
};

interface ScenesViewProps {
  /** The page's film key (a short's `<film>/shorts/<id>`). */
  readonly name: string;
  readonly player: Player;
  /** The preview's picture: the scene sheet's frame. */
  readonly stage: HTMLElement;
  readonly host: Host;
  readonly hub: Hub;
  /** The page's one client of the lab's API (`play-mount.tsx`): the scenes' reads and says go through it. */
  readonly client: Layer.Layer<LabClient>;
}

/** A film's Scenes. */
export const ScenesView = (props: ScenesViewProps) => {
  const player = props.player;
  const film = player.film;
  const address = addressOn(props.host);
  const scenes: ReadonlyArray<TapeScene> = film.placed.map((p) => ({
    id: p.spec.id,
    start: p.start,
    dur: p.dur,
  }));
  const order = scenes.map((s) => s.id);
  const short = isShortKey(props.name);
  const calls = scenesCalls(props.name, !short, props.client);
  /** Where a scene opens: its lab; a short's play page (a short has no lab). */
  const openWords = Bool.match(short, {
    onTrue: () => 'Open in Play',
    onFalse: () => 'Open in Lab',
  });
  const sceneById = (id: string) => Arr.findFirst(scenes, (s) => s.id === id);
  const indexOf = (id: string) => Math.max(0, order.indexOf(id));

  // The selection: the path's scene, and the scenes added to it (a batch's, never in the URL).
  const selectedOf = (href: string) =>
    Option.filter(
      Option.flatMap(scenesPlaceOf(href), (p) => p.scene),
      (id) => order.includes(id),
    );
  const [chosen, setChosen] = createSignal(selectedOf(address.href()), fromHost);
  const [added, setAdded] = createSignal<ReadonlyArray<string>>([], fromHost);
  onCleanup(
    onTraverse(props.host, (href) => {
      setChosen(selectedOf(href));
      setAdded([]);
    }),
  );
  /** Every scene selected, the path's first. */
  const picked = (): ReadonlyArray<string> => Arr.dedupe([...Option.toArray(chosen()), ...added()]);
  // The scene sheet is dismissed by the inspectors' one rule: no entry of its own.
  const dismissal = useSheetDismissal(props.host, (href, scene) =>
    Option.contains(selectedOf(href), scene),
  );
  /** Select `scene` (none: clear): a step Back walks; the scenes added go with it. */
  const select = (scene: Option.Option<string>) => {
    setAdded([]);
    if (Option.getOrElse(scene, () => '') === Option.getOrElse(chosen(), () => '')) return;
    if (Option.isNone(chosen())) Option.map(scene, dismissal.opening);
    Option.map(withScene(address.href(), scene), address.go);
    setChosen(scene);
  };
  /**
   * Close the scene sheet (its Close, Escape, a swipe): Back over the tap
   * that opened it, else the entry follows to the tape; the selection goes.
   */
  const dismiss = () => {
    if (Option.isNone(chosen())) return;
    setAdded([]);
    dismissal.dismiss(() => withScene(address.href(), Option.none()));
    setChosen(Option.none());
  };
  /** Add `scene` to the selection, or take it out: the first one picked is the path's. */
  const toggle = (scene: string) => {
    if (Option.isNone(chosen())) return select(Option.some(scene));
    if (Option.contains(chosen(), scene)) {
      const [next, ...rest] = added();
      setAdded([]);
      select(Option.fromUndefinedOr(next));
      setAdded(rest);
      return;
    }
    setAdded(
      Bool.match(added().includes(scene), {
        onTrue: () => added().filter((s) => s !== scene),
        onFalse: () => [...added(), scene],
      }),
    );
  };
  // Commands read every scene selected, the path's first.
  onCleanup(
    props.hub.refine((ctx) => ({
      ...ctx,
      selection: [
        ...ctx.selection,
        ...untrack(added)
          .filter((s) => !Option.contains(untrack(chosen), s))
          .map((scene) => Selection.cases.Scene.make({ film: props.name, scene })),
      ],
    })),
  );

  // The header's timecode is the playhead's, every time it moves, drawn or not.
  usePlayerTime(player);
  // The playhead, and the captions on or off, as the preview draws them.
  const [T, setT] = createSignal(player.now(), { ...fromHost, equals: false });
  const [playing, setPlaying] = createSignal(player.playing(), fromHost);
  const [captions, setCaptions] = createSignal(player.captions.on, fromHost);
  onCleanup(
    player.onDraw((t) => {
      setT(t);
      setPlaying(player.playing());
      setCaptions(player.captions.on);
    }),
  );

  // What the lab knows of each scene: the project and the check, read once; a say's answer
  // carries the project alone.
  const [read, setRead] = createSignal<ScenesRead>(
    { project: Option.none(), check: Result.succeed([]) },
    fromHost,
  );
  Effect.runFork(Effect.tap(calls.read, (r) => Effect.sync(() => setRead(r))));
  const marks = createMemo(() => marksOf(read().project, findingsOf(read()), scenes));

  // The tape: its step kept per viewer, its line length the window's.
  const step = useAtomValue(() => keptStep);
  const keepStep = useAtomSet(() => keptStep);
  const phone = useMatches(props.host, PHONE);
  const tape = createMemo(() => tapeOf(scenes, film.duration, stepOf(step()), perRowAt(phone())));
  const [follow, setFollow] = createSignal(true, fromHost);

  // The stills: one at a time, a frame apart, the lines on screen first; drawn as the
  // preview draws, with its captions or without them (its toggle, C): turned, the tape
  // is drawn again.
  const nowMs = monotonicMs(props.host);
  const opened = nowMs();
  const stills = createMemo(() => {
    const made = makeStills(film, {
      width: STILL_W,
      captions: captions(),
      turn: () => Effect.runPromiseWith(props.host)(Frames.use((f) => f.next)),
      now: nowMs,
    });
    // Left, or drawn again, they draw no more: the queue goes, and a still wanted after is not drawn.
    onCleanup(made.stop);
    return made;
  });
  const [firstStill, setFirstStill] = createSignal(Option.none<number>(), fromHost);
  createEffect(stills, (s) =>
    s.onDrawn(() => {
      if (Option.isNone(untrack(firstStill))) setFirstStill(Option.some(nowMs() - opened));
    }),
  );
  // The lines on screen first (`useOnScreenFirst`, the Project's cards' order too).
  const onScreen = useOnScreenFirst((times) => untrack(stills).want(times));
  createEffect(
    () => ({ t: tape(), s: stills() }),
    ({ t, s }) => {
      // Every still of the tape, in its order; the lines on screen go ahead of them as they are seen.
      s.want(t.rows.flatMap((r) => r.stills.map((still) => still.t)));
      onScreen.ask();
    },
  );

  // Follow: while it plays, the playhead's line stays in sight.
  const rows = new Map<number, HTMLElement>();
  createEffect(
    () => Option.liftPredicate(placeOf(tape(), T()).row, () => playing() && follow()),
    (row) => {
      Option.map(
        Option.flatMap(row, (r) => Option.fromUndefinedOr(rows.get(r))),
        (el) => el.scrollIntoView({ block: 'nearest' }),
      );
    },
  );

  /** Show film second `t` and select its scene. */
  const showAt = (t: number) => {
    Option.map(sceneAt(scenes, t), (s) => select(Option.some(s.id)));
    player.seek(t);
  };

  /**
   * Say `say` of `ids`, in one say; the receipt says `what` (from the
   * project it leaves), or why not. An approve's offers its Undo
   * (`approveUndo`), as Project's does.
   */
  const sayOf = (
    ids: readonly [string, ...string[]],
    what: (after: ProjectView) => string,
    say: Say,
  ) =>
    Effect.map(calls.say(ids, say), (answer: Said) => {
      if (answer._tag === 'Refused') return refused(answer.reason);
      setRead({ ...read(), project: Option.some(answer.project) });
      return said(what(answer.project), approveUndo(props.name, answer.project));
    });
  // An approve's Undo: one withdraw of just the approvals it gave, said in the words of
  // what the catalogue took.
  const [undoing, setUndoing] = createSignal(false, fromHost);
  onCleanup(
    props.hub.commands.register(
      undoApprove(props.name, {
        waiting: undoing,
        withdraw: (ids, say) =>
          Effect.sync(() => setUndoing(true)).pipe(
            Effect.andThen(
              sayOf(
                ids,
                (after) =>
                  Option.match(after.project.took, {
                    onNone: () => `withdrew ${scenesText(ids.length)}`,
                    onSome: (took) => tookText({ _tag: 'Scenes', ids }, took),
                  }),
                say,
              ),
            ),
            Effect.ensuring(Effect.sync(() => setUndoing(false))),
          ),
      }),
    ),
  );

  /** Whether `scene`'s render is current and not yet approved as it is: what Approve takes. */
  const approvable = (scene: string) =>
    Option.exists(marks()(scene).render, (r) => r.state === 'current' && r.approval !== 'approved');

  /** What Approve says on `scene`: approved already, waiting on a render, or ready. */
  const approveWords = (scene: string) =>
    Option.match(marks()(scene).render, {
      onNone: () => 'Approve',
      onSome: (r) =>
        Match.value(r).pipe(
          Match.when({ approval: 'approved' }, () => 'Approved'),
          Match.when({ state: 'current' }, () => 'Approve'),
          Match.orElse(() => 'Approve · render first'),
        ),
    });

  /** The lab at the playhead when it is in `scene`, else at the scene's start; a short's play page. */
  const labHref = (scene: string) => {
    if (short) return pageHref.play(props.name, Option.some(onTheMs(T())));
    const into = Option.flatMap(sceneById(scene), (s) =>
      Option.liftPredicate(T() - s.start, (t) => t >= 0 && t < s.dur),
    );
    return pageHref.labScene(props.name, scene, {}, Option.map(into, onTheMs));
  };
  const openLab = (scene: string) =>
    Effect.runForkWith(props.host)(PageLoad.use((load) => load.open(labHref(scene))));

  const sceneIn = (ctx: Context) => Option.map(selected(ctx, 'Scene'), (s) => s.scene);
  const [palette, setPalette] = createSignal(false, fromHost);
  const [info, setInfo] = createSignal(false, fromHost);
  const commands: ReadonlyArray<Command> = [
    {
      id: 'scenes.open-lab',
      label: openWords,
      group: 'Scene',
      keys: ['e'],
      about: ['Scene'],
      touch: 'Open in Lab on the selected scene, or long-press a still',
      when: (ctx) => Option.isSome(sceneIn(ctx)),
      run: quietly((ctx) => Option.map(sceneIn(ctx), openLab)),
    },
    {
      id: 'scenes.approve',
      label: 'Approve',
      group: 'Scene',
      keys: ['a'],
      about: ['Scene'],
      touch: 'Approve on the selected scene, or long-press a still',
      when: (ctx) => Option.exists(sceneIn(ctx), approvable),
      run: (ctx) =>
        Option.match(sceneIn(ctx), {
          onNone: () => Effect.succeed(quiet),
          onSome: (scene) => sayOf([scene], gaveText, { _tag: 'Approve' }),
        }),
    },
    {
      id: 'scenes.approve-selected',
      label: 'Approve the selected scenes',
      group: 'Scene',
      keys: ['shift+a'],
      about: ['Scene'],
      touch: 'select scenes (long-press a still, Add to selection), then this',
      when: () => picked().length > 1 && picked().some(approvable),
      run: () =>
        Arr.match(picked().filter(approvable), {
          onEmpty: () => Effect.succeed(quiet),
          onNonEmpty: (ids) => sayOf(ids, gaveText, { _tag: 'Approve' }),
        }),
    },
    {
      id: 'scenes.add',
      label: 'Add to selection',
      labelIn: (ctx) =>
        Bool.match(
          Option.exists(sceneIn(ctx), (s) => picked().includes(s)),
          { onTrue: () => 'Remove from selection', onFalse: () => 'Add to selection' },
        ),
      group: 'Scene',
      about: ['Scene'],
      touch: 'long-press a still',
      when: (ctx) => Option.isSome(sceneIn(ctx)) && Option.isSome(chosen()),
      run: quietly((ctx) => Option.map(sceneIn(ctx), toggle)),
    },
    {
      id: 'scenes.clear',
      label: 'Clear the selection',
      group: 'Scene',
      keys: ['escape'],
      about: ['Scene'],
      touch: 'long-press a still, then Clear the selection',
      when: () => Option.isSome(chosen()),
      run: quietly(dismiss),
    },
    {
      id: 'scenes.finer',
      label: 'Finer tape',
      // The step it goes to, as the view menu (⋯) names it: the tape's step is said nowhere at rest.
      labelIn: () => `Finer tape: ${stepFrom(stepOf(step()), false)} s a still`,
      group: 'View',
      keys: ['mod+='],
      touch: 'the view menu (⋯)',
      when: () => stepOf(step()) > (STEPS[0] ?? 0),
      run: quietly(() => keepStep(String(stepFrom(stepOf(step()), false)))),
    },
    {
      id: 'scenes.coarser',
      label: 'Coarser tape',
      labelIn: () => `Coarser tape: ${stepFrom(stepOf(step()), true)} s a still`,
      group: 'View',
      keys: ['mod+-'],
      touch: 'the view menu (⋯)',
      when: () => stepOf(step()) < (STEPS.at(-1) ?? 0),
      run: quietly(() => keepStep(String(stepFrom(stepOf(step()), true)))),
    },
    {
      id: 'scenes.follow',
      label: 'Follow',
      labelIn: () =>
        Bool.match(follow(), { onTrue: () => 'Stop following', onFalse: () => 'Follow' }),
      group: 'View',
      keys: ['f'],
      touch: 'Follow, over the tape',
      when: () => true,
      run: quietly(() => setFollow(!follow())),
    },
    {
      id: 'scenes.palette',
      label: 'Palette',
      group: 'View',
      touch: 'the view menu (⋯)',
      when: () => Object.keys(film.palette).length > 0,
      run: quietly(() => setPalette(true)),
    },
    {
      id: 'scenes.info',
      label: 'Info',
      group: 'View',
      touch: 'the view menu (⋯)',
      when: () => true,
      run: quietly(() => setInfo(true)),
    },
  ];
  onCleanup(props.hub.commands.register(...commands));

  /** The tape bar: the acts ruler over the preview's track, the legend and Follow. */
  const acts = createMemo(() =>
    Option.match(read().project, {
      onNone: () => [],
      onSome: (v) =>
        v.project.acts.flatMap((act) => {
          const own = scenes.filter((s) => act.scenes.includes(s.id));
          return Option.toArray(
            Option.map(Arr.head(own), (first) => {
              const last = own.at(-1) ?? first;
              return { name: act.name, from: first.start, to: last.start + last.dur };
            }),
          );
        }),
    }),
  );
  const pct = (t: number) => `${(t / Math.max(film.duration, 1e-6)) * 100}%`;
  /** The tape scrubs by one press at a time, on whichever line: a second finger's scrubs nothing. */
  const lines = new Surface('the tape');

  /** One line of the tape. */
  const Line = (line: { readonly row: TapeRow }) => {
    const row = untrack(() => line.row);
    const span = () => tape().span;
    const x = (t: number) => `${((t - row.from) / span()) * 100}%`;
    const [px, setPx] = createSignal(0, fromHost);
    const sized = new ResizeObserver((entries) => {
      for (const entry of entries) setPx(entry.contentRect.width);
    });
    onCleanup(() => sized.disconnect());
    /** Each cut's name, by scene: which side of its rule, and the most px it takes. */
    const names = createMemo(() => {
      const placed = cutNames(row.cuts, px(), CHAR_PX);
      return new Map(row.cuts.map((c, k) => [c.scene, placed[k] ?? NO_CUT_NAME]));
    });
    const nameOf = (scene: string) => names().get(scene) ?? NO_CUT_NAME;
    const at = (e: PointerEvent | MouseEvent, body: HTMLElement) => {
      const r = body.getBoundingClientRect();
      return timeAt(tape(), row.index, (e.clientX - r.left) / Math.max(r.width, 1));
    };
    // The line's watch stops with the line (its owner), not in its ref, which has none; a
    // line laid out afresh in its place may hold its row's entry by then.
    let unwatch = () => {};
    let mine = Option.none<HTMLElement>();
    onCleanup(() => {
      unwatch();
      if (Option.exists(mine, (el) => rows.get(row.index) === el)) rows.delete(row.index);
    });
    return (
      <div
        class="sc-line"
        data-row={row.index}
        ref={(el: HTMLDivElement) => {
          mine = Option.some(el);
          rows.set(row.index, el);
          unwatch = onScreen.watch(el, () => row.stills.map((s) => s.t));
        }}
      >
        <span class="sc-line-tc">{lineTime(row.from, film.fps)}</span>
        <div
          class="sc-line-body"
          ref={(el: HTMLDivElement) => sized.observe(el)}
          onPointerDown={(e: PointerEvent) => {
            if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return;
            const body = e.currentTarget;
            if (!(body instanceof HTMLElement)) return;
            // A drag along the line scrubs; it settles where it ends (a tap selects, below).
            Effect.runForkWith(props.host)(
              Pointer.use((pointer) =>
                pointer.press(e, lines, () =>
                  Option.some({
                    // Scrubbing away from the playhead stops following it (design §6).
                    move: (ev: PointerEvent) => {
                      setFollow(false);
                      player.scrub(at(ev, body));
                    },
                    end: () => player.settle(),
                  }),
                ),
              ),
            );
          }}
          onClick={(e: MouseEvent) => {
            const body = e.currentTarget;
            if (!(body instanceof HTMLElement)) return;
            const t = at(e, body);
            if (e.shiftKey || e.metaKey || e.ctrlKey)
              return Option.map(sceneAt(scenes, t), (s) => toggle(s.id));
            showAt(t);
          }}
        >
          <div class="sc-cuts">
            <For each={row.cuts} keyed={(c) => c.scene}>
              {(cut) => (
                <span
                  class="sc-cut"
                  data-scene={cut().scene}
                  data-flip={String(nameOf(cut().scene).side === 'before')}
                  data-named={String(nameOf(cut().scene).side !== 'none')}
                  style={{ left: x(cut().at) }}
                >
                  <i
                    class="sc-dot"
                    data-state={Option.getOrElse(bandState(marks()(cut().scene)), () => 'none')}
                  />
                  <span
                    class="sc-cut-name"
                    style={{ 'max-width': `${nameOf(cut().scene).width}px` }}
                  >
                    {cut().scene}
                  </span>
                </span>
              )}
            </For>
          </div>
          <div class="sc-stills">
            <For each={row.stills} keyed={(s) => s.t}>
              {(still) => {
                const t = untrack(() => still().t);
                // The still of the stills drawn now: none again while they are drawn again.
                const [canvas, setCanvas] = createSignal(untrack(stills).at(t), fromHost);
                createEffect(stills, (s) => {
                  setCanvas(s.at(t));
                  return s.onDrawn(() => {
                    if (Option.isNone(untrack(canvas))) setCanvas(s.at(t));
                  });
                });
                return (
                  <div
                    class="sc-still"
                    data-t={String(still().t)}
                    data-scene={still().scene}
                    data-drawn={String(Option.isSome(canvas()))}
                    data-selected={String(Option.contains(chosen(), still().scene))}
                    data-picked={String(picked().includes(still().scene))}
                    data-target={targetAttr(
                      Selection.cases.Scene.make({ film: props.name, scene: still().scene }),
                    )}
                  >
                    {Option.getOrUndefined(canvas())}
                  </div>
                );
              }}
            </For>
          </div>
          <div class="sc-band">
            <For each={row.bands} keyed={(b) => b.scene}>
              {(band) => (
                <span
                  data-scene={band().scene}
                  data-state={Option.getOrElse(bandState(marks()(band().scene)), () => 'none')}
                  style={{
                    left: `${band().x0 * 100}%`,
                    width: `${(band().x1 - band().x0) * 100}%`,
                    '--hue': sceneHue(band().index),
                  }}
                />
              )}
            </For>
          </div>
          <Show when={placeOf(tape(), T()).row === row.index}>
            <span class="sc-playhead" style={{ left: x(T()) }} />
          </Show>
        </div>
      </div>
    );
  };

  /**
   * What the selected scene's sheet holds (`Sheet`, the Project's scene
   * inspector's): its card, its findings (`SceneFindings`), its comments and
   * a comment box.
   */
  const Focus = (focus: { readonly scene: string }) => {
    const scene = untrack(() => focus.scene);
    const [saying, setSaying] = createSignal(false, fromHost);
    /** Say `text` of the scene, its receipt announced; whether it was said. */
    const sayComment = (text: string) => {
      setSaying(true);
      return Effect.runPromise(
        Effect.map(
          sayOf([scene], () => `commented on ${scene}`, { _tag: 'Comment', text }),
          (receipt) => {
            setSaying(false);
            props.hub.announce(receipt, 'scenes.comment');
            return receipt._tag === 'Said' && receipt.tone === 'done';
          },
        ),
      );
    };
    const comments = () =>
      Option.getOrElse(
        Option.map(marks()(scene).render, (r) => r.comments),
        () => [],
      );
    return (
      <>
        <SceneCard
          film={props.name}
          scene={scene}
          index={indexOf(scene)}
          span={Option.map(sceneById(scene), (s) => ({ start: s.start, dur: s.dur }))}
          fps={film.fps}
          marks={marks()(scene)}
          size="focus"
          selected
          picture={
            <div
              class="sc-live"
              ref={(el: HTMLDivElement) => {
                el.append(props.stage);
              }}
            />
          }
          verb={
            <>
              <button
                type="button"
                class="sh-btn"
                data-act="open-lab"
                data-primary=""
                onClick={() => openLab(scene)}
              >
                {openWords} <kbd>E</kbd>
              </button>
              <Show when={!short}>
                <button
                  type="button"
                  class="sh-btn"
                  data-act="approve"
                  disabled={!approvable(scene)}
                  onClick={() =>
                    props.hub.invokeId('scenes.approve', { step: 'normal', via: 'button' })
                  }
                >
                  {approveWords(scene)} <kbd>A</kbd>
                </button>
              </Show>
              <Show when={picked().length > 1}>
                <button
                  type="button"
                  class="sh-btn"
                  data-act="approve-selected"
                  disabled={!picked().some(approvable)}
                  onClick={() =>
                    props.hub.invokeId('scenes.approve-selected', { step: 'normal', via: 'button' })
                  }
                >
                  {`Approve ${scenesText(picked().filter(approvable).length)}`} <kbd>⇧A</kbd>
                </button>
              </Show>
            </>
          }
        />
        <SceneState marks={marks()(scene)} />
        <SceneFindings marks={marks()(scene)} />
        <Show when={!short && Option.isSome(read().project)}>
          <section class="sc-section" data-section="comment">
            <h3>
              Comments <span>{comments().length}</span>
            </h3>
            <Comments comments={comments()} />
            <SayBox disabled={saying()} say={sayComment} />
          </section>
        </Show>
      </>
    );
  };
  /** The selected scene (the path's), as the sheet's footer and its target name it. */
  const focused = () => Option.getOrElse(chosen(), () => '');

  const legend = createMemo(() => legendOf(scenes, marks(), read().check));
  // The page scrolls as a whole, the tape bar and the card held under the header.
  document.body.classList.add('scenes');
  onCleanup(() => document.body.classList.remove('scenes'));
  return (
    <div class="sc" data-selected={String(Option.isSome(chosen()))}>
      {/* With no scene selected the tape takes the page: the picture waits here, unseen, for the scene's sheet. */}
      <div
        class="sc-park"
        hidden
        ref={(el: HTMLDivElement) => {
          el.append(props.stage);
        }}
      />
      <div class="sc-main">
        <div class="sc-tapebar">
          <Show when={acts().length > 0}>
            <div class="sc-acts" data-role="acts">
              <For each={acts()} keyed={(a) => a.name}>
                {(act) => (
                  <span
                    class="sc-act"
                    data-act-name={act().name}
                    style={{ left: pct(act().from), width: pct(act().to - act().from) }}
                  >
                    {act().name}
                  </span>
                )}
              </For>
            </div>
          </Show>
          {/* A press on the preview's track (the bar's one part shown here) scrubs or seeks away
              from the playhead: Follow turns off (design §6). The track's own handler follows the
              press; this only hears it pass. */}
          <div
            class="sc-track"
            ref={(el: HTMLDivElement) => el.append(player.bar)}
            onPointerDown={(e: PointerEvent) => {
              if (e.target instanceof Node && player.track.contains(e.target)) setFollow(false);
            }}
          />
          {/* One row, whatever the film's marks: the colour key scrolls in its own strip.
              Its counts and the tape's step are Info's (⋯). */}
          <div class="sc-legend">
            <span class="sc-legend-items">
              <For each={legend()} keyed={(l) => l.mark}>
                {(l) => (
                  <span
                    class="sc-legend-item"
                    data-mark={l().mark}
                    data-state={l().state}
                    title={l().why}
                  >
                    <i class="sc-dot" data-state={l().state} />
                    {l().word}
                  </span>
                )}
              </For>
            </span>
            <span class="sc-spacer" />
            <button
              type="button"
              class="sh-btn sc-follow"
              data-act="follow"
              aria-pressed={pressed(follow())}
              onClick={() => {
                setFollow(!follow());
              }}
            >
              <i class="sc-dot" />
              Follow
            </button>
          </div>
        </div>
        <div
          class="sc-tape"
          style={{ '--rows': String(tape().rows.length), '--per-row': String(tape().perRow) }}
          data-role="tape"
          data-stills={String(tape().rows.reduce((n, r) => n + r.stills.length, 0))}
          data-step={String(tape().step)}
          data-line={String(tape().step * tape().perRow)}
          data-first-still={Option.getOrElse(
            Option.map(firstStill(), (ms) => String(Math.round(ms))),
            () => '',
          )}
        >
          {/* A line is its own tape's row: a new step or a new width lays the tape out afresh. */}
          <For each={tape().rows}>{(row) => <Line row={row} />}</For>
        </div>
      </div>
      {/* One sheet while a scene is selected, its contents the scene's: a tap on another
          still keeps it as it stands (lowered or raised) and shows that scene. On a phone
          it opens lowered, its card in brief over the tab bar; its Close (and Escape, and a
          swipe) clears the selection by the inspectors' rule (`dismiss`): Back over the tap
          that opened it, else the entry follows to the tape. The focus stays on the tape. */}
      <Show when={Option.isSome(chosen())}>
        <Sheet
          host={props.host}
          hub={props.hub}
          of={Selection.cases.Scene.make({ film: props.name, scene: focused() })}
          role="scene"
          class="sc-focus"
          peeked
          title={
            <>
              Scene <span>{`${indexOf(focused()) + 1} of ${scenes.length}`}</span>
              <Show when={picked().length > 1}>
                <span class="sc-picked" data-role="picked">
                  {`${scenesText(picked().length)} selected`}
                </span>
              </Show>
            </>
          }
          initialFocus={() => false}
          onClose={dismiss}
        >
          <Show when={Option.getOrUndefined(chosen())} keyed>
            {(scene) => <Focus scene={scene} />}
          </Show>
        </Sheet>
      </Show>
      <Dialog.Root open={palette()} onOpenChange={setPalette}>
        <Dialog.Portal>
          <Dialog.Backdrop class="lab-sheet-backdrop" />
          <Dialog.Popup class="lab-keys-sheet sc-sheet" data-role="palette">
            <Dialog.Title class="lab-sheet-title">Palette</Dialog.Title>
            <Dialog.Description class="lab-sheet-about">
              {`${film.title}'s colours, by name.`}
            </Dialog.Description>
            <div class="sc-swatches">
              <For each={Object.entries(film.palette)}>
                {([name, color]) => (
                  <div class="sc-swatch" data-swatch={name}>
                    <span class="sc-swatch-chip" style={{ background: color }} />
                    <b>{name}</b>
                    <span>{color}</span>
                  </div>
                )}
              </For>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={info()} onOpenChange={setInfo}>
        <Dialog.Portal>
          <Dialog.Backdrop class="lab-sheet-backdrop" />
          <Dialog.Popup class="lab-keys-sheet sc-sheet" data-role="info">
            <Dialog.Title class="lab-sheet-title">Info</Dialog.Title>
            <dl class="sc-card-facts">
              <dt>film</dt>
              <dd>{film.title}</dd>
              <dt>length</dt>
              <dd>{timecode(film.duration, film.fps)}</dd>
              <dt>scenes</dt>
              <dd>{scenes.length}</dd>
              <Show when={legend().length > 0}>
                <dt>marks</dt>
                <dd data-fact="marks">
                  {legend()
                    .map((l) => l.text)
                    .join(' · ')}
                </dd>
              </Show>
              <dt>stills</dt>
              <dd data-fact="stills">
                {`${tape().rows.reduce((n, r) => n + r.stills.length, 0)} · ${stepText(tape().step, tape().perRow)}`}
              </dd>
              <dt>drawn</dt>
              <dd>{`${stills().drawn().count} in ${Math.round(stills().drawn().ms)} ms`}</dd>
            </dl>
            <p class="lab-sheet-about">
              Tap a still to select its scene; drag along a line to scrub; ⇧-click to add a scene.
            </p>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
