// The store stack's names and the key writer's `.env` merge, on synthetic values.

import { describe, expect, test } from 'bun:test';
import { envWith } from './keys.ts';
import { PROD_BUCKET, bucketName, bucketResource } from './store.ts';

describe('the film store stack', () => {
  test('names the prod bucket as the library declares it, and one bucket per other stage', () => {
    expect(bucketName('prod')).toBe(PROD_BUCKET);
    expect(bucketName('agent-store')).toBe('film-store-agent-store');
    expect(bucketName('test_Exedev')).toBe('film-store-test-exedev');
    expect(bucketName('x'.repeat(80)).length).toBe(63);
  });

  test("scopes the key to the bucket's own resource", () => {
    expect(bucketResource('acc', 'film-store')).toBe(
      'com.cloudflare.edge.r2.bucket.acc_default_film-store',
    );
  });

  test('writes the key pair beside the rest of .env, replacing only its own lines', () => {
    const pair = [
      ['FILM_STORE_ACCOUNT_ID', 'acc'],
      ['FILM_STORE_ACCESS_KEY_ID', 'id'],
      ['FILM_STORE_SECRET_ACCESS_KEY', 'secret'],
    ] as const;
    expect(envWith('', pair)).toBe(
      'FILM_STORE_ACCOUNT_ID=acc\nFILM_STORE_ACCESS_KEY_ID=id\nFILM_STORE_SECRET_ACCESS_KEY=secret\n',
    );
    const before = 'OTHER=1\nFILM_STORE_ACCESS_KEY_ID=old\n# a note\n\n';
    expect(envWith(before, pair)).toBe(
      'OTHER=1\n# a note\nFILM_STORE_ACCOUNT_ID=acc\nFILM_STORE_ACCESS_KEY_ID=id\nFILM_STORE_SECRET_ACCESS_KEY=secret\n',
    );
    expect(envWith(envWith(before, pair), pair)).toBe(envWith(before, pair));
  });
});
