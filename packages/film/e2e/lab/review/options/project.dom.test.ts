// A film's project in a browser, its routes faked over a synthetic film of
// one act (open, close) and two scenes in no act (coda, end), the film's own
// code the toy film's (`fixtures/toy-film.ts`), as design language §7 lays
// it out: the film's panel (its name, its state band of a segment a scene,
// `n/N approved · n out of date` and the check's findings), each act a panel
// (its name, scenes, length and approvals) holding its scenes (a row each on
// a phone, one row of cards on a laptop, as a DAW's sections), each scene's
// card a still of the scene drawn from the film's code, its length, its name
// in its hue, its marks and, on a laptop, its Approve; the transport docked
// over the tab bar on a phone. A tap on a scene opens its sheet (its render,
// its Approve, what was said and the comment box, Info, Versions, Open in
// Lab and the choices that play in it, each opening on Choices); a long
// press on an act's header offers its approvals, whose receipt offers Undo.
// Home links the project; a scene is approved, unapproved and commented on
// (a missing one too); an act's and the film's current scenes are approved
// and withdrawn, and they are commented on. The page updates in place (a
// half-typed comment and the clip survive a say elsewhere) and shows what a
// say answered without reading it twice; a read that lands after a say
// asked later leaves the say shown, and an approve refused because its scene
// went stale reads it again. Every wait is on the page, or on what it asked,
// never a fixed time.

import { Array as Arr, Deferred, Effect, Exit, Match, Option, Schedule, Schema } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { pageHref } from '../../../../src/core/api.ts';
import type { Tab } from '../../../../src/lab/fixtures/tab.ts';
import { FreshProcessFailed, VerbRefused } from '../../../../src/core/refusals.ts';
import { sceneAddress } from '../../../../src/core/address.ts';
import {
  closeCommandMenu,
  menuEntry,
  openCommandMenu,
  rightClick,
  touch,
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
  textHas,
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
  /**
   * Its approvals as the catalogue keeps them: the moment each was given, the
   * approve run that gave it (none, before runs had ops), and whether of an
   * earlier version.
   */
  approvals: ReadonlyArray<{
    readonly at: number;
    readonly op?: string;
    readonly earlier: boolean;
  }>;
  said: ReadonlyArray<string>;
  /** Where it sits in the film, in seconds. */
  readonly span: { readonly start: number; readonly dur: number };
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

/** A scene's approval state, as the catalogue reads its approvals. */
const approvalOf = (s: ToyScene): 'none' | 'approved' | 'stale' =>
  Match.value(s.approvals).pipe(
    Match.when(
      (as) => as.some((a) => !a.earlier),
      () => 'approved' as const,
    ),
    Match.when(
      (as) => as.length > 0,
      () => 'stale' as const,
    ),
    Match.orElse(() => 'none' as const),
  );

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
  approval: approvalOf(s),
  span: s.span,
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

/** The film's render, as the choices list the pictures the sound plays over. */
const CUT: Json = {
  ref: 'out/toy/film/main.share.mp4',
  name: 'main.share.mp4',
  size: 4096,
  mtime: 0,
  phone: 'none',
};

/** The film's choices; `cut`, with the film's render under them. */
const choicesOf = (cut: boolean): Json => ({
  film: 'toy',
  pictures: Arr.filter([CUT], () => cut),
  points: [
    pointJson('score', 'score', FILM_AT, [
      heardVariant('strings', true),
      heardVariant('brass', false, ['pick']),
    ]),
    pointJson('take:paper.page', 'take', { _tag: 'Scenes', ids: ['open'] }, [
      heardVariant('a'.repeat(64), true),
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
  readonly say: { readonly _tag: string; readonly text?: string; readonly given?: string };
}

const PostedSay = Schema.decodeUnknownSync(
  Schema.Struct({
    address: Schema.Struct({
      _tag: Schema.String,
      ids: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
    say: Schema.Struct({
      _tag: Schema.String,
      text: Schema.optionalKey(Schema.String),
      given: Schema.optionalKey(Schema.String),
    }),
  }),
);

/**
 * Another at the catalogue: a reviewer's approve and withdraw of scenes, as
 * the CLI makes them, and a terminal's render of scenes again (each approval
 * then of an earlier version: stale).
 */
interface Other {
  readonly approve: (ids: ReadonlyArray<string>) => void;
  readonly withdraw: (ids: ReadonlyArray<string>) => void;
  readonly render: (ids: ReadonlyArray<string>) => void;
}

/** The check's one error, about scene close. */
const CLOSE_FINDING: Json = {
  level: 'error',
  tag: 'DurOnWord',
  message: 'cue grow runs past its word',
  address: { part: { _tag: 'Scenes', ids: ['close'] }, time: 5 },
};

/** The film's last source write, a score's pick: what Undo steps back. */
const LAST_WRITE: Json = { file: 'sound.ts', target: 'score play brass', change: 'k-brass' };

/** How the fake project is set up. */
interface Fake {
  /** Another checkout's folder of the film in the review's index, rendered since. */
  readonly elsewhere?: boolean;
  /** Scenes drawn again since the page read them: an approve naming one is refused. */
  readonly goneStale?: ReadonlyArray<string>;
  /** Scenes carrying their catalogue render: their sheets link their Versions. */
  readonly rendered?: ReadonlyArray<string>;
  /** What the film's check finds. */
  readonly findings?: ReadonlyArray<Json>;
  /** Whether the film's render is under the review's roots: the transport then plays it. */
  readonly cut?: boolean;
  /** Scenes an earlier version of which was approved. */
  readonly approvedEarlier?: ReadonlyArray<string>;
  /** What another reviewer does at the catalogue just before the page's say `p` lands. */
  readonly before?: (p: PostedSay, other: Other) => void;
  /** What another does just after the page's say `p` lands, before its answer reads the catalogue. */
  readonly after?: (p: PostedSay, other: Other) => void;
}

/**
 * The fake project: the scenes as they stand (open 4 s, close 6 s, coda 3 s,
 * end 2 s), and what was said of the film and the act. Undo steps back the
 * film's last source write (a score's pick), as the lab's history has it.
 */
const fakeProject = (fake: Fake = {}) => {
  const goneStale = fake.goneStale ?? [];
  const rendered = fake.rendered ?? [];
  const EARLIER = [{ at: 1, earlier: true }];
  const scenes: ReadonlyArray<ToyScene> = [
    { scene: 'open', state: 'current', approvals: [], said: [], span: { start: 0, dur: 4 } },
    {
      scene: 'close',
      state: 'stale',
      staleBy: 'sound',
      approvals: EARLIER,
      said: [],
      span: { start: 4, dur: 6 },
    },
    { scene: 'coda', state: 'current', approvals: [], said: [], span: { start: 10, dur: 3 } },
    { scene: 'end', state: 'missing', approvals: [], said: [], span: { start: 13, dur: 2 } },
  ];
  scenes
    .filter((s) => (fake.approvedEarlier ?? []).includes(s.scene))
    .forEach((s) => {
      s.approvals = EARLIER;
    });
  // Each approve run's op, as the CLI makes one a run; every run stamped at one moment, as two
  // runs queued on the catalogue's lock can be: the op, not the moment, names an approve's own.
  let runs = 0;
  const AT = 100;
  const text: Said = { film: [], act: [] };
  const view = (
    gave: Option.Option<Json> = Option.none(),
    took: Option.Option<Json> = Option.none(),
  ): Json => ({
    project: {
      film: 'toy',
      variant: 'main',
      key: 'fk',
      ...Option.match(gave, { onNone: () => ({}), onSome: (g) => ({ gave: g }) }),
      ...Option.match(took, { onNone: () => ({}), onSome: (t) => ({ took: t }) }),
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
  /** The current scenes of `ids` approved by a run of its own: its op, and the scenes it made approved. */
  const approveCurrent = (ids: ReadonlyArray<string>) => {
    runs += 1;
    const op = `op-${runs}`;
    const made = scenes.filter(
      (s) => ids.includes(s.scene) && s.state === 'current' && approvalOf(s) !== 'approved',
    );
    made.forEach((s) => {
      s.approvals = [...s.approvals, { at: AT, op, earlier: false }];
    });
    return { op, made: made.map((s) => s.scene) };
  };
  /** The approvals of `ids` withdrawn: every one, or only those the run `given` gave; the scenes it took one from. */
  const withdraw = (ids: ReadonlyArray<string>, given: Option.Option<string>) =>
    scenes
      .filter((s) => ids.includes(s.scene))
      .flatMap((s) => {
        const before = s.approvals.length;
        s.approvals = s.approvals.filter((a) =>
          Option.match(given, { onNone: () => false, onSome: (op) => a.op !== op }),
        );
        return Arr.filter([s.scene], () => s.approvals.length < before);
      });
  const other: Other = {
    approve: (ids) => void approveCurrent(ids),
    withdraw: (ids) => void withdraw(ids, Option.none()),
    render: (ids) =>
      scenes
        .filter((s) => ids.includes(s.scene))
        .forEach((s) => {
          s.approvals = s.approvals.map((a) => ({ ...a, earlier: true }));
        }),
  };
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
          ...Arr.filter([ELSEWHERE], () => fake.elsewhere === true),
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
    route('GET', /^\/api\/review\/duration/, () => json({ seconds: 15 })),
    route('GET', /^\/api\/films$/, () => json({ films: ['toy'] })),
    route('GET', /^\/api\/films\/toy\/choices$/, () => json(choicesOf(fake.cut === true))),
    // The film's last source write, as its check and its steps report it: Undo steps it back.
    route('GET', /^\/api\/films\/toy\/check$/, () =>
      json({ findings: fake.findings ?? [], undo: LAST_WRITE }),
    ),
    route('GET', /^\/api\/films\/toy\/steps$/, () => json({ undo: LAST_WRITE })),
    route('GET', /^\/api\/films\/toy\/choices\/check$/, () => json({ findings: [] })),
    route('POST', /^\/api\/films\/toy\/undo$/, () =>
      json({ file: 'sound.ts', target: 'undo score play brass', change: 'k-brass', findings: [] }),
    ),
    route('GET', /^\/api\/films\/toy\/project$/, () => json(view())),
    route('POST', /^\/api\/films\/toy\/project\/say$/, (asked) => {
      const p = posted(asked);
      fake.before?.(p, other);
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
      // An approve answers what it gave: its op, the moment, and the scenes it made approved
      // (none: no gave).
      if (p.say._tag === 'Approve') {
        const { op, made } = approveCurrent(ids);
        fake.after?.(p, other);
        return json(
          view(
            Option.map(
              Option.liftPredicate(made, (m) => m.length > 0),
              (m) => ({ op, at: AT, scenes: m }),
            ),
          ),
        );
      }
      // An undo (a withdraw given an op) answers what it took: the scenes it took one from.
      if (p.say._tag === 'Withdraw') {
        const given = Option.fromUndefinedOr(p.say.given);
        const took = withdraw(ids, given);
        return json(
          view(
            Option.none(),
            Option.map(given, (op) => ({ op, scenes: took })),
          ),
        );
      }
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

const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const click = (page: Tab, selector: string) => page.click(selector);

const scene = (id: string) => `.rv-scene[data-scene="${id}"]`;

/** A scene's render card. */
const render = (id: string) => `${scene(id)} > .sc-card[data-size="tile"]`;

/** The open inspector (a sheet on a phone): one at a time. */
const INSPECTOR = '[data-role="inspector"]';

/** The film's panel, and the head of it and of the act, where their names sit (their inspect button). */
const FILM = '.pj-film';
const FILM_HEAD = '.pj-film-head';
const ACT = '[data-act-name="opening"]';
const ACT_HEAD = `${ACT} .pj-act-head`;

/** The transport's dock. */
const DOCK = '.pj-dock';

/** The project's receipt. */
const RECEIPT = '[data-receipt="project"]';

/** Wait until the project's receipt reads something containing `part`. */
const receiptSays = (page: Tab, part: string) =>
  textHas(page, `${RECEIPT} .lab-receipt-said`, part);

/** Wait until the project's receipt reads something containing `part` and offers an Undo or not, both in one read. */
const receiptIs = (page: Tab, part: string, undo: boolean) =>
  evaluates(
    page,
    `[Array.from(document.querySelectorAll('${RECEIPT} .lab-receipt-said')).some((e) => e.textContent.includes('${part}')), document.querySelectorAll('${RECEIPT} [data-act="receipt-undo"]').length > 0]`,
    [true, undo],
  );

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

/** `selector`'s box, as a script reads it. */
const rect = (selector: string) => `document.querySelector('${selector}').getBoundingClientRect()`;

/** Whether `selector` spans the page's width with its bottom on `below`'s top, as a script reads it. */
const standsOn = (selector: string, below: string) =>
  `((r, b) => Math.round(r.left) === 0 && Math.round(r.right) === document.documentElement.clientWidth && Math.round(r.bottom) === Math.round(b.top))(${rect(selector)}, ${rect(below)})`;

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
          viewport: LAPTOP,
        });
        yield* waitFor(page, ACT);
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
    "the film's folder of renders and each set in it sit under its Project: its tab is the one lit",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(), {
          href: pageHref.folder('out/toy'),
          viewport: LAPTOP,
        });
        yield* waitFor(page, '.rv-main a[href^="/sets/"]');
        yield* attributesAre(page, '.sh-tab[data-active="true"]', 'data-page', ['project']);
        yield* attributeIs(page, '.sh-films', 'data-active', 'false');
        yield* page.click('.rv-main a[href^="/sets/"]');
        yield* until(page, "location.pathname.startsWith('/sets/')");
        yield* attributesAre(page, '.sh-tab[data-active="true"]', 'data-page', ['project']);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "the film's panel: its state band (a segment a scene, in film order, as long as the scene) and n/N approved · n out of date · n not rendered · its findings; no counts line, write bar or choices folds",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject({ findings: [CLOSE_FINDING] }), {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(page, `${FILM} .pj-band [data-scene]`);
        yield* textIs(page, `${FILM_HEAD} [data-act="inspect"]`, 'toy');
        yield* textIs(
          page,
          `${FILM} [data-role="counts"]`,
          '0/4 approved · 1 out of date · 1 not rendered',
        );
        // The check's findings are a count there that opens the Findings sheet.
        yield* textIs(page, `${FILM} [data-act="findings"][data-check="check"]`, '1 finding');
        yield* click(page, `${FILM} [data-act="findings"][data-check="check"]`);
        yield* waitFor(page, '[data-role="findings"]');
        yield* page.press('Escape');
        // One segment a scene, in film order, each as wide as its scene is long (4, 6, 3, 2 of 15 s),
        // in its most pressing state's colour.
        yield* attributesAre(page, `${FILM} .pj-band [data-scene]`, 'data-scene', [
          'open',
          'close',
          'coda',
          'end',
        ]);
        yield* attributesAre(page, `${FILM} .pj-band [data-scene]`, 'data-state', [
          'none',
          'stale',
          'none',
          'rendered',
        ]);
        yield* evaluates(
          page,
          `(() => {
            const band = document.querySelector('${FILM} .pj-band').getBoundingClientRect().width;
            return [...document.querySelectorAll('${FILM} .pj-band [data-scene]')]
              .map((s) => Math.round((s.getBoundingClientRect().width / band) * 15));
          })()`,
          [4, 6, 3, 2],
        );
        // Gone from rest: the counts line, the write bar, the film's, act's and scenes' choices folds,
        // and every scene's own player.
        yield* countIs(page, '[data-counts]', 0);
        yield* countIs(page, '.rv-writes', 0);
        yield* countIs(page, '.rv-layers', 0);
        yield* countIs(page, '.rv-scene video', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "the film's check reads as checking until it answers, and a check that fails says so: never clean before the check has found nothing",
    () =>
      Effect.gen(function* () {
        const chip = `${FILM} [data-act="findings"][data-check="check"]`;
        const land = yield* Deferred.make<void>();
        const held = route('GET', /^\/api\/films\/toy\/check$/, () =>
          later(land, json({ findings: [CLOSE_FINDING], undo: LAST_WRITE })),
        );
        const { page, errors } = yield* openReview([held, ...fakeProject()], {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(page, `${FILM} .pj-band [data-scene]`);
        yield* textIs(page, chip, 'checking…');
        yield* attributeIs(page, chip, 'data-state', 'checking');
        // The sheet's group counts nothing while it checks: only an answer has a count.
        const group = '[data-role="findings"] [data-check="check"] h3 .lab-count';
        yield* click(page, chip);
        yield* waitFor(page, '[data-role="findings"] [data-state="checking"]');
        yield* countIs(page, group, 0);
        yield* Deferred.done(land, Exit.void);
        yield* textIs(page, chip, '1 finding');
        yield* textIs(page, group, '1');

        const failing = route('GET', /^\/api\/films\/toy\/check$/, () =>
          refused(FreshProcessFailed.make({ command: 'film check', reason: 'exit 1' })),
        );
        const failed = yield* openReview([failing, ...fakeProject()], {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(failed.page, `${FILM} .pj-band [data-scene]`);
        yield* textIs(failed.page, chip, 'check failed');
        yield* attributeIs(failed.page, chip, 'data-state', 'failed');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'on a laptop each act is a panel (its name · scenes · length · approved) holding its scene cards in one row, the acts one under another',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(), {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(page, render('close'));
        yield* textIs(page, `${ACT_HEAD} [data-act="inspect"]`, 'opening');
        yield* textIs(page, `${ACT_HEAD} .pj-act-meta`, '2 scenes · 00:00:10:00 · 0/2 approved');
        yield* attributesAre(page, `${ACT} .rv-scene`, 'data-scene', ['open', 'close']);
        // The act's cards side by side, in film order, on one line.
        yield* evaluates(
          page,
          `(() => {
            const [a, b] = ['open', 'close'].map((id) => document.querySelector('${scene('{id}')} > .sc-card'.replace('{id}', id)).getBoundingClientRect());
            return [Math.round(a.top) === Math.round(b.top), a.right <= b.left];
          })()`,
          [true, true],
        );
        // The scenes in no act follow, under the act's panel.
        const act = yield* page.box(ACT);
        const coda = yield* page.box(render('coda'));
        expect(coda.y).toBeGreaterThanOrEqual(act.y + act.height);
        // A card's Approve is on the card, its words on one line (close's earlier version was
        // approved: Approve again); a stale one waits on a render, and says so when asked (its
        // title, and its name to a screen reader), its card's out-of-date mark beside it.
        const cardApprove = `${render('close')} [data-act="approve"]`;
        yield* textIs(page, cardApprove, 'Approve again');
        yield* attributeIs(page, cardApprove, 'title', 'Approve · render first');
        yield* attributeIs(page, cardApprove, 'aria-label', 'Approve · render first');
        yield* evaluates(
          page,
          `(() => {
            const el = document.querySelector('${cardApprove}');
            const range = document.createRange();
            range.selectNodeContents(el);
            return [el.disabled, range.getClientRects().length];
          })()`,
          [true, 1],
        );
        // Its sheet has the room to say it in full.
        yield* inspect(page, render('close'));
        yield* textIs(page, `${INSPECTOR} [data-act="approve"]`, 'Approve · render first');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a phone each scene is a row, its picture beside its name and marks, its Approve in the scene's sheet",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(), {
          href: PROJECT,
          viewport: PHONE,
        });
        yield* waitFor(page, render('open'));
        // The picture sits left of the name, a thumbnail, not the row's width.
        const beside = (selector: string) =>
          `((p, n) => p.right <= n.left && p.width < innerWidth / 2)(document.querySelector('${selector} .sc-card-picture').getBoundingClientRect(), document.querySelector('${selector} .sc-card-name').getBoundingClientRect())`;
        yield* evaluates(page, beside(render('open')), true);
        // The row carries no verb; the scene's sheet does.
        yield* evaluates(
          page,
          `document.querySelector('${render('open')} [data-act="approve"]').checkVisibility()`,
          false,
        );
        yield* inspect(page, render('open'));
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        // A laptop has room for the card whole: its picture over its name, and its Approve.
        yield* page.resize(1440, 900);
        yield* evaluates(page, beside(render('open')), false);
        yield* evaluates(
          page,
          `document.querySelector('${render('open')} [data-act="approve"]').checkVisibility()`,
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a phone the transport is docked over the tab bar; a tap on a scene's row opens its sheet above it, whose grip lowers it to a peek and raises it again",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject({ cut: true }), {
          href: PROJECT,
          viewport: PHONE,
        });
        yield* waitFor(page, `${DOCK} .rv-transport [data-act="play"]`);
        // The dock sits on the tab bar, the page's width.
        yield* until(page, standsOn(DOCK, '.sh-pagebar'));
        // A tap on the row's picture (not its name) opens the scene's sheet.
        yield* click(page, `${render('open')} .sc-card-picture`);
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        // A sheet the page's width standing on the dock, the tab bar still in reach.
        yield* until(page, standsOn(INSPECTOR, DOCK));
        yield* evaluates(
          page,
          `document.elementFromPoint(innerWidth / 2, ${rect('.sh-pagebar')}.top + 20)?.closest('.sh-pagebar') !== null`,
          true,
        );
        // It holds what the row does not: the comment box, Info, Versions and Open in Lab, the choices in the scene.
        yield* waitFor(page, `${INSPECTOR} .rv-comment-input`);
        yield* waitFor(page, `${INSPECTOR} [data-section="info"]`);
        yield* waitFor(page, `${INSPECTOR} [data-act="open-lab"]`);
        yield* waitFor(page, `${INSPECTOR} [data-plays="take:paper.page"]`);
        // Its grip lowers it to a peek: its title and the grip, standing on the dock; and raises it again.
        yield* click(page, `${INSPECTOR} [data-act="sheet"]`);
        yield* attributeIs(page, INSPECTOR, 'data-peek', 'true');
        yield* evaluates(
          page,
          `document.querySelector('${INSPECTOR} .lab-inspector-body').checkVisibility()`,
          false,
        );
        yield* until(
          page,
          `${standsOn(INSPECTOR, DOCK)} && ${rect(INSPECTOR)}.height <= 2 * 44 + 1`,
        );
        yield* click(page, `${INSPECTOR} [data-act="sheet"]`);
        yield* attributeIs(page, INSPECTOR, 'data-peek', 'false');
        yield* waitFor(page, `${INSPECTOR} .rv-comment-input`);
        yield* evaluates(page, 'document.documentElement.scrollWidth <= innerWidth', true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "the open sheet is the URL's: a tap names its part (Back closes it, Forward opens it), Close and Escape drop it, a link opens it; the draft and the player live through it",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject({ cut: true }), {
          href: PROJECT,
          viewport: LAPTOP,
        });
        const pointIs = (want: string) =>
          evaluates(page, `new URL(location.href).searchParams.get('point') ?? ''`, want);
        const title = `${INSPECTOR} .lab-sheet-title`;
        yield* waitFor(page, `${DOCK} .rv-transport [data-act="play"]`);
        yield* page.evaluate(
          `void (window.__transport = document.querySelector('${DOCK} .rv-transport'))`,
        );
        const samePlayer = `document.querySelector('${DOCK} .rv-transport') === window.__transport`;
        // A tap on a scene names its render in the URL, a step of its own; the sheet says scene and act.
        yield* click(page, `${render('open')} .sc-card-picture`);
        yield* textIs(page, title, 'scene open · opening');
        yield* pointIs('render:scenes:open');
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'half a thought');
        // Back closes it; Forward opens it again, its draft kept, the player the same throughout.
        yield* page.back;
        yield* countIs(page, INSPECTOR, 0);
        yield* pointIs('');
        yield* page.forward;
        yield* textIs(page, title, 'scene open · opening');
        yield* valueIs(page, `${INSPECTOR} .rv-comment-input`, 'half a thought');
        yield* evaluates(page, samePlayer, true);
        // Close drops it from the URL, going Back over the tap's entry: it makes none of its own.
        yield* click(page, `${INSPECTOR} [data-act="close-inspector"]`);
        yield* countIs(page, INSPECTOR, 0);
        yield* pointIs('');
        // An act's and the film's sheets are named by their renders too; Escape drops them, as
        // Close does.
        yield* inspect(page, ACT_HEAD);
        yield* textIs(page, title, 'act opening');
        yield* pointIs('render:act:opening');
        yield* page.press('Escape');
        yield* countIs(page, INSPECTOR, 0);
        yield* pointIs('');
        yield* inspect(page, FILM_HEAD);
        yield* textIs(page, title, 'the film toy');
        yield* pointIs('render:film');
        // Back from one sheet to another opens the other: the film's, then none (Project's own
        // entry: Escape went Back over the act's, leaving none of its own).
        yield* click(page, `${render('coda')} .sc-card-picture`);
        yield* textIs(page, title, 'scene coda');
        yield* pointIs('render:scenes:coda');
        yield* page.back;
        yield* textIs(page, title, 'the film toy');
        yield* page.back;
        yield* countIs(page, INSPECTOR, 0);
        yield* evaluates(page, samePlayer, true);
        yield* page.forward;
        yield* page.forward;
        yield* textIs(page, title, 'scene coda');
        // The URL with the sheet named, opened fresh: the sheet is open, and Close drops it.
        const link = new URL(yield* page.url);
        yield* page.goto(`${link.pathname}${link.search}`);
        yield* textIs(page, title, 'scene coda');
        yield* click(page, `${INSPECTOR} [data-act="close-inspector"]`);
        yield* countIs(page, INSPECTOR, 0);
        yield* pointIs('');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "closing a sheet a tap opened goes Back over the tap's entry: Back then leaves Project, the sheet staying closed",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject({ cut: true }), {
          href: pageHref.choices('toy'),
          viewport: LAPTOP,
        });
        const at = (href: string) =>
          until(page, `location.pathname + location.search === '${href}'`);
        yield* page.click('.sh-pagebar [data-page="project"]');
        yield* at(PROJECT);
        // Close and Escape (and a swipe: the drawer's own close) dismiss the sheet one way, the
        // place's `name(None)`; neither leaves an entry, as the Back after them shows.
        const dismissals = [
          click(page, `${INSPECTOR} [data-act="close-inspector"]`),
          page.press('Escape'),
        ];
        for (const dismiss of dismissals) {
          yield* click(page, `${render('open')} .sc-card-picture`);
          yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
          yield* at(pageHref.project('toy', 'render:scenes:open'));
          yield* dismiss;
          yield* countIs(page, INSPECTOR, 0);
          yield* at(PROJECT);
        }
        // The dismissals left no entry of their own: Back is Project's previous one, Choices.
        yield* page.back;
        yield* at(pageHref.choices('toy'));
        yield* countIs(page, INSPECTOR, 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'closing a sheet a link opened makes no entry: it names no part on the same one',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject({ cut: true }), {
          href: pageHref.project('toy', 'render:scenes:open'),
          viewport: LAPTOP,
        });
        yield* textIs(page, `${INSPECTOR} .lab-sheet-title`, 'scene open · opening');
        yield* page.evaluate('void (window.__entries = history.length)');
        yield* click(page, `${INSPECTOR} [data-act="close-inspector"]`);
        yield* countIs(page, INSPECTOR, 0);
        yield* until(page, `location.pathname + location.search === '${PROJECT}'`);
        yield* evaluates(page, 'history.length === window.__entries', true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'with no render of the film, the dock says so in a line where the transport would be',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(), {
          href: PROJECT,
          viewport: PHONE,
        });
        yield* textIs(page, `${DOCK} [data-role="no-cut"]`, 'No render of the whole film yet');
        yield* countIs(page, '.rv-transport', 0);
        yield* countIs(page, '.rv-note', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  // Serial: a finger's touches (`film/touches-serial`).
  test.serial(
    'on a phone the Findings sheet is the one sheet: its grip lowers it, and a swipe down closes it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject({ findings: [CLOSE_FINDING] }), {
          href: PROJECT,
          viewport: { ...PHONE, coarse: true },
        });
        const sheet = '[data-role="findings"]';
        yield* click(page, `${FILM} [data-act="findings"][data-check="check"]`);
        yield* waitFor(page, `${sheet} [data-check="check"] li`);
        yield* click(page, `${sheet} [data-act="sheet"]`);
        yield* attributeIs(page, sheet, 'data-peek', 'true');
        yield* click(page, `${sheet} [data-act="sheet"]`);
        yield* attributeIs(page, sheet, 'data-peek', 'false');
        const head = yield* page.box(`${sheet} .lab-inspector-head`);
        const x = head.x + head.width / 2;
        const y = head.y + head.height / 2;
        yield* page.finger.drag({ x, y }, { x, y: y + 400 });
        yield* countIs(page, sheet, 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped, Effect.runPromise),
    SLOW,
  );

  // Serial: a finger's touches (`film/touches-serial`).
  test.serial(
    "a long press on an act's header offers its approvals from the command registry; the approve's receipt says before → after, and its Undo withdraws just what it approved",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeProject(), {
          href: PROJECT,
          viewport: { ...PHONE, coarse: true },
        });
        yield* waitFor(page, render('close'));
        // The clock held: the long press's delay passes only as the test runs it on.
        yield* page.clock.hold;
        yield* touch(page, `${ACT_HEAD} .pj-act-meta`, 0);
        yield* page.clock.runFor(700);
        const approve = '[data-role="context-menu"] [data-command="review.approve-part"]';
        yield* waitFor(page, approve);
        yield* textHas(page, approve, "Approve the act's current scenes");
        yield* page.finger.up;
        // The menu is open: the page's time runs on again with real time, so the approve's say
        // goes and its receipt shows for its while.
        yield* page.clock.release;
        yield* click(page, approve);
        // Only the current scene is approved (close waits on a render): one of two.
        yield* receiptSays(page, 'Approved act opening · 0/2 → 1/2 approved');
        yield* waitFor(page, `${render('open')} .sc-chip[data-mark="approved"]`);
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'Undid approving scene open');
        yield* countIs(page, `${render('open')} .sc-chip[data-mark="approved"]`, 0);
        // close kept its approval of an earlier version: the Undo withdrew open's alone.
        yield* attached(page, `${render('close')} .sc-chip[data-mark="approved-earlier"]`);
        // The Undo names the approve's run (its op): only the approvals it gave go.
        expect(saysPosted(asked)).toEqual([
          { address: { _tag: 'Act', act: 'opening' }, say: { _tag: 'Approve' } },
          { address: { _tag: 'Scenes', ids: ['open'] }, say: { _tag: 'Withdraw', given: 'op-1' } },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped, Effect.runPromise),
    SLOW,
  );

  it.live(
    'an approve whose scene another approved first offers no Undo: it gave no approval to take back',
    () =>
      Effect.gen(function* () {
        // The page read coda unapproved; another approves it just before the page's approve lands.
        const routes = fakeProject({
          before: (p, other) => {
            if (p.say._tag === 'Approve') other.approve(['coda']);
          },
        });
        const { page, errors } = yield* openReview(routes, { href: PROJECT, viewport: LAPTOP });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        // The receipt and its Undo, read together: the approve gave nothing, so offers nothing back.
        yield* receiptIs(page, 'Approved scene coda · 0/1 → 1/1 approved', false);
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="approved"]`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "an approve's Undo after another withdrew and approved again takes nothing: the approval now is theirs",
    () =>
      Effect.gen(function* () {
        // Just before the Undo lands, another withdraws coda's approval and approves it again, its
        // run stamped at the very moment the page's was: only the op tells the two apart.
        const routes = fakeProject({
          before: (p, other) => {
            if (p.say._tag === 'Withdraw') {
              other.withdraw(['coda']);
              other.approve(['coda']);
            }
          },
        });
        const { page, asked, errors } = yield* openReview(routes, {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* receiptSays(page, 'Approved scene coda · 0/1 → 1/1 approved');
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        // The catalogue's answer says the Undo took nothing, and the receipt says so.
        yield* receiptSays(
          page,
          'Nothing left to undo: that approval of scene coda was withdrawn since · 1/1 → 1/1 approved',
        );
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="approved"]`);
        expect(saysPosted(asked)).toEqual([
          { address: { _tag: 'Scenes', ids: ['coda'] }, say: { _tag: 'Approve' } },
          { address: { _tag: 'Scenes', ids: ['coda'] }, say: { _tag: 'Withdraw', given: 'op-1' } },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "an approve's Undo whose approval another withdrew says there is nothing left to undo",
    () =>
      Effect.gen(function* () {
        // Just before the Undo lands, another withdraws coda's approval: the op's is gone.
        const routes = fakeProject({
          before: (p, other) => {
            if (p.say._tag === 'Withdraw') other.withdraw(['coda']);
          },
        });
        const { page, errors } = yield* openReview(routes, { href: PROJECT, viewport: LAPTOP });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* receiptSays(page, 'Approved scene coda · 0/1 → 1/1 approved');
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(
          page,
          'Nothing left to undo: that approval of scene coda was withdrawn since · 1/1 → 0/1 approved',
        );
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "an approve's Undo takes its approval though a new render made it stale since",
    () =>
      Effect.gen(function* () {
        // A terminal renders coda again just after the page's approve lands: its answer reads
        // the approval stale. The approval is still the approve's own, so its Undo takes it.
        const routes = fakeProject({
          after: (p, other) => {
            if (p.say._tag === 'Approve') other.render(['coda']);
          },
        });
        const { page, asked, errors } = yield* openReview(routes, {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* receiptSays(page, 'Approved scene coda · 0/1 → 0/1 approved');
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="stale"]`);
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'Undid approving scene coda · 0/1 → 0/1 approved');
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        expect(saysPosted(asked)[1]).toEqual({
          address: { _tag: 'Scenes', ids: ['coda'] },
          say: { _tag: 'Withdraw', given: 'op-1' },
        });
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "an approve's Undo leaves an earlier version's approval in place",
    () =>
      Effect.gen(function* () {
        // coda's render is current; an earlier version of it was approved.
        const routes = fakeProject({ approvedEarlier: ['coda'] });
        const { page, asked, errors } = yield* openReview(routes, {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="stale"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* receiptSays(page, 'Approved scene coda · 0/1 → 1/1 approved');
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'Undid approving scene coda · 1/1 → 0/1 approved');
        // The approval of the earlier version stands: the card says so again.
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="stale"]`);
        expect(saysPosted(asked)[1]).toEqual({
          address: { _tag: 'Scenes', ids: ['coda'] },
          say: { _tag: 'Withdraw', given: 'op-1' },
        });
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "an approve's receipt the tab kept before ids were their own still undoes the approve after a reload",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeProject(), {
          href: PROJECT,
          viewport: LAPTOP,
        });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* receiptSays(page, 'Approved scene coda · 0/1 → 1/1 approved');
        // As the page goes, its receipt is kept as a tab kept it before: the approve's op and
        // scenes spelled as one change, `<op> <scene>…`.
        yield* page.evaluate(
          `addEventListener('pagehide', () => { const k = 'film-receipts'; const v = JSON.parse(sessionStorage.getItem(k)); v.receipts = v.receipts.map((r) => r.bound !== undefined && r.bound.gave !== undefined ? { ...r, bound: { film: r.bound.film, change: [r.bound.gave.op, ...r.bound.gave.scenes].join(' ') } } : r); sessionStorage.setItem(k, JSON.stringify(v)); }); true`,
        );
        yield* page.reload;
        yield* receiptSays(page, 'Approved scene coda · 0/1 → 1/1 approved');
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'Undid approving scene coda · 1/1 → 0/1 approved');
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        expect(saysPosted(asked)[1]).toEqual({
          address: { _tag: 'Scenes', ids: ['coda'] },
          say: { _tag: 'Withdraw', given: 'op-1' },
        });
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "each scene's card shows a still of the scene drawn from the film's code, its length over it",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject(), {
          href: PROJECT,
          viewport: LAPTOP,
        });
        for (const id of ['open', 'close', 'coda', 'end'])
          yield* waitFor(page, `${render(id)} .pj-still[data-drawn="true"] canvas`);
        // Each still is its own scene's frame: open's block is red, close's blue.
        const redder = (id: string) =>
          `((c) => ((p) => p[0] > p[2])(c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data))(document.querySelector('${render(id)} .pj-still canvas'))`;
        yield* evaluates(page, redder('open'), true);
        yield* evaluates(page, redder('close'), false);
        yield* textIs(page, `${render('close')} .sc-card-length`, '00:00:06:00');
        // A missing scene's card shows its still too: the command that renders it is in its sheet's Info.
        yield* countIs(page, `${render('end')} .rv-meta`, 0);
        yield* inspect(page, render('end'));
        yield* textHas(
          page,
          `${INSPECTOR} [data-section="info"]`,
          'film project render toy --scene end',
        );
        // A scene with no render recorded shows its still in its sheet, a copy of the card's.
        yield* waitFor(page, `${INSPECTOR} .pj-still[data-drawn="true"] canvas`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "lists the act and its scenes with their states and approvals; a scene's sheet plays its render and links the choices in it, each to its card on Choices",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject());
        // A film card says the film's state as its project's head does: the band (renders and
        // approvals) and the counts (SU-8).
        const card = '.rv-film-card[data-film="toy"]';
        yield* waitFor(page, `${card} .pj-band [data-scene]`);
        yield* attributesAre(page, `${card} .pj-band [data-scene]`, 'data-state', [
          'none',
          'stale',
          'none',
          'rendered',
        ]);
        yield* textIs(
          page,
          `${card} [data-role="counts"]`,
          '0/4 approved · 1 out of date · 1 not rendered',
        );
        // A film card opens its project from its context menu.
        yield* rightClick(page, card);
        yield* click(page, '[data-role="context-menu"] [data-command="film.project"]');
        yield* until(page, `location.pathname === '${PROJECT}'`);
        yield* waitFor(page, ACT);
        // The act holds its scenes; the scenes in no act follow.
        yield* attributesAre(page, `${ACT} .rv-scene`, 'data-scene', ['open', 'close']);
        yield* waitFor(page, `${scene('coda')}[data-state="current"]`);
        yield* waitFor(page, `${scene('close')}[data-state="stale"]`);
        // A rendered scene's sheet plays its render; one with none recorded shows its still.
        yield* inspect(page, render('open'));
        yield* until(
          page,
          `document.querySelector('${INSPECTOR} video')?.getAttribute('src') === '/api/review/files/out/toy/scenes/open/main.share.mp4'`,
        );
        // The render shows a still of itself before it is played, as a folder's cards do.
        yield* attributeIs(
          page,
          `${INSPECTOR} video`,
          'poster',
          '/api/review/frame?ref=out%2Ftoy%2Fscenes%2Fopen%2Fmain.share.mp4&w=960',
        );
        // Never the browser's controls: its picture plays it, on a clock of its own.
        yield* countIs(page, `${INSPECTOR} video[controls]`, 0);
        yield* countIs(page, `${INSPECTOR} [data-act="play-video"] video`, 1);
        yield* inspect(page, render('close'));
        yield* countIs(page, `${INSPECTOR} video`, 0);
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
        // Each sheet lists the choices that play in its part, none of them at rest: a scene's,
        // its own and the layers placed elsewhere; the act's, its layers; the film's, its own.
        // (The sheet stands in the page's main, where it is written: none outside it.)
        yield* countIs(page, `.rv-main [data-plays]:not(${INSPECTOR} *)`, 0);
        yield* attributesAre(page, `${INSPECTOR} [data-plays]`, 'data-plays', [
          'voice:close',
          'take:paper.hum',
          'take:room.tone',
        ]);
        yield* inspect(page, ACT_HEAD);
        yield* attributesAre(page, `${INSPECTOR} [data-plays]`, 'data-plays', ['take:paper.hum']);
        yield* inspect(page, FILM_HEAD);
        yield* attributesAre(page, `${INSPECTOR} [data-plays]`, 'data-plays', [
          'score',
          'take:room.tone',
        ]);
        // A choice's link opens it on Choices at its card, a step Back undoes; a modified click is the browser's.
        yield* inspect(page, render('open'));
        yield* attributeIs(
          page,
          `${INSPECTOR} [data-plays="take:paper.hum"]`,
          'href',
          pageHref.choices('toy', 'take:paper.hum'),
        );
        yield* click(page, `${INSPECTOR} [data-plays="take:paper.hum"]`);
        yield* until(
          page,
          `location.pathname + location.search === '${pageHref.choices('toy', 'take:paper.hum')}'`,
        );
        yield* page.back;
        // Back on the project, the scene's sheet the URL names is open again.
        yield* until(
          page,
          `location.pathname + location.search === '${pageHref.project('toy', 'render:scenes:open')}'`,
        );
        yield* textIs(page, `${INSPECTOR} .lab-sheet-title`, 'scene open · opening');
        // An old link to a choice's card on the project goes on to the card on Choices.
        yield* page.goto(pageHref.project('toy', 'take:paper.hum'));
        yield* until(
          page,
          `location.pathname + location.search === '${pageHref.choices('toy', 'take:paper.hum')}'`,
        );
        yield* page.goto(`${PROJECT}#point-take%3Apaper.hum`);
        yield* until(
          page,
          `location.pathname + location.search === '${pageHref.choices('toy', 'take:paper.hum')}'`,
        );
        // The card is brought into view on a phone, where it starts well below the fold.
        yield* page.resize(390, 600);
        yield* page.goto(PROJECT);
        yield* inspect(page, render('open'));
        yield* click(page, `${INSPECTOR} [data-plays="take:paper.hum"]`);
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
        // The part's counts are the film head's words, as a Films card says them.
        yield* textIs(
          page,
          `${INSPECTOR} [data-role="counts"]`,
          '0/4 approved · 1 out of date · 1 not rendered',
        );
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
        yield* inspect(page, render('open'));
        yield* waitFor(page, `${INSPECTOR} video`);
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'half a thought');
        yield* page.evaluate(`window.clip = document.querySelector('${INSPECTOR} video')`);
        // The inspector sits beside the page: the page under it stays live.
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* waitFor(page, `${render('coda')} .sc-chip[data-mark="approved"]`);
        yield* valueIs(page, `${INSPECTOR} .rv-comment-input`, 'half a thought');
        yield* evaluates(
          page,
          `window.clip === document.querySelector('${INSPECTOR} video')`,
          true,
        );
        // Closed and opened again, it keeps the half-typed comment.
        yield* page.press('Escape');
        yield* countIs(page, INSPECTOR, 0);
        yield* inspect(page, render('open'));
        yield* valueIs(page, `${INSPECTOR} .rv-comment-input`, 'half a thought');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a scene's Versions link leaves a modified click to the browser (a new tab); a plain one goes there in place",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeProject({ rendered: ['open'] }), {
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
          [whileBroken(/^\/api\/films\/toy\/project\/say$/), ...routes],
          { href: PROJECT },
        );
        const box = `${INSPECTOR} .rv-comment-input`;
        /** Say `text` in the inspector of `at`, posted as the `n`th say; wait for its receipt to refuse it. */
        const failedSay = (at: string, text: string, n: number) =>
          Effect.gen(function* () {
            yield* inspect(page, at);
            yield* page.fill(box, text);
            yield* click(page, `${INSPECTOR} [data-act="comment"]`);
            yield* Effect.sync(() => saysPosted(asked).length).pipe(
              Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (m) => m >= n }),
              Effect.timeout('10 seconds'),
            );
            // Its receipt, in the project's slot, says why it was refused.
            yield* attributeIs(page, RECEIPT, 'data-type', 'refused');
          });
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        // A scene's comment and the film's: each fails, and each keeps its text.
        yield* failedSay(render('open'), 'a long thoughtful note', 1);
        yield* valueIs(page, box, 'a long thoughtful note');
        yield* failedSay(FILM_HEAD, 'of the whole film', 2);
        yield* valueIs(page, box, 'of the whole film');
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
        const { page, errors } = yield* openReview(fakeProject({ goneStale: ['coda'] }), {
          href: PROJECT,
        });
        yield* waitFor(page, `${render('coda')} [data-act="approve"][data-approval="none"]`);
        yield* click(page, `${render('coda')} [data-act="approve"]`);
        yield* attributeIs(page, RECEIPT, 'data-type', 'refused');
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
        const { page, errors } = yield* openReview(fakeProject({ elsewhere: true }), {
          href: PROJECT,
        });
        yield* inspect(page, render('open'));
        yield* waitFor(page, `${INSPECTOR} video`);
        yield* attributeIs(
          page,
          `${INSPECTOR} video`,
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
        // The read after the undo answers the project as it stood when asked, once let land.
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
        // An undo changes the film's source: its scenes are read again.
        yield* openCommandMenu(page, 'undo');
        yield* click(page, menuEntry('review.undo'));
        yield* Effect.sync(
          () =>
            asked.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/project').length,
        ).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 2 }),
          Effect.timeout('10 seconds'),
        );
        yield* attributeIs(page, FILM, 'data-reading', 'true');
        // Said while the read is out: the say answers the project with the comment.
        yield* inspect(page, render('open'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'said while it read');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        // The older read lands last: the page has read it, and the comment stays.
        yield* Deferred.done(land, Exit.void);
        yield* attributeIs(page, FILM, 'data-reading', 'false');
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
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'said before the undo');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* Effect.sync(() => saysPosted(asked).length).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 1 }),
          Effect.timeout('10 seconds'),
        );
        // An undo while the say is out: its read answers first, without the comment.
        yield* openCommandMenu(page, 'undo');
        yield* click(page, menuEntry('review.undo'));
        yield* Effect.sync(reads).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 2 }),
          Effect.timeout('10 seconds'),
        );
        yield* attributeIs(page, FILM, 'data-reading', 'false');
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
    'a say is shown from its answer, and an undo reads the project again once',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeProject(), { href: PROJECT });
        yield* waitFor(page, `${render('open')} [data-act="approve"]`);
        const reads = (from: number) =>
          asked
            .slice(from)
            .filter((a) => a.method === 'GET' && a.path === '/api/films/toy/project')
            .map((a) => a.path);
        const before = asked.length;
        yield* inspect(page, render('open'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'the page is late');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        // The say's answer is the project: nothing is read for it.
        expect(reads(before)).toEqual([]);
        // The menu's Undo names what it undoes; it changes the film, whose scenes are read again, once.
        yield* openCommandMenu(page, 'undo');
        yield* textIs(page, menuEntry('review.undo'), /^Undo score play brass/);
        yield* click(page, menuEntry('review.undo'));
        yield* Effect.sync(() => reads(before)).pipe(
          Effect.repeat({
            schedule: Schedule.spaced('25 millis'),
            until: (paths) => paths.length > 0,
          }),
          Effect.timeout('10 seconds'),
        );
        yield* attributeIs(page, FILM, 'data-reading', 'false');
        expect(reads(before)).toEqual(['/api/films/toy/project']);
        yield* closeCommandMenu(page).pipe(Effect.ignore);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
