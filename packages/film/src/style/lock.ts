// A locked figure is drawn as the owner kept it. Its lock is a file beside
// its composition (`<item>.lock.json`), which the composition carries
// (`figure`'s `lock`): the item, its version (one more each time he keeps a
// changed one), the sha256 of its print as he kept it (its artboard and its
// hands', as its film draws them alone: ids of their own, at the stage's
// start), the ask he kept it in, the time the production's ledger filed his
// decision, and the still he saw it in. The print is what the house draws of
// him, so a change to a part, to how the house draws one, or to his place in
// his film's file (his artboard's name, his boil's seed) moves it; a slot the
// house draws nothing from (his concept, his stature, his hands' share) does
// not. His film's build and its test hash each locked figure's print and
// hold it to its lock (`unlocked`, `build.ts`; what a hash answers,
// `heldTo`): a print that differs breaks the lock (FigureLock), unless its
// override, with his words, frees that very print, and then it is
// overridden until he keeps it as the lock's next version. An override that
// frees another print, or one the lock holds already, breaks it too, so no
// override is left to free a later change unasked. Pure.

import { Schema } from 'effect';
import { ConceptImage } from '../core/match.ts';
import { decoder, ruleCheck } from './decode.ts';
import { Words, overrideOf } from './override.ts';

/** A sha256, as lowercase hex. */
const Sha256 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, { message: 'a sha256, as 64 lowercase hex digits' }),
);

/** FigureLock's override: it frees the one print it names, by its sha256. */
const Freed = overrideOf('FigureLock', { frees: Sha256 });
type Freed = typeof Freed.Type;

/** An override frees the figure its lock names: its place is the lock's item. */
const placed = ruleCheck(
  'FigureLock',
  (lock: { readonly item: string; readonly override?: Freed }) =>
    lock.override === undefined || lock.override.place === lock.item
      ? true
      : `its override frees ${lock.override.place}, not ${lock.item}`,
);

/**
 * A figure's lock: its file's fields (the item, its version, its print's
 * sha256, the ask, the ledger's time in ms, the still he saw), and the
 * override that frees one print of it when his words allow.
 */
const LockSlot = Schema.Struct({
  item: Words,
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  hash: Sha256,
  ask: Words,
  at: Schema.Int.check(Schema.isGreaterThan(0)),
  seen: ConceptImage,
  override: Schema.optionalKey(Freed),
}).check(placed);
export type Lock = typeof LockSlot.Type;

/** A figure's lock, checked as `figure` composes it. */
export const decodeLock = decoder(LockSlot);

/** What a locked figure's print answers its lock: it holds, its override frees it, or it is broken, and why. */
type Held =
  | { readonly _tag: 'Holds' }
  | { readonly _tag: 'Freed'; readonly override: Freed }
  | { readonly _tag: 'Broken'; readonly why: string };

/** The answer that the lock is broken, and `why`. */
const broken = (why: string): Held => ({ _tag: 'Broken', why });

/**
 * What the print of the figure laid as `item` in its film, its sha256
 * `hash`, answers `lock`.
 */
export const heldTo = (item: string, lock: Lock, hash: string): Held => {
  if (lock.item !== item) return broken(`it carries ${lock.item}'s lock`);
  const o = lock.override;
  if (hash === lock.hash)
    return o === undefined
      ? { _tag: 'Holds' }
      : broken(
          `its print is its lock's, so its override frees nothing: drop it, or it frees a later change unasked`,
        );
  if (o === undefined)
    return broken(
      `its print ${hash} is not its lock's ${lock.hash} (version ${lock.version}, kept in ask ${lock.ask}): only an override with the owner's words frees it, naming the print it frees`,
    );
  if (o.frees !== hash) return broken(`its override frees ${o.frees}, not its print ${hash}`);
  return { _tag: 'Freed', override: o };
};
