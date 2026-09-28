import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
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
  const beats = sheetBeats(script, quotes);

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
        _tag: 'Line',
        voice: Option.none(),
        text: 'In 1888, two preachers came. / Ellen White said God sent',
      },
      {
        _tag: 'Quotation',
        text: '“a most precious message”',
        by: Option.some('Ellen G. White, Lt 57, 1895'),
      },
      { _tag: 'Line', voice: Option.none(), text: 'through them. / Job asked it:' },
      { _tag: 'Quotation', text: '“How should man be just with God?”', by: Option.none() },
    ]);
    expect(message?.sources).toEqual(['Job 9:2', 'Lt 57, 1895']);
  });

  test('a turn names who reads the words after it', () => {
    expect(beats[1]?.parts).toEqual([
      { _tag: 'Line', voice: Option.none(), text: 'Is that justice?' },
      { _tag: 'Line', voice: Option.some('ask'), text: 'Wait.' },
      { _tag: 'Line', voice: Option.some('lead'), text: 'Right.' },
    ]);
  });

  test('the markdown and the printable page carry every beat, escaped for the page', () => {
    const md = sheetMarkdown('test', beats);
    expect(md).toContain('## 1. message');
    expect(md).toContain('Save as `message.wav`');
    expect(md).toContain('> “a most precious message”');
    expect(md).toContain('> — Ellen G. White, Lt 57, 1895');
    expect(md).toContain('**ASK:** Wait.');
    const html = sheetHtml('test', sheetBeats([{ id: 'x', say: 'A <b> & c.', cite: [] }], []));
    expect(html).toContain('A &lt;b&gt; &amp; c.');
    expect(html).toContain('<title>test: reading sheet</title>');
    expect(html).toContain('x.wav');
  });
});
