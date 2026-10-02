// A film's project in a browser, its routes faked over a synthetic film of
// one act (open, close) and two scenes in no act (coda, end): home links the
// project; the page lists the act and its scenes by the address tree, each
// scene a render card with the video this checkout's catalogue records for
// it (not another folder's of the same film), its state (a render stale by
// the film's sound alone says so; a missing one names the command that
// renders it) and its approval; "Approve all current" approves the current
// scenes; a scene is approved, its approval withdrawn, and it is commented
// on (a missing one too); an act's current scenes are approved and the act
// commented on; each choice point sits once, where it belongs (the score
// with the film, a layer across the act's scenes with the act, a take with
// the scene it plays in), and a scene links the layers that play in it. The
// page updates in place (a half-typed comment and the clip survive a say
// elsewhere) and shows what a say or a pick answered without reading it
// twice; a read that lands after a say asked later leaves the say shown,
// and an approve refused because its scene went stale reads it again.
// Every wait is on the page, or on what it asked, never a fixed time.

import { Array as Arr, Deferred, Effect, Exit, Option, Schedule, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../../src/lab/fixtures/tab.ts';
import { FreshProcessFailed, VerbRefused } from '../../../../src/core/refusals.ts';
import {
  type FakeRoute,
  type Json,
  json,
  later,
  openReview,
  refused,
  route,
} from '../../../../src/lab/fixtures/harness.ts';
import {
  attached,
  attributeIs,
  attributesAre,
  countIs,
  evaluates,
  textIs,
  until,
  valueIs,
  waitFor,
} from '../../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

const FILM_AT: Json = { _tag: 'Film' };

/** A scene as `film project --json` encodes it. */
interface ToyScene {
  readonly scene: string;
  state: 'current' | 'stale' | 'missing';
  staleBy?: 'sources' | 'sound';
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
  ...Option.match(Option.fromUndefinedOr(s.staleBy), {
    onNone: () => ({}),
    onSome: (by) => ({ staleBy: by }),
  }),
  approval: s.approval,
  comments: said({ _tag: 'Scenes', ids: [s.scene] }, s.said),
});

/** A scene's video under `folder`, as the review serves it. */
const videoOf = (folder: string, scene: string): Json => ({
  ref: `${folder}/scenes/${scene}/main.share.mp4`,
  name: 'main.share.mp4',
  size: 1024,
  mtime: 0,
  phone: 'none',
});

/** A render set at a scene's address, with its main render, as the review's index lists it. */
const renderSet = (scene: string, folder: string): Json => ({
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
      media: { _tag: 'Seen', video: videoOf(folder, scene) },
      key: 'k',
      approval: 'none',
      comments: [],
    },
  ],
});

const heardVariant = (
  id: string,
  picked: boolean,
  verbs: ReadonlyArray<string> = [],
  comments: ReadonlyArray<Json> = [],
): Json => ({
  id,
  label: id,
  lines: [],
  state: 'current',
  picked,
  verbs,
  media: { _tag: 'Heard', alone: true, inPlace: true },
  key: id,
  approval: 'none',
  comments,
});

/** A point of `kind` at `address` with `variants`. */
const pointJson = (
  id: string,
  kind: string,
  address: Json,
  variants: ReadonlyArray<Json>,
): Json => ({
  id,
  kind,
  address,
  title: id,
  lines: [],
  start: 0,
  marks: [],
  variants,
});

/** The film's choices, with what was said of the take. */
const choicesOf = (takeSaid: ReadonlyArray<string>): Json => ({
  film: 'toy',
  pictures: [],
  points: [
    pointJson('score', 'score', FILM_AT, [
      heardVariant('strings', true),
      heardVariant('brass', false, ['pick']),
    ]),
    pointJson('take:paper.page', 'take', { _tag: 'Scenes', ids: ['open'] }, [
      heardVariant('a'.repeat(64), true, [], said({ _tag: 'Scenes', ids: ['open'] }, takeSaid)),
    ]),
    pointJson('voice:close', 'voice', { _tag: 'Scenes', ids: ['close'] }, [
      heardVariant('close-1.wav', true),
    ]),
    // A layer across the act's two scenes, and one across the act and a loose scene.
    pointJson('take:paper.hum', 'take', { _tag: 'Scenes', ids: ['open', 'close'] }, [
      heardVariant('b'.repeat(64), true),
    ]),
    pointJson('take:room.tone', 'take', { _tag: 'Scenes', ids: ['close', 'coda'] }, [
      heardVariant('c'.repeat(64), true),
    ]),
  ],
});

/** Another checkout's project folder of the film, rendered since: newer, so listed first. */
const ELSEWHERE: Json = {
  ref: 'elsewhere/toy',
  title: 'toy',
  mtime: 10,
  sets: [renderSet('open', 'elsewhere/toy')],
  videos: [],
  images: [],
  docs: [],
};

/** What was said of the film and of its act. */
interface Said {
  film: ReadonlyArray<string>;
  act: ReadonlyArray<string>;
}

/** A posted say: its address's tag and scene, and its own tag and text. */
interface PostedSay {
  readonly address: { readonly _tag: string; readonly ids?: ReadonlyArray<string> };
  readonly say: { readonly _tag: string; readonly text?: string };
}

const PostedSay = Schema.decodeUnknownSync(
  Schema.Struct({
    address: Schema.Struct({
      _tag: Schema.String,
      ids: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
    say: Schema.Struct({ _tag: Schema.String, text: Schema.optionalKey(Schema.String) }),
  }),
);

/**
 * The fake project: the scenes as they stand, and what was said of the film
 * and the act. `elsewhere` adds another checkout's folder of the film to the
 * review's index, rendered since; the scenes in `goneStale` were drawn again
 * since the page read them, so an approve naming one is refused and leaves it
 * stale by its sources.
 */
const fakeProject = (elsewhere = false, goneStale: ReadonlyArray<string> = []) => {
  const scenes: ReadonlyArray<ToyScene> = [
    { scene: 'open', state: 'current', approval: 'none', said: [] },
    { scene: 'close', state: 'stale', staleBy: 'sound', approval: 'stale', said: [] },
    { scene: 'coda', state: 'current', approval: 'none', said: [] },
    { scene: 'end', state: 'missing', approval: 'none', said: [] },
  ];
  const text: Said = { film: [], act: [] };
  let takeSaid: ReadonlyArray<string> = [];
  const view = (): Json => ({
    project: {
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
    },
    folder: 'out/toy',
    // This checkout's catalogue record of each rendered scene.
    videos: { open: videoOf('out/toy', 'open'), coda: videoOf('out/toy', 'coda') },
  });
  const approveCurrent = (ids: ReadonlyArray<string>) =>
    scenes
      .filter((s) => ids.includes(s.scene) && s.state === 'current')
      .forEach((s) => {
        s.approval = 'approved';
      });
  const posted = (asked: { readonly body: Option.Option<Json> }) =>
    PostedSay(Option.getOrElse(asked.body, () => ({})));
  const scenesOf = (p: PostedSay) => {
    if (p.address._tag === 'Film') return scenes.map((s) => s.scene);
    if (p.address._tag === 'Act') return ['open', 'close'];
    return p.address.ids ?? [];
  };
  const routes: ReadonlyArray<FakeRoute> = [
    route('GET', /^\/api\/review\/index/, () =>
      json({
        folders: [
          ...Arr.filter([ELSEWHERE], () => elsewhere),
          {
            ref: 'out/toy',
            title: 'toy',
            mtime: 0,
            sets: [renderSet('open', 'out/toy'), renderSet('coda', 'out/toy')],
            videos: [],
            images: [],
            docs: [],
          },
        ],
      }),
    ),
    route('GET', /^\/api\/films$/, () => json({ films: ['toy'] })),
    route('GET', /^\/api\/films\/toy\/choices$/, () => json(choicesOf(takeSaid))),
    route('GET', /^\/api\/films\/toy\/check$/, () => json({ findings: [] })),
    route('GET', /^\/api\/films\/toy\/steps$/, () =>
      json({ undo: { file: 'sound.ts', target: 'score play brass' } }),
    ),
    route('GET', /^\/api\/films\/toy\/choices\/check$/, () => json({ findings: [] })),
    route('POST', /^\/api\/films\/toy\/choices\/say$/, () => {
      takeSaid = [...takeSaid, 'the page is late'];
      return json(choicesOf(takeSaid));
    }),
    route('POST', /^\/api\/films\/toy\/choices\/pick$/, () =>
      json({
        file: 'sound.ts',
        target: 'score play brass',
        choices: choicesOf(takeSaid),
        findings: [],
      }),
    ),
    route('GET', /^\/api\/films\/toy\/project$/, () => json(view())),
    route('POST', /^\/api\/films\/toy\/project\/say$/, (asked) => {
      const p = posted(asked);
      const ids = scenesOf(p);
      const gone = scenes.filter((s) => ids.includes(s.scene) && goneStale.includes(s.scene));
      if (p.say._tag === 'Approve' && gone.length > 0) {
        gone.forEach((s) => {
          s.state = 'stale';
          s.staleBy = 'sources';
        });
        return refused(
          VerbRefused.make({
            point: `render:scenes:${gone.map((s) => s.scene).join(',')}`,
            variant: 'main',
            verb: 'approve',
            reason: 'its sources changed since it was made',
          }),
        );
      }
      if (p.say._tag === 'Approve') approveCurrent(ids);
      if (p.say._tag === 'Withdraw')
        scenes
          .filter((s) => ids.includes(s.scene))
          .forEach((s) => {
            s.approval = 'none';
          });
      if (p.say._tag === 'Comment') {
        const said = p.say.text ?? '';
        if (p.address._tag === 'Act') text.act = [...text.act, said];
        else if (p.address._tag === 'Film') text.film = [...text.film, said];
        else
          scenes
            .filter((s) => ids.includes(s.scene))
            .forEach((s) => {
              s.said = [...s.said, said];
            });
      }
      return json(view());
    }),
  ];
  return routes;
};

const PROJECT = '?project=toy';

const click = (page: Tab, selector: string) => page.click(selector);

const scene = (id: string) => `[data-scene="${id}"]`;

/** A scene's render card. */
const render = (id: string) => `${scene(id)} > [data-kind="render"]`;

/** The says posted to the project, in order. */
const saysPosted = (
  asked: ReadonlyArray<{ readonly path: string; readonly body: Option.Option<Json> }>,
) =>
  asked
    .filter((a) => a.path === '/api/films/toy/project/say')
    .map((a) => Option.getOrUndefined(a.body));

describe("a film's project", () => {
  it.live(
    'lists the act and its scenes with their renders, states and approvals; each choice once, where it belongs',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject());
        yield* click(page, 'a.rv-chip[href="/?project=toy"]');
        yield* until(page, "location.search === '?project=toy'");
        yield* waitFor(page, '[data-act-name="opening"]');
        // The act holds its scenes; the scenes in no act follow.
        yield* attributesAre(page, '[data-act-name="opening"] [data-scene]', 'data-scene', [
          'open',
          'close',
        ]);
        yield* waitFor(page, `${scene('coda')}[data-state="current"]`);
        yield* waitFor(page, `${scene('close')}[data-state="stale"]`);
        // A rendered scene plays its render; one with none recorded shows none.
        yield* until(
          page,
          `document.querySelector('${render('open')} video')?.getAttribute('src') === '/api/review/files/out/toy/scenes/open/main.share.mp4'`,
        );
        // Each render shows a still of itself before it is played, as a folder's cards do.
        yield* attributeIs(
          page,
          `${render('open')} video`,
          'poster',
          '/api/review/frame?ref=out%2Ftoy%2Fscenes%2Fopen%2Fmain.share.mp4&w=960',
        );
        yield* countIs(page, `${render('close')} video`, 0);
        // A render stale by the film's sound alone says so, beside its approval of an earlier version.
        yield* textIs(
          page,
          `${render('close')} .rv-tag[data-state]`,
          "out of date: the film's sound changed since it was made",
        );
        yield* textIs(
          page,
          `${render('close')} .rv-badge[data-approval]`,
          'needs review: an earlier version was approved',
        );
        // A stale scene is not approved until it is rendered again.
        yield* evaluates(
          page,
          `document.querySelector('${render('close')} [data-act="approve"]').disabled`,
          true,
        );
        // A missing scene names the command that renders it.
        yield* textIs(
          page,
          `${render('end')} .rv-meta`,
          'not rendered yet: film project render toy --scene end',
        );
        // The score with the film; a layer of the act's scenes with the act; one across parts with the film.
        yield* waitFor(page, '.rv-film [data-point="score"]');
        yield* attached(
          page,
          '[data-act-name="opening"] > .rv-layers [data-point="take:paper.hum"]',
        );
        yield* attached(page, '.rv-film [data-point="take:room.tone"]');
        // The take with its scene, the voice with its beat.
        yield* attached(page, `${scene('open')} [data-point="take:paper.page"]`);
        yield* attached(page, `${scene('close')} [data-point="voice:close"]`);
        // Each card once: a scene links the layers that play in it but sit elsewhere.
        yield* countIs(page, '.rv-option:not([data-kind="render"])', 5);
        yield* attributesAre(page, `${scene('close')} [data-plays]`, 'data-plays', [
          'take:paper.hum',
          'take:room.tone',
        ]);
        // A link opens the part its card is folded under.
        yield* click(page, `${scene('open')} [data-plays="take:paper.hum"]`);
        yield* waitFor(
          page,
          '[data-act-name="opening"] > .rv-layers[open] [data-point="take:paper.hum"]',
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'approves all current, one scene, an act; withdraws a scene, an act and the film; comments on a scene, a missing one, an act and the film',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeProject(), { search: PROJECT });
        yield* waitFor(page, `${render('open')} [data-act="approve"][data-approval="none"]`);
        // One scene approved as it is rendered, and its approval withdrawn.
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* waitFor(page, `${render('coda')} .rv-badge[data-approval="approved"]`);
        yield* waitFor(page, `${render('open')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="withdraw"]`);
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, '[data-act="approve-all"]');
        yield* waitFor(page, `${render('open')} .rv-badge[data-approval="approved"]`);
        yield* waitFor(page, `${render('coda')} .rv-badge[data-approval="approved"]`);
        // The stale scene is left for a render.
        yield* waitFor(page, `${render('close')} .rv-badge[data-approval="stale"]`);
        // Nothing current is left to approve, in the film or the act: no say would change a thing.
        yield* until(page, `document.querySelector('[data-act="approve-all"]').disabled === true`);
        yield* until(page, `document.querySelector('[data-act="approve-act"]').disabled === true`);

        yield* page.fill(`${render('open')} .rv-comment-input`, 'the hand jumps');
        yield* click(page, `${render('open')} [data-act="comment"]`);
        yield* waitFor(page, `${render('open')} [data-comment="c1"]`);
        // A scene not rendered yet is commented on too.
        yield* page.fill(`${render('end')} .rv-comment-input`, 'render it warm');
        yield* click(page, `${render('end')} [data-act="comment"]`);
        yield* waitFor(page, `${render('end')} [data-comment="c1"]`);

        // An act's approvals withdrawn in one say (the stale one too), its current scenes
        // approved again in one, then the film's withdrawn.
        yield* click(page, '[data-act="withdraw-act"]');
        yield* waitFor(page, `${render('open')} [data-act="approve"][data-approval="none"]`);
        yield* waitFor(page, `${render('close')} [data-act="approve"][data-approval="none"]`);
        yield* waitFor(page, `${render('coda')} .rv-badge[data-approval="approved"]`);
        yield* countIs(page, '[data-act="withdraw-act"]', 0);
        yield* click(page, '[data-act="approve-act"]');
        yield* waitFor(page, `${render('open')} .rv-badge[data-approval="approved"]`);
        yield* until(page, `document.querySelector('[data-act="approve-act"]').disabled === true`);
        yield* click(page, '[data-act="withdraw-all"]');
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* countIs(page, '[data-act="withdraw-all"]', 0);

        yield* page.fill('[data-act-name="opening"] > .rv-say .rv-comment-input', 'the act drags');
        yield* click(page, '[data-act-name="opening"] > .rv-say [data-act="comment"]');
        yield* waitFor(page, '[data-act-name="opening"] > .rv-comments [data-comment="c1"]');

        yield* page.fill('.rv-film > .rv-say .rv-comment-input', 'a whole film note');
        yield* click(page, '.rv-film > .rv-say [data-act="comment"]');
        yield* waitFor(page, '.rv-film > .rv-comments [data-comment="c1"]');
        const scenes = (id: string) => ({ _tag: 'Scenes', ids: [id] });
        expect(saysPosted(asked)).toEqual([
          { address: scenes('coda'), say: { _tag: 'Approve' } },
          { address: scenes('coda'), say: { _tag: 'Withdraw' } },
          { address: { _tag: 'Film' }, say: { _tag: 'Approve' } },
          { address: scenes('open'), say: { _tag: 'Comment', text: 'the hand jumps' } },
          { address: scenes('end'), say: { _tag: 'Comment', text: 'render it warm' } },
          { address: { _tag: 'Act', act: 'opening' }, say: { _tag: 'Withdraw' } },
          { address: { _tag: 'Act', act: 'opening' }, say: { _tag: 'Approve' } },
          { address: { _tag: 'Film' }, say: { _tag: 'Withdraw' } },
          {
            address: { _tag: 'Act', act: 'opening' },
            say: { _tag: 'Comment', text: 'the act drags' },
          },
          { address: { _tag: 'Film' }, say: { _tag: 'Comment', text: 'a whole film note' } },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'updates in place: a half-typed comment and the clip survive a say on another scene',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(), { search: PROJECT });
        yield* waitFor(page, `${scene('open')} video`);
        yield* page.fill(`${scene('open')} .rv-comment-input`, 'half a thought');
        yield* page.evaluate(`window.clip = document.querySelector('${scene('open')} video')`);
        yield* click(page, `${scene('coda')} [data-act="approve"]`);
        yield* waitFor(page, `${scene('coda')} .rv-badge[data-approval="approved"]`);
        yield* valueIs(page, `${scene('open')} .rv-comment-input`, 'half a thought');
        yield* evaluates(
          page,
          `window.clip === document.querySelector('${scene('open')} video')`,
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a comment whose say fails stays in its box beside the failure; one that is said empties it',
    () =>
      Effect.gen(function* () {
        // The film is mid-edit and does not load: every say fails until it does.
        let loads = false;
        const routes = fakeProject();
        const failing = FreshProcessFailed.make({ command: 'film comment', reason: 'exit 1' });
        const whileBroken = (path: RegExp): FakeRoute =>
          route('POST', path, (asked) =>
            Option.match(
              Option.filter(
                Option.fromUndefinedOr(
                  routes.find((r) => r.method === 'POST' && r.path.test(asked.path)),
                ),
                () => loads,
              ),
              { onNone: () => refused(failing), onSome: (r) => r.answer(asked) },
            ),
          );
        const { page, asked, errors } = yield* openReview(
          [
            whileBroken(/^\/api\/films\/toy\/project\/say$/),
            whileBroken(/^\/api\/films\/toy\/choices\/say$/),
            ...routes,
          ],
          { search: PROJECT },
        );
        const box = (at: string) => `${at} .rv-comment-input`;
        /** Say `text` in the box at `at`, posted as the `n`th say to `path`; wait for `status` to fail it. */
        const failedSay = (at: string, text: string, path: string, n: number, status: string) =>
          Effect.gen(function* () {
            yield* page.fill(box(at), text);
            yield* click(page, `${at} [data-act="comment"]`);
            yield* Effect.sync(() => asked.filter((a) => a.path === path).length).pipe(
              Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (m) => m >= n }),
              Effect.timeout('10 seconds'),
            );
            yield* until(
              page,
              `((s) => s.dataset.failed === 'true' && !s.textContent.endsWith('…'))(document.querySelector('${status}'))`,
            );
          });
        const PROJECT_SAY = '/api/films/toy/project/say';
        const take = `${scene('open')} [data-point="take:paper.page"]`;
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        // A scene's comment, the film's, and a take's: each fails, and each keeps its text.
        yield* failedSay(render('open'), 'a long thoughtful note', PROJECT_SAY, 1, 'p.rv-status');
        yield* valueIs(page, box(render('open')), 'a long thoughtful note');
        yield* failedSay('.rv-film > .rv-say', 'of the whole film', PROJECT_SAY, 2, 'p.rv-status');
        yield* valueIs(page, box('.rv-film > .rv-say'), 'of the whole film');
        yield* click(page, `${scene('open')} > .rv-layers > summary`);
        yield* failedSay(
          take,
          'the page is late',
          '/api/films/toy/choices/say',
          1,
          '.rv-writes .rv-status',
        );
        yield* valueIs(page, box(take), 'the page is late');
        // The film loads again: the kept comment is said, and its box empties.
        loads = true;
        yield* click(page, `${render('open')} [data-act="comment"]`);
        yield* waitFor(page, `${render('open')} [data-comment="c1"]`);
        yield* valueIs(page, box(render('open')), '');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an approve refused because the scene went stale reads the project again: the card says why',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(false, ['coda']), {
          search: PROJECT,
        });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* until(
          page,
          `document.querySelector('p.rv-status').dataset.failed === 'true' && !document.querySelector('p.rv-status').textContent.endsWith('…')`,
        );
        yield* waitFor(page, `${scene('coda')}[data-state="stale"]`);
        yield* textIs(
          page,
          `${render('coda')} .rv-tag[data-state]`,
          'out of date: its sources changed since it was made',
        );
        yield* evaluates(
          page,
          `document.querySelector('${render('coda')} [data-act="approve"]').disabled`,
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "plays this checkout's render of a scene, not another folder's of the same film",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(true), { search: PROJECT });
        yield* waitFor(page, `${scene('open')} video`);
        yield* attributeIs(
          page,
          `${scene('open')} video`,
          'src',
          '/api/review/files/out/toy/scenes/open/main.share.mp4',
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a read asked before a say and answered after it leaves the say on the page',
    () =>
      Effect.gen(function* () {
        const routes = fakeProject();
        const plain = Option.getOrThrow(
          Option.fromUndefinedOr(
            routes.find((r) => r.method === 'GET' && r.path.test('/api/films/toy/project')),
          ),
        );
        // The read after the pick answers the project as it stood when asked, once let land.
        const land = yield* Deferred.make<void>();
        let reads = 0;
        const lateRead = route('GET', /^\/api\/films\/toy\/project$/, (asked) => {
          reads += 1;
          const then = plain.answer(asked);
          if (reads === 1) return then;
          return later(land, then);
        });
        const { page, asked, errors } = yield* openReview([lateRead, ...routes], {
          search: PROJECT,
        });
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        yield* click(
          page,
          '.rv-film [data-point="score"] [data-variant="brass"] [data-act="pick"]',
        );
        yield* Effect.sync(
          () =>
            asked.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/project').length,
        ).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 2 }),
          Effect.timeout('10 seconds'),
        );
        yield* attributeIs(page, '.rv-film', 'data-reading', 'true');
        // Said while the read is out: the say answers the project with the comment.
        yield* page.fill(`${render('open')} .rv-comment-input`, 'said while it read');
        yield* click(page, `${render('open')} [data-act="comment"]`);
        yield* waitFor(page, `${render('open')} [data-comment="c1"]`);
        // The older read lands last: the page has read it, and the comment stays.
        yield* Deferred.done(land, Exit.void);
        yield* attributeIs(page, '.rv-film', 'data-reading', 'false');
        yield* countIs(page, `${render('open')} [data-comment="c1"]`, 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a say answered after a read asked later is read again: the page shows both',
    () =>
      Effect.gen(function* () {
        const routes = fakeProject();
        const plainSay = Option.getOrThrow(
          Option.fromUndefinedOr(
            routes.find((r) => r.method === 'POST' && r.path.test('/api/films/toy/project/say')),
          ),
        );
        // The say is taken when asked; its answer lands once let.
        const land = yield* Deferred.make<void>();
        const lateSay = route('POST', /^\/api\/films\/toy\/project\/say$/, (asked) => {
          const then = plainSay.answer(asked);
          return later(land, then);
        });
        const { page, asked, errors } = yield* openReview([lateSay, ...routes], {
          search: PROJECT,
        });
        const reads = () =>
          asked.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/project').length;
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        yield* page.fill(`${render('open')} .rv-comment-input`, 'said before the pick');
        yield* click(page, `${render('open')} [data-act="comment"]`);
        yield* Effect.sync(() => saysPosted(asked).length).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 1 }),
          Effect.timeout('10 seconds'),
        );
        // A pick while the say is out: its read answers first, without the comment.
        yield* click(
          page,
          '.rv-film [data-point="score"] [data-variant="brass"] [data-act="pick"]',
        );
        yield* Effect.sync(reads).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 2 }),
          Effect.timeout('10 seconds'),
        );
        yield* attributeIs(page, '.rv-film', 'data-reading', 'false');
        // The say lands last: the project is read again, and the comment shows.
        yield* Deferred.done(land, Exit.void);
        yield* waitFor(page, `${render('open')} [data-comment="c1"]`);
        // The read again can reach the server after the comment shows: wait for it.
        const all = yield* Effect.sync(reads).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 3 }),
          Effect.timeout('10 seconds'),
        );
        expect(all).toBe(3);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a comment said while another is in flight goes at once, and each box empties on its own answer',
    () =>
      Effect.gen(function* () {
        const routes = fakeProject();
        const plainSay = Option.getOrThrow(
          Option.fromUndefinedOr(
            routes.find((r) => r.method === 'POST' && r.path.test('/api/films/toy/project/say')),
          ),
        );
        // The first say (the film's comment) is held; the next answers at once.
        const land = yield* Deferred.make<void>();
        let says = 0;
        const heldFirst = route('POST', /^\/api\/films\/toy\/project\/say$/, (asked) => {
          says += 1;
          const then = plainSay.answer(asked);
          if (says === 1) return later(land, then);
          return then;
        });
        const { page, asked, errors } = yield* openReview([heldFirst, ...routes], {
          search: PROJECT,
        });
        const film = '.rv-film > .rv-say';
        const act = '[data-act-name="opening"] > .rv-say';
        yield* waitFor(page, `${film} .rv-comment-input`);
        yield* page.fill(`${film} .rv-comment-input`, 'of the whole film');
        yield* click(page, `${film} [data-act="comment"]`);
        yield* Effect.sync(() => saysPosted(asked).length).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 1 }),
          Effect.timeout('10 seconds'),
        );
        // The film's box waits on its own say; the act's is free.
        yield* evaluates(
          page,
          `document.querySelector('${film} [data-act="comment"]').disabled`,
          true,
        );
        yield* page.fill(`${act} .rv-comment-input`, 'of the opening');
        yield* click(page, `${act} [data-act="comment"]`);
        yield* countIs(page, '[data-act-name="opening"] > .rv-comments li', 1);
        yield* valueIs(page, `${act} .rv-comment-input`, '');
        // The act's answer is not the film's: its box keeps the text until its own lands.
        yield* evaluates(
          page,
          `document.querySelector('${film} .rv-comment-input').value`,
          'of the whole film',
        );
        yield* Deferred.done(land, Exit.void);
        yield* valueIs(page, `${film} .rv-comment-input`, '');
        expect(saysPosted(asked)).toEqual([
          { address: { _tag: 'Film' }, say: { _tag: 'Comment', text: 'of the whole film' } },
          {
            address: { _tag: 'Act', act: 'opening' },
            say: { _tag: 'Comment', text: 'of the opening' },
          },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a say and a pick are shown from their answers: nothing is read twice',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeProject(), { search: PROJECT });
        const take = `${scene('open')} [data-point="take:paper.page"]`;
        yield* attached(page, take);
        const reads = (from: number) =>
          asked
            .slice(from)
            .filter(
              (a) =>
                a.method === 'GET' &&
                /^\/api\/films\/toy\/(choices|check|project)(\?|$)/.test(a.path),
            )
            .map((a) => a.path);
        const before = asked.length;
        yield* click(page, `${scene('open')} > .rv-layers > summary`);
        yield* page.fill(`${take} .rv-comment-input`, 'the page is late');
        yield* click(page, `${take} [data-act="comment"]`);
        yield* waitFor(page, `${take} [data-comment="c1"]`);
        yield* click(
          page,
          '.rv-film [data-point="score"] [data-variant="brass"] [data-act="pick"]',
        );
        // A pick changes the film's sound: the project's scenes are read again, once.
        yield* Effect.sync(() => reads(before)).pipe(
          Effect.repeat({
            schedule: Schedule.spaced('25 millis'),
            until: (paths) => paths.includes('/api/films/toy/project'),
          }),
          Effect.timeout('10 seconds'),
        );
        expect(reads(before)).toEqual(['/api/films/toy/project']);
        // Undo names what it undoes.
        yield* until(
          page,
          `document.querySelector('[data-act="undo"]').textContent === 'Undo score play brass'`,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
