// The counsel's sandbox: a program run under macOS's sandbox (`sandbox-exec`,
// a Seatbelt profile the kernel enforces on it and on every process it
// starts), where it reads only what it is handed of the user's. The profile
// allows the system a program runs on and the network (the counsel needs the
// internet), and closes every user's home, the system's temp folders and
// every other volume to reading: the repo, the films' out folders (an
// earlier judge's key among them), the caches and the owner's sessions are
// unreadable there, not merely unlisted. What stays readable is the system's
// own (`/System`, `/Library`, `/usr`, `/Applications`, `/opt`, `/etc` and
// the like, every path outside the closed folders), which holds no
// key or verdict. Inside the closed folders it opens only what the plan
// names, an allow-list: places to read, and places to write, each of which
// it reads too. It writes nowhere else (but `/dev`). A path's metadata (that
// it exists, its size) stays visible, so a program can resolve the paths it
// is handed; a file's bytes and a folder's listing do not. Pure: `profileOf`
// is the profile, tested for what it opens.

import { Array as Arr } from 'effect';

/**
 * What a sandboxed run may touch inside the closed folders, nothing it is
 * not given: each a folder and everything under it, by its real path.
 */
export interface SandboxPlan {
  /** Opened to read: the packet's folder, the program and what it reads to run. */
  readonly reads: ReadonlyArray<string>;
  /** Opened to read and write: the program's own state and temp files. */
  readonly writes: ReadonlyArray<string>;
}

/** What is closed to reading but where a plan opens it: every home, the temp folders, other volumes. */
const CLOSED: ReadonlyArray<string> = [
  '/Users',
  '/Volumes',
  '/private/tmp',
  '/private/var/folders',
  '/private/var/tmp',
];

/** `text` as an SBPL string: its backslashes and quotes escaped. */
const quoted = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** One rule over `folders`; none when there are none. */
const rule = (verdict: 'allow' | 'deny', ops: string, folders: ReadonlyArray<string>) =>
  Arr.match(folders, {
    onEmpty: () => [],
    onNonEmpty: (some) => [
      `(${verdict} ${ops} ${some.map((folder) => `(subpath ${quoted(folder)})`).join(' ')})`,
    ],
  });

/**
 * The Seatbelt profile that runs a program in `plan`'s sandbox. A later rule
 * wins over an earlier one it overlaps, so the order is the policy: allow
 * all, then write nowhere but `/dev`, read nothing closed, and open the
 * plan's reads and writes.
 */
const profileOf = (plan: SandboxPlan): string =>
  [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    '(allow file-write* (subpath "/dev"))',
    ...rule('deny', 'file-read-data', CLOSED),
    ...rule('allow', 'file-read-data', [...plan.reads, ...plan.writes]),
    ...rule('allow', 'file-write*', plan.writes),
  ].join('\n');

/** The argv that runs `command` in `plan`'s sandbox. */
export const sandboxArgs = (
  plan: SandboxPlan,
  command: ReadonlyArray<string>,
): ReadonlyArray<string> => ['sandbox-exec', '-p', profileOf(plan), ...command];
