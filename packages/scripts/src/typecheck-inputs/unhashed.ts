// Which files a typecheck reads that turbo does not hash. turbo serves a
// cached typecheck when the task's inputs, and the hashes of the tasks it
// depends on, are unchanged; a file tsc reads that none of them hashes can
// change without tsc running. The check hands this module each task's inputs
// (repo-relative) and the files each tsc program reads; it answers the gaps.

/** A workspace's typecheck task as turbo's dry run describes it, with its inputs repo-relative. */
export interface TypecheckTask {
  readonly taskId: string;
  readonly dependencies: ReadonlyArray<string>;
  readonly inputs: ReadonlySet<string>;
}

/** Every file a task's hash covers: its own inputs and those of the tasks it depends on, transitively. */
export const hashedFor = (
  taskId: string,
  tasks: ReadonlyMap<string, TypecheckTask>,
): ReadonlySet<string> => {
  const hashed = new Set<string>();
  const seen = new Set<string>([taskId]);
  const queue = [taskId];
  for (let i = 0; i < queue.length; i++) {
    const task = tasks.get(queue[i] ?? '');
    if (!task) continue;
    for (const file of task.inputs) hashed.add(file);
    for (const dependency of task.dependencies)
      if (!seen.has(dependency)) {
        seen.add(dependency);
        queue.push(dependency);
      }
  }
  return hashed;
};

/** The files of a program (repo-relative, tracked) that no hash covering the task sees. */
export const unhashed = (
  taskId: string,
  program: ReadonlyArray<string>,
  tasks: ReadonlyMap<string, TypecheckTask>,
): ReadonlyArray<string> => {
  const hashed = hashedFor(taskId, tasks);
  return program.filter((file) => !hashed.has(file));
};
