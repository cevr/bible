// Hear version n (UR-27): on a version stack's page, `1`…`9` make one of the
// stack's first nine versions the one heard, as its card's 🔊 does, its
// number the one its card shows. Each is offered while its version can be
// heard (the view plays, a pair holds it) and is not the one heard already,
// and says the version's number and label. Pure.

import { Effect } from 'effect';
import { type Command, quiet } from '../../command/command.ts';

/** How many versions have a key: `1`…`9`. */
const KEYED = 9;

/** What the keys drive: the stack's versions in order, and what is heard. */
interface Hearing {
  readonly versions: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  /** The version heard now. */
  readonly heard: () => string;
  /** Whether version `id` can be heard in the view shown. */
  readonly hearable: (id: string) => boolean;
  readonly hear: (id: string) => void;
}

/** `Hear version n` for the stack's first nine versions, on `1`…`9`. */
export const hearVersionCommands = (hearing: Hearing): ReadonlyArray<Command> =>
  hearing.versions.slice(0, KEYED).map((version, i): Command => {
    const n = i + 1;
    return {
      id: `set.hear-${n}`,
      label: `Hear version ${n}`,
      labelIn: () => `Hear version ${n} · ${version.label}`,
      group: 'Review',
      keys: [String(n)],
      touch: 'tap its 🔊',
      when: () => hearing.hearable(version.id) && hearing.heard() !== version.id,
      run: () =>
        Effect.sync(() => {
          hearing.hear(version.id);
          return quiet;
        }),
    };
  });
