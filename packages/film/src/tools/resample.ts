// A sound mixed to another channel count and rate by FFmpeg's libswresample,
// in-process through NodeAV (the FFmpeg that @mediabunny/server decodes
// with), at its defaults. Not mediabunny's own resampler: it
// interpolates linearly, with no filter, so a 48 kHz recording's top octave
// would fold down into the voice.

import { Effect } from 'effect';
import * as NodeAv from 'node-av';
import type { Pcm } from '../core/audio.ts';
import { MediaFailed } from '../core/refusals.ts';

/** Frames libswresample may still hold once every input frame is in: its filter, and room to spare. */
const FLUSH = 4096;

/** Planes as the buffers NodeAV passes to C, from frame `from` on. */
const buffers = (planes: ReadonlyArray<Float32Array>, from: number) =>
  planes.map((p) => Buffer.from(p.buffer, p.byteOffset + from * 4, p.byteLength - from * 4));

/** A libswresample call's result: a count, or the error it reports. */
const checked = (ret: number, op: string) => {
  NodeAv.FFmpegError.throwIfError(ret, op);
  return ret;
};

/** `pcm` (read from `file`) as `channels` channels at `rate` Hz. */
export const resample = (file: string, pcm: Pcm, rate: number, channels: number) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new NodeAv.SoftwareResampleContext()),
    (swr) =>
      Effect.try({
        try: (): Pcm => {
          checked(
            swr.allocSetOpts2(
              NodeAv.avChannelLayoutDefault(channels),
              NodeAv.AV_SAMPLE_FMT_FLTP,
              rate,
              NodeAv.avChannelLayoutDefault(pcm.channels.length),
              NodeAv.AV_SAMPLE_FMT_FLTP,
              pcm.rate,
            ),
            'swr_alloc_set_opts2',
          );
          checked(swr.init(), 'swr_init');
          const capacity = Math.ceil((pcm.frames * rate) / pcm.rate) + FLUSH;
          const out = Array.from({ length: channels }, () => new Float32Array(capacity));
          const planes = pcm.channels.map((p) => p.subarray(0, pcm.frames));
          const body = checked(
            swr.convertSync(buffers(out, 0), capacity, buffers(planes, 0), pcm.frames),
            'swr_convert',
          );
          // Then what its filter still holds: libswresample flushes on no input.
          // oxlint-disable-next-line effect/noNullish -- swr_convert's own signal for the end
          const flushed = swr.convertSync(buffers(out, body), capacity - body, null, 0);
          const tail = checked(flushed, 'swr_convert');
          const frames = body + tail;
          return { rate, frames, channels: out.map((p) => p.slice(0, frames)) };
        },
        catch: (cause) => MediaFailed.make({ op: 'decode', file, reason: String(cause) }),
      }),
    (swr) => Effect.sync(() => swr.free()),
  );
