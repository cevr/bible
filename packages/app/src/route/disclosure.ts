import type { AppRoute, BibleReadingReference } from './model.js';

export type NavigationPane = 'closed' | 'contents' | 'library' | 'bookmarks' | 'history';
export type StudyTab = 'notes' | 'cross-references' | 'words' | 'writings';
export type ContextPane =
  | {
      readonly _tag: 'verse-study';
      readonly reference: BibleReadingReference;
      readonly tab: StudyTab;
    }
  | { readonly _tag: 'scripture-compare'; readonly reference: BibleReadingReference }
  | null;
export type Overlay = 'command-palette' | 'quick-find' | 'confirmation';

export interface DisclosureState {
  readonly navigation: NavigationPane;
  readonly context: ContextPane;
  readonly overlays: readonly Overlay[];
  readonly viewport: 'wide' | 'narrow';
}

export interface SurfaceProjection {
  readonly shell: 'reading-shell';
  readonly canvas:
    | 'bible-reader'
    | 'writings-reader'
    | 'writings-catalog'
    | 'unified-search'
    | 'topic-browser'
    | 'topic-detail'
    | 'plan-list'
    | 'plan-detail'
    | 'memory-verse-list'
    | 'practice-session'
    | 'settings'
    | 'not-found';
  readonly left: Exclude<NavigationPane, 'closed'> | null;
  readonly right: Exclude<ContextPane, null> | null;
  readonly replacement:
    | { readonly _tag: 'navigation'; readonly pane: Exclude<NavigationPane, 'closed'> }
    | { readonly _tag: 'context'; readonly pane: Exclude<ContextPane, null> }
    | null;
  readonly overlay: Overlay | null;
}

export const defaultDisclosure = (viewport: DisclosureState['viewport']): DisclosureState => ({
  navigation: 'closed',
  context: null,
  overlays: [],
  viewport,
});

export const openNavigation = (
  state: DisclosureState,
  navigation: Exclude<NavigationPane, 'closed'>,
): DisclosureState => ({ ...state, navigation });

export const openContext = (
  state: DisclosureState,
  context: Exclude<ContextPane, null>,
): DisclosureState => ({ ...state, context });

export const pushOverlay = (state: DisclosureState, overlay: Overlay): DisclosureState => ({
  ...state,
  overlays: [...state.overlays.filter((candidate) => candidate !== overlay), overlay],
});

export const dismissTopDisclosure = (state: DisclosureState): DisclosureState => {
  if (state.overlays.length > 0) {
    return { ...state, overlays: state.overlays.slice(0, -1) };
  }
  if (state.context !== null) return { ...state, context: null };
  if (state.navigation !== 'closed') return { ...state, navigation: 'closed' };
  return state;
};

const canvasFor = (route: AppRoute): SurfaceProjection['canvas'] => {
  switch (route._tag) {
    case 'bible':
      return 'bible-reader';
    case 'writings':
      return 'writings-reader';
    case 'writings-catalog':
      return 'writings-catalog';
    case 'search':
      return 'unified-search';
    case 'topics':
      return route.topicId ? 'topic-detail' : 'topic-browser';
    case 'plans':
      return route.planId ? 'plan-detail' : 'plan-list';
    case 'practice':
      return route.memoryVerseId ? 'practice-session' : 'memory-verse-list';
    case 'settings':
      return 'settings';
    case 'not-found':
      return 'not-found';
  }
};

export const projectSurface = (route: AppRoute, disclosure: DisclosureState): SurfaceProjection => {
  const navigation = disclosure.navigation === 'closed' ? null : disclosure.navigation;
  const context = disclosure.context;
  const overlay = disclosure.overlays.at(-1) ?? null;

  if (disclosure.viewport === 'narrow') {
    return {
      shell: 'reading-shell',
      canvas: canvasFor(route),
      left: null,
      right: null,
      replacement:
        context !== null
          ? { _tag: 'context', pane: context }
          : navigation !== null
            ? { _tag: 'navigation', pane: navigation }
            : null,
      overlay,
    };
  }

  return {
    shell: 'reading-shell',
    canvas: canvasFor(route),
    left: navigation,
    right: context,
    replacement: null,
    overlay,
  };
};
