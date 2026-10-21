import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Context, Effect, FileSystem, Layer, Option } from 'effect';

import { SERIES } from '../../src/content.ts';
import { Address } from '../../src/mail/address.ts';
import { confirmLetter, filmLetter } from '../../src/mail/letters.ts';
import { layerOutbox, Mailer } from '../../src/mail/mailer.ts';
import { MAIL_PAGES, MAIL_ROUTES } from '../../src/mail/paths.ts';
import { PAGES } from '../../src/pages.ts';
import { FAILURE_LINE } from './doctor.ts';
import { readOutbox } from './outbox.ts';
import { agentStage, workersDevUrl } from './stage.ts';

const ORIGIN = 'http://127.0.0.1:8599';

/** The verify skill this app's helpers serve. */
const SKILL_DIR = `${import.meta.dir}/../../../../.claude/skills/verify-firsttheblade`;

/** A page or a list route written in a code span (`/subscribe/check`; `/series/<slug>` left out; `/about/` read as the page it redirects to). */
const SITE_PATH = /`(\/(?:subscribe|unsubscribe|series|privacy|about)[\w/-]*(?:[?#][^`<]*)?)`/g;

/** Every path the site serves a page or a list route at. */
const SITE_PATHS: ReadonlySet<string> = new Set([
  ...PAGES.map((page) => page.path),
  ...Object.values(MAIL_ROUTES),
  ...Object.values(MAIL_PAGES),
]);
const ann = Address.make('ann@example.com');
const ben = Address.make('ben@example.com');

const episode = {
  no: '01',
  title: 'A test film',
  youtubeId: 'test-video',
  published: '2026-11-01',
  summary: 'A summary for the test.',
};

/** The outbox directory a test writes to, made fresh and removed after it. */
class Outbox extends Context.Service<Outbox, string>()('test/Outbox') {}

const OutboxDir = Layer.effect(
  Outbox,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'verify-outbox-' });
    return `${dir}/outbox`;
  }),
);

/** The preview's own mailer, writing to that outbox. */
const OutboxLayer = Layer.unwrap(Effect.map(Effect.service(Outbox), layerOutbox)).pipe(
  Layer.provideMerge(OutboxDir),
  Layer.provideMerge(BunServices.layer),
);

/** A confirm letter and a film's letter, sent through the preview's mailer. */
const written = Effect.gen(function* () {
  const outbox = yield* Outbox;
  const series = yield* Effect.fromOption(Arr.head(SERIES));
  const film = { ref: `${series.id}/01`, series, episode };
  const mailer = yield* Mailer;
  yield* mailer.send(confirmLetter(ann, ORIGIN, 'confirm-token'));
  yield* mailer.send(filmLetter(ben, ORIGIN, film, 'leave-token'));
  return outbox;
});

describe('the verify helpers', () => {
  it.effect.layer(OutboxLayer)(
    'read the letters the preview writes, each with the link a person opens',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const letters = yield* readOutbox(yield* written);
          expect(letters.map(({ n, to, kind, link }) => ({ n, to, kind, link }))).toEqual([
            {
              n: 1,
              to: 'ann@example.com',
              kind: 'confirm',
              link: `${ORIGIN}/subscribe/confirm?token=confirm-token`,
            },
            {
              n: 2,
              to: 'ben@example.com',
              kind: 'film',
              link: `${ORIGIN}/unsubscribe?token=leave-token`,
            },
          ]);
          expect(letters[0]?.subject).toBe('Confirm your email for First the Blade');
        }),
      ),
  );

  it.effect.layer(BunServices.layer)('read an outbox not made yet as empty', () =>
    Effect.map(readOutbox('/nonexistent/verify-probe-outbox'), (letters) =>
      expect(letters).toEqual([]),
    ),
  );

  it.effect('take only a throwaway agent-<name> stage', () =>
    Effect.gen(function* () {
      expect(yield* agentStage('agent-ftb1')).toBe('agent-ftb1');
      for (const stage of ['prod', 'agent-', 'Agent-x', 'agent-x;prod', 'staging'])
        expect((yield* Effect.flip(agentStage(stage)))._tag).toBe('Refused');
    }),
  );

  it.effect('find the stage address an Alchemy run prints', () =>
    Effect.sync(() => {
      const log =
        'Site: https://firsttheblade-agent-x-site.cvr.workers.dev ready\nother https://example.com';
      expect(workersDevUrl(log)).toEqual(
        Option.some('https://firsttheblade-agent-x-site.cvr.workers.dev'),
      );
      expect(workersDevUrl('no address')).toEqual(Option.none());
    }),
  );

  it.effect.layer(BunServices.layer)("name only the site's own paths in the skill's docs", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const docs = yield* fs.readDirectory(SKILL_DIR, { recursive: true });
      const texts = yield* Effect.forEach(
        docs.filter((name) => name.endsWith('.md')),
        (name) => fs.readFileString(`${SKILL_DIR}/${name}`),
        { concurrency: 4 },
      );
      const named = texts.flatMap((text) =>
        Array.from(text.matchAll(SITE_PATH), (m) =>
          (m[1] ?? '').replace(/[?#].*$/, '').replace(/(.)\/$/, '$1'),
        ),
      );
      expect(named.length).toBeGreaterThan(10);
      expect(named.filter((path) => !SITE_PATHS.has(path))).toEqual([]);
    }),
  );

  it.effect("hold a preview log's failures, and only those", () =>
    Effect.sync(() => {
      const failures = [
        '[03:00:00.000] ERROR (#2): boom',
        '[mail] subscribe.unsent subscriber=1 reason=E_OUTBOX',
        '[mail] subscribe.failed reason=SqlError',
        'An unhandled defect',
      ];
      const fine = [
        '[03:00:00.000] INFO (#2): Listening on http://[::]:8582',
        '[mail] subscribe.mailed subscriber=1',
        '[mail] subscribe.quiet',
        '[mail] confirm.confirmed subscriber=1',
      ];
      expect(failures.filter((line) => FAILURE_LINE.test(line))).toEqual(failures);
      expect(fine.filter((line) => FAILURE_LINE.test(line))).toEqual([]);
    }),
  );
});
