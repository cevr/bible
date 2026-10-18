// The critique (`film lab critique`, the lab's `critique` tool): each figure a
// match held against its concept, shown to a fresh model at 1:1 beside the
// match's flagged rows and the house rules' figure sections, its findings
// written beside the match's table (`<stem>.critique.md`). `core/critique.ts`
// holds its words.
//
// One counsel run (`tools/counsel.ts`: headless Opus at max effort, Read its
// one tool, in a sandbox that shows it the packet's folder alone) answers
// every figure at a place: batched. The answer is kept by the hash of all it
// was shown (`out/<film>/critique/<hash>.json`: the packet's words but the
// place, and each crop's bytes), so the same prompt over the same crops is
// never asked twice, and a prompt reworded is asked again. The rule
// sections are read once, when the critic is built: one its file lacks
// fails the build (`CritiqueRuleMissing`), as the judge's does. Past that it
// fails open: a counsel that fails, an answer that does not read, crops that
// cannot be read or a defect is a skip, logged (`critique.skipped`) and said
// in each file, never a failure of the caller's; a finding that does not
// read, or names no figure asked about, is rejected and said.

import {
  Array as Arr,
  Cause,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import {
  type CritiqueFigure,
  CritiqueFinding,
  type CritiqueRead,
  type CritiqueRule,
  type QuotedSection,
  critiqueMarkdown,
  critiquePacket,
  findingsOf,
} from '../core/critique.ts';
import { sectionOf } from '../core/judge.ts';
import { type MatchTaken, matchLines } from '../core/match.ts';
import { Counsel } from './counsel.ts';
import { sha256Hex } from './digest.ts';

/** One figure critiqued: its findings, the file they are written in, and whether the answer was kept from before. */
const FigureCritiqued = Schema.Struct({
  figure: Schema.String,
  findings: Schema.Array(CritiqueFinding),
  file: Schema.String,
});

/** A critique's answer: each figure's, whether it was kept from before, and why it was skipped when it was. */
export const CritiqueTaken = Schema.Struct({
  figures: Schema.Array(FigureCritiqued),
  cached: Schema.Boolean,
  skipped: Schema.optionalKey(Schema.String),
  /** Each finding the answer gave that did not read, or named no figure asked about. */
  rejected: Schema.Array(Schema.String),
});
export type CritiqueTaken = typeof CritiqueTaken.Type;

const KeptAnswer = Schema.fromJsonString(
  Schema.Struct({
    findings: Schema.Array(CritiqueFinding),
    rejected: Schema.Array(Schema.String),
  }),
);

/** A rule section its file lacks, or a rule file that cannot be read: the critic is not built without it. */
class CritiqueRuleMissing extends Schema.TaggedError<CritiqueRuleMissing>()('CritiqueRuleMissing', {
  file: Schema.String,
  heading: Schema.String,
}) {
  override get message() {
    return `the critique quotes "${this.heading}" from ${this.file}, and the file has no such section: fix the heading in the app's critique rules`;
  }
}

interface CriticService {
  /** The figures `taken` matched, critiqued against their concepts: never fails, a skip is said and logged. */
  readonly critique: (taken: MatchTaken) => Effect.Effect<CritiqueTaken>;
}

/** The rows a figure's table flagged, as `matchLines` says them. */
const flaggedOf = (m: MatchTaken['figures'][number]): ReadonlyArray<string> =>
  matchLines(m)
    .slice(1)
    .map((line) => line.trim());

/** Each figure as the packet names it: its crops by their files beside the packet, and its flagged rows. */
const figuresOf = (taken: MatchTaken): ReadonlyArray<CritiqueFigure> =>
  taken.figures.map((m) => ({
    figure: m.figure,
    concept: `${m.figure}-concept.png`,
    scene: `${m.figure}-scene.png`,
    flagged: flaggedOf(m),
  }));

/** Where a match's figures were drawn, in words: the scene, the place, the time and the build. */
const placeOf = (taken: MatchTaken) =>
  `${taken.scene} ${taken.at}, t=${taken.time.toFixed(2)}, build ${taken.build}`;

export class Critic extends Context.Service<Critic, CriticService>()('@bible/film/tools/Critic') {
  /** The critic over the app's rule sections `rules` (`FilmApp.critique`), asking the counsel; refused when a section is missing. */
  static readonly layer = (rules: ReadonlyArray<CritiqueRule>) =>
    Layer.effect(
      Critic,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const counsel = yield* Counsel;

        // The rule sections, quoted by file name, read once: a section its file lacks fails the build.
        const sections: ReadonlyArray<QuotedSection> = yield* Effect.forEach(rules, (rule) =>
          Effect.gen(function* () {
            const text = yield* fs
              .readFileString(rule.file)
              .pipe(
                Effect.mapError(() =>
                  CritiqueRuleMissing.make({ file: rule.file, heading: rule.heading }),
                ),
              );
            const section = yield* Effect.fromOption(sectionOf(text, rule.heading)).pipe(
              Effect.mapError(() =>
                CritiqueRuleMissing.make({ file: rule.file, heading: rule.heading }),
              ),
            );
            return { file: path.basename(rule.file), heading: rule.heading, text: section };
          }),
        );

        /** The counsel's findings on `figures` (their crops copied beside the packet), or why there are none. */
        const asked = (
          place: string,
          taken: MatchTaken,
          kept: string,
        ): Effect.Effect<CritiqueRead, string> =>
          Effect.scoped(
            Effect.gen(function* () {
              const dir = yield* fs.makeTempDirectoryScoped();
              const figures = figuresOf(taken);
              yield* Effect.forEach(taken.figures, (m) =>
                Effect.all([
                  fs.copyFile(m.crops.concept, path.join(dir, `${m.figure}-concept.png`)),
                  fs.copyFile(m.crops.scene, path.join(dir, `${m.figure}-scene.png`)),
                ]),
              );
              const packet = path.join(dir, 'packet.md');
              yield* fs.writeFileString(packet, critiquePacket(place, figures, sections));
              return packet;
            }).pipe(
              Effect.mapError((error) => `the packet cannot be written: ${error.message}`),
              Effect.flatMap((packet) =>
                counsel
                  .ask(packet, path.join(path.dirname(kept), 'counsel'))
                  .pipe(Effect.mapError((error) => error.message)),
              ),
              Effect.flatMap((answer) =>
                Effect.fromResult(
                  findingsOf(
                    answer.text,
                    taken.figures.map((m) => m.figure),
                  ),
                ),
              ),
              Effect.tap((read) =>
                Schema.encodeEffect(KeptAnswer)({
                  findings: [...read.findings],
                  rejected: [...read.rejected],
                }).pipe(
                  Effect.flatMap((json) => fs.writeFileString(kept, json)),
                  Effect.ignore,
                ),
              ),
            ),
          );

        /** The answer kept for `hash`, when one was. */
        const keptAnswer = (kept: string) =>
          fs.readFileString(kept).pipe(
            Effect.flatMap((text) => Schema.decodeEffect(KeptAnswer)(text)),
            Effect.option,
          );

        const critique = Effect.fn('Critic.critique')(function* (taken: MatchTaken) {
          const place = placeOf(taken);
          if (taken.figures.length === 0)
            return { figures: [], cached: false, rejected: [] } satisfies CritiqueTaken;
          const started = yield* Clock.currentTimeMillis;
          const outFilm = Option.match(Arr.head(taken.figures), {
            onNone: () => '',
            onSome: (m) => path.dirname(path.dirname(path.dirname(m.table))),
          });
          const read = yield* Effect.gen(function* () {
            const crops = yield* Effect.forEach(taken.figures, (m) =>
              Effect.all([fs.readFile(m.crops.concept), fs.readFile(m.crops.scene)]).pipe(
                Effect.map(([concept, scene]) => [sha256Hex(concept), sha256Hex(scene)]),
                Effect.mapError((error) => `${m.figure}'s crops cannot be read: ${error.message}`),
              ),
            );
            // The prompt as sent, but the place (its build and time change with every build).
            const hash = sha256Hex(
              [critiquePacket('', figuresOf(taken), sections), ...crops.flat()].join('\n'),
            );
            const kept = path.join(outFilm, 'critique', `${hash.slice(0, 32)}.json`);
            yield* fs
              .makeDirectory(path.dirname(kept), { recursive: true })
              .pipe(Effect.mapError((error) => error.message));
            const before = yield* keptAnswer(kept);
            if (Option.isSome(before)) return { read: before.value, cached: true };
            return { read: yield* asked(place, taken, kept), cached: false };
          }).pipe(
            Effect.result,
            Effect.catchDefect((defect) =>
              Effect.succeed(Result.fail(`the critique died: ${Cause.pretty(Cause.die(defect))}`)),
            ),
          );
          const findings = Result.map(read, (r) => r.read);
          const figures = yield* Effect.forEach(taken.figures, (m) =>
            Effect.gen(function* () {
              const file = `${m.table.replace(/\.md$/, '')}.critique.md`;
              yield* fs
                .writeFileString(file, critiqueMarkdown(m.figure, place, findings))
                .pipe(Effect.ignore);
              return {
                figure: m.figure,
                findings: Result.match(findings, {
                  onFailure: () => [],
                  onSuccess: (r) => r.findings.filter((f) => f.figure === m.figure),
                }),
                file,
              };
            }),
          );
          const cached = Result.match(read, { onFailure: () => false, onSuccess: (r) => r.cached });
          yield* Result.match(read, {
            onFailure: (why) =>
              Effect.logWarning(
                `critique.skipped scene=${taken.scene} at=${taken.at} figures=${figures.length} reason=${why}`,
              ),
            onSuccess: (r) =>
              Effect.flatMap(Clock.currentTimeMillis, (now) =>
                Effect.log(
                  `critique scene=${taken.scene} at=${taken.at} figures=${figures.length} findings=${r.read.findings.length} rejected=${r.read.rejected.length} cached=${r.cached} ms=${now - started}`,
                ),
              ),
          });
          return Result.match(read, {
            onFailure: (skipped): CritiqueTaken => ({ figures, cached, skipped, rejected: [] }),
            onSuccess: (r): CritiqueTaken => ({ figures, cached, rejected: r.read.rejected }),
          });
        });

        return Critic.of({ critique });
      }),
    );

  /** A critic that skips every critique, saying `reason`: a lab that runs no counsel (a harness, a test). */
  static readonly skipping = (reason: string) =>
    Layer.succeed(
      Critic,
      Critic.of({
        critique: () =>
          Effect.succeed({ figures: [], cached: false, skipped: reason, rejected: [] }),
      }),
    );
}
