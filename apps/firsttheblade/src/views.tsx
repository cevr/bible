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
import { PROMISE } from './mail/promise.ts';
import type { Page, PageView } from './pages.ts';
import { CHANNEL, CONTACT } from './site.ts';
import { EMBLEMS, MARK } from './ui/art.ts';
import { Header } from './ui/header.tsx';
import { Confirm, Leave, Notice } from './ui/mail.tsx';
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
        <h2>We are making the first films now</h2>
        <p>None are out yet. When the first one is ready, you will find it on YouTube and here.</p>
      </div>
    </HomeField>

    <section class="section" id="series" aria-labelledby="series-title">
      <div class="wrap">
        <h2 class="lead" id="series-title">
          We are working on four series. Two are cut-paper films and two are talks.
        </h2>
        <Cards series={SERIES} />
      </div>
    </section>

    <section class="section-band" aria-labelledby="about-title">
      <div class="wrap split">
        <h2 id="about-title">Why we make these</h2>
        <div class="reading">
          <p>
            The Bible tells us who God is. It also speaks to the home, the farm, the classroom and
            the sickroom. We make these films and talks to show both, as plainly as we can.
          </p>
          <p>
            You do not need to know the Bible already. We explain as we go. Every verse is quoted
            from the <span class="nowrap">King James Version.</span>
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
            {CHANNEL.name} is a new YouTube channel of short films and talks about the Bible. They
            are for any Christian, and for anyone who wants to know what the Bible says.
          </p>
          <p>No film is out yet. We are working on the first ones.</p>
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
            Faith grows the same way. First the blade, then the ear, after that the full corn. So
            each series starts at the beginning and builds from there.
          </p>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="made-title">
      <div class="wrap split">
        <h2 id="made-title">How they are made</h2>
        <div class="reading">
          <p>
            The films are told in cut paper. A small cast of characters comes back from film to
            film. The talks are short and plain.
          </p>
          <p>
            Every verse is quoted from the <span class="nowrap">King James Version.</span> Where a
            film draws on other writers, we name them in its description and credits.
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
                <p>None are out yet. We are making the first {unit} now.</p>
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

interface PrivacySection {
  readonly id: string;
  readonly title: string;
  readonly band: 'section' | 'section-band';
  readonly words: ReadonlyArray<string>;
  /** An email address the section ends with, as a link that writes to it. */
  readonly address?: string;
}

/** What the email list keeps, why, how to leave it, who sees it, and where to write. */
const PRIVACY: ReadonlyArray<PrivacySection> = [
  {
    id: 'kept',
    title: 'What we keep',
    band: 'section',
    words: [
      'If you join the email list, we keep your email address, whether you have confirmed it, when you signed up, confirmed or left, and which films we have emailed you.',
      'If you sign up and never confirm, we delete your address, and everything we kept with it, thirty days later.',
      'That is all. We do not ask for your name. The emails have no tracking, so we do not know if you open them or which links you click.',
    ],
  },
  {
    id: 'why',
    title: 'Why',
    band: 'section-band',
    words: [`We use it to send you ${PROMISE}.`],
  },
  {
    id: 'leave',
    title: 'How to leave',
    band: 'section',
    words: [
      'Every email has a link at the bottom to leave the list. Most mail apps also show an unsubscribe button. Press either one and we will not email you again.',
      'After you leave, we keep your address only to mark it as left, so that no film is sent to it.',
    ],
  },
  {
    id: 'shared',
    title: 'Who sees it',
    band: 'section-band',
    words: [
      'No one else. We do not sell, rent or share the list. It is stored on Cloudflare, which also sends the emails for us.',
      'To stop abuse, the sign-up form counts how many tries come from one connection each minute. We do not keep that connection’s address.',
    ],
  },
  {
    id: 'contact',
    title: 'Write to us',
    band: 'section',
    words: ['If you have a question about the list or your address, email us.'],
    address: CONTACT,
  },
];

const Privacy = () => (
  <main id="main">
    <PageField>
      <div class="strip">
        <h1>Privacy</h1>
      </div>
    </PageField>
    <For each={PRIVACY}>
      {(section) => (
        <section class={section.band} aria-labelledby={`${section.id}-title`}>
          <div class="wrap split">
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            <div class="reading">
              <For each={section.words}>{(words) => <p>{words}</p>}</For>
              <Show when={section.address}>
                {(address) => (
                  <p>
                    <a href={`mailto:${address()}`}>{address()}</a>
                  </p>
                )}
              </Show>
            </div>
          </div>
        </section>
      )}
    </For>
    <Dusk />
    <NightClose />
  </main>
);

const NotFound = () => (
  <main id="main">
    <section class="section-band">
      <div class="wrap lost">
        <img src={MARK.large} alt="" width="320" height="320" />
        <h1>Page not found</h1>
        <p>There is no page here. The link may have a typo in it, or the page may have moved.</p>
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
    Privacy: () => <Privacy />,
    Notice: (view) => (
      <main id="main">
        <Notice notice={view.notice} />
        <Dusk />
      </main>
    ),
    Confirm: () => (
      <main id="main">
        <Confirm />
        <Dusk />
      </main>
    ),
    Leave: () => (
      <main id="main">
        <Leave />
        <Dusk />
      </main>
    ),
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
