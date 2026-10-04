// The studio's look is read only through its tokens (`player/tokens.css`,
// design language §3): no stylesheet, `*_CSS` string, inline `style` or
// `.style.x =` outside that file names a colour, a font family or a font
// size of its own. A colour is a hex (`#e0ad45`), a colour function of
// numbers (`rgb(255 255 255 / 0.2)`; one built from tokens or from data,
// `hsl(${hue} var(--scene-sat) …)`, is not) or a named colour on a colour
// property; a font family or size is any value but `var(…)` or `inherit`,
// and a `font:` shorthand with a size in it. Canvas code draws film pixels,
// not the studio's chrome, and keeps its own colours: `canvas/`, the
// look-book and the contact sheet drawn on a canvas, and the fixture films.
// So does paper: the reading sheet is printed for the narrator at the
// microphone, light and in a book face, never shown in the studio.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

/** The source tree this guard reads. */
const ROOT = import.meta.dir;

/** The one file colours and type are written in. */
const TOKENS = 'player/tokens.css';

/**
 * Not the studio's chrome: canvas code draws the film's pixels in the film's
 * own colours, and the reading sheet is a page printed on paper.
 */
const OUTSIDE = [
  'canvas/',
  'lab/fixtures/',
  'player/lookbook.ts',
  'player/contact.ts',
  'core/sheet.ts',
];

/** What a line may not hold: each with the reason a reader gets. */
const RULES: ReadonlyArray<{ readonly why: string; readonly pattern: RegExp }> = [
  {
    why: 'a hex colour',
    pattern: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/,
  },
  {
    why: 'a colour function of numbers',
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/,
  },
  {
    why: 'a named colour',
    pattern:
      /\b(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|outline-color|fill|stroke)\s*:\s*(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver)\b/,
  },
  { why: 'a font family', pattern: /font-family\s*:\s*(?!\s*(?:var\(|inherit))/ },
  { why: 'a font family', pattern: /fontFamily\s*:\s*['"`](?!var\()/ },
  { why: 'a font size', pattern: /font-size\s*:\s*(?!\s*(?:var\(|inherit))/ },
  { why: 'a font size', pattern: /fontSize\s*:\s*['"`](?!var\()/ },
  {
    why: 'a font shorthand of its own',
    pattern: /(?<![\w-])font\s*:\s*(?!\s*(?:var\(|inherit))[^;'"`]*\d(?:px|r?em|pt|%|\s*\/)/,
  },
];

/** A stylesheet or a module; a test quotes literals freely. */
const SOURCE = /\.(?:css|tsx?)$/;
const TEST = /\.test\.tsx?$/;

/** Is `file` a source of the studio's chrome? */
const isChrome = (file: string) =>
  SOURCE.test(file) &&
  !TEST.test(file) &&
  file !== TOKENS &&
  !OUTSIDE.some((prefix) => file.startsWith(prefix));

/** Every line of the studio's styling sources that breaks a rule: `file:line why: text`. */
const offences = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const files = yield* fs.readDirectory(ROOT, { recursive: true });
  const found = yield* Effect.forEach(files.filter(isChrome), (file) =>
    fs
      .readFileString(`${ROOT}/${file}`)
      .pipe(
        Effect.map((text) =>
          text
            .split('\n')
            .flatMap((line, i) =>
              RULES.filter((rule) => rule.pattern.test(line)).map(
                (rule) => `${file}:${i + 1} ${rule.why}: ${line.trim()}`,
              ),
            ),
        ),
      ),
  );
  return found.flat().toSorted();
});

describe('the studio reads its look only through its tokens', () => {
  it.effect.layer(BunServices.layer)(
    'no colour, font family or font size outside tokens.css but in canvas code',
    () =>
      Effect.gen(function* () {
        expect(yield* offences).toEqual([]);
      }),
  );

  it.effect('each rule refuses what it names, and lets a token through', () =>
    Effect.sync(() => {
      const refused = (line: string) => RULES.some((r) => r.pattern.test(line));
      for (const line of [
        'color: #e0ad45;',
        "seg.style.background = '#fff';",
        'border: 1px solid rgb(255 255 255 / 0.2);',
        'background: white;',
        'font-family: Inter, sans-serif;',
        "style={{ fontSize: '12px' }}",
        'font-size: 13px;',
        'font: 14px/1.5 monospace;',
      ])
        expect([line, refused(line)]).toEqual([line, true]);
      for (const line of [
        'color: var(--accent);',
        'font: inherit;',
        'font-size: var(--fs-2);',
        'font-family: var(--font);',
        'const hue = (i: number) => `hsl(${(i * 47) % 360} var(--scene-sat) var(--scene-light))`;',
        'yield* page.goto(`${PROJECT}#point-take%3Apaper.hum`);',
        'href="#t=2"',
      ])
        expect([line, refused(line)]).toEqual([line, false]);
    }),
  );
});
