/* oxlint-disable effect/noGlobals, effect/noUnsafeDictionaryType -- Bun's loader takes each stand-in module as source text, which reaches the script's device through the global object; the stand-in scroll view records its props as React Native hands them over. */

/**
 * A phone, as a script that mounts the phones' screens under happy-dom sees
 * it: `react-native` is react-native-web with iOS's rules (`Platform.select`
 * takes `ios`, a dynamic colour is its light value, the colour scheme and
 * the text size are the device's, which the script sets), a screen 390 by
 * 800 points that every element measures as, `one` is `src/test/one.tsx`
 * and `~/color` is the phones' colour module. Each scroll view tells the
 * script the props it was last drawn with (`scrolls`), as the platform
 * would call its handlers. With `nativeList`, LegendList is its phones'
 * build, which hands a scroll view the handlers iOS calls.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';

import { readChords } from '../../vite/chords';
import { readWords } from '../../vite/words';

/** A scroll view's last props, by whether it scrolls sideways. */
export interface Scrolls {
  readonly sideways: Array<Record<string, unknown>>;
  readonly upright: Array<Record<string, unknown>>;
}

export const phone = ({ nativeList = false }: { readonly nativeList?: boolean } = {}) => {
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
  const scrolls: Scrolls = { sideways: [], upright: [] };
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    __DEV__: false,
    phoneDevice: device,
    phoneScrolls: scrolls,
  });

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
  // react-native-web measures a view for its `onLayout` by its offset box,
  // which LegendList's phone build waits on before it draws an item.
  if (nativeList)
    Object.defineProperties(HTMLElement.prototype, {
      offsetWidth: { get: () => 390, configurable: true },
      offsetHeight: { get: () => 800, configurable: true },
    });

  const web = Bun.resolveSync('react-native-web', import.meta.dir);
  const one = Bun.resolveSync('./one.tsx', import.meta.dir);
  const color = Bun.resolveSync('../color.native.ts', import.meta.dir);
  const list = `${Bun.resolveSync('@legendapp/list/package.json', import.meta.dir).replace(/package\.json$/, '')}react-native.mjs`;

  plugin({
    name: 'hymnal-phone',
    setup(build) {
      build.module('react-native', () => ({
        contents: `
          import { createElement, forwardRef, useSyncExternalStore } from 'react';
          import { Animated as WebAnimated, Platform as WebPlatform } from ${JSON.stringify(web)};
          export * from ${JSON.stringify(web)};
          const device = globalThis.phoneDevice;
          const scrolls = globalThis.phoneScrolls;
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
          const Told = forwardRef(function Told(props, ref) {
            scrolls[props.horizontal ? 'sideways' : 'upright'].push(props);
            return createElement(WebAnimated.ScrollView, { ...props, ref });
          });
          export const Animated = { ...WebAnimated, ScrollView: Told };
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
      build.module('virtual:hymnal', () => ({
        contents: `export default ${JSON.stringify(readWords())};`,
        loader: 'js',
      }));
      build.module('virtual:hymnal-chords', () => ({
        contents: `export default ${JSON.stringify(readChords())};`,
        loader: 'js',
      }));
      if (nativeList)
        build.module('@legendapp/list/react-native', () => ({
          contents: `export * from ${JSON.stringify(list)};`,
          loader: 'js',
        }));
    },
  });
  return { device, scrolls };
};
