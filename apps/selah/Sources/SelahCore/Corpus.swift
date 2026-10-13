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
  /// Promise goals practice their category's promises; unknown categories yield nothing.
  public func promiseUnits(for goal: Goal) -> [PracticeUnit] { [] }
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

/// Progress toward one goal, in the unit that goal is learned by.
public struct GoalProgress: Sendable {
  public enum Measure: Sendable { case verses, chapters, promises }
  public let measure: Measure
  public let learned: Int
  public let total: Int
  /// The whole chapter currently being learned, with how many of its verses stand without cues.
  public let chapter: ChapterStatus?
}

public struct ChapterStatus: Sendable {
  public let unit: PracticeUnit
  public let uncued: Int
  public let started: Bool
}

public struct Readiness: Sendable {
  public let queue: [PracticeUnit]
  public let dueCount: Int
  public let reviewedToday: Int
  public let hasGoals: Bool
  public let progress: [UUID: GoalProgress]
  public let nextReview: Date?
  public let hasNew: Bool
  /// A started whole chapter that holds back the next one until it is recalled without cues.
  public let waitingOn: PracticeUnit?
  public init(library: Library, corpus: Corpus, now: Date) {
    let curriculum = library.curriculum(in: corpus)
    hasGoals = !library.goals.isEmpty
    queue = library.practiceQueue(in: corpus, now: now, curriculum: curriculum)
    let units = curriculum.singles + curriculum.chapters
    dueCount = units.filter { library.cards[$0.id].map { $0.due <= now } ?? false }.count
    nextReview = units.compactMap { library.cards[$0.id]?.due }.min()
    hasNew =
      curriculum.singles.contains { library.cards[$0.id] == nil }
      || library.nextWholeChapter(in: curriculum) != nil
      || curriculum.earnedChapters.contains {
        library.cards[$0.id] == nil && library.chapterEligible($0)
      }
    let pending = curriculum.wholeChapters.contains { library.cards[$0.id] == nil }
    waitingOn = pending ? library.chaptersInProgress(in: curriculum).first : nil
    let day = Calendar.current.dateInterval(of: .day, for: now)!
    reviewedToday =
      Set(library.reviews.filter { $0.date >= day.start && $0.date < day.end }.map(\.verseID)).count
    var progress: [UUID: GoalProgress] = [:]
    for goal in library.goals {
      progress[goal.id] = Readiness.progress(of: goal, library: library, corpus: corpus)
    }
    self.progress = progress
  }
  static func progress(of goal: Goal, library: Library, corpus: Corpus) -> GoalProgress {
    if goal.promises != nil {
      let units = corpus.promiseUnits(for: goal)
      return GoalProgress(
        measure: .promises, learned: units.filter { library.isLearned($0) }.count,
        total: units.count, chapter: nil)
    }
    if goal.learning == .wholeChapter {
      let units = corpus.chapters(for: goal).map { PracticeUnit(verses: $0, isChapter: true) }
      let current = units.first { !library.isLearned($0) }.map { unit in
        ChapterStatus(
          unit: unit, uncued: library.cues(for: unit).filter { $0 == .none }.count,
          started: library.cards[unit.id] != nil)
      }
      return GoalProgress(
        measure: .chapters, learned: units.filter { library.isLearned($0) }.count,
        total: units.count, chapter: current)
    }
    let verses = corpus.verses(for: goal)
    return GoalProgress(
      measure: .verses,
      learned: verses.filter { (library.cards[$0.id]?.repetitions ?? 0) >= 2 }.count,
      total: verses.count, chapter: nil)
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
