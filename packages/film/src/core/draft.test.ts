import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import { DraftMarkdown, draftMarked, draftMissed, unreadText } from './draft.ts';

const TALK = [
  '# Daniel’s Education: script',
  '',
  'Some notes above the table, with a | pipe.',
  '',
  '| #        | Say (owner, to lens)                       | On screen      | Source note |',
  '| -------- | ------------------------------------------ | -------------- | ----------- |',
  '| 1 · Hook | Daniel was {*}taken. {/} He was {*}young.  | A bowl.        | Dan 1:1     |',
  '| 2        |                                            | Title card.    |             |',
  '| 3 · Turn | A pipe \\| in a cell, and {//1.5} a {*}turn. | The same bowl. | PK 480.3    |',
  '',
  'After the table.',
  '',
].join('\n');

const FILM = [
  '# Milk and Meat',
  '',
  '### `cold` · STORY · ~30 s',
  '',
  '**say:** {baby}A baby drinks {*}milk. {/} Nobody {*}minds.',
  '',
  '**cite:** Heb 5:12; 1 Pet 2:2',
  '',
  '**picture:** A courtyard at a wedding.',
  '',
  '### `title` · TITLE',
  '',
  '**picture:** The title card.',
  '',
].join('\n');

/** The lines' words as a page reads them: the words a mark write is made on. */
const DANIEL = 'Daniel was taken. He was young.';
const MILK = 'A baby drinks milk. Nobody minds.';
const PIPE = 'A pipe | in a cell, and a turn.';

const read = Schema.decodeSync(DraftMarkdown);
const refusal = (markdown: string) =>
  Result.getOrThrow(
    Result.flip(Result.mapError(Schema.decodeResult(DraftMarkdown)(markdown), (e) => e.message)),
  );

describe('reading a draft', () => {
  test('a talk’s table: a row a beat, its # its id and label, its line, brief and source', () => {
    const draft = read(TALK);
    expect(draft.title).toBe('Daniel’s Education: script');
    expect(draft.beats.map((b) => [b.id, b.label])).toEqual([
      ['1', 'Hook'],
      ['2', ''],
      ['3', 'Turn'],
    ]);
    const [hook, title, turn] = draft.beats;
    expect(Option.map(hook!.say, (s) => s.text)).toEqual(
      Option.some('Daniel was {*}taken. {/} He was {*}young.'),
    );
    expect(hook!.brief).toEqual(Option.some('A bowl.'));
    expect(hook!.cite).toEqual(['Dan 1:1']);
    expect(title!.say).toEqual(Option.none());
    // An escaped pipe is a pipe in the line.
    expect(Option.map(turn!.say, (s) => s.text)).toEqual(
      Option.some('A pipe | in a cell, and {//1.5} a {*}turn.'),
    );
  });

  test('a film’s beat list: a heading a beat, its say, cite and picture', () => {
    const draft = read(FILM);
    expect(draft.beats.map((b) => [b.id, b.label])).toEqual([
      ['cold', 'STORY · ~30 s'],
      ['title', 'TITLE'],
    ]);
    const [cold, title] = draft.beats;
    expect(Option.map(cold!.say, (s) => s.text)).toEqual(
      Option.some('{baby}A baby drinks {*}milk. {/} Nobody {*}minds.'),
    );
    expect(cold!.cite).toEqual(['Heb 5:12', '1 Pet 2:2']);
    expect(cold!.brief).toEqual(Option.some('A courtyard at a wedding.'));
    expect(title!.say).toEqual(Option.none());
  });

  test('two stresses in one cell read as two marks, not Markdown emphasis', () => {
    const draft = read(TALK);
    const line = Option.getOrThrow(draft.beats[0]!.say).text;
    expect(line.match(/\{\*\}/g)).toHaveLength(2);
  });

  test('refuses Markdown’s stress, a pause written as a direction, and a draft with no beats', () => {
    const emphasis = TALK.replace('He was {*}young.', 'He was _young_.');
    expect(refusal(emphasis)).toBe(
      'beat 1: stresses _young_ the Markdown way: write {*} before the word',
    );
    const direction = TALK.replace('{//1.5}', '(0.6 s)');
    expect(refusal(direction)).toContain('beat 3: writes the pause (0.6 s) as a direction');
    expect(refusal('# Nothing\n\nJust prose.\n')).toContain('it has no beats');
    expect(refusal(FILM.replace('### `title`', '### `cold`'))).toBe(
      'beat cold: names two beats alike',
    );
  });

  test('refuses what it would read only in part: a say on two lines, two script tables, a column twice', () => {
    expect(refusal(FILM.replace('Nobody {*}minds.', 'Nobody\n{*}minds.'))).toBe(
      'beat cold: its say runs onto a second line: keep the line on one',
    );
    const table = TALK.split('After the table.')[0] ?? '';
    expect(refusal(`${TALK}\n${table}`)).toBe('it has 2 script tables: keep the beats in one');
    expect(refusal(TALK.replace('| On screen      |', '| Say again      |'))).toBe(
      'its table names its say column twice: keep one',
    );
  });

  test('reads a CRLF draft as its LF twin, and marks it without touching its line ends', () => {
    const crlf = FILM.replaceAll('\n', '\r\n');
    expect(read(crlf).beats.map((b) => [b.id, b.label])).toEqual(
      read(FILM).beats.map((b) => [b.id, b.label]),
    );
    const marked = Result.getOrThrow(
      draftMarked(crlf, 'cold', [{ _tag: 'Stress', word: 3 }], MILK),
    );
    expect(marked).toBe(
      crlf.replace(
        'A baby drinks {*}milk. {/} Nobody {*}minds.',
        'A baby drinks {*}milk. Nobody minds.',
      ),
    );
  });

  test('refuses a line the reader cannot voice, naming its beat', () => {
    expect(refusal(TALK.replace('{/} He', '{//9} He'))).toMatch(/^beat 1: /);
  });
});

describe('DraftMarkdown', () => {
  test('decodes and encodes a draft byte for byte', () => {
    for (const markdown of [TALK, FILM]) {
      const draft = Schema.decodeSync(DraftMarkdown)(markdown);
      expect(Schema.encodeSync(DraftMarkdown)(draft)).toBe(markdown);
    }
  });

  test('refuses a draft that does not read, saying why', () => {
    expect(() => Schema.decodeSync(DraftMarkdown)('# none\n')).toThrow('it has no beats');
  });
});

describe('draftMarked', () => {
  test('marks one beat’s line and changes no other byte', () => {
    const marks = [
      { _tag: 'Stress', word: 2 },
      { _tag: 'Hold', before: 3, seconds: 1 },
    ] as const;
    const after = Result.getOrThrow(draftMarked(TALK, '1', marks, DANIEL));
    expect(after).toBe(
      TALK.replace(
        'Daniel was {*}taken. {/} He was {*}young.',
        'Daniel was {*}taken. {//1} He was young.',
      ),
    );
    expect(draftMissed(after, TALK, '1', marks)).toEqual([]);
  });

  test('keeps a table cell’s pipe escaped, and a film line as it stands', () => {
    const turn = Result.getOrThrow(draftMarked(TALK, '3', [{ _tag: 'Stress', word: 1 }], PIPE));
    expect(turn).toContain('| 3 · Turn | A {*}pipe \\| in a cell, and a turn. |');
    const cold = Result.getOrThrow(draftMarked(FILM, 'cold', [{ _tag: 'Stress', word: 3 }], MILK));
    expect(cold).toBe(
      FILM.replace(
        'A baby drinks {*}milk. {/} Nobody {*}minds.',
        'A baby drinks {*}milk. Nobody minds.',
      ),
    );
  });

  test('refuses a beat it lacks, a beat that says nothing, and a mark that does not fit', () => {
    const unread = (beat: string, marks: Parameters<typeof draftMarked>[2]) =>
      unreadText(Result.getOrThrow(Result.flip(draftMarked(TALK, beat, marks, DANIEL))));
    expect(unread('9', [])).toBe('beat 9: the draft has no such beat');
    expect(unread('2', [])).toBe('beat 2: says nothing to mark');
    expect(unread('1', [{ _tag: 'Stress', word: 40 }])).toMatch(/^beat 1: /);
  });

  test('refuses marks made on words the line no longer says', () => {
    // The page read beat 1 before "taken" became "carried away": word 2 is another word now.
    const reworded = TALK.replace('Daniel was {*}taken.', 'Daniel was {*}carried away.');
    const stale = draftMarked(reworded, '1', [{ _tag: 'Stress', word: 2 }], DANIEL);
    expect(unreadText(Result.getOrThrow(Result.flip(stale)))).toBe(
      'beat 1: its words changed since the page read them (it says "Daniel was carried away. He was young." now): read it again and mark it there',
    );
  });
});

describe('draftMissed', () => {
  test('says what a write missed: other words, other marks, another beat', () => {
    const marks = [{ _tag: 'Stress', word: 2 }] as const;
    const reworded = TALK.replace('Daniel was {*}taken.', 'Daniel was {*}led.');
    expect(
      draftMissed(reworded, TALK, '1', [
        { _tag: 'Stress', word: 2 },
        { _tag: 'Breath', before: 3 },
        { _tag: 'Stress', word: 5 },
      ]),
    ).toEqual(['beat 1 no longer says what it said']);
    expect(draftMissed(TALK, TALK, '1', marks)[0]).toContain('beat 1 reads');
    const other = TALK.replace('a {*}turn.', 'a turn.');
    expect(
      draftMissed(other, TALK, '1', [
        { _tag: 'Stress', word: 2 },
        { _tag: 'Breath', before: 3 },
        { _tag: 'Stress', word: 5 },
      ]),
    ).toEqual(['beat 3 changed too']);
  });
});
