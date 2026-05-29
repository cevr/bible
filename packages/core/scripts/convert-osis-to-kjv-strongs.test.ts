/**
 * Regression tests for the OSIS -> kjv-strongs tokenizer.
 *
 * Guards the `assets/kjv-strongs.json` generator against the corruption that
 * made e.g. Song of Solomon 4:1 unreadable with Strong's on:
 *   - leading free text before the first <w>/<transChange> was DROPPED
 *     ("Behold, thou art fair..." rendered as "art fair...")
 *   - <note> apparatus text was space-stripped and FUSED onto the prior word
 *     ("Gilead." + the study note -> "Gilead.that…:or,thateatof,etc")
 *   - real words sitting in free text between two <w> groups were mashed into
 *     the previous word's punctuation ("my love" + "; behold, thou " ->
 *     "love;behold,thou")
 *
 * The fixtures are verbatim OSIS verse bodies from the CrossWire KJV2006 file.
 */
import { describe, expect, test } from 'bun:test';
import { decodeEntities, parseVerseBody } from './convert-osis-to-kjv-strongs.js';

const parse = (osis: string) => parseVerseBody(decodeEntities(osis));
const textOf = (osis: string) =>
  parse(osis)
    .map((w) => w.text)
    .join(' ');

describe('parseVerseBody', () => {
  test('Song 4:1 — leading free text kept, note stripped, words not fused', () => {
    // Verbatim OSIS body for Song.4.1. Note the bare "Behold, thou " before
    // the first tag and the trailing <note> after "Gilead".
    const osis =
      `Behold, thou <transChange type="added">art</transChange> ` +
      `<w lemma="strong:H03303">fair</w>, <w lemma="strong:H07474">my love</w>; ` +
      `behold, thou <transChange type="added">art</transChange> ` +
      `<w lemma="strong:H03303">fair</w>; thou <transChange type="added">hast</transChange> ` +
      `<w lemma="strong:H03123">doves'</w> <w lemma="strong:H05869">eyes</w> ` +
      `<w lemma="strong:H01157">within</w> <w lemma="strong:H06777">thy locks</w>: ` +
      `<w lemma="strong:H08181">thy hair</w> <transChange type="added">is</transChange> ` +
      `<w lemma="strong:H05739">as a flock</w> <w lemma="strong:H05795">of goats</w>, ` +
      `<w lemma="strong:H01570">that appear</w> <w lemma="strong:H02022">from mount</w> ` +
      `<w lemma="strong:H01568">Gilead</w>.<note type="study">that…: or, that eat of, etc</note>`;

    expect(textOf(osis)).toBe(
      "Behold, thou art fair, my love; behold, thou art fair; thou hast doves' eyes " +
        'within thy locks: thy hair is as a flock of goats, that appear from mount Gilead.',
    );

    const words = parse(osis);
    // Leading free text became its own bare tokens.
    expect(words[0]).toEqual({ text: 'Behold,' });
    expect(words[1]).toEqual({ text: 'thou' });
    // No fused tokens anywhere (the signature of the old bug).
    expect(words.some((w) => /[a-z][;:][a-z]/i.test(w.text))).toBe(false);
    expect(words.some((w) => w.text.includes('…') || w.text.includes('etc'))).toBe(false);
    // Strong's stayed aligned to the right words.
    expect(words.find((w) => w.text === 'fair,')?.strongs).toEqual(['H3303']);
    expect(words.find((w) => w.text === 'love;')?.strongs).toEqual(['H7474']);
    // The note text is gone; "Gilead." carries H1568 and nothing else.
    const gilead = words.find((w) => w.text.startsWith('Gilead'));
    expect(gilead).toEqual({ text: 'Gilead.', strongs: ['H1568'] });
    // Translator-supplied words (<transChange>) are flagged italic — here the
    // two "art", "hast", and "is". Ordinary words are not.
    expect(words.filter((w) => w.italic === true).map((w) => w.text)).toEqual([
      'art',
      'art',
      'hast',
      'is',
    ]);
    expect(words.find((w) => w.text === 'fair,')?.italic).toBeUndefined();
  });

  test('leading punctuation in free text attaches to the previous word', () => {
    // normalizeStrong strips leading zeros: H0001 -> H1.
    const osis = `<w lemma="strong:H0001">alpha</w>, then <w lemma="strong:H0002">beta</w>.`;
    const words = parse(osis);
    expect(words).toEqual([
      { text: 'alpha,', strongs: ['H1'] },
      { text: 'then' },
      { text: 'beta.', strongs: ['H2'] },
    ]);
  });

  test('a <w> phrase splits on whitespace; only the last token carries strongs', () => {
    const osis = `<w lemma="strong:H08064 strong:H01254">the heavens</w>.`;
    expect(parse(osis)).toEqual([
      { text: 'the' },
      { text: 'heavens.', strongs: ['H8064', 'H1254'] },
    ]);
  });

  test('a study <note> with nested markup is removed entirely', () => {
    const osis =
      `<w lemma="strong:H03068">Lord</w>` +
      `<note type="study">the <divineName>Lord</divineName>: or, <divineName>Jehovah</divineName></note>` +
      ` reigneth.`;
    const words = parse(osis);
    // Note (including its nested <divineName> text) must not leak into words.
    expect(words.some((w) => /Jehovah|or,/.test(w.text))).toBe(false);
    expect(textOf(osis)).toBe('Lord reigneth.');
  });

  test('<transChange> additions become italic words with no strongs', () => {
    // KJV translator-supplied words (italics in print) carry `italic: true`
    // and no Strong's code; ordinary <w> words stay roman. H0428 -> H428
    // (leading zeros stripped by normalizeStrong).
    const osis = `<transChange type="added">are</transChange> <w lemma="strong:H0428">these</w>`;
    expect(parse(osis)).toEqual([
      { text: 'are', italic: true },
      { text: 'these', strongs: ['H428'] },
    ]);
  });
});
