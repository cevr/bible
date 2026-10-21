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
  /** The slugs it went by before, each answered with a 301 to its page (`worker/respond.ts`): a live link keeps working after a rename. */
  readonly formerSlugs: ReadonlyArray<string>;
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
    formerSlugs: [],
    name: 'The Path of the Just',
    subject: 'Theology',
    form: 'Cut-paper films',
    verse: {
      text: 'But the path of the just is as the shining light, that shineth more and more unto the perfect day.',
      ref: 'Proverbs 4:18',
    },
    line: 'What the Bible teaches, starting at the beginning.',
    about: [
      'The Bible teaches some things first and saves others for later, when we are ready for them. These films go in that order, one short film at a time.',
      'Each film builds on the ones before it, and every one comes back to the cross.',
    ],
    parts: [
      {
        title: 'The foundation',
        question: 'God’s word, God’s character, sin, who Jesus is, and the cross.',
      },
      {
        title: 'The Priest in heaven',
        question: 'What Jesus does for us now, as our High Priest.',
      },
      {
        title: 'The things to come',
        question: 'How to read prophecy, and how it all ends, with the earth made new.',
      },
    ],
    episodes: [],
  },
  {
    id: 'land',
    slug: 'dwell-in-the-land',
    formerSlugs: [],
    name: 'Dwell in the Land',
    subject: 'Country living',
    form: 'Cut-paper films',
    verse: {
      text: 'Trust in the LORD, and do good; so shalt thou dwell in the land, and verily thou shalt be fed.',
      ref: 'Psalm 37:3',
    },
    line: 'What the Bible says about living on the land, and how a family can start.',
    about: [
      'God put the first family in a garden and gave them work outdoors. What does that mean for a family now? This series asks that question. It also asks how a family can move to the land, slowly and with care.',
      'The psalm puts trust first, then the land. Moving to the country does not earn us anything with God. It is a step faith takes, as it was for Abraham, who “went out, not knowing whither he went” (Hebrews 11:8).',
    ],
    parts: [
      { title: 'What', question: 'What did God make a home to be?' },
      { title: 'Why', question: 'Why does it matter where a Christian family lives?' },
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
    formerSlugs: [],
    name: 'Taught of the Lord',
    subject: 'Christian education',
    form: 'Talks',
    verse: {
      text: 'And all thy children shall be taught of the LORD; and great shall be the peace of thy children.',
      ref: 'Isaiah 54:13',
    },
    line: 'What the Bible says about teaching children, for parents and teachers.',
    about: [
      'Short talks for parents and for anyone who teaches a child. What is education for? And how should the Bible shape it?',
      'The name comes from a promise in Isaiah: “all thy children shall be taught of the LORD.”',
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
    slug: 'health-and-cure',
    formerSlugs: ['the-true-remedies'],
    name: 'Health and Cure',
    subject: 'Health',
    form: 'Talks',
    verse: {
      text: 'Behold, I will bring it health and cure, and I will cure them, and will reveal unto them the abundance of peace and truth.',
      ref: 'Jeremiah 33:6',
    },
    line: 'Sunlight, fresh air, water, rest and the other simple things God gave us for our health.',
    about: [
      'Short talks on the simple things God gave for our health: fresh air, sunlight, temperance, rest, exercise, good food, water and trust in God. Each talk takes one remedy, or one question, and ends with what you can do about it at home.',
      'God is the one who heals, and these are the means He uses. The talks do not take the place of a doctor when you need one.',
    ],
    parts: [
      {
        title: 'Why the body matters',
        question: 'Why God cares about our bodies, and why these remedies are His.',
      },
      {
        title: 'The remedies',
        question: 'Air, sunlight, temperance, rest, exercise, food, water and trust in God.',
      },
    ],
    episodes: [],
  },
];
