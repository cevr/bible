import { describe, expect, test } from 'bun:test';

import { POST } from '../src/pages/api/grade.ts';

/*
 * Exercises the /api/grade route's guard logic — the validation and protection
 * paths that run BEFORE any paid API call. The grading success path needs live
 * OpenAI/Anthropic and is covered by the fixture-loop task with a real key.
 *
 * Each test uses a distinct clientAddress so the module-scoped rate limiter
 * (capacity 5) doesn't bleed across tests.
 */

type RouteArgs = Parameters<typeof POST>[0];

/** Minimal APIContext stub — the route only reads `request` and `clientAddress`. */
function call(request: Request, clientAddress: string): Promise<Response> {
  return POST({ request, clientAddress } as unknown as RouteArgs) as Promise<Response>;
}

function multipart(fields: {
  series?: string;
  chapter?: string;
  audio?: { bytes: Uint8Array<ArrayBuffer>; type: string; name: string };
}): Request {
  const form = new FormData();
  if (fields.series !== undefined) form.append('series', fields.series);
  if (fields.chapter !== undefined) form.append('chapter', fields.chapter);
  if (fields.audio) {
    form.append(
      'audio',
      new Blob([fields.audio.bytes], { type: fields.audio.type }),
      fields.audio.name,
    );
  }
  return new Request('http://localhost/api/grade', { method: 'POST', body: form });
}

const validAudio = { bytes: new Uint8Array([1, 2, 3, 4]), type: 'audio/webm', name: 'r.webm' };

describe('/api/grade guards', () => {
  test('400 when series/chapter missing', async () => {
    const res = await call(multipart({ audio: validAudio }), 'ip-1');
    expect(res.status).toBe(400);
  });

  test('400 when audio missing', async () => {
    const res = await call(multipart({ series: 'dar', chapter: 'fixture-chapter' }), 'ip-2');
    expect(res.status).toBe(400);
  });

  test('400 when audio is empty', async () => {
    const res = await call(
      multipart({
        series: 'dar',
        chapter: 'fixture-chapter',
        audio: { bytes: new Uint8Array([]), type: 'audio/webm', name: 'r.webm' },
      }),
      'ip-3',
    );
    expect(res.status).toBe(400);
  });

  test('415 for an unsupported audio type', async () => {
    const res = await call(
      multipart({
        series: 'dar',
        chapter: 'fixture-chapter',
        audio: { bytes: new Uint8Array([1, 2, 3]), type: 'application/pdf', name: 'r.pdf' },
      }),
      'ip-4',
    );
    expect(res.status).toBe(415);
  });

  test('404 for an unknown chapter', async () => {
    const res = await call(
      multipart({ series: 'dar', chapter: 'no-such-chapter', audio: validAudio }),
      'ip-5',
    );
    expect(res.status).toBe(404);
  });

  test('429 once the bucket is drained for one IP', async () => {
    const ip = 'ip-burst';
    // Capacity is 5; the 6th request within the window is limited. Use a payload
    // that would otherwise 404 so we never touch a paid API. The requests must run
    // sequentially to drain the bucket in order, so we fold a promise chain rather
    // than racing with Promise.all.
    const statuses = await Array.from({ length: 6 }).reduce<Promise<number[]>>(async (accP) => {
      const acc = await accP;
      const res = await call(
        multipart({ series: 'dar', chapter: 'no-such-chapter', audio: validAudio }),
        ip,
      );
      return [...acc, res.status];
    }, Promise.resolve([]));
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  });
});
