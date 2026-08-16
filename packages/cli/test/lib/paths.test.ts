import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { dataCandidates, getDataPath, resolveDataPath } from '../../src/lib/paths.js';

// The packaged install itself (a compiled binary copied out of the workspace)
// is only exercisable end to end; the derivation below is the testable part.
describe('CLI install-owned data paths', () => {
  it('derives the topics artifact from the CLI root, not the caller cwd', () => {
    expect(getDataPath('/opt/bible-cli', 'topics.db')).toBe('/opt/bible-cli/data/topics.db');
  });

  it('joins nested segments under the data directory', () => {
    expect(getDataPath('/opt/bible-cli', 'nested', 'tokens.json')).toBe(
      '/opt/bible-cli/data/nested/tokens.json',
    );
  });

  it('returns the data directory itself when no segments are given', () => {
    expect(getDataPath('/opt/bible-cli')).toBe('/opt/bible-cli/data');
  });
});

/** `__BIBLE_CLI_ROOT__` is baked into the binary at build time, so it names the
 *  build machine's checkout. A binary that is copied, installed into a prefix,
 *  or shipped to another machine must not follow that path — it points at a
 *  directory that need not exist. These assert the resolution order that makes
 *  the copy work: exe-adjacent first, build root only as the dev fallback. */
describe('moved-binary data resolution', () => {
  const BUILD_ROOT = '/Users/builder/checkout/packages/cli';

  it('prefers the data directory beside the executable', () => {
    const resolved = resolveDataPath(
      {
        executableDir: '/usr/local/lib/bible/bin',
        buildRoot: Option.some(BUILD_ROOT),
        // Both exist: the exe-adjacent copy must still win, because a binary
        // that ships its own artifact must read that one and not whatever a
        // stale checkout happens to hold.
        exists: () => true,
      },
      'topics.db',
    );
    expect(resolved).toBe('/usr/local/lib/bible/bin/data/topics.db');
  });

  it('never reaches the build root once the binary carries its own data', () => {
    expect(
      dataCandidates(
        { executableDir: '/usr/local/lib/bible/bin', buildRoot: Option.some(BUILD_ROOT) },
        'topics.db',
      ),
    ).toEqual(['/usr/local/lib/bible/bin/data/topics.db', `${BUILD_ROOT}/data/topics.db`]);
  });

  it('falls back to the build root in dev, where no data sits beside bun', () => {
    // `bun src/main.ts` in the workspace: `process.execPath` is the Bun binary
    // itself, so nothing is exe-adjacent and the workspace copy is the answer.
    const resolved = resolveDataPath(
      {
        executableDir: '/Users/dev/.bun/bin',
        buildRoot: Option.some(BUILD_ROOT),
        exists: (candidate) => candidate === `${BUILD_ROOT}/data/topics.db`,
      },
      'topics.db',
    );
    expect(resolved).toBe(`${BUILD_ROOT}/data/topics.db`);
  });

  it('reports the exe-adjacent path when the artifact is nowhere', () => {
    // The binary was moved and the build checkout is gone. Naming the stale
    // checkout in the "not installed" message would send an operator to a
    // directory they may never have had; the install-owned slot is the useful
    // location to name.
    const resolved = resolveDataPath(
      {
        executableDir: '/usr/local/lib/bible/bin',
        buildRoot: Option.some(BUILD_ROOT),
        exists: () => false,
      },
      'topics.db',
    );
    expect(resolved).toBe('/usr/local/lib/bible/bin/data/topics.db');
  });

  it('offers only the exe-adjacent path when there is no build root', () => {
    expect(
      dataCandidates(
        { executableDir: '/usr/local/lib/bible/bin', buildRoot: Option.none() },
        'topics.db',
      ),
    ).toEqual(['/usr/local/lib/bible/bin/data/topics.db']);
  });
});
