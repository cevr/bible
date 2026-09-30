import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type Quote, sheetBeats, sheetHtml, sheetMarkdown } from './sheet.ts';

const quotes: ReadonlyArray<Quote> = [
  {
    ref: 'Lt 57, 1895',
    author: 'Ellen G. White',
    text: 'The Lord in His great mercy sent a most precious message to His people. … It is the third angel’s message.',
  },
];

const script = [
  {
    id: 'message',
    say: '{year}In 1888, two preachers came. {ew}Ellen White said God sent {precious}“a most precious message” through them. Job asked it: “How should man be just with God?”',
    cite: ['Job 9:2', 'Lt 57, 1895'],
  },
  { id: 'title', cite: [] },
  { id: 'turn', say: 'Is that justice? {@ask}Wait. {@lead}Right.', cite: [] },
];

describe('the reading sheet', () => {
  const beats = Result.getOrThrow(sheetBeats(script, quotes));

  test('one entry per beat with words, each with the file its take is saved as', () => {
    expect(beats.map((b) => [b.id, b.file])).toEqual([
      ['message', 'message.wav'],
      ['turn', 'turn.wav'],
    ]);
  });

  test('marks are stripped, quotations set apart with the source that holds their words, sentences end in a breath', () => {
    const [message] = beats;
    expect(message?.parts).toEqual([
      {
        kind: 'line',
        text: 'In 1888, two preachers came. / Ellen White said God sent',
      },
      {
        kind: 'quotation',
        text: '“a most precious message”',
        by: 'Ellen G. White, Lt 57, 1895',
      },
      { kind: 'line', text: 'through them. / Job asked it:' },
      { kind: 'quotation', text: '“How should man be just with God?”' },
    ]);
    expect(message?.sources).toEqual(['Job 9:2', 'Lt 57, 1895']);
  });

  test('a turn names who reads the words after it', () => {
    expect(beats[1]?.parts).toEqual([
      { kind: 'line', text: 'Is that justice?' },
      { kind: 'line', voice: 'ask', text: 'Wait.' },
      { kind: 'line', voice: 'lead', text: 'Right.' },
    ]);
  });

  test('an abbreviation’s full stop is not a sentence’s end, so no breath follows it', () => {
    const [beat] = Result.getOrThrow(
      sheetBeats(
        [
          {
            id: 'a',
            say: 'Mrs. White and Dr. Kellogg met at St. Helena. Then Mr. Jones spoke.',
            cite: [],
          },
        ],
        [],
      ),
    );
    expect(beat?.parts).toEqual([
      {
        kind: 'line',
        text: 'Mrs. White and Dr. Kellogg met at St. Helena. / Then Mr. Jones spoke.',
      },
    ]);
  });

  test('the markdown and the printable page carry every beat, escaped for the page', () => {
    const md = sheetMarkdown('test', beats);
    expect(md).toContain('## 1. message');
    expect(md).toContain('Save as `message.wav`');
    expect(md).toContain('> “a most precious message”');
    expect(md).toContain('> — Ellen G. White, Lt 57, 1895');
    expect(md).toContain('**ASK:** Wait.');
    const html = sheetHtml(
      'test',
      Result.getOrThrow(sheetBeats([{ id: 'x', say: 'A <b> & c.', cite: [] }], [])),
    );
    expect(html).toContain('A &lt;b&gt; &amp; c.');
    expect(html).toContain('<title>test: reading sheet</title>');
    expect(html).toContain('x.wav');
  });
});
