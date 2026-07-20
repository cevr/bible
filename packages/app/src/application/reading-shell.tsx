import { A, useLocation, useNavigate } from '@solidjs/router';
import { Effect } from 'effect';
import { createEffect, createSignal, onCleanup, onSettled, type ParentProps } from 'solid-js';

import type { ReaderTypeface } from '@bible/core/reading-preferences';
import { decodeRoute, readerLocationForRoute } from '../route/index.js';
import { failureCategory, useReadingData } from '../runtime/index.js';
import { Button, CommandPalette, Menu, MenuIcon, SearchIcon } from '../ui/index.js';

const readerTypeface = (typeface: ReaderTypeface): string => {
  switch (typeface) {
    case 'crimson-pro':
      return "'Crimson Pro', Georgia, serif";
    case 'lora':
      return 'Lora, Georgia, serif';
    case 'literata':
      return 'Literata, Georgia, serif';
    case 'eb-garamond':
      return "'EB Garamond', Garamond, serif";
    case 'source-sans-3':
      return "'Source Sans 3', ui-sans-serif, sans-serif";
    case 'georgia':
      return 'Georgia, serif';
    case 'system-serif':
      return 'ui-serif, Georgia, serif';
    case 'system-sans':
      return 'ui-sans-serif, sans-serif';
    case 'system-mono':
      return 'ui-monospace, monospace';
  }
};

const ReadingPreferenceBridge = () => {
  const preferences = useReadingData().readingPreferences.get();

  createEffect(preferences, (current) => {
    const root = document.documentElement;
    root.dataset['readingTheme'] = current.colorMode;
    root.style.setProperty('--bible-reader-serif', readerTypeface(current.readerTypeface));
    root.style.setProperty('--bible-reader-size', `${String(current.fontSizePx)}px`);
    root.style.setProperty('--bible-reader-leading', String(current.lineHeightRatio));
    root.style.setProperty('--bible-reader-tracking', `${String(current.letterSpacingEm)}em`);
    root.style.setProperty('--bible-reading-measure', `${String(current.measureCh)}ch`);
  });

  onCleanup(() => {
    const root = document.documentElement;
    delete root.dataset['readingTheme'];
    root.style.removeProperty('--bible-reader-serif');
    root.style.removeProperty('--bible-reader-size');
    root.style.removeProperty('--bible-reader-leading');
    root.style.removeProperty('--bible-reader-tracking');
    root.style.removeProperty('--bible-reading-measure');
  });

  return null;
};

const ReadingContinuityBridge = () => {
  const location = useLocation();
  const continuity = useReadingData().readingContinuity;
  const canonicalPath = () => `${location.pathname}${location.search}`;
  let recordedPath: string | undefined;

  createEffect(canonicalPath, (path) => {
    const route = decodeRoute(path);
    let readingLocation: ReturnType<typeof readerLocationForRoute> = undefined;
    if (route) readingLocation = readerLocationForRoute(route);
    if (readingLocation === undefined || path === recordedPath) return;
    recordedPath = path;
    void continuity.mutate({ location: readingLocation, progress: 0 }).catch((cause: unknown) => {
      Effect.runFork(
        Effect.logError(
          `[continuity] mutation-failed operation=record category=${failureCategory(cause)}`,
        ),
      );
    });
  });

  return null;
};

const sectionFor = (
  pathname: string,
): 'bible' | 'writings' | 'search' | 'topics' | 'plans' | 'practice' | 'settings' | 'other' => {
  if (pathname.startsWith('/bible')) return 'bible';
  if (pathname.startsWith('/writings')) return 'writings';
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/topics')) return 'topics';
  if (pathname.startsWith('/plans')) return 'plans';
  if (pathname.startsWith('/practice')) return 'practice';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'other';
};

const ariaCurrent = (active: boolean): 'page' | undefined => {
  if (active) return 'page';
  return undefined;
};

export const ReadingShell = (props: ParentProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = () => sectionFor(location.pathname);
  const [commandOpen, setCommandOpen] = createSignal(false);
  let commandTrigger: HTMLButtonElement | undefined;
  const destinations = [
    { id: 'bible', label: 'Read the Bible', path: '/bible/1/1', keywords: ['scripture'] },
    { id: 'writings', label: 'Open Writings', path: '/writings', keywords: ['egw'] },
    { id: 'search', label: 'Search Scripture', path: '/search', keywords: ['find'] },
    { id: 'topics', label: 'Browse Topics', path: '/topics', keywords: ['study'] },
    { id: 'plans', label: 'Reading Plans', path: '/plans', keywords: ['schedule'] },
    { id: 'practice', label: 'Memory Practice', path: '/practice', keywords: ['verse'] },
    { id: 'settings', label: 'Reader Settings', path: '/settings/reader', keywords: ['theme'] },
  ] as const;

  onSettled(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      } else if (event.key === '/' && !isEditing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div class="bible-app-shell">
      <ReadingPreferenceBridge />
      <ReadingContinuityBridge />
      <a class="bible-skip-link" href="#reading-canvas">
        Skip to reading
      </a>
      <header class="bible-app-header">
        <A class="bible-wordmark" href="/bible/1/1" aria-label="Bible reader home">
          <span aria-hidden="true">B</span>
          <span>The Word</span>
        </A>
        <nav class="bible-primary-nav" aria-label="Primary navigation">
          <A href="/bible/1/1" aria-current={ariaCurrent(activeSection() === 'bible')}>
            Bible
          </A>
          <A href="/writings" aria-current={ariaCurrent(activeSection() === 'writings')}>
            Writings
          </A>
          <A href="/search" aria-current={ariaCurrent(activeSection() === 'search')}>
            Search
          </A>
          <A href="/topics" aria-current={ariaCurrent(activeSection() === 'topics')}>
            Topics
          </A>
          <A href="/plans" aria-current={ariaCurrent(activeSection() === 'plans')}>
            Plans
          </A>
          <A href="/practice" aria-current={ariaCurrent(activeSection() === 'practice')}>
            Practice
          </A>
        </nav>
        <div class="bible-mobile-nav">
          <Menu
            label="Library navigation"
            trigger={<MenuIcon />}
            items={destinations.map((destination) => ({
              id: destination.id,
              label: destination.label,
              select: () => navigate(destination.path),
            }))}
          />
        </div>
        <Button
          ref={(element) => {
            commandTrigger = element;
          }}
          class="bible-command-trigger"
          aria-label="Open command palette"
          onClick={() => setCommandOpen(true)}
        >
          <SearchIcon />
          <kbd>⌘K</kbd>
        </Button>
        <A
          class="bible-settings-link"
          href="/settings/reader"
          aria-current={ariaCurrent(activeSection() === 'settings')}
        >
          Settings
        </A>
      </header>
      <main id="reading-canvas" class="bible-reading-canvas" tabindex="-1">
        {props.children}
      </main>
      <CommandPalette
        open={commandOpen()}
        onOpenChange={setCommandOpen}
        restoreFocus={() => commandTrigger}
        commands={destinations.map((destination) => ({
          id: destination.id,
          label: destination.label,
          keywords: destination.keywords,
          run: () => navigate(destination.path),
        }))}
      />
    </div>
  );
};
