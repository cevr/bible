import AppKit
import SelahCore
import SwiftUI

struct ScriptureText: View {
  let verse: Verse
  let scripture: Scripture
  var reader = ReaderPreferences()
  var numbered = true
  var showMargins = false
  @State private var note: MarginNote?
  private var content: AttributedString {
    var result = AttributedString()
    for segment in scripture.segments {
      if segment.noteIndex != nil && !showMargins { continue }
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
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      if numbered && reader.showVerseNumbers {
        Text("\(verse.number)").font(.system(size: 11, weight: .medium)).monospacedDigit()
          .foregroundStyle(.secondary).frame(width: 22, alignment: .trailing).baselineOffset(6)
          .accessibilityLabel("Verse \(verse.number)")
      }
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
  static func marked(_ words: [RecallWord], color: Color) -> AttributedString {
    var result = AttributedString()
    for (index, word) in words.enumerated() {
      if index > 0 {
        // The space joins a run of missing words, so the underline never trails into a matched one.
        var space = AttributedString(" ")
        if !word.matched && !words[index - 1].matched {
          space.foregroundColor = color
          space.underlineStyle = .single
        }
        result += space
      }
      var text = AttributedString(word.text)
      if !word.matched {
        text.foregroundColor = color
        text.underlineStyle = .single
      }
      result += text
    }
    return result
  }
  /// The count summary and, when present, the recalled words that are not in the text.
  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      Text(
        "\(comparison.matchedCount) of \(comparison.expected.count) words · \(comparison.missingCount) missing · \(comparison.extraCount) extra"
      )
      .font(.callout).foregroundStyle(.secondary).monospacedDigit()
      if comparison.extraCount > 0 {
        DisclosureGroup("Your recall, with extra or changed words underlined") {
          Text(Self.marked(comparison.recalled, color: Palette.extra)).lineSpacing(Space.xxs)
            .textSelection(.enabled).padding(.top, Space.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.callout)
      }
    }
  }
}
