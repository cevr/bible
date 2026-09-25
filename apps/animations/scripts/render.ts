// Render a film to video, stills, or a contact sheet, frame by frame, in
// headless Chromium. Each frame is a pure function of time, so pages render
// disjoint frame ranges in parallel and the pieces are stitched with ffmpeg.
//
//   bun scripts/render.ts <film>                         → out/<film>.mp4
//   bun scripts/render.ts <film> --stills 3,10.5,20      → out/<film>/stills/*.png
//   bun scripts/render.ts <film> --contact 2             → out/<film>/contact.jpg (a frame every 2s)
//   flags: --scene id[,id] --from S --to S --workers N --scale 0.5 --no-captions --out path

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from 'playwright-core';
import type { ExportHandle } from '@bible/film/player';
import { layout, type Timings } from '@bible/film/core';
import type { SceneSpec } from '@bible/film/canvas';
import { serve } from '../server.ts';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    stills: { type: 'string' },
    contact: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    workers: { type: 'string', default: '4' },
    scale: { type: 'string', default: '1' },
    'no-captions': { type: 'boolean', default: false },
    out: { type: 'string' },
    tag: { type: 'string' },
    scene: { type: 'string' },
  },
});

const film = positionals[0];
if (film === undefined) {
  console.error(
    'usage: bun scripts/render.ts <film> [--stills t,t] [--contact secs] [--from s] [--to s] [--workers n]',
  );
  process.exit(2);
}

const ROOT = join(import.meta.dir, '..');

// `--scene id[,id]` sets --from/--to to span those scenes, read from the film's own layout.
if (values.scene !== undefined) {
  const dir = join(ROOT, 'src', 'films', film);
  const { scenes } = (await import(join(dir, 'scenes', 'index.ts'))) as { scenes: SceneSpec[] };
  const file = Bun.file(join(dir, 'narration', 'timings.json'));
  const timings = (await file.exists()) ? ((await file.json()) as Timings) : undefined;
  const ids = new Set(values.scene.split(','));
  const hit = layout(scenes, timings).filter((p) => ids.has(p.spec.id));
  if (hit.length !== ids.size) throw new Error(`unknown scene in --scene ${values.scene}`);
  values.from = String(Math.min(...hit.map((p) => p.start)));
  values.to = String(Math.max(...hit.map((p) => p.start + p.dur)));
}
const OUT = join(ROOT, 'out', film, values.tag ?? '');
await mkdir(OUT, { recursive: true });

const server = serve(0, false);
const scale = Number(values.scale);
const url = `${server.url}?film=${film}&export${values['no-captions'] ? '&captions=0' : ''}`;

const run = async (cmd: string[], stdin?: 'pipe') => {
  const proc = Bun.spawn(cmd, { stdin: stdin ?? 'ignore', stdout: 'ignore', stderr: 'pipe' });
  return proc;
};

const open = async (browser: Browser) => {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => console.error(`[render] page error ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__film !== undefined, undefined, { timeout: 60_000 });
  const info = await page.evaluate(() => {
    const f = window.__film as ExportHandle;
    return {
      width: f.width,
      height: f.height,
      fps: f.fps,
      duration: f.duration,
      frames: f.frames,
      audio: f.audio,
    };
  });
  const frame = async (i: number, type: 'image/png' | 'image/jpeg' = 'image/png') =>
    Buffer.from(
      await page.evaluate(([n, ty]) => (window.__film as ExportHandle).frame(n, ty), [
        i,
        type,
      ] as const),
      'base64',
    );
  return { page, info, frame };
};

const browser = await chromium.launch({
  args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
try {
  const first = await open(browser);
  const { fps, duration, frames, audio } = first.info;
  const vf = scale === 1 ? [] : ['-vf', `scale=iw*${scale}:ih*${scale}:flags=lanczos`];

  if (values.stills !== undefined) {
    const dir = join(OUT, 'stills');
    await mkdir(dir, { recursive: true });
    for (const s of values.stills.split(',')) {
      const t = Number(s);
      const i = Math.min(frames - 1, Math.round(t * fps));
      const file = join(dir, `t${t.toFixed(2).padStart(7, '0')}.png`);
      await Bun.write(file, await first.frame(i));
      console.log(`[render] still t=${t} file=${file}`);
    }
  } else if (values.contact !== undefined) {
    const every = Number(values.contact);
    const dir = join(OUT, 'contact');
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    let k = 0;
    for (let t = Number(values.from ?? 0); t < Number(values.to ?? duration); t += every) {
      await Bun.write(
        join(dir, `${String(k++).padStart(4, '0')}.jpg`),
        await first.frame(Math.round(t * fps), 'image/jpeg'),
      );
    }
    const cols = 6;
    const rows = Math.ceil(k / cols);
    const sheet = join(OUT, 'contact.jpg');
    const ff = await run([
      'ffmpeg',
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      '1',
      '-i',
      join(dir, '%04d.jpg'),
      '-vf',
      `scale=480:-1,tile=${cols}x${rows}:padding=4`,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      sheet,
    ]);
    if ((await ff.exited) !== 0) throw new Error(await new Response(ff.stderr).text());
    console.log(`[render] contact frames=${k} every=${every}s file=${sheet}`);
  } else {
    const start = Math.round(Number(values.from ?? 0) * fps);
    const end = Math.min(frames, Math.round(Number(values.to ?? duration) * fps));
    const workers = Math.max(1, Math.min(Number(values.workers), end - start));
    const per = Math.ceil((end - start) / workers);
    const segDir = join(OUT, 'segments');
    await rm(segDir, { recursive: true, force: true });
    await mkdir(segDir, { recursive: true });
    const began = performance.now();
    let done = 0;
    const pages = [
      first,
      ...(await Promise.all(Array.from({ length: workers - 1 }, () => open(browser)))),
    ];
    const segments = await Promise.all(
      pages.map(async (p, w) => {
        const a = start + w * per;
        const b = Math.min(end, a + per);
        const file = join(segDir, `${String(w).padStart(3, '0')}.mp4`);
        const ff = await run(
          [
            'ffmpeg',
            '-y',
            '-loglevel',
            'error',
            '-f',
            'image2pipe',
            '-framerate',
            String(fps),
            '-i',
            '-',
            ...vf,
            '-c:v',
            'libx264',
            '-preset',
            'slow',
            '-crf',
            '15',
            '-pix_fmt',
            'yuv420p',
            '-tune',
            'animation',
            file,
          ],
          'pipe',
        );
        for (let i = a; i < b; i++) {
          ff.stdin?.write(await p.frame(i));
          done++;
          if (done % 60 === 0) {
            const rate = done / ((performance.now() - began) / 1000);
            console.log(
              `[render] progress frames=${done}/${end - start} fps=${rate.toFixed(1)} eta=${((end - start - done) / rate).toFixed(0)}s`,
            );
          }
        }
        await ff.stdin?.end();
        if ((await ff.exited) !== 0) throw new Error(await new Response(ff.stderr).text());
        return file;
      }),
    );
    const list = join(segDir, 'list.txt');
    await Bun.write(list, segments.map((s) => `file '${s}'`).join('\n'));
    const out = values.out ?? join(ROOT, 'out', `${film}.mp4`);
    const audioFile =
      audio === undefined
        ? undefined
        : join(ROOT, 'src', decodeURIComponent(audio).replace(/^\//, ''));
    const withAudio = audioFile !== undefined && (await Bun.file(audioFile).exists());
    const ff = await run([
      'ffmpeg',
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      ...(withAudio
        ? ['-ss', String(start / fps), '-i', audioFile, '-c:a', 'aac', '-b:a', '192k', '-shortest']
        : []),
      '-c:v',
      'copy',
      '-movflags',
      '+faststart',
      out,
    ]);
    if ((await ff.exited) !== 0) throw new Error(await new Response(ff.stderr).text());
    console.log(
      `[render] done frames=${end - start} audio=${withAudio} secs=${((performance.now() - began) / 1000).toFixed(1)} file=${out}`,
    );
  }
} finally {
  await browser.close();
  await server.stop(true);
}
