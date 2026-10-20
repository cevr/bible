/**
 * The sampled instruments, each from its official repository at a pinned
 * commit, into `<cache>/instruments/<name>/` (outside git). Every file style
 * C reads is in `instruments.lock.json`: its raw URL at the commit, its size
 * and its sha256.
 *
 * - `lockInstruments` makes the lock once (`render --lock`): it reads each
 *   repository's tree at the commit from GitHub's API, picks the files (the
 *   whole of the paths below, plus each SFZ named and every sample it names),
 *   fetches what the cache lacks, and holds every file's git blob SHA-1 to
 *   the tree, so the lock is anchored to the commit, not only to bytes here.
 * - `fetchInstruments` reads only the lock: it keeps each file whose sha256
 *   matches, and downloads a missing or wrong one to a `.part` file, checks
 *   it, then renames it. It makes no GitHub API call.
 *
 * The `.ram.sfz` wrappers (`sfizz.ts`) sit beside their SFZ files and are
 * not in the lock.
 */

import { Effect, FileSystem, Path, Schema } from 'effect';
import { RenderFailed } from './proc.js';
import { sha256Hex } from './sfizz.js';

/** What the lock is made from: each instrument's repository, commit, licence and files. */
export const SOURCES = [
  {
    name: 'salamander',
    repo: 'sfzinstruments/SalamanderGrandPiano',
    commit: '3382bf9496bba2486f5ab0de55a264d1dfc38404',
    licence: 'CC BY 3.0 (Alexander Holm; SFZ remap by kinwie)',
    sfz: [],
    whole: ['Salamander Grand Piano V3.sfz', 'Data/', 'Samples/', 'LICENSE', 'README.md'],
  },
  {
    name: 'vsco',
    repo: 'sgossner/VSCO-2-CE',
    commit: '6dd651d55dde97fd4028699be9d4481f26917891',
    licence: 'CC0 1.0 (Versilian Studios: VS Chamber Orchestra 2 Community Edition)',
    sfz: ['ViolinEnsSusVib.sfz', 'ViolaEnsSusVib.sfz', 'CelloEnsSusVib.sfz', 'ContrabassSusNV.sfz'],
    whole: ['LICENSE'],
  },
] as const;

const LockFile = Schema.Struct({
  path: Schema.String,
  url: Schema.String,
  size: Schema.Int,
  sha256: Schema.String,
});

const LockInstrument = Schema.Struct({
  name: Schema.String,
  repo: Schema.String,
  commit: Schema.String,
  licence: Schema.String,
  files: Schema.Array(LockFile),
});

export const Lock = Schema.Struct({ instruments: Schema.Array(LockInstrument) });
export type Lock = typeof Lock.Type;
const LockJson = Schema.fromJsonString(Lock);

export const LOCK_FILE = 'instruments.lock.json';

/** A file's raw URL at the commit, each path segment escaped. */
export const rawUrl = (repo: string, commit: string, file: string) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${file.split('/').map(encodeURIComponent).join('/')}`;

/** Git's blob id of `bytes`: sha1 of `blob <length>\0` and the bytes. */
export const gitBlobSha1 = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha1');
  hasher.update(`blob ${bytes.byteLength}\0`);
  hasher.update(bytes);
  return hasher.digest('hex');
};

/** `a/b/../c` as `a/c`: a path from the repository root with its dots resolved. */
const normal = (file: string) => {
  const out: string[] = [];
  for (const part of file.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
};

/** Every sample an SFZ file names, from the repository root: `default_path` joined to each `sample=`. */
export const samplesOf = (sfzPath: string, text: string): string[] => {
  const base = sfzPath.includes('/') ? sfzPath.slice(0, sfzPath.lastIndexOf('/')) : '';
  let prefix = '';
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = (raw.split('//')[0] ?? '').trim();
    const defaultPath = /^default_path=(.*)$/.exec(line);
    if (defaultPath !== null) prefix = (defaultPath[1] ?? '').trim().replaceAll('\\', '/');
    const sample = /^sample=(.*)$/.exec(line);
    if (sample !== null)
      out.push(normal(`${base}/${prefix}${(sample[1] ?? '').trim().replaceAll('\\', '/')}`));
  }
  return out;
};

const fetchBytes = (url: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    catch: (cause) => RenderFailed.make({ step: `download ${url}`, reason: String(cause) }),
  });

const TreeEntry = Schema.Struct({
  path: Schema.String,
  type: Schema.String,
  sha: Schema.String,
  size: Schema.optionalKey(Schema.Int),
});
const Tree = Schema.fromJsonString(
  Schema.Struct({ truncated: Schema.Boolean, tree: Schema.Array(TreeEntry) }),
);

/** The cached file at `dest` when it is `size` bytes long and passes `ok`; else `url`'s bytes, through a `.part` file. */
const ensure = (dest: string, url: string, ok: (bytes: Uint8Array) => boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (yield* fs.exists(dest)) {
      const bytes = yield* fs.readFile(dest);
      if (ok(bytes)) return { bytes, fetched: false };
    }
    const bytes = yield* fetchBytes(url);
    if (!ok(bytes))
      return yield* RenderFailed.make({
        step: `instrument ${dest}`,
        reason: `the bytes from ${url} are not the pinned file`,
      });
    yield* fs.makeDirectory(path.dirname(dest), { recursive: true });
    yield* fs.writeFile(`${dest}.part`, bytes);
    yield* fs.rename(`${dest}.part`, dest);
    return { bytes, fetched: true };
  });

/** Makes `instruments.lock.json` beside this module from the repositories' trees (see the module's doc). */
export const lockInstruments = (cache: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const instruments = [];
    for (const source of SOURCES) {
      const response = yield* fetchBytes(
        `https://api.github.com/repos/${source.repo}/git/trees/${source.commit}?recursive=1`,
      );
      const tree = yield* Schema.decodeEffect(Tree)(new TextDecoder().decode(response)).pipe(
        Effect.mapError((error) =>
          RenderFailed.make({ step: `tree ${source.repo}`, reason: error.message }),
        ),
      );
      if (tree.truncated)
        return yield* RenderFailed.make({ step: `tree ${source.repo}`, reason: 'truncated' });
      const blobs = new Map(
        tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e] as const),
      );
      const wanted = new Set(
        [...blobs.keys()].filter((p) =>
          source.whole.some((w) => p === w || (w.endsWith('/') && p.startsWith(w))),
        ),
      );
      const root = path.join(cache, 'instruments', source.name);
      const blobOk = (file: string) => (bytes: Uint8Array) =>
        gitBlobSha1(bytes) === blobs.get(file)?.sha;
      for (const sfz of source.sfz) {
        const { bytes } = yield* ensure(
          path.join(root, sfz),
          rawUrl(source.repo, source.commit, sfz),
          blobOk(sfz),
        );
        wanted.add(sfz);
        for (const sample of samplesOf(sfz, new TextDecoder().decode(bytes))) {
          if (!blobs.has(sample))
            return yield* RenderFailed.make({
              step: `lock ${source.name}`,
              reason: `${sfz} names ${sample}, which the tree lacks`,
            });
          wanted.add(sample);
        }
      }
      const files = [];
      for (const file of [...wanted].sort()) {
        const url = rawUrl(source.repo, source.commit, file);
        const { bytes } = yield* ensure(path.join(root, file), url, blobOk(file));
        files.push({ path: file, url, size: bytes.byteLength, sha256: sha256Hex(bytes) });
      }
      yield* Effect.logInfo(`lock ${source.name}: ${files.length} files`);
      instruments.push({
        name: source.name,
        repo: source.repo,
        commit: source.commit,
        licence: source.licence,
        files,
      });
    }
    const text = yield* Schema.encodeEffect(LockJson)({ instruments }).pipe(Effect.orDie);
    const pretty = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    yield* fs.writeFileString(path.join(import.meta.dir, LOCK_FILE), pretty);
    return instruments.reduce((n, i) => n + i.files.length, 0);
  });

/** The lock's text and its parse. */
export const readLock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(import.meta.dir, LOCK_FILE));
  const lock = yield* Schema.decodeEffect(LockJson)(text).pipe(
    Effect.mapError((error) => RenderFailed.make({ step: LOCK_FILE, reason: error.message })),
  );
  return { text, lock };
});

/** Every locked file in the cache with its pinned sha256: answers how many were downloaded. */
export const fetchInstruments = (cache: string, lock: Lock) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    let fetched = 0;
    for (const instrument of lock.instruments) {
      const root = path.join(cache, 'instruments', instrument.name);
      for (const file of instrument.files) {
        const got = yield* ensure(
          path.join(root, file.path),
          file.url,
          (bytes) => bytes.byteLength === file.size && sha256Hex(bytes) === file.sha256,
        );
        if (got.fetched) fetched++;
      }
    }
    return fetched;
  });
