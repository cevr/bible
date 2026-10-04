// Which player a compare plays on: the WebCodecs panes where the browser
// can decode both the picture and the sound (or the sound is PCM, decoded
// in script) and the file opens; `<video>` otherwise, and on a phone until
// one is measured. The fallback keeps every action: a phone may lose
// precision, never a capability.

import { describe, expect, test } from 'bun:test';
import { type BrowserCodecs, type TrackCodecs, engineFor } from './media-choice.ts';

const desktop: BrowserCodecs = { videoDecoder: true, audioDecoder: true, phone: false };
const coded: TrackCodecs = { video: true, audio: 'coded', audioDecodable: true };

describe('the compare engine', () => {
  test('WebCodecs where the browser decodes the picture and the sound, and the file opens', () => {
    expect(engineFor(desktop, coded)).toEqual({ engine: 'webcodecs' });
  });

  test('a browser with the picture half only (iOS 16.4–18) plays a PCM or silent file, never an AAC one', () => {
    const pictureOnly = { ...desktop, audioDecoder: false };
    expect(engineFor(pictureOnly, { video: true, audio: 'pcm', audioDecodable: true })).toEqual({
      engine: 'webcodecs',
    });
    expect(engineFor(pictureOnly, { video: true, audio: 'none', audioDecodable: false })).toEqual({
      engine: 'webcodecs',
    });
    expect(engineFor(pictureOnly, coded)).toEqual({
      engine: 'video',
      why: 'this browser cannot decode the sound',
    });
  });

  test('<video> on a phone, without a decoder, or for a file it cannot decode', () => {
    expect(engineFor({ ...desktop, phone: true }, coded)).toEqual({
      engine: 'video',
      why: 'a phone plays <video> until one is measured',
    });
    expect(engineFor({ ...desktop, videoDecoder: false }, coded)).toEqual({
      engine: 'video',
      why: 'this browser has no WebCodecs',
    });
    expect(engineFor(desktop, { ...coded, video: false })).toEqual({
      engine: 'video',
      why: 'this browser cannot decode the picture',
    });
    expect(engineFor(desktop, { ...coded, audioDecodable: false })).toEqual({
      engine: 'video',
      why: 'this browser cannot decode the sound',
    });
  });
});
