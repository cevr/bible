import { describe, expect, test } from 'bun:test';
import { Array as Arr, Match, Option, Result, Schema } from 'effect';
import { type ChoicePoint, type ChoiceVariant, pointHead } from './choice.ts';
import {
  Entry,
  type ProductionFile,
  ProductionFile as ProductionFileSchema,
  type Said,
  currentOf,
  moveForward,
  newProduction,
  productionsOf,
  unfiledOf,
  versionAt,
  withFiled,
  withSaid,
} from './production.ts';
import { VersionMoved } from './refusals.ts';
import type { ReviewFolder } from './review.ts';

/** One production's history, as the front door lays it out (`productionsOf`). */
const historyOf = (
  production: string,
  ledger: Option.Option<ProductionFile>,
  folders: ReadonlyArray<ReviewFolder>,
) =>
  Option.getOrThrow(
    Arr.findFirst(
      productionsOf(Option.toArray(ledger), folders),
      (h) => h.production === production,
    ),
  );

const HOUR = 3_600_000;

const variant = (id: string, approved = false): ChoiceVariant => ({
  id,
  label: id,
  lines: [],
  state: 'current',
  staleBy: Option.none(),
  picked: false,
  verbs: [],
  media: { _tag: 'Unseen' },
  key: id,
  approval: Match.value(approved).pipe(
    Match.when(true, (): 'approved' => 'approved'),
    Match.orElse((): 'none' => 'none'),
  ),
  comments: [],
  notes: Option.none(),
});

const choice = (clip: string, variants: ReadonlyArray<ChoiceVariant>): ChoicePoint => ({
  ...pointHead({ _tag: 'Montage', clip }),
  address: Option.none(),
  title: clip,
  lines: [],
  start: 0,
  moments: Option.none(),
  marks: [],
  knob: Option.none(),
  variants,
});

/** A set folder under the `p5` root, its newest file written at `mtime`. */
const folder = (name: string, mtime: number, more: Partial<ReviewFolder> = {}): ReviewFolder => ({
  ref: `p5/${name}`,
  title: Option.some(name),
  blurb: Option.none(),
  mtime,
  sets: [],
  videos: [],
  images: [],
  docs: [],
  ...more,
});

/** The look: v1 opened at 0, v2 at 10 h, v3 at 20 h. */
const look = (): ProductionFile => {
  const first = { ...newProduction('look', 'The look', 0), title: 'The look' };
  const v2 = Result.getOrThrow(
    moveForward(first, { after: 1, title: 'K1', because: Option.some('i like k1') }, 10 * HOUR),
  );
  return Result.getOrThrow(
    moveForward(v2, { after: 2, title: '9005', because: Option.some('i like 9005') }, 20 * HOUR),
  );
};

describe('a production moves forward', () => {
  test('a new version opens after the one the mover saw, numbered by its place', () => {
    const file = look();
    expect(file.versions.map((v) => v.title)).toEqual(['v1', 'K1', '9005']);
    expect(file.versions[2]?.because).toEqual(Option.some('i like 9005'));
  });

  test('a mover who saw an older version is refused with the version now', () => {
    const moved = moveForward(
      look(),
      { after: 2, title: 'late', because: Option.none() },
      30 * HOUR,
    );
    expect(Result.isFailure(moved)).toBe(true);
    const refusal = Result.match(moved, {
      onFailure: Option.some,
      onSuccess: () => Option.none<VersionMoved>(),
    });
    expect(Option.getOrThrow(refusal)).toBeInstanceOf(VersionMoved);
    expect(Option.map(refusal, (r) => r.current)).toEqual(Option.some(3));
  });

  test('a version is never opened before the one before it', () => {
    const file = Result.getOrThrow(
      moveForward(look(), { after: 3, title: 'clock behind', because: Option.none() }, 5 * HOUR),
    );
    expect(file.versions[3]?.at).toBe(20 * HOUR);
  });

  test('the ledger refuses versions out of order', () => {
    const bad = {
      production: 'look',
      title: 'The look',
      versions: [
        { at: 10, title: 'v1' },
        { at: 5, title: 'v2' },
      ],
    };
    expect(() => Schema.decodeUnknownSync(ProductionFileSchema)(bad)).toThrow(/no earlier/);
  });

  test('the version open at a time is the last opened at or before it', () => {
    const file = look();
    expect(versionAt(file, -1)).toBe(1);
    expect(versionAt(file, 9 * HOUR)).toBe(1);
    expect(versionAt(file, 10 * HOUR)).toBe(2);
    expect(versionAt(file, 99 * HOUR)).toBe(3);
  });
});

describe('a production’s history', () => {
  test('a set lands in the version open when it was published, or the one it names', () => {
    const folders = [
      folder('styles', 1 * HOUR, { production: 'look', published: 12 * HOUR }),
      folder('concepts', 21 * HOUR, { production: 'look' }),
      folder('late-for-v2', 25 * HOUR, { production: 'look', version: 2 }),
      folder('brand', 3 * HOUR, { production: 'brand' }),
    ];
    const history = historyOf('look', Option.some(look()), folders);
    const sets = history.versions.map((v) =>
      v.entries.filter(Entry.$is('Published')).map((e) => e.folder.ref),
    );
    // Newest version first.
    expect(sets).toEqual([['p5/concepts'], ['p5/late-for-v2', 'p5/styles'], []]);
    expect(history.versions[0]?.current).toBe(true);
    expect(history.versions[1]?.until).toEqual(Option.some(20 * HOUR));
  });

  test('a set the ledger files lands in its version, and one no root holds is missing', () => {
    const file = withFiled(withFiled(look(), { set: 'cast', version: 2 }), {
      set: 'trashed',
      version: 1,
    });
    const history = historyOf('look', Option.some(file), [folder('cast', 50 * HOUR)]);
    const v2 = history.versions.find((v) => v.n === 2);
    const v1 = history.versions.find((v) => v.n === 1);
    expect(v2?.entries.map((e) => e._tag)).toEqual(['Published']);
    expect(v1?.entries).toEqual([expect.objectContaining({ _tag: 'Missing', set: 'trashed' })]);
  });

  test('a set that names another production is never filed into this one', () => {
    const file = withFiled(look(), { set: 'brand', version: 1 });
    const history = historyOf('look', Option.some(file), [
      folder('brand', HOUR, { production: 'brand' }),
    ]);
    expect(history.versions.flatMap((v) => v.entries.map((e) => e._tag))).toEqual(['Missing']);
  });

  test('the owner’s words land in the version open when they were said', () => {
    const said: Said = {
      _tag: 'Decided',
      at: 15 * HOUR,
      text: 'K1-minimal over Paper Theatre',
      quote: Option.some('minimal when it comes to k1'),
      set: Option.none(),
      point: Option.none(),
      variant: Option.none(),
    };
    const history = historyOf('look', Option.some(withSaid(look(), said)), []);
    expect(history.versions.find((v) => v.n === 2)?.entries).toEqual([
      expect.objectContaining({ _tag: 'Said', said }),
    ]);
  });

  test('a choice waits on the owner until a variant is approved or a decision names it', () => {
    const open = choice('cold', [variant('9005'), variant('9006')]);
    const approved = choice('heads', [variant('a', true), variant('b')]);
    const single = choice('one', [variant('only')]);
    const decided = choice('subtitles', [variant('clean'), variant('punchy')]);
    const set = folder('rbf-rive', 25 * HOUR, {
      production: 'look',
      sets: [open, approved, single, decided],
    });
    const file = withSaid(look(), {
      _tag: 'Decided',
      at: 26 * HOUR,
      text: 'clean',
      quote: Option.none(),
      set: Option.some('rbf-rive'),
      point: Option.some(decided.id),
      variant: Option.some('clean'),
    });
    const history = historyOf('look', Option.some(file), [set]);
    expect(currentOf(history).waiting.map((w) => w.point.id)).toEqual([open.id]);
    // Only the current version's choices wait.
    expect(history.versions.slice(1).every((v) => v.waiting.length === 0)).toBe(true);
  });

  test('a production only its sets name has one version, open since the start', () => {
    const history = historyOf('brand', Option.none(), [
      folder('brand', HOUR, { production: 'brand' }),
    ]);
    expect(history.kept).toBe(false);
    expect(history.versions.map((v) => v.n)).toEqual([1]);
    expect(history.latest).toBe(HOUR);
  });

  test('every production is listed newest first, and the front door keeps only the unfiled', () => {
    const folders = [
      folder('brand', 100 * HOUR, { production: 'brand' }),
      folder('styles', 12 * HOUR, { production: 'look' }),
      folder('loose', 5 * HOUR),
    ];
    const histories = productionsOf([look()], folders);
    expect(histories.map((h) => h.production)).toEqual(['brand', 'look']);
    expect(unfiledOf(histories, folders).map((f) => f.ref)).toEqual(['p5/loose']);
  });
});
