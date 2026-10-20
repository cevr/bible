/**
 * The app's colours: nine roles in light and dark, all drawn from Sanzo Wada's
 * combination No. 167 (Ecru, Pale King's Blue, Vandar Poel's Blue), the
 * palette A the owner chose for Selah and the hymnal. A screen reads a role
 * (`color.ts` on the web, `color.native.ts` on a phone), never a hex value.
 *
 * The roles follow the palette page's `theme()`: a light ground is Ecru mixed
 * toward white, a dark ground is the ink mixed toward black. Two mixes are
 * shallower than the page's so each text role meets WCAG AA on what it sits
 * on (`theme.test.ts`): light muted mixes 20% toward the ground (35% reads at
 * 3.32:1), and dark soft mixes 70% toward the ground (55% leaves the ink at
 * 3.75:1 on a pressed row). Text on the accent (`onAccent`) is the page's
 * near-black where it meets AA on the fill, else white, else black
 * (`onColor`), so any accent a palette gives has AA text on it. A pressed
 * accent is a fill of its own (`pressed`), with its own text (`onPressed`),
 * so the pressed state keeps AA too.
 */

const wada167 = {
  ecru: '#c2ae93',
  paleKingsBlue: '#a7d4e4',
  vandarPoelsBlue: '#064f6e',
} as const;

export interface Roles {
  /** The screen's background. */
  readonly ground: string;
  /** Body text and titles. */
  readonly ink: string;
  /** Secondary text: section labels, placeholders, the refrain's mark. */
  readonly muted: string;
  /** Separators and outlines; never under text. */
  readonly line: string;
  /** The tab tint, the hymn number, links. */
  readonly accent: string;
  /** A pressed row, a selection: under ink and accent text. */
  readonly soft: string;
  /** Text drawn on an accent fill: the play button's label on the web and Android. */
  readonly onAccent: string;
  /** The accent fill while it is pressed: the accent mixed a fifth toward the ground. */
  readonly pressed: string;
  /** Text drawn on the pressed fill, picked for it as `onAccent` is for the accent. */
  readonly onPressed: string;
}

type Rgb = readonly [number, number, number];

const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);

/** A hex colour's red, green and blue, 0 to 255. */
const rgb = (hex: string): Rgb => [channel(hex, 1), channel(hex, 3), channel(hex, 5)];

const hex = (channels: Rgb) =>
  `#${channels
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** `a` mixed `t` of the way toward `b`, per sRGB channel, as the palette page mixes. */
const mix = (a: string, b: string, t: number): string => {
  const [r, g, bl] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return hex([r + (r2 - r) * t, g + (g2 - g) * t, bl + (b2 - bl) * t]);
};

/** An sRGB channel (0 to 255) as linear light, with the palette page's knee at 0.03928. */
const linear = (channel: number) => {
  const c = channel / 255;
  if (c <= 0.03928) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
};

/** A colour's relative luminance, 0 to 1. */
const luminance = (color: string) => {
  const [r, g, b] = rgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG 2's contrast ratio between two colours, 1 to 21. */
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Text on a fill of `fill`: the palette page's near-black where it meets
 * WCAG AA (4.5:1), else white where it does, else black. White and black
 * between them meet AA on every fill; the page's own pick by luminance
 * (near-black above 0.35) leaves fills between 0.1833 and 0.35 under it.
 */
export const onColor = (fill: string) =>
  ['#111314', '#ffffff'].find((text) => contrast(text, fill) >= 4.5) ?? '#000000';

const lightGround = mix(wada167.ecru, '#ffffff', 0.72);
const darkGround = mix(wada167.vandarPoelsBlue, '#000000', 0.55);
const darkInk = mix(wada167.ecru, '#ffffff', 0.55);
const lightPressed = mix(wada167.vandarPoelsBlue, lightGround, 0.2);
const darkPressed = mix(wada167.paleKingsBlue, darkGround, 0.2);

export const theme = {
  light: {
    ground: lightGround,
    ink: wada167.vandarPoelsBlue,
    muted: mix(wada167.vandarPoelsBlue, lightGround, 0.2),
    line: mix(wada167.ecru, wada167.vandarPoelsBlue, 0.22),
    accent: wada167.vandarPoelsBlue,
    soft: mix(wada167.paleKingsBlue, '#ffffff', 0.25),
    onAccent: onColor(wada167.vandarPoelsBlue),
    pressed: lightPressed,
    onPressed: onColor(lightPressed),
  },
  dark: {
    ground: darkGround,
    ink: darkInk,
    muted: mix(darkInk, darkGround, 0.4),
    line: mix(darkGround, darkInk, 0.2),
    accent: wada167.paleKingsBlue,
    soft: mix(wada167.paleKingsBlue, darkGround, 0.7),
    onAccent: onColor(wada167.paleKingsBlue),
    pressed: darkPressed,
    onPressed: onColor(darkPressed),
  },
} as const satisfies { readonly light: Roles; readonly dark: Roles };
