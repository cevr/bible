// Review: the box's renders, served where they lie and compared in sync.
//
// Nothing is copied. Each review root (a checkout's `out/`, a scratchpad's
// montages) is read in place, and a folder is listed only by the record that
// says what its files are; nothing reads a file's name back:
//
// - a film's project folder by its catalogue (`catalogue.json`,
//   `core/catalogue.ts`): each address's renders are one comparison set, a
//   variant each, with the owner's approval as its verdict; stills, sheets
//   and captions are listed with the folder. A film's whole-film renders are
//   also the pictures its options are heard against (`pictures`);
// - a montage by its manifest (`review.json`): the sets, variants, videos,
//   images and docs it names. A variant with no `file` is
//   `<clip>.<id>.share.mp4`, else `<clip>.<id>.mp4`, beside it.
//
// A file is named by its ref, its root's label and its path under the root,
// so a route never takes a path on the box, and a ref answers only a file the
// index lists. The only files the review writes are derived ones (a frame, a
// 720p phone copy of a big video, a score option's mix) in its cache, keyed
// by the source's path and mtime (or, for a mix, its plan), each made once,
// whole or not at all (written beside its name, then renamed into place).
// Lengths, frames and phone copies are the Media service's (`media.ts`).

import {
  Array as Arr,
  Cache,
  Clock,
  Config,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Queue,
  Record as Rec,
  Ref,
  Schema,
} from 'effect';
import { addressKey } from '../core/address.ts';
import {
  type Catalogue,
  CatalogueJson,
  MAIN_VARIANT,
  type Render,
  approvalState,
  commentsOn,
  renderPointId,
  saidOn,
  subjectOf,
} from '../core/catalogue.ts';
import { type ChoicePoint, type ChoiceVariant, pointId, seenVariants } from '../core/choice.ts';
import type {
  ReviewFile,
  ReviewFolder,
  ReviewIndex,
  ReviewManifest,
  ReviewVideo,
} from '../core/review.ts';
import { ReviewManifestJson } from '../core/review.ts';
import { type MediaFailed, ReviewFileUnknown, ReviewToolFailed } from './errors.ts';
import { CATALOGUE_FILE } from './catalogue.ts';
import { cacheKey } from './digest.ts';
import { Media } from './media.ts';

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

/** Folders of working files a walk does not enter (dot-folders neither). */
const SKIP_DIRS = ['stills', 'frames', 'node_modules'];
/** How many folders deep a walk goes under a root. */
const MAX_DEPTH = 8;

type PhoneState = ReviewVideo['phone'];

/** A file a walk found, where it lies. */
export interface Found {
  readonly path: string;
  readonly ref: string;
  readonly name: string;
  readonly size: number;
  readonly mtime: number;
}

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

/** The record files a walk finds: a project's catalogue, a montage's manifest. */
const MANIFEST_FILE = 'review.json';

/** What one folder is made of: its ref, its record, and the files its record names as found. */
export interface FolderParts<A> {
  readonly ref: string;
  readonly record: A;
  /** A file the record names (relative to the folder), when it is there. */
  readonly look: (name: string) => Option.Option<Found>;
  readonly phone: (video: Found) => PhoneState;
  /** A video over this many bytes (a master) is not listed: too big to stream. */
  readonly maxVideo: number;
}

const found = <A>(parts: FolderParts<A>, names: ReadonlyArray<string>) =>
  names.flatMap((name) => Option.toArray(parts.look(name)));

/** The first of `names` there, as a video small enough to stream. */
const videoOf = <A>(
  parts: FolderParts<A>,
  names: ReadonlyArray<string>,
): Option.Option<ReviewVideo> =>
  Option.map(
    Arr.findFirst(found(parts, names), (f) => f.size <= parts.maxVideo),
    (f) => ({ ...fileOf(f), phone: parts.phone(f) }),
  );

const newestFiles = (files: ReadonlyArray<Found>): ReadonlyArray<ReviewFile> =>
  Arr.sort(
    Arr.dedupeWith(files, (a, b) => a.path === b.path),
    newestFirst,
  ).map(fileOf);

const newestMtime = (files: ReadonlyArray<Found>) => Math.max(0, ...files.map((f) => f.mtime));

/** Every file a render names, relative to its project folder. */
const renderFiles = (render: Render): ReadonlyArray<string> => [
  ...Option.toArray(render.files.clip),
  ...Option.toArray(render.files.share),
  ...Option.toArray(render.files.captions),
  ...Option.toArray(render.files.chapters),
  ...render.files.images,
];

/** Every file a catalogue names, relative to its project folder. */
export const namesInProject = (catalogue: Catalogue): ReadonlyArray<string> =>
  Arr.dedupe(catalogue.renders.flatMap(renderFiles));

/** A render's video as the review plays it: its share copy, standing in for its master. */
const renderVideo = (parts: FolderParts<Catalogue>, render: Render) =>
  videoOf(parts, [...Option.toArray(render.files.share), ...Option.toArray(render.files.clip)]);

/** Where an address's set sits in its project: the film, then by film time, then the shorts. */
const placeOf = (render: Render): readonly [number, number] => {
  if (render.address._tag === 'Film') return [0, 0];
  if (render.address._tag === 'Short') return [2, 0];
  return [1, Option.match(render.span, { onNone: () => 0, onSome: (s) => s.from })];
};

/** An address as a set's title: `film`, `act cold open`, `scene cold`, `scenes a, b`, `short verdict`. */
const addressTitle = (render: Render): string => {
  const address = render.address;
  if (address._tag === 'Film') return 'film';
  if (address._tag === 'Act') return `act ${address.act}`;
  if (address._tag === 'Short') return `short ${address.id}`;
  if (address.ids.length === 1) return `scene ${address.ids[0]}`;
  return `scenes ${address.ids.join(', ')}`;
};

/** `n` and `noun`, plural but for one. */
const counted = (n: number, noun: string) =>
  `${n} ${noun}${Arr.filter(['s'], () => n !== 1).join('')}`;

/** What a render is, in a line: its size, its commit, and what was said of it. */
const renderTag = (catalogue: Catalogue, render: Render): string => {
  const said = commentsOn(catalogue, subjectOf(render)).length;
  return [
    `scale ${render.settings.scale}`,
    ...Option.toArray(Option.map(render.stamp.commit, (c) => c.slice(0, 7))),
    ...Arr.filter([counted(said, 'comment')], () => said > 0),
  ].join(' · ');
};

/**
 * A film's project folder as the review lists it, from its catalogue: one
 * render choice point per address its videos draw (the film, then acts and
 * scenes in film order, then shorts), a variant per render (`main` first)
 * with the owner's approval and comments on it; its stills, sheets and
 * captions with the folder. A variant's state is `current`: it is the render
 * its stamp says it is (whether that is current against the film's sources
 * now is the project's, read in a fresh process). Pure.
 */
export const projectFolder = (parts: FolderParts<Catalogue>): ReviewFolder => {
  const catalogue = parts.record;
  const videos = catalogue.renders.filter((r) => r.kind === 'video');
  const byAddress = Arr.groupBy(videos, (r) => addressKey(r.address));
  const sets = Object.entries(byAddress)
    .map(([key, renders]) => ({ key, renders, place: placeOf(renders[0]) }))
    .toSorted(
      (a, b) => a.place[0] - b.place[0] || a.place[1] - b.place[1] || a.key.localeCompare(b.key),
    )
    .flatMap(({ renders }): ReadonlyArray<ChoicePoint> => {
      const variants = renders
        .toSorted(
          (a, b) =>
            Number(b.variant === MAIN_VARIANT) - Number(a.variant === MAIN_VARIANT) ||
            a.variant.localeCompare(b.variant),
        )
        .flatMap((render) =>
          Option.toArray(
            Option.map(renderVideo(parts, render), (video): ChoiceVariant => ({
              id: render.variant,
              label: render.variant,
              lines: [renderTag(catalogue, render)],
              state: 'current',
              picked: false,
              verbs: [],
              media: { _tag: 'Seen', video },
              key: render.stamp.key,
              approval: approvalState(catalogue, subjectOf(render)),
              comments: saidOn(catalogue, subjectOf(render)),
              notes: Option.none(),
            })),
          ),
        );
      if (variants.length === 0) return [];
      return [
        {
          id: renderPointId(renders[0].address),
          kind: 'render',
          address: Option.some(renders[0].address),
          title: addressTitle(renders[0]),
          lines: [],
          start: 0,
          moments: Option.none(),
          marks: [],
          knob: Option.none(),
          variants,
        },
      ];
    });
  const all = found(parts, namesInProject(catalogue));
  const approved = catalogue.renders.filter(
    (r) => approvalState(catalogue, subjectOf(r)) === 'approved',
  );
  return {
    ref: parts.ref,
    title: Option.some(catalogue.film),
    blurb: Option.some(
      `${counted(catalogue.renders.length, 'render')}, ${approved.length} approved`,
    ),
    mtime: newestMtime(all),
    sets,
    videos: [],
    images: newestFiles(
      found(
        parts,
        catalogue.renders.flatMap((r) => r.files.images),
      ),
    ),
    docs: newestFiles(
      found(
        parts,
        catalogue.renders.flatMap((r) => [
          ...Option.toArray(r.files.captions),
          ...Option.toArray(r.files.chapters),
        ]),
      ),
    ),
  };
};

type ManifestSet = ReviewManifest['sets'][string];

/** A set's variant ids: its order first, then the rest it describes, by name. */
const variantIds = (set: ManifestSet): ReadonlyArray<string> =>
  Arr.dedupe([...set.order, ...Object.keys(set.variants).toSorted()]);

/** The files a manifest variant may be, first first: its `file`, else its share copy, then its master. */
const variantNames = (clip: string, id: string, set: ManifestSet): ReadonlyArray<string> =>
  Option.match(
    Option.flatMap(Rec.get(set.variants, id), (v) => v.file),
    {
      onSome: (file) => [file],
      onNone: () => [`${clip}.${id}.share.mp4`, `${clip}.${id}.mp4`],
    },
  );

/** Every file a manifest names (or may, for a variant with no `file`), relative to its folder. */
export const namesInMontage = (manifest: ReviewManifest): ReadonlyArray<string> =>
  Arr.dedupe([
    ...manifest.docs,
    ...manifest.images,
    ...manifest.videos,
    ...Object.entries(manifest.sets).flatMap(([clip, set]) =>
      variantIds(set).flatMap((id) => [
        ...variantNames(clip, id, set),
        ...Option.toArray(Option.flatMap(Rec.get(set.variants, id), (v) => v.notes)),
      ]),
    ),
  ]);

/**
 * A montage as the review lists it, from its manifest: its sets (in clip
 * order) as render choice points at no address of a film, each variant it
 * names with its tag and verdict as its lines, and the videos, images and
 * docs it names, newest first. A variant whose video is not there is left
 * out. Pure.
 */
export const montageFolder = (parts: FolderParts<ReviewManifest>): ReviewFolder => {
  const manifest = parts.record;
  const sets = Object.entries(manifest.sets)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .flatMap(([clip, set]): ReadonlyArray<ChoicePoint> => {
      const variants = variantIds(set).flatMap((id) => {
        const meta = Rec.get(set.variants, id);
        return Option.toArray(
          Option.map(videoOf(parts, variantNames(clip, id, set)), (video): ChoiceVariant => ({
            id,
            label: Option.getOrElse(
              Option.flatMap(meta, (v) => v.label),
              () => id,
            ),
            lines: [
              ...Option.toArray(Option.flatMap(meta, (v) => v.tag)),
              ...Option.toArray(Option.flatMap(meta, (v) => v.verdict)),
            ],
            state: 'current',
            picked: false,
            verbs: [],
            media: { _tag: 'Seen', video },
            key: video.ref,
            approval: 'none',
            comments: [],
            notes: Option.map(
              Option.flatMap(
                Option.flatMap(meta, (v) => v.notes),
                parts.look,
              ),
              fileOf,
            ),
          })),
        );
      });
      if (variants.length === 0) return [];
      return [
        {
          id: pointId('render', clip),
          kind: 'render',
          address: Option.none(),
          title: Option.getOrElse(set.title, () => clip),
          lines: [],
          start: set.start,
          moments: set.moments,
          marks: [],
          knob: Option.none(),
          variants,
        },
      ];
    });
  const videos = found(parts, manifest.videos).filter((f) => f.size <= parts.maxVideo);
  return {
    ref: parts.ref,
    title: manifest.title,
    blurb: manifest.blurb,
    mtime: newestMtime(found(parts, namesInMontage(manifest))),
    sets,
    videos: Arr.sort(videos, newestFirst).map((f) => ({ ...fileOf(f), phone: parts.phone(f) })),
    images: newestFiles(found(parts, manifest.images)),
    docs: newestFiles(found(parts, manifest.docs)),
  };
};

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
  /**
   * `film`'s whole-film renders under the roots, newest first, by its
   * project folders' catalogues: the pictures its options are heard against.
   */
  readonly pictures: (film: string) => Effect.Effect<ReadonlyArray<ReviewVideo>>;
  /** The file `ref` names: inside its root, there, a file the index lists. */
  readonly resolve: (ref: string) => Effect.Effect<string, ReviewFileUnknown>;
  /** A video's length in seconds (its container's index), kept per path and mtime. */
  readonly duration: (ref: string) => Effect.Effect<number, ReviewFileUnknown | MediaFailed>;
  /** A JPEG of the video at `at` seconds (10% in when none), `width` wide, from the cache. */
  readonly frame: (
    ref: string,
    at: Option.Option<number>,
    width: number,
  ) => Effect.Effect<string, ReviewFileUnknown | ReviewToolFailed | MediaFailed>;
  /** The video's 720p phone copy, when it is made. */
  readonly phone: (ref: string) => Effect.Effect<Option.Option<string>, ReviewFileUnknown>;
  /**
   * A derived file in the cache at `name` (`mix/<key>.m4a`): there already, or
   * made by `make` (into the temporary path it is given, renamed into place
   * when it succeeds). One maker per name at a time: a caller that may be
   * asked twice at once runs it through `once`.
   */
  readonly derive: <E, R>(
    name: string,
    make: (temporary: string) => Effect.Effect<void, E, R>,
  ) => Effect.Effect<string, E | ReviewToolFailed, R>;
}

/**
 * `effect` run once per `key` in `running` (a FiberMap in the service's
 * scope): an ask while it runs joins it, and a caller that stops waiting
 * leaves it running. The map drops a fiber when it ends.
 */
export const once = <K, A, E>(
  running: FiberMap.FiberMap<K, A, E>,
  key: K,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.flatMap(FiberMap.get(running, key), (had) =>
    Option.match(had, {
      onSome: Fiber.join,
      onNone: () => Effect.flatMap(FiberMap.run(running, key, effect), Fiber.join),
    }),
  );

/** How long a cache keeps what it read: for good once it is read, a failed read not at all. */
export const keptWhenMade = <A, E>(exit: Exit.Exit<A, E>): Duration.Duration =>
  Exit.match(exit, { onFailure: () => Duration.zero, onSuccess: () => Duration.infinity });

/** A file as it stands: its path and mtime, the key of what is read from it. */
class AtMtime extends Data.Class<{ readonly file: string; readonly mtime: number }> {}

/** How many lengths the review keeps: every video a long review shows, with room. */
const LENGTHS_KEPT = 4096;

/** Every file ref a folder of the index lists: its sets' videos and notes, and what is in no set. */
const refsIn = (folder: ReviewFolder): ReadonlyArray<string> => [
  ...folder.sets.flatMap((set) => [
    ...seenVariants(set).map((seen) => seen.video.ref),
    ...set.variants.flatMap((v) => Option.toArray(Option.map(v.notes, (n) => n.ref))),
  ]),
  ...[...folder.videos, ...folder.images, ...folder.docs].map((f) => f.ref),
];

export class Review extends Context.Service<Review, ReviewService>()('@bible/film/tools/Review') {
  static readonly layer = (config: ReviewConfig) =>
    Layer.effect(
      Review,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const media = yield* Media;
        const roots = config.roots.map((root) => ({ ...root, path: path.resolve(root.path) }));
        const cacheFailed = (name: string) => (error: { readonly message: string }) =>
          ReviewToolFailed.make({ tool: 'cache', ref: name, reason: error.message });

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

        /** Whether the index lists `ref`: as it stands, or read again once when it does not. */
        const listed = Effect.fn('Review.listed')(function* (ref: string) {
          const lists = (index: ReviewIndex) =>
            index.folders.some((folder) => refsIn(folder).includes(ref));
          if (lists(yield* Effect.suspend(() => index(false)))) return true;
          return lists(yield* Effect.suspend(() => index(true)));
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
          if (!(yield* listed(ref))) return yield* unknown;
          return at.value;
        });

        const derive = <E, R>(
          name: string,
          make: (temporary: string) => Effect.Effect<void, E, R>,
        ): Effect.Effect<string, E | ReviewToolFailed, R> => {
          const out = path.join(config.cache, name);
          const ext = path.extname(name);
          const temporary = `${out.slice(0, out.length - ext.length)}.part${ext}`;
          return fs.exists(out).pipe(
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
        };

        /** Each video's length, by path and mtime, the newest kept; a failed read is not. */
        const lengths = yield* Cache.makeWith((at: AtMtime) => media.duration(at.file), {
          capacity: LENGTHS_KEPT,
          timeToLive: keptWhenMade,
        });

        const duration = Effect.fn('Review.duration')(function* (ref: string) {
          const file = yield* resolve(ref);
          return yield* Cache.get(lengths, new AtMtime({ file, mtime: yield* mtimeOf(file) }));
        });

        /** The frames being made, by name: a scrub that asks for one twice makes it once. */
        const framing = yield* FiberMap.make<string, string, ReviewToolFailed | MediaFailed>();

        const sourceKey = Effect.fn('Review.sourceKey')(function* (
          file: string,
          rest: ReadonlyArray<string | number>,
        ) {
          return cacheKey([file, yield* mtimeOf(file), ...rest]);
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
          const key = yield* sourceKey(file, [t.toFixed(3), w]);
          const name = `frames/${key}.jpg`;
          return yield* once(
            framing,
            name,
            derive(name, (temporary) => media.still(file, t, w, temporary)),
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
            yield* derive(name, (temporary) => media.phoneCopy(video.path, temporary));
            yield* Effect.log(`review.phone.made ref=${video.ref}`);
          },
          Effect.catchTags({
            ReviewToolFailed: (error) =>
              Effect.logWarning(`review.phone.failed reason="${error.message}"`),
            MediaFailed: (error) =>
              Effect.logWarning(`review.phone.failed reason="${error.message}"`),
          }),
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

        /** Every record a walk finds under a root: a project's catalogue, a montage's manifest. */
        const walk = Effect.fn('Review.walk')(function* (root: ReviewRoot) {
          const names = yield* fs
            .readDirectory(root.path, { recursive: true })
            .pipe(Effect.orElseSucceed(() => []));
          return names
            .map((rel) => rel.split(path.sep).join('/'))
            .filter((rel) => walked(rel))
            .filter((rel) => [CATALOGUE_FILE, MANIFEST_FILE].includes(rel.split('/').at(-1) ?? ''))
            .map((rel) => path.join(root.path, ...rel.split('/')));
        });

        /** A record decoded, or none (with a warning) when it does not. */
        const decodeRecord = <A>(file: string, codec: Schema.Codec<A, string>) =>
          fs.readFileString(file).pipe(
            Effect.flatMap(Schema.decodeEffect(codec)),
            Effect.asSome,
            Effect.catch((error) =>
              Effect.as(
                Effect.logWarning(`review.record.invalid file=${file} reason="${error.message}"`),
                Option.none<A>(),
              ),
            ),
          );

        /** The files `names` (relative to `dir`) as found there, and each video's phone state. */
        const lookIn = Effect.fn('Review.lookIn')(function* (
          dir: string,
          names: ReadonlyArray<string>,
        ) {
          const byName = new Map<string, Found>();
          for (const name of names) {
            const at = yield* foundAt(path.resolve(dir, name));
            if (Option.isSome(at)) byName.set(name, at.value);
          }
          const phones = new Map<string, PhoneState>();
          for (const file of byName.values())
            if (!phones.has(file.path)) phones.set(file.path, yield* phoneState(file));
          const pending = [...byName.values()].filter(
            (f) => phones.get(f.path) === 'pending' && f.size <= config.maxVideo,
          );
          const parts = {
            ref: Option.getOrElse(refOf(roots, dir, path), () => dir),
            look: (name: string) => Option.fromUndefinedOr(byName.get(name)),
            phone: (video: Found) =>
              Option.getOrElse(
                Option.fromUndefinedOr(phones.get(video.path)),
                () => 'none' as const,
              ),
            maxVideo: config.maxVideo,
          };
          return { parts, pending };
        });

        /** A folder the index lists by its record, the videos waiting for phone copies, and its film's pictures. */
        const folderAt = Effect.fn('Review.folderAt')(function* (file: string) {
          const dir = path.dirname(file);
          if (path.basename(file) === CATALOGUE_FILE) {
            const catalogue = yield* decodeRecord(file, CatalogueJson);
            if (Option.isNone(catalogue)) return Option.none();
            const record = catalogue.value;
            const { parts, pending } = yield* lookIn(dir, namesInProject(record));
            const pictures = record.renders
              .filter((r) => r.kind === 'video' && r.address._tag === 'Film')
              .flatMap((r) =>
                Option.toArray(
                  Option.map(renderVideo({ ...parts, record }, r), (video) => ({
                    video,
                    at: r.at,
                  })),
                ),
              );
            return Option.some({
              folder: projectFolder({ ...parts, record }),
              pending,
              film: Option.some(record.film),
              pictures,
            });
          }
          // A project folder's own manifest is not a montage.
          const project = yield* fs
            .exists(path.join(dir, CATALOGUE_FILE))
            .pipe(Effect.orElseSucceed(() => false));
          if (project) return Option.none();
          const manifest = yield* decodeRecord(file, ReviewManifestJson);
          if (Option.isNone(manifest)) return Option.none();
          const record = manifest.value;
          const { parts, pending } = yield* lookIn(dir, namesInMontage(record));
          return Option.some({
            folder: montageFolder({ ...parts, record }),
            pending,
            film: Option.none<string>(),
            pictures: [],
          });
        });

        const hasAny = (f: ReviewFolder) =>
          f.sets.length + f.videos.length + f.images.length + f.docs.length > 0;

        /** What a read of the roots found: the index, and each film's pictures, newest first. */
        interface Read {
          readonly index: ReviewIndex;
          readonly pictures: ReadonlyMap<string, ReadonlyArray<ReviewVideo>>;
        }

        const read = Effect.fn('Review.read')(function* () {
          const records = (yield* Effect.forEach(roots, walk)).flat();
          const built = (yield* Effect.forEach(records, folderAt)).flatMap(Option.toArray);
          const folders = Arr.sort(
            built.map((b) => b.folder),
            newestFirst,
          ).filter(hasAny);
          if (config.phoneCopies) yield* enqueue(built.flatMap((b) => b.pending));
          // Newest render first, across every project folder of the film.
          const byFilm = Arr.groupBy(
            built.flatMap((b) =>
              Option.toArray(b.film).flatMap((film) => b.pictures.map((p) => ({ film, ...p }))),
            ),
            (p) => p.film,
          );
          const pictures = new Map(
            Object.entries(byFilm).map(([film, found]) => [
              film,
              found.toSorted((x, y) => y.at - x.at).map((p) => p.video),
            ]),
          );
          yield* Effect.logDebug(`review.index.read folders=${folders.length}`);
          return { index: { folders }, pictures } satisfies Read;
        });

        const cached = yield* Ref.make(Option.none<{ readonly at: number; readonly read: Read }>());

        const current = Effect.fn('Review.current')(function* (fresh: boolean) {
          const now = yield* Clock.currentTimeMillis;
          const had = Option.filter(
            yield* Ref.get(cached),
            (c) => !fresh && now - c.at < Duration.toMillis(INDEX_FRESH),
          );
          if (Option.isSome(had)) return had.value.read;
          const made = yield* read();
          yield* Ref.set(cached, Option.some({ at: now, read: made }));
          return made;
        });

        const index = Effect.fn('Review.index')(function* (fresh: boolean) {
          return (yield* current(fresh)).index;
        });

        const pictures = Effect.fn('Review.pictures')(function* (film: string) {
          return (yield* current(false)).pictures.get(film) ?? [];
        });

        return Review.of({ roots, index, pictures, resolve, duration, frame, phone, derive });
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
