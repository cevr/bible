export const CHECKPOINT_NAMES = ['initial', 'foundation', 'shared-app', 'pre-cutover'] as const;

export type CheckpointName = (typeof CHECKPOINT_NAMES)[number];

export interface CheckResult {
  readonly name: string;
  readonly status: 'pass' | 'fail';
  readonly details: readonly string[];
}

export interface CommandResult {
  readonly command: readonly string[];
  readonly exitCode: number;
}

export interface LegacyCategory {
  readonly id: string;
  readonly title: string;
  readonly removalCheckpoint: Exclude<CheckpointName, 'initial'>;
  readonly globs: readonly string[];
  readonly search?: RegExp;
  readonly searchGlobs?: readonly string[];
  readonly dependencies?: Readonly<Record<string, readonly string[]>>;
}

export interface LegacyCategorySnapshot {
  readonly id: string;
  readonly title: string;
  readonly removalCheckpoint: Exclude<CheckpointName, 'initial'>;
  readonly matches: readonly string[];
}

export interface RemovalBaseline {
  readonly schemaVersion: 1;
  readonly categories: readonly LegacyCategorySnapshot[];
}

export const displayLegacyMatch = (match: string, root?: string): string =>
  root === undefined ? match : `${root}/${match}`;

export const checkpointIndex = (name: CheckpointName): number => CHECKPOINT_NAMES.indexOf(name);

export const isCheckpointName = (value: string): value is CheckpointName =>
  CHECKPOINT_NAMES.some((name) => name === value);
