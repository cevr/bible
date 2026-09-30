// A film's project in a browser, its routes faked over a synthetic film of
// one act (open, close) and a scene in no act (coda): home links the
// project; the page lists the act and its scenes by the address tree, each
// scene with its render (the render set at its address in the review's
// index), its state and its approval; "Approve all current" approves the
// current scenes and the answer is shown; a scene is approved and commented
// on; an act's current scenes are approved and the act commented on; and
// the film's choice points sit where they belong (the score with the film,
// a take with the scene it plays in, a voice with its beat). Every wait is
// on the page, never a fixed time.

import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import { type FakeRoute, type Json, json, openReview, route } from '../../fixtures/harness.ts';

const SLOW = 30_000;

/** A posted body as its JSON text. */
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const FILM_AT: Json = { _tag: 'Film' };

/** A scene as `film project --json` encodes it. */
interface ToyScene {
  readonly scene: string;
  readonly state: 'current' | 'stale' | 'missing';
  approval: 'none' | 'approved' | 'stale';
  said: ReadonlyArray<string>;
}

const said = (address: Json, texts: ReadonlyArray<string>): ReadonlyArray<Json> =>
  texts.map((text, i) => ({
    id: `c${i + 1}`,
    address,
    variant: 'main',
    key: 'k',
    text,
    at: i,
    onThis: true,
  }));

const sceneJson = (s: ToyScene): Json => ({
  scene: s.scene,
  key: 'k',
  state: s.state,
  approval: s.approval,
  comments: said({ _tag: 'Scenes', ids: [s.scene] }, s.said),
});

/** A render set at a scene's address, with its main render, as the review's index lists it. */
const renderSet = (scene: string): Json => ({
  id: `render:scenes:${scene}`,
  kind: 'render',
  address: { _tag: 'Scenes', ids: [scene] },
  title: `scene ${scene}`,
  lines: [],
  start: 0,
  marks: [],
  variants: [
    {
      id: 'main',
      label: 'main',
      lines: [],
      state: 'current',
      picked: false,
      verbs: [],
      media: {
        _tag: 'Seen',
        video: {
          ref: `out/toy/scenes/${scene}/main.share.mp4`,
          name: 'main.share.mp4',
          size: 1024,
          mtime: 0,
          phone: 'none',
        },
      },
      key: 'k',
      approval: 'none',
      comments: [],
    },
  ],
});

const heardVariant = (id: string, picked: boolean): Json => ({
  id,
  label: id,
  lines: [],
  state: 'current',
  picked,
  verbs: [],
  media: { _tag: 'Heard', alone: true, inPlace: true },
  key: id,
  approval: 'none',
  comments: [],
});

const CHOICES: Json = {
  film: 'toy',
  pictures: [],
  points: [
    {
      id: 'score',
      kind: 'score',
      address: FILM_AT,
      title: 'score',
      lines: [],
      start: 0,
      marks: [],
      variants: [heardVariant('strings', true)],
    },
    {
      id: 'take:paper.page',
      kind: 'take',
      address: { _tag: 'Scenes', ids: ['open'] },
      title: 'paper.page',
      lines: [],
      start: 0,
      marks: [],
      variants: [heardVariant('a'.repeat(64), true)],
    },
    {
      id: 'voice:close',
      kind: 'voice',
      address: { _tag: 'Scenes', ids: ['close'] },
      title: 'close',
      lines: [],
      start: 0,
      marks: [],
      variants: [heardVariant('close-1.wav', true)],
    },
  ],
};

/** What was said of the film and of its act. */
interface Said {
  film: ReadonlyArray<string>;
  act: ReadonlyArray<string>;
}

/** The fake project: the scenes as they stand, and what was said of the film and the act. */
const fakeProject = () => {
  const scenes: ReadonlyArray<ToyScene> = [
    { scene: 'open', state: 'current', approval: 'none', said: [] },
    { scene: 'close', state: 'stale', approval: 'none', said: [] },
    { scene: 'coda', state: 'current', approval: 'none', said: [] },
  ];
  const text: Said = { film: [], act: [] };
  const project = (): Json => ({
    film: 'toy',
    variant: 'main',
    key: 'fk',
    comments: said(FILM_AT, text.film),
    acts: [
      {
        name: 'opening',
        scenes: ['open', 'close'],
        key: 'ak',
        comments: said({ _tag: 'Act', act: 'opening' }, text.act),
      },
    ],
    scenes: scenes.map(sceneJson),
  });
  const approveCurrent = (ids: ReadonlyArray<string>) =>
    scenes
      .filter((s) => ids.includes(s.scene) && s.state === 'current')
      .forEach((s) => {
        s.approval = 'approved';
      });
  const posted = (asked: { readonly body: Option.Option<Json> }) =>
    Option.getOrElse(Option.map(asked.body, jsonText), () => '');
  const routes: ReadonlyArray<FakeRoute> = [
    route('GET', /^\/review\/index/, () =>
      json({
        folders: [
          {
            ref: 'out/toy',
            title: 'toy',
            mtime: 0,
            sets: [renderSet('open'), renderSet('coda')],
            videos: [],
            images: [],
            docs: [],
          },
        ],
      }),
    ),
    route('GET', /^\/review\/films$/, () => json({ films: ['toy'] })),
    route('GET', /^\/lab\/toy\/choices$/, () => json(CHOICES)),
    route('GET', /^\/lab\/toy\/check$/, () => json({ findings: [] })),
    route('GET', /^\/review\/project\/toy$/, () => json(project())),
    route('POST', /^\/review\/project\/toy\/approve-all$/, () => {
      approveCurrent(scenes.map((s) => s.scene));
      return json(project());
    }),
    route('POST', /^\/review\/project\/toy\/approve$/, (asked) => {
      const body = posted(asked);
      if (body.includes('"Act"')) approveCurrent(['open', 'close']);
      else approveCurrent(['coda']);
      return json(project());
    }),
    route('POST', /^\/review\/project\/toy\/comment$/, (asked) => {
      const body = posted(asked);
      if (body.includes('"Act"')) text.act = [...text.act, 'the act drags'];
      else if (body.includes('"Film"')) text.film = [...text.film, 'a whole film note'];
      else
        scenes
          .filter((s) => s.scene === 'open')
          .forEach((s) => {
            s.said = [...s.said, 'the hand jumps'];
          });
      return json(project());
    }),
  ];
  return routes;
};

const PROJECT = '?project=toy';

const waitFor = (page: Page, selector: string) =>
  Effect.promise(() => page.waitForSelector(selector));

const until = (page: Page, check: string) => Effect.promise(() => page.waitForFunction(check));

const click = (page: Page, selector: string) => Effect.promise(() => page.click(selector));

const evaluate = <A>(page: Page, script: string) =>
  Effect.promise(() => page.evaluate(script) as Promise<A>);

const scene = (id: string) => `[data-scene="${id}"]`;

describe("a film's project", () => {
  it.live(
    'lists the act and its scenes with their renders, states and approvals; choices where they belong',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject());
        yield* click(page, 'a.rv-chip >> text=toy · project');
        yield* until(page, "location.search === '?project=toy'");
        yield* waitFor(page, '[data-act-name="opening"]');
        // The act holds its scenes; the scene in no act follows.
        expect(
          yield* evaluate<string>(
            page,
            'Array.from(document.querySelectorAll(\'[data-act-name="opening"] [data-scene]\')).map((e) => e.dataset.scene).join()',
          ),
        ).toBe('open,close');
        yield* waitFor(page, `${scene('coda')}[data-state="current"]`);
        yield* waitFor(page, `${scene('close')}[data-state="stale"]`);
        // A rendered scene plays its render; one with none in the index shows none.
        yield* until(
          page,
          `document.querySelector('${scene('open')} video')?.getAttribute('src') === '/review/files/out/toy/scenes/open/main.share.mp4'`,
        );
        expect(
          yield* evaluate<boolean>(
            page,
            `document.querySelector('${scene('close')} video') === null`,
          ),
        ).toBe(true);
        // A stale scene is not approved until it is rendered again.
        expect(
          yield* evaluate<boolean>(
            page,
            `document.querySelector('${scene('close')} [data-act="approve"]').disabled`,
          ),
        ).toBe(true);
        // The score with the film, the take with its scene, the voice with its beat.
        yield* waitFor(page, '.rv-film [data-point="score"]');
        yield* waitFor(page, `${scene('open')} [data-point="take:paper.page"]`);
        yield* waitFor(page, `${scene('close')} [data-point="voice:close"]`);
        expect(
          yield* evaluate<number>(
            page,
            'document.querySelectorAll(\'[data-point="score"]\').length',
          ),
        ).toBe(1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'approves all current, one scene, an act; comments on a scene, an act and the film',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeProject(), { search: PROJECT });
        yield* waitFor(page, `${scene('open')} [data-approval="none"]`);
        // One scene approved as it is rendered.
        yield* click(page, `${scene('coda')} [data-act="approve"]`);
        yield* waitFor(page, `${scene('coda')} .rv-badge[data-approval="approved"]`);
        yield* waitFor(page, `${scene('open')} .rv-badge[data-approval="none"]`);
        yield* click(page, '[data-act="approve-all"]');
        yield* waitFor(page, `${scene('open')} .rv-badge[data-approval="approved"]`);
        yield* waitFor(page, `${scene('coda')} .rv-badge[data-approval="approved"]`);
        // The stale scene is left for a render.
        yield* waitFor(page, `${scene('close')} .rv-badge[data-approval="none"]`);
        expect(
          asked.some((a) => a.method === 'POST' && a.path === '/review/project/toy/approve-all'),
        ).toBe(true);

        yield* Effect.promise(() =>
          page.fill(`${scene('open')} > .rv-body > .rv-say .rv-comment-input`, 'the hand jumps'),
        );
        yield* click(page, `${scene('open')} > .rv-body > .rv-say [data-act="comment"]`);
        yield* waitFor(page, `${scene('open')} [data-comment="c1"]`);
        const scenePost = asked.find((a) => a.path === '/review/project/toy/comment');
        expect(
          Option.getOrUndefined(Option.flatMap(Option.fromUndefinedOr(scenePost), (a) => a.body)),
        ).toEqual({
          address: { _tag: 'Scenes', ids: ['open'] },
          text: 'the hand jumps',
        });

        yield* click(page, '[data-act="approve-act"]');
        yield* until(page, "document.querySelector('p.rv-status').dataset.said === 'true'");
        yield* until(page, `document.querySelector('[data-act="approve-act"]').disabled === false`);
        expect(
          asked
            .filter((a) => a.path === '/review/project/toy/approve')
            .map((a) => Option.getOrUndefined(a.body)),
        ).toEqual([
          { address: { _tag: 'Scenes', ids: ['coda'] } },
          { address: { _tag: 'Act', act: 'opening' } },
        ]);

        yield* Effect.promise(() =>
          page.fill('[data-act-name="opening"] > .rv-say .rv-comment-input', 'the act drags'),
        );
        yield* click(page, '[data-act-name="opening"] > .rv-say [data-act="comment"]');
        yield* waitFor(page, '[data-act-name="opening"] > .rv-comments [data-comment="c1"]');

        yield* Effect.promise(() =>
          page.fill('.rv-film > .rv-say .rv-comment-input', 'a whole film note'),
        );
        yield* click(page, '.rv-film > .rv-say [data-act="comment"]');
        yield* waitFor(page, '.rv-film > .rv-comments [data-comment="c1"]');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
