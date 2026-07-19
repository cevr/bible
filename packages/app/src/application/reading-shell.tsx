import { A, useLocation } from '@solidjs/router';
import { createEffect, onCleanup, type ParentProps } from 'solid-js';

import type { ReaderTypeface } from '@bible/core/reading-preferences';
import { useReadingData } from '../runtime/index.js';

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

  createEffect(() => {
    const current = preferences();
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

export const ReadingShell = (props: ParentProps) => {
  const location = useLocation();
  const activeSection = () => sectionFor(location.pathname);

  return (
    <div class="bible-app-shell">
      <ReadingPreferenceBridge />
      <a class="bible-skip-link" href="#reading-canvas">
        Skip to reading
      </a>
      <header class="bible-app-header">
        <A class="bible-wordmark" href="/bible/1/1" aria-label="Bible reader home">
          <span aria-hidden="true">B</span>
          <span>The Word</span>
        </A>
        <nav class="bible-primary-nav" aria-label="Primary navigation">
          <A href="/bible/1/1" aria-current={activeSection() === 'bible' ? 'page' : undefined}>
            Bible
          </A>
          <A href="/writings" aria-current={activeSection() === 'writings' ? 'page' : undefined}>
            Writings
          </A>
          <A href="/search" aria-current={activeSection() === 'search' ? 'page' : undefined}>
            Search
          </A>
          <A href="/topics" aria-current={activeSection() === 'topics' ? 'page' : undefined}>
            Topics
          </A>
          <A href="/plans" aria-current={activeSection() === 'plans' ? 'page' : undefined}>
            Plans
          </A>
          <A href="/practice" aria-current={activeSection() === 'practice' ? 'page' : undefined}>
            Practice
          </A>
        </nav>
        <A
          class="bible-settings-link"
          href="/settings/reader"
          aria-current={activeSection() === 'settings' ? 'page' : undefined}
        >
          Settings
        </A>
      </header>
      <main id="reading-canvas" class="bible-reading-canvas" tabindex="-1">
        {props.children}
      </main>
    </div>
  );
};
