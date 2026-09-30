/**
 * The blog, carried over unchanged from the old site (cevr/tried-gold): three
 * posts whose bodies are trusted HTML written in this file. The slugs are the
 * posts' URLs (`/blog/<slug>`) and must not change.
 */
import { Array as Arr, type Option } from 'effect';

export interface Post {
  readonly slug: string;
  readonly title: string;
  readonly date: string;
  readonly excerpt: string;
  /** Trusted HTML, authored here. */
  readonly html: string;
}

/** Newest first, as the index lists them. */
export const posts: ReadonlyArray<Post> = [
  {
    slug: 'the-refining-process',
    title: 'The Refining Process',
    date: 'May 15, 2025',
    excerpt:
      'Understanding how trials shape our faith and character, much like gold is refined by fire.',
    html: `
      <p>The process of refining gold is a powerful metaphor for our spiritual journey. Just as gold must pass through fire to be purified, our faith is often tested through trials and challenges.</p>

      <p>In 1 Peter 1:7, we read: "These trials will show that your faith is genuine. It is being tested as fire tests and purifies gold—though your faith is far more precious than mere gold."</p>

      <h2>The Purpose of Refinement</h2>

      <p>When gold is refined, it's heated to extreme temperatures where impurities rise to the surface and can be removed. Similarly, difficult seasons in our lives often bring hidden impurities in our character to light—pride, fear, self-reliance—so they can be addressed.</p>

      <p>The refiner of gold knows exactly how long to keep the metal in the fire. Too little heat, and impurities remain; too much, and the gold could be damaged. God, as our refiner, knows precisely what we need and for how long.</p>

      <h2>The Promise of Transformation</h2>

      <p>Job 23:10 reminds us of the promise that awaits us through this process: "But he knows the way that I take; when he has tested me, I will come forth as gold."</p>

      <p>The end result of refinement is always worth the process. Pure gold is more valuable, more beautiful, and more useful. Likewise, a faith that has been tested emerges stronger, more authentic, and more impactful.</p>

      <p>As you face trials today, remember that you are being refined for a purpose. The fire is not meant to destroy you but to purify you into something more precious than gold.</p>
    `,
  },
  {
    slug: 'finding-peace-in-difficult-times',
    title: 'Finding Peace in Difficult Times',
    date: 'May 10, 2025',
    excerpt: 'Practical steps to maintain peace and trust in God during seasons of challenge.',
    html: `
      <p>In a world filled with uncertainty and challenges, finding and maintaining peace can seem impossible. Yet Scripture promises us a peace that "transcends all understanding" (Philippians 4:7).</p>

      <h2>Practical Steps for Finding Peace</h2>

      <p>Peace isn't merely the absence of conflict but the presence of something greater. Here are some practical ways to cultivate peace in difficult seasons:</p>

      <ol>
        <li><strong>Focus on what's unchanging</strong> - When everything seems to be shifting, anchor yourself to the unchanging nature of God.</li>
        <li><strong>Practice gratitude daily</strong> - Thankfulness shifts our perspective from what's wrong to what's right.</li>
        <li><strong>Limit information intake</strong> - Sometimes peace requires creating boundaries around news and social media consumption.</li>
        <li><strong>Seek community</strong> - We weren't meant to face trials alone. Reach out and allow others to support you.</li>
        <li><strong>Rest in God's promises</strong> - Meditate on scriptures that remind you of God's faithfulness and care.</li>
      </ol>

      <p>Jesus told his disciples, "Peace I leave with you; my peace I give you. I do not give to you as the world gives. Do not let your hearts be troubled and do not be afraid." (John 14:27)</p>

      <p>This peace is available to us today, not as a distant hope but as a present reality we can experience even in the midst of trials.</p>
    `,
  },
  {
    slug: 'the-value-of-tested-faith',
    title: 'The Value of Tested Faith',
    date: 'May 5, 2025',
    excerpt: 'Exploring how our faith, when tested, becomes more precious than gold.',
    html: `
      <p>What makes gold valuable? Its rarity, certainly, but also its proven purity. Gold that has been tested and refined commands the highest price because its quality has been verified.</p>

      <p>The same is true of our faith. In 1 Peter 1:7, we're told that our faith—when tested—is "of greater worth than gold, which perishes even though refined by fire."</p>

      <h2>Why Testing Increases Value</h2>

      <p>A faith that has never been challenged remains theoretical. But faith that has weathered doubts, survived disappointments, and persisted through pain has proven its authenticity.</p>

      <p>Consider these ways that tested faith increases in value:</p>

      <ul>
        <li><strong>Tested faith is resilient</strong> - It doesn't crumble under pressure but grows stronger.</li>
        <li><strong>Tested faith is relational</strong> - It moves beyond religious activity to genuine trust in God.</li>
        <li><strong>Tested faith is influential</strong> - Others are drawn to the genuine article when they see it in action.</li>
      </ul>

      <h2>The Testimony of Tested Faith</h2>

      <p>Hebrews 11 recounts the "faith hall of fame"—individuals whose faith was proven through tremendous tests. Their stories continue to inspire us thousands of years later, not because their faith was perfect, but because it was persistent.</p>

      <p>Your current trial may be the very thing God uses to transform your faith from ordinary to extraordinary—from untested theory to proven treasure.</p>
    `,
  },
];

/** The post published at `/blog/<slug>`, if there is one. */
export const findPost = (slug: string): Option.Option<Post> =>
  Arr.findFirst(posts, (post) => post.slug === slug);
