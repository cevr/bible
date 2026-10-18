// A locked figure is drawn as the owner kept it. Its lock is a file beside
// its composition (`<item>.lock.json`), which the composition carries
// (`figure`'s `lock`): the item, its version (one more each time he keeps a
// changed one), the sha256 of its print as he kept it (its artboard and its
// hands', as the house prints them alone from his film's figures file,
// `lockedPrints`: ids of their own, at the stage's start), the ask he kept
// it in, the time the production's ledger filed the decision that kept it,
// and the still he saw it in. The print is what the house draws of him, so
// a change to a part, to how the house draws one, or to his place in his
// film's file (his artboard's name, his boil's seed) moves it; a slot the
// house draws nothing from (his concept, his stature, his hands' share) does
// not. His film's build and its test hash each locked figure's print and
// hold it to its lock (`unlocked`, `build.ts`; what a hash answers,
// `heldTo`): the lock names a decision on his production's ledger, filed at
// its time and answering its ask, or it is broken; a print that differs from
// the lock's breaks it (FigureLock), unless its override frees that very
// print, citing a decision of his on the figure filed after the lock
// (`override.ts`), and then it is overridden until he keeps it as the lock's
// next version. An override that frees another print, or one the lock holds
// already, breaks it too, so no override is left to free a later change
// unasked. The hash itself is the lock file's alone: his decision does not
// file it yet, so a lock file rewritten by hand holds whatever print it
// names, and a review reads every change to one. Pure.

import { DateTime, Option, Schema } from 'effect';
import { ConceptImage } from '../core/match.ts';
import type { Decided } from '../core/production.ts';
import { decoder, ruleCheck } from './decode.ts';
import { Words, overrideOf, whyUnbacked } from './override.ts';

/** A sha256, as lowercase hex. */
const Sha256 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, { message: 'a sha256, as 64 lowercase hex digits' }),
);

/** FigureLock's override: it frees the one print it names, by its sha256, citing a decision of the owner's on the figure. */
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
 * override that frees one print of it when a decision of his allows.
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

/** Whether the owner's decisions (`decisions`) hold the one `lock` names: filed at its time, answering its ask. */
const keptIn = (lock: Lock, decisions: ReadonlyArray<Decided>) =>
  decisions.some((d) => d.at === lock.at && Option.contains(d.ask, lock.ask));

/**
 * What the print of the figure laid as `item` in its film, its sha256
 * `hash`, answers `lock`, read against the owner's decisions on his
 * production's ledger (`decisions`).
 */
export const heldTo = (
  item: string,
  lock: Lock,
  hash: string,
  decisions: ReadonlyArray<Decided>,
): Held => {
  if (lock.item !== item) return broken(`it carries ${lock.item}'s lock`);
  if (!keptIn(lock, decisions))
    return broken(
      `its lock names a decision his production's ledger does not hold: none filed at ${DateTime.formatIso(DateTime.makeUnsafe(lock.at))} answers ask ${lock.ask}`,
    );
  const o = lock.override;
  if (hash === lock.hash)
    return o === undefined
      ? { _tag: 'Holds' }
      : broken(
          `its print is its lock's, so its override frees nothing: drop it, or it frees a later change unasked`,
        );
  if (o === undefined)
    return broken(
      `its print ${hash} is not its lock's ${lock.hash} (version ${lock.version}, kept in ask ${lock.ask}): only an override citing a decision of the owner's on ${item}, filed after the lock, frees it, naming the print it frees`,
    );
  if (o.frees !== hash) return broken(`its override frees ${o.frees}, not its print ${hash}`);
  return Option.match(whyUnbacked({ item, override: o, since: lock.at }, decisions), {
    onNone: (): Held => ({ _tag: 'Freed', override: o }),
    onSome: broken,
  });
};
