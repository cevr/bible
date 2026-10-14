import Foundation

public struct RecallWord: Sendable, Identifiable {
  public let id: Int
  public let text: String
  public let matched: Bool
  /// The expected segment (verse) a reference word belongs to; recalled words use 0.
  public var segment = 0
}

public struct RecallComparison: Sendable {
  public let expected: [RecallWord]
  public let recalled: [RecallWord]
  public var missingCount: Int { expected.filter { !$0.matched }.count }
  public var extraCount: Int { recalled.filter { !$0.matched }.count }
  public var matchedCount: Int { expected.count - missingCount }
  /// A segment slipped when at least one word in ten (and at least one word) is missing or changed.
  public var slippedSegments: Set<Int> {
    Set(
      Dictionary(grouping: expected, by: \.segment).compactMap { segment, words in
        let missing = words.filter { !$0.matched }.count
        return missing >= max(1, Int((Double(words.count) * 0.1).rounded(.up))) ? segment : nil
      })
  }
  public enum Failure: Error, LocalizedError {
    case tooLong
    public var errorDescription: String? { "Compare one chapter at a time (up to 6,000 words)." }
  }
  /// Sequence alignment preserves later matches after an omitted word. Case and punctuation do
  /// not count, and neither do spelling slips a listener would not hear (see `sameWord`).
  public init(expected: String, recalled: String) throws {
    try self.init(segments: [expected], recalled: recalled)
  }
  /// Compare a recall against several segments, such as a chapter's verses, in one alignment.
  public init(segments: [String], recalled: String) throws {
    func words(_ text: String) -> [(String, String)] {
      text.split(whereSeparator: \.isWhitespace).compactMap { part in
        let normalized = String(part.lowercased().filter { $0.isLetter || $0.isNumber })
        return normalized.isEmpty ? nil : (String(part), normalized)
      }
    }
    let sourceSegments = segments.enumerated().flatMap { index, text in
      words(text).map { (index, $0) }
    }
    let source = sourceSegments.map(\.1)
    // Modern spellings the KJV prints as two words count as those two words.
    let answer = words(recalled).flatMap { word in
      Self.compounds[word.1].map { $0.map { (String($0), String($0)) } } ?? [word]
    }
    guard source.count <= 6000, answer.count <= 6000 else { throw Failure.tooLong }
    let diff = answer.map { $0.1 }.difference(from: source.map { $0.1 }, by: Self.sameWord)
    var missing = Set<Int>()
    var extra = Set<Int>()
    for change in diff {
      switch change {
      case .remove(let offset, _, _): missing.insert(offset)
      case .insert(let offset, _, _): extra.insert(offset)
      }
    }
    self.expected = sourceSegments.enumerated().map {
      RecallWord(
        id: $0.offset, text: $0.element.1.0, matched: !missing.contains($0.offset),
        segment: $0.element.0)
    }
    self.recalled = answer.enumerated().map {
      RecallWord(id: $0.offset, text: $0.element.0, matched: !extra.contains($0.offset))
    }
  }

  static let compounds: [String: [Substring]] = [
    "forever": ["for", "ever"], "namesake": ["names", "sake"], "evermore": ["ever", "more"],
  ]

  /// Two normalized words are the same when they are equal, when "O" is written "Oh", or when a
  /// word of five letters or more differs by one letter (one added, dropped, changed, or two
  /// swapped). That forgives a typo or a speech model's spelling of "leadeth", never a
  /// different short word such as "thy" for "the".
  static func sameWord(_ expected: String, _ recalled: String) -> Bool {
    if expected == recalled { return true }
    if expected == "o" && recalled == "oh" { return true }
    let a = Array(expected)
    let b = Array(recalled)
    guard min(a.count, b.count) >= 5, abs(a.count - b.count) <= 1 else { return false }
    var i = 0
    while i < min(a.count, b.count) && a[i] == b[i] { i += 1 }
    if a.count == b.count {
      if a[(i + 1)...] == b[(i + 1)...] { return true }
      return i + 1 < a.count && a[i] == b[i + 1] && a[i + 1] == b[i]
        && a[(i + 2)...] == b[(i + 2)...]
    }
    return a.count > b.count ? a[(i + 1)...] == b[i...] : a[i...] == b[(i + 1)...]
  }
}

extension RecallComparison {
  /// How many words the comparison counts in a text: whitespace-separated runs with a letter or
  /// digit. Rendered Scripture marks missing words by the same count.
  public static func wordCount(_ text: some StringProtocol) -> Int {
    text.split(whereSeparator: \.isWhitespace).filter {
      $0.contains { $0.isLetter || $0.isNumber }
    }.count
  }
  /// Positions, within one verse, of the words this recall missed.
  public func missing(in segment: Int) -> Set<Int> {
    Set(
      expected.filter { $0.segment == segment }.enumerated().filter { !$0.element.matched }
        .map(\.offset))
  }
}
