import Foundation

public struct MarginNote: Codable, Hashable, Sendable, Identifiable {
  public let index: Int
  public let type: String
  public let phrase: String
  public let text: String
  public var id: Int { index }
  public var label: String {
    var value = index + 1
    var result = ""
    while value > 0 {
      value -= 1
      result = String(UnicodeScalar(97 + value % 26)!) + result
      value /= 26
    }
    return result
  }
  public init(index: Int, type: String, phrase: String, text: String) {
    self.index = index
    self.type = type
    self.phrase = phrase
    self.text = text
  }
}

public struct ScriptureSegment: Hashable, Sendable {
  public var text: String
  public let italic: Bool
  public let redLetter: Bool
  public let noteIndex: Int?
}

/// The Bible Tools reader's ordered interpretation: supplied words, red letters, margin anchors.
/// Notes anchor after the first matching phrase in visible text, even across italic boundaries.
public struct Scripture: Sendable {
  public let segments: [ScriptureSegment]
  public let notes: [MarginNote]
  public let paragraph: Bool
  public init(verse: Verse) {
    notes = verse.marginNotes ?? []
    paragraph = verse.text.contains("¶")
    var letters: [(Character, Bool, Bool)] = []
    var italic = false
    var red = false
    for char in verse.text.trimmingCharacters(in: .whitespacesAndNewlines) {
      switch char {
      case "¶": continue
      case "[": italic = true
      case "]": italic = false
      case "‹":
        red = true
        letters.append(("“", italic, red))
      case "›":
        letters.append(("”", italic, red))
        red = false
      default: letters.append((char, italic, red))
      }
    }
    while letters.first?.0.isWhitespace == true { letters.removeFirst() }
    var anchors: [Int: [MarginNote]] = [:]
    if !notes.isEmpty {
      let visible = String(letters.map { $0.0 })
      for note in notes where !note.phrase.isEmpty {
        if let range = visible.range(of: note.phrase, options: [.caseInsensitive]) {
          anchors[visible.distance(from: visible.startIndex, to: range.upperBound), default: []]
            .append(note)
        }
      }
    }
    // Letters gather into the open run until its style changes or a note anchors after one;
    // the corpus renders every verse at launch, so a letter is appended, never re-copied.
    var result: [ScriptureSegment] = []
    var run = ScriptureSegment(text: "", italic: false, redLetter: false, noteIndex: nil)
    for (offset, letter) in letters.enumerated() {
      if run.text.isEmpty || run.italic != letter.1 || run.redLetter != letter.2 {
        if !run.text.isEmpty { result.append(run) }
        run = ScriptureSegment(text: "", italic: letter.1, redLetter: letter.2, noteIndex: nil)
      }
      run.text.append(letter.0)
      guard !anchors.isEmpty, let anchored = anchors[offset + 1] else { continue }
      result.append(run)
      run.text = ""
      for note in anchored.sorted(by: { $0.index < $1.index }) {
        result.append(
          ScriptureSegment(text: note.label, italic: false, redLetter: false, noteIndex: note.index)
        )
      }
    }
    if !run.text.isEmpty { result.append(run) }
    segments = result
  }
}
