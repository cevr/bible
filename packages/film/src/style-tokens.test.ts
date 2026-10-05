// The studio's look is read only through its tokens (`player/tokens.css`,
// design language §3): no stylesheet, `*_CSS` string, Solid `style={{…}}`,
// `.style.x =`, `.style['x'] =` or `setProperty`, SVG `fill=`/`stroke=` attribute or canvas
// paint (`ctx.fillStyle =`) outside that file names a colour, a font family
// or a font size of its own. A colour is a hex (`#e0ad45`), a colour function
// of numbers (`rgb(255 255 255 / 0.2)`; one built from tokens or from data,
// `hsl(${hue} var(--scene-sat) …)`, is not) or a named colour on a colour
// property; a canvas in the chrome paints with a colour read from a token,
// never a literal. A font family or size is any value but `var(…)` or
// `inherit` (quoted or not, the value read whole from where it begins), a
// `font` shorthand with a size in it, and any string named a
// family (`FACE_FAMILY = '…'`). Canvas code draws film pixels, not the
// studio's chrome, and keeps its own colours: `canvas/`, the look-book's
// sheet and the contact sheet drawn on a canvas, and the fixture films (the
// look-book's page around its sheet is chrome and is read). So does paper:
// the reading sheet is printed for the narrator at the microphone, light and
// in a book face, never shown in the studio. One family is written outside
// the tokens, the UI face's own registration (`player/face.ts`: its faces,
// and the `@font-face` rule a page's head declares), and it is held to the
// token: it is the family `--font` names first.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

/** The source tree this guard reads. */
const ROOT = import.meta.dir;

/** The one file colours and type are written in. */
const TOKENS = 'player/tokens.css';

/** The UI face's registration, which names the family its files hold. */
const FACE = 'player/face.ts';

/**
 * Not the studio's chrome: canvas code draws the film's pixels in the film's
 * own colours, and the reading sheet is a page printed on paper.
 */
const OUTSIDE = [
  'canvas/',
  'lab/fixtures/',
  'player/lookbook-sheet.ts',
  'player/contact.ts',
  'core/sheet.ts',
];

/** The colours a reader names by word. */
const NAMED = 'white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver';

/** A colour property, as CSS writes it or as a style object, `.style` or an SVG attribute does. */
const COLOUR_PROPERTY =
  'color|background(?:-?[cC]olor)?|border(?:-?[a-zA-Z]+)?-?[cC]olor|outline-?[cC]olor|fill|stroke|stop-?[cC]olor|flood-?[cC]olor';

/**
 * Where a property `name` (a CSS or style-object key, or a `.style` key) is
 * set, up to where its value begins: `name:` or `'name':`, `.name =`, or
 * `['name'] =` by its key in brackets.
 */
const setting = (name: string) => `${name}(?:['"\`]?\\s*:|['"\`]\\s*\\]\\s*=|\\s*=)`;

/**
 * As `setting`, for a CSS name (`font-size`): set by `:` or by its key in
 * brackets, never by a bare `=` (an attribute's).
 */
const cssSetting = (name: string) => `${name}(?:['"\`]?\\s*:|['"\`]\\s*\\]\\s*=)`;

/**
 * Not a token: the value, from where it begins, is no `var(…)` and no
 * `inherit`, quoted or not. Looked at once, from that one place: a quote
 * skipped is never a place to look again from.
 */
const NOT_TOKEN = `(?!\\s*['"\`]?\\s*(?:var\\(|inherit))`;

/** What a line may not hold: each with the reason a reader gets, and any file it spares. */
const RULES: ReadonlyArray<{
  readonly why: string;
  readonly pattern: RegExp;
  readonly spares?: ReadonlyArray<string>;
}> = [
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
    pattern: new RegExp(
      `(?<![\\w-])${setting(`(?:${COLOUR_PROPERTY})`)}\\s*\\{?\\s*['"\`]?(?:${NAMED})\\b`,
    ),
  },
  {
    why: 'a colour attribute of its own',
    pattern: new RegExp(
      `(?<![\\w.-])(?:fill|stroke|stop-color|flood-color|color)=\\{?\\s*['"\`](?!\\s*(?:none|currentColor|transparent|inherit|var\\(|url\\())`,
    ),
  },
  {
    why: 'a colour attribute of its own',
    pattern:
      /setAttribute\(\s*['"`](?:fill|stroke|stop-color|flood-color|color)['"`]\s*,\s*['"`](?!\s*(?:none|currentColor|transparent|inherit|var\(|url\())/,
  },
  {
    why: 'a canvas painting a literal',
    pattern: /\b(?:fillStyle|strokeStyle|shadowColor)\s*=\s*['"`]/,
  },
  {
    why: 'a style property set to a value of its own',
    pattern:
      /setProperty\(\s*['"`](?:color|background(?:-color)?|border(?:-[a-z]+)?-color|outline-color|fill|stroke|font|font-family|font-size)['"`]\s*,\s*['"`](?!\s*(?:var\(|inherit))/,
  },
  {
    why: 'a font family',
    pattern: new RegExp(`${cssSetting('font-family')}${NOT_TOKEN}`),
    spares: [FACE],
  },
  {
    why: 'a font family',
    pattern: new RegExp(`${setting('(?:family|Family|FAMILY)')}\\s*['"\`]${NOT_TOKEN}`),
    spares: [FACE],
  },
  { why: 'a font family', pattern: /new FontFace\(\s*['"`]/ },
  { why: 'a font size', pattern: new RegExp(`${cssSetting('font-size')}${NOT_TOKEN}`) },
  { why: 'a font size', pattern: new RegExp(`${setting('fontSize')}\\s*['"\`]${NOT_TOKEN}`) },
  {
    why: 'a font shorthand of its own',
    pattern: new RegExp(
      `(?<![\\w-])${setting('font')}${NOT_TOKEN}\\s*['"\`]?[^;'"\`]*\\d(?:px|r?em|pt|%|\\s*\\/)`,
    ),
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

/** The rules `line` of `file` breaks. */
const broken = (file: string, line: string) =>
  RULES.filter(
    (rule) => rule.pattern.test(line) && !(rule.spares ?? []).some((spared) => spared === file),
  );

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
              broken(file, line).map((rule) => `${file}:${i + 1} ${rule.why}: ${line.trim()}`),
            ),
        ),
      ),
  );
  return found.flat().toSorted();
});

/** The first family a CSS family list names, unquoted (`'JetBrains Mono', monospace` → `JetBrains Mono`). */
const firstFamily = (list: string) => (list.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');

describe('the studio reads its look only through its tokens', () => {
  it.effect.layer(BunServices.layer)(
    'no colour, font family or font size outside tokens.css but in canvas code',
    () =>
      Effect.gen(function* () {
        expect(yield* offences).toEqual([]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "the UI face registers the family the tokens' --font names first",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tokens = yield* fs.readFileString(`${ROOT}/${TOKENS}`);
        const face = yield* fs.readFileString(`${ROOT}/${FACE}`);
        const token = /--font:\s*([^;]+);/.exec(tokens)?.[1] ?? '';
        const registered = /FACE_FAMILY = '([^']+)'/.exec(face)?.[1] ?? '';
        expect(registered).not.toBe('');
        expect(registered).toBe(firstFamily(token));
      }),
  );

  it.effect('each rule refuses what it names, and lets a token through', () =>
    Effect.sync(() => {
      const refused = (line: string) => broken('lab/any.tsx', line).length > 0;
      const refusedLines = [
        'color: #e0ad45;',
        "seg.style.background = '#fff';",
        'border: 1px solid rgb(255 255 255 / 0.2);',
        'background: white;',
        'font-family: Inter, sans-serif;',
        "style={{ fontSize: '12px' }}",
        'font-size: 13px;',
        'font: 14px/1.5 monospace;',
        // A Solid style object.
        "style={{ color: 'white' }}",
        "style={{ 'background-color': 'black', left: pct(t) }}",
        "style={{ 'font-family': 'Inter' }}",
        // An SVG attribute.
        '<path fill="white" d="M0 0" />',
        "<line stroke='black' x1={0} />",
        "el.setAttribute('stroke', 'grey');",
        // A canvas in the chrome painting a literal.
        "ctx.fillStyle = 'black';",
        'ctx.strokeStyle = `gold`;',
        "ctx.shadowColor = 'transparent';",
        "ctx.font = '12px Inter';",
        'ctx.font = `500 15px ${body}`;',
        // A `.style` assignment.
        "tip.style.color = 'white';",
        "tip.style.backgroundColor = 'black';",
        "tip.style.fontFamily = 'Inter';",
        "tip.style.fontSize = '11px';",
        "tip.style.setProperty('color', 'white');",
        "tip.style.setProperty('font-size', '12px');",
        // A `.style` assignment by its key in brackets.
        "el.style['fontSize'] = '12px';",
        "el.style['fontFamily'] = 'Inter';",
        'el.style["font-size"] = "12px";',
        "el.style['font'] = '12px Inter';",
        "el.style['color'] = 'white';",
        'el.style[`backgroundColor`] = `black`;',
        // A family named in a string.
        "const FACE_FAMILY = 'JetBrains Mono';",
        "new FontFace('Inter', url);",
        "{ family: 'Inter' }",
      ];
      const allowedLines = [
        'color: var(--accent);',
        'font: inherit;',
        'font-size: var(--fs-2);',
        'font-family: var(--font);',
        'const hue = (i: number) => `hsl(${(i * 47) % 360} var(--scene-sat) var(--scene-light))`;',
        'yield* page.goto(`${PROJECT}#point-take%3Apaper.hum`);',
        'href="#t=2"',
        "style={{ left: pct(props.placed, at), width: '40%' }}",
        "style={{ color: 'var(--ink)' }}",
        // A token quoted as a style object's value.
        "style={{ 'font-size': 'var(--fs-2)' }}",
        "style={{ 'font-family': 'var(--font)' }}",
        "style={{ 'font-family': 'inherit', fontSize: 'var(--fs-1)' }}",
        "style={{ fontFamily: 'var(--font)' }}",
        'font-family: "var(--font)";',
        // A token set by its key in brackets.
        "el.style['fontSize'] = 'var(--fs-1)';",
        "el.style['fontFamily'] = 'var(--font)';",
        "el.style['color'] = 'var(--ink)';",
        '<path fill="none" stroke="currentColor" d="M0 0" />',
        '<path fill="var(--accent)" />',
        'seg.style.backgroundColor = hue(p.index);',
        "tip.style.setProperty('--x', '12px');",
        'ctx.fillStyle = ink;',
        "el.animate(frames, { fill: 'forwards' });",
        'new FontFace(FACE_FAMILY, url);',
      ];
      // Every line it names is refused, and every token (and all else a line may hold) let
      // through: the lines each list gets wrong, both at once.
      expect({
        letThrough: refusedLines.filter((line) => !refused(line)),
        refused: allowedLines.filter(refused),
      }).toEqual({ letThrough: [], refused: [] });
      // The face's own family is spared only in its registration.
      expect(broken(FACE, "const FACE_FAMILY = 'JetBrains Mono';")).toEqual([]);
    }),
  );
});
