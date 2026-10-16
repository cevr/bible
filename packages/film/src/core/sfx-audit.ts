// Whether code can make a generated sound, read from its prompt's words by
// ordered rules: the first rule that holds one of the prompt's words decides,
// and the verdict names those words and the rule's reason. The owner's rule
// is code for every simpler sound and ElevenLabs only for the realism code
// cannot reach, so the audit is where a code trial starts (`sfx audit`).
// Free and deterministic: a prompt's words are its letters, lowercased and
// split at everything else; no model reads it, and a word reads only as
// itself (the forms each rule lists, no stemming).

import type { Generated, Library } from './sfx.ts';

/** What the audit says of a prompt: code can make it (sure, or worth a try), or it needs realism. */
type Verdict = 'code-sure' | 'code-try' | 'realism';

/** Each verdict as `sfx audit` prints it. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  'code-sure': 'code can make this (sure)',
  'code-try': 'code can make this (try)',
  realism: 'needs realism',
};

interface Rule {
  readonly verdict: Verdict;
  readonly reason: string;
  readonly words: ReadonlySet<string>;
}

/**
 * The rules, in the order they are read. Voices, creatures and life far off
 * come first: a crowd's room or a bird's garden is still a crowd or a bird.
 * Handled textures come before the shapes code makes, so "a flag flapping"
 * needs realism though a flap is short. The materials come after the shapes:
 * "a paper cutout swept … whoosh" is a whoosh, and "a stack of paper dropped"
 * (no shape word) is paper handled.
 */
const RULES: ReadonlyArray<Rule> = [
  {
    verdict: 'realism',
    reason: 'voices, creatures or life far off',
    words: new Set([
      'voice',
      'voices',
      'talk',
      'talking',
      'murmur',
      'murmuring',
      'crowd',
      'crowded',
      'people',
      'audience',
      'words',
      'bird',
      'birds',
      'birdsong',
      'songbirds',
      'chirp',
      'chirping',
      'wing',
      'wings',
      'donkey',
      'footstep',
      'footsteps',
      'sandals',
      'town',
      'city',
      'market',
    ]),
  },
  {
    verdict: 'realism',
    reason: 'a handled texture',
    words: new Set([
      'rustle',
      'rustling',
      'crackle',
      'crackling',
      'scratch',
      'scratching',
      'scrape',
      'scraped',
      'shuffle',
      'shuffling',
      'flutter',
      'flap',
      'flapping',
      'snap',
      'snapping',
      'tear',
      'torn',
      'rip',
      'flip',
      'flipped',
      'slide',
      'sliding',
      'squeak',
      'squeaky',
      'scrub',
      'scrubbing',
      'punch',
      'punches',
      'pull',
      'pulled',
      'sewing',
      'loom',
      'weave',
      'weaving',
      'clink',
      'clinking',
      'clatter',
      'clattering',
    ]),
  },
  {
    verdict: 'code-try',
    reason: 'a borderline texture',
    words: new Set(['creak', 'creaking', 'rumble', 'roll', 'rolled']),
  },
  {
    verdict: 'code-sure',
    reason: 'a shape code makes',
    words: new Set([
      'whoosh',
      'swish',
      'swept',
      'hiss',
      'hissing',
      'sizzle',
      'knock',
      'thud',
      'thuds',
      'thump',
      'bang',
      'bangs',
      'tap',
      'tick',
      'click',
      'chime',
      'bell',
      'ring',
      'tone',
      'drone',
      'hum',
      'rise',
      'riser',
      'wind',
      'breeze',
      'rain',
      'drip',
      'drips',
    ]),
  },
  {
    verdict: 'realism',
    reason: 'a handled material',
    words: new Set([
      'paper',
      'cloth',
      'fabric',
      'linen',
      'robe',
      'ribbon',
      'leaves',
      'reeds',
      'straw',
      'canvas',
      'thread',
    ]),
  },
];

/** What a prompt no rule holds is: worth a try in code, since nothing says it needs realism. */
const UNMATCHED = { verdict: 'code-try', reason: 'no rule matched' } as const;

/** A prompt's verdict, why, and the words of the deciding rule the prompt holds (none when no rule matched). */
interface Audited {
  readonly verdict: Verdict;
  readonly reason: string;
  readonly words: ReadonlyArray<string>;
}

/** `prompt` audited: the first rule that holds one of its words decides. */
const auditPrompt = (prompt: string): Audited => {
  const words = prompt.toLowerCase().split(/[^a-z]+/);
  for (const rule of RULES) {
    const held = [...new Set(words.filter((word) => rule.words.has(word)))];
    if (held.length > 0) return { verdict: rule.verdict, reason: rule.reason, words: held };
  }
  return { ...UNMATCHED, words: [] };
};

/** A generated sound of a library, audited. */
interface AuditedSound {
  readonly name: string;
  readonly entry: Generated;
  readonly audited: Audited;
}

/** Each generated sound of `library`, in its declared order, audited from its prompt. */
export const auditLibrary = (library: Library): ReadonlyArray<AuditedSound> =>
  Object.entries(library).flatMap(([name, entry]): ReadonlyArray<AuditedSound> => {
    if (entry.kind !== 'generated') return [];
    return [{ name, entry, audited: auditPrompt(entry.prompt) }];
  });
