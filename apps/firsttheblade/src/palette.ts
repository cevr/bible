/**
 * The brand's colours: palette 09, “Morning under a blue sky”, drawn from
 * combination no. 294 of Sanzo Wada's *A Dictionary of Color Combinations*
 * (the hexes as the mattdesl dataset gives them): Sulpher Yellow #f5ecc2,
 * Cream Yellow #fdbf68, Cossack Green #437742 and Salvia Blue #97acc8. The
 * owner chose it in brand round 4 (2026-10-19).
 *
 * The stylesheet's `:root` names each role as `--color-<role>` with these
 * same values (the tests hold the two together); the link cards, the icons
 * and the YouTube kit (`kit/draw.ts`) read them from here.
 */

/** Each role the site and the kit use, and where it comes from. */
export const PALETTE = {
  /** The page by day: Sulpher Yellow, tinted 55%. */
  paper: '#faf7e4',
  /** The reasons band and the dusk's first colour: Sulpher Yellow. */
  band: '#f5ecc2',
  /** The torn paper strips and cards. */
  strip: '#fcfbf0',
  /** Text and the wordmark: Cossack Green, shaded 55%. */
  ink: '#2c4542',
  /** Quiet text: the ink toward the paper. */
  soft: '#5a6d67',
  /** Labels, references and “the”: Cossack Green, moved 4% toward the ink. */
  accent: '#427542',
  /** The blade in the emblems: Cossack Green. */
  green: '#437742',
  /** The ear in the emblems and the night's accent: Cream Yellow. */
  gold: '#fdbf68',
  /** The ploughed soil: Cream Yellow, shaded 55%. */
  soil: '#776357',
  /** The morning sky: Salvia Blue, tinted 35%. */
  sky: '#bac9db',
  /** The page by night: Salvia Blue, shaded 72%. */
  night: '#3a415f',
  /** Text by night: Sulpher Yellow. */
  nightInk: '#f5ecc2',
  /** Accent by night: Cream Yellow. */
  nightAccent: '#fdbf68',
  /** Quiet text by night. */
  nightSoft: '#c5c2ab',
  /** The rule over the footer: the night toward its text. */
  nightRule: '#51576d',
  /** The dusk's warm middle: the soil toward the sky. */
  duskWarm: '#99837b',
  /** The dusk's deep end: the soil toward the night. */
  duskDeep: '#565062',
  /** Under the hero's words: the soil, shaded. */
  scrim: '#4b434c',
  /** The glow behind the hero's words. */
  glow: '#3d3947',
  /** The shadow a strip of paper casts. */
  shadow: '#46386e',
} as const;

export type Role = keyof typeof PALETTE;
