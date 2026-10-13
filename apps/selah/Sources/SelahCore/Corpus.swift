import Foundation

public struct ChapterKey: Hashable, Sendable {
  public let book: Int
  public let chapter: Int
}

/// Immutable indexes shared by practice, navigation, and passage rehearsal.
public struct Corpus: Sendable {
  public let verses: [Verse]
  public let books: [Verse]
  private let scripture: [String: Scripture]
  public func rendering(for verse: Verse) -> Scripture {
    scripture[verse.id] ?? Scripture(verse: verse)
  }
  private let byBook: [Int: [Verse]]
  private let byChapter: [ChapterKey: [Verse]]
  private let chapterOrder: [ChapterKey]
  public init(verses: [Verse]) {
    self.verses = verses
    scripture = Dictionary(uniqueKeysWithValues: verses.map { ($0.id, Scripture(verse: $0)) })
    books = verses.filter { $0.chapter == 1 && $0.number == 1 }
    byBook = Dictionary(grouping: verses, by: \.book)
    byChapter = Dictionary(grouping: verses) { ChapterKey(book: $0.book, chapter: $0.chapter) }
    chapterOrder = verses.filter { $0.number == 1 }.map {
      ChapterKey(book: $0.book, chapter: $0.chapter)
    }
  }
  public func chapterCount(book: Int) -> Int { byBook[book]?.last?.chapter ?? 1 }
  public func verses(book: Int, chapter: Int) -> [Verse] {
    byChapter[ChapterKey(book: book, chapter: chapter)] ?? []
  }
  public func verses(for goal: Goal) -> [Verse] {
    let candidates: [Verse]
    if let book = goal.book, let chapter = goal.chapter {
      candidates = verses(book: book, chapter: chapter)
    } else if let book = goal.book {
      candidates = byBook[book] ?? []
    } else {
      candidates = verses
    }
    if goal.firstVerse == nil && goal.lastVerse == nil { return candidates }
    return candidates.filter { goal.contains($0) }
  }
  public func bookRehearsal(book: Int) -> [PracticeUnit] {
    chapters(for: Goal(title: "", book: book)).map { PracticeUnit(verses: $0, isChapter: true) }
  }
  public func chapters(for goal: Goal) -> [[Verse]] {
    chapterOrder.filter {
      (goal.book == nil || $0.book == goal.book)
        && (goal.chapter == nil || $0.chapter == goal.chapter)
    }
    .compactMap { key in
      let selected = (byChapter[key] ?? []).filter { goal.contains($0) }
      return selected.isEmpty ? nil : selected
    }
  }
}

public struct Readiness: Sendable {
  public let queue: [PracticeUnit]
  public let dueCount: Int
  public let reviewedToday: Int
  public let selected: [Verse]
  public let learnedByGoal: [UUID: Int]
  public let countByGoal: [UUID: Int]
  public let nextReview: Date?
  public let hasNew: Bool
  public init(library: Library, corpus: Corpus, now: Date) {
    selected = library.selectedVerses(in: corpus)
    queue = library.practiceQueue(in: corpus, now: now, selected: selected)
    let chapters = library.chapterUnits(in: corpus, selected: selected)
    dueCount =
      (selected.map { PracticeUnit(verses: [$0]) } + chapters).filter {
        library.cards[$0.id].map { $0.due <= now } ?? false
      }.count
    nextReview = (selected.map(\.id) + chapters.map(\.id)).compactMap { library.cards[$0]?.due }
      .min()
    hasNew =
      selected.contains { library.cards[$0.id] == nil }
      || chapters.contains { library.cards[$0.id] == nil && library.chapterEligible($0) }
    let day = Calendar.current.dateInterval(of: .day, for: now)!
    reviewedToday =
      Set(library.reviews.filter { $0.date >= day.start && $0.date < day.end }.map(\.verseID)).count
    var learned: [UUID: Int] = [:]
    var counts: [UUID: Int] = [:]
    for goal in library.goals {
      let verses = corpus.verses(for: goal)
      counts[goal.id] = verses.count
      learned[goal.id] = verses.filter { (library.cards[$0.id]?.repetitions ?? 0) >= 2 }.count
    }
    learnedByGoal = learned
    countByGoal = counts
  }
}

/// Serial storage transactions execute on this actor, away from the main UI actor.
/// Publish a new library only after its atomic write succeeds.
public actor ProgressRepository {
  private let file: ProgressFile
  private var library: Library?
  private var backupDay: Date?
  public init(file: ProgressFile) { self.file = file }
  public func load() throws -> Library {
    if let library { return library }
    let loaded = try file.load()
    library = loaded
    return loaded
  }
  public func dailyBackup(now: Date = Date(), calendar: Calendar = .current) throws -> Date? {
    let current = try load()
    guard current.preferences.backupsEnabled else { return nil }
    let day = calendar.startOfDay(for: now)
    guard backupDay != day else { return day }
    if !FileManager.default.fileExists(atPath: file.url.path) { try file.save(current) }
    try file.backup(now: now, calendar: calendar)
    backupDay = day
    return day
  }
  public func update(_ operation: @Sendable (inout Library) throws -> Void) throws -> Library {
    _ = try? dailyBackup()
    var updated = try load()
    try operation(&updated)
    try file.save(updated)
    library = updated
    return updated
  }
}
