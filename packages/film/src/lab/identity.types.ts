// Compile-time checks for an operation's identity, run by the package
// typecheck: a change, an Undo request and an approve run are each known by
// their own id (`ChangeId`, `RequestId`, `OpId`), made by `uniqueId` or
// decoded where it arrives, never by a name, a time, or another kind's id.
// Each `@ts-expect-error` fails the typecheck if the line compiles.

import type { Effect } from 'effect';
import type { Bound, ChangeBound } from '../command/command.ts';
import { OpId } from '../core/catalogue.ts';
import { ChangeId, type RequestId } from '../core/schema.ts';
import { uniqueId } from '../core/unique.ts';
import type { stepRequest } from './api.ts';

declare const cueName: string;
declare const film: string;
declare const anyStringEffect: Effect.Effect<string>;
declare const handMade: string;
declare const madeAt: number;
declare const request: RequestId;

// i1: a receipt bound to a change by its readable target, not the history's id.
// @ts-expect-error a change is bound by its id, never by its target's words
export const byName: Bound = { film, change: `cue ${cueName} offset` };

// i2: a receipt bound by the moment it was made.
// @ts-expect-error a change is bound by its id, never by when it was made
export const byTime: Bound = { film, change: String(madeAt) };

// i3: the Undo request id and any other string Effect are one type.
// @ts-expect-error a step's request id is made as one (`uniqueId(RequestId)`)
export const sameType: typeof stepRequest = anyStringEffect;

// i4: what an id carries is a string any string stands in for.
// @ts-expect-error a change id is made or decoded, never any string
export const asId: ChangeBound['change'] = handMade;

// One kind's id spelled as another's: a request's id is no change's.
// @ts-expect-error a request id never names a change
export const crossed: ChangeBound['change'] = request;

// Controls: ids made as their kind are taken where that kind is asked for.
export const own: Bound = { film, change: ChangeId.make('k1') };
export const approved: Bound = { film, gave: { op: OpId.make('op-1'), scenes: ['a'] } };
export const made: Effect.Effect<ChangeId> = uniqueId(ChangeId);
