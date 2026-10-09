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
      library.record(verse, rating: .again, usedHint: false, now: now)
    }
  }
  let restored = try await ProgressRepository(file: file).load()
  #expect(restored.queue(in: corpus, now: now.addingTimeInterval(599)).isEmpty)
  #expect(
    Set(restored.queue(in: corpus, now: now.addingTimeInterval(601)).map(\.number)) == [1, 2, 3])
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
    $0.record(verses[0], rating: .good, usedHint: false, now: now)
  }
  _ = try await (first, second)
  let restored = try await ProgressRepository(file: ProgressFile(url: url)).load()
  #expect(restored.preferences.newPerDay == 7)
  #expect(restored.reviews.count == 1)
  #expect(restored.cards[verses[0].id]?.repetitions == 1)
}

@Test func overlappingGoalsShareProgressAndIntroduceInCanonicalOrder() {
  var library = Library()
  library.goals = [
    Goal(title: "Passage", book: 19, chapter: 23, firstVerse: 2, lastVerse: 4),
    Goal(title: "Book", book: 19),
  ]
  library.record(verses[0], rating: .good, usedHint: false, now: now)
  #expect(library.queue(in: corpus, now: now).map(\.number) == [2, 3])
  #expect(library.cards.count == 1)
}

@Test func hintsCannotBeRecordedAsUnaidedEasyRecall() {
  var library = Library()
  library.record(verses[0], rating: .easy, usedHint: true, now: now)
  #expect(library.reviews.first?.rating == .hard)
  #expect(library.reviews.first?.usedHint == true)
}

@Test func successfulRecallExpandsSpacingAndLapseReturnsSoon() throws {
  var library = Library()
  library.record(verses[0], rating: .good, usedHint: false, now: now)
  #expect(library.cards[verses[0].id]?.due == now.addingTimeInterval(86400))
  library.record(verses[0], rating: .good, usedHint: false, now: now.addingTimeInterval(86400))
  #expect(library.cards[verses[0].id]?.interval == 6)
  library.record(verses[0], rating: .good, usedHint: false, now: now.addingTimeInterval(7 * 86400))
  #expect(try #require(library.cards[verses[0].id]).interval > 6)
  let lapseDate = now.addingTimeInterval(30 * 86400)
  library.record(verses[0], rating: .again, usedHint: false, now: lapseDate)
  #expect(library.cards[verses[0].id]?.due == lapseDate.addingTimeInterval(600))
  #expect(library.cards[verses[0].id]?.repetitions == 0)
}

@Test func newAllowanceResetsOnCalendarDayRatherThanElapsed24Hours() {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: -14400)!
  let late = calendar.date(
    from: DateComponents(year: 2026, month: 10, day: 9, hour: 23, minute: 59))!
  var library = Library()
  library.goals = [Goal(title: "Whole Bible")]
  for verse in verses.prefix(3) { library.record(verse, rating: .good, usedHint: false, now: late) }
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
