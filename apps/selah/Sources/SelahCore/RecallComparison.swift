import Foundation

public struct RecallWord: Sendable, Identifiable {
  public let id: Int
  public let text: String
  public let matched: Bool
}

public struct RecallComparison: Sendable {
  public let expected: [RecallWord]
  public let recalled: [RecallWord]
  public var missingCount: Int { expected.filter { !$0.matched }.count }
  public var extraCount: Int { recalled.filter { !$0.matched }.count }
  public var matchedCount: Int { expected.count - missingCount }
  public enum Failure: Error, LocalizedError {
    case tooLong
    public var errorDescription: String? { "Compare one chapter at a time (up to 6,000 words)." }
  }
  /// Sequence alignment preserves later matches after an omitted word. Case and punctuation do not count.
  public init(expected: String, recalled: String) throws {
    func words(_ text: String) -> [(String, String)] {
      text.split(whereSeparator: \.isWhitespace).compactMap { part in
        let normalized = String(part.lowercased().filter { $0.isLetter || $0.isNumber })
        return normalized.isEmpty ? nil : (String(part), normalized)
      }
    }
    let source = words(expected)
    let answer = words(recalled)
    guard source.count <= 6000, answer.count <= 6000 else { throw Failure.tooLong }
    let diff = answer.map { $0.1 }.difference(from: source.map { $0.1 })
    var missing = Set<Int>()
    var extra = Set<Int>()
    for change in diff {
      switch change {
      case .remove(let offset, _, _): missing.insert(offset)
      case .insert(let offset, _, _): extra.insert(offset)
      }
    }
    self.expected = source.enumerated().map {
      RecallWord(id: $0.offset, text: $0.element.0, matched: !missing.contains($0.offset))
    }
    self.recalled = answer.enumerated().map {
      RecallWord(id: $0.offset, text: $0.element.0, matched: !extra.contains($0.offset))
    }
  }
}
