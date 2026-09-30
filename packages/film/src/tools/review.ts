// Review: the box's renders, served where they lie and compared in sync.
//
// Nothing is copied. Each review root (a checkout's `out/`, a scratchpad's
// montages) is read in place; a file is named by its ref, its root's label
// and its path under the root, so a route never takes a path on the box. The
// only files the review writes are derived ones (a frame, a 720p phone copy
// of a big video, a score option's mix) in its cache, keyed by the source's
// path and mtime (or, for a mix, its plan), each made once, whole or not at
// all (written beside its name, then renamed into place).
//
// Videos that share a folder and a clip name (`<clip>.<variant>[.share].mp4`)
// form one comparison set, a share copy standing in for its master; a set
// needs two variants, or a `review.json` entry for its clip. The manifest
// names, orders and annotates a folder's sets and may pull a variant, notes or
// docs from anywhere under the roots. What is in no set (renders, images,
// docs) is listed with the folder.

import {
  Array as Arr,
  Clock,
  Config,
  Context,
  Crypto,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Queue,
  Record as Rec,
  Ref,
  Schema,
  Semaphore,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import type {
  RenderChoice,
  RenderVariant,
  ReviewFile,
  ReviewFolder,
  ReviewIndex,
  ReviewManifest,
  ReviewVideo,
} from '../core/schema.ts';
import { ReviewManifestJson } from '../core/schema.ts';
import { ReviewFileUnknown, ReviewToolFailed } from './errors.ts';
import { hex } from './library.ts';
import { collectWithin, isNotFound } from './process.ts';

/** A folder the review reads, and the label its refs start with. */
export interface ReviewRoot {
  readonly label: string;
  readonly path: string;
}

export interface ReviewConfig {
  readonly roots: ReadonlyArray<ReviewRoot>;
  /** Where derived files are kept. */
  readonly cache: string;
  /** A video over this many bytes gets a 720p phone copy. */
  readonly phoneOver: number;
  /** A video over this many bytes (a master) is not reviewed: too big to stream. */
  readonly maxVideo: number;
  /** Whether phone copies are made in the background as the index finds big videos. */
  readonly phoneCopies: boolean;
}

export const PHONE_OVER = 40 * 1024 * 1024;
export const MAX_VIDEO = 600 * 1024 * 1024;
/** How long an index answers before the roots are read again. */
export const INDEX_FRESH = Duration.seconds(15);

const VIDEO = ['.mp4', '.webm'];
const IMAGE = ['.jpg', '.jpeg', '.png', '.webp'];
const DOC = ['.md', '.vtt', '.txt'];
/** Folders of working files a walk does not enter (dot-folders neither). */
const SKIP_DIRS = ['stills', 'frames', 'node_modules'];
/** How many folders deep a walk goes under a root. */
const MAX_DEPTH = 8;

type Kind = 'video' | 'image' | 'doc';
type PhoneState = ReviewVideo['phone'];

/** A file a walk found, where it lies. */
export interface Found {
  readonly path: string;
  readonly ref: string;
  readonly name: string;
  readonly size: number;
  readonly mtime: number;
}

/** What a file is to the review, by its name: `None` for anything it does not show. */
export const kindOf = (name: string): Option.Option<Kind> => {
  const lower = name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (lower.includes('.part.')) return Option.none();
  if (VIDEO.includes(ext)) return Option.some('video');
  if (IMAGE.includes(ext)) return Option.some('image');
  // A .txt is a doc only when it is a chapter list; the rest are logs.
  if (ext === '.txt' && !lower.includes('chapters')) return Option.none();
  if (DOC.includes(ext)) return Option.some('doc');
  return Option.none();
};

/** A video's name read as a set member. */
export interface NameParts {
  readonly clip: string;
  readonly variant: Option.Option<string>;
  /** A share copy (`.share.mp4`): it stands in for its master. */
  readonly share: boolean;
}

/**
 * `roof.A-current.share.mp4` is clip `roof`, variant `A-current`, a share
 * copy; `film.mp4` is clip `film` with no variant.
 */
export const splitName = (name: string): NameParts => {
  let stem = name;
  if (name.includes('.')) stem = name.slice(0, name.lastIndexOf('.'));
  const share = stem.endsWith('.share');
  if (share) stem = stem.slice(0, -'.share'.length);
  const first = stem.indexOf('.');
  if (first < 0) return { clip: stem, variant: Option.none(), share };
  return { clip: stem.slice(0, first), variant: Option.some(stem.slice(first + 1)), share };
};

const rootFrom = (entry: string, path: Path.Path): ReviewRoot => {
  const eq = entry.indexOf('=');
  if (eq > 0)
    return { label: entry.slice(0, eq).trim(), path: path.resolve(entry.slice(eq + 1).trim()) };
  const at = path.resolve(entry);
  return { label: path.basename(at), path: at };
};

/**
 * `FILM_REVIEW_ROOTS` read: comma-separated folders, each `label=path` or a
 * bare path (labelled by its folder's name, and its parent's too when that
 * collides). Blank entries are skipped.
 */
export const parseRoots = (text: string, path: Path.Path): ReadonlyArray<ReviewRoot> => {
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => rootFrom(entry, path));
  return entries.map((root, i) => {
    if (!entries.some((other, j) => j !== i && other.label === root.label)) return root;
    return { ...root, label: `${path.basename(path.dirname(root.path))}-${root.label}` };
  });
};

const within = (root: string, at: string, path: Path.Path) =>
  at === root || at.startsWith(`${root}${path.sep}`);

/** The ref of `file` under `roots`: the innermost root holding it. `None` outside them all. */
export const refOf = (
  roots: ReadonlyArray<ReviewRoot>,
  file: string,
  path: Path.Path,
): Option.Option<string> => {
  const at = path.resolve(file);
  const holding = roots
    .filter((root) => within(root.path, at, path))
    .toSorted((a, b) => b.path.length - a.path.length);
  return Option.map(Arr.head(holding), (root) => {
    const rel = path.relative(root.path, at).split(path.sep).join('/');
    if (rel.length === 0) return root.label;
    return `${root.label}/${rel}`;
  });
};

/** The path `ref` names under `roots`, when it names one inside its root. */
export const pathOf = (
  roots: ReadonlyArray<ReviewRoot>,
  ref: string,
  path: Path.Path,
): Option.Option<string> => {
  const [label = '', ...rest] = ref.split('/');
  if (ref.includes('\u0000')) return Option.none();
  return Option.flatMap(
    Arr.findFirst(roots, (root) => root.label === label),
    (root) =>
      Option.liftPredicate(path.resolve(root.path, ...rest), (at) => within(root.path, at, path)),
  );
};

const newestFirst = Order.mapInput(
  Order.flip(Order.Number),
  (f: { readonly mtime: number }) => f.mtime,
);

const fileOf = (found: Found): ReviewFile => ({
  ref: found.ref,
  name: found.name,
  size: found.size,
  mtime: found.mtime,
});

/** What one folder is made of: what a walk found in it, its manifest, and what the manifest names. */
export interface FolderParts {
  readonly ref: string;
  readonly found: ReadonlyArray<Found>;
  readonly manifest: Option.Option<ReviewManifest>;
  /** Files the manifest names, by the name it gives them (relative to the folder). */
  readonly named: ReadonlyMap<string, Found>;
  readonly phone: (video: Found) => PhoneState;
}

interface Member {
  readonly id: string;
  readonly found: Found;
}

type ManifestSet = ReviewManifest['sets'][string];

/** One comparison set from its members by name and what the manifest says of its clip. */
const setOf = (
  parts: FolderParts,
  clip: string,
  byName: ReadonlyArray<Member>,
  said: Option.Option<ManifestSet>,
): Option.Option<RenderChoice> => {
  const named = (name: string) => Option.fromUndefinedOr(parts.named.get(name));
  const metas: ManifestSet['variants'] = Option.match(said, {
    onNone: () => ({}),
    onSome: (s) => s.variants,
  });
  const pulled = Object.entries(metas).flatMap(([id, meta]) =>
    Option.toArray(
      Option.map(
        Option.filter(Option.flatMap(meta.file, named), () => !byName.some((v) => v.id === id)),
        (found): Member => ({ id, found }),
      ),
    ),
  );
  const members = [...byName, ...pulled];
  if (members.length === 0 || (members.length < 2 && Option.isNone(said))) return Option.none();
  const order: ReadonlyArray<string> = Option.match(said, {
    onNone: () => [],
    onSome: (s) => s.order,
  });
  const rank = (id: string) => {
    const at = order.indexOf(id);
    if (at < 0) return order.length;
    return at;
  };
  const variants = members
    .map((m): RenderVariant => {
      const meta = Rec.get(metas, m.id);
      return {
        id: m.id,
        label: Option.getOrElse(
          Option.flatMap(meta, (v) => v.label),
          () => m.id,
        ),
        tag: Option.flatMap(meta, (v) => v.tag),
        verdict: Option.flatMap(meta, (v) => v.verdict),
        notes: Option.map(
          Option.flatMap(
            Option.flatMap(meta, (v) => v.notes),
            named,
          ),
          fileOf,
        ),
        video: { ...fileOf(m.found), phone: parts.phone(m.found) },
      };
    })
    .toSorted((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  return Option.some({
    _tag: 'RenderChoice',
    clip,
    title: Option.getOrElse(
      Option.flatMap(said, (s) => s.title),
      () => clip,
    ),
    start: Option.match(said, { onNone: () => 0, onSome: (s) => s.start }),
    moments: Option.flatMap(said, (s) => s.moments),
    variants,
  });
};

/**
 * One folder as the review lists it: its sets (by name and by manifest), and
 * the videos, images and docs in no set, newest first. Pure.
 */
export const assembleFolder = (parts: FolderParts): ReviewFolder => {
  const ofKind = (kind: Kind) => parts.found.filter((f) => Option.contains(kindOf(f.name), kind));
  const video = (f: Found): ReviewVideo => ({ ...fileOf(f), phone: parts.phone(f) });
  const named = (name: string) => Option.fromUndefinedOr(parts.named.get(name));
  const sets = Option.match(parts.manifest, { onNone: () => ({}), onSome: (m) => m.sets });

  // A share copy stands in for its master.
  const videos = ofKind('video');
  const shared = new Set(
    videos.filter((v) => splitName(v.name).share).map((v) => v.name.replace('.share.', '.')),
  );
  const playable = videos.filter((v) => !shared.has(v.name));
  const members = playable.flatMap((found) => {
    const parts = splitName(found.name);
    return Option.toArray(
      Option.map(parts.variant, (id) => ({ clip: parts.clip, member: { id, found } })),
    );
  });
  const byClip = Arr.groupBy(members, (m) => m.clip);
  const clips = Arr.dedupe([...Object.keys(byClip), ...Object.keys(sets)]).toSorted();
  const choices = clips.flatMap((clip) => {
    const byName = Option.match(Rec.get(byClip, clip), {
      onNone: () => [],
      onSome: (ms) => ms.map((m) => m.member),
    });
    return Option.toArray(
      Option.map(setOf(parts, clip, byName, Rec.get(sets, clip)), (choice) => ({
        choice,
        paths: byName.map((m) => m.found.path),
      })),
    );
  });
  const inSet = new Set(choices.flatMap((c) => c.paths));
  const listed = Option.match(parts.manifest, { onNone: () => [], onSome: (m) => m.docs });
  const docs = [...ofKind('doc'), ...listed.flatMap((name) => Option.toArray(named(name)))];
  return {
    ref: parts.ref,
    title: Option.flatMap(parts.manifest, (m) => m.title),
    blurb: Option.flatMap(parts.manifest, (m) => m.blurb),
    mtime: Math.max(0, ...parts.found.map((f) => f.mtime)),
    sets: choices.map((c) => c.choice),
    videos: Arr.sort(
      playable.filter((v) => !inSet.has(v.path)),
      newestFirst,
    ).map(video),
    images: Arr.sort(ofKind('image'), newestFirst).map(fileOf),
    docs: Arr.sort(
      Arr.dedupeWith(docs, (a, b) => a.path === b.path),
      newestFirst,
    ).map(fileOf),
  };
};

/** The names a manifest gives files relative to its folder: variants, notes, docs. */
const namedIn = (manifest: ReviewManifest): ReadonlyArray<string> =>
  Arr.dedupe([
    ...manifest.docs,
    ...Object.values(manifest.sets).flatMap((set) =>
      Object.values(set.variants).flatMap((v) => [
        ...Option.toArray(v.file),
        ...Option.toArray(v.notes),
      ]),
    ),
  ]);

/** Whether a path under a root (its segments, relative) is one a walk looks at. */
const walked = (rel: string): boolean => {
  const segments = rel.split('/');
  const dirs = segments.slice(0, -1);
  if (dirs.length > MAX_DEPTH) return false;
  return !dirs.some((d) => d.startsWith('.') || SKIP_DIRS.includes(d));
};

export interface ReviewService {
  readonly roots: ReadonlyArray<ReviewRoot>;
  /** Every folder under the roots with something to review, newest first; read again when `fresh` or stale. */
  readonly index: (fresh: boolean) => Effect.Effect<ReviewIndex>;
  /** The file `ref` names: inside its root, there, a file. */
  readonly resolve: (ref: string) => Effect.Effect<string, ReviewFileUnknown>;
  /** A video's length in seconds (ffprobe), kept per path and mtime. */
  readonly duration: (ref: string) => Effect.Effect<number, ReviewFileUnknown | ReviewToolFailed>;
  /** A JPEG of the video at `at` seconds (10% in when none), `width` wide, from the cache. */
  readonly frame: (
    ref: string,
    at: Option.Option<number>,
    width: number,
  ) => Effect.Effect<string, ReviewFileUnknown | ReviewToolFailed>;
  /** The video's 720p phone copy, when it is made. */
  readonly phone: (ref: string) => Effect.Effect<Option.Option<string>, ReviewFileUnknown>;
  /**
   * A derived file in the cache at `name` (`mix/<key>.m4a`): there already, or
   * made once by `make` (into the temporary path it is given, renamed into
   * place when it succeeds). Concurrent asks for one name make it once.
   */
  readonly derive: <E, R>(
    name: string,
    make: (temporary: string) => Effect.Effect<void, E, R>,
  ) => Effect.Effect<string, E | ReviewToolFailed, R>;
  /** `ffmpeg <args>` to its end, failing as `ReviewToolFailed` on `ref`. */
  readonly ffmpeg: (
    ref: string,
    args: ReadonlyArray<string>,
    limit: Duration.Duration,
  ) => Effect.Effect<void, ReviewToolFailed>;
}

type Tool = ReviewToolFailed['tool'];

const PHONE_ARGS = [
  '-vf',
  'scale=-2:720',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '23',
  '-maxrate',
  '3000k',
  '-bufsize',
  '6000k',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-movflags',
  '+faststart',
];

const QUIET = ['-hide_banner', '-v', 'error', '-nostdin', '-y'];

export class Review extends Context.Service<Review, ReviewService>()('@bible/film/tools/Review') {
  static readonly layer = (config: ReviewConfig) =>
    Layer.effect(
      Review,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const crypto = yield* Crypto.Crypto;
        const roots = config.roots.map((root) => ({ ...root, path: path.resolve(root.path) }));
        const cacheFailed = (name: string) => (error: { readonly message: string }) =>
          ReviewToolFailed.make({ tool: 'cache', ref: name, reason: error.message });

        const keyOf = (parts: ReadonlyArray<string | number>) =>
          crypto.digest('SHA-1', new TextEncoder().encode(parts.join('|'))).pipe(
            Effect.map((bytes) => hex(bytes).slice(0, 20)),
            Effect.orDie,
          );

        const statOf = (file: string) =>
          fs.stat(file).pipe(
            Effect.map((info) => ({
              type: info.type,
              size: Number(info.size),
              mtime: Option.match(info.mtime, { onNone: () => 0, onSome: (d) => d.getTime() }),
            })),
            Effect.option,
          );

        const mtimeOf = (file: string) =>
          Effect.map(statOf(file), Option.match({ onNone: () => 0, onSome: (s) => s.mtime }));

        const foundAt = Effect.fn('Review.foundAt')(function* (file: string) {
          const ref = refOf(roots, file, path);
          const stat = yield* statOf(file);
          if (Option.isNone(ref) || Option.isNone(stat) || stat.value.type !== 'File')
            return Option.none<Found>();
          return Option.some<Found>({
            path: file,
            ref: ref.value,
            name: path.basename(file),
            size: stat.value.size,
            mtime: stat.value.mtime,
          });
        });

        const resolve = Effect.fn('Review.resolve')(function* (ref: string) {
          const unknown = ReviewFileUnknown.make({ ref });
          const at = pathOf(roots, ref, path);
          if (Option.isNone(at)) return yield* unknown;
          // A link out of the roots is not followed: its real path must lie under one too.
          const real = yield* fs.realPath(at.value).pipe(Effect.option);
          const realRoots = yield* Effect.forEach(roots, (root) =>
            fs.realPath(root.path).pipe(
              Effect.map((p) => ({ ...root, path: p })),
              Effect.orElseSucceed(() => root),
            ),
          );
          const inside = Option.exists(real, (r) => Option.isSome(refOf(realRoots, r, path)));
          const found = yield* foundAt(at.value);
          if (!inside || Option.isNone(found)) return yield* unknown;
          return at.value;
        });

        const run = (
          tool: Exclude<Tool, 'cache'>,
          ref: string,
          command: ChildProcess.Command,
          limit: Duration.Duration,
        ) =>
          collectWithin(spawner, tool, command, limit).pipe(
            Effect.mapError((error) => {
              let reason = error.message;
              if (error._tag === 'PlatformError' && isNotFound(error))
                reason = `${tool} is not on PATH`;
              return ReviewToolFailed.make({ tool, ref, reason });
            }),
            Effect.filterOrFail(
              (done) => done.exitCode === 0,
              (done) =>
                ReviewToolFailed.make({
                  tool,
                  ref,
                  reason: [done.stderr.trim(), `exit ${done.exitCode}`].filter(Boolean).join(': '),
                }),
            ),
            Effect.map((done) => done.stdout),
          );

        const ffmpeg = (ref: string, args: ReadonlyArray<string>, limit: Duration.Duration) =>
          run('ffmpeg', ref, ChildProcess.make('ffmpeg', [...QUIET, ...args]), limit).pipe(
            Effect.asVoid,
          );

        // One maker per name at a time: a second ask waits, then finds the file made.
        const locks = new Map<string, Semaphore.Semaphore>();
        const lockOf = (name: string) =>
          Option.getOrElse(Option.fromUndefinedOr(locks.get(name)), () => {
            const made = Semaphore.makeUnsafe(1);
            locks.set(name, made);
            return made;
          });

        const derive = <E, R>(
          name: string,
          make: (temporary: string) => Effect.Effect<void, E, R>,
        ): Effect.Effect<string, E | ReviewToolFailed, R> => {
          const out = path.join(config.cache, name);
          const ext = path.extname(name);
          const temporary = `${out.slice(0, out.length - ext.length)}.part${ext}`;
          const made = fs.exists(out).pipe(
            Effect.mapError(cacheFailed(name)),
            Effect.flatMap((there) => {
              if (there) return Effect.succeed(out);
              return fs.makeDirectory(path.dirname(out), { recursive: true }).pipe(
                Effect.mapError(cacheFailed(name)),
                Effect.andThen(
                  make(temporary).pipe(
                    Effect.onError(() => fs.remove(temporary, { force: true }).pipe(Effect.ignore)),
                  ),
                ),
                Effect.andThen(fs.rename(temporary, out).pipe(Effect.mapError(cacheFailed(name)))),
                Effect.tap(() => Effect.logDebug(`review.derived name=${name}`)),
                Effect.as(out),
              );
            }),
          );
          return Semaphore.withPermits(lockOf(name), 1)(made);
        };

        const durations = new Map<string, number>();
        const probe = Effect.fn('Review.probe')(function* (ref: string, file: string) {
          const out = yield* run(
            'ffprobe',
            ref,
            ChildProcess.make('ffprobe', [
              '-v',
              'error',
              '-show_entries',
              'format=duration',
              '-of',
              'csv=p=0',
              file,
            ]),
            Duration.seconds(30),
          );
          const seconds = Number(out.trim());
          if (!Number.isFinite(seconds) || seconds < 0 || out.trim().length === 0)
            return yield* ReviewToolFailed.make({
              tool: 'ffprobe',
              ref,
              reason: `no duration in "${out.trim()}"`,
            });
          return seconds;
        });

        const duration = Effect.fn('Review.duration')(function* (ref: string) {
          const file = yield* resolve(ref);
          const key = `${file}|${yield* mtimeOf(file)}`;
          const had = Option.fromUndefinedOr(durations.get(key));
          if (Option.isSome(had)) return had.value;
          const seconds = yield* probe(ref, file);
          durations.set(key, seconds);
          return seconds;
        });

        const sourceKey = Effect.fn('Review.sourceKey')(function* (
          file: string,
          rest: ReadonlyArray<string | number>,
        ) {
          return yield* keyOf([file, yield* mtimeOf(file), ...rest]);
        });

        const frame = Effect.fn('Review.frame')(function* (
          ref: string,
          at: Option.Option<number>,
          width: number,
        ) {
          const file = yield* resolve(ref);
          let t = 0;
          if (Option.isSome(at)) t = at.value;
          else t = (yield* duration(ref)) * 0.1;
          const w = Math.round(Math.min(1920, Math.max(160, width)));
          const key = yield* sourceKey(file, [t.toFixed(2), w]);
          const args = ['-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale=${w}:-2`];
          return yield* derive(`frames/${key}.jpg`, (temporary) =>
            ffmpeg(ref, [...args, '-q:v', '3', temporary], Duration.minutes(1)),
          );
        });

        const phonePath = (file: string) =>
          Effect.map(sourceKey(file, []), (key) => path.join(config.cache, 'phone', `${key}.mp4`));

        const isFile = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false));

        const phone = Effect.fn('Review.phone')(function* (ref: string) {
          const out = yield* phonePath(yield* resolve(ref));
          const there = yield* isFile(out);
          return Option.liftPredicate(out, () => there);
        });

        const phoneState = Effect.fn('Review.phoneState')(function* (video: Found) {
          if (video.size <= config.phoneOver) return 'none' satisfies PhoneState;
          const there = yield* isFile(yield* phonePath(video.path));
          if (there) return 'ready' satisfies PhoneState;
          return 'pending' satisfies PhoneState;
        });

        // Phone copies: one at a time, newest first, at low priority, in the background.
        const queue = yield* Queue.unbounded<Found>();
        const queued = new Set<string>();
        const makePhone = Effect.fn('Review.makePhone')(
          function* (video: Found) {
            const out = yield* phonePath(video.path);
            const name = path.relative(config.cache, out);
            const nice = ['-n', '15', 'ffmpeg', ...QUIET, '-i', video.path, ...PHONE_ARGS];
            yield* derive(name, (temporary) =>
              run(
                'ffmpeg',
                video.ref,
                ChildProcess.make('nice', [...nice, temporary]),
                Duration.minutes(30),
              ),
            );
            yield* Effect.log(`review.phone.made ref=${video.ref}`);
          },
          Effect.catchTag('ReviewToolFailed', (error) =>
            Effect.logWarning(`review.phone.failed reason="${error.message}"`),
          ),
        );
        const drain = Effect.forever(
          Effect.flatMap(Queue.take(queue), (video) =>
            makePhone(video).pipe(Effect.ensuring(Effect.sync(() => queued.delete(video.path)))),
          ),
        );
        if (config.phoneCopies) yield* Effect.forkScoped(drain);

        const enqueue = Effect.fn('Review.enqueue')(function* (videos: ReadonlyArray<Found>) {
          for (const video of Arr.sort(videos, newestFirst)) {
            if (queued.has(video.path)) continue;
            queued.add(video.path);
            yield* Queue.offer(queue, video);
          }
        });

        // Every file a walk looks at under a root, by folder.
        const walk = Effect.fn('Review.walk')(function* (root: ReviewRoot) {
          const names = yield* fs
            .readDirectory(root.path, { recursive: true })
            .pipe(Effect.orElseSucceed(() => []));
          const shown = names
            .map((rel) => rel.split(path.sep).join('/'))
            .filter((rel) => walked(rel) && Option.isSome(kindOf(path.basename(rel))));
          const found = yield* Effect.forEach(
            shown,
            (rel) => foundAt(path.join(root.path, ...rel.split('/'))),
            { concurrency: 16 },
          );
          const kept = found.flatMap(Option.toArray).filter((f) => {
            if (Option.contains(kindOf(f.name), 'video')) return f.size <= config.maxVideo;
            return true;
          });
          return Arr.groupBy(kept, (f) => path.dirname(f.path));
        });

        const readManifest = Effect.fn('Review.readManifest')(function* (dir: string) {
          const text = yield* fs.readFileString(path.join(dir, 'review.json')).pipe(Effect.option);
          if (Option.isNone(text)) return Option.none<ReviewManifest>();
          return yield* Schema.decodeEffect(ReviewManifestJson)(text.value).pipe(
            Effect.map(Option.some),
            Effect.catchTag('SchemaError', (error) =>
              Effect.logWarning(
                `review.manifest.invalid dir=${dir} reason="${error.message}"`,
              ).pipe(Effect.as(Option.none<ReviewManifest>())),
            ),
          );
        });

        const folderAt = Effect.fn('Review.folderAt')(function* (
          dir: string,
          found: ReadonlyArray<Found>,
        ) {
          const manifest = yield* readManifest(dir);
          const names = Option.match(manifest, { onNone: () => [], onSome: namedIn });
          const named = new Map<string, Found>();
          for (const name of names) {
            const at = yield* foundAt(path.resolve(dir, name));
            if (Option.isSome(at)) named.set(name, at.value);
          }
          const videos = [...found, ...named.values()].filter((f) =>
            Option.contains(kindOf(f.name), 'video'),
          );
          const phones = new Map<string, PhoneState>();
          for (const video of videos) phones.set(video.path, yield* phoneState(video));
          const pending = videos.filter((v) => phones.get(v.path) === 'pending');
          const folder = assembleFolder({
            ref: Option.getOrElse(refOf(roots, dir, path), () => dir),
            found,
            manifest,
            named,
            phone: (video) =>
              Option.getOrElse(Option.fromUndefinedOr(phones.get(video.path)), () => 'none'),
          });
          return { folder, pending };
        });

        const hasAny = (f: ReviewFolder) =>
          f.sets.length + f.videos.length + f.images.length + f.docs.length > 0;

        const read = Effect.fn('Review.read')(function* () {
          const walks = yield* Effect.forEach(roots, walk);
          const dirs = walks.flatMap((byDir) => Object.entries(byDir));
          const built = yield* Effect.forEach(dirs, ([dir, found]) => folderAt(dir, found));
          const folders = Arr.sort(
            built.map((b) => b.folder),
            newestFirst,
          ).filter(hasAny);
          if (config.phoneCopies) yield* enqueue(built.flatMap((b) => b.pending));
          yield* Effect.logDebug(`review.index.read folders=${folders.length}`);
          return { folders } satisfies ReviewIndex;
        });

        const cached = yield* Ref.make(
          Option.none<{ readonly at: number; readonly index: ReviewIndex }>(),
        );

        const index = Effect.fn('Review.index')(function* (fresh: boolean) {
          const now = yield* Clock.currentTimeMillis;
          const had = Option.filter(
            yield* Ref.get(cached),
            (c) => !fresh && now - c.at < Duration.toMillis(INDEX_FRESH),
          );
          if (Option.isSome(had)) return had.value.index;
          const made = yield* read();
          yield* Ref.set(cached, Option.some({ at: now, index: made }));
          return made;
        });

        return Review.of({ roots, index, resolve, duration, frame, phone, derive, ffmpeg });
      }),
    );

  /**
   * The review's config from the environment: `FILM_REVIEW_ROOTS` (see
   * `parseRoots`; the app's `defaults` when unset), then any
   * `FILM_REVIEW_EXTRA_ROOTS` beside them, `FILM_REVIEW_CACHE` (default
   * `~/.cache/film-review`) and `FILM_REVIEW_PHONE` (`off` makes no phone copies).
   */
  static readonly layerConfig = <R>(defaults: Effect.Effect<ReadonlyArray<ReviewRoot>, never, R>) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
        const given = yield* Config.option(Config.String('FILM_REVIEW_ROOTS'));
        const extra = yield* Config.String('FILM_REVIEW_EXTRA_ROOTS').pipe(Config.withDefault(''));
        const base = yield* Option.match(given, {
          onNone: () => defaults,
          onSome: (text) => Effect.succeed(parseRoots(text, path)),
        });
        const roots = [...base, ...parseRoots(extra, path)];
        const cache = yield* Config.String('FILM_REVIEW_CACHE').pipe(
          Config.withDefault(path.join(home, '.cache', 'film-review')),
        );
        const phone = yield* Config.String('FILM_REVIEW_PHONE').pipe(Config.withDefault('on'));
        return Review.layer({
          roots,
          cache,
          phoneOver: PHONE_OVER,
          maxVideo: MAX_VIDEO,
          phoneCopies: phone !== 'off',
        });
      }),
    );
}
