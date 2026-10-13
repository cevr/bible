import Foundation

/// How much of a verse is shown while reciting a whole chapter.
/// Cues fade one step after a clean recall and return one step where the recall slipped.
public enum Cue: String, Codable, CaseIterable, Sendable {
  case full, initials, none
  public var more: Cue {
    switch self {
    case .none: .initials
    case .initials, .full: .full
    }
  }
  public var fewer: Cue {
    switch self {
    case .full: .initials
    case .initials, .none: .none
    }
  }
}

/// A whole chapter's cue ladder. The chapter keeps one FSRS card; this records where it broke down.
public struct ChapterProgress: Codable, Sendable, Equatable {
  /// Cue per verse number, as a string key for readable JSON.
  public var cues: [String: Cue] = [:]
  /// Verses that slipped in the latest recall.
  public var weakVerses: [Int] = []
  /// The first recall with no cues, no slipped verses, and a passing grade.
  public var learned: Date?
  public init() {}
}

extension Library {
  /// A verse with no ladder yet starts uncued once its own card has two successful recalls.
  public func cue(for verse: Verse, in unit: PracticeUnit) -> Cue {
    if let cue = chapters[unit.id]?.cues[String(verse.number)] { return cue }
    return (cards[verse.id]?.repetitions ?? 0) >= 2 ? .none : .initials
  }
  public func cues(for unit: PracticeUnit) -> [Cue] {
    unit.isChapter ? unit.verses.map { cue(for: $0, in: unit) } : []
  }
  /// Hints allow Again or Hard. A chapter recited with any cue cannot be graded Easy.
  public func allowedRatings(for unit: PracticeUnit, usedHint: Bool, peeked: Set<Int> = [])
    -> [RecallRating]
  {
    if usedHint { return [.again, .hard] }
    if unit.isChapter && (!peeked.isEmpty || cues(for: unit).contains { $0 != .none }) {
      return [.again, .hard, .good]
    }
    return RecallRating.allCases
  }
  public func isLearned(_ unit: PracticeUnit) -> Bool {
    unit.isChapter ? chapters[unit.id]?.learned != nil : (cards[unit.id]?.repetitions ?? 0) >= 2
  }
  mutating func advanceCues(
    _ unit: PracticeUnit, from cues: [Cue], rating: RecallRating, weak: Set<Int>, now: Date
  ) {
    var progress = chapters[unit.id] ?? ChapterProgress()
    for (verse, cue) in zip(unit.verses, cues) {
      let next =
        weak.contains(verse.number) ? cue.more : rating == .again ? cue : cue.fewer
      progress.cues[String(verse.number)] = next
    }
    progress.weakVerses = weak.sorted()
    if progress.learned == nil, rating.rawValue >= RecallRating.good.rawValue, weak.isEmpty,
      cues.allSatisfy({ $0 == .none })
    {
      progress.learned = now
    }
    chapters[unit.id] = progress
  }
}
