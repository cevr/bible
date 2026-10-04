// A film's project in a browser, its routes faked over a synthetic film of
// one act (open, close) and two scenes in no act (coda, end): home links the
// project; the page lists the act and its scenes by the address tree, each
// scene a render card with the video this checkout's catalogue records for
// it (not another folder's of the same film), its state (a render stale by
// the film's sound alone says so; a missing one names the command that
// renders it) and its approval; "Approve all current" (in the film's inspector)
// approves the current scenes; a scene is approved, unapproved from its
// inspector, and commented
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
import { pageHref } from '../../../../src/core/api.ts';
import type { Tab } from '../../../../src/lab/fixtures/tab.ts';
import { FreshProcessFailed, VerbRefused } from '../../../../src/core/refusals.ts';
import { sceneAddress } from '../../../../src/core/address.ts';
import {
  closeCommandMenu,
  menuEntry,
  openCommandMenu,
  rightClick,
} from '../../../../src/lab/fixtures/gestures.ts';
import { Render } from '../../../../src/core/catalogue.ts';
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

/** Scene `id`'s main render as the catalogue records it, encoded. */
const renderJson = (id: string): Json =>
  Schema.encodeSync(Schema.toCodecJson(Render))({
    address: sceneAddress(id),
    variant: 'main',
    kind: 'video',
    settings: { scale: 1, captions: false },
    stamp: { commit: Option.none(), key: 'k' },
    span: Option.none(),
    files: {
      clip: Option.some(`scenes/${id}/main.mp4`),
      share: Option.none(),
      captions: Option.none(),
      chapters: Option.none(),
      images: [],
    },
    sound: Option.none(),
    at: 0,
  });

/** A scene as the project encodes it; `rendered`, with its catalogue render. */
const sceneJson = (s: ToyScene, rendered = false): Json => ({
  scene: s.scene,
  key: 'k',
  state: s.state,
  ...Option.match(Option.fromUndefinedOr(s.staleBy), {
    onNone: () => ({}),
    onSome: (by) => ({ staleBy: by }),
  }),
  ...Option.match(
    Option.liftPredicate(s.scene, () => rendered),
    {
      onNone: () => ({}),
      onSome: (id) => ({ render: renderJson(id) }),
    },
  ),
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
 * stale by its sources. The scenes in `rendered` carry their catalogue
 * render, so their rows link the scene's Versions.
 */
const fakeProject = (
  elsewhere = false,
  goneStale: ReadonlyArray<string> = [],
  rendered: ReadonlyArray<string> = [],
) => {
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
      scenes: scenes.map((s) => sceneJson(s, rendered.includes(s.scene))),
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
      json({ undo: { file: 'sound.ts', target: 'score play brass', change: 'k-brass' } }),
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

const PROJECT = pageHref.project('toy');

const click = (page: Tab, selector: string) => page.click(selector);

const scene = (id: string) => `[data-scene="${id}"]`;

/** A scene's render card. */
const render = (id: string) => `${scene(id)} > .sc-card[data-size="tile"]`;

/** The open inspector: one at a time. */
const INSPECTOR = '[data-role="inspector"]';
/** The film's choices' fold, closed at rest (UR-65): open it to reach a card. */
const FILM_CHOICES = '.rv-film > .rv-layers > summary';

/** Where the film's and the act's names sit (their inspect button), above their cards. */
const FILM_HEAD = '.rv-film > .rv-row';
const ACT_HEAD = '[data-act-name="opening"] > .rv-h';

/** Open the inspector of the thing at `at` by a tap on its name. */
const inspect = (page: Tab, at: string) =>
  Effect.andThen(click(page, `${at} [data-act="inspect"]`), waitFor(page, INSPECTOR));

/** The says posted to the project, in order. */
const saysPosted = (
  asked: ReadonlyArray<{ readonly path: string; readonly body: Option.Option<Json> }>,
) =>
  asked
    .filter((a) => a.path === '/api/films/toy/project/say')
    .map((a) => Option.getOrUndefined(a.body));

/** Where the page bar's tab of `part` lands on the film `toy`. */
const TABS = [
  ['scenes', pageHref.scenes('toy')],
  ['lab', pageHref.lab('toy')],
  ['choices', pageHref.choices('toy')],
  ['project', pageHref.project('toy')],
  ['play', pageHref.play('toy')],
] as const;

describe("a film's project", () => {
  it.live(
    "sits in the studio's shell: the page bar in the header on a laptop, a tab bar along the bottom on a phone; ⇧-number keys move between parts",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(), {
          href: PROJECT,
          viewport: { width: 1440, height: 900 },
        });
        yield* waitFor(page, '[data-act-name="opening"]');
        // Every part of the film is a tab, each at its place; Project is the one shown.
        yield* attributesAre(
          page,
          '.sh-pagebar .sh-tab',
          'data-page',
          TABS.map(([part]) => part),
        );
        yield* attributesAre(
          page,
          '.sh-pagebar .sh-tab',
          'href',
          TABS.map(([, href]) => href),
        );
        yield* attributesAre(page, '.sh-tab[data-active="true"]', 'data-page', ['project']);
        yield* textIs(page, '.sh-switcher > span', 'toy');
        // On the laptop the page bar sits in the header, Films its first tab, by name.
        const header = yield* page.box('.sh-header');
        const bar = yield* page.box('.sh-pagebar');
        expect(bar.y).toBeGreaterThanOrEqual(header.y);
        expect(bar.y + bar.height).toBeLessThanOrEqual(header.y + header.height + 1);
        yield* textIs(page, '.sh-films > span', 'Films');
        yield* attributeIs(page, '.sh-films', 'href', pageHref.home());
        // No text link between parts is left in the page.
        yield* countIs(page, `.sh-body a[href="${pageHref.lab('toy')}"]`, 0);
        // On a phone the five tabs are a bar along the bottom, 56 px tall; Films the header's square.
        yield* page.resize(390, 844);
        yield* until(
          page,
          "Math.round(document.querySelector('.sh-pagebar').getBoundingClientRect().bottom) === innerHeight",
        );
        yield* evaluates(
          page,
          "((r) => [r.x, r.width, r.height])(document.querySelector('.sh-pagebar').getBoundingClientRect()).join() === [0, document.documentElement.clientWidth, 56].join()",
          true,
        );
        const square = yield* page.box('.sh-films');
        expect(square.y + square.height).toBeLessThanOrEqual(header.y + 44 + 1);
        yield* evaluates(page, 'document.documentElement.scrollWidth <= innerWidth', true);
        // A tab of another of the review's places moves there in the page; ⇧5 comes back to Project.
        yield* page.click('.sh-pagebar [data-page="choices"]');
        yield* until(page, `location.pathname === '${pageHref.choices('toy').split('?')[0]}'`);
        yield* attributesAre(page, '.sh-tab[data-active="true"]', 'data-page', ['choices']);
        yield* page.press('Shift+5');
        yield* until(page, `location.pathname === '${PROJECT.split('?')[0]}'`);
        yield* attributesAre(page, '.sh-tab[data-active="true"]', 'data-page', ['project']);
        // ⇧1 goes to Films, where the tabs still lead into the film last opened.
        yield* page.press('Shift+1');
        yield* until(page, "location.pathname === '/'");
        yield* attributeIs(page, '.sh-films', 'data-active', 'true');
        yield* textIs(page, '.sh-switcher > span', 'toy');
        yield* attributeIs(page, '.sh-pagebar [data-page="lab"]', 'href', pageHref.lab('toy'));
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'lists the act and its scenes with their renders, states and approvals; each choice once, where it belongs',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject());
        // A film card opens its project from its context menu.
        yield* rightClick(page, '.rv-film-card[data-film="toy"]');
        yield* click(page, '[data-role="context-menu"] [data-command="film.project"]');
        yield* until(page, `location.pathname === '${PROJECT}'`);
        yield* waitFor(page, '[data-act-name="opening"]');
        // The act holds its scenes; the scenes in no act follow.
        yield* attributesAre(page, '[data-act-name="opening"] .rv-scene', 'data-scene', [
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
        // A render stale by the film's sound alone says so, beside its approval
        // of an earlier version: each a chip, why in full its title.
        yield* textIs(page, `${render('close')} .sc-chip[data-mark="stale"]`, 'Out of date');
        yield* attributeIs(
          page,
          `${render('close')} .sc-chip[data-mark="stale"]`,
          'title',
          "out of date: the film's sound changed since it was made",
        );
        yield* attributeIs(
          page,
          `${render('close')} .sc-chip[data-mark="approved-earlier"]`,
          'title',
          'needs review: an earlier version was approved',
        );
        // The card is the Scenes' card: the scene's name, its hue, its marks.
        yield* textIs(page, `${render('open')} .sc-card-name`, 'open');
        yield* countIs(page, `${render('open')} .sc-hue`, 1);
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
        yield* attached(page, '.rv-film [data-point="score"]');
        // The film's choices fold away at rest (UR-65).
        yield* evaluates(page, "document.querySelector('.rv-film > .rv-layers').open", false);
        yield* attached(
          page,
          '[data-act-name="opening"] > .rv-layers [data-point="take:paper.hum"]',
        );
        yield* attached(page, '.rv-film [data-point="take:room.tone"]');
        // The take with its scene, the voice with its beat.
        yield* attached(page, `${scene('open')} [data-point="take:paper.page"]`);
        yield* attached(page, `${scene('close')} [data-point="voice:close"]`);
        // Each card once: a scene's inspector links the choices that play in it, its own
        // and the layers that sit elsewhere; none of the links is at rest.
        yield* countIs(page, '.rv-option:not([data-kind="render"])', 5);
        yield* countIs(page, `${scene('close')} [data-plays]`, 0);
        yield* inspect(page, render('close'));
        yield* attributesAre(page, `${INSPECTOR} [data-plays]`, 'data-plays', [
          'voice:close',
          'take:paper.hum',
          'take:room.tone',
        ]);
        // A link opens the part its card is folded under.
        yield* inspect(page, render('open'));
        yield* click(page, `${INSPECTOR} [data-plays="take:paper.hum"]`);
        const hum = '[data-act-name="opening"] > .rv-layers[open] [data-point="take:paper.hum"]';
        yield* waitFor(page, hum);
        // The card in focus is in the link, a step Back undoes.
        yield* until(page, "location.search === '?point=take%3Apaper.hum'");
        yield* page.back;
        yield* until(page, `location.pathname + location.search === '${PROJECT}'`);
        // A pasted link opens the card where it sits, as an old anchor does.
        yield* page.goto(pageHref.project('toy', 'take:paper.hum'));
        yield* waitFor(page, hum);
        yield* page.goto(`${PROJECT}#point-take%3Apaper.hum`);
        yield* until(page, "location.search === '?point=take%3Apaper.hum'");
        yield* waitFor(page, hum);
        // Its Open on Choices lands on the Choices tab at the card (UR-65), brought into view on
        // a phone, where the card starts well below the fold.
        yield* page.resize(390, 600);
        yield* inspect(page, render('open'));
        yield* click(page, `${INSPECTOR} [data-act="on-choices"][data-point="take:paper.hum"]`);
        yield* until(
          page,
          `location.pathname + location.search === '${pageHref.choices('toy', 'take:paper.hum')}'`,
        );
        yield* evaluates(
          page,
          `(() => {
            const card = document.getElementById('point-take:paper.hum');
            if (card === null) return false;
            const r = card.getBoundingClientRect();
            return r.top < innerHeight && r.bottom > 0;
          })()`,
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'approves all current, one scene, an act; withdraws a scene, an act and the film; comments on a scene, a missing one, an act and the film',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeProject(), { href: PROJECT });
        yield* waitFor(page, `${render('open')} [data-act="approve"][data-approval="none"]`);
        // One scene approved as it is rendered, and its approval withdrawn.
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* waitFor(page, `${render('coda')} .sc-chip[data-mark="approved"]`);
        yield* waitFor(page, `${render('open')} [data-act="approve"][data-approval="none"]`);
        // Unapprove is in the scene's inspector, not at rest.
        yield* countIs(page, `${render('coda')} [data-act="unapprove"]`, 0);
        yield* inspect(page, render('coda'));
        yield* click(page, `${INSPECTOR} [data-act="unapprove"]`);
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        // The film's and the act's approvals are in their inspectors, not at rest.
        yield* countIs(page, '[data-act="approve-all"]', 0);
        yield* inspect(page, FILM_HEAD);
        yield* click(page, `${INSPECTOR} [data-act="approve-all"]`);
        yield* waitFor(page, `${render('open')} .sc-chip[data-mark="approved"]`);
        yield* waitFor(page, `${render('coda')} .sc-chip[data-mark="approved"]`);
        // The stale scene is left for a render.
        yield* waitFor(page, `${render('close')} .sc-chip[data-mark="approved-earlier"]`);
        // Nothing current is left to approve, in the film or the act: no say would change a thing.
        yield* until(
          page,
          `document.querySelector('${INSPECTOR} [data-act="approve-all"]').disabled === true`,
        );
        yield* inspect(page, ACT_HEAD);
        yield* until(
          page,
          `document.querySelector('${INSPECTOR} [data-act="approve-act"]').disabled === true`,
        );

        yield* inspect(page, render('open'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'the hand jumps');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        // A scene not rendered yet is commented on too.
        yield* inspect(page, render('end'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'render it warm');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);

        // An act's approvals withdrawn in one say (the stale one too), its current scenes
        // approved again in one, then the film's withdrawn.
        yield* inspect(page, ACT_HEAD);
        yield* click(page, `${INSPECTOR} [data-act="unapprove-act"]`);
        yield* waitFor(page, `${render('open')} [data-act="approve"][data-approval="none"]`);
        yield* waitFor(page, `${render('close')} [data-act="approve"][data-approval="none"]`);
        yield* waitFor(page, `${render('coda')} .sc-chip[data-mark="approved"]`);
        yield* countIs(page, `${INSPECTOR} [data-act="unapprove-act"]`, 0);
        yield* click(page, `${INSPECTOR} [data-act="approve-act"]`);
        yield* waitFor(page, `${render('open')} .sc-chip[data-mark="approved"]`);
        yield* until(
          page,
          `document.querySelector('${INSPECTOR} [data-act="approve-act"]').disabled === true`,
        );
        yield* inspect(page, FILM_HEAD);
        yield* click(page, `${INSPECTOR} [data-act="unapprove-all"]`);
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* countIs(page, `${INSPECTOR} [data-act="unapprove-all"]`, 0);

        yield* inspect(page, ACT_HEAD);
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'the act drags');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        yield* textIs(page, `${ACT_HEAD} .lab-count`, '1');

        yield* inspect(page, FILM_HEAD);
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'a whole film note');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        yield* textIs(page, `${FILM_HEAD} .lab-count`, '1');
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
        const { page, errors } = yield* openReview(fakeProject(), { href: PROJECT });
        yield* waitFor(page, `${scene('open')} video`);
        yield* inspect(page, render('open'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'half a thought');
        yield* page.evaluate(`window.clip = document.querySelector('${scene('open')} video')`);
        // The inspector sits beside the page: the page under it stays live.
        yield* click(page, `${scene('coda')} [data-act="approve"]`);
        yield* waitFor(page, `${scene('coda')} .sc-chip[data-mark="approved"]`);
        yield* valueIs(page, `${INSPECTOR} .rv-comment-input`, 'half a thought');
        // Closed and opened again, it keeps the half-typed comment.
        yield* page.press('Escape');
        yield* countIs(page, INSPECTOR, 0);
        yield* inspect(page, render('open'));
        yield* valueIs(page, `${INSPECTOR} .rv-comment-input`, 'half a thought');
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
    "a scene's Versions link leaves a modified click to the browser (a new tab); a plain one goes there in place",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(false, [], ['open']), {
          href: PROJECT,
        });
        // Versions is in the scene's inspector, with Open in Lab.
        yield* inspect(page, render('open'));
        const versions = `${INSPECTOR} [data-compare]`;
        yield* waitFor(page, versions);
        yield* attributeIs(
          page,
          `${INSPECTOR} [data-act="open-lab"]`,
          'href',
          '/films/toy/lab/open',
        );
        // The page's own handler runs at the document; a listener on the
        // window hears each click after it, notes whether it was taken, and
        // keeps the test's page where it is.
        yield* page.evaluate(`(() => {
          const link = document.querySelector('${versions}');
          window.taken = [];
          const note = (e) => { window.taken.push(e.defaultPrevented); e.preventDefault(); };
          window.addEventListener('click', note);
          for (const mod of ['metaKey', 'ctrlKey', 'shiftKey'])
            link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, [mod]: true }));
          window.removeEventListener('click', note);
        })()`);
        yield* evaluates(page, 'window.taken', [false, false, false]);
        yield* click(page, versions);
        yield* until(page, "location.pathname.startsWith('/sets/')");
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
          { href: PROJECT },
        );
        const box = `${INSPECTOR} .rv-comment-input`;
        /** Say `text` in the inspector of `at`, posted as the `n`th say to `path`; wait for its receipt in `slot` to refuse it. */
        const failedSay = (at: string, text: string, path: string, n: number, slot: string) =>
          Effect.gen(function* () {
            yield* inspect(page, at);
            yield* page.fill(box, text);
            yield* click(page, `${INSPECTOR} [data-act="comment"]`);
            yield* Effect.sync(() => asked.filter((a) => a.path === path).length).pipe(
              Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (m) => m >= n }),
              Effect.timeout('10 seconds'),
            );
            // Its receipt, in its page's slot, says why it was refused.
            yield* attributeIs(page, `[data-receipt="${slot}"]`, 'data-type', 'refused');
          });
        const PROJECT_SAY = '/api/films/toy/project/say';
        const take = `${scene('open')} [data-point="take:paper.page"]`;
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        // A scene's comment, the film's, and a take's: each fails, and each keeps its text.
        yield* failedSay(render('open'), 'a long thoughtful note', PROJECT_SAY, 1, 'project');
        yield* valueIs(page, box, 'a long thoughtful note');
        yield* failedSay(FILM_HEAD, 'of the whole film', PROJECT_SAY, 2, 'project');
        yield* valueIs(page, box, 'of the whole film');
        yield* click(page, `${scene('open')} > .rv-layers > summary`);
        yield* failedSay(take, 'the page is late', '/api/films/toy/choices/say', 1, 'film');
        yield* valueIs(page, box, 'the page is late');
        // The film loads again: the kept comment, back in its box, is said, and its box empties.
        loads = true;
        yield* inspect(page, render('open'));
        yield* valueIs(page, box, 'a long thoughtful note');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        yield* valueIs(page, box, '');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an approve refused because the scene went stale reads the project again: the card says why',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(false, ['coda']), {
          href: PROJECT,
        });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* attributeIs(page, '[data-receipt="project"]', 'data-type', 'refused');
        yield* waitFor(page, `${scene('coda')}[data-state="stale"]`);
        yield* attributeIs(
          page,
          `${render('coda')} .sc-chip[data-mark="stale"]`,
          'title',
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
        const { page, errors } = yield* openReview(fakeProject(true), { href: PROJECT });
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
          href: PROJECT,
        });
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        yield* click(page, FILM_CHOICES);
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
        yield* inspect(page, render('open'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'said while it read');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        // The older read lands last: the page has read it, and the comment stays.
        yield* Deferred.done(land, Exit.void);
        yield* attributeIs(page, '.rv-film', 'data-reading', 'false');
        yield* countIs(page, `${INSPECTOR} [data-comment="c1"]`, 1);
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
          href: PROJECT,
        });
        const reads = () =>
          asked.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/project').length;
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        yield* inspect(page, render('open'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'said before the pick');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* Effect.sync(() => saysPosted(asked).length).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 1 }),
          Effect.timeout('10 seconds'),
        );
        // A pick while the say is out: its read answers first, without the comment.
        yield* click(page, FILM_CHOICES);
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
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
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
          href: PROJECT,
        });
        const box = `${INSPECTOR} .rv-comment-input`;
        const comment = `${INSPECTOR} [data-act="comment"]`;
        yield* inspect(page, FILM_HEAD);
        yield* page.fill(box, 'of the whole film');
        yield* click(page, comment);
        yield* Effect.sync(() => saysPosted(asked).length).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 1 }),
          Effect.timeout('10 seconds'),
        );
        // The film's box waits on its own say; the act's is free.
        yield* evaluates(page, `document.querySelector('${comment}').disabled`, true);
        yield* inspect(page, ACT_HEAD);
        yield* page.fill(box, 'of the opening');
        yield* click(page, comment);
        yield* countIs(page, `${INSPECTOR} .rv-comments li`, 1);
        yield* valueIs(page, box, '');
        // The act's answer is not the film's: its box keeps the text until its own lands.
        yield* inspect(page, FILM_HEAD);
        yield* valueIs(page, box, 'of the whole film');
        yield* Deferred.done(land, Exit.void);
        yield* valueIs(page, box, '');
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
        const { page, asked, errors } = yield* openReview(fakeProject(), { href: PROJECT });
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
        yield* inspect(page, take);
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'the page is late');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        yield* click(page, FILM_CHOICES);
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
        // The menu's Undo names what it undoes.
        yield* openCommandMenu(page, 'undo');
        yield* textIs(page, menuEntry('review.undo'), /^Undo score play brass/);
        yield* closeCommandMenu(page);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
