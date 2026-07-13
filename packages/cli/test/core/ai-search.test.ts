import { describe, expect, it } from 'bun:test';

import { Reference } from '@bible/core/bible';
import { Effect, Layer } from 'effect';

import { BibleState } from '../../src/data/bible/state.js';
import { parseAISearchResponse, searchBibleByTopic } from '../../src/data/study/ai-search.js';
import { createMockAILayer } from '../lib/mock-ai.js';
import { createMockBibleState } from '../lib/mock-bible-state.js';

describe('AI Bible search', () => {
  it('decodes JSON embedded in model text and drops non-canonical references', () => {
    expect(
      parseAISearchResponse(
        'Here you go: [{"book":"John","chapter":3,"verse":16},{"book":"Atlantis","chapter":1}]',
      ),
    ).toEqual([Reference.verse(43, 3, 16)]);
    expect(parseAISearchResponse('not JSON')).toEqual([]);
  });

  it('uses the low model and persists canonical results', async () => {
    const state = createMockBibleState();
    const ai = createMockAILayer({
      responses: {
        high: [],
        low: ['[{"book":"John","chapter":3,"verse":16}]'],
      },
    });
    const layer = Layer.merge(ai.layer, Layer.succeed(BibleState, state.service));

    const result = await Effect.runPromise(
      searchBibleByTopic('God loves').pipe(Effect.provide(layer)),
    );

    expect(result).toEqual([Reference.verse(43, 3, 16)]);
    expect(state.cachedSearch.get('God loves')).toEqual(result);
    expect(ai.state.calls).toMatchObject([{ _tag: 'AI.generateText', model: 'low' }]);
  });

  it('returns a cached result without calling the model', async () => {
    const cached = [Reference.chapter(19, 23)];
    const state = createMockBibleState({ cachedSearch: new Map([['comfort', cached]]) });
    const ai = createMockAILayer({ responses: { high: [], low: [] } });
    const layer = Layer.merge(ai.layer, Layer.succeed(BibleState, state.service));

    const result = await Effect.runPromise(
      searchBibleByTopic('comfort').pipe(Effect.provide(layer)),
    );

    expect(result).toEqual(cached);
    expect(ai.state.calls).toEqual([]);
  });
});
