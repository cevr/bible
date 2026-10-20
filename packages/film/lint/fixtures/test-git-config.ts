// Fixture for film/test-git-config: each line marked RED fires the rule,
// and nothing else does.

declare const TEST_GIT: ReadonlyArray<string>;
declare const args: ReadonlyArray<string>;

declare const git: (dir: string, args: ReadonlyArray<string>) => void;
declare const make: (command: string, args: ReadonlyArray<string>) => void;

export const GIT = ['-c', 'commit.gpgsign=false']; // RED film/test-git-config
git('.', ['-c', 'user.name=t', 'commit']); // RED film/test-git-config
make('git', ['-c', 'maintenance.auto=false', 'commit']); // RED film/test-git-config
export const command = ['git', '-c', 'core.editor=true', 'commit']; // RED film/test-git-config
const AS_TEST = ['-c', 'user.name=t', 'commit']; // RED film/test-git-config
git('.', [...AS_TEST, 'commit', '-qm', 'base']);
export const shared = [...TEST_GIT, 'commit', '-qm', 'base'];
export const flag = ['-c', ...args];
export const notASetting = ['-c', 'plain'];
export const cFlagElsewhere = ['tar', '-c', 'file.tar'];
make('tar', ['-c', 'archive.entry=fixture']);
export const tarArgs = ['-c', 'archive.entry=fixture'];
