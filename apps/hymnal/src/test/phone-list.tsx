/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- a script at Bun's boundary: its loader takes the stand-in modules as source text, which reach the script's device through the global object, and the list is imported only once the stand-ins are registered. */

/**
 * Mounts the phones' hymn list (`HymnList.native.tsx`) as an iPhone draws
 * it, changes one value a row reads from outside its item while the list
 * stays mounted, and prints the rows on screen as JSON: before the change,
 * live after it, and freshly mounted under the new value. It does so for
 * each change in turn: `scheme` (light to dark), `fontScale` (1 to 1.5) and
 * `hrefOf` (a new link for each row). `react-native` is
 * react-native-web with iOS's rules: `Platform.select` takes `ios`, a
 * dynamic colour is its light value, and the colour scheme and the text size
 * are the device's, which the script sets. `~/color` is the phones' colour
 * module. Each element measures as the phone's screen, so the list lays out
 * its rows under happy-dom.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';

GlobalRegistrator.register({ url: 'http://localhost/' });

/** The phone's settings the stand-in reads, each told to the screens using it when set. */
const device = {
  scheme: 'light' as 'light' | 'dark',
  fontScale: 1,
  listeners: new Set<() => void>(),
  set(next: { readonly scheme?: 'light' | 'dark'; readonly fontScale?: number }) {
    Object.assign(device, next);
    for (const listener of device.listeners) listener();
  },
};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: false, phoneDevice: device });

/** A phone's screen, 390 by 800 points: every element measures so, and says so once observed. */
HTMLElement.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width: 390, height: 800 });
class Observer {
  constructor(private readonly told: (entries: ReadonlyArray<{ target: Element }>) => void) {}
  observe(target: Element) {
    queueMicrotask(() => this.told([{ target }]));
  }
  unobserve() {}
  disconnect() {}
}
Object.assign(window, { ResizeObserver: Observer });

const web = Bun.resolveSync('react-native-web', import.meta.dir);
const one = Bun.resolveSync('./one.tsx', import.meta.dir);
const color = Bun.resolveSync('../color.native.ts', import.meta.dir);

plugin({
  name: 'hymnal-phone-list',
  setup(build) {
    build.module('react-native', () => ({
      contents: `
        import { useSyncExternalStore } from 'react';
        import { Platform as WebPlatform } from ${JSON.stringify(web)};
        export * from ${JSON.stringify(web)};
        const device = globalThis.phoneDevice;
        const subscribe = (listener) => {
          device.listeners.add(listener);
          return () => device.listeners.delete(listener);
        };
        export const Platform = {
          ...WebPlatform,
          OS: 'ios',
          select: (specifics) => ('ios' in specifics ? specifics.ios : specifics.default),
        };
        export const DynamicColorIOS = ({ light }) => light;
        export const PlatformColor = (name) => name;
        export const useColorScheme = () => useSyncExternalStore(subscribe, () => device.scheme);
        const windowOf = (fontScale) => ({ width: 390, height: 800, scale: 3, fontScale });
        let shown = windowOf(device.fontScale);
        export const useWindowDimensions = () =>
          useSyncExternalStore(subscribe, () => {
            if (shown.fontScale !== device.fontScale) shown = windowOf(device.fontScale);
            return shown;
          });
      `,
      loader: 'js',
    }));
    build.module('one', () => ({
      contents: `export * from ${JSON.stringify(one)};`,
      loader: 'js',
    }));
    build.module('~/color', () => ({
      contents: `export * from ${JSON.stringify(color)};`,
      loader: 'js',
    }));
  },
});

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const Atom = await import('effect/reactivity/Atom');
const { HymnList } = await import('../reader/HymnList.native');

/** Forty hymns in two topics: more rows than the screen holds. */
const hymns = Array.from({ length: 40 }, (_, i) => ({
  number: i + 1,
  title: `Hymn ${i + 1}`,
  firstLine: '',
  topic: `Topic ${Math.floor(i / 20) + 1}`,
  sections: [],
}));

const elements = (parents: ReadonlyArray<Element>) =>
  parents.flatMap((parent) => [...parent.children]).filter((e) => e instanceof HTMLElement);

/**
 * The rows on screen by their labels: each hymn row's link, its number's
 * colour and its height; each topic row's height.
 */
const rowsOn = (host: HTMLElement) => ({
  hymns: Object.fromEntries(
    [...host.querySelectorAll('[role="link"]')].map((row) => {
      const frame = elements([row]);
      return [
        String(row.getAttribute('aria-label')),
        {
          href: String(row.getAttribute('href')),
          colour: elements(frame)
            .slice(0, 1)
            .map((number) => number.style.color)
            .join(),
          height: frame.map((view) => view.style.height).join(),
        },
      ];
    }),
  ),
  topics: Object.fromEntries(
    [...host.querySelectorAll<HTMLElement>('[role="heading"]')].map((row) => [
      String(row.getAttribute('aria-label')),
      { height: row.style.height },
    ]),
  ),
});

const hrefs = {
  first: (n: number) => `/hymns/${n}`,
  second: (n: number) => `/elsewhere/${n}`,
};
const offset = Atom.make(0);

const mount = async (hrefOf: (n: number) => string) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = async (next: (n: number) => string) => {
    await act(async () => {
      root.render(createElement(HymnList, { hymns, hrefOf: next, offset, byTopic: true }));
    });
  };
  await show(hrefOf);
  return {
    host,
    show,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

type List = Awaited<ReturnType<typeof mount>>;

/** Each change made to a mounted list, and the links a list mounted after it draws. */
const changes = {
  scheme: {
    make: (_: List) => act(async () => device.set({ scheme: 'dark' })),
    after: hrefs.first,
  },
  fontScale: {
    make: (_: List) => act(async () => device.set({ fontScale: 1.5 })),
    after: hrefs.first,
  },
  hrefOf: { make: (list: List) => list.show(hrefs.second), after: hrefs.second },
};

/** The rows before `change`, live after it, and in a list mounted after it. */
const observe = async (change: keyof typeof changes) => {
  device.set({ scheme: 'light', fontScale: 1 });
  const list = await mount(hrefs.first);
  const before = rowsOn(list.host);
  await changes[change].make(list);
  const live = rowsOn(list.host);
  list.unmount();
  const after = await mount(changes[change].after);
  const fresh = rowsOn(after.host);
  after.unmount();
  return { before, live, fresh };
};

process.stdout.write(
  JSON.stringify({
    scheme: await observe('scheme'),
    fontScale: await observe('fontScale'),
    hrefOf: await observe('hrefOf'),
  }),
);
process.exit(0);
