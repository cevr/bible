/**
 * A page's whole document: its head (title, description, canonical URL, the
 * link card, icons, the stylesheet and the fonts the first screen sets) and
 * its body. The phone menu's script is the only script.
 */
import { For } from '@solidjs/web';
import type { JSX } from '@solidjs/web';

import { THEME_COLOR } from './meta.ts';
import { absolute, type Page } from './pages.ts';
import { CHANNEL } from './site.ts';

/** What the browser build produced, as the prerender read it from Vite's manifest. */
export interface Build {
  readonly script: string;
  readonly styles: ReadonlyArray<string>;
  /** The fonts the first screen sets, preloaded so the wordmark does not reflow. */
  readonly fonts: ReadonlyArray<string>;
}

interface DocumentProps {
  readonly page: Page;
  readonly build: Build;
  readonly children: JSX.Element;
}

const ROBOTS = { true: 'index, follow', false: 'noindex' } as const;

export const Document = (props: DocumentProps) => {
  const page = props.page;
  const url = absolute(page.path);
  const image = absolute(page.image);
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{page.title}</title>
        <meta name="description" content={page.description} />
        <meta name="robots" content={ROBOTS[`${page.listed}`]} />
        <link rel="canonical" href={url} />
        <meta name="theme-color" content={THEME_COLOR} />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={CHANNEL.name} />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.description} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={image} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={page.imageAlt} />
        <meta property="og:locale" content="en_US" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={page.title} />
        <meta name="twitter:description" content={page.description} />
        <meta name="twitter:image" content={image} />
        <meta name="twitter:image:alt" content={page.imageAlt} />

        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />

        <For each={props.build.fonts}>
          {(font) => <link rel="preload" href={font} as="font" type="font/woff2" crossorigin="" />}
        </For>
        <For each={props.build.styles}>{(href) => <link rel="stylesheet" href={href} />}</For>
        <script type="module" src={props.build.script} />
      </head>
      <body>
        <a class="skip" href="#main">
          Skip to content
        </a>
        {props.children}
      </body>
    </html>
  );
};
