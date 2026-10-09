import Foundation
import Testing

@testable import SelahCore

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let verses = (1...8).map {
  Verse(book: 19, bookName: "Psalms", chapter: 23, number: $0, text: "Verse \($0)")
}

private let corpus = Corpus(verses: verses)

@Test func hintsUseLettersRatherThanPrintedBibleMarkup() {
  let verse = Verse(
    book: 19, bookName: "Psalms", chapter: 23, number: 1,
    text: "¶ The LORD [is] my shepherd; I shall not want.")
  #expect(verse.initials == "T L i m s; I s n w.")
  #expect(verse.practiceText == "The LORD is my shepherd; I shall not want.")
  #expect(verse.text == "¶ The LORD [is] my shepherd; I shall not want.")
}

@Test func dailyIntroductionCapSurvivesRelaunchAndAllowsDueReviews() async throws {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    .appendingPathComponent("progress.json")
  defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
  let file = ProgressFile(url: url)
  let repository = ProgressRepository(file: file)
  let library = try await repository.update {
    $0.goals = [Goal(title: "Psalms 23", book: 19, chapter: 23)]
  }
  #expect(library.queue(in: corpus, now: now).map(\.number) == [1, 2, 3])
  _ = try await repository.update { library in
    for verse in verses.prefix(3) {
      try library.record(verse, rating: .again, usedHint: false, now: now)
    }
  }
  let restored = try await ProgressRepository(file: file).load()
  #expect(restored.queue(in: corpus, now: now.addingTimeInterval(59)).isEmpty)
  #expect(
    Set(restored.queue(in: corpus, now: now.addingTimeInterval(61)).map(\.number)) == [1, 2, 3])
  #expect(restored.reviews.count == 3)
  #expect(restored.goals.first?.title == "Psalms 23")
}

@Test func concurrentStorageTransactionsPreserveBothChanges() async throws {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    .appendingPathComponent("progress.json")
  defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
  let repository = ProgressRepository(file: ProgressFile(url: url))
  async let first = repository.update { $0.preferences.newPerDay = 7 }
  async let second = repository.update {
    try $0.record(verses[0], rating: .good, usedHint: false, now: now)
  }
  _ = try await (first, second)
  let restored = try await ProgressRepository(file: ProgressFile(url: url)).load()
  #expect(restored.preferences.newPerDay == 7)
  #expect(restored.reviews.count == 1)
  #expect(restored.cards[verses[0].id]?.repetitions == 1)
}

@Test func overlappingGoalsShareProgressAndIntroduceInCanonicalOrder() throws {
  var library = Library()
  library.goals = [
    Goal(title: "Passage", book: 19, chapter: 23, firstVerse: 2, lastVerse: 4),
    Goal(title: "Book", book: 19),
  ]
  try library.record(verses[0], rating: .good, usedHint: false, now: now)
  #expect(library.queue(in: corpus, now: now).map(\.number) == [2, 3])
  #expect(library.cards.count == 1)
}

@Test func hintsCannotBeRecordedAsUnaidedEasyRecall() throws {
  var library = Library()
  try library.record(verses[0], rating: .easy, usedHint: true, now: now)
  #expect(library.reviews.first?.rating == .hard)
  #expect(library.reviews.first?.usedHint == true)
}

@Test func canonicalFSRS6IntervalsAndLapse() throws {
  var card = MemoryCard(now: now)
  let grades: [RecallRating] = [
    .good, .good, .good, .good, .good, .good, .again, .again, .good, .good, .good, .good, .good,
  ]
  var intervals: [Int] = []
  for grade in grades {
    card = try Scheduler.review(card, rating: grade, now: card.due)
    intervals.append(Int(card.interval))
  }
  #expect(intervals == [0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21])
  #expect(Scheduler.intervalLabel(1.0 / 1440) == "1 min")
}

@Test func newAllowanceResetsOnCalendarDayRatherThanElapsed24Hours() throws {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: -14400)!
  let late = calendar.date(
    from: DateComponents(year: 2026, month: 10, day: 9, hour: 23, minute: 59))!
  var library = Library()
  library.goals = [Goal(title: "Whole Bible")]
  for verse in verses.prefix(3) {
    try library.record(verse, rating: .good, usedHint: false, now: late)
  }
  #expect(library.queue(in: corpus, now: late, calendar: calendar).isEmpty)
  #expect(
    library.queue(in: corpus, now: late.addingTimeInterval(120), calendar: calendar).map(\.number)
      == [4, 5, 6])
}

@Test func corruptProgressIsReportedAndPreserved() throws {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: url) }
  let bytes = Data("corrupt progress".utf8)
  try bytes.write(to: url)
  #expect(throws: (any Error).self) { try ProgressFile(url: url).load() }
  #expect(try Data(contentsOf: url) == bytes)
}

@Test func chapterReviewsHaveIndependentSchedulesAndDoNotConsumeVerseAllowance() throws {
  var library = Library()
  library.goals = [Goal(title: "Psalm 23", book: 19, chapter: 23)]
  for verse in verses {
    try library.record(verse, rating: .good, usedHint: false, now: now.addingTimeInterval(-86400))
    try library.record(verse, rating: .good, usedHint: false, now: now)
  }
  let unit = try #require(library.practiceQueue(in: corpus, now: now).first)
  #expect(unit.isChapter)
  let originalDates = library.cards.mapValues(\.due)
  try library.record(unit, rating: .easy, usedHint: false, now: now)
  for verse in verses { #expect(library.cards[verse.id]?.due == originalDates[verse.id]) }
  #expect(library.cards[unit.id]?.due == now.addingTimeInterval(8 * 86400))
  #expect(library.practiceQueue(in: corpus, now: now).isEmpty)
  #expect(
    library.practiceQueue(in: corpus, now: now.addingTimeInterval(8 * 86400)).first?.id == unit.id)
}

@Test func versionOneMigrationReplaysHistoryAndPreservesDueDateAndOriginalBackup() throws {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    .appendingPathComponent("progress.json")
  defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
  let file = ProgressFile(url: url)
  try FileManager.default.createDirectory(
    at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
  // Independent literal fixture in the shipped v1 format; dates are seconds since Apple's reference date.
  let bytes = Data(
    """
    {"schemaVersion":1,"goals":[],"cards":{"19:23:1":{"due":100086400,"interval":1,"ease":2.5,"repetitions":1,"lapses":0,"introduced":100000000}},"reviews":[{"verseID":"19:23:1","date":100000000,"rating":3,"usedHint":false,"interval":1}],"preferences":{"newPerDay":3,"reminderMinutes":60,"remindersEnabled":false}}
    """.utf8)
  try bytes.write(to: url)
  let migrated = try file.load()
  #expect(migrated.schemaVersion == 2)
  let card = try #require(migrated.cards["19:23:1"])
  #expect(card.due == Date(timeIntervalSinceReferenceDate: 100_086_400))
  #expect(abs(try #require(card.memory).stability - 2.3065) < 0.00001)
  let backups = try FileManager.default.contentsOfDirectory(
    at: file.backupDirectory, includingPropertiesForKeys: nil)
  #expect(backups.count == 1)
  #expect(try Data(contentsOf: #require(backups.first)) == bytes)
  #expect(try file.load().reviews.count == 1)
}
