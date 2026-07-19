import { A, useLocation } from '@solidjs/router';
import type { ParentProps } from 'solid-js';

const sectionFor = (pathname: string): 'bible' | 'writings' | 'search' | 'other' => {
  if (pathname.startsWith('/bible')) return 'bible';
  if (pathname.startsWith('/writings')) return 'writings';
  if (pathname.startsWith('/search')) return 'search';
  return 'other';
};

export const ReadingShell = (props: ParentProps) => {
  const location = useLocation();
  const activeSection = () => sectionFor(location.pathname);

  return (
    <div class="bible-app-shell">
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
        </nav>
        <span aria-hidden="true" />
      </header>
      <main id="reading-canvas" class="bible-reading-canvas" tabindex="-1">
        {props.children}
      </main>
    </div>
  );
};
