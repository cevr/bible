/**
 * The channel's words: the verse it is named for, and its four series. Every
 * quotation is the King James Version, word for word (`bible verse`), and a
 * partial verse is one continuous run of its words. The copy follows the
 * series' voice rules (apps/animations/series/README.md): for all
 * Christians, warm, no insider terms, and no claim about films that are not
 * out yet.
 *
 * A series' films are data: add an `Episode` to its `episodes` when a film
 * is published, and its page lists it.
 */

export interface Verse {
  readonly text: string;
  readonly ref: string;
}

export interface Episode {
  /** Its number in the series, as the films' labels print it ("01"). */
  readonly no: string;
  readonly title: string;
  /** The YouTube video id (`watch?v=<id>`). */
  readonly youtubeId: string;
  /** The day it was published on YouTube (`2026-11-07`): the sitemap's date and the search result's. */
  readonly published: string;
  readonly summary: string;
}

export interface Part {
  readonly title: string;
  readonly question: string;
}

export type SeriesId = 'path' | 'land' | 'taught' | 'remedies';

/** What a series' episodes are called, one and many, by its form. */
export const UNITS = {
  'Cut-paper films': { one: 'film', many: 'films' },
  Talks: { one: 'talk', many: 'talks' },
} as const;

export interface Series {
  readonly id: SeriesId;
  readonly slug: string;
  readonly name: string;
  /** What it is about, and what form it takes. */
  readonly subject: string;
  readonly form: keyof typeof UNITS;
  readonly verse: Verse;
  /** One sentence, for its card. */
  readonly line: string;
  readonly about: ReadonlyArray<string>;
  readonly parts: ReadonlyArray<Part>;
  readonly episodes: ReadonlyArray<Episode>;
}

/** The night verse: the sower sleeps and rises, and the seed grows. */
export const MARK_4_27: Verse = {
  text: 'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
  ref: 'Mark 4:27',
};

export const MARK_4_28: Verse = {
  text: 'For the earth bringeth forth fruit of herself; first the blade, then the ear, after that the full corn in the ear.',
  ref: 'Mark 4:28',
};

export const SERIES: ReadonlyArray<Series> = [
  {
    id: 'path',
    slug: 'the-path-of-the-just',
    name: 'The Path of the Just',
    subject: 'Theology',
    form: 'Cut-paper films',
    verse: {
      text: 'But the path of the just is as the shining light, that shineth more and more unto the perfect day.',
      ref: 'Proverbs 4:18',
    },
    line: 'The faith from its first principles to its deepest truths, in the order the Bible serves them.',
    about: [
      'The Bible has an order for growing: the first principles of the faith first, then the deeper things a growing Christian is ready to take in. This series walks that road one short film at a time, in the order the Bible itself serves it.',
      'Nothing learned first is left behind. Each film builds on the ones before it, and the cross stands at the centre of them all.',
    ],
    parts: [
      {
        title: 'The foundation',
        question: 'God’s word, God’s character, sin, who Jesus is, and the cross.',
      },
      {
        title: 'The Priest in heaven',
        question: 'Christ’s work for us now, as our High Priest, and what it means for us.',
      },
      {
        title: 'The things to come',
        question: 'How prophecy reads, the last things, and the earth made new.',
      },
    ],
    episodes: [],
  },
  {
    id: 'land',
    slug: 'dwell-in-the-land',
    name: 'Dwell in the Land',
    subject: 'Country living',
    form: 'Cut-paper films',
    verse: {
      text: 'Trust in the LORD, and do good; so shalt thou dwell in the land, and verily thou shalt be fed.',
      ref: 'Psalm 37:3',
    },
    line: 'Country living from the Bible: what it is, why it matters, where and how to begin.',
    about: [
      'God made the first home in a garden, and gave the first family work in the open air. This series asks what that pattern means for a family today, and how to move toward a quieter life on the land, carefully and without haste.',
      'Trust comes first, and the dwelling follows. A move earns nothing; it is the life that faith works out, as it did for Abraham, who “went out, not knowing whither he went” (Hebrews 11:8).',
    ],
    parts: [
      { title: 'What', question: 'What did God make a home to be?' },
      { title: 'Why', question: 'Why does it matter where a family of faith lives?' },
      {
        title: 'Where and how',
        question: 'When, how fast, where, with what work, and with whom?',
      },
    ],
    episodes: [],
  },
  {
    id: 'taught',
    slug: 'taught-of-the-lord',
    name: 'Taught of the Lord',
    subject: 'Christian education',
    form: 'Talks',
    verse: {
      text: 'And all thy children shall be taught of the LORD; and great shall be the peace of thy children.',
      ref: 'Isaiah 54:13',
    },
    line: 'True education from Scripture, for parents and teachers.',
    about: [
      'Short talks for parents, and for anyone who teaches a child, on what education is for and how the Bible shapes it.',
      'The series takes its name from a promise, not a program: all thy children shall be taught of the LORD.',
    ],
    parts: [
      { title: 'Why', question: 'What is education for?' },
      {
        title: 'The first school',
        question: 'The home, and when formal lessons should begin.',
      },
      {
        title: 'Hands and books',
        question: 'Useful work, and the Bible as a schoolbook.',
      },
      {
        title: 'The heart',
        question: 'The will, gentle discipline, and guarding a young mind.',
      },
    ],
    episodes: [],
  },
  {
    id: 'remedies',
    slug: 'the-true-remedies',
    name: 'The True Remedies',
    subject: 'Health',
    form: 'Talks',
    verse: { text: 'for I am the LORD that healeth thee.', ref: 'Exodus 15:26' },
    line: 'Health from the Bible: air, sunlight, water, rest and the rest of God’s remedies.',
    about: [
      'Short talks on the simple means of health God has given: pure air, sunlight, temperance, rest, exercise, good food, water, and trust in God. Each takes one remedy or one question and sets out what Scripture says, what the body shows, and what a household can do with it.',
      'God is the healer, and these are His means. The talks never stand in for a doctor where one is needed.',
    ],
    parts: [
      {
        title: 'The frame',
        question: 'Why God cares about the body, and the remedies as His.',
      },
      {
        title: 'The remedies',
        question: 'Air, sunlight, temperance, rest, exercise, food, water and trust in God.',
      },
    ],
    episodes: [],
  },
];
