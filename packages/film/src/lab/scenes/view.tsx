// A film's Scenes (`/films/<film>/scenes[/<scene>]`, design language §6):
// the whole film end to end as stills, wrapped like lines of text (the tape,
// `tape.ts`), under the tape bar (the acts ruler, the preview's track of
// scene bands, ticks and playhead, then the legend, the step and Follow).
// Each still is the frame at the middle of its step, drawn from the code as
// it stands by the one source of stills (`player/stills.ts`), the lines on
// screen first. A line's time is its timecode; each cut is a rule at its
// scene's exact time with the scene's name where it has room, and a band
// under the line says each scene's state in its colour.
//
// A tap on a still selects its scene and moves the playhead there; a drag
// along a line scrubs it. The selected scene's card (`card.tsx`, the card
// the Project shows) is the inspector's focus panel at the side, a sheet
// over the tab bar on a phone: the live frame, its act, in, out and length,
// its marks, Open in Lab (E) and Approve (A), its findings and a comment.
// ⇧-click or ⌘-click adds scenes to the selection, and ⇧A approves them all.
// The selection is the URL's path and the playhead its `#t=` (`place.ts`):
// Back steps through the selections. ⌘+ and ⌘− step the tape between 2.5,
// 5 and 10 s a still (kept in this browser); the palette and the film's
// counts are in the view menu (⋯).

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Dialog } from '@bible/ui/dialog';
import { For, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Match, Option } from 'effect';
import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { type Host, addressOn, monotonicMs, onTraverse } from '../../browser/host.ts';
import { Frames } from '../../browser/frames.ts';
import { PageLoad } from '../../browser/page-load.ts';
import { Pointer } from '../../browser/pointer.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import { type Command, quiet, refused, said } from '../../command/command.ts';
import { type Context, selected } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import { type Say, pageHref } from '../../core/api.ts';
import { isShortKey } from '../../core/shorts.ts';
import { timecode, timecodeParts } from '../../core/time.ts';
import type { Player } from '../../player/main.ts';
import { makeStills } from '../../player/stills.ts';
import { onTheMs } from '../../player/t-in-url.ts';
import { useShellTime } from '../page-shell.tsx';
import { SceneCard, sceneHue } from './card.tsx';
import { type Said, type ScenesRead, scenesCalls } from './data.ts';
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
  sceneAt,
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

/** Whether `on` holds, as an ARIA state. */
const ariaOf = (on: boolean) => `${on}` as const;

/** `n` scenes, in words. */
const scenesText = (n: number) =>
  Bool.match(n === 1, { onTrue: () => '1 scene', onFalse: () => `${n} scenes` });

/** What a step reads as on the legend: `5 s a still · a line a minute`. */
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
  /** The preview's picture: the focus panel's frame. */
  readonly stage: HTMLElement;
  readonly host: Host;
  readonly hub: Hub;
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
  const calls = scenesCalls(props.name, !short);
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
  /** Select `scene` (none: clear): a step Back walks; the scenes added go with it. */
  const select = (scene: Option.Option<string>) => {
    setAdded([]);
    if (Option.getOrElse(scene, () => '') === Option.getOrElse(chosen(), () => '')) return;
    Option.map(withScene(address.href(), scene), address.push);
    setChosen(scene);
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

  // The playhead, as the preview draws it.
  const [T, setT] = createSignal(player.now(), { ...fromHost, equals: false });
  const [playing, setPlaying] = createSignal(player.playing(), fromHost);
  onCleanup(
    player.onDraw((t) => {
      setT(t);
      setPlaying(player.playing());
    }),
  );
  useShellTime(T, film.fps);

  // What the lab knows of each scene: read once, and again after each say.
  const [read, setRead] = createSignal<ScenesRead>(
    { project: Option.none(), findings: [] },
    fromHost,
  );
  Effect.runFork(Effect.tap(calls.read, (r) => Effect.sync(() => setRead(r))));
  const marks = createMemo(() => marksOf(read().project, read().findings));

  // The tape: its step kept per viewer, its line length the window's.
  const step = useAtomValue(() => keptStep);
  const keepStep = useAtomSet(() => keptStep);
  const [wide, setWide] = createSignal(document.documentElement.clientWidth, fromHost);
  const resized = () => setWide(document.documentElement.clientWidth);
  window.addEventListener('resize', resized);
  onCleanup(() => window.removeEventListener('resize', resized));
  const tape = createMemo(() => tapeOf(scenes, film.duration, stepOf(step()), perRowAt(wide())));
  const [follow, setFollow] = createSignal(true, fromHost);
  // A press on the tape bar's track scrubs or seeks away from the playhead: Follow turns off (design §6).
  const unfollow = () => setFollow(false);
  player.track.addEventListener('pointerdown', unfollow);
  onCleanup(() => player.track.removeEventListener('pointerdown', unfollow));

  // The stills: one at a time, a frame apart, the lines on screen first.
  const nowMs = monotonicMs(props.host);
  const opened = nowMs();
  const stills = makeStills(film, {
    width: STILL_W,
    captions: player.captions.on,
    turn: () => Effect.runPromiseWith(props.host)(Frames.use((f) => f.next)),
    now: nowMs,
  });
  const [firstStill, setFirstStill] = createSignal(Option.none<number>(), fromHost);
  onCleanup(
    stills.onDrawn(() => {
      if (Option.isNone(untrack(firstStill))) setFirstStill(Option.some(nowMs() - opened));
    }),
  );
  const onScreen = new Set<number>();
  /** Ask for the stills of the lines on screen first. */
  const wantOnScreen = () =>
    stills.want(
      [...onScreen]
        .toSorted((a, b) => a - b)
        .flatMap((r) =>
          Option.match(Arr.get(untrack(tape).rows, r), {
            onNone: () => [],
            onSome: (row) => row.stills.map((s) => s.t),
          }),
        ),
    );
  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) continue;
        const row = Number(entry.target.dataset['row']);
        if (entry.isIntersecting) onScreen.add(row);
        else onScreen.delete(row);
      }
      wantOnScreen();
    },
    { rootMargin: '120px 0px' },
  );
  onCleanup(() => watch.disconnect());
  createEffect(tape, (t) => {
    // Every still of the tape, in its order; the lines on screen go ahead of them as they are seen.
    stills.want(t.rows.flatMap((r) => r.stills.map((s) => s.t)));
    wantOnScreen();
  });

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

  /** Say `say` of `ids` (a run of neighbours at a time); the receipt says `what`, or why not. */
  const sayOf = (ids: ReadonlyArray<string>, what: string, say: Say) =>
    Effect.map(calls.say(ids, order, say), (answer: Said) => {
      if (answer._tag === 'Refused') return refused(answer.reason);
      setRead({ ...read(), project: Option.some(answer.project) });
      return said(what);
    });

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
      run: (ctx) =>
        Effect.sync(() => {
          Option.map(sceneIn(ctx), openLab);
          return quiet;
        }),
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
          onSome: (scene) => sayOf([scene], `approved ${scene}`, { _tag: 'Approve' }),
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
      run: () => {
        const ids = picked().filter(approvable);
        return sayOf(ids, `approved ${scenesText(ids.length)}`, { _tag: 'Approve' });
      },
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
      run: (ctx) =>
        Effect.sync(() => {
          Option.map(sceneIn(ctx), toggle);
          return quiet;
        }),
    },
    {
      id: 'scenes.clear',
      label: 'Clear the selection',
      group: 'Scene',
      keys: ['escape'],
      when: () => Option.isSome(chosen()),
      run: () =>
        Effect.sync(() => {
          select(Option.none());
          return quiet;
        }),
    },
    {
      id: 'scenes.finer',
      label: 'Finer tape',
      group: 'View',
      keys: ['mod+='],
      touch: 'the view menu (⋯)',
      when: () => stepOf(step()) > (STEPS[0] ?? 0),
      run: () =>
        Effect.sync(() => {
          keepStep(String(stepFrom(stepOf(step()), false)));
          return quiet;
        }),
    },
    {
      id: 'scenes.coarser',
      label: 'Coarser tape',
      group: 'View',
      keys: ['mod+-'],
      touch: 'the view menu (⋯)',
      when: () => stepOf(step()) < (STEPS.at(-1) ?? 0),
      run: () =>
        Effect.sync(() => {
          keepStep(String(stepFrom(stepOf(step()), true)));
          return quiet;
        }),
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
      run: () =>
        Effect.sync(() => {
          setFollow(!follow());
          return quiet;
        }),
    },
    {
      id: 'scenes.palette',
      label: 'Palette',
      group: 'View',
      touch: 'the view menu (⋯)',
      when: () => Object.keys(film.palette).length > 0,
      run: () =>
        Effect.sync(() => {
          setPalette(true);
          return quiet;
        }),
    },
    {
      id: 'scenes.info',
      label: 'Info',
      group: 'View',
      touch: 'the view menu (⋯)',
      when: () => true,
      run: () =>
        Effect.sync(() => {
          setInfo(true);
          return quiet;
        }),
    },
  ];
  onCleanup(props.hub.commands.register(...commands));

  /** The tape bar: the acts ruler over the preview's track, the legend, the step and Follow. */
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
    return (
      <div
        class="sc-line"
        data-row={row.index}
        ref={(el: HTMLDivElement) => {
          rows.set(row.index, el);
          watch.observe(el);
          onCleanup(() => {
            watch.unobserve(el);
            rows.delete(row.index);
          });
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
                pointer.drag(e, {
                  // Scrubbing away from the playhead stops following it (design §6).
                  move: (ev) => {
                    setFollow(false);
                    player.scrub(at(ev, body));
                  },
                  end: () => player.settle(),
                }),
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
          <div class="sc-stills" style={{ '--per-row': String(tape().perRow) }}>
            <For each={row.stills} keyed={(s) => s.t}>
              {(still) => {
                const t = untrack(() => still().t);
                const [canvas, setCanvas] = createSignal(stills.at(t), fromHost);
                onCleanup(
                  stills.onDrawn(() => {
                    if (Option.isNone(untrack(canvas))) setCanvas(stills.at(t));
                  }),
                );
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

  /** The selected scene's card: the focus panel, a sheet over the tab bar on a phone. */
  const [expanded, setExpanded] = createSignal(false, fromHost);
  const Focus = (focus: { readonly scene: string }) => {
    const scene = untrack(() => focus.scene);
    const [comment, setComment] = createSignal('', fromHost);
    const [saying, setSaying] = createSignal(false, fromHost);
    const sayComment = () => {
      const text = comment().trim();
      if (text === '' || saying()) return;
      setSaying(true);
      Effect.runFork(
        Effect.tap(sayOf([scene], `commented on ${scene}`, { _tag: 'Comment', text }), (receipt) =>
          Effect.sync(() => {
            setSaying(false);
            if (receipt._tag === 'Said' && receipt.tone === 'done') setComment('');
            props.hub.announce(receipt, 'scenes.comment');
          }),
        ),
      );
    };
    return (
      <aside class="sc-focus" data-expanded={String(expanded())} aria-label={`scene ${scene}`}>
        <div class="sc-focus-head">
          <button
            type="button"
            class="sc-grip"
            data-act="sheet"
            aria-label={Bool.match(expanded(), {
              onTrue: () => 'Show less',
              onFalse: () => 'Show more',
            })}
            aria-expanded={ariaOf(expanded())}
            onClick={() => {
              setExpanded(!expanded());
            }}
          />
          <span class="sc-panel-title">
            Scene <span>{`${indexOf(scene) + 1} of ${scenes.length}`}</span>
          </span>
          <Show when={picked().length > 1}>
            <span class="sc-picked" data-role="picked">
              {`${scenesText(picked().length)} selected`}
            </span>
          </Show>
        </div>
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
                class="sc-verb"
                data-act="open-lab"
                data-primary=""
                onClick={() => openLab(scene)}
              >
                {openWords} <kbd>E</kbd>
              </button>
              <Show when={!short}>
                <button
                  type="button"
                  class="sc-verb"
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
                  class="sc-verb"
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
        >
          <Show when={marks()(scene).findings.length > 0}>
            <section class="sc-section" data-section="findings">
              <h3>
                Findings <span>{marks()(scene).findings.length}</span>
              </h3>
              <For each={marks()(scene).findings}>
                {(line) => (
                  <p class="sc-finding" data-level={line.level}>
                    <b>{line.tag}</b> {line.message}
                  </p>
                )}
              </For>
            </section>
          </Show>
          <Show when={!short && Option.isSome(read().project)}>
            <section class="sc-section" data-section="comment">
              <h3>
                Comments{' '}
                <span>
                  {Option.getOrElse(
                    Option.map(marks()(scene).render, (r) => r.comments.length),
                    () => 0,
                  )}
                </span>
              </h3>
              <For
                each={Option.getOrElse(
                  Option.map(marks()(scene).render, (r) => r.comments),
                  () => [],
                )}
              >
                {(c) => <p class="sc-comment">{c.text}</p>}
              </For>
              <textarea
                class="sc-say"
                rows="2"
                placeholder={`Comment on ${scene}…`}
                value={comment()}
                disabled={saying()}
                onInput={(e: InputEvent) => {
                  const box = e.currentTarget;
                  if (box instanceof HTMLTextAreaElement) setComment(box.value);
                }}
              />
              <button
                type="button"
                class="sc-verb"
                data-act="comment"
                disabled={saying() || comment().trim() === ''}
                onClick={sayComment}
              >
                Comment
              </button>
            </section>
          </Show>
        </SceneCard>
      </aside>
    );
  };

  const legend = createMemo(() => legendOf(order, marks()));
  // The page scrolls as a whole, the tape bar and the card held under the header.
  document.body.classList.add('scenes');
  onCleanup(() => document.body.classList.remove('scenes'));
  return (
    <div class="sc" data-selected={String(Option.isSome(chosen()))}>
      {/* With no scene selected the tape takes the page: the picture waits here, unseen, for the focus panel. */}
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
          <div class="sc-track" ref={(el: HTMLDivElement) => el.append(player.bar)} />
          <div class="sc-legend">
            <For each={legend()} keyed={(l) => l.state}>
              {(l) => (
                <span class="sc-legend-item" data-state={l().state}>
                  <i class="sc-dot" data-state={l().state} />
                  {l().text}
                </span>
              )}
            </For>
            <span class="sc-spacer" />
            <span class="sc-step" data-role="step">
              {stepText(tape().step, tape().perRow)}
            </span>
            <button
              type="button"
              class="sc-follow"
              data-act="follow"
              aria-pressed={ariaOf(follow())}
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
          data-role="tape"
          data-stills={String(tape().rows.reduce((n, r) => n + r.stills.length, 0))}
          data-first-still={Option.getOrElse(
            Option.map(firstStill(), (ms) => String(Math.round(ms))),
            () => '',
          )}
        >
          {/* A line is its own tape's row: a new step or a new width lays the tape out afresh. */}
          <For each={tape().rows}>{(row) => <Line row={row} />}</For>
        </div>
      </div>
      <Show when={Option.getOrUndefined(chosen())} keyed>
        {(scene) => <Focus scene={scene} />}
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
              <dt>stills</dt>
              <dd data-fact="stills">
                {`${tape().rows.reduce((n, r) => n + r.stills.length, 0)} · ${stepText(tape().step, tape().perRow)}`}
              </dd>
              <dt>drawn</dt>
              <dd>{`${stills.drawn().count} in ${Math.round(stills.drawn().ms)} ms`}</dd>
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
