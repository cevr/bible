/**
 * Suspense caching at feature-module seams.
 *
 * Each AppClient feature remains visible to callers. Configured read methods
 * gain React `use()` semantics and cache controls; mutations pass through to
 * the underlying Promise client unchanged.
 */
import { use } from 'react';

import type { AppClient } from '@/data/app-client';
import { createCache, type Cache } from './cache';

const READ_METHODS = {
  annotations: ['getChapterMarkers', 'getVerseNotes', 'getEgwNotes', 'getEgwChapterMarkers'],
  backup: [],
  bible: ['fetchChapter', 'fetchVerses', 'searchVerses', 'searchVersesWithCount'],
  collections: [
    'getCollections',
    'getVerseCollections',
    'getCollectionVerses',
    'getEgwParagraphCollections',
  ],
  commentary: ['getEgwCommentary'],
  concordance: [
    'getStrongsEntry',
    'getVerseWords',
    'getMarginNotes',
    'getChapterMarginNotes',
    'searchByStrongs',
  ],
  crossReferences: ['getCrossRefs'],
  plans: ['getPlans', 'getPlanItems', 'getPlanProgress'],
  practice: ['getMemoryVerses', 'getPracticeHistory'],
  state: ['getPosition', 'getBookmarks', 'getHistory', 'getPreferences'],
  sync: [],
  topics: [
    'searchTopics',
    'getTopic',
    'getTopicVerses',
    'getVerseTopics',
    'getTopicChildren',
    'getRootTopics',
    'getTopicsByLetter',
  ],
  writings: ['fetchEgwBooks', 'fetchEgwChapterContent', 'fetchEgwChapters'],
} as const satisfies {
  readonly [Feature in keyof AppClient]: readonly (keyof AppClient[Feature])[];
};

type StripPrefix<Name extends string> = Name extends `fetch${infer Rest}`
  ? Uncapitalize<Rest>
  : Name extends `get${infer Rest}`
    ? Uncapitalize<Rest>
    : Name;

type ReadMethod<Feature extends keyof AppClient> = (typeof READ_METHODS)[Feature][number] &
  keyof AppClient[Feature];

type CachedRead<Args extends unknown[], Result> = ((...args: Args) => Result) & {
  preload(...args: Args): void;
  invalidate(...args: Args): void;
  invalidateAll(): void;
};

type CachedFeature<Feature extends keyof AppClient> = {
  [Method in keyof AppClient[Feature] as Method extends ReadMethod<Feature>
    ? Method extends string
      ? StripPrefix<Method>
      : Method
    : Method]: Method extends ReadMethod<Feature>
    ? AppClient[Feature][Method] extends (...args: infer Args) => Promise<infer Result>
      ? CachedRead<Args, Result>
      : never
    : AppClient[Feature][Method];
};

export type CachedApp = {
  readonly [Feature in keyof AppClient]: CachedFeature<Feature>;
};

type PromiseMethod = (...args: unknown[]) => Promise<unknown>;

interface CacheWithVersion {
  readonly cache: Cache<unknown[], unknown>;
  version: number;
}

function cacheSnapshot(cache: Cache<unknown[], unknown>): number {
  return (cache as unknown as { getSnapshot: () => number }).getSnapshot();
}

function cachedName(method: string): string {
  return method
    .replace(/^fetch/, '')
    .replace(/^get/, '')
    .replace(/^./, (character) => character.toLowerCase());
}

const READ_ALIASES = new Map<string, ReadonlyMap<string, string>>(
  Object.entries(READ_METHODS).map(([feature, methods]) => [
    feature,
    new Map(methods.map((method) => [cachedName(method), method])),
  ]),
);

export class CachedAppCore<Client extends object = AppClient> {
  private readonly caches = new Map<string, CacheWithVersion>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly client: Client) {}

  private resolve(path: string): { receiver: object; method: PromiseMethod } {
    const separator = path.indexOf('.');
    const featureName = path.slice(0, separator);
    const methodName = path.slice(separator + 1);
    const feature = Reflect.get(this.client, featureName);
    if (typeof feature !== 'object' || feature === null) {
      throw new Error(`Feature ${featureName} not found on app client`);
    }

    const method = Reflect.get(feature, methodName);
    if (typeof method !== 'function') {
      throw new Error(`Method ${path} not found on app client`);
    }
    return { receiver: feature, method: method as PromiseMethod };
  }

  private getOrCreateCache(path: string): CacheWithVersion {
    const existing = this.caches.get(path);
    if (existing) return existing;

    const { receiver, method } = this.resolve(path);
    const created: CacheWithVersion = {
      cache: createCache((...args: unknown[]) => Reflect.apply(method, receiver, args)),
      version: 0,
    };
    this.caches.set(path, created);
    return created;
  }

  read(path: string, args: unknown[]): ReturnType<Cache<unknown[], unknown>['get']> {
    return this.getOrCreateCache(path).cache.get(...args);
  }

  preload(path: string, ...args: unknown[]): void {
    this.read(path, args);
  }

  invalidate(path: string, ...args: unknown[]): void {
    const entry = this.caches.get(path);
    if (!entry) return;
    const before = cacheSnapshot(entry.cache);
    entry.cache.invalidate(...args);
    if (cacheSnapshot(entry.cache) !== before) {
      entry.version++;
      this.notify();
    }
  }

  invalidateAll(path: string): void {
    const entry = this.caches.get(path);
    if (!entry) return;
    const before = cacheSnapshot(entry.cache);
    entry.cache.invalidateAll();
    if (cacheSnapshot(entry.cache) !== before) {
      entry.version++;
      this.notify();
    }
  }

  snapshotFor(accessed: ReadonlySet<string>): number {
    let snapshot = 0;
    for (const path of accessed) {
      snapshot += this.caches.get(path)?.version ?? 0;
    }
    return snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  withTracking(accessed: Set<string>): CachedApp {
    const read = this.read.bind(this);
    const preload = this.preload.bind(this);
    const invalidate = this.invalidate.bind(this);
    const invalidateAll = this.invalidateAll.bind(this);
    return new Proxy(this.client, {
      get(target, featureName, receiver) {
        const feature = Reflect.get(target, featureName, receiver);
        if (typeof featureName !== 'string' || typeof feature !== 'object' || feature === null) {
          return feature;
        }

        const aliases = READ_ALIASES.get(featureName);
        if (!aliases) return feature;

        return new Proxy(feature, {
          get(featureTarget, property, featureReceiver) {
            if (typeof property !== 'string') {
              return Reflect.get(featureTarget, property, featureReceiver);
            }

            const methodName = aliases.get(property);
            if (!methodName) {
              const value = Reflect.get(featureTarget, property, featureReceiver);
              return typeof value === 'function' ? value.bind(featureTarget) : value;
            }

            const path = `${featureName}.${methodName}`;
            const cached = (...args: unknown[]) => {
              accessed.add(path);
              return use(read(path, args));
            };
            cached.preload = (...args: unknown[]) => preload(path, ...args);
            cached.invalidate = (...args: unknown[]) => invalidate(path, ...args);
            cached.invalidateAll = () => invalidateAll(path);
            return cached;
          },
        });
      },
    }) as unknown as CachedApp;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export function createCachedApp(client: AppClient): CachedAppCore {
  return new CachedAppCore(client);
}
