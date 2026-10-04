import { describe, expect, test } from 'bun:test';
import { Place } from '@bible/url-state';
import { Option } from 'effect';
import {
  LabHttpApi,
  type PageName,
  Places,
  declares,
  filmOfPage,
  legacyPlace,
  pageAt,
  pageHref,
} from './api.ts';

type PlaceName = keyof typeof Places;

/**
 * Links to every page as the app writes them, each with the place it opens,
 * the page that serves it, and the href the place writes back for it: a
 * canonical link comes back byte for byte; the rest normalise (defaults left
 * out, keys a place does not declare dropped, a broken key at its default).
 */
const LINKS: ReadonlyArray<
  readonly [href: string, place: PlaceName, page: PageName, written: string]
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
  ['/films/rbf/choices', 'choices', 'review', '/films/rbf/choices'],
  [
    '/films/rbf/choices?heard=score&variant=strings&picture=out%2Frbf%2Fmain.mp4#t=12',
    'choices',
    'review',
    '/films/rbf/choices?heard=score&variant=strings&picture=out%2Frbf%2Fmain.mp4#t=12',
  ],
  ['/films/rbf/choices?heard=own', 'choices', 'review', '/films/rbf/choices?heard=own'],
  ['/films/rbf/project', 'project', 'review', '/films/rbf/project'],
  [
    '/films/rbf/project?point=take%3Awood.gavel',
    'project',
    'review',
    '/films/rbf/project?point=take%3Awood.gavel',
  ],
  [
    '/films/rbf/project?point=score&heard=own#t=3.5',
    'project',
    'review',
    '/films/rbf/project?point=score&heard=own#t=3.5',
  ],
  ['/films/rbf/scenes', 'scenes', 'player', '/films/rbf/scenes'],
  ['/films/rbf/scenes/roof', 'scene', 'player', '/films/rbf/scenes/roof'],
  ['/films/rbf/play', 'play', 'player', '/films/rbf/play'],
  ['/films/rbf/play#t=42', 'play', 'player', '/films/rbf/play#t=42'],
  [
    '/films/rbf%2Fshorts%2Fverdict/play#t=3.25',
    'play',
    'player',
    '/films/rbf%2Fshorts%2Fverdict/play#t=3.25',
  ],
  ['/films/rbf/lab', 'lab', 'lab', '/films/rbf/lab'],
  ['/films/rbf/lab?note=n-1#t=60', 'lab', 'lab', '/films/rbf/lab?note=n-1#t=60'],
  ['/films/rbf/lab?cue=lower', 'lab', 'lab', '/films/rbf/lab'],
  ['/films/rbf/lab/roof', 'labScene', 'lab', '/films/rbf/lab/roof'],
  ['/films/rbf/lab/roof?cue=lower#t=1.5', 'labScene', 'lab', '/films/rbf/lab/roof?cue=lower#t=1.5'],
  ['/films/rbf/lab/roof?knob=sway', 'labScene', 'lab', '/films/rbf/lab/roof?knob=sway'],
  ['/films/rbf/lab/roof?note=n-2#t=-0.5', 'labScene', 'lab', '/films/rbf/lab/roof?note=n-2#t=-0.5'],
  ['/films/rbf/lab/roof#t=nope', 'labScene', 'lab', '/films/rbf/lab/roof'],
  ['/films/rbf/project#point-score', 'project', 'review', '/films/rbf/project'],
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
    '/films/%2E%2E/play',
  ])('%s serves no page', (path) => {
    expect(pageAt(path)).toEqual(Option.none());
  });

  test('every link the app prints is its place', () => {
    expect(pageHref.home()).toBe('/');
    expect(pageHref.folder('bible-tools/rbf')).toBe('/sets/bible-tools%2Frbf');
    expect(pageHref.set('bible-tools/rbf', 'render:scenes:roof')).toBe(
      '/sets/bible-tools%2Frbf/render:scenes:roof',
    );
    expect(pageHref.choices('rbf')).toBe('/films/rbf/choices');
    expect(pageHref.project('rbf', 'score')).toBe('/films/rbf/project?point=score');
    expect(pageHref.scenes('rbf/shorts/verdict')).toBe('/films/rbf%2Fshorts%2Fverdict/scenes');
    expect(pageHref.play('rbf', Option.some(4.5))).toBe('/films/rbf/play#t=4.5');
    expect(pageHref.lab('rbf')).toBe('/films/rbf/lab');
    expect(pageHref.labScene('rbf', 'roof', { cue: 'lower' }, Option.some(0.25))).toBe(
      '/films/rbf/lab/roof?cue=lower#t=0.25',
    );
  });

  test("a film's page names its film in its path, a short's whole name too", () => {
    expect(filmOfPage('/films/rbf/lab/roof?cue=lower#t=1')).toEqual(Option.some('rbf'));
    expect(filmOfPage(pageHref.scenes('rbf/shorts/verdict'))).toEqual(
      Option.some('rbf/shorts/verdict'),
    );
    expect(filmOfPage(pageHref.play('rbf'))).toEqual(Option.some('rbf'));
    for (const href of ['/', '/sets/f/p', '/?film=rbf&export'])
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
  ['/lab?film=rbf', '/films/rbf/lab'],
  ['/lab?film=rbf#42.000', '/films/rbf/lab#t=42'],
  ['/lab?film=rbf&sel=cue:roof:lower', '/films/rbf/lab/roof?cue=lower'],
  ['/lab?film=rbf&sel=cue:roof:lower#60.000', '/films/rbf/lab/roof?cue=lower#60.000'],
  ['/lab?film=rbf&sel=knob:roof:sway', '/films/rbf/lab/roof?knob=sway'],
  ['/lab?film=rbf&sel=cue:render:scenes:x', '/films/rbf/lab/render?cue=scenes%3Ax'],
  ['/lab?film=rbf&sel=nonsense', '/films/rbf/lab'],
  ['/lab', '/'],
  ['/player?film=rbf', '/films/rbf/play'],
  ['/player?film=rbf#42.000', '/films/rbf/play#t=42'],
  ['/player?film=rbf&lookbook', '/films/rbf/scenes'],
  ['/player?film=rbf&lab#3.5', '/films/rbf/lab#t=3.5'],
  ['/player?film=rbf%2Fshorts%2Fverdict&lookbook', '/films/rbf%2Fshorts%2Fverdict/scenes'],
  ['/player', '/'],
  ['/?project=rbf', '/films/rbf/project'],
  ['/?film=rbf', '/films/rbf/choices'],
  ['/?film=rbf&lookbook', '/films/rbf/scenes'],
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
  ['/films/rbf/project#point-take%3Awood.gavel', '/films/rbf/project?point=take%3Awood.gavel'],
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
    '/?film=rbf&export',
    '/?film=rbf&export&captions=0',
    '/films/rbf/play',
    '/films/rbf/play#t=4',
    '/films/rbf/lab/roof#42.000',
    '/films/rbf/choices',
    '/sets/f/p?view=pair',
    '/nowhere?film=rbf',
  ])('%s is not old', (href) => {
    expect(legacyPlace(href)).toEqual(Option.none());
  });

  test('every old link lands on a page', () => {
    for (const [, now] of OLD_LINKS)
      expect(Option.isSome(pageAt(now.split(/[?#]/)[0] ?? ''))).toBe(true);
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
});
