/**
 * What each page shows. The copy is plain and makes no claim the channel
 * cannot keep: no film is out yet, so no page lists one, counts one or plays
 * one. Each series lists its films once they are in `./content.ts`.
 *
 * Every page reads from morning to night: the field, then paper and the
 * reasons band, then the dusk and the night close.
 */
import { For, Show } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { Match } from 'effect';

import { MARK_4_27, MARK_4_28, SERIES, type Series, type Verse } from './content.ts';
import type { Page, PageView } from './pages.ts';
import { CHANNEL } from './site.ts';
import { EMBLEMS, MARK } from './ui/art.ts';
import { Header } from './ui/header.tsx';
import {
  Cards,
  Dusk,
  Footer,
  HomeField,
  NightClose,
  PageField,
  Quote,
  unitOf,
} from './ui/parts.tsx';

/** Mark 4:26–28, the parable the channel is named from. */
const MARK_4_26_28: ReadonlyArray<Verse> = [
  {
    text: 'And he said, So is the kingdom of God, as if a man should cast seed into the ground;',
    ref: 'Mark 4:26',
  },
  MARK_4_27,
  MARK_4_28,
];

const Home = () => (
  <main id="main">
    <h1 class="visually-hidden">{CHANNEL.name}</h1>
    <HomeField>
      <figure class="strip">
        <blockquote>
          <p>“{MARK_4_28.text}”</p>
        </blockquote>
        <figcaption class="ref">{MARK_4_28.ref}</figcaption>
      </figure>
      <div class="field-words">
        <h2>The first films are on their way</h2>
        <p>Nothing is published yet. The first films are being made now.</p>
      </div>
    </HomeField>

    <section class="section" id="series" aria-labelledby="series-title">
      <div class="wrap">
        <h2 class="lead" id="series-title">
          Short films and plain talks that grow the way the Bible grows us: a little, and then a
          little more.
        </h2>
        <Cards series={SERIES} />
      </div>
    </section>

    <section class="section-band" aria-labelledby="about-title">
      <div class="wrap split">
        <h2 id="about-title">Why we make these</h2>
        <div class="reading">
          <p>
            These films and talks set the Bible out plainly, one step at a time: what it teaches,
            from its first principles to its deepest truths, and how it reaches into the home, the
            field, the schoolroom and the sickroom.
          </p>
          <p>
            They are made for anyone who will come and see. The films are told in cut paper; the
            talks are given simply, as to a friend across the table. Every verse is quoted from the{' '}
            <span class="nowrap">King James Version.</span>
          </p>
          <p>
            <a class="more" href="/about">
              More about the channel
            </a>
          </p>
        </div>
      </div>
    </section>
    <Dusk />
    <NightClose />
  </main>
);

const About = () => (
  <main id="main">
    <PageField>
      <div class="strip">
        <h1>About the channel</h1>
      </div>
    </PageField>

    <section class="section" aria-labelledby="what-title">
      <div class="wrap split">
        <h2 id="what-title">What it is</h2>
        <div class="reading">
          <p>
            {CHANNEL.name} is a new YouTube channel of short films and plain talks on the Bible.
            They set it out one step at a time, from its first principles to its deepest truths, for
            any Christian and for anyone who will come and see.
          </p>
          <p>Nothing is published yet. The first films are being made now.</p>
        </div>
      </div>
    </section>

    <section class="section-band" aria-labelledby="name-title">
      <div class="wrap split">
        <h2 id="name-title">The name</h2>
        <div class="reading">
          <p>The name comes from a parable Jesus told:</p>
          <figure class="verse">
            <blockquote>
              <For each={MARK_4_26_28}>{(verse) => <p>{verse.text}</p>}</For>
            </blockquote>
            <figcaption class="ref">Mark 4:26–28</figcaption>
          </figure>
          <p>
            Faith grows that way too: first the blade, then the ear, after that the full corn. The
            films and talks are made to follow that order, a little and then a little more.
          </p>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="made-title">
      <div class="wrap split">
        <h2 id="made-title">How they are made</h2>
        <div class="reading">
          <p>
            The films are told in cut paper, with a small cast of characters who return from film to
            film. The talks are given simply, as to a friend across the table.
          </p>
          <p>
            Every verse is quoted from the <span class="nowrap">King James Version.</span> Where a
            film draws on other writers, its description and credits name them.
          </p>
        </div>
      </div>
    </section>

    <section class="section-band" aria-labelledby="four-title">
      <div class="wrap">
        <h2 class="section-title" id="four-title">
          The four series
        </h2>
        <Cards series={SERIES} />
      </div>
    </section>
    <Dusk />
    <NightClose />
  </main>
);

interface SeriesProps {
  readonly series: Series;
}

const SeriesPage = (props: SeriesProps) => {
  const s = props.series;
  const others = SERIES.filter((other) => other.id !== s.id);
  const unit = unitOf(s);
  return (
    <main id="main">
      <PageField>
        <div class="strip">
          <h1>{s.name}</h1>
          <p class="label">
            <span class="nowrap">{s.subject}</span> · <span class="nowrap">{s.form}</span>
          </p>
        </div>
      </PageField>

      <section class="section" aria-label="About the series">
        <div class="wrap split">
          <img class="emblem-large" src={EMBLEMS[s.id]} alt="" width="140" height="140" />
          <div class="reading">
            <Quote verse={s.verse} />
            <For each={s.about}>{(paragraph) => <p>{paragraph}</p>}</For>
          </div>
        </div>
      </section>

      <section class="section-band" aria-labelledby="parts-title">
        <div class="wrap split">
          <h2 id="parts-title">What it covers</h2>
          <ol class="parts">
            <For each={s.parts}>
              {(part) => (
                <li>
                  <h3>{part.title}</h3>
                  <p>{part.question}</p>
                </li>
              )}
            </For>
          </ol>
        </div>
      </section>

      <section class="section" aria-labelledby="episodes-title">
        <div class="wrap split">
          <h2 id="episodes-title">The {unit}</h2>
          <Show
            when={s.episodes.length > 0}
            fallback={
              <div class="reading">
                <p>None are out yet. The first {unit} are being made now.</p>
              </div>
            }
          >
            <ol class="episodes">
              <For each={s.episodes}>
                {(episode) => (
                  <li>
                    <a href={`https://www.youtube.com/watch?v=${episode.youtubeId}`}>
                      {episode.no} · {episode.title}
                    </a>
                    <p>{episode.summary}</p>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </div>
      </section>

      <section class="section-band" aria-labelledby="others-title">
        <div class="wrap">
          <h2 class="section-title" id="others-title">
            The other series
          </h2>
          <Cards series={others} />
        </div>
      </section>
      <Dusk />
      <NightClose />
    </main>
  );
};

const NotFound = () => (
  <main id="main">
    <section class="section-band">
      <div class="wrap lost">
        <img src={MARK.large} alt="" width="320" height="320" />
        <h1>Page not found</h1>
        <p>
          There is nothing at this address. The link may be mistyped, or the page may have moved.
        </p>
        <a class="button" href="/">
          <span class="button-label">Go to the home page</span>
        </a>
      </div>
    </section>
    <Dusk />
  </main>
);

const body = Match.type<PageView>().pipe(
  Match.tagsExhaustive({
    Home: () => <Home />,
    About: () => <About />,
    Series: (view) => <SeriesPage series={view.series} />,
    NotFound: () => <NotFound />,
  }),
);

interface ViewProps {
  readonly page: Page;
}

/** A page's body: the header, its own content and the footer. */
export const View = (props: ViewProps): JSX.Element => (
  <>
    <Header path={props.page.path} />
    {body(props.page.view)}
    <Footer />
  </>
);
