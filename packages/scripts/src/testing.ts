// Test support for the scripts' own tests.

/**
 * The config every test repository's git runs with, ahead of its own
 * arguments: a name, a mail and no signing, so the machine's own config
 * stays out of its commits; no hooks and no editor, so nothing the machine
 * installed runs; and no automatic maintenance, which git starts detached
 * after a commit and which writes and removes `.git/objects/maintenance.lock`
 * while the test's scope deletes the folder (the delete then fails, ENOENT,
 * in 11 runs of 15 on one process).
 */
export const TEST_GIT: ReadonlyArray<string> = [
  '-c',
  'user.name=probe',
  '-c',
  'user.email=probe@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/nonexistent/test-git-hooks',
  '-c',
  'core.editor=true',
  '-c',
  'maintenance.auto=false',
];
