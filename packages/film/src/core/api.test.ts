import { describe, expect, test } from 'bun:test';
import { Place } from '@bible/url-state';
import { Duration, Option, Schema } from 'effect';
import {
  LabHttpApi,
  TIME_EVERY_MS,
  type AppPage,
  Places,
  filmOfPage,
  labUrls,
  legacyPlace,
  pageAt,
  pageHref,
  reviewFileUrl,
  servedPlace,
} from './api.ts';
import { declares } from './testing.ts';
import { LONGEST_WAIT, WaitTimeout } from './wait.ts';

type PlaceName = keyof typeof Places;

/**
 * Links to every page as the app writes them, each with the place it opens,
 * the page that serves it, and the href the place writes back for it: a
 * canonical link comes back byte for byte; the rest normalise (defaults left
 * out, keys a place does not declare dropped, a broken key at its default).
 */
const LINKS: ReadonlyArray<
  readonly [href: string, place: PlaceName, page: AppPage, written: string]
> = [
  ['/', 'home', 'review', '/'],
  ['/sets/bible-tools%2Frbf', 'folder', 'review', '/sets/bible-tools%2Frbf'],
  [
    '/sets/bible-tools%2Frbf/render:scenes:roof',
    'set',
    'review',
    '/sets/bible-tools%2Frbf/render:scenes:roof',
  ],
  [
    '/sets/bible-tools%2Frbf/render:scenes:roof?view=pair&other=light',
    'set',
    'review',
    '/sets/bible-tools%2Frbf/render:scenes:roof?view=pair&other=light',
  ],
  [
    '/sets/bible-tools%2Frbf/render:scenes:roof?view=moments&m=2#t=31.5',
    'set',
    'review',
    '/sets/bible-tools%2Frbf/render:scenes:roof?view=moments&m=2#t=31.5',
  ],
  ['/sets/f/take:wood.gavel?view=all&m=0', 'set', 'review', '/sets/f/take:wood.gavel'],
  ['/sets/f/p?view=nonsense&m=-2', 'set', 'review', '/sets/f/p'],
  ['/films/rbf/studio', 'studio', 'player', '/films/rbf/studio'],
  ['/films/rbf/studio#t=42', 'studio', 'player', '/films/rbf/studio#t=42'],
  // A blank time is no time, though `Number` reads it as 0.
  ['/films/rbf/studio#t=%20', 'studio', 'player', '/films/rbf/studio'],
  [
    '/films/rbf/studio?v=2&sel=beat:roof#t=4.5',
    'studio',
    'player',
    '/films/rbf/studio?v=2&sel=beat%3Aroof#t=4.5',
  ],
  ['/films/rbf/studio?v=0&sel=&nope=1', 'studio', 'player', '/films/rbf/studio'],
  ['/films/rbf/studio?v=x', 'studio', 'player', '/films/rbf/studio'],
  [
    '/films/rbf%2Fshorts%2Fverdict/studio#t=3.25',
    'studio',
    'player',
    '/films/rbf%2Fshorts%2Fverdict/studio#t=3.25',
  ],
  ['/films/rbf/lab', 'lab', 'lab', '/films/rbf/lab'],
  ['/films/rbf/lab?note=n-1#t=60', 'lab', 'lab', '/films/rbf/lab?note=n-1#t=60'],
  ['/films/rbf/lab?cue=lower', 'lab', 'lab', '/films/rbf/lab'],
  ['/films/rbf/lab/roof', 'labScene', 'lab', '/films/rbf/lab/roof'],
  ['/films/rbf/lab/roof?cue=lower#t=1.5', 'labScene', 'lab', '/films/rbf/lab/roof?cue=lower#t=1.5'],
  ['/films/rbf/lab/roof?knob=sway', 'labScene', 'lab', '/films/rbf/lab/roof?knob=sway'],
  ['/films/rbf/lab/roof?note=n-2#t=-0.5', 'labScene', 'lab', '/films/rbf/lab/roof?note=n-2#t=-0.5'],
  ['/films/rbf/lab/roof#t=nope', 'labScene', 'lab', '/films/rbf/lab/roof'],
  ['/films/rbf/export', 'export', 'render', '/films/rbf/export'],
  [
    '/films/rbf%2Fshorts%2Fverdict/export',
    'export',
    'render',
    '/films/rbf%2Fshorts%2Fverdict/export',
  ],
];

describe('page places', () => {
  test.each(LINKS)('%s is the %s place, served by the %s page', (href, name, page, written) => {
    const place: Place.Place<unknown> = Places[name];
    const value = Place.decode(place, href);
    expect(Option.isSome(value)).toBe(true);
    expect(Option.map(value, (v) => Place.href(place, v))).toEqual(Option.some(written));
    expect(pageAt(href.split(/[?#]/)[0] ?? '')).toEqual(Option.some(page));
  });

  test('a written link reads back as the same value', () => {
    for (const [href, name] of LINKS) {
      const place: Place.Place<unknown> = Places[name];
      const value = Place.decode(place, href);
      const again = Option.flatMap(value, (v) => Place.decode(place, Place.href(place, v)));
      expect(again).toEqual(value);
    }
  });

  test.each([
    '/films',
    '/films/rbf',
    '/films/rbf/lab/roof/extra',
    '/sets',
    '/api/films',
    '/chunk-abc123.js',
    '/films/%2E%2E/studio',
    // The pages the studio replaced: no page is served there (the server sends a browser on, `servedPlace`).
    '/films/rbf/play',
    '/films/rbf/scenes',
    '/films/rbf/scenes/roof',
    '/films/rbf/project',
    '/films/rbf/choices',
    '/films/rbf/script',
    '/films/rbf/script/roof',
    '/films/rbf/board',
    '/films/rbf/board/roof',
  ])('%s serves no page', (path) => {
    expect(pageAt(path)).toEqual(Option.none());
  });

  test("a film's export page is the render page's own place, never the studio's", () => {
    expect(pageAt('/films/rbf/export')).toEqual(Option.some('render'));
    expect(pageAt('/films/rbf/studio')).toEqual(Option.some('player'));
    expect(filmOfPage('/films/rbf%2Fshorts%2Fverdict/export?build=3')).toEqual(
      Option.some('rbf/shorts/verdict'),
    );
  });

  test('every link the app prints is its place', () => {
    expect(pageHref.home()).toBe('/');
    expect(pageHref.folder('bible-tools/rbf')).toBe('/sets/bible-tools%2Frbf');
    expect(pageHref.set('bible-tools/rbf', 'render:scenes:roof')).toBe(
      '/sets/bible-tools%2Frbf/render:scenes:roof',
    );
    expect(pageHref.studio('rbf/shorts/verdict')).toBe('/films/rbf%2Fshorts%2Fverdict/studio');
    expect(pageHref.studio('rbf', { v: 2, sel: 'beat:roof' }, Option.some(4.5))).toBe(
      '/films/rbf/studio?v=2&sel=beat%3Aroof#t=4.5',
    );
    expect(pageHref.lab('rbf')).toBe('/films/rbf/lab');
    expect(pageHref.labScene('rbf', 'roof', { cue: 'lower' }, Option.some(0.25))).toBe(
      '/films/rbf/lab/roof?cue=lower#t=0.25',
    );
  });

  test('a moving time is written at most every TIME_EVERY_MS on every place that keeps one, in place', () => {
    const moving = {
      history: 'replace' as const,
      throttle: Option.some(Duration.millis(TIME_EVERY_MS)),
    };
    const along = (at: string) => [`${at}#t=1`, `${at}#t=2`] as const;
    expect(Place.history(Places.studio, ...along('/films/f/studio'))).toEqual(moving);
    expect(Place.history(Places.lab, ...along('/films/f/lab'))).toEqual(moving);
    expect(Place.history(Places.labScene, ...along('/films/f/lab/one'))).toEqual(moving);
    expect(Place.history(Places.set, ...along('/sets/f/p'))).toEqual(moving);
  });

  test("the studio's version and its selection are steps Back walks", () => {
    const step = { history: 'push' as const, throttle: Option.none() };
    expect(Place.history(Places.studio, '/films/f/studio', '/films/f/studio?v=1')).toEqual(step);
    expect(
      Place.history(Places.studio, '/films/f/studio', '/films/f/studio?sel=beat%3Aone'),
    ).toEqual(step);
  });

  test("a film's page names its film in its path, a short's whole name too", () => {
    expect(filmOfPage('/films/rbf/lab/roof?cue=lower#t=1')).toEqual(Option.some('rbf'));
    expect(filmOfPage(pageHref.studio('rbf/shorts/verdict'))).toEqual(
      Option.some('rbf/shorts/verdict'),
    );
    expect(filmOfPage(pageHref.studio('rbf'))).toEqual(Option.some('rbf'));
    for (const href of ['/', '/sets/f/p', '/?film=rbf'])
      expect(filmOfPage(href)).toEqual(Option.none());
  });
});

/**
 * Old links, each with the place it opens now: what the server answers with
 * a redirect (no hash: the browser keeps its own across it), and what a page
 * already loaded replaces its entry with (the hash kept, a bare number read
 * as film time where the place reads film time).
 */
const OLD_LINKS: ReadonlyArray<readonly [old: string, now: string]> = [
  // A render link: the easel's before the render page had a place, the PreviewServer's form.
  ['/films/rbf/play?export', '/films/rbf/export'],
  ['/films/rbf/play?export&build=3', '/films/rbf/export?build=3'],
  [
    '/films/rbf%2Fshorts%2Fverdict/play?export&wedge=4-x',
    '/films/rbf%2Fshorts%2Fverdict/export?wedge=4-x',
  ],
  ['/?film=rbf&export', '/films/rbf/export'],
  ['/?film=rbf&export&captions=0', '/films/rbf/export?captions=0'],
  ['/lab?film=rbf', '/films/rbf/lab'],
  ['/lab?film=rbf#42.000', '/films/rbf/lab#t=42'],
  ['/lab?film=rbf&sel=cue:roof:lower', '/films/rbf/lab/roof?cue=lower'],
  ['/lab?film=rbf&sel=cue:roof:lower#60.000', '/films/rbf/lab/roof?cue=lower#60.000'],
  ['/lab?film=rbf&sel=knob:roof:sway', '/films/rbf/lab/roof?knob=sway'],
  ['/lab?film=rbf&sel=cue:render:scenes:x', '/films/rbf/lab/render?cue=scenes%3Ax'],
  ['/lab?film=rbf&sel=nonsense', '/films/rbf/lab'],
  // A name no path can hold (a URL resolves `.` and `..` away) names nothing.
  ['/lab?film=rbf&sel=cue:..:lower', '/films/rbf/lab'],
  ['/lab?film=..', '/'],
  ['/?folder=f&set=..', '/sets/f'],
  ['/lab', '/'],
  ['/player?film=rbf', '/films/rbf/studio'],
  ['/player?film=rbf#42.000', '/films/rbf/studio#t=42'],
  ['/player?film=rbf&lookbook', '/films/rbf/studio'],
  ['/player?film=rbf&lookbook#42.5', '/films/rbf/studio#t=42.5'],
  ['/player?film=rbf&lab#3.5', '/films/rbf/lab#t=3.5'],
  ['/player?film=rbf%2Fshorts%2Fverdict&lookbook', '/films/rbf%2Fshorts%2Fverdict/studio'],
  ['/player', '/'],
  ['/?project=rbf', '/films/rbf/studio'],
  ['/?film=rbf', '/films/rbf/studio'],
  ['/?film=rbf&lookbook', '/films/rbf/studio'],
  ['/?film=rbf&lookbook#42.5', '/films/rbf/studio#t=42.5'],
  ['/?film=rbf&lab', '/films/rbf/lab'],
  ['/?folder=bible-tools%2Frbf', '/sets/bible-tools%2Frbf'],
  [
    '/?folder=bible-tools%2Frbf&set=render%3Ascenes%3Aroof',
    '/sets/bible-tools%2Frbf/render:scenes:roof',
  ],
  [
    '/?folder=bible-tools%2Frbf&set=render%3Ascenes%3Aroof&view=moments&m=2',
    '/sets/bible-tools%2Frbf/render:scenes:roof?view=moments&m=2',
  ],
  ['/?folder=f&set=p&view=pair&other=light', '/sets/f/p?view=pair&other=light'],
  ['/films/rbf/play#12.5', '/films/rbf/play#t=12.5'],
  ['/films/rbf/lab#12.5', '/films/rbf/lab#t=12.5'],
  ['/films/rbf/scenes#12.5', '/films/rbf/scenes#t=12.5'],
  ['/films/rbf/scenes/roof#12.5', '/films/rbf/scenes/roof#t=12.5'],
  ['/films/rbf/studio#3.5', '/films/rbf/studio#t=3.5'],
  // A card's anchor is the project's `?point=`: the studio, which replaced the project, takes it on.
  ['/films/rbf/project#point-take%3Awood.gavel', '/films/rbf/project?point=take%3Awood.gavel'],
  [
    '/films/rbf/project#point-render%3Ascenes%3Aroof',
    '/films/rbf/project?point=render%3Ascenes%3Aroof',
  ],
];

describe('old links', () => {
  test.each(OLD_LINKS)('%s opens %s', (old, now) => {
    expect(legacyPlace(old)).toEqual(Option.some(now));
  });

  test('the server, which never sees the hash, sends each to its path and query', () => {
    const sentByOldLinks = OLD_LINKS.filter(([old]) => !old.startsWith('/films/'));
    for (const [old, now] of sentByOldLinks)
      expect(legacyPlace(old.replace(/#.*$/, ''))).toEqual(Option.some(now.replace(/#.*$/, '')));
  });

  test.each([
    '/',
    '/films/rbf/export',
    '/films/rbf/export?build=3',
    '/films/rbf/studio',
    '/films/rbf/studio#t=4',
    '/films/rbf/play',
    '/films/rbf/lab/roof#42.000',
    '/films/rbf/choices',
    '/films/rbf/project?point=render%3Ascenes%3Aroof',
    '/sets/f/p?view=pair',
    '/nowhere?film=rbf',
    // A film no path can hold (a URL resolves `.` and `..` away) names no film.
    '/?film=..',
    '/?film=..&export',
    '/?film=.&export',
    '/?project=..',
    '/?folder=..',
    // A card's anchor whose escape is broken names no card, and throws nothing.
    '/films/rbf/project#point-%',
    '/films/rbf/project#point-%E0%A4%A',
  ])('%s is not old', (href) => {
    expect(legacyPlace(href)).toEqual(Option.none());
  });

  test('every old link lands on a page, through the studio where it replaced the page', () => {
    for (const [, now] of OLD_LINKS) {
      const landed = Option.getOrElse(servedPlace(now), () => now);
      expect(Option.isSome(pageAt(landed.split(/[?#]/)[0] ?? ''))).toBe(true);
    }
  });
});

/**
 * Each film page the studio replaced, with where the lab's server sends it
 * (`servedPlace`): the film's studio, the beat it was on selected and the
 * film time it was at kept (a scene of the tape's `#t=` is film time, as the
 * studio's is).
 */
const REPLACED_LINKS: ReadonlyArray<readonly [old: string, now: string]> = [
  ['/films/rbf/play', '/films/rbf/studio'],
  ['/films/rbf/play#t=4', '/films/rbf/studio#t=4'],
  ['/films/rbf/scenes', '/films/rbf/studio'],
  ['/films/rbf/scenes#t=12.5', '/films/rbf/studio#t=12.5'],
  ['/films/rbf/scenes/roof', '/films/rbf/studio?sel=beat%3Aroof'],
  ['/films/rbf/scenes/roof#t=2', '/films/rbf/studio?sel=beat%3Aroof#t=2'],
  ['/films/rbf/project', '/films/rbf/studio'],
  // A scene's render on the project names its scene: the studio selects it.
  ['/films/rbf/project?point=render%3Ascenes%3Aroof', '/films/rbf/studio?sel=beat%3Aroof'],
  ['/films/rbf/project?point=render%3Afilm', '/films/rbf/studio'],
  ['/films/rbf%2Fshorts%2Fverdict/play', '/films/rbf%2Fshorts%2Fverdict/studio'],
  // An older link goes through its place to the studio.
  ['/player?film=rbf', '/films/rbf/studio'],
  ['/player?film=rbf&lookbook#42.5', '/films/rbf/studio#t=42.5'],
  // A choice's card on the project or Choices: its picks arrive as asks, on the studio.
  ['/films/rbf/project?point=score', '/films/rbf/studio'],
  ['/films/rbf/choices', '/films/rbf/studio'],
  ['/films/rbf/choices?point=score&inspect=piano#t=3', '/films/rbf/studio#t=3'],
  // The Script and the Board: the beat (or the panel) they were on selected, their film time kept.
  ['/films/rbf/script', '/films/rbf/studio'],
  ['/films/rbf/script?note=n-2#t=4', '/films/rbf/studio#t=4'],
  ['/films/rbf/script/roof', '/films/rbf/studio?sel=beat%3Aroof'],
  [
    '/films/rbf%2Fshorts%2Fverdict/script/roof',
    '/films/rbf%2Fshorts%2Fverdict/studio?sel=beat%3Aroof',
  ],
  ['/films/rbf/board', '/films/rbf/studio'],
  ['/films/rbf/board?note=n-3', '/films/rbf/studio'],
  ['/films/rbf/board/roof', '/films/rbf/studio?sel=beat%3Aroof'],
  ['/films/rbf/board/roof?panel=start&try=2#t=0.5', '/films/rbf/studio?sel=panel%3Aroof.start'],
];

/**
 * The film page still served as asked beside the studio: the Lab, each
 * scene's place and each note's (`?note=`) kept in its own address.
 */
const KEPT_PAGES = [
  '/films/rbf/lab',
  '/films/rbf/lab?note=n-1#t=60',
  '/films/rbf/lab/roof?cue=lower#t=1.5',
];

describe('the pages the studio replaced', () => {
  test.each(REPLACED_LINKS)('%s is sent on to %s', (old, now) => {
    expect(servedPlace(old)).toEqual(Option.some(now));
  });

  test.each(['/films/rbf/studio', '/films/rbf/export', '/sets/f/p', '/', ...KEPT_PAGES])(
    '%s is served as asked',
    (href) => {
      expect(servedPlace(href)).toEqual(Option.none());
    },
  );

  test.each(KEPT_PAGES)('%s is the Lab page, served at its own path', (href) => {
    expect(pageAt(href.split(/[?#]/)[0] ?? '')).toEqual(Option.some('lab'));
  });

  test('the Lab holds its note and its scene time in its address', () => {
    expect(
      Option.map(Place.decode(Places.lab, '/films/rbf/lab?note=n-1#t=60'), (v) => [
        v.query.note,
        v.hash.t,
      ]),
    ).toEqual(Option.some(['n-1', Option.some(60)]));
    expect(
      Option.map(Place.decode(Places.labScene, '/films/rbf/lab/roof?cue=lower#t=1.5'), (v) => [
        v.query.cue,
        v.hash.t,
      ]),
    ).toEqual(Option.some(['lower', Option.some(1.5)]));
  });

  test("an old lab link lands on the Lab, its scene's place kept", () => {
    expect(servedPlace('/lab?film=rbf&sel=cue:roof:lower')).toEqual(
      Option.some('/films/rbf/lab/roof?cue=lower'),
    );
  });
});

describe('waits', () => {
  const asked = Schema.decodeUnknownSync(Schema.Struct({ timeout: WaitTimeout }));

  test.each([
    [{ timeout: 999 }, LONGEST_WAIT],
    [{}, LONGEST_WAIT],
    [{ timeout: -5 }, 0],
    [{ timeout: 3 }, 3],
  ])('a wait asked %o is held %d s at most, never past the longest', (query, held) => {
    expect(asked(query).timeout).toBe(held);
  });
});

describe('declared routes', () => {
  const declared = declares(LabHttpApi);

  test.each([
    ['GET', '/api/films/rbf/notes'],
    ['POST', '/api/films/rbf/notes/n-1/resolve'],
    ['GET', '/api/films/rbf%2Fshorts%2Fverdict/choices/mix'],
    ['GET', '/api/review/files/out/art/roof.A.md'],
  ])('%s %s is declared', (method, pathname) => {
    expect(declared(method, pathname)).toBe(true);
  });

  test.each([
    ['POST', '/api/films/rbf/notes/n-1'],
    ['GET', '/api/films/rbf/notes/n-1/resolve'],
    ['GET', '/lab/rbf/choices'],
    ['GET', '/api/films/rbf/notes/extra/segments/here'],
  ])('%s %s is not', (method, pathname) => {
    expect(declared(method, pathname)).toBe(false);
  });

  test("the API's paths, as the wire has them", () => {
    expect(labUrls.notes.list({ params: { film: 'f' } })).toBe('/api/films/f/notes');
    expect(labUrls.scenes.cue({ params: { film: 'f', scene: 's', cue: 'c' } })).toBe(
      '/api/films/f/scenes/s/cues/c',
    );
    expect(labUrls.choices.films()).toBe('/api/films');
    expect(labUrls.project.get({ params: { film: 'f' }, query: {} })).toBe('/api/films/f/project');
    expect(labUrls.review.index({ query: {} })).toBe('/api/review/index');
    expect(labUrls.page.wait({ query: { since: 3, timeout: 9 } })).toBe(
      '/api/review/build?since=3&timeout=9',
    );
    expect(reviewFileUrl('out/a b.mp4')).toBe('/api/review/files/out/a%20b.mp4');
  });
});
