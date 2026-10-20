/**
 * The parts the pages share, in the order a page meets them: the field at
 * morning (the home page's, tall, and a page's own, shorter), a verse, the
 * series on torn paper, the dusk, the night close and the footer.
 */
import { For } from '@solidjs/web';
import type { JSX } from '@solidjs/web';

import { MARK_4_27, type Series, UNITS, type Verse } from '../content.ts';
import { CHANNEL } from '../site.ts';
import { EMBLEMS, FIELD, MARK, NIGHT } from './art.ts';
import { PRIVACY_PATH } from '../pages.ts';
import { SignUp } from './mail.tsx';
import { FOOTER_NAV_ID, NAV, SUBSCRIBE } from './nav.ts';

export const seriesHref = (series: Series) => `/series/${series.slug}`;

export const unitOf = (series: Series) => UNITS[series.form].many;

/** How far a series has come: how many are out, or that the first is coming. */
export const statusOf = (series: Series) => {
  const units = UNITS[series.form];
  const count = series.episodes.length;
  if (count === 0) return `First ${units.many} coming soon`;
  if (count === 1) return `1 ${units.one} out`;
  return `${count} ${units.many} out`;
};

interface FieldProps {
  readonly children: JSX.Element;
}

interface FieldArtProps {
  /**
   * How wide the painting is drawn: it covers its field, so a field narrower
   * than the painting's 3:2 draws it wider than the screen.
   */
  readonly sizes: string;
}

/** The field at morning, the first thing every page paints. */
const FieldArt = (props: FieldArtProps) => (
  <img
    class="field-art"
    src={FIELD.src}
    srcset={FIELD.srcset}
    sizes={props.sizes}
    alt=""
    width="1536"
    height="1024"
    fetchpriority="high"
  />
);

/**
 * The home page's field: tall, with the verse on a torn strip in its sky and
 * the soil darkened under the words laid on it.
 */
export const HomeField = (props: FieldProps) => (
  <div class="field field-home">
    <FieldArt sizes="(min-width: 77rem) 100vw, 77rem" />
    <div class="field-scrim" />
    {props.children}
  </div>
);

/** A page's own field: shorter, with the page's title on a torn strip. */
export const PageField = (props: FieldProps) => (
  <div class="field field-page">
    <FieldArt sizes="(min-width: 42rem) 100vw, 42rem" />
    {props.children}
  </div>
);

interface QuoteProps {
  readonly verse: Verse;
}

/** A verse in italic, its reference beneath it. */
export const Quote = (props: QuoteProps) => (
  <figure class="verse">
    <blockquote>
      <p>“{props.verse.text}”</p>
    </blockquote>
    <figcaption class="ref">{props.verse.ref}</figcaption>
  </figure>
);

interface SeriesCardProps {
  readonly series: Series;
}

/** A series on its strip of paper: its emblem, subject and form, name, line, and how far it has come. */
export const SeriesCard = (props: SeriesCardProps) => {
  const s = props.series;
  return (
    <li class="card">
      <img src={EMBLEMS[s.id]} alt="" width="92" height="92" loading="lazy" />
      <div>
        <p class="label">
          <span class="nowrap">{s.subject}</span> · <span class="nowrap">{s.form}</span>
        </p>
        <h3>
          <a href={seriesHref(s)}>{s.name}</a>
        </h3>
        <p class="line">{s.line}</p>
        <p class="status">{statusOf(s)}</p>
      </div>
    </li>
  );
};

interface CardsProps {
  readonly series: ReadonlyArray<Series>;
}

export const Cards = (props: CardsProps) => (
  <ul class="cards" data-count={props.series.length}>
    <For each={props.series}>{(s) => <SeriesCard series={s} />}</For>
  </ul>
);

/** The day turning to night between the last band and the close. */
export const Dusk = () => <div class="dusk" aria-hidden="true" />;

/**
 * The close, at night: the mark, Mark 4:27 (the sower sleeps and rises, and
 * the seed grows), and the two ways to hear of each new film: the YouTube
 * channel, and the email list.
 */
export const NightClose = () => (
  <section class="night" aria-labelledby="night-title">
    <img
      class="night-art"
      src={NIGHT.src}
      srcset={NIGHT.srcset}
      sizes="(min-width: 65rem) 100vw, 65rem"
      alt=""
      width="1536"
      height="1024"
      loading="lazy"
    />
    <div class="night-veil" />
    <div class="night-words">
      <img class="mark" src={MARK.large} alt="" width="320" height="320" loading="lazy" />
      <Quote verse={MARK_4_27} />
      <h2 id="night-title">A new film, now and then</h2>
      <p>
        Subscribe on YouTube to see each one when it is ready:{' '}
        <span class="nowrap">{CHANNEL.handle}</span>
      </p>
      <a class="button button-night" href={SUBSCRIBE.href}>
        <span class="button-label">{SUBSCRIBE.label}</span>
      </a>
      <SignUp />
    </div>
  </section>
);

export const Footer = () => (
  <footer class="site-footer">
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
        <li>
          <a href={PRIVACY_PATH}>Privacy</a>
        </li>
      </ul>
    </nav>
    <p class="footer-fine">
      <span>
        Scripture quotations from the <span class="nowrap">King James Version</span>
      </span>
      <span class="nowrap">© 2026</span>
    </p>
  </footer>
);
