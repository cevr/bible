import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { AppRouterState, Route } from './types.js';

describe('App routes', () => {
  test('serialize parsed EGW locations without a parallel route reference model', async () => {
    const state = new AppRouterState({
      current: Route.egw({ _tag: 'paragraph', bookCode: 'PP', page: 351, paragraph: 1 }),
      history: [Route.egw({ _tag: 'book', bookCode: 'PP' })],
    });

    const json = await Effect.runPromise(AppRouterState.toJson(state));
    const decoded = await Effect.runPromise(AppRouterState.fromJson(json));

    expect(decoded).toEqual(state);
  });
});
