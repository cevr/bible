import { describe, expect, it } from 'bun:test';

import {
  citationsIn,
  isSpliced,
  quotationAppearsIn,
  quotedWordCount,
} from '../../src/lib/quote-check.js';

describe('citationsIn', () => {
  it('finds Scripture bullets and witness lines, with their line numbers', () => {
    const doc = [
      '# Title',
      '- _Gen 15:6._ "And he believed in the LORD" — counted, not earned',
      '',
      '[SOP DA 25.2] "punchline" — why',
      '- plain bullet, not a quotation',
      '→ an answer line quoting "nothing checked"',
    ].join('\n');

    expect(citationsIn(doc)).toEqual([
      { _tag: 'scripture', line: 2, reference: 'Gen 15:6', quote: 'And he believed in the LORD' },
      { _tag: 'witness', line: 4, kind: 'SOP', refcodes: ['DA 25.2'], quote: 'punchline' },
    ]);
  });

  it('reads "Heb 1:1, 2" as the range bible verse understands', () => {
    const [citation] = citationsIn('- _Heb 1:1, 2._ "God, who at sundry times" — one Speaker');
    expect(citation).toMatchObject({ reference: 'Heb 1:1-2' });
  });

  it('offers every split of a PIONEER marker, since names and periodicals both hold commas', () => {
    const [citation] = citationsIn(
      '[PIONEER Advent Herald (Himes, Bliss), LIFIN 188.2] "Was Jonah a false prophet" — gloss',
    );
    expect(citation).toMatchObject({ refcodes: ['Bliss), LIFIN 188.2', 'LIFIN 188.2'] });

    const [periodical] = citationsIn(
      '[PIONEER Waggoner, GCDB March 11, 1891, page 75.13] "who upholds" — gloss',
    );
    expect(periodical).toMatchObject({
      refcodes: ['GCDB March 11, 1891, page 75.13', '1891, page 75.13', 'page 75.13'],
    });
  });
});

describe('quotationAppearsIn', () => {
  const kjv = 'And if Christ be not raised, your faith [is] vain; ye are yet in your sins.';

  it('keeps the KJV supplied words and ignores the brackets around them', () => {
    expect(quotationAppearsIn(kjv, 'if Christ be not raised, your faith is vain')).toBe(true);
    expect(quotationAppearsIn(kjv, 'your faith [is] vain')).toBe(true);
  });

  it('ignores red-letter marks, curly quotes and dashes', () => {
    const redLetter = '‹That all [men] should honour the Son, even as they honour the Father.›';
    expect(quotationAppearsIn(redLetter, 'That all men should honour the Son')).toBe(true);
    expect(
      quotationAppearsIn(
        'his faith “wrought righteousness.”',
        'his faith "wrought righteousness."',
      ),
    ).toBe(true);
  });

  it('rejects a changed word', () => {
    expect(quotationAppearsIn(kjv, 'your faith is empty')).toBe(false);
  });

  it("treats a bracketed insertion as the quoter's, requiring the pieces in order", () => {
    const source =
      'he who upholds all things by the word of his power, can by that same word create';
    expect(quotationAppearsIn(source, '[Christ,] who upholds all things')).toBe(true);
    expect(quotationAppearsIn(source, 'can by that same word [Christ] who upholds')).toBe(false);
  });

  it('never passes a quotation with no words of its own', () => {
    expect(quotationAppearsIn('anything', '[inserted]')).toBe(false);
  });
});

describe('witness shape', () => {
  it('calls an ellipsis a splice, in either spelling', () => {
    expect(isSpliced('Let no one imagine... for')).toBe(true);
    expect(isSpliced('as Moses lifted up the serpent … whosoever')).toBe(true);
    expect(isSpliced('one clause, whole')).toBe(false);
  });

  it('counts only the words the source said', () => {
    expect(quotedWordCount('[Christ,] who upholds all things')).toBe(4);
  });
});
