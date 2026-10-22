// The workspaces a commit's typecheck covers: each workspace a staged file
// that types read lies in, and every workspace when a staged root file that
// every workspace reads is one of them. Selah is never among them (its
// typecheck is a Swift compile; the slow suite runs its native gate).

/** A workspace that has a `typecheck` script: its folder from the root and its package name. */
export interface Workspace {
  readonly dir: string;
  readonly name: string;
}

/** Root files every workspace's typecheck reads, or that change what turbo runs. */
const ROOT_FILES = new Set([
  'tsconfig.json',
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'turbo.json',
]);

/** Files a typecheck reads: scripts, declarations and JSON (imported, or a tsconfig). */
const TYPED = /\.([cm]?[jt]sx?|json)$/;

/** The workspaces the typecheck leaves out, by folder. */
const LEFT_OUT = new Set(['apps/selah']);

/** The names of the workspaces `staged` (paths from the root) asks a typecheck of, sorted. */
export const typecheckedBy = (
  staged: ReadonlyArray<string>,
  workspaces: ReadonlyArray<Workspace>,
): ReadonlyArray<string> => {
  const covered = workspaces.filter((workspace) => !LEFT_OUT.has(workspace.dir));
  if (staged.some((file) => ROOT_FILES.has(file)))
    return covered.map((workspace) => workspace.name).toSorted();
  const touched = covered.filter((workspace) =>
    staged.some((file) => file.startsWith(`${workspace.dir}/`) && TYPED.test(file)),
  );
  return touched.map((workspace) => workspace.name).toSorted();
};
