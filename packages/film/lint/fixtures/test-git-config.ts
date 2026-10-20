// Fixture for film/test-git-config: each line marked RED fires the rule,
// and nothing else does.

declare const TEST_GIT: ReadonlyArray<string>;
declare const args: ReadonlyArray<string>;

export const inline = ['-c', 'commit.gpgsign=false', 'commit']; // RED film/test-git-config
export const shared = [...TEST_GIT, 'commit', '-qm', 'base'];
export const flag = ['-c', ...args];
export const notASetting = ['-c', 'plain'];
export const cFlagElsewhere = ['tar', '-c', 'file.tar'];
