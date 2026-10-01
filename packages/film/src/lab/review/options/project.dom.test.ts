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
// twice. Every wait is on the page, or on what it asked, never a fixed time.

import { Array as Arr, Effect, Option, Schedule, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import { FreshProcessFailed } from '../../../core/refusals.ts';
import {
  type FakeRoute,
  type Json,
  json,
  openReview,
  refused,
  route,
} from '../../fixtures/harness.ts';
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
} from '../../fixtures/settled.ts';

const SLOW = 30_000;

const FILM_AT: Json = { _tag: 'Film' };

/** A scene as `film project --json` encodes it. */
interface ToyScene {
  readonly scene: string;
  readonly state: 'current' | 'stale' | 'missing';
  readonly staleBy?: 'sources' | 'sound';
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
 * review's index, rendered since.
 */
const fakeProject = (elsewhere = false) => {
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
    route('GET', /^\/review\/index/, () =>
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
    route('GET', /^\/review\/films$/, () => json({ films: ['toy'] })),
    route('GET', /^\/lab\/toy\/choices$/, () => json(choicesOf(takeSaid))),
    route('GET', /^\/lab\/toy\/check$/, () => json({ findings: [] })),
    route('GET', /^\/lab\/toy\/steps$/, () =>
      json({ undo: { file: 'sound.ts', target: 'score play brass' } }),
    ),
    route('GET', /^\/lab\/toy\/choices\/check$/, () => json({ findings: [] })),
    route('POST', /^\/lab\/toy\/choices\/say$/, () => {
      takeSaid = [...takeSaid, 'the page is late'];
      return json(choicesOf(takeSaid));
    }),
    route('POST', /^\/lab\/toy\/choices\/pick$/, () =>
      json({
        file: 'sound.ts',
        target: 'score play brass',
        choices: choicesOf(takeSaid),
        findings: [],
      }),
    ),
    route('GET', /^\/review\/project\/toy$/, () => json(view())),
    route('POST', /^\/review\/project\/toy\/say$/, (asked) => {
      const p = posted(asked);
      const ids = scenesOf(p);
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

const click = (page: Page, selector: string) => Effect.promise(() => page.click(selector));

const scene = (id: string) => `[data-scene="${id}"]`;

/** A scene's render card. */
const render = (id: string) => `${scene(id)} > [data-kind="render"]`;

/** The says posted to the project, in order. */
const saysPosted = (
  asked: ReadonlyArray<{ readonly path: string; readonly body: Option.Option<Json> }>,
) =>
  asked
    .filter((a) => a.path === '/review/project/toy/say')
    .map((a) => Option.getOrUndefined(a.body));

describe("a film's project", () => {
  it.live(
    'lists the act and its scenes with their renders, states and approvals; each choice once, where it belongs',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject());
        yield* click(page, 'a.rv-chip >> text=toy · project');
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
          `document.querySelector('${render('open')} video')?.getAttribute('src') === '/review/files/out/toy/scenes/open/main.share.mp4'`,
        );
        yield* countIs(page, `${render('close')} video`, 0);
        // A render stale by the film's sound alone says so, beside its approval of an earlier version.
        yield* textIs(
          page,
          `${render('close')} .rv-tag[data-state]`,
          "stale: the film's sound changed since it was made",
        );
        yield* textIs(
          page,
          `${render('close')} .rv-badge[data-approval]`,
          'approved an earlier version',
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

        yield* Effect.promise(() =>
          page.fill(`${render('open')} .rv-comment-input`, 'the hand jumps'),
        );
        yield* click(page, `${render('open')} [data-act="comment"]`);
        yield* waitFor(page, `${render('open')} [data-comment="c1"]`);
        // A scene not rendered yet is commented on too.
        yield* Effect.promise(() =>
          page.fill(`${render('end')} .rv-comment-input`, 'render it warm'),
        );
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
        yield* Effect.promise(() =>
          page.fill(`${scene('open')} .rv-comment-input`, 'half a thought'),
        );
        yield* Effect.promise(() =>
          page.evaluate(`window.clip = document.querySelector('${scene('open')} video')`),
        );
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
            whileBroken(/^\/review\/project\/toy\/say$/),
            whileBroken(/^\/lab\/toy\/choices\/say$/),
            ...routes,
          ],
          { search: PROJECT },
        );
        const box = (at: string) => `${at} .rv-comment-input`;
        /** Say `text` in the box at `at`, posted as the `n`th say to `path`; wait for `status` to fail it. */
        const failedSay = (at: string, text: string, path: string, n: number, status: string) =>
          Effect.gen(function* () {
            yield* Effect.promise(() => page.fill(box(at), text));
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
        const PROJECT_SAY = '/review/project/toy/say';
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
          '/lab/toy/choices/say',
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
    "plays this checkout's render of a scene, not another folder's of the same film",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(true), { search: PROJECT });
        yield* waitFor(page, `${scene('open')} video`);
        yield* attributeIs(
          page,
          `${scene('open')} video`,
          'src',
          '/review/files/out/toy/scenes/open/main.share.mp4',
        );
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
                /^\/(lab\/toy\/(choices|check)|review\/project\/toy)(\?|$)/.test(a.path),
            )
            .map((a) => a.path);
        const before = asked.length;
        yield* click(page, `${scene('open')} > .rv-layers > summary`);
        yield* Effect.promise(() => page.fill(`${take} .rv-comment-input`, 'the page is late'));
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
            until: (paths) => paths.includes('/review/project/toy'),
          }),
          Effect.timeout('10 seconds'),
        );
        expect(reads(before)).toEqual(['/review/project/toy']);
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
