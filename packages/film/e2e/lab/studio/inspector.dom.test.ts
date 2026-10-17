// The studio's inspector over the probe film, on a laptop (1440 × 900) and a
// phone (390 × 844): a beat selected opens its Words, a panel selected its
// Board, and each section opens in place with its material (the beat's line
// in the reader, its panels and their tries, its take, its scene's code, its
// notes and the asks at its time). A try pressed shows in the viewer, and a
// second press shows the kept one again. Its writes are the lab's: a try
// kept, the beat's Board approved and its approval withdrawn, a panel marked
// up and saved as a tweak, a note, a correction and a removal on a line's
// words, a reply on a note; its take plays; Record opens over the studio (a
// Dialog on a laptop, a Sheet on a phone), and a take under way is never
// dropped by a Close or Escape without the owner's word; a note's link opens
// it; an ask opens its own page. Every wait is on what the page shows, never
// on time.

import { Boolean as Bool, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import {
  type Asked,
  DESK,
  type FakeRoute,
  type Json,
  PANEL_PNG,
  PHONE,
  TONE,
  type Viewport,
  json,
  openPlayer,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import { PROBE_ASK } from '../../../src/lab/fixtures/probe-timeline.ts';
import { beat } from '../studio-states.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
  textIs,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

/** The studio's first clip drawn: the timeline is read and laid out. */
const READY = '.st-timeline .st-clip';

const SIZES = [
  { name: 'a laptop', viewport: DESK },
  { name: 'a phone', viewport: PHONE },
] as const;

/** A try of the probe film's board, as `GET …/board` lists it. */
const tryOf = (beat: string, at: string, n: number): Json => ({
  n,
  file: `${beat}.${at}.${n}.png`,
  sha256: `${beat}${at}${n}`,
  made: 'generate',
  refs: ['style.png'],
  at: '2026-10-14T00:00:00.000Z',
});

/**
 * The probe film's board with beat one's `fall` keeping try `fall` (none:
 * no try kept) and beat one approved on its kept tries or not.
 */
const boardWith = (fall: Option.Option<number>, approved: boolean): Json => ({
  film: PROBE,
  panels: [
    {
      id: 'one.start',
      beat: 'one',
      at: 'start',
      tries: [tryOf('one', 'start', 1), tryOf('one', 'start', 2)],
      kept: 1,
      why: 'the line reads at once',
    },
    {
      id: 'one.rise',
      beat: 'one',
      at: 'rise',
      tries: [],
      text: { _tag: 'Card', to: 'fall', payoff: 'slowly' },
    },
    {
      id: 'one.fall',
      beat: 'one',
      at: 'fall',
      tries: [tryOf('one', 'fall', 1), tryOf('one', 'fall', 2)],
      ...Option.match(fall, { onNone: () => ({}), onSome: (kept) => ({ kept }) }),
    },
  ],
  approvals: Bool.match(approved, {
    onTrue: () => [
      {
        beat: 'one',
        kept: [
          { panel: 'one.start', try: 1 },
          { panel: 'one.fall', try: Option.getOrElse(fall, () => 1) },
        ],
        at: '2026-10-16T00:00:00.000Z',
      },
    ],
    onFalse: () => [],
  }),
});

/** A note on the probe film, made at `T` in `scene`, with its thread. */
const noteOf = (
  id: string,
  scene: string,
  T: number,
  text: string,
  thread: ReadonlyArray<Json>,
): Json => ({
  id,
  film: PROBE,
  scene,
  T,
  frame: Math.round(T * 30),
  status: Bool.match(thread.length > 0, { onTrue: () => 'replied', onFalse: () => 'open' }),
  still: `${id}.png`,
  thread,
  createdAt: '2026-10-16T00:00:00.000Z',
  seq: 1,
  changed: 1 + thread.length,
  text,
});

/** Beat one's take kept: what the studio's takes read answers for it. */
const KEPT_TAKE: Json = {
  beat: 'one',
  attempts: [
    {
      file: 'one.kept.flac',
      transcript: 'the ball climbs and falls',
      wer: 0,
      at: 1,
      duration: 2,
      kept: true,
      current: true,
    },
  ],
};

/** Beat one's scene file as the lab reads it for its Code section. */
const SCENE_ONE: Json = {
  scene: 'one',
  file: 'scenes/one.ts',
  text: "export const one = scene('one');\nconst rise = cue('rise');",
  cues: [],
  knobs: [],
  marks: [],
  refused: [],
};

/** The routes every case here answers past the probe film's own. */
const INSPECTED: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/studio\/takes\/one\/attempts$/, () => json(KEPT_TAKE)),
  route('GET', /^\/studio\/takes\/one\/attempts\/one\.kept\.flac$/, () => TONE),
  route('GET', /^\/scenes\/one\/code$/, () => json(SCENE_ONE)),
  route('GET', /^\/board\/files\/[\w.]+\.png$/, () => PANEL_PNG),
];

/**
 * The studio at `href` on `viewport`, its timeline drawn, over `routes`
 * before the inspector's; the fake microphone allowed when `microphone`.
 */
const studioAt = (
  viewport: Viewport,
  href: string,
  routes: ReadonlyArray<FakeRoute> = [],
  microphone = false,
) => openPlayer({ href, viewport, microphone }, READY, [...routes, ...INSPECTED]);

type Page = Effect.Success<ReturnType<typeof studioAt>>['page'];

/**
 * The notes routes over a list the case's posts grow: a post answers the
 * note it makes (`id`, its draft's fields as sent), listed from then on.
 */
const notesKept = (ids: ReadonlyArray<string>) => {
  let made: ReadonlyArray<Json> = [];
  let next = 0;
  return [
    route('GET', /^\/notes$/, () => json({ film: PROBE, seq: made.length, notes: made })),
    route('POST', /^\/notes$/, (asked) => {
      const sent = Option.getOrElse(asked.body, (): Json => ({})) as { readonly [k: string]: Json };
      const { still: _still, ...draft } = sent;
      const id = ids[next] ?? `n-${next}`;
      next += 1;
      const note: Json = { ...(noteOf(id, 'one', 0, '', []) as object), ...draft, id };
      made = [...made, note];
      return json(note);
    }),
  ];
};

/** A stroke across the box `selector` draws, a mouse's on a laptop and a finger's on a phone. */
const strokeOver = (page: Page, viewport: Viewport, selector: string) =>
  Effect.gen(function* () {
    const box = yield* page.box(selector);
    const from = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 };
    const to = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 };
    if (viewport === PHONE) {
      yield* page.finger.drag(from, to, 8);
      return;
    }
    yield* page.mouse.move(from.x, from.y);
    yield* page.mouse.down;
    yield* page.mouse.move(to.x, to.y, 8);
    yield* page.mouse.up;
  });

/** The status line of the recorder over the page. */
const RECORD_STATUS = `(document.querySelector('[data-role="record"] [data-role="status"]')?.textContent ?? '')`;

/** The section `name` of the pane. */
const section = (name: string) => `.st-pane .st-sec[data-section="${name}"]`;

/** Open section `name` by its row, as a press does, and wait until it stands open. */
const openSection = (page: Page, name: string) =>
  Effect.gen(function* () {
    yield* page.click(`${section(name)} > summary`);
    yield* waitFor(page, `${section(name)}[open] .st-sec-body`);
  });

/** The POSTs to `path` among `asked`, by their bodies. */
const posted = (asked: ReadonlyArray<Asked>, path: string) =>
  asked.filter((a) => a.method === 'POST' && a.path === path).map((a) => a.body);

for (const size of SIZES)
  describe(`the inspector on ${size.name}`, () => {
    it.live(
      "opens a beat on its Words, and each section opens in place with the beat's own material",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:one' }),
          );
          yield* waitFor(page, '.st-pane[data-beat="one"]');
          // Words is open with the selection, its line in the reader; the rest are shut.
          yield* waitFor(page, `${section('Words')}[open] .lab-script-beat[data-beat="one"]`);
          yield* countIs(page, '.st-pane .st-sec[open]', 1);
          yield* openSection(page, 'Board');
          yield* waitFor(page, `${section('Board')} .st-panel[data-panel="one.start"]`);
          yield* waitFor(page, `${section('Board')} .st-panel[data-panel="one.fall"]`);
          yield* openSection(page, 'Voice');
          yield* textIs(page, `${section('Voice')} [data-role="take-source"]`, 'the staging voice');
          yield* waitFor(page, `${section('Voice')} [data-act="hear-take"]`);
          yield* openSection(page, 'Code');
          yield* textHas(page, `${section('Code')} .st-code-file`, 'scenes/one.ts');
          yield* textHas(page, `${section('Code')} .st-code-line`, "const rise = cue('rise');");
          yield* openSection(page, 'Notes and asks');
          yield* textHas(page, `${section('Notes and asks')} .st-line`, 'Nothing waits');
          // No row leads to a page the studio replaced.
          yield* countIs(page, '.st-pane a[href*="/script"], .st-pane a[href*="/board"]', 0);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'opens a panel on its Board; a try pressed shows in the viewer, a second press the kept one, and Keep keeps it through the lab',
      () =>
        Effect.gen(function* () {
          let fall = Option.none<number>();
          const { page, asked, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'panel:one.fall' }),
            [
              route('GET', /^\/board$/, () => json(boardWith(fall, false))),
              route('POST', /^\/board\/pick$/, () => {
                fall = Option.some(2);
                return json(boardWith(fall, false));
              }),
            ],
          );
          const panel = `${section('Board')}[open] .st-panel[data-panel="one.fall"]`;
          yield* attributeIs(page, panel, 'data-selected', 'true');
          yield* page.click(`${panel} .st-try-btn[data-try="2"]`);
          yield* waitFor(page, `${panel} .st-try-shown[data-try="2"] [data-act="keep"]`);
          // The try is the viewer's picture, named on its tag, and the link's.
          yield* evaluates(
            page,
            `document.querySelector('.st-viewer img.st-pic')?.getAttribute('src')?.endsWith('one.fall.2.png') ?? false`,
            true,
          );
          yield* textHas(page, '.st-viewer .st-tag', 'one · try 2');
          yield* evaluates(page, `new URLSearchParams(location.search).get('try')`, '2');
          // A second press shows the panel as the film holds it again.
          yield* page.click(`${panel} .st-try-btn[data-try="2"]`);
          yield* countIs(page, `${panel} .st-try-shown`, 0);
          yield* evaluates(page, `new URLSearchParams(location.search).has('try')`, false);
          yield* page.click(`${panel} .st-try-btn[data-try="2"]`);
          yield* waitFor(page, `${panel} .st-try-shown[data-try="2"] [data-act="keep"]`);
          yield* page.click(`${panel} .st-try-shown [data-act="keep"]`);
          yield* textIs(page, '.st-pane [data-role="board-write"]', 'Kept try 2 of one.fall');
          yield* attributeIs(page, `${panel} .st-try-btn[data-try="2"]`, 'data-kept', 'true');
          expect(posted(asked, '/board/pick').length).toBe(1);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "approves the beat's Board on the tries it keeps, and withdraws the approval",
      () =>
        Effect.gen(function* () {
          let approved = false;
          const answer = () => json(boardWith(Option.some(1), approved));
          const { page, asked, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:one' }),
            [
              route('GET', /^\/board$/, answer),
              route('POST', /^\/board\/approve$/, () => {
                approved = true;
                return answer();
              }),
              route('POST', /^\/board\/withdraw$/, () => {
                approved = false;
                return answer();
              }),
            ],
          );
          const approve = '.st-pane-head [data-act="approve"]:not([disabled])';
          yield* page.click(approve);
          yield* textIs(page, '.st-pane [data-role="board-write"]', 'Approved one');
          yield* page.click('.st-pane-head [data-act="withdraw"]:not([disabled])');
          yield* textIs(page, '.st-pane [data-role="board-write"]', 'Withdrew one');
          yield* waitFor(page, approve);
          expect(posted(asked, '/board/approve')).toEqual([Option.some({ beat: 'one' })]);
          expect(posted(asked, '/board/withdraw')).toEqual([Option.some({ beat: 'one' })]);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "plays the beat's kept take, and Record opens the recorder over the studio",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:one' }),
            [
              route('GET', /^\/studio\/beats$/, () =>
                json({
                  film: PROBE,
                  beats: [
                    beat('one', 'staging', 'The ball climbs.'),
                    beat('two', 'staging', 'The ball falls.'),
                  ],
                }),
              ),
            ],
          );
          yield* openSection(page, 'Voice');
          const hear = `${section('Voice')} [data-act="hear-take"]`;
          yield* textHas(page, `${section('Voice')} .st-heard`, 'the ball climbs and falls');
          yield* page.click(hear);
          yield* attributeIs(page, hear, 'aria-pressed', 'true');
          yield* page.click(hear);
          yield* attributeIs(page, hear, 'aria-pressed', 'false');
          yield* page.click(`${section('Voice')} [data-act="record"]`);
          yield* waitFor(page, '[data-role="record"] [data-act="close-record"]');
          // The recorder opens on the beat the studio selects.
          yield* waitFor(page, '[data-role="record"] [data-beat="one"].selected');
          // A Sheet from the bottom on a phone, a Dialog on a laptop.
          yield* countIs(
            page,
            '[data-role="record"].st-record-sheet',
            Bool.match(size.viewport === PHONE, { onTrue: () => 1, onFalse: () => 0 }),
          );
          yield* page.click('[data-role="record"] [data-act="close-record"]');
          yield* countIs(page, '[data-role="record"]', 0);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'a take under way is never dropped by Close or Escape unasked: Keep goes on, Discard drops it',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:one' }),
            [
              route('GET', /^\/studio\/beats$/, () =>
                json({ film: PROBE, beats: [beat('one', 'staging', 'The ball climbs.')] }),
              ),
            ],
            true,
          );
          yield* openSection(page, 'Voice');
          yield* page.click(`${section('Voice')} [data-act="record"]`);
          const record = '[data-role="record"]';
          yield* waitFor(page, `${record} [data-act="arm"]`);
          // The count-in held on its first number: the take is under way, and no second passes.
          yield* page.clock.hold;
          yield* page.click(`${record} [data-act="arm"]`);
          yield* until(page, `/^recording in /.test(${RECORD_STATUS})`);
          const ask = `${record} [data-role="discard-ask"]`;
          yield* page.click(`${record} [data-act="close-record"]`);
          yield* textHas(page, ask, 'Stop and discard this take?');
          // Keep: the recorder stays over the page, counting in.
          yield* page.click(`${ask} [data-act="keep-take"]`);
          yield* countIs(page, ask, 0);
          yield* countIs(page, record, 1);
          yield* until(page, `/^recording in /.test(${RECORD_STATUS})`);
          // Escape asks the same.
          yield* page.press('Escape');
          yield* textHas(page, ask, 'Stop and discard this take?');
          yield* countIs(page, record, 1);
          // Discard: the take is dropped and the recorder shuts (the clock let go, its close
          // plays out); opened again, it is at rest.
          yield* page.click(`${ask} [data-act="discard-take"]`);
          yield* page.clock.release;
          yield* countIs(page, record, 0);
          yield* page.click(`${section('Voice')} [data-act="record"]`);
          yield* waitFor(page, `${record} [data-act="arm"]`);
          // At rest, Close shuts it at once.
          yield* page.click(`${record} [data-act="close-record"]`);
          yield* countIs(page, record, 0);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    // Serial: a phone's stroke is touches, which another tab's at the same time would drop.
    it.live.serial(
      'marks up a panel: a stroke and words saved as a tweak, filed on the panel and opened in Notes and asks',
      () =>
        Effect.gen(function* () {
          const { page, asked, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'panel:one.fall' }),
            [
              route('GET', /^\/board$/, () => json(boardWith(Option.some(1), false))),
              ...notesKept(['n9']),
            ],
          );
          const panel = `${section('Board')}[open] .st-panel[data-panel="one.fall"]`;
          yield* page.click(`${panel} [data-act="markup"]`);
          const markup = `${panel} .st-markup[data-try="1"]`;
          yield* waitFor(page, `${markup} .st-markup-over`);
          yield* page.click(`${markup} [aria-label="Pen"]`);
          yield* strokeOver(page, size.viewport, `${markup} .st-markup-over`);
          yield* countIs(page, `${markup} .lab-sketch-items > *`, 1);
          yield* page.fill(`${markup} .st-markup-text`, 'her hand lower');
          yield* attributeIs(page, `${markup} [data-asking="tweak"]`, 'aria-pressed', 'true');
          yield* page.click(`${markup} [data-act="save-markup"]`);
          yield* textHas(page, `${markup} [data-role="markup-said"]`, 'Saved n9');
          const sent = posted(asked, '/notes').map((b) =>
            Option.getOrUndefined(b),
          ) as ReadonlyArray<{
            readonly panel?: Json;
            readonly sketch?: ReadonlyArray<Json>;
            readonly text?: string;
            readonly still?: string;
          }>;
          expect(sent.map((b) => [b.panel, b.sketch?.length, b.text])).toEqual([
            [{ id: 'one.fall', try: 1, ask: 'tweak' }, 1, 'her hand lower'],
          ]);
          // Its still is the try with the marks over it, a PNG.
          expect(sent[0]?.still?.startsWith('iVBORw0KGgo')).toBe(true);
          // Filed: the panel lists it as a tweak, and a press opens it in Notes and asks.
          const listed = `${panel} .st-panel-note[data-note="n9"]`;
          yield* textHas(page, `${listed} .sh-badge`, 'n9 · tweak');
          yield* page.click(listed);
          yield* waitFor(page, `${section('Notes and asks')}[open] .st-note[data-note="n9"][open]`);
          yield* evaluates(page, `new URLSearchParams(location.search).get('note')`, 'n9');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "notes a line's words: Note says something, Correct says the words instead, Remove cuts them",
      () =>
        Effect.gen(function* () {
          const { page, asked, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:one' }),
            [
              // The script with the first beat's line, which the reader lays out a word at a time.
              route('GET', /^\/script$/, () =>
                json({
                  film: PROBE,
                  beats: [
                    {
                      id: 'one',
                      say: 'The ball {rise}rises slowly, and then it {fall}falls down again.',
                      cite: [],
                    },
                  ],
                }),
              ),
              ...notesKept(['n10', 'n11', 'n12']),
            ],
          );
          const words = `${section('Words')}[open]`;
          yield* page.click(
            `${words} .lab-script-beat[data-beat="one"] .lab-script-w[data-index="2"]`,
          );
          const note = `${words} [data-role="words-note"]`;
          yield* waitFor(page, note);
          // The words selected are the link's.
          yield* evaluates(page, `new URLSearchParams(location.search).get('words')`, '2-2');
          // A note that says nothing is not saved, and says why.
          yield* page.click(`${note} [data-act="save-words-note"]`);
          yield* textIs(page, `${note} [data-role="words-note-said"]`, 'Write the note first.');
          yield* page.fill(`${note} .st-words-text`, 'too quick');
          yield* page.click(`${note} [data-act="save-words-note"]`);
          yield* textIs(
            page,
            `${note} [data-role="words-note-said"]`,
            'Saved n10: it waits in Notes and asks.',
          );
          yield* page.click(`${note} [data-ask="correction"]`);
          yield* page.fill(`${note} [data-role="say-instead"]`, 'climbs');
          yield* page.click(`${note} [data-act="save-words-note"]`);
          yield* textIs(
            page,
            `${note} [data-role="words-note-said"]`,
            'Saved n11: an agent says the words you wrote instead.',
          );
          yield* page.click(`${note} [data-ask="removal"]`);
          yield* page.click(`${note} [data-act="save-words-note"]`);
          yield* textIs(
            page,
            `${note} [data-role="words-note-said"]`,
            'Saved n12: an agent cuts the words.',
          );
          const sent = posted(asked, '/notes').map((b) =>
            Option.getOrUndefined(b),
          ) as ReadonlyArray<{
            readonly words?: Json;
            readonly kind?: string;
            readonly replace?: string;
            readonly text?: string;
          }>;
          const rises = { beat: 'one', from: 2, to: 2, text: 'rises' };
          expect(
            sent.map((b) => [b.words, b.kind, Option.fromUndefinedOr(b.replace), b.text]),
          ).toEqual([
            [rises, 'note', Option.none(), 'too quick'],
            [rises, 'correction', Option.some('climbs'), 'say “climbs” for “rises”'],
            [rises, 'removal', Option.none(), 'remove “rises”'],
          ]);
          // Each lists in Notes and asks.
          yield* openSection(page, 'Notes and asks');
          yield* countIs(page, `${section('Notes and asks')} .st-note`, 3);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "a note's link selects its beat and opens it in Notes and asks",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { note: 'n4' }),
            [
              route('GET', /^\/notes$/, () =>
                json({
                  film: PROBE,
                  seq: 1,
                  notes: [noteOf('n4', 'two', 5.2, 'the ball sits too still', [])],
                }),
              ),
            ],
          );
          yield* waitFor(page, '.st-pane[data-beat="two"]');
          yield* waitFor(page, `${section('Notes and asks')}[open] .st-note[data-note="n4"][open]`);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "replies to a note on the beat, and opens an ask at its time on the ask's own page",
      () =>
        Effect.gen(function* () {
          let thread: ReadonlyArray<Json> = [];
          const note = () => noteOf('n4', 'two', 5.2, 'the ball sits too still', thread);
          const { page, asked, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:two' }),
            [
              route('GET', /^\/notes$/, () => json({ film: PROBE, seq: 1, notes: [note()] })),
              route('POST', /^\/notes\/n4\/reply$/, () => {
                thread = [
                  { seq: 2, by: 'user', text: 'still too still', at: '2026-10-16T00:01:00.000Z' },
                ];
                return json(note());
              }),
            ],
          );
          yield* waitFor(page, '.st-pane[data-beat="two"]');
          yield* openSection(page, 'Notes and asks');
          const shown = `${section('Notes and asks')} .st-note[data-note="n4"]`;
          yield* page.click(`${shown} > summary`);
          yield* page.fill(`${shown} .lab-reply-input`, 'still too still');
          yield* page.pressIn(`${shown} .lab-reply-input`, 'Enter');
          yield* textHas(page, `${shown} .lab-thread`, 'still too still');
          expect(posted(asked, '/notes/n4/reply')).toEqual([
            Option.some({ text: 'still too still' }),
          ]);
          // The ask filed at the beat's start opens its own page.
          const ask = `${section('Notes and asks')} a.st-ask[data-ask="${PROBE_ASK}"]`;
          yield* attributeIs(page, ask, 'href', pageHref.ask(PROBE_ASK));
          yield* page.click(ask);
          yield* until(page, `location.pathname === '${pageHref.ask(PROBE_ASK)}'`);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "shows a version kept in its own folder read only: its words and code not read, its Board's tries not kept",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { v: 1, sel: 'beat:one' }),
          );
          yield* waitFor(page, '.st-pane[data-beat="one"]');
          yield* textIs(
            page,
            '.st-pane .st-row[data-section="Words"][data-empty="true"] .st-n',
            'not read for past versions',
          );
          yield* countIs(page, '.st-pane .st-row[data-section="Code"][data-empty="true"]', 1);
          yield* openSection(page, 'Board');
          yield* textHas(page, `${section('Board')} .st-line`, 'read only');
          // A try pressed shows in the viewer, with no Keep and no markup: the film's own Board is
          // not this version's.
          const fall = `${section('Board')} .st-panel[data-panel="one.fall"]`;
          yield* page.click(`${fall} .st-try-btn[data-try="2"]`);
          yield* waitFor(page, `${fall} .st-try-shown[data-try="2"]`);
          yield* textHas(page, '.st-viewer .st-tag', 'one · try 2');
          yield* countIs(page, `${section('Board')} [data-act="keep"]`, 0);
          yield* countIs(page, `${section('Board')} [data-act="markup"]`, 0);
          yield* evaluates(
            page,
            `document.querySelector('.st-pane-head [data-act="approve"]')?.disabled ?? true`,
            true,
          );
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  });
