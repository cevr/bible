/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, eslint/no-await-in-loop, effect/noNullish, effect/noTernary, effect/noRuntimeTypeof, effect/noUnsafeDictionaryType -- a script at Bun's boundary, as the browser harness is: the screens are imported only once the phone's stand-ins are registered (`phone.ts`), it drives React one step after another and waits on what the document shows, reads the stand-in scroll view's props as React Native hands them over, and prints its report on stdout. */

/**
 * Mounts the phones' hymn screen (`HymnScreen.native.tsx`), its pager on
 * LegendList's phone build, under the bottom bar and a player on a fake
 * device, on the phone `phone.ts` stands in for, and prints as JSON what
 * each case saw: the pages drawn, the header, the pager's first offset, each
 * route change, and the player. A settle is the pager's scroll view told
 * its glide ended at a page, as iOS tells it. No hymn's words are printed.
 */

import { phone } from './phone';

const { scrolls } = phone({ nativeList: true });

const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { RegistryContext } = await import('@effect/atom-react');
const { Duration, Effect, Option } = await import('effect');
const Atom = await import('effect/reactivity/Atom');
const AtomRegistry = await import('effect/reactivity/AtomRegistry');
const { HymnScreen } = await import('../reader/HymnScreen.native');
const { StackHeader } = await import('./stack');
const { HymnList } = await import('../reader/HymnList.native');
const { pagesFrom } = await import('../reader/place');
const { hymnAt, hymns } = await import('../hymns/hymns');
const { PlayerContext } = await import('../player/context');
const { PlayerBar } = await import('../player/PlayerBar');
const { Command, playerOn } = await import('../player/player');
const { fakeDevice } = await import('./device');
const { opened, params, paramsSet } = await import('./one');

const width = 390;

/** The web's list offset, which the phones' list takes and leaves alone. */
const offset = Atom.make(0);

/** A moment of the event loop, for the stand-in views' layout and the player's device. */
const tick = () => act(() => Effect.runPromise(Effect.sleep(Duration.millis(10))));

/** Waits until `holds` is true, for two seconds at most; answers whether it came true. */
const waitFor = async (holds: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (holds()) return true;
    await tick();
  }
  return false;
};

/** The route's screen is drawn: its header and at least one page. */
const drawn = (host: HTMLElement) =>
  host.querySelector('[data-testid="header"]') !== null &&
  host.querySelector('[data-testid="hymn-name"]') !== null;

/** A list's rows are drawn. */
const listed = (host: HTMLElement) => host.querySelector('[aria-label*=", "]') !== null;

/** A fresh app: its registry, a player on a fake device, and a host in the document. */
const app = () => {
  opened.splice(0);
  paramsSet.splice(0);
  scrolls.sideways.splice(0);
  const { device, layer } = fakeDevice();
  const player = playerOn(layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  /** Draws `node`, then waits until `ready` holds of the document: the lists draw their items once their views report their size. */
  const show = async (node: ReturnType<typeof h>, ready: (host: HTMLElement) => boolean) => {
    await act(async () => {
      root.render(
        h(
          RegistryContext,
          { value: registry },
          h(PlayerContext, { value: Option.some(player) }, node),
        ),
      );
    });
    await waitFor(() => ready(host));
  };
  return {
    device,
    player,
    registry,
    host,
    show,
    close: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

type App = ReturnType<typeof app>;

/** The hymn route's screen at `/hymns/<n>` with the bar under it, as the router draws it. */
const route = (shown: App, n: number) => {
  params['number'] = String(n);
  return shown.show(
    h(
      'div',
      null,
      h(StackHeader),
      h('div', { 'data-testid': 'page' }, h(HymnScreen)),
      h(PlayerBar),
    ),
    drawn,
  );
};

/** Draws the route again at its params now, as the router does after `setParams`. */
const again = (shown: App) => route(shown, Number(params['number']));

/** What the screen shows: the hymns whose pages are drawn, the headers and their titles' hymns. */
const seen = (shown: App) => {
  const headers = [...shown.host.querySelectorAll('[data-testid="header"]')];
  const pages = [...shown.host.querySelectorAll('[data-testid="hymn-name"]')].map((name) =>
    Number(name.firstElementChild?.textContent),
  );
  return {
    pages,
    headers: headers.length,
    headerNames: headers.map(
      (header) =>
        hymns.find((hymn) => hymn.title === header.getAttribute('aria-label'))?.number ?? 0,
    ),
    rightItems: headers.map((header) => header.querySelectorAll('[aria-label="Chords"]').length),
    firstOffset: Option.getOrElse(
      Option.fromNullishOr(
        (scrolls.sideways[0]?.['contentOffset'] as { x?: number } | undefined)?.x,
      ),
      () => -1,
    ),
    offsets: scrolls.sideways.map(
      (props) => (props['contentOffset'] as { x?: number } | undefined)?.x ?? -1,
    ),
    paging: scrolls.sideways.at(-1)?.['pagingEnabled'] === true,
    opened: [...opened],
    paramsSet: paramsSet.map((set) => Number(set['number'])),
    backEdge: edgeOf(shown),
  };
};

/**
 * The strip at the left edge whose pans go back: how many there are, whether
 * it comes after the pager among its siblings (so it lies over it), and where
 * it is laid.
 */
const edgeOf = (shown: App) => {
  const edges = [...shown.host.querySelectorAll('[data-testid="back-edge"]')];
  const edge = edges[0];
  const style = edge === undefined ? undefined : getComputedStyle(edge);
  return {
    count: edges.length,
    overPager:
      (edge?.previousElementSibling?.querySelector('[data-testid="hymn-name"]') ?? null) !== null,
    position: style?.position ?? '',
    left: style?.left ?? '',
    top: style?.top ?? '',
    bottom: style?.bottom ?? '',
    width: style?.width ?? '',
  };
};

/** The pager's glide ends on page `index`, as iOS tells it. */
const settle = async (shown: App, index: number) => {
  await act(async () => {
    const props = scrolls.sideways.at(-1) ?? {};
    const told = props['onMomentumScrollEnd'];
    if (typeof told === 'function')
      told({
        nativeEvent: {
          contentOffset: { x: index * width, y: 0 },
          contentSize: { width: width * 695, height: 800 },
          layoutMeasurement: { width, height: 800 },
          contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
          zoomScale: 1,
        },
      });
  });
  await again(shown);
};

/** A press on the row labelled `label` of a list. */
const press = (shown: App, label: string) =>
  act(async () => {
    shown.host
      .querySelector(`[aria-label^="${label}, "]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

/** Waits until the player's state is one `holds` is true of. */
const until = (shown: App, holds: (state: { readonly _tag: string }) => boolean) =>
  waitFor(() => holds(shown.registry.get(shown.player.state)));

const out: Record<string, unknown> = {};

// From the home list: a row's press hands its list over, the pager opens at 3.
{
  const shown = app();
  await shown.show(
    h(HymnList, { hymns, hrefOf: (n: number) => `/hymns/${n}`, offset, byTopic: true }),
    listed,
  );
  await press(shown, '3');
  const source = shown.registry.get(pagesFrom);
  out['homeSource'] = Option.match(source, {
    onNone: () => ({ length: 0, first: 0 }),
    onSome: (list) => ({ length: list.length, first: list[0] ?? 0 }),
  });
  out['homeOpened'] = [...opened];
  await route(shown, 3);
  out['open3'] = seen(shown);
  out['sourceAfterOpen'] = Option.isSome(shown.registry.get(pagesFrom));
  await settle(shown, 3);
  out['settle4'] = seen(shown);
  shown.close();
}

// From a search's results: the pager moves through them alone.
{
  const shown = app();
  const found = [3, 30, 300].map((n) => Option.getOrThrow(hymnAt(String(n))));
  await shown.show(
    h(HymnList, { hymns: found, hrefOf: (n: number) => `/hymns/${n}`, offset }),
    listed,
  );
  await press(shown, '30');
  await route(shown, 30);
  out['open30'] = seen(shown);
  await settle(shown, 2);
  out['settle300'] = seen(shown);
  shown.close();
}

// A deep link to 600: every hymn, opened at 600.
{
  const shown = app();
  await route(shown, 600);
  out['open600'] = seen(shown);
  await settle(shown, 600);
  out['settle601'] = seen(shown);
  shown.close();
}

// Hymn 3 sounding, the pager settles on 4: the player is left alone.
{
  const shown = app();
  await route(shown, 3);
  await act(async () =>
    shown.registry.set(shown.player.send, Command.Start({ track: Option.getOrThrow(hymnAt('3')) })),
  );
  shown.device.now = { state: 'playing', positionMs: 5_000, durationMs: 120_000 };
  const playing = await until(shown, (state) => state._tag === 'Playing');
  const playedBefore = [...shown.device.played];
  await settle(shown, 3);
  const bar = shown.host.querySelector('[aria-label="Player"]');
  const state = shown.registry.get(shown.player.state);
  out['playing'] = {
    playing,
    playedBefore: playedBefore.length,
    playedAfter: shown.device.played.length,
    state: state._tag,
    track: 'track' in state ? (state.track as { number: number }).number : 0,
    barHymn: Number(
      /^\d+/.exec(bar?.querySelector('[aria-label="Open player"]')?.textContent ?? '')?.[0] ?? 0,
    ),
    playFour: bar?.querySelector('[aria-label="Play hymn 4"]') !== null,
    route: params['number'],
    header: seen(shown).headerNames,
  };
  shown.close();
}

process.stdout.write(JSON.stringify(out));
process.exit(0);
