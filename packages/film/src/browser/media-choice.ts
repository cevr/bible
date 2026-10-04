// Which player a compare plays on, chosen by what the browser and the file
// allow (the mediabunny spike, `prior-art-mediabunny-player.md`): the
// WebCodecs panes (`frame-pane.ts` over `webcodecs-browser.ts`) hold two
// versions on one clock and step exactly, so they play where the browser has
// `VideoDecoder`, can decode the file's picture, and can decode its sound
// (`AudioDecoder`) or the sound is PCM (decoded in script) or absent. iOS
// 16.4–18 has the picture half only: an AAC render there plays on `<video>`.
// A phone plays `<video>` until one iPhone is measured (the panes took 2.5–4×
// the page memory here, and iOS ends heavy tabs). `<video>` keeps every
// action, so the fallback costs precision, never a capability.

/** What the browser can decode. */
export interface BrowserCodecs {
  readonly videoDecoder: boolean;
  readonly audioDecoder: boolean;
  /** A coarse pointer: a phone or a tablet. */
  readonly phone: boolean;
}

/** What a file needs, as the browser answered for its tracks. */
export interface TrackCodecs {
  /** Its picture can be decoded here. */
  readonly video: boolean;
  /** Its sound: none, PCM (decoded in script), or coded (AAC, Opus…). */
  readonly audio: 'none' | 'pcm' | 'coded';
  /** Its sound can be decoded here. */
  readonly audioDecodable: boolean;
}

/** The engine a compare plays on, and why it is not the panes when it is not. */
export type Engine =
  | { readonly engine: 'webcodecs' }
  | { readonly engine: 'video'; readonly why: string };

const video = (why: string): Engine => ({ engine: 'video', why });

/** The engine for a file with `track`'s codecs in a browser with `browser`'s. */
export const engineFor = (browser: BrowserCodecs, track: TrackCodecs): Engine => {
  if (browser.phone) return video('a phone plays <video> until one is measured');
  if (!browser.videoDecoder) return video('this browser has no WebCodecs');
  if (!track.video) return video('this browser cannot decode the picture');
  if (track.audio === 'coded' && !(browser.audioDecoder && track.audioDecodable))
    return video('this browser cannot decode the sound');
  if (track.audio === 'pcm' && !track.audioDecodable)
    return video('this browser cannot decode the sound');
  return { engine: 'webcodecs' };
};
