import { Option } from 'effect';

import type { AppRoute, BibleReadingReference } from './model.js';

export type NavigationPane = 'closed' | 'contents' | 'library' | 'bookmarks' | 'history';
export type StudyTab = 'notes' | 'cross-references' | 'words' | 'writings';
export type ContextPane =
  | {
      readonly _tag: 'verse-study';
      readonly reference: BibleReadingReference;
      readonly tab: StudyTab;
    }
  | { readonly _tag: 'scripture-compare'; readonly reference: BibleReadingReference };
export type Overlay = 'command-palette' | 'quick-find' | 'confirmation';

export interface DisclosureState {
  readonly navigation: NavigationPane;
  readonly context: Option.Option<ContextPane>;
  readonly overlays: readonly Overlay[];
  readonly viewport: 'wide' | 'narrow';
}

export type SurfaceReplacement =
  | { readonly _tag: 'navigation'; readonly pane: Exclude<NavigationPane, 'closed'> }
  | { readonly _tag: 'context'; readonly pane: ContextPane };

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
  readonly left: Option.Option<Exclude<NavigationPane, 'closed'>>;
  readonly right: Option.Option<ContextPane>;
  readonly replacement: Option.Option<SurfaceReplacement>;
  readonly overlay: Option.Option<Overlay>;
}

export const defaultDisclosure = (viewport: DisclosureState['viewport']): DisclosureState => ({
  navigation: 'closed',
  context: Option.none(),
  overlays: [],
  viewport,
});

export const openNavigation = (
  state: DisclosureState,
  navigation: Exclude<NavigationPane, 'closed'>,
): DisclosureState => ({ ...state, navigation });

export const openContext = (state: DisclosureState, context: ContextPane): DisclosureState => ({
  ...state,
  context: Option.some(context),
});

export const pushOverlay = (state: DisclosureState, overlay: Overlay): DisclosureState => ({
  ...state,
  overlays: [...state.overlays.filter((candidate) => candidate !== overlay), overlay],
});

export const dismissTopDisclosure = (state: DisclosureState): DisclosureState => {
  if (state.overlays.length > 0) {
    return { ...state, overlays: state.overlays.slice(0, -1) };
  }
  if (Option.isSome(state.context)) return { ...state, context: Option.none() };
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
      if (route.topicId) return 'topic-detail';
      return 'topic-browser';
    case 'plans':
      if (route.planId) return 'plan-detail';
      return 'plan-list';
    case 'practice':
      if (route.memoryVerseId) return 'practice-session';
      return 'memory-verse-list';
    case 'settings':
      return 'settings';
    case 'not-found':
      return 'not-found';
  }
};

export const projectSurface = (route: AppRoute, disclosure: DisclosureState): SurfaceProjection => {
  let navigation = Option.none<Exclude<NavigationPane, 'closed'>>();
  if (disclosure.navigation !== 'closed') navigation = Option.some(disclosure.navigation);
  const context = disclosure.context;
  const overlay = Option.fromNullishOr(disclosure.overlays.at(-1));

  if (disclosure.viewport === 'narrow') {
    let replacement = Option.none<SurfaceReplacement>();
    if (Option.isSome(context)) {
      replacement = Option.some({ _tag: 'context', pane: context.value });
    } else if (Option.isSome(navigation)) {
      replacement = Option.some({ _tag: 'navigation', pane: navigation.value });
    }
    return {
      shell: 'reading-shell',
      canvas: canvasFor(route),
      left: Option.none(),
      right: Option.none(),
      replacement,
      overlay,
    };
  }

  return {
    shell: 'reading-shell',
    canvas: canvasFor(route),
    left: navigation,
    right: context,
    replacement: Option.none(),
    overlay,
  };
};
