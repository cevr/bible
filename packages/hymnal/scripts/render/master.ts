/**
 * The master, in-process through NodeAV's FFmpeg (pinned by the lockfile):
 *
 * 1. The dry mix to −20 LUFS, the room (`afir` with the seeded impulse
 *    response, mixed at its wet level), a gentle compressor, and a fade over
 *    the tail's last 0.8 s, into a float WAV.
 * 2. That to −16 LUFS, limited at −2 dBFS by `alimiter` with its latency
 *    compensated (so no onset moves: the words are synced to the MIDI's
 *    clock), and encoded by LAME at 192 kb/s CBR, 44.1 kHz stereo,
 *    bit-exact, carrying the credits as its one comment.
 * 3. The MP3 decoded as a player decodes it and measured by `ebur128`
 *    (integrated loudness and true peak); the gain is corrected and step 2
 *    run again until the MP3 is within 0.2 LU of the target, at most 3 times.
 *
 * The filter parameters are the listening pilot's, which the owner chose by
 * ear. Every filter and the encoder run on one thread.
 */

import type { Pcm } from '@bible/film/measure';
import { Effect } from 'effect';
import { Decoder, Demuxer, Encoder, FilterAPI, Muxer } from 'node-av/api';
import {
  AV_CODEC_FLAG_BITEXACT,
  AV_LOG_ERROR,
  AVFMT_FLAG_BITEXACT,
  FF_ENCODER_LIBMP3LAME,
  FF_ENCODER_PCM_F32LE,
} from 'node-av/constants';
import { Dictionary, Log } from 'node-av/lib';
import { RenderFailed } from './proc.js';
import type { Style } from './style.js';

Log.setLevel(AV_LOG_ERROR);

/** What `ebur128` read of a file, and the file decoded. */
export interface Measure {
  readonly lufs: number;
  /** dBTP. */
  readonly truePeak: number;
  readonly pcm: Pcm;
}

/** A path FFmpeg's filter graph takes inside quotes: none of the characters its parsers treat as syntax. */
const graphPath = (file: string) => {
  if (/['\\[\],;:]/.test(file))
    throw new Error(`${file}: a path with ' \\ [ ] , ; or : cannot go into a filter graph`);
  return `'${file}'`;
};

/** Planar float chunks joined into one plane per channel. */
const joined = (chunks: ReadonlyArray<ReadonlyArray<Float32Array>>, rate: number): Pcm => {
  const frames = chunks.reduce((n, c) => n + (c[0]?.length ?? 0), 0);
  const channels = [0, 1].map(() => new Float32Array(frames));
  let at = 0;
  for (const chunk of chunks) {
    for (const [c, plane] of channels.entries()) plane.set(chunk[c] ?? chunk[0] ?? [], at);
    at += chunk[0]?.length ?? 0;
  }
  return { rate, frames, channels };
};

/** `file` decoded to stereo float and measured by `ebur128` (true peak on). */
const measureFile = async (file: string, rate: number): Promise<Measure> => {
  await using input = await Demuxer.open(file);
  const stream = input.audio();
  if (stream === undefined) throw new Error(`${file} holds no audio`);
  using decoder = await Decoder.create(stream);
  using filter = FilterAPI.create(
    'ebur128=peak=true:metadata=1:framelog=quiet,aformat=sample_fmts=fltp:channel_layouts=stereo',
    { threads: 1 },
  );
  const chunks: Float32Array[][] = [];
  let meta: Record<string, string> = {};
  for await (using frame of filter.frames(decoder.frames(input.packets(stream.index)))) {
    if (!frame) continue;
    const data = frame.data ?? [];
    chunks.push(
      data
        .slice(0, 2)
        .map(
          (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + frame.nbSamples * 4)),
        ),
    );
    const got = frame.getMetadata().getAll();
    if ('lavfi.r128.I' in got) meta = got;
  }
  const lufs = Number(meta['lavfi.r128.I']);
  const peak = Number(meta['lavfi.r128.true_peak']);
  if (!Number.isFinite(lufs) || !Number.isFinite(peak))
    throw new Error(`ebur128 gave no reading of ${file}`);
  return { lufs, truePeak: 20 * Math.log10(peak), pcm: joined(chunks, rate) };
};

/** `input` through `graph` into `output`, encoded by `encoder` and written by `format`'s muxer. */
const filterFile = async (
  input: string,
  graph: string,
  output: string,
  encode: () => Promise<Encoder>,
  format: 'wav' | 'mp3',
  comment?: string,
) => {
  await using demux = await Demuxer.open(input);
  const stream = demux.audio();
  if (stream === undefined) throw new Error(`${input} holds no audio`);
  using decoder = await Decoder.create(stream);
  using filter = FilterAPI.create(graph, { threads: 1 });
  using encoder = await encode();
  await using mux = await Muxer.open(output, {
    format,
    configure: (context) => {
      context.setFlags(AVFMT_FLAG_BITEXACT);
      if (comment !== undefined) {
        const metadata = new Dictionary();
        metadata.set('comment', comment);
        context.metadata = metadata;
      }
    },
  });
  const index = mux.addStream(encoder);
  const frames = filter.frames(decoder.frames(demux.packets(stream.index)));
  for await (using packet of encoder.packets(frames))
    if (packet) await mux.writePacket(packet, index);
};

const floatWav = () => Encoder.create(FF_ENCODER_PCM_F32LE, { threadCount: 1 });

const mp3 = (bitrate: string) => async () => {
  const encoder = await Encoder.create(FF_ENCODER_LIBMP3LAME, { bitrate, threadCount: 1 });
  encoder.setCodecFlags(AV_CODEC_FLAG_BITEXACT);
  return encoder;
};

export interface MasterInput {
  /** The dry mix, a float WAV. */
  readonly dry: string;
  /** The room's impulse response, a float WAV. */
  readonly ir: string;
  /** Where the mastered float WAV goes between passes (deleted after). */
  readonly pre: string;
  /** The MP3 to write. */
  readonly out: string;
  /** The dry mix's length in seconds: the fade ends there. */
  readonly seconds: number;
  readonly comment: string;
  readonly style: Pick<Style, 'rate' | 'reverb' | 'fade' | 'master'>;
}

export interface Mastered extends Measure {
  readonly passes: number;
}

const master = async (job: MasterInput): Promise<Mastered> => {
  const { style } = job;
  const m = style.master;
  const dry = await measureFile(job.dry, style.rate);
  const room =
    `[in]volume=${(m.preLufs - dry.lufs).toFixed(3)}dB,asplit=2[d][w];` +
    `amovie=${graphPath(job.ir)}[ir];` +
    `[w][ir]afir=gtype=none:irnorm=-1:dry=1:wet=1[r];` +
    `[d][r]amix=inputs=2:weights='1 ${style.reverb.wet}':normalize=0,` +
    `acompressor=${m.compressor},` +
    `afade=t=out:st=${(job.seconds - style.fade).toFixed(3)}:d=${style.fade},` +
    `aformat=sample_fmts=flt:channel_layouts=stereo[out]`;
  await filterFile(job.dry, room, job.pre, floatWav, 'wav');
  let gain = m.targetLufs - (await measureFile(job.pre, style.rate)).lufs;
  const limit = (10 ** (m.limitDb / 20)).toFixed(4);
  for (let pass = 1; ; pass++) {
    const chain =
      `volume=${gain.toFixed(3)}dB,alimiter=limit=${limit}:${m.limiter},` +
      'aformat=sample_fmts=fltp:channel_layouts=stereo';
    await filterFile(job.pre, chain, job.out, mp3(m.bitrate), 'mp3', job.comment);
    const measured = await measureFile(job.out, style.rate);
    const miss = m.targetLufs - measured.lufs;
    if (Math.abs(miss) <= m.within || pass >= m.passes) return { ...measured, passes: pass };
    gain += miss;
  }
};

/** The master (see the module's doc): the MP3 at `out`, measured. */
export const masterHymn = (job: MasterInput) =>
  Effect.tryPromise({
    try: () => master(job),
    catch: (cause) => RenderFailed.make({ step: `master ${job.out}`, reason: String(cause) }),
  });
