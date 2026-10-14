import FSRS
import Foundation

public struct Verse: Codable, Identifiable, Hashable, Sendable {
  public let book: Int
  public let bookName: String
  public let chapter: Int
  public let number: Int
  public let text: String
  public let marginNotes: [MarginNote]?
  public var id: String { "\(book):\(chapter):\(number)" }
  public var reference: String { "\(bookName) \(chapter):\(number)" }
  /// Preserve the source text; remove printed paragraph and italic markers for practice.
  public var practiceText: String {
    text.replacingOccurrences(of: "¶", with: "").replacingOccurrences(of: "[", with: "")
      .replacingOccurrences(of: "]", with: "").replacingOccurrences(of: "‹", with: "")
      .replacingOccurrences(of: "›", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
  }
  public init(
    book: Int, bookName: String, chapter: Int, number: Int, text: String,
    marginNotes: [MarginNote]? = nil
  ) {
    self.book = book
    self.bookName = bookName
    self.chapter = chapter
    self.number = number
    self.text = text
    self.marginNotes = marginNotes
  }
  public var initials: String {
    practiceText.split(separator: " ").map { word in
      String(word.first(where: { $0.isLetter || $0.isNumber }).map { String($0) } ?? "")
        + String(word.reversed().prefix(while: { !$0.isLetter && !$0.isNumber }).reversed())
    }.joined(separator: " ")
  }
}

/// How a goal's chapters are learned. Whole chapters are one practice unit from the first day.
public enum LearningMethod: String, Codable, CaseIterable, Sendable {
  case wholeChapter, verseByVerse
  public var title: String {
    switch self {
    case .wholeChapter: "Whole chapter"
    case .verseByVerse: "Verse by verse"
    }
  }
}

public struct Goal: Codable, Identifiable, Sendable {
  public let id: UUID
  public let title: String
  public let book: Int?
  public let chapter: Int?
  public let firstVerse: Int?
  public let lastVerse: Int?
  /// Absent in goals saved before whole chapters existed; those keep learning verse by verse.
  public var method: LearningMethod?
  /// A promise category identifier; such a goal practices that category's promises.
  public let promises: String?
  public init(
    title: String, book: Int? = nil, chapter: Int? = nil, firstVerse: Int? = nil,
    lastVerse: Int? = nil, method: LearningMethod? = nil, promises: String? = nil
  ) {
    id = UUID()
    self.title = title
    self.book = book
    self.chapter = chapter
    self.firstVerse = firstVerse
    self.lastVerse = lastVerse
    self.method = method
    self.promises = promises
  }
  /// Only goals that cover complete chapters can learn them whole.
  public var supportsWholeChapters: Bool {
    promises == nil && firstVerse == nil && lastVerse == nil
  }
  public var learning: LearningMethod {
    supportsWholeChapters ? method ?? .verseByVerse : .verseByVerse
  }
  public func contains(_ verse: Verse) -> Bool {
    promises == nil && (book == nil || verse.book == book)
      && (chapter == nil || verse.chapter == chapter)
      && (firstVerse == nil || verse.number >= firstVerse!)
      && (lastVerse == nil || verse.number <= lastVerse!)
  }
}

public enum RecallRating: Int, Codable, CaseIterable, Sendable {
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

public struct MemoryCard: Codable, Sendable {
  public var memory: Card?
  public var due: Date
  public var interval: Double = 0
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
  public let rating: RecallRating
  public let usedHint: Bool
  public let interval: Double
  /// Whole-chapter recalls record the verse numbers that slipped.
  public var weakVerses: [Int]? = nil
}

/// Canonical FSRS 6, fixed 90% retention, no interval fuzz so previews match saved schedules.
public enum Scheduler {
  public static func review(_ original: MemoryCard, rating: RecallRating, now: Date) throws
    -> MemoryCard
  {
    let scheduler = FSRS(parameters: FSRSParameters(w: FSRSDefaults.defaultWv6, enableFuzz: false))
    let grade = Rating(rawValue: rating.rawValue)!
    let result = try scheduler.next(card: original.memory ?? Card(due: now), now: now, grade: grade)
    var updated = original
    updated.memory = result.card
    updated.due = result.card.due
    updated.interval = result.card.due.timeIntervalSince(now) / 86400
    updated.repetitions = rating == .again ? 0 : original.repetitions + 1
    updated.lapses = result.card.lapses
    return updated
  }
  public static func intervalLabel(_ days: Double) -> String {
    let minutes = max(1, Int((days * 1440).rounded()))
    if minutes < 60 { return "\(minutes) min" }
    if minutes < 1440 { return "\(minutes / 60) hr" }
    return "\(Int(days.rounded()))d"
  }
}

/// Follow the system appearance, or keep Selah light or dark.
public enum Appearance: String, Codable, CaseIterable, Sendable {
  case system, light, dark
  public var title: String {
    switch self {
    case .system: "System"
    case .light: "Light"
    case .dark: "Dark"
    }
  }
}

/// A speech model that turns a spoken recall into text on this Mac.
public enum DictationModel: String, Codable, CaseIterable, Sendable {
  /// Apple's long-form transcription model (SpeechTranscriber), installed by macOS.
  case appleSpeech
  /// Apple's dictation model (DictationTranscriber), the same one macOS dictation uses.
  case appleDictation
  /// NVIDIA Parakeet TDT-CTC 110M, which Selah downloads into its own Models folder.
  case parakeetSmall
  /// NVIDIA Parakeet TDT 0.6B v2, which Selah downloads into its own Models folder.
  case parakeetLarge
  public var title: String {
    switch self {
    case .appleSpeech: "Apple Speech"
    case .appleDictation: "Apple Dictation"
    case .parakeetSmall: "Parakeet Small"
    case .parakeetLarge: "Parakeet Large"
    }
  }
  /// Selah downloads, stores, and deletes this model itself; macOS manages Apple's.
  public var isLocal: Bool { self == .parakeetSmall || self == .parakeetLarge }
}

public struct Preferences: Codable, Sendable {
  public var appearance = Appearance.system
  public var newPerDay = 3
  public var reminderMinutes = 60
  public var remindersEnabled = false
  public var showMarginNotes = false
  public var reader = ReaderPreferences()
  public var dictationEnabled = false
  public var dictationModel = DictationModel.appleSpeech
  public var backupsEnabled = true
  public var quietHoursEnabled = true
  public var quietStartMinutes = 22 * 60
  public var quietEndMinutes = 8 * 60
  public init() {}
  private enum CodingKeys: String, CodingKey {
    case appearance, reader, dictationEnabled, dictationModel, newPerDay, reminderMinutes,
      remindersEnabled,
      showMarginNotes,
      backupsEnabled,
      quietHoursEnabled,
      quietStartMinutes, quietEndMinutes
  }
  public init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    appearance = try values.decodeIfPresent(Appearance.self, forKey: .appearance) ?? .system
    newPerDay = max(1, min(20, try values.decodeIfPresent(Int.self, forKey: .newPerDay) ?? 3))
    reminderMinutes = max(1, try values.decodeIfPresent(Int.self, forKey: .reminderMinutes) ?? 60)
    remindersEnabled = try values.decodeIfPresent(Bool.self, forKey: .remindersEnabled) ?? false
    reader =
      try values.decodeIfPresent(ReaderPreferences.self, forKey: .reader) ?? ReaderPreferences()
    dictationEnabled = try values.decodeIfPresent(Bool.self, forKey: .dictationEnabled) ?? false
    // An unknown model (say, from a newer build) falls back to the default rather than failing the file.
    dictationModel =
      (try? values.decodeIfPresent(DictationModel.self, forKey: .dictationModel)) ?? .appleSpeech
    showMarginNotes = try values.decodeIfPresent(Bool.self, forKey: .showMarginNotes) ?? false
    backupsEnabled = try values.decodeIfPresent(Bool.self, forKey: .backupsEnabled) ?? true
    quietHoursEnabled = try values.decodeIfPresent(Bool.self, forKey: .quietHoursEnabled) ?? true
    quietStartMinutes = max(
      0, min(1439, try values.decodeIfPresent(Int.self, forKey: .quietStartMinutes) ?? 22 * 60))
    quietEndMinutes = max(
      0, min(1439, try values.decodeIfPresent(Int.self, forKey: .quietEndMinutes) ?? 8 * 60))
  }
}

public struct Library: Codable, Sendable {
  public var schemaVersion: Int = 2
  public var goals: [Goal] = []
  public var cards: [String: MemoryCard] = [:]
  public var reviews: [Review] = []
  public var preferences = Preferences()
  /// Cue ladders for whole-chapter recall, keyed by chapter unit identifier.
  public var chapters: [String: ChapterProgress] = [:]
  public init() {}
  private enum CodingKeys: String, CodingKey {
    case schemaVersion, goals, cards, reviews, preferences, chapters
  }
  public init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    schemaVersion = try values.decode(Int.self, forKey: .schemaVersion)
    goals = try values.decodeIfPresent([Goal].self, forKey: .goals) ?? []
    cards = try values.decodeIfPresent([String: MemoryCard].self, forKey: .cards) ?? [:]
    reviews = try values.decodeIfPresent([Review].self, forKey: .reviews) ?? []
    preferences =
      try values.decodeIfPresent(Preferences.self, forKey: .preferences) ?? Preferences()
    chapters =
      try values.decodeIfPresent([String: ChapterProgress].self, forKey: .chapters) ?? [:]
  }
  /// Stops practicing a goal. Cards, chapter progress, and review history stay, so adding the
  /// same passage or category again resumes where it left off.
  public mutating func removeGoal(_ id: UUID) {
    goals.removeAll { $0.id == id }
  }
  /// Verses learned one at a time, in canonical order across verse-by-verse goals.
  public func selectedVerses(in corpus: Corpus) -> [Verse] {
    let verseGoals = goals.filter { $0.promises == nil && $0.learning == .verseByVerse }
    if verseGoals.isEmpty { return [] }
    if verseGoals.count == 1 { return corpus.verses(for: verseGoals[0]) }
    let ids = Set(verseGoals.flatMap { corpus.verses(for: $0) }.map(\.id))
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
    let introducedToday = cards.filter {
      !$0.key.hasPrefix("chapter:") && $0.value.introduced >= day.start
        && $0.value.introduced < day.end
    }.count
    let allowance = max(0, preferences.newPerDay - introducedToday)
    let new = selected.lazy.filter { cards[$0.id] == nil }.prefix(
      min(allowance, max(0, limit - due.count)))
    return due + Array(new)
  }
  public mutating func record(_ verse: Verse, rating: RecallRating, usedHint: Bool, now: Date)
    throws
  {
    try record(PracticeUnit(verses: [verse]), rating: rating, usedHint: usedHint, now: now)
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
    guard (1...2).contains(library.schemaVersion) else { throw LibraryError.unsupportedVersion }
    if library.schemaVersion == 1 {
      try backup(now: Date())
      var migrated = library
      let history = Dictionary(grouping: library.reviews, by: \.verseID)
      for (id, original) in library.cards {
        var card = MemoryCard(now: original.introduced)
        for review in (history[id] ?? []).sorted(by: { $0.date < $1.date }) {
          card = try Scheduler.review(card, rating: review.rating, now: review.date)
        }
        // Existing invitations stay valid; subsequent reviews use the reconstructed FSRS state.
        card.due = original.due
        card.interval = original.interval
        migrated.cards[id] = card
      }
      migrated.schemaVersion = 2
      try save(migrated)
      return migrated
    }
    return library
  }
  public var backupDirectory: URL {
    url.deletingLastPathComponent().appendingPathComponent("Backups")
  }
  /// The first valid snapshot each day is immutable. Keep the last 30 daily snapshots.
  public func backup(now: Date, calendar: Calendar = .current) throws {
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    let bytes = try Data(contentsOf: url)
    _ = try JSONDecoder().decode(Library.self, from: bytes)
    let components = calendar.dateComponents([.year, .month, .day], from: now)
    let name = String(
      format: "%04d-%02d-%02d.json", components.year!, components.month!, components.day!)
    try FileManager.default.createDirectory(at: backupDirectory, withIntermediateDirectories: true)
    let destination = backupDirectory.appendingPathComponent(name)
    if !FileManager.default.fileExists(atPath: destination.path) {
      try bytes.write(to: destination, options: .atomic)
    }
    let snapshots = try FileManager.default.contentsOfDirectory(
      at: backupDirectory, includingPropertiesForKeys: nil
    )
    .filter {
      $0.lastPathComponent.range(of: #"^\d{4}-\d{2}-\d{2}\.json$"#, options: .regularExpression)
        != nil
    }
    .sorted { $0.lastPathComponent > $1.lastPathComponent }
    for old in snapshots.dropFirst(30) { try FileManager.default.removeItem(at: old) }
  }
  public func save(_ library: Library) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONEncoder().encode(library).write(to: url, options: .atomic)
  }
}
