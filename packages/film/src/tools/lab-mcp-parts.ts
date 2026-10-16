// What the lab MCP's toolkits share (`lab-mcp.ts`, `notes-mcp.ts`,
// `sets-mcp.ts`, `asks-mcp.ts`): a tool's refusal in words, the film a tool
// names, where the tools' links point, and a path kept inside its folder.

import { Effect, Option, type Path, Schema } from 'effect';
import type { LabLinks } from '../core/lab-events.ts';

/** A tool's refusal, said in words the agent reads. */
export class LabRefused extends Schema.TaggedError<LabRefused>()('LabRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/** Any failure of a tool's work, as the tool answers it. */
export const refused = <A, R>(self: Effect.Effect<A, { readonly message: string }, R>) =>
  Effect.mapError(self, (error) => LabRefused.make({ reason: error.message }));

export const FilmParam = Schema.Struct({
  film: Schema.String.annotate({ description: 'The film, by name (see `overview`).' }),
});

/** Where the tools' links point. */
export interface LabMcpOptions {
  /** The lab's own links: on this machine, and from the owner's phone when it listens there. */
  readonly links: LabLinks;
}

/** A path under `root` that stays under it: `rel` relative, with no `..` out of it. */
export const inside = (path: Path.Path, root: string, rel: string): Option.Option<string> => {
  if (path.isAbsolute(rel)) return Option.none();
  const at = path.resolve(root, rel);
  return Option.liftPredicate(at, (a) => a.startsWith(`${root}${path.sep}`));
};
