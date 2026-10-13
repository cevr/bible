import Foundation

/// A chapter is graded independently; rehearsing it never changes individual verse schedules.
public struct PracticeUnit: Identifiable, Hashable, Sendable {
  public let verses: [Verse]
  public let isChapter: Bool
  public var id: String {
    guard let first = verses.first else { return "empty" }
    return isChapter ? "chapter:\(first.book):\(first.chapter)" : first.id
  }
  public var reference: String {
    guard let first = verses.first else { return "" }
    return isChapter ? "\(first.bookName) \(first.chapter)" : first.reference
  }
  public var practiceText: String { verses.map(\.practiceText).joined(separator: "\n") }
  public var initials: String { verses.map(\.initials).joined(separator: "\n") }
  public init(verses: [Verse], isChapter: Bool = false) {
    self.verses = verses
    self.isChapter = isChapter
  }
}

extension Library {
  public func chapterUnits(in corpus: Corpus, selected: [Verse]) -> [PracticeUnit] {
    let groups = Dictionary(grouping: selected) { ChapterKey(book: $0.book, chapter: $0.chapter) }
    return groups.values.filter { verses in
      guard let first = verses.first else { return false }
      return verses.count == corpus.verses(book: first.book, chapter: first.chapter).count
    }.sorted { $0[0].book == $1[0].book ? $0[0].chapter < $1[0].chapter : $0[0].book < $1[0].book }
      .map { PracticeUnit(verses: $0, isChapter: true) }
  }
  public func chapterEligible(_ unit: PracticeUnit) -> Bool {
    !unit.verses.isEmpty && unit.verses.allSatisfy { (cards[$0.id]?.repetitions ?? 0) >= 2 }
  }
  public func practiceQueue(
    in corpus: Corpus, now: Date, calendar: Calendar = .current, limit: Int = 10,
    selected: [Verse]? = nil
  ) -> [PracticeUnit] {
    guard limit > 0 else { return [] }
    let selected = selected ?? selectedVerses(in: corpus)
    let chapters = chapterUnits(in: corpus, selected: selected)
    let due = chapters.filter { cards[$0.id].map { $0.due <= now } ?? false }
      .sorted { cards[$0.id]!.due < cards[$1.id]!.due }.prefix(limit)
    let day = calendar.dateInterval(of: .day, for: now)!
    let introduced = cards.filter {
      $0.key.hasPrefix("chapter:") && $0.value.introduced >= day.start
        && $0.value.introduced < day.end
    }.count
    let newChapter =
      introduced == 0 ? chapters.first { cards[$0.id] == nil && chapterEligible($0) } : nil
    var result = Array(due)
    if result.count < limit, let newChapter { result.append(newChapter) }
    result += queue(
      in: corpus, now: now, calendar: calendar, limit: max(0, limit - result.count),
      selected: selected
    ).map { PracticeUnit(verses: [$0]) }
    return result
  }
  public mutating func record(_ unit: PracticeUnit, rating: RecallRating, usedHint: Bool, now: Date)
    throws
  {
    let effective =
      usedHint && rating.rawValue > RecallRating.hard.rawValue ? RecallRating.hard : rating
    let updated = try Scheduler.review(
      cards[unit.id] ?? MemoryCard(now: now), rating: effective, now: now)
    cards[unit.id] = updated
    reviews.append(
      Review(
        verseID: unit.id, date: now, rating: effective, usedHint: usedHint,
        interval: updated.interval))
  }
}
