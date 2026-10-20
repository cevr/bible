import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { SERIES } from '../content.ts';
import { Address } from './address.ts';
import type { Film } from './films.ts';
import { confirmLetter, filmLetter, POSTAL_ADDRESS } from './letters.ts';
import type { Letter } from './mailer.ts';

const ORIGIN = 'https://firsttheblade.test';
const TO = Address.make('ann@example.com');
const PO_BOX = 'P.O. Box 1, Testtown';

/** A film like the ones the site will list, beside every film it lists now. */
const FIXTURE: Film = {
  ref: 'path/01',
  series: Option.getOrThrow(Option.fromNullishOr(SERIES.find((series) => series.id === 'path'))),
  episode: {
    no: '01',
    title: 'A test film',
    youtubeId: 'test-video',
    published: '2026-11-01',
    summary: 'A summary for the test.',
  },
};

const FILMS: ReadonlyArray<Film> = [
  FIXTURE,
  ...SERIES.flatMap((series) =>
    series.episodes.map((episode) => ({ ref: `${series.id}/${episode.no}`, series, episode })),
  ),
];

/** Every letter the list sends, with the postal address given: the confirm letter, and each film's. */
const lettersWith = (postal: Option.Option<string>): ReadonlyArray<Letter> => [
  confirmLetter(TO, ORIGIN, 'c.1.token', postal),
  ...FILMS.map((film) => filmLetter(TO, ORIGIN, film, 'u.1.token', postal)),
];

/**
 * The subjects of the letters that mention Patreon while no postal address
 * is set: a letter that asks for support is commercial email, which must
 * carry one.
 */
const missingPostal = (letters: ReadonlyArray<Letter>, postal: Option.Option<string>) =>
  letters
    .filter((letter) => /patreon/i.test(`${letter.subject}\n${letter.text}\n${letter.html}`))
    .filter(() => Option.isNone(postal))
    .map((letter) => letter.subject);

describe('the letters', () => {
  test('none mentions Patreon while no postal address is set', () => {
    expect(missingPostal(lettersWith(POSTAL_ADDRESS), POSTAL_ADDRESS)).toEqual([]);
  });

  test('the check finds a letter that mentions Patreon with no postal address, and passes one with it', () => {
    const asking = lettersWith(Option.none()).map((letter) => ({
      ...letter,
      html: `${letter.html}<a href="https://www.patreon.com/firsttheblade">Patreon</a>`,
    }));
    expect(missingPostal(asking, Option.none())).toHaveLength(asking.length);
    expect(missingPostal(asking, Option.some(PO_BOX))).toEqual([]);
  });

  test('a postal address, once set, is at the foot of every letter', () => {
    for (const letter of lettersWith(Option.some(PO_BOX))) {
      expect(letter.text).toContain(PO_BOX);
      expect(letter.html).toContain(PO_BOX);
    }
    for (const letter of lettersWith(Option.none())) expect(letter.text).not.toContain('P.O.');
  });
});
