import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { SttResponse, heardWords } from './elevenlabs.ts';

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(SttResponse));

/** The reply as the API sends it, extra fields and all. */
const REPLY = `{
  "language_code": "eng",
  "text": "Hello world.",
  "words": [
    { "text": "Hello", "start": 0.1, "end": 0.5, "type": "word", "logprob": -0.1 },
    { "text": " ", "start": 0.5, "end": 0.6, "type": "spacing" },
    { "text": "(breath)", "start": 0.6, "end": 0.7, "type": "audio_event" },
    { "text": "world.", "start": 0.7, "end": 1, "type": "word" }
  ]
}`;

describe('speech-to-text replies', () => {
  test('carry the words heard and when, spacing and sound events left out', () => {
    const reply = decode(REPLY);
    expect(heardWords(reply)).toEqual([
      { text: 'Hello', start: 0.1, end: 0.5 },
      { text: 'world.', start: 0.7, end: 1 },
    ]);
  });

  test('a reply with no words decodes with none', () => {
    expect(heardWords(decode('{"text":"Hello."}'))).toEqual([]);
  });
});
