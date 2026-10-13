import Foundation

/// One graded recall: a verse, a short passage, or a whole chapter.
/// A chapter is graded independently; rehearsing it never changes individual verse schedules.
public struct PracticeUnit: Identifiable, Hashable, Sendable {
  public enum Kind: Hashable, Sendable { case verse, passage, chapter }
  public let verses: [Verse]
  public let kind: Kind
  public var isChapter: Bool { kind == .chapter }
  public var id: String {
    guard let first = verses.first, let last = verses.last else { return "empty" }
    switch kind {
    case .verse: return first.id
    case .passage: return "passage:\(first.book):\(first.chapter):\(first.number)-\(last.number)"
    case .chapter: return "chapter:\(first.book):\(first.chapter)"
    }
  }
  public var reference: String {
    guard let first = verses.first, let last = verses.last else { return "" }
    switch kind {
    case .verse: return first.reference
    case .passage: return "\(first.reference)–\(last.number)"
    case .chapter: return "\(first.bookName) \(first.chapter)"
    }
  }
  public var practiceText: String { verses.map(\.practiceText).joined(separator: "\n") }
  public var initials: String { verses.map(\.initials).joined(separator: "\n") }
  public init(verses: [Verse], isChapter: Bool = false) {
    self.verses = verses
    kind = isChapter ? .chapter : verses.count > 1 ? .passage : .verse
  }
}

/// Everything the goals ask Selah to schedule, computed once per readiness snapshot.
public struct Curriculum: Sendable {
  /// Verses from verse-by-verse goals, in canonical order.
  public let verses: [Verse]
  /// Each promise goal's units, in goal order.
  public let promises: [[PracticeUnit]]
  /// Chapters from whole-chapter goals, in canonical order.
  public let wholeChapters: [PracticeUnit]
  /// Fully chosen chapters of verse-by-verse goals; they join review once their verses are learned.
  public let earnedChapters: [PracticeUnit]
  public var chapters: [PracticeUnit] { unique(wholeChapters + earnedChapters) }
  public var singles: [PracticeUnit] {
    unique(verses.map { PracticeUnit(verses: [$0]) } + promises.flatMap { $0 })
  }
  private func unique(_ units: [PracticeUnit]) -> [PracticeUnit] {
    var seen = Set<String>()
    return units.filter { seen.insert($0.id).inserted }
  }
}

extension Library {
  public func curriculum(in corpus: Corpus) -> Curriculum {
    let selected = selectedVerses(in: corpus)
    var seen = Set<String>()
    let whole = goals.filter { $0.learning == .wholeChapter }
      .flatMap { corpus.chapters(for: $0) }
      .map { PracticeUnit(verses: $0, isChapter: true) }
      .filter { seen.insert($0.id).inserted }
      .sorted { Library.canonical($0, $1) }
    return Curriculum(
      verses: selected,
      promises: [],
      wholeChapters: whole,
      earnedChapters: chapterUnits(in: corpus, selected: selected))
  }
  static func canonical(_ lhs: PracticeUnit, _ rhs: PracticeUnit) -> Bool {
    let left = lhs.verses[0]
    let right = rhs.verses[0]
    return (left.book, left.chapter, left.number) < (right.book, right.chapter, right.number)
  }
  public func chapterUnits(in corpus: Corpus, selected: [Verse]) -> [PracticeUnit] {
    let groups = Dictionary(grouping: selected) { ChapterKey(book: $0.book, chapter: $0.chapter) }
    return groups.values.filter { verses in
      guard let first = verses.first else { return false }
      return verses.count == corpus.verses(book: first.book, chapter: first.chapter).count
    }.map { PracticeUnit(verses: $0, isChapter: true) }.sorted { Library.canonical($0, $1) }
  }
  public func chapterEligible(_ unit: PracticeUnit) -> Bool {
    !unit.verses.isEmpty && unit.verses.allSatisfy { (cards[$0.id]?.repetitions ?? 0) >= 2 }
  }
  /// A new whole chapter starts once every started whole chapter has been recalled without cues.
  public func nextWholeChapter(in curriculum: Curriculum) -> PracticeUnit? {
    guard chaptersInProgress(in: curriculum).isEmpty else { return nil }
    return curriculum.wholeChapters.first { cards[$0.id] == nil }
  }
  /// Started whole chapters that still need a recall without cues.
  public func chaptersInProgress(in curriculum: Curriculum) -> [PracticeUnit] {
    curriculum.wholeChapters.filter { cards[$0.id] != nil && chapters[$0.id]?.learned == nil }
  }
  public func practiceQueue(
    in corpus: Corpus, now: Date, calendar: Calendar = .current, limit: Int = 10,
    curriculum: Curriculum? = nil
  ) -> [PracticeUnit] {
    guard limit > 0 else { return [] }
    let plan = curriculum ?? self.curriculum(in: corpus)
    let day = calendar.dateInterval(of: .day, for: now)!
    func introducedToday(chapters: Bool) -> Int {
      cards.filter {
        $0.key.hasPrefix("chapter:") == chapters && $0.value.introduced >= day.start
          && $0.value.introduced < day.end
      }.count
    }
    func due(_ units: [PracticeUnit]) -> [PracticeUnit] {
      units.filter { cards[$0.id].map { $0.due <= now } ?? false }
        .sorted { cards[$0.id]!.due < cards[$1.id]!.due }
    }
    var result = Array(due(plan.chapters).prefix(limit))
    if result.count < limit, introducedToday(chapters: true) == 0,
      let next = nextWholeChapter(in: plan)
        ?? plan.earnedChapters.first(where: { cards[$0.id] == nil && chapterEligible($0) })
    {
      result.append(next)
    }
    result += due(plan.singles).prefix(max(0, limit - result.count))
    let allowance = min(
      max(0, preferences.newPerDay - introducedToday(chapters: false)),
      max(0, limit - result.count))
    result += newSingles(in: plan, count: allowance, excluding: Set(result.map(\.id)))
    return result
  }
  /// New verses keep canonical order; each promise goal takes turns with them.
  func newSingles(in plan: Curriculum, count: Int, excluding: Set<String>) -> [PracticeUnit] {
    guard count > 0 else { return [] }
    var streams: [AnyIterator<PracticeUnit>] = [
      AnyIterator(
        plan.verses.lazy.filter { cards[$0.id] == nil }.map { PracticeUnit(verses: [$0]) }
          .makeIterator())
    ]
    streams += plan.promises.map { AnyIterator($0.filter { cards[$0.id] == nil }.makeIterator()) }
    var chosen: [PracticeUnit] = []
    var seen = excluding
    while chosen.count < count && !streams.isEmpty {
      var remaining: [AnyIterator<PracticeUnit>] = []
      for stream in streams where chosen.count < count {
        while let unit = stream.next() {
          if seen.insert(unit.id).inserted {
            chosen.append(unit)
            remaining.append(stream)
            break
          }
        }
      }
      streams = remaining
    }
    return chosen
  }
  public mutating func record(
    _ unit: PracticeUnit, rating: RecallRating, usedHint: Bool, weakVerses: Set<Int> = [],
    peeked: Set<Int> = [], now: Date
  ) throws {
    let cues = cues(for: unit)
    let allowed = allowedRatings(for: unit, usedHint: usedHint, peeked: peeked)
    let effective = allowed.contains(rating) ? rating : allowed.last!
    let updated = try Scheduler.review(
      cards[unit.id] ?? MemoryCard(now: now), rating: effective, now: now)
    cards[unit.id] = updated
    let weak = weakVerses.union(peeked)
    reviews.append(
      Review(
        verseID: unit.id, date: now, rating: effective, usedHint: usedHint,
        interval: updated.interval, weakVerses: unit.isChapter ? weak.sorted() : nil))
    if unit.isChapter { advanceCues(unit, from: cues, rating: effective, weak: weak, now: now) }
  }
}
