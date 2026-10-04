// The counsel's sandbox: a program run where it can read only what it is
// handed, by bubblewrap (`bwrap`, a mount namespace an unprivileged user may
// make). The sandbox starts empty: nothing of the machine is there unless a
// mount puts it there, so the repo, the films' out folders (an earlier
// judge's key among them), the caches, the real `/tmp` and every home are
// simply absent, not hidden by a rule a program could get round. What is
// there: the system a program runs on (`/usr` and its merged links, `/etc`
// for names and TLS, the resolver's stub folder), a fresh `/proc`, `/dev`
// and `/tmp`, the packet's folder read-only at `SEEN.packet` (the working
// folder), a folder the program writes at `SEEN.answer`, and the mounts
// the program itself needs (`SandboxPlan.mounts`). The network is shared:
// the counsel needs the internet, so a service on this machine's loopback
// (the lab at :8229) stays reachable, though nothing in the sandbox says it
// is there. The environment is cleared but for what the plan sets. Pure:
// `sandboxArgs` is bwrap's argv, tested for what it mounts.

/** Where the sandbox shows what it is handed. */
export const SEEN = {
  /** The packet's folder, read-only: the program's working folder. */
  packet: '/judge/packet',
  /** The folder the program writes its answer in. */
  answer: '/judge/answer',
  /** The program's home: empty but for what a plan mounts in it. */
  home: '/judge/home',
  /** The program's PATH folder: the commands a plan links there. */
  bin: '/judge/bin',
  /** Where a plan mounts the programs it runs. */
  tools: '/judge/tools',
} as const;

/** One mount: a host path read-only (or there only if it exists), one written, a link, an empty folder. */
export type Mount =
  | {
      readonly _tag: 'Read';
      readonly from: string;
      readonly to: string;
      readonly optional: boolean;
    }
  | { readonly _tag: 'Write'; readonly from: string; readonly to: string }
  | { readonly _tag: 'Link'; readonly target: string; readonly to: string }
  | { readonly _tag: 'Empty'; readonly to: string };

/** What a sandboxed run is handed: its packet's folder, its answer's folder, its own mounts and environment. */
interface SandboxPlan {
  readonly packet: string;
  readonly answer: string;
  readonly mounts: ReadonlyArray<Mount>;
  readonly env: Readonly<Record<string, string>>;
}

/** The system a program runs on, and nothing of anyone's. */
const SYSTEM: ReadonlyArray<Mount> = [
  { _tag: 'Read', from: '/usr', to: '/usr', optional: false },
  // Links into /usr on a merged system, folders of their own on another.
  ...['/bin', '/sbin', '/lib', '/lib64'].map((dir): Mount => ({
    _tag: 'Read',
    from: dir,
    to: dir,
    optional: true,
  })),
  // Names, TLS roots and users; `/etc/resolv.conf` may link into the resolver's folder.
  { _tag: 'Read', from: '/etc', to: '/etc', optional: false },
  { _tag: 'Read', from: '/run/systemd/resolve', to: '/run/systemd/resolve', optional: true },
];

/** `mount` as bwrap's words. */
const mountArgs = (mount: Mount): ReadonlyArray<string> => {
  if (mount._tag === 'Read') {
    if (mount.optional) return ['--ro-bind-try', mount.from, mount.to];
    return ['--ro-bind', mount.from, mount.to];
  }
  if (mount._tag === 'Write') return ['--bind', mount.from, mount.to];
  if (mount._tag === 'Link') return ['--symlink', mount.target, mount.to];
  return ['--tmpfs', mount.to];
};

/** bwrap's argv that runs `command` in `plan`'s sandbox, from `SEEN.packet`. */
export const sandboxArgs = (
  plan: SandboxPlan,
  command: ReadonlyArray<string>,
): ReadonlyArray<string> => [
  // Its own namespaces but the network; gone with its parent; no way back to the terminal.
  '--unshare-all',
  '--share-net',
  '--die-with-parent',
  '--new-session',
  ...SYSTEM.flatMap(mountArgs),
  '--proc',
  '/proc',
  '--dev',
  '/dev',
  '--tmpfs',
  '/tmp',
  ...mountArgs({ _tag: 'Read', from: plan.packet, to: SEEN.packet, optional: false }),
  ...mountArgs({ _tag: 'Write', from: plan.answer, to: SEEN.answer }),
  ...plan.mounts.flatMap(mountArgs),
  '--clearenv',
  ...Object.entries(plan.env).flatMap(([name, value]) => ['--setenv', name, value]),
  '--chdir',
  SEEN.packet,
  '--',
  ...command,
];
