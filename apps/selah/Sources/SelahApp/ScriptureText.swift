import AppKit
import SelahCore
import SwiftUI

struct ScriptureText: View {
  let verse: Verse
  let scripture: Scripture
  var reader = ReaderPreferences()
  var numbered = true
  var showMargins = false
  /// Positions of words a recall missed, counted as `RecallComparison` counts a verse's words.
  /// They keep the verse's italics and red letters and gain the missing-word mark.
  var missing: Set<Int> = []
  @State private var note: MarginNote?
  private var content: AttributedString {
    var result = AttributedString()
    for segment in scripture.segments {
      if segment.noteIndex != nil && (!showMargins || !missing.isEmpty) { continue }
      var text = AttributedString(segment.text)
      let size = segment.noteIndex == nil ? reader.size : reader.size * 0.57
      let font: Font =
        reader.font == .system ? .system(size: size) : .custom(reader.font.rawValue, size: size)
      text.font = segment.italic ? font.italic() : font
      text.foregroundColor =
        segment.redLetter && reader.redLetters
        ? Palette.redLetter : .primary
      if let index = segment.noteIndex {
        text.link = URL(string: "selah-note://\(index)")
        text.baselineOffset = 8
        text.foregroundColor = .secondary
      }
      result += text
    }
    if !missing.isEmpty { RecallFeedback.mark(missing, in: &result, color: Palette.slipped) }
    return result
  }
  private var leading: Double {
    let font =
      reader.font == .system
      ? NSFont.systemFont(ofSize: reader.size)
      : NSFont(name: reader.font.rawValue, size: reader.size)
        ?? NSFont.systemFont(ofSize: reader.size)
    return max(0, reader.size * reader.lineHeight - NSLayoutManager().defaultLineHeight(for: font))
  }
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Space.s) {
      if numbered && reader.showVerseNumbers { VerseNumber(number: verse.number) }
      VStack(alignment: .leading, spacing: 8) {
        Text(content).tracking(reader.characterSpacing).lineSpacing(leading).textSelection(.enabled)
          .fixedSize(
            horizontal: false, vertical: true)
        if showMargins && !scripture.notes.isEmpty {
          DisclosureGroup("Margin notes") {
            VStack(alignment: .leading, spacing: 8) {
              ForEach(scripture.notes) { item in
                Button("\(item.label)  \(item.phrase)") { note = item }
                  .font(.caption).buttonStyle(.link).help("Margin note: \(item.phrase)")
              }
            }
          }.font(.caption).foregroundStyle(.secondary)
        }
      }.frame(maxWidth: .infinity, alignment: .leading)
    }
    .environment(
      \.openURL,
      OpenURLAction { url in
        guard url.scheme == "selah-note", let index = Int(url.host ?? ""),
          let item = scripture.notes.first(where: { $0.index == index })
        else { return .discarded }
        note = item
        return .handled
      }
    )
    .popover(item: $note) { item in
      VStack(alignment: .leading, spacing: 8) {
        Text("\(verse.reference) · \(item.label)").font(.caption).foregroundStyle(.secondary)
        Text(item.phrase).font(.headline)
        Text(item.text).font(.custom("Georgia", size: 16, relativeTo: .body)).textSelection(
          .enabled)
      }.padding(20).frame(width: 280, alignment: .leading)
    }
  }
}

struct RecallFeedback: View {
  let comparison: RecallComparison
  /// Marks the missing words of rendered Scripture in place. Words are whitespace-separated runs
  /// with a letter or digit, the same count the comparison makes of a verse's practice text.
  static func mark(_ missing: Set<Int>, in text: inout AttributedString, color: Color) {
    let characters = text.characters
    var words: [Range<AttributedString.Index>] = []
    var start: AttributedString.Index?
    var hasLetter = false
    var index = characters.startIndex
    while index < characters.endIndex {
      let character = characters[index]
      if character.isWhitespace {
        if let start, hasLetter { words.append(start..<index) }
        start = nil
        hasLetter = false
      } else {
        if start == nil { start = index }
        if character.isLetter || character.isNumber { hasLetter = true }
      }
      index = characters.index(after: index)
    }
    if let start, hasLetter { words.append(start..<characters.endIndex) }
    for (position, range) in words.enumerated() where missing.contains(position) {
      // A run of missing words is marked as one, so the space between them is marked too.
      let lower =
        position > 0 && missing.contains(position - 1)
        ? words[position - 1].upperBound
        : range.lowerBound
      text[lower..<range.upperBound].foregroundColor = color
      text[lower..<range.upperBound].backgroundColor = color.opacity(0.14)
    }
  }
  static func marked(_ words: [RecallWord], color: Color) -> AttributedString {
    var result = AttributedString()
    for (index, word) in words.enumerated() {
      if index > 0 {
        // The space joins a run of missing words, so the underline never trails into a matched one.
        var space = AttributedString(" ")
        if !word.matched && !words[index - 1].matched {
          space.foregroundColor = color
          space.backgroundColor = color.opacity(0.14)
        }
        result += space
      }
      var text = AttributedString(word.text)
      if !word.matched {
        text.foregroundColor = color
        text.backgroundColor = color.opacity(0.14)
      }
      result += text
    }
    return result
  }
  /// The count summary and, when present, the recalled words that are not in the text.
  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      Text(
        "\(comparison.matchedCount) of \(comparison.expected.count) words"
          + (comparison.extraCount > 0 ? " · \(comparison.extraCount) extra" : "")
      )
      .font(.callout).foregroundStyle(.secondary).monospacedDigit()
      if comparison.extraCount > 0 {
        DisclosureGroup("Your recall, with extra or changed words marked") {
          Text(Self.marked(comparison.recalled, color: Palette.extra)).lineSpacing(Space.xxs)
            .textSelection(.enabled).padding(.top, Space.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.callout)
      }
    }
  }
}
