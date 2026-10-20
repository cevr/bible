/**
 * The sampler: sfizz_render 1.2.3, built from its release tarball (pinned by
 * sha256) with `sfizz-render-float.patch` (pinned by sha256), which makes it
 * write 32-bit float WAV. As released it truncates to 16 bits, which leaves
 * a quiet stem (the contrabass sits near −45 LUFS before levelling) grainy.
 *
 * The build lands in `<cache>/sfizz-1.2.3-<patch sha8>/`, so a changed patch
 * builds anew. Two flags make 1.2.3 build on macOS 27's clang: arm64 is
 * named `aarch64` (sfizz's `arm.*` match would give it 32-bit ARM flags),
 * and atomic_queue's `template` keyword without an argument list is a
 * warning, not an error. A compiler that still refuses fails with its own
 * words: no other sfizz stands in.
 *
 * Each instrument is loaded whole before the first note (a wrapper SFZ with
 * `hint_ram_based=1` beside it). Streamed, sfizz reads each sample past its
 * preload on a background thread, and an offline render that outpaces the
 * loader plays a note short: two renders of one stem differed by up to
 * 24 dB in the first notes. Loaded whole, they are bit-identical.
 */

import { Effect, FileSystem, Path } from 'effect';
import { RenderFailed, run, runOk } from './proc.js';
import type { Style } from './style.js';

export const SFIZZ = {
  version: '1.2.3',
  url: 'https://github.com/sfztools/sfizz/releases/download/1.2.3/sfizz-1.2.3.tar.gz',
  sha256: 'a9339eac7620d7f0f6b44bdfe860680fab73e66efad4b5f15b21198dd9436822',
  patch: 'sfizz-render-float.patch',
  patchSha256: 'ca0c7c64d444f9c47f36ff254d27efd14acb4d062a5d575204ce01cc56ca7aa4',
} as const;

export const sha256Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
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

/** cmake and a C++ compiler, or a failure naming what is missing. */
const toolsPresent = Effect.gen(function* () {
  const missing: string[] = [];
  for (const tool of ['cmake', 'c++', 'tar', 'patch']) {
    const found = yield* run('/bin/sh', ['-c', `command -v ${tool}`]);
    if (found.code !== 0) missing.push(tool);
  }
  if (missing.length > 0)
    return yield* RenderFailed.make({
      step: 'sfizz build',
      reason: `missing ${missing.join(', ')}`,
    });
});

/** The patched sfizz_render, built once into the cache: its path and its sha256. */
export const sfizzBinary = (cache: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const patchFile = path.join(import.meta.dir, SFIZZ.patch);
    const patch = yield* fs.readFile(patchFile);
    if (sha256Hex(patch) !== SFIZZ.patchSha256)
      return yield* RenderFailed.make({
        step: 'sfizz build',
        reason: `${SFIZZ.patch} is not the pinned patch (sha256 ${sha256Hex(patch)}); pin its new sha256 in sfizz.ts`,
      });
    const root = path.join(cache, `sfizz-${SFIZZ.version}-${SFIZZ.patchSha256.slice(0, 8)}`);
    const binary = path.join(root, 'bin', 'sfizz_render');
    if (!(yield* fs.exists(binary))) {
      yield* toolsPresent;
      const tarball = path.join(cache, `sfizz-${SFIZZ.version}.tar.gz`);
      if (!(yield* fs.exists(tarball))) {
        const bytes = yield* fetchBytes(SFIZZ.url);
        yield* fs.writeFile(`${tarball}.part`, bytes);
        yield* fs.rename(`${tarball}.part`, tarball);
      }
      const sum = sha256Hex(yield* fs.readFile(tarball));
      if (sum !== SFIZZ.sha256)
        return yield* RenderFailed.make({
          step: 'sfizz build',
          reason: `${tarball} has sha256 ${sum}, not the release's ${SFIZZ.sha256}`,
        });
      const src = path.join(root, 'src');
      const tree = path.join(src, `sfizz-${SFIZZ.version}`);
      yield* fs.makeDirectory(src, { recursive: true });
      if (!(yield* fs.exists(path.join(tree, '.patched')))) {
        yield* runOk('sfizz unpack', 'tar', ['-xzf', tarball, '-C', src]);
        yield* runOk('sfizz patch', 'patch', ['-p1', '-i', patchFile], tree);
        yield* fs.writeFileString(path.join(tree, '.patched'), '');
      }
      const build = path.join(tree, 'build');
      yield* runOk('sfizz configure', 'cmake', [
        '-S',
        tree,
        '-B',
        build,
        '-DCMAKE_BUILD_TYPE=Release',
        `-DPROJECT_SYSTEM_PROCESSOR=${process.arch === 'arm64' ? 'aarch64' : process.arch}`,
        '-DENABLE_LTO=OFF',
        '-DSFIZZ_JACK=OFF',
        '-DSFIZZ_RENDER=ON',
        '-DSFIZZ_SHARED=OFF',
        '-DPLUGIN_LV2=OFF',
        '-DPLUGIN_VST3=OFF',
        '-DPLUGIN_AU=OFF',
        '-DPLUGIN_PUREDATA=OFF',
        '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
        '-DCMAKE_CXX_FLAGS=-Wno-missing-template-arg-list-after-template-kw',
      ]);
      yield* runOk('sfizz build', 'nice', [
        '-n',
        '10',
        'cmake',
        '--build',
        build,
        '-j2',
        '--target',
        'sfizz_render',
      ]);
      yield* fs.makeDirectory(path.dirname(binary), { recursive: true });
      yield* fs.copyFile(path.join(build, 'library', 'bin', 'sfizz_render'), binary);
      yield* fs.chmod(binary, 0o755);
    }
    return { binary, sha256: sha256Hex(yield* fs.readFile(binary)) };
  });

/** The wrapper beside `sfz` that loads every sample into RAM before the first note. */
export const ramSfz = (instruments: string, sfz: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = path.join(instruments, sfz);
    const wrapper = path.join(path.dirname(source), `${path.basename(source, '.sfz')}.ram.sfz`);
    const text = `<control>\nhint_ram_based=1\n#include "${path.basename(source)}"\n`;
    const current = yield* fs.readFileString(wrapper).pipe(Effect.orElseSucceed(() => ''));
    if (current !== text) yield* fs.writeFileString(wrapper, text);
    return wrapper;
  });

/** What one sampler run did: its peak resident memory in bytes and its wall time in seconds. */
export interface SamplerRun {
  readonly rss: number;
  readonly seconds: number;
}

/**
 * One stem through the sampler, under `/usr/bin/time -l` (its peak memory)
 * and `nice -n 10`: `midi` to the float WAV `wav`.
 */
export const sample = (
  binary: string,
  sfz: string,
  midi: string,
  wav: string,
  style: Pick<Style, 'rate' | 'sfizz'>,
) =>
  Effect.gen(function* () {
    const started = performance.now();
    const out = yield* runOk(`sfizz ${wav}`, '/usr/bin/time', [
      '-l',
      'nice',
      '-n',
      '10',
      binary,
      '--sfz',
      sfz,
      '--midi',
      midi,
      '--wav',
      wav,
      '-s',
      String(style.rate),
      '-q',
      String(style.sfizz.quality),
      '-p',
      String(style.sfizz.polyphony),
      '-b',
      String(style.sfizz.block),
    ]);
    const rss = /(\d+)\s+maximum resident set size/.exec(out.stderr);
    if (rss === null)
      return yield* RenderFailed.make({
        step: `sfizz ${wav}`,
        reason: 'time -l gave no maximum resident set size',
      });
    return { rss: Number(rss[1]), seconds: (performance.now() - started) / 1000 };
  });
