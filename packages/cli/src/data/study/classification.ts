// @effect-diagnostics strictBooleanExpressions:off strictEffectProvide:off
import type { LanguageModel } from 'ai';
import { BibleDatabase, type CrossReference } from '@bible/core/bible-db';
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, Schema } from 'effect';

import { AI } from '../../services/ai.js';
import { CROSS_REF_TYPES, type CrossRefClassification } from '../bible/state.js';
import type { ClassifiedCrossReference, CrossRefServiceInstance } from './cross-refs.js';

// Schema for generateObject output
const ClassificationResult = Schema.Struct({
  classifications: Schema.Array(
    Schema.Struct({
      refBook: Schema.Number,
      refChapter: Schema.Number,
      refVerse: Schema.NullOr(Schema.Number),
      type: Schema.Literals(CROSS_REF_TYPES),
      confidence: Schema.Number.check(
        Schema.isGreaterThanOrEqualTo(0),
        Schema.isLessThanOrEqualTo(1),
      ),
    }),
  ),
});

const SYSTEM_PROMPT = `You are a biblical cross-reference classifier using a historicist/Adventist framework.
Classify each cross-reference by following this decision tree IN ORDER. Pick the FIRST matching type.

## Decision Tree (follow top-to-bottom, stop at first match)

1. Is there verbatim or near-verbatim shared text (3+ consecutive words)?
   → quotation
2. Is there shared vocabulary, imagery, or phrasing without verbatim match?
   → allusion
3. Is it the same event or teaching told from a different perspective?
   (Synoptic parallels, Kings↔Chronicles, Samuel↔Psalms superscriptions)
   → parallel
4. Does the OT element foreshadow/escalate into a NT reality?
   (The antitype ALWAYS exceeds the type)
   → typological
5. Is there explicit predictive language ("shall come", "in that day") OR
   explicit fulfillment language ("that it might be fulfilled", "as was spoken")?
   → prophecy
6. Does the connection involve tabernacle/temple/priestly/sacrificial service?
   (Altar, laver, shewbread, lampstand, incense, ark, Day of Atonement, etc.)
   → sanctuary
7. Are BOTH passages prophetic sequences covering the same historical ground?
   (Daniel 2↔7↔8↔11; Revelation churches↔seals↔trumpets↔bowls)
   → recapitulation
8. None of the above match?
   → thematic

## Canonical Examples

| Source | Target | Type | Why |
|--------|--------|------|-----|
| Hos 11:1 | Mat 2:15 | quotation | "Out of Egypt have I called my son" — verbatim |
| Isa 53:7 | Act 8:32-33 | quotation | Philip reads the direct passage |
| Gen 1:2 | Rev 22:1 | allusion | "waters" + Spirit imagery, no verbatim |
| Psa 22:18 | Joh 19:24 | allusion | "parted my garments" echoed in narrative |
| 2Sa 11:2-4 | 1Ch 20:1 | parallel | Same Ammonite war, different account |
| Mat 14:13-21 | Mar 6:30-44 | parallel | Feeding 5000, synoptic accounts |
| Gen 22:8 | Joh 1:29 | typological | Abraham's lamb → Lamb of God (escalation) |
| Exo 12:46 | Joh 19:36 | typological | Passover lamb → Christ (no bone broken) |
| Num 21:9 | Joh 3:14 | typological | Bronze serpent lifted up → Son of Man |
| Isa 7:14 | Mat 1:22-23 | prophecy | "A virgin shall conceive" — explicit prediction + fulfillment formula |
| Dan 9:25 | Luk 3:1 | prophecy | 69 weeks → Messiah's appearance |
| Exo 25:30 | Joh 6:35 | sanctuary | Shewbread → Bread of Life |
| Lev 16:15-16 | Heb 9:11-12 | sanctuary | Day of Atonement → Christ enters heavenly sanctuary |
| Dan 2 | Dan 7 | recapitulation | Metals → Beasts: same kingdoms, different symbols |
| Rev 2-3 | Rev 6 | recapitulation | Seven churches → Seven seals: church history retold |
| Psa 1:3 | Jer 17:8 | thematic | Blessed man as tree — shared metaphor, no textual link |

## Type-Antitype Reference

| OT Type | NT Antitype | Key Texts |
|---|---|---|
| Passover Lamb | Christ crucified | Exodus 12; 1 Cor 5:7; John 1:29 |
| Day of Atonement | Investigative Judgment | Leviticus 16; Daniel 8:14; Hebrews 9 |
| High Priest | Christ as High Priest | Leviticus 16; Hebrews 4:14-16; 8:1 |
| Eve from Adam's side | Church from Christ's pierced side | Gen 2:21-22; John 19:34 |
| Manna | Christ, Bread of Life | Exodus 16; John 6:31-35 |
| Bronze serpent | Christ lifted up | Numbers 21:9; John 3:14 |
| Scapegoat (Azazel) | Satan bearing guilt | Lev 16:8-10,20-22 |

## Sanctuary Mapping

Court: Altar of Sacrifice, Bronze Laver
Holy Place: Table of Shewbread, 7-Branch Lampstand, Altar of Incense
Most Holy Place: Ark of the Covenant (Ten Commandments)

## Recapitulation Parallels

Daniel 2 (metals) ↔ Daniel 7 (beasts) ↔ Daniel 8 (ram/goat) ↔ Daniel 11 (kings)
Revelation 2-3 (churches) ↔ Rev 6 (seals) ↔ Rev 8-11 (trumpets) ↔ Rev 12-14 (beasts)

Respond with JSON only. Each ref identified by refBook (1-66), refChapter, refVerse (null if chapter-level).`;

const BATCH_SIZE = 50;

/**
 * Classify cross-references for a verse using AI.
 * Constructs a one-shot AI layer, runs classification, saves to state.db.
 * Returns enriched refs from CrossRefService.
 */
export async function classifyVerseCrossRefs(
  book: number,
  chapter: number,
  verse: number,
  crossRefService: CrossRefServiceInstance,
  aiModels: { high: LanguageModel; low: LanguageModel },
): Promise<readonly ClassifiedCrossReference[]> {
  // Skip if already classified
  if (crossRefService.isClassified(book, chapter, verse)) {
    return crossRefService.getCrossRefs(book, chapter, verse);
  }

  // Build one-shot AI + BibleDatabase layer
  const ClassificationLayer = AI.fromModel(aiModels).pipe(
    Layer.provideMerge(BibleDatabase.Default),
    Layer.provideMerge(BunServices.layer),
  );

  await Effect.runPromise(
    Effect.gen(function* () {
      const ai = yield* AI;
      const db = yield* BibleDatabase;

      // Get raw refs
      const rawRefs = yield* db
        .getCrossRefs(book, chapter, verse)
        .pipe(Effect.catch(() => Effect.succeed([] as readonly CrossReference[])));

      if (rawRefs.length === 0) return;

      // Get source verse text
      const sourceVerseOpt = yield* db
        .getVerse(book, chapter, verse)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      const sourceText =
        sourceVerseOpt !== null && sourceVerseOpt._tag === 'Some'
          ? sourceVerseOpt.value.text.slice(0, 200)
          : '';

      const allClassifications: CrossRefClassification[] = [];
      const now = Date.now();

      for (let i = 0; i < rawRefs.length; i += BATCH_SIZE) {
        const batch = rawRefs.slice(i, i + BATCH_SIZE);

        const refLines = batch.map((r, idx) => {
          const preview = r.previewText ? ` — "${r.previewText.slice(0, 80)}"` : '';
          return `${idx + 1}. ${r.book}:${r.chapter}:${r.verse ?? 'chapter'}${preview}`;
        });

        const userMessage = `Source verse (${book}:${chapter}:${verse}): "${sourceText}"

Cross-references to classify:
${refLines.join('\n')}

Classify each reference using the decision tree.`;

        const aiResult = yield* ai
          .generateObject({
            model: 'low',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
            schema: ClassificationResult,
          })
          .pipe(Effect.catch(() => Effect.succeed({ object: { classifications: [] } })));

        for (const c of aiResult.object.classifications) {
          allClassifications.push({
            refBook: c.refBook,
            refChapter: c.refChapter,
            refVerse: c.refVerse,
            refVerseEnd: null,
            type: c.type,
            confidence: c.confidence,
            classifiedAt: now,
          });
        }
      }

      // Save to state.db
      if (allClassifications.length > 0) {
        crossRefService.saveClassifications(book, chapter, verse, allClassifications);
      }
    }).pipe(Effect.provide(ClassificationLayer), Effect.scoped),
  );

  return crossRefService.getCrossRefs(book, chapter, verse);
}

/**
 * Classify a single cross-reference using AI.
 * Saves the result to state.db and returns the classification type.
 */
export async function classifySingleCrossRef(
  source: { book: number; chapter: number; verse: number },
  target: ClassifiedCrossReference,
  crossRefService: CrossRefServiceInstance,
  aiModels: { high: LanguageModel; low: LanguageModel },
): Promise<CrossRefClassification | null> {
  const ClassificationLayer = AI.fromModel(aiModels).pipe(
    Layer.provideMerge(BibleDatabase.Default),
    Layer.provideMerge(BunServices.layer),
  );

  const SingleResult = Schema.Struct({
    type: Schema.Literals(CROSS_REF_TYPES),
    confidence: Schema.Number.check(
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(1),
    ),
  });

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const ai = yield* AI;
      const db = yield* BibleDatabase;

      // Get source verse text
      const sourceVerseOpt = yield* db
        .getVerse(source.book, source.chapter, source.verse)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      const sourceText =
        sourceVerseOpt !== null && sourceVerseOpt._tag === 'Some'
          ? sourceVerseOpt.value.text.slice(0, 200)
          : '';

      // Get target verse text
      const targetVerse = target.verse ?? 1;
      const targetVerseOpt = yield* db
        .getVerse(target.book, target.chapter, targetVerse)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      const targetText =
        targetVerseOpt !== null && targetVerseOpt._tag === 'Some'
          ? targetVerseOpt.value.text.slice(0, 200)
          : (target.previewText ?? '');

      const userMessage = `Source verse (${source.book}:${source.chapter}:${source.verse}): "${sourceText}"

Target reference (${target.book}:${target.chapter}:${target.verse ?? 'chapter'}): "${targetText}"

Classify this single cross-reference using the decision tree.`;

      const aiResult = yield* ai
        .generateObject({
          model: 'low',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          schema: SingleResult,
        })
        .pipe(Effect.catch(() => Effect.succeed(null)));

      if (aiResult === null) return null;

      const classification: CrossRefClassification = {
        refBook: target.book,
        refChapter: target.chapter,
        refVerse: target.verse,
        refVerseEnd: target.verseEnd,
        type: aiResult.object.type,
        confidence: aiResult.object.confidence,
        classifiedAt: Date.now(),
      };

      crossRefService.saveClassification(source.book, source.chapter, source.verse, classification);

      return classification;
    }).pipe(Effect.provide(ClassificationLayer), Effect.scoped),
  );

  return result;
}
