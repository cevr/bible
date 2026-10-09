import Foundation

public struct Verse: Codable, Identifiable, Hashable, Sendable {
  public let book: Int
  public let bookName: String
  public let chapter: Int
  public let number: Int
  public let text: String
  public var id: String { "\(book):\(chapter):\(number)" }
  public var reference: String { "\(bookName) \(chapter):\(number)" }
  /// Preserve the source text; remove printed paragraph and italic markers for practice.
  public var practiceText: String {
    text.replacingOccurrences(of: "¶", with: "").replacingOccurrences(of: "[", with: "")
      .replacingOccurrences(of: "]", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
  }
  public init(book: Int, bookName: String, chapter: Int, number: Int, text: String) {
    self.book = book
    self.bookName = bookName
    self.chapter = chapter
    self.number = number
    self.text = text
  }
  public var initials: String {
    practiceText.split(separator: " ").map { word in
      String(word.prefix(1))
        + String(word.reversed().prefix(while: { !$0.isLetter && !$0.isNumber }).reversed())
    }.joined(separator: " ")
  }
}

public struct Goal: Codable, Identifiable, Sendable {
  public let id: UUID
  public let title: String
  public let book: Int?
  public let chapter: Int?
  public let firstVerse: Int?
  public let lastVerse: Int?
  public init(
    title: String, book: Int? = nil, chapter: Int? = nil, firstVerse: Int? = nil,
    lastVerse: Int? = nil
  ) {
    id = UUID()
    self.title = title
    self.book = book
    self.chapter = chapter
    self.firstVerse = firstVerse
    self.lastVerse = lastVerse
  }
  public func contains(_ verse: Verse) -> Bool {
    (book == nil || verse.book == book) && (chapter == nil || verse.chapter == chapter)
      && (firstVerse == nil || verse.number >= firstVerse!)
      && (lastVerse == nil || verse.number <= lastVerse!)
  }
}

public enum Rating: Int, Codable, CaseIterable, Sendable {
  case again = 1
  case hard, good, easy
  public var title: String {
    switch self {
    case .again: "Again"
    case .hard: "Hard"
    case .good: "Good"
    case .easy: "Easy"
    }
  }
}

public struct Card: Codable, Sendable {
  public var due: Date
  public var interval: Double = 0
  public var ease: Double = 2.5
  public var repetitions: Int = 0
  public var lapses: Int = 0
  public let introduced: Date
  public init(now: Date) {
    due = now
    introduced = now
  }
}

public struct Review: Codable, Sendable {
  public let verseID: String
  public let date: Date
  public let rating: Rating
  public let usedHint: Bool
  public let interval: Double
}

/// SM-2-derived baseline. Minute-scale relearning and four UI grades are deliberate adaptations.
/// This is not FSRS. Keep raw review events so a future scheduler can learn from the history.
public enum Scheduler {
  public static func review(_ original: Card, rating: Rating, now: Date) -> Card {
    var card = original
    let quality: Double =
      switch rating {
      case .again: 1
      case .hard: 3
      case .good: 4
      case .easy: 5
      }
    card.ease = max(1.3, card.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    if rating == .again {
      card.repetitions = 0
      card.lapses += 1
      card.interval = 10.0 / 1440
    } else {
      card.interval =
        card.repetitions == 0 ? 1 : (card.repetitions == 1 ? 6 : ceil(card.interval * card.ease))
      card.repetitions += 1
    }
    card.due = now.addingTimeInterval(card.interval * 86400)
    return card
  }
  public static func intervalLabel(_ days: Double) -> String {
    days < 1 ? "10 min" : "\(Int(days))d"
  }
}

public struct Preferences: Codable, Sendable {
  public var newPerDay: Int = 3
  public var reminderMinutes: Int = 60
  public var remindersEnabled: Bool = false
  public init() {}
}

public struct Library: Codable, Sendable {
  public var schemaVersion: Int = 1
  public var goals: [Goal] = []
  public var cards: [String: Card] = [:]
  public var reviews: [Review] = []
  public var preferences = Preferences()
  public init() {}
  public func selectedVerses(in corpus: Corpus) -> [Verse] {
    if goals.isEmpty { return [] }
    if goals.count == 1 { return corpus.verses(for: goals[0]) }
    let ids = Set(goals.flatMap { corpus.verses(for: $0) }.map(\.id))
    return corpus.verses.filter { ids.contains($0.id) }
  }
  public func queue(in corpus: Corpus, now: Date, calendar: Calendar = .current, limit: Int = 10)
    -> [Verse]
  {
    queue(
      in: corpus, now: now, calendar: calendar, limit: limit, selected: selectedVerses(in: corpus))
  }
  func queue(
    in corpus: Corpus, now: Date, calendar: Calendar = .current, limit: Int = 10, selected: [Verse]
  ) -> [Verse] {
    let due = selected.compactMap { verse -> (Verse, Date)? in
      guard let card = cards[verse.id], card.due <= now else { return nil }
      return (verse, card.due)
    }.sorted { $0.1 < $1.1 }.prefix(limit).map { $0.0 }
    let day = calendar.dateInterval(of: .day, for: now)!
    let introducedToday = cards.values.filter {
      $0.introduced >= day.start && $0.introduced < day.end
    }.count
    let allowance = max(0, preferences.newPerDay - introducedToday)
    let new = selected.lazy.filter { cards[$0.id] == nil }.prefix(
      min(allowance, max(0, limit - due.count)))
    return due + Array(new)
  }
  public mutating func record(_ verse: Verse, rating: Rating, usedHint: Bool, now: Date) {
    let effective = usedHint && rating.rawValue > Rating.hard.rawValue ? Rating.hard : rating
    let updated = Scheduler.review(cards[verse.id] ?? Card(now: now), rating: effective, now: now)
    cards[verse.id] = updated
    reviews.append(
      Review(
        verseID: verse.id, date: now, rating: effective, usedHint: usedHint,
        interval: updated.interval))
  }
}

public enum LibraryError: Error, LocalizedError {
  case unsupportedVersion
  public var errorDescription: String? {
    "This progress file was created by a newer Selah version. Update Selah to open it."
  }
}

public struct ProgressFile: Sendable {
  public let url: URL
  public init(url: URL) { self.url = url }
  public func load() throws -> Library {
    guard FileManager.default.fileExists(atPath: url.path) else { return Library() }
    let library = try JSONDecoder().decode(Library.self, from: Data(contentsOf: url))
    guard library.schemaVersion == 1 else { throw LibraryError.unsupportedVersion }
    return library
  }
  public func save(_ library: Library) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONEncoder().encode(library).write(to: url, options: .atomic)
  }
}
