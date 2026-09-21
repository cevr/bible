/**
 * Write <deckDir>/build-deck.applescript from the manifest: title slide, then
 * per beat a full-bleed slide and a split slide (panel + verse + reference),
 * presenter note on both.
 *
 *   bun skills/bible/scripts/deck/gen_applescript.ts <deckDir>
 *   osascript <deckDir>/build-deck.applescript
 */
import { resolve } from 'node:path';
import { readManifest } from './manifest.ts';

const [deckArg] = Bun.argv.slice(2);
if (deckArg === undefined) throw new Error('usage: gen_applescript.ts <deckDir>');
const deckDir = resolve(deckArg);
const manifest = await readManifest(deckDir);

const esc = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
const sizeFor = (text: string) =>
  text.length <= 180 ? 48 : text.length <= 300 ? 40 : text.length <= 430 ? 34 : 30;
const WHITE = '{65535, 65535, 65535}';
const GRAY = '{39321, 39321, 39321}';

const textItem = (
  name: string,
  text: string,
  box: string,
  font: string,
  size: number,
  color: string,
) => [
  `      set ${name} to make new text item with properties {object text:"${esc(text)}", ${box}}`,
  `      set the font of the object text of ${name} to "${font}"`,
  `      set the size of the object text of ${name} to ${size}`,
  `      set the color of the object text of ${name} to ${color}`,
];

const lines: Array<string> = [
  `set rootPath to "${esc(deckDir)}"`,
  `set savePath to rootPath & "/${esc(manifest.deckName)}.key"`,
  `tell application "${esc(manifest.app)}"`,
  `  activate`,
  `  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}`,
  `  tell theDoc`,
  `    set base slide of slide 1 to master slide "Blank"`,
  `    tell slide 1`,
  `      make new image with properties {file:(POSIX file (rootPath & "/images/title-full.png")), position:{0, 0}, width:1920, height:1080}`,
  ...textItem(
    'titleItem',
    manifest.title,
    'position:{140, 820}, width:1640, height:100',
    'Helvetica Neue Light',
    66,
    WHITE,
  ),
  ...textItem(
    'subItem',
    manifest.subtitle,
    'position:{145, 925}, width:1500, height:60',
    'Helvetica Neue',
    30,
    WHITE,
  ),
  `    end tell`,
];

for (const slide of manifest.slides) {
  const imageX = slide.side === 'right' ? 1037 : 133;
  const textX = slide.side === 'right' ? 131 : 984;
  const fontSize = sizeFor(slide.text);
  lines.push(
    `    set fb to make new slide at end with properties {base slide:master slide "Blank"}`,
    `    tell fb`,
    `      make new image with properties {file:(POSIX file (rootPath & "/images/${slide.id}-full.png")), position:{0, 0}, width:1920, height:1080}`,
    `      set presenter notes to "${esc(slide.note)}"`,
    `    end tell`,
    `    set sp to make new slide at end with properties {base slide:master slide "Blank"}`,
    `    tell sp`,
    `      make new image with properties {file:(POSIX file (rootPath & "/images/${slide.id}-panel.png")), position:{${imageX}, 75}, width:750, height:903}`,
    ...textItem(
      'verseItem',
      slide.text,
      `position:{${textX}, 300}, width:805`,
      'Helvetica Neue Light',
      fontSize,
      WHITE,
    ),
    ...textItem(
      'refItem',
      slide.ref,
      `position:{${textX}, 700}, width:805, height:55`,
      'Helvetica Neue',
      30,
      GRAY,
    ),
    // Keynote sizes the verse box to its wrapped text: measure it, then center
    // the verse + reference block instead of estimating line counts.
    `      set verseHeight to height of verseItem`,
    `      set verseY to (1080 - verseHeight - 95) div 2`,
    `      set position of verseItem to {${textX}, verseY}`,
    `      set position of refItem to {${textX}, verseY + verseHeight + 40}`,
    `      set presenter notes to "${esc(slide.note)}"`,
    `    end tell`,
  );
}

lines.push(
  `    save theDoc in POSIX file savePath`,
  `  end tell`,
  `  return "Built " & (count of slides of theDoc) & " slides at " & savePath`,
  `end tell`,
);

await Bun.write(resolve(deckDir, 'build-deck.applescript'), `${lines.join('\n')}\n`);
console.log(`Wrote build-deck.applescript for ${1 + manifest.slides.length * 2} slides`);
