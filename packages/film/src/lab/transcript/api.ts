// A talk's routes as the Transcript view calls them, through the client
// derived from the lab API (`TalkGroup` in `core/api.ts`): its words as the
// server reads `talk.ts` and cuts it now, and its three writes (Cut, Restore,
// Mark here), each answered as a scene write is (`LabWrite`: the change it
// made, which the receipt's Undo steps) or refused in the server's own words.

import { Context, Effect, Layer } from 'effect';
import type { TalkWords } from '../../core/api.ts';
import type { LabWrite } from '../../core/schema.ts';
import { LabClient, type LabFailure, called } from '../api.ts';

/** Words `from`–`to` of section `section`, take word indices. */
export interface WordsAsked {
  readonly section: string;
  readonly from: number;
  readonly to: number;
}

interface TalkCalls {
  /** The talk's sections in play order, every word of each, struck or played. */
  readonly words: Effect.Effect<TalkWords, LabFailure>;
  /** Strike the words asked from the cut. */
  readonly cut: (words: WordsAsked) => Effect.Effect<LabWrite, LabFailure>;
  /** Play the words asked again. */
  readonly restore: (words: WordsAsked) => Effect.Effect<LabWrite, LabFailure>;
  /** Set mark `name` on word `word` of `section`. */
  readonly mark: (
    section: string,
    word: number,
    name: string,
  ) => Effect.Effect<LabWrite, LabFailure>;
}

export class TalkApi extends Context.Service<TalkApi, TalkCalls>()('@bible/film/lab/TalkApi') {}

/** A talk's routes for `film`, over the page's derived client. */
const makeTalkApi = Effect.fn('lab.talk.make')(function* (film: string) {
  const client = (yield* LabClient).talk;
  const params = { film };
  const api: TalkCalls = {
    words: called(client.words({ params })),
    cut: (payload) => called(client.cut({ params, payload })),
    restore: (payload) => called(client.restore({ params, payload })),
    mark: (section, word, name) =>
      called(client.mark({ params, payload: { section, word, name } })),
  };
  return api;
});

/** A talk's routes for `film`, over the page's derived client. */
export const talkApiLayer = (film: string): Layer.Layer<TalkApi, never, LabClient> =>
  Layer.effect(TalkApi, makeTalkApi(film));
