/**
 * The parts the pages share: the field hero, a series' card, the subscribe
 * band and the footer.
 */
import { For } from '@solidjs/web';
import type { JSX } from '@solidjs/web';

import type { Series } from '../content.ts';
import { CHANNEL } from '../site.ts';
import { COVERS, FIELD, srcset } from './art.ts';
import { Lockup } from './brand.tsx';
import { FOOTER_NAV_ID, NAV, SUBSCRIBE } from './nav.ts';

export const seriesHref = (series: Series) => `/series/${series.slug}`;

/** What a series' episodes are called, one and many. */
const UNITS = {
  'Cut-paper films': { one: 'film', many: 'films' },
  Talks: { one: 'talk', many: 'talks' },
} as const;

export const unitOf = (series: Series) => UNITS[series.form].many;

/** How far a series has come: how many are out, or that the first is coming. */
export const statusOf = (series: Series) => {
  const units = UNITS[series.form];
  const count = series.episodes.length;
  if (count === 0) return `First ${units.many} coming soon`;
  if (count === 1) return `1 ${units.one} out`;
  return `${count} ${units.many} out`;
};

interface FieldHeroProps {
  /** The short field, for a page below the home page. */
  readonly short: boolean;
  readonly children: JSX.Element;
}

const HERO_CLASS = { true: 'hero-art hero-art-short', false: 'hero-art' } as const;
const LOADING = { true: 'eager', false: 'lazy' } as const;

/**
 * The field, blade to full corn, with a torn strip of paper laid on it: in
 * its sky on a wide screen, over its foot on a phone.
 */
export const FieldHero = (props: FieldHeroProps) => (
  <div class="hero">
    <picture>
      <source media="(min-width: 48rem)" srcset={FIELD.wide} />
      <img
        class={HERO_CLASS[`${props.short}`]}
        src={FIELD.narrow}
        alt=""
        width="2560"
        height="640"
        fetchpriority="high"
      />
    </picture>
    {props.children}
  </div>
);

interface SeriesCardProps {
  readonly series: Series;
  /** Whether its picture loads with the page (it is in the first screen) or when scrolled to. */
  readonly eager: boolean;
}

/** A series: its picture, name, subject and form, its line, and how far it has come. */
export const SeriesCard = (props: SeriesCardProps) => {
  const s = props.series;
  return (
    <li class="card" data-series={s.id}>
      <img
        src={COVERS[s.id].small}
        srcset={srcset(COVERS[s.id])}
        sizes="(min-width: 72rem) 19rem, (min-width: 40rem) 45vw, 100vw"
        alt=""
        width="640"
        height="360"
        loading={LOADING[`${props.eager}`]}
      />
      <h3>
        <a href={seriesHref(s)}>{s.name}</a>
      </h3>
      <p class="label">
        {s.subject} · {s.form}
      </p>
      <p>{s.line}</p>
      <p class="status">{statusOf(s)}</p>
    </li>
  );
};

interface CardsProps {
  readonly series: ReadonlyArray<Series>;
  readonly eager: boolean;
}

export const Cards = (props: CardsProps) => (
  <ul class="cards" data-count={props.series.length}>
    <For each={props.series}>{(s) => <SeriesCard series={s} eager={props.eager} />}</For>
  </ul>
);

/** The subscribe band: the one thing to do while the first films are made. */
export const Band = () => (
  <section class="band" aria-labelledby="band-title">
    <div class="wrap">
      <div>
        <h2 id="band-title">A new film, now and then</h2>
        <p>Subscribe on YouTube to see each one when it is ready: {CHANNEL.handle}</p>
      </div>
      <a class="button button-gold" href={SUBSCRIBE.href}>
        {SUBSCRIBE.label}
      </a>
    </div>
  </section>
);

export const Footer = () => (
  <footer class="site-footer">
    <Lockup />
    <nav aria-label="Site" id={FOOTER_NAV_ID}>
      <ul class="footer-links">
        <li>
          <a href="/">Home</a>
        </li>
        <For each={NAV}>
          {(link) => (
            <li>
              <a href={link.href}>{link.label}</a>
            </li>
          )}
        </For>
        <li>
          <a href={CHANNEL.url}>YouTube</a>
        </li>
      </ul>
    </nav>
    <p class="footer-fine">Scripture quotations from the King James Version · © 2026</p>
  </footer>
);
