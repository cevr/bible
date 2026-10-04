// The judge's words: a second opinion on one choice at one scene, given
// blind. The versions a choice offers (a look's levels, a render set's
// variants: what the lab's Choices view picks between) are seen as stills at
// the same moments (the scene's marks and its cues' middles), labelled A, B,
// C in an order drawn at random; another model ranks them against the rules
// that bear on the scene, quoted in the packet; the key (which label is
// which version) stays out of the packet, and the answer is unblinded with
// it into the verdict. The judge writes no choice: the verdict stands beside
// the owner's pick. Pure: `tools/judge.ts` draws the stills and runs the
// model.

import { Array as Arr, Option, Result, Schema } from 'effect';
import { type SceneTimes, momentOf } from './easel.ts';
import { FILM_FPS } from './time.ts';

/** The most moments a judge shows of each version: the scene's places spread evenly beyond it. */
const JUDGE_MOMENTS = 12;

/** A judge's still's long side, in pixels: enough to read faces, small enough to view many. */
export const JUDGE_SIZE = 1280;

/** The labels versions are shown under, in order: as many versions as labels at most. */
export const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** A register a beat's picture names (`CRAFT.md` rule 3): the story world, or the page of ideas. */
const Register = Schema.Literals(['STORY', 'IDEA']);
type Register = typeof Register.Type;

// ---------------------------------------------------------------------------
// What a judge refuses, each its own class.

/** A point the judge cannot judge: not a picture choice, or none at this scene. */
export class JudgePointUnjudged extends Schema.TaggedError<JudgePointUnjudged>()(
  'JudgePointUnjudged',
  { point: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `the judge cannot judge ${this.point}: ${this.reason}`;
  }
}

/** Fewer than two versions to compare. */
export class JudgeNothingToCompare extends Schema.TaggedError<JudgeNothingToCompare>()(
  'JudgeNothingToCompare',
  { scene: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `nothing to judge at scene ${this.scene}: ${this.reason}`;
  }
}

/** Several picture choices at the scene, and none named. */
export class JudgePointAmbiguous extends Schema.TaggedError<JudgePointAmbiguous>()(
  'JudgePointAmbiguous',
  { scene: Schema.String, points: Schema.Array(Schema.String) },
) {
  override get message() {
    return `scene ${this.scene} has ${this.points.length} choices to judge: name one with --point (${this.points.join(', ')})`;
  }
}

/** A rule the app names that its file does not have. */
export class JudgeRuleMissing extends Schema.TaggedError<JudgeRuleMissing>()('JudgeRuleMissing', {
  file: Schema.String,
  heading: Schema.String,
}) {
  override get message() {
    return `${this.file} has no section "${this.heading}": the app's judge rules name it`;
  }
}

/** The counsel run failed: its exit and its last words. */
export class CounselFailed extends Schema.TaggedError<CounselFailed>()('CounselFailed', {
  dir: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the counsel run failed (${this.reason}); its files are under ${this.dir}`;
  }
}

/** The counsel answered, but with no ranking the judge can read. */
export class CounselUnreadable extends Schema.TaggedError<CounselUnreadable>()(
  'CounselUnreadable',
  { file: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `the counsel's answer (${this.file}) has no readable ranking: ${this.reason}`;
  }
}

// ---------------------------------------------------------------------------
// Moments

/**
 * A moment a judge shows: where in the scene (a look's place) and the
 * scene-local second of the frame a look draws there.
 */
export interface JudgeMoment {
  readonly at: string;
  readonly second: number;
}

/**
 * The moments a judge shows of `scene`: each mark's word and each cue's
 * middle, in time order, one per frame as a look resolves it (`momentOf`:
 * the film's frame, counted from the film's start), and at most `cap`,
 * spread evenly from the first to the last when there are more. A scene
 * with neither shows its middle.
 */
export const judgeMoments = (
  scene: SceneTimes,
  cap: number = JUDGE_MOMENTS,
): ReadonlyArray<JudgeMoment> => {
  const places = [
    ...Object.entries(scene.marks).map(([name, second]) => ({ at: `mark:${name}`, second })),
    ...Object.entries(scene.cues).map(([name, c]) => ({
      at: `cue:${name}@0.5`,
      second: (c.start + c.end) / 2,
    })),
  ]
    .filter((m) => m.second >= 0 && m.second <= scene.dur)
    .flatMap((m) => Option.toArray(Result.getSuccess(momentOf(scene, FILM_FPS, m.at))))
    .toSorted((a, b) => a.frame - b.frame || a.at.localeCompare(b.at));
  const once = Arr.dedupeWith(places, (a, b) => a.frame === b.frame).map((m): JudgeMoment => ({
    at: m.at,
    second: m.time,
  }));
  if (once.length === 0) return [{ at: (scene.dur / 2).toFixed(2), second: scene.dur / 2 }];
  if (once.length <= cap) return once;
  const picks = Arr.dedupe(
    Arr.makeBy(cap, (i) => Math.round((i * (once.length - 1)) / Math.max(1, cap - 1))),
  );
  return picks.flatMap((i) => Option.toArray(Arr.get(once, i)));
};

// ---------------------------------------------------------------------------
// The beat and its rules

/**
 * The registers a beat's picture names at its head (`STORY:`, `IDEA:`,
 * `IDEA, then STORY.`), in order; none when its head names neither.
 */
export const registersOf = (picture: string): ReadonlyArray<Register> => {
  const head = Option.getOrElse(Arr.head(picture.split(/[:.]/)), () => '');
  if (head.length > 40) return [];
  const words = Option.getOrElse(Option.fromNullishOr(head.match(/\b(?:STORY|IDEA)\b/g)), () => []);
  return Arr.dedupe(Arr.filter(words, Schema.is(Register)));
};

/**
 * One rule the judge quotes: a section of one of the app's rule files, by
 * its heading line as written (`## 12. The look`), quoted when the beat's
 * picture is in one of `registers` (always, when it names none).
 */
export interface JudgeRule {
  readonly file: string;
  readonly heading: string;
  readonly registers: ReadonlyArray<Register>;
}

/** The rules that bear on a beat in `registers`: each for every beat, or for one of its registers. */
export const rulesFor = (
  rules: ReadonlyArray<JudgeRule>,
  registers: ReadonlyArray<Register>,
): ReadonlyArray<JudgeRule> =>
  rules.filter((r) => r.registers.length === 0 || r.registers.some((x) => registers.includes(x)));

/** A heading line's level: its leading `#`s; 0 for a line that is no heading. */
const levelOf = (line: string): number =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(/^(#+)\s/.exec(line)), (m) => m[0].trim().length),
    () => 0,
  );

/**
 * The section of markdown `text` under the heading line `heading`: from it to
 * the next heading as high or higher, trimmed; none when no line is it.
 */
export const sectionOf = (text: string, heading: string): Option.Option<string> => {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.trim() === heading.trim());
  if (at === -1) return Option.none();
  const level = levelOf(heading.trim());
  const rest = lines.slice(at + 1);
  const end = Option.getOrElse(
    Arr.findFirstIndex(rest, (line) => {
      const l = levelOf(line);
      return l > 0 && l <= level;
    }),
    () => rest.length,
  );
  return Option.some([heading.trim(), ...rest.slice(0, end)].join('\n').trim());
};

// ---------------------------------------------------------------------------
// The key, the packet, the ranking and the verdict

/** One version as the key holds it: its label, its name in the film, and whether it is the pick. */
const KeyedVersion = Schema.Struct({
  label: Schema.String,
  /** The version's name: a look's level, a render's variant. */
  version: Schema.String,
  /** The owner's pick: the level the look plays, the render set's approved variant. */
  picked: Schema.Boolean,
  /** What it is, in a few words: `look ground at light`, `render main (stamp 3f2a…)`. */
  detail: Schema.String,
});
type KeyedVersion = typeof KeyedVersion.Type;

/** `key.json`: which label is which version. Never in the packet. */
export const JudgeKey = Schema.Struct({
  film: Schema.String,
  scene: Schema.String,
  point: Schema.String,
  /** When the judge drew it, ISO 8601. */
  at: Schema.String,
  versions: Schema.Array(KeyedVersion),
});
export type JudgeKey = typeof JudgeKey.Type;

export const JudgeKeyJson = Schema.fromJsonString(JudgeKey);

/** A quoted rule: its file, its heading and its words. */
export interface QuotedRule {
  readonly file: string;
  readonly heading: string;
  readonly text: string;
}

/** What a packet says: the beat, the rules, and each version's stills by label. */
interface PacketInput {
  /** What the versions differ in, in words that name no version: `look ground`. */
  readonly choice: string;
  readonly scene: string;
  readonly say: string;
  readonly picture: string;
  readonly registers: ReadonlyArray<Register>;
  /** The act the scene is in, when the film declares acts. */
  readonly act: Option.Option<string>;
  readonly rules: ReadonlyArray<QuotedRule>;
  readonly moments: ReadonlyArray<JudgeMoment>;
  /** Each label's stills, one per moment, in moment order. */
  readonly stills: ReadonlyArray<{ readonly label: string; readonly files: ReadonlyArray<string> }>;
}

/** A beat's words as heard: its mark braces (`{roof}`) dropped. */
const spoken = (say: string) =>
  say
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The packet a judge sends: the beat (its words, its picture's brief and
 * register), the rules quoted with their paths, each moment's still of each
 * label, and how to answer. It names no version, no pick and no author.
 */
export const packetOf = (input: PacketInput): string => {
  const labels = input.stills.map((s) => s.label);
  const momentRows = input.moments.map((m, i) => {
    const cells = input.stills.map((s) => Option.getOrElse(Arr.get(s.files, i), () => ''));
    return `| ${String(i + 1).padStart(2, '0')} | \`${m.at}\` | ${m.second.toFixed(2)} | ${cells.join(' | ')} |`;
  });
  const each = labels.map(
    (label) =>
      `### ${label}\n- Decided by: <still path> against <rule file> § <heading>\n- <one to three sentences on what the stills show against the rules>`,
  );
  return [
    `# Judge ${labels.length} versions of one scene`,
    '',
    `You are a second opinion on one choice in a narrated cut-paper explainer film. The ${labels.length} versions below are the same scene, \`${input.scene}\`, drawn the same way but for one choice: ${input.choice}. You see them only by label (${labels.join(', ')}), in an order drawn at random. This review is read-only: edit nothing.`,
    '',
    '## The beat',
    '',
    `- **Register:** ${input.registers.join(', then ') || 'not stated'}`,
    ...Option.toArray(Option.map(input.act, (act) => `- **Act:** ${act}`)),
    `- **What is said:** ${spoken(input.say)}`,
    `- **What the picture does (its brief):** ${input.picture}`,
    '',
    '## The rules that bear on it',
    '',
    ...input.rules.flatMap((r) => [`From \`${r.file}\`:`, '', r.text, '']),
    '## The stills',
    '',
    `Each row is one moment of the scene (a mark's word or a cue's middle), the same frame for every version. Open every still: each is an image file; view it.`,
    '',
    `| # | moment | s | ${labels.join(' | ')} |`,
    `|---|---|---|${labels.map(() => '---').join('|')}|`,
    ...momentRows,
    '',
    '## What to do',
    '',
    '1. View every still above.',
    '2. Judge each version against the rules quoted above, at these moments.',
    '3. Rank the versions, best first. For each version name the still (its file) and the rule (its file and heading) that decides it.',
    '4. When no version earns a preference over another, say so: a tie (`=`) or `no preference` is a sound answer, better than a guess.',
    '5. Judge only what the stills show against the rules: nothing else about the versions is given, and nothing else counts.',
    '',
    'Answer in exactly this form, the ranking line first and nothing else on it:',
    '',
    '```',
    `RANKING: <labels best first, ">" between, "=" for a tie>   (or: RANKING: no preference)`,
    '',
    ...each.flatMap((e) => [e, '']),
    '```',
  ].join('\n');
};

/** How a counsel ranked the versions: tiers best first (a tie shares one), or no preference. */
export type Ranking =
  | { readonly _tag: 'Ranked'; readonly tiers: ReadonlyArray<ReadonlyArray<string>> }
  | { readonly _tag: 'NoPreference' };

const RANKING_LINE = /^[\s>*_`-]*RANKING[*_`]*\s*:\s*(.+)$/i;

/** A heading that is one label alone: `### B`, `## Version B`. */
const LABEL_HEADING = /^(#{2,4})\s*(?:Version\s+)?([A-H])\s*$/i;

/** A whole ranking: one letter, then `>` or `=` and one letter, as many times, and nothing else. */
const RANKING_EXPRESSION = /^[A-Za-z](?:\s*[>=]\s*[A-Za-z])*$/;

/** No preference, said exactly. */
const NO_PREFERENCE = /^no preference$/i;

/**
 * The ranking in a counsel's `answer`: its last `RANKING:` line (markdown
 * emphasis aside), read as labels best first (`B > A = C`) or `no
 * preference`, each whole: an empty tier or label, or words after it, is
 * unreadable. Every label of `labels` must be named exactly once; anything
 * else is the reason it is unreadable.
 */
export const rankingOf = (
  answer: string,
  labels: ReadonlyArray<string>,
): Result.Result<Ranking, string> => {
  const line = Arr.findLast(answer.split('\n'), (l) => RANKING_LINE.test(l));
  if (Option.isNone(line)) return Result.fail('no line starts RANKING:');
  const said = Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(RANKING_LINE.exec(line.value)), (m) =>
      Option.fromUndefinedOr(m[1]),
    ),
    () => '',
  )
    .replace(/[*_`]/g, '')
    .trim();
  if (NO_PREFERENCE.test(said)) return Result.succeed({ _tag: 'NoPreference' });
  if (!RANKING_EXPRESSION.test(said))
    return Result.fail(
      `"${said}" is no whole ranking: labels best first, ">" or "=" between, and nothing else (or: no preference)`,
    );
  const tiers = said
    .split('>')
    .map((tier) => tier.split('=').map((label) => label.trim().toUpperCase()));
  const named = tiers.flat();
  const strange = named.filter((label) => !labels.includes(label));
  if (strange.length > 0) return Result.fail(`"${said}" names ${strange.join(', ')}, no label`);
  const missing = labels.filter((label) => !named.includes(label));
  if (missing.length > 0) return Result.fail(`"${said}" leaves out ${missing.join(', ')}`);
  if (named.length !== labels.length) return Result.fail(`"${said}" names a label twice`);
  return Result.succeed({ _tag: 'Ranked', tiers });
};

/** A label's version in `key`, by name; the label itself when the key lacks it. */
const nameOf = (key: JudgeKey, label: string): string =>
  Option.match(
    Arr.findFirst(key.versions, (v) => v.label === label),
    { onNone: () => label, onSome: (v) => v.version },
  );

/** The ranking in real names, one line: `light > now = lighter`, or `no preference`. */
export const rankingLine = (key: JudgeKey, ranking: Ranking): string => {
  if (ranking._tag === 'NoPreference') return 'no preference';
  return ranking.tiers.map((tier) => tier.map((l) => nameOf(key, l)).join(' = ')).join(' > ');
};

/** The owner's pick in `key`: the version picked, none when no version is. */
export const pickOf = (key: JudgeKey): Option.Option<KeyedVersion> =>
  Arr.findFirst(key.versions, (v) => v.picked);

/** How the ranking stands to the owner's pick, in a sentence. */
const besidePick = (key: JudgeKey, ranking: Ranking): string =>
  Option.match(pickOf(key), {
    onNone: () => "No version is the owner's pick yet.",
    onSome: (pick) => {
      if (ranking._tag === 'NoPreference')
        return `The owner's pick is ${pick.version}; the judge prefers none of the versions to another.`;
      const first = Option.getOrElse(Arr.head(ranking.tiers), (): ReadonlyArray<string> => []);
      if (!first.includes(pick.label))
        return `The owner's pick is ${pick.version}; the judge ranks ${first.map((l) => nameOf(key, l)).join(' and ')} above it.`;
      if (first.length > 1)
        return `The owner's pick is ${pick.version}; the judge ties it first with ${first
          .filter((l) => l !== pick.label)
          .map((l) => nameOf(key, l))
          .join(' and ')}.`;
      return `The owner's pick is ${pick.version}; the judge ranks it first too.`;
    },
  });

/** What a verdict is made of: the key, the ranking read, the counsel's answer and where things are. */
interface VerdictInput {
  readonly key: JudgeKey;
  readonly ranking: Ranking;
  readonly answer: string;
  readonly counsel: string;
  readonly packet: string;
}

/**
 * The verdict: the ranking in real names beside the owner's pick, the key,
 * and the counsel's reasons with each label's heading named
 * (`### light (B)`) and its ranking line in names; the counsel's answer and
 * the packet by path. A second opinion: it writes no choice.
 */
export const verdictOf = (input: VerdictInput): string => {
  const { key } = input;
  const named = (label: string) => `${nameOf(key, label)} (${label})`;
  const reasons = input.answer
    .split('\n')
    .map((line) =>
      Option.match(Option.fromNullishOr(LABEL_HEADING.exec(line.trim())), {
        onSome: ([, hashes = '###', label = '']) => `${hashes} ${named(label.toUpperCase())}`,
        onNone: () => {
          if (RANKING_LINE.test(line)) return `RANKING: ${rankingLine(key, input.ranking)}`;
          return line;
        },
      }),
    )
    .join('\n')
    .replace(/^```\w*\n?|\n?```\s*$/g, '')
    .trim();
  return [
    `# Judge: ${key.film}, scene ${key.scene}, ${key.point}`,
    '',
    "A blind second opinion beside the owner's pick. The judge writes no choice.",
    '',
    `**Ranking:** ${rankingLine(key, input.ranking)}`,
    '',
    besidePick(key, input.ranking),
    '',
    '## The key',
    '',
    "| label | version | what it is | owner's pick |",
    '|---|---|---|---|',
    ...key.versions.map(
      (v) =>
        `| ${v.label} | ${v.version} | ${v.detail} | ${Arr.filter(['yes'], () => v.picked).join('')} |`,
    ),
    '',
    "## The reasons (the counsel's, each label named)",
    '',
    reasons,
    '',
    '## Where it is',
    '',
    `- The counsel's answer: ${input.counsel}`,
    `- The packet it judged: ${input.packet}`,
    `- Drawn: ${key.at}`,
    '',
  ].join('\n');
};
