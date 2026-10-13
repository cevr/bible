import Foundation
import Testing

@testable import SelahCore

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let psalm23 = [
  "The LORD is my shepherd; I shall not want.",
  "He maketh me to lie down in green pastures: he leadeth me beside the still waters.",
  "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
  "Yea, though I walk through the valley of the shadow of death, I will fear no evil.",
].enumerated().map {
  Verse(book: 19, bookName: "Psalms", chapter: 23, number: $0.offset + 1, text: $0.element)
}
private let psalm24 = (1...3).map {
  Verse(book: 19, bookName: "Psalms", chapter: 24, number: $0, text: "Psalm 24 verse \($0)")
}
private let corpus = Corpus(verses: psalm23 + psalm24)
private let chapter = PracticeUnit(verses: psalm23, isChapter: true)

@Test func wholeChapterGoalPracticesTheChapterFromDayOneWithoutVerseCards() throws {
  var library = Library()
  library.goals = [Goal(title: "Psalms 23", book: 19, chapter: 23, method: .wholeChapter)]
  let queue = library.practiceQueue(in: corpus, now: now)
  #expect(queue.map(\.id) == ["chapter:19:23"])
  #expect(library.cues(for: chapter) == [.initials, .initials, .initials, .initials])
  try library.record(chapter, rating: .good, usedHint: false, now: now)
  #expect(Set(library.cards.keys) == ["chapter:19:23"])
  #expect(library.practiceQueue(in: corpus, now: now).isEmpty)
  #expect(
    library.practiceQueue(in: corpus, now: now.addingTimeInterval(11 * 60)).first?.id == chapter.id)
}

@Test func nextWholeChapterWaitsUntilTheCurrentOneIsRecalledWithoutCues() throws {
  var library = Library()
  library.goals = [Goal(title: "Psalms", book: 19, method: .wholeChapter)]
  try library.record(chapter, rating: .good, usedHint: false, now: now)
  let tomorrow = now.addingTimeInterval(86400)
  let waiting = Readiness(library: library, corpus: corpus, now: tomorrow)
  #expect(waiting.queue.map(\.id) == ["chapter:19:23"])
  #expect(waiting.waitingOn?.id == chapter.id)
  // The first recall faded every cue; an uncued, clean recall learns the chapter.
  #expect(library.cues(for: chapter).allSatisfy { $0 == .none })
  try library.record(chapter, rating: .good, usedHint: false, now: tomorrow)
  #expect(library.chapters[chapter.id]?.learned == tomorrow)
  let dayAfter = now.addingTimeInterval(2 * 86400)
  #expect(library.practiceQueue(in: corpus, now: dayAfter).map(\.id) == ["chapter:19:24"])
  #expect(
    Readiness(library: library, corpus: corpus, now: dayAfter).progress.first?.value.learned == 1)
}

@Test func slippedVersesComeFromTheComparisonAndGetMoreCueingNextTime() throws {
  let recall = """
    The LORD is my shepherd I shall not want
    He maketh me to lie down in green pastures he leadeth me beside the still waters
    He restoreth my soul he leadeth me in paths for his sake
    though I walk through the valley of the shadow of death I will fear no evil
    """
  let comparison = try RecallComparison(
    segments: chapter.verses.map(\.practiceText), recalled: recall)
  // Verse 3 lost four of sixteen words. Verse 4 lost one word of seventeen, which does not count.
  #expect(comparison.slippedSegments == [2])
  let weak = Set(comparison.slippedSegments.map { chapter.verses[$0].number })
  var library = Library()
  try library.record(chapter, rating: .easy, usedHint: false, weakVerses: weak, now: now)
  // Cues were shown, so Easy is recorded as Good.
  #expect(library.reviews.last?.rating == .good)
  #expect(library.reviews.last?.weakVerses == [3])
  #expect(library.cues(for: chapter) == [.none, .none, .full, .none])
  #expect(library.chapters[chapter.id]?.learned == nil)
  // Peeking at a verse during recall marks it weak too; clean verses keep fading.
  try library.record(chapter, rating: .good, usedHint: false, peeked: [1], now: now)
  #expect(library.cues(for: chapter) == [.initials, .none, .initials, .none])
  #expect(library.chapters[chapter.id]?.weakVerses == [1])
  // Again holds cues where they are.
  try library.record(chapter, rating: .again, usedHint: false, now: now)
  #expect(library.cues(for: chapter) == [.initials, .none, .initials, .none])
}

@Test func uncuedChapterAllowsEveryGradeAndLearnedVersesStartUncued() throws {
  var library = Library()
  for verse in psalm23 {
    try library.record(verse, rating: .good, usedHint: false, now: now.addingTimeInterval(-86400))
    try library.record(verse, rating: .good, usedHint: false, now: now)
  }
  #expect(library.cues(for: chapter).allSatisfy { $0 == .none })
  #expect(library.allowedRatings(for: chapter, usedHint: false) == RecallRating.allCases)
  #expect(library.allowedRatings(for: chapter, usedHint: false, peeked: [2]).last == .good)
  #expect(library.allowedRatings(for: chapter, usedHint: true).last == .hard)
}

@Test func switchingAGoalToWholeChapterRetiresItsVerseQueueButKeepsVerseCards() throws {
  var library = Library()
  library.goals = [Goal(title: "Psalms 23", book: 19, chapter: 23)]
  try library.record(psalm23[0], rating: .good, usedHint: false, now: now)
  #expect(library.practiceQueue(in: corpus, now: now).map(\.id) == ["19:23:2", "19:23:3"])
  library.goals[0].method = .wholeChapter
  #expect(library.practiceQueue(in: corpus, now: now).map(\.id) == ["chapter:19:23"])
  #expect(library.cards[psalm23[0].id] != nil)
  // Verse ranges always learn verse by verse.
  #expect(
    Goal(title: "", book: 19, chapter: 23, firstVerse: 1, method: .wholeChapter).learning
      == .verseByVerse)
}

/// The owner's progress file, as written before whole chapters and promises existed.
@Test func progressSavedBeforeWholeChaptersDecodesAndSavesWithoutLosingAnything() throws {
  let fixture = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    .appendingPathComponent("Fixtures/progress-before-whole-chapters.json")
  let original = try Data(contentsOf: fixture)
  let library = try JSONDecoder().decode(Library.self, from: original)
  #expect(library.goals.map(\.title) == ["Psalms 23", "Psalms 37"])
  #expect(library.goals.allSatisfy { $0.learning == .verseByVerse && $0.promises == nil })
  #expect(library.cards.count == 3)
  #expect(library.reviews.count == 5)
  #expect(library.chapters.isEmpty)
  #expect(library.preferences.remindersEnabled)
  let saved = try JSONEncoder().encode(library)
  func contains(_ whole: Any, _ part: Any) -> Bool {
    switch (whole, part) {
    case (let whole as [String: Any], let part as [String: Any]):
      return part.allSatisfy { key, value in whole[key].map { contains($0, value) } ?? false }
    case (let whole as [Any], let part as [Any]):
      return whole.count == part.count && zip(whole, part).allSatisfy { contains($0, $1) }
    case (let whole as NSNumber, let part as NSNumber):
      return whole == part
    default:
      return "\(whole)" == "\(part)"
    }
  }
  #expect(
    contains(
      try JSONSerialization.jsonObject(with: saved),
      try JSONSerialization.jsonObject(with: original)))
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    .appendingPathComponent("progress.json")
  defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
  try FileManager.default.createDirectory(
    at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
  try original.write(to: url)
  #expect(try ProgressFile(url: url).load().cards.count == 3)
  #expect(try Data(contentsOf: url) == original)
}
