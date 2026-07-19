import type { CheckpointName, CheckResult, CommandResult, RemovalBaseline } from './model.js';

const formatCommand = (command: readonly string[]): string => command.join(' ');

export const renderCheckpointReport = (options: {
  readonly checkpoint: CheckpointName;
  readonly reviewedCommit: string;
  readonly generatedAt: string;
  readonly checks: readonly CheckResult[];
  readonly commands: readonly CommandResult[];
  readonly currentLegacy: RemovalBaseline;
  readonly status: 'PASS' | 'FAIL';
  readonly repositoryRoot: string;
}): string => {
  const checks = options.checks
    .map(
      (check) =>
        `### ${check.status === 'pass' ? 'PASS' : 'FAIL'} — ${check.name}\n\n${check.details.map((detail) => `- ${detail}`).join('\n')}`,
    )
    .join('\n\n');
  const commands = options.commands
    .map(
      (command) =>
        `- \`${formatCommand(command.command)}\` — ${command.exitCode === 0 ? 'PASS' : `FAIL (${String(command.exitCode)})`}`,
    )
    .join('\n');
  const inventory = options.currentLegacy.categories
    .map(
      (category) =>
        `- **${category.title}** (${category.removalCheckpoint}): ${String(category.matches.length)} target${category.matches.length === 1 ? '' : 's'}`,
    )
    .join('\n');

  return `# ${options.checkpoint} architecture checkpoint

Status: **${options.status}**

Reviewed commit: \`${options.reviewedCommit}\`
Generated: ${options.generatedAt}
Repository root: \`${options.repositoryRoot}\`

## Commands

${commands === '' ? '- None' : commands}

## Static architecture checks

${checks}

## Legacy-removal inventory

${inventory}

The immutable target list is recorded in \`../inventories/removal-baseline.json\`. A category may not grow after the initial checkpoint and must be empty at its removal checkpoint.

## Interface depth and deletion-test review

- Initial checkpoint: the procedure runtime, user-state persistence/sync, synced cache, shared reading application, and interaction primitives are the planned deep modules.
- Host deletion target: removing either host must leave shared routes, reading behavior, cache semantics, procedures, repositories, migrations, and sync behavior intact.
- Legacy deletion target: CLI TUI, React, duplicate caches/providers/routes, renderer database protocols, and host-owned domain workflows must disappear at their named checkpoints.

## Persisted-state and feature evidence

- Persisted stores and copy-on-migrate rules: \`../inventories/persisted-stores.md\`.
- Shared web/desktop acceptance surface: \`../feature-parity.md\`.

## Findings

${options.status === 'PASS' ? '- No blocking findings.' : '- One or more checks above are blocking. The next wave is not authorized.'}
`;
};
