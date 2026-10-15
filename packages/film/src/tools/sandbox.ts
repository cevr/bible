// The counsel's sandbox: a program run under macOS's sandbox (`sandbox-exec`,
// a Seatbelt profile the kernel enforces on it and on every process it
// starts), where it reads only what it is handed. The profile allows the
// system a program runs on and the network (the counsel needs the internet),
// and closes every user's home, the system's temp folders and every other
// volume to reading: the repo, the films' out folders (an earlier judge's key
// among them), the caches and the owner's sessions are unreadable there, not
// merely unlisted. Inside the closed folders it opens what the plan names: the
// packet's folder and the program's own files to read, its answer's folder
// and its own state to write. It writes nowhere else (but `/dev`). What the
// plan hides stays unreadable even inside a folder it opens. A path's
// metadata (that it exists, its size) stays visible, so a program can resolve
// the paths it is handed; a file's bytes and a folder's listing do not. Pure:
// `profileOf` is the profile, tested for what it opens.

import { Array as Arr } from 'effect';

/** One rule's paths: a folder and everything under it, or every path that starts so. */
type Place =
  | { readonly _tag: 'Tree'; readonly path: string }
  | { readonly _tag: 'Prefix'; readonly path: string };

/** What a sandboxed run may touch inside the closed folders. */
export interface SandboxPlan {
  /** Opened to read: the packet's folder, the program and what it reads to run. */
  readonly reads: ReadonlyArray<Place>;
  /** Opened to read and write: the answer's folder, the program's own state. */
  readonly writes: ReadonlyArray<Place>;
  /** Unreadable and unwritten even inside an opened place: other sessions, history. */
  readonly hidden: ReadonlyArray<Place>;
}

/** What is closed to reading but where a plan opens it: every home, the temp folders, other volumes. */
export const CLOSED: ReadonlyArray<Place> = [
  { _tag: 'Tree', path: '/Users' },
  { _tag: 'Tree', path: '/Volumes' },
  { _tag: 'Tree', path: '/private/tmp' },
  { _tag: 'Tree', path: '/private/var/folders' },
  { _tag: 'Tree', path: '/private/var/tmp' },
];

/** `text` as an SBPL string's body: its backslashes and quotes escaped. */
const quoted = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** `text` as a regex matching it literally, for a `Prefix`. */
const literally = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** `place` as an SBPL filter. */
const filterOf = (place: Place): string => {
  if (place._tag === 'Tree') return `(subpath ${quoted(place.path)})`;
  return `(regex ${quoted(`^${literally(place.path)}`)})`;
};

/** One rule over `places`; none when there are none. */
const rule = (verdict: 'allow' | 'deny', ops: string, places: ReadonlyArray<Place>) =>
  Arr.match(places, {
    onEmpty: () => [],
    onNonEmpty: (some) => [`(${verdict} ${ops} ${some.map(filterOf).join(' ')})`],
  });

/**
 * The Seatbelt profile that runs a program in `plan`'s sandbox. A later rule
 * wins over an earlier one it overlaps, so the order is the policy: allow
 * all, then write nowhere but `/dev`, read nothing closed, open the plan's
 * reads and writes, and hide what it hides.
 */
export const profileOf = (plan: SandboxPlan): string =>
  [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    '(allow file-write* (subpath "/dev"))',
    ...rule('deny', 'file-read-data', CLOSED),
    ...rule('allow', 'file-read-data', [...plan.reads, ...plan.writes]),
    ...rule('allow', 'file-write*', plan.writes),
    ...rule('deny', 'file-read-data file-write*', plan.hidden),
  ].join('\n');

/** The argv that runs `command` in `plan`'s sandbox. */
export const sandboxArgs = (
  plan: SandboxPlan,
  command: ReadonlyArray<string>,
): ReadonlyArray<string> => ['sandbox-exec', '-p', profileOf(plan), ...command];
