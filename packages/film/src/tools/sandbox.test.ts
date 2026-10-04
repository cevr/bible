// The counsel's sandbox as bwrap's argv: it mounts the system, the packet's
// folder read-only as the working folder, the answer's folder, and exactly
// what okra's counsel needs (its program, Codex's package, Node, Codex's
// sign-in, settings and model lists); never a home, the repo, a cache or the
// host's /tmp. Its environment is cleared but for its own PATH and HOME, and
// it runs okra with the prompt and the output folder as the sandbox shows them.

import { describe, expect, it } from 'bun:test';
import { okraRun } from './counsel.ts';
import { SEEN, sandboxArgs } from './sandbox.ts';

const home = '/home/someone';
const tools = {
  okra: `${home}/src/okra/bin/okra`,
  codex: `${home}/.bun/install/global/node_modules/@openai/codex/bin/codex.js`,
  node: `${home}/.local/share/node/v24.11.1/bin/node`,
};
const run = okraRun(tools, home);
const argv = sandboxArgs(
  { packet: '/tmp/judge-x1', answer: '/tmp/answer-y2', mounts: run.mounts, env: run.env },
  run.command(`${SEEN.packet}/packet.md`),
);

/** Each `flag`'s two words after it, as `[from, to]`. */
const pairsAfter = (flags: ReadonlyArray<string>) =>
  argv.flatMap((word, i) => {
    if (!flags.includes(word)) return [];
    return [[argv[i + 1] ?? '', argv[i + 2] ?? '']];
  });

describe("the counsel's sandbox", () => {
  it('reads the system, the packet, the answer folder and what okra and Codex need, and nothing else', () => {
    expect(pairsAfter(['--ro-bind', '--ro-bind-try'])).toEqual([
      ['/usr', '/usr'],
      ['/bin', '/bin'],
      ['/sbin', '/sbin'],
      ['/lib', '/lib'],
      ['/lib64', '/lib64'],
      ['/etc', '/etc'],
      ['/run/systemd/resolve', '/run/systemd/resolve'],
      ['/tmp/judge-x1', '/judge/packet'],
      [tools.okra, '/judge/bin/okra'],
      [`${home}/.bun/install/global/node_modules/@openai`, '/judge/tools/node_modules/@openai'],
      [`${home}/.local/share/node/v24.11.1`, '/judge/tools/node'],
      [`${home}/.codex/config.toml`, '/judge/home/.codex/config.toml'],
      [`${home}/.codex/models_cache.json`, '/judge/home/.codex/models_cache.json'],
      [`${home}/.okra/models.json`, '/judge/home/.okra/models.json'],
    ]);
    // Written: its answer folder, and Codex's sign-in, so a refreshed token lands in place.
    expect(pairsAfter(['--bind'])).toEqual([
      ['/tmp/answer-y2', '/judge/answer'],
      [`${home}/.codex/auth.json`, '/judge/home/.codex/auth.json'],
    ]);
    expect(pairsAfter(['--symlink'])).toEqual([
      ['/judge/tools/node_modules/@openai/codex/bin/codex.js', '/judge/bin/codex'],
      ['/judge/tools/node/bin/node', '/judge/bin/node'],
    ]);
    // A fresh /proc, /dev and /tmp, and an empty home: nothing of the host's there.
    for (const [flag, at] of [
      ['--proc', '/proc'],
      ['--dev', '/dev'],
      ['--tmpfs', '/tmp'],
      ['--tmpfs', SEEN.home],
    ])
      expect(argv.some((word, i) => word === flag && argv[i + 1] === at)).toBe(true);
  });

  it('mounts no home, repo, cache or host /tmp whole', () => {
    const sources = pairsAfter(['--ro-bind', '--ro-bind-try', '--bind']).map(([from]) => from);
    for (const whole of [
      '/',
      '/home',
      home,
      `${home}/.codex`,
      `${home}/.cache`,
      `${home}/Developer`,
      '/workspaces',
      '/tmp',
    ])
      expect([whole, sources.includes(whole)]).toEqual([whole, false]);
  });

  it('runs okra with a cleared environment, from the packet, its prompt and output as it sees them', () => {
    for (const flag of ['--unshare-all', '--share-net', '--die-with-parent', '--clearenv'])
      expect(argv).toContain(flag);
    expect(pairsAfter(['--setenv'])).toEqual([
      ['PATH', '/judge/bin:/usr/bin:/bin'],
      ['HOME', '/judge/home'],
      ['LANG', 'C.UTF-8'],
    ]);
    expect(pairsAfter(['--chdir'])[0]?.[0]).toBe('/judge/packet');
    expect(argv.slice(argv.indexOf('--') + 1)).toEqual([
      'okra',
      'counsel',
      '--deep',
      '--from',
      'claude',
      '-f',
      '/judge/packet/packet.md',
      '-o',
      '/judge/answer',
    ]);
  });
});
