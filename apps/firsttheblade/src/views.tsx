/**
 * What each page shows. The copy is plain and makes no claim the channel
 * cannot keep: no film is out yet, so no page lists one, counts one or plays
 * one. Each series lists its films once they are in `./content.ts`.
 */
import { For, Show } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { Match } from 'effect';

import { MARK_4_28, SERIES, type Series, type Verse } from './content.ts';
import type { Page, PageView } from './pages.ts';
import { CHANNEL } from './site.ts';
import { COVERS, GROWTH, MARK, srcset } from './ui/art.ts';
import { Header } from './ui/header.tsx';
import { SUBSCRIBE } from './ui/nav.ts';
import { Band, Cards, FieldHero, Footer, unitOf } from './ui/parts.tsx';

/** Mark 4:26–28, the parable the channel is named from. */
const MARK_4_26_28: ReadonlyArray<Verse> = [
  {
    text: 'And he said, So is the kingdom of God, as if a man should cast seed into the ground;',
    ref: 'Mark 4:26',
  },
  {
    text: 'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
    ref: 'Mark 4:27',
  },
  MARK_4_28,
];

interface VerseProps {
  readonly verse: Verse;
}

/** A verse in the films' italic, its reference beneath it. */
const Quote = (props: VerseProps) => (
  <figure class="verse">
    <blockquote>
      <p>“{props.verse.text}”</p>
    </blockquote>
    <figcaption class="ref">{props.verse.ref}</figcaption>
  </figure>
);

const Home = () => (
  <main id="main">
    <h1 class="visually-hidden">{CHANNEL.name}</h1>
    <FieldHero short={false}>
      <figure class="strip">
        <blockquote>
          <p>“{MARK_4_28.text}”</p>
        </blockquote>
        <figcaption class="ref">{MARK_4_28.ref}</figcaption>
      </figure>
    </FieldHero>

    <section class="section wrap feature" aria-labelledby="coming-title">
      <img
        class="media"
        src={GROWTH.small}
        srcset={srcset(GROWTH)}
        sizes="(min-width: 60rem) 47.5rem, 100vw"
        alt="Three discs: the blade, then the ear, then the full corn."
        width="640"
        height="360"
      />
      <div class="stack">
        <h2 id="coming-title">The first films are on their way</h2>
        <p class="lead">Nothing is published yet. The first films are being made now.</p>
      </div>
    </section>

    <section class="section wrap" id="series" aria-labelledby="series-title">
      <div class="series-head">
        <h2 id="series-title">
          Short films and plain talks that grow the way the Bible grows us: a little, and then a
          little more.
        </h2>
      </div>
      <Cards series={SERIES} eager={false} />
    </section>

    <section class="section-ruled" aria-labelledby="about-title">
      <div class="wrap about">
        <h2 id="about-title">Why we make these</h2>
        <div class="reading">
          <p>
            These films and talks set the Bible out plainly, one step at a time: what it teaches,
            from its first principles to its deepest truths, and how it reaches into the home, the
            field, the schoolroom and the sickroom.
          </p>
          <p>
            They are made for anyone who will come and see. The films are told in cut paper; the
            talks are given simply, as to a friend across the table. Every verse is quoted from the
            King James Version.
          </p>
          <p>
            <a class="more" href="/about">
              More about the channel
            </a>
          </p>
        </div>
      </div>
    </section>
    <Band />
  </main>
);

const About = () => (
  <main id="main">
    <FieldHero short={true}>
      <div class="strip strip-compact">
        <h1>About the channel</h1>
      </div>
    </FieldHero>

    <section class="wrap about" aria-labelledby="what-title">
      <h2 id="what-title">What it is</h2>
      <div class="reading">
        <p>
          {CHANNEL.name} is a new YouTube channel of short films and plain talks on the Bible. They
          set it out one step at a time, from its first principles to its deepest truths, for any
          Christian and for anyone who will come and see.
        </p>
        <p>Nothing is published yet. The first films are being made now.</p>
      </div>
    </section>

    <section class="section-ruled" aria-labelledby="name-title">
      <div class="wrap about">
        <h2 id="name-title">The name</h2>
        <div class="reading stack">
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

    <section class="section-ruled" aria-labelledby="made-title">
      <div class="wrap about">
        <h2 id="made-title">How they are made</h2>
        <div class="reading">
          <p>
            The films are told in cut paper, with a small cast of characters who return from film to
            film. The talks are given simply, as to a friend across the table.
          </p>
          <p>
            Every verse is quoted from the King James Version. Where a film draws on other writers,
            its description and credits name them.
          </p>
        </div>
      </div>
    </section>

    <section class="section-ruled" aria-labelledby="four-title">
      <div class="wrap about-series">
        <h2 id="four-title">The four series</h2>
        <Cards series={SERIES} eager={false} />
      </div>
    </section>
    <Band />
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
    <main id="main" data-series={s.id}>
      <FieldHero short={true}>
        <div class="strip strip-compact strip-series">
          <h1>{s.name}</h1>
          <p class="label">
            {s.subject} · {s.form}
          </p>
        </div>
      </FieldHero>

      <section class="section wrap feature" aria-label="About the series">
        <img
          class="media"
          src={COVERS[s.id].small}
          srcset={srcset(COVERS[s.id])}
          sizes="(min-width: 60rem) 47.5rem, 100vw"
          alt=""
          width="640"
          height="360"
        />
        <div class="stack reading">
          <Quote verse={s.verse} />
          <For each={s.about}>{(paragraph) => <p>{paragraph}</p>}</For>
        </div>
      </section>

      <section class="section wrap" aria-labelledby="parts-title">
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
      </section>

      <section class="section wrap" aria-labelledby="episodes-title">
        <h2 id="episodes-title">The {unit}</h2>
        <Show
          when={s.episodes.length > 0}
          fallback={
            <div class="empty">
              <p>None are out yet. Subscribe on YouTube to see the first one when it is ready.</p>
              <a class="button" href={SUBSCRIBE.href}>
                {SUBSCRIBE.label}
              </a>
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
      </section>

      <section class="section wrap page-end" aria-labelledby="others-title">
        <h2 id="others-title">The other series</h2>
        <Cards series={others} eager={false} />
      </section>
    </main>
  );
};

const NotFound = () => (
  <main id="main" class="wrap lost">
    <img src={MARK} alt="" width="120" height="120" />
    <h1>Page not found</h1>
    <p class="lead">
      There is nothing at this address. The link may be mistyped, or the page may have moved.
    </p>
    <a class="button" href="/">
      Go to the home page
    </a>
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
