/**
 * Copy reused paintings into the deck and center-crop two copies of each:
 * <id>-full.png (16:9, full-bleed slide) and <id>-panel.png (750:903, split).
 *
 *   bun skills/bible/scripts/deck/prepare_images.ts <deckDir>
 */
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readManifest } from './manifest.ts';

const [deckArg] = Bun.argv.slice(2);
if (deckArg === undefined) throw new Error('usage: prepare_images.ts <deckDir>');
const deckDir = resolve(deckArg);
const manifest = await readManifest(deckDir);
const image = (name: string) => resolve(deckDir, 'images', name);

const dimensions = (file: string) => {
  const output = Bun.spawnSync([
    'sips',
    '-g',
    'pixelWidth',
    '-g',
    'pixelHeight',
    file,
  ]).stdout.toString();
  const width = Number(output.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight:\s+(\d+)/)?.[1]);
  if (!width || !height) throw new Error(`Could not read dimensions: ${file}`);
  return { width, height };
};

/** Largest centered crop of `source` with aspect ratio w:h. */
const cropTo = (source: string, output: string, w: number, h: number) => {
  const { width, height } = dimensions(source);
  const fitWidth = Math.floor((height * w) / h);
  const [cropHeight, cropWidth] =
    fitWidth <= width ? [height, fitWidth] : [Math.floor((width * h) / w), width];
  const result = Bun.spawnSync(
    ['sips', '-c', String(cropHeight), String(cropWidth), source, '--out', output],
    { stderr: 'inherit' },
  );
  if (result.exitCode !== 0) throw new Error(`Crop failed: ${source}`);
};

for (const slide of manifest.slides) {
  const source = resolve(deckDir, slide.sourceImage);
  const local = image(`${slide.id}.png`);
  if (source !== local) await copyFile(source, local);
  cropTo(local, image(`${slide.id}-full.png`), 16, 9);
  cropTo(local, image(`${slide.id}-panel.png`), 750, 903);
}
cropTo(image('title.png'), image('title-full.png'), 16, 9);

console.log(`Prepared title and ${manifest.slides.length} image pairs`);
