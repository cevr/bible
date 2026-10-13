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
        ? Color(red: 0.96, green: 0.57, blue: 0.48) : .primary
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
  private func words(_ words: [RecallWord], missing: Bool) -> AttributedString {
    var result = AttributedString()
    for word in words {
      var text = AttributedString(word.text + " ")
      if !word.matched {
        text.foregroundColor = missing ? .orange : .red
        text.underlineStyle = .single
      }
      result += text
    }
    return result
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label(
        "\(comparison.matchedCount) matched · \(comparison.missingCount) missing · \(comparison.extraCount) extra",
        systemImage: comparison.missingCount == 0 && comparison.extraCount == 0
          ? "checkmark.circle" : "text.badge.checkmark"
      ).font(.callout)
      if comparison.missingCount > 0 {
        Text("Reference · missing words underlined").font(.caption).foregroundStyle(.secondary)
        Text(words(comparison.expected, missing: true)).lineSpacing(5).textSelection(.enabled)
      }
      Text("Your recall · extra or changed words underlined").font(.caption).foregroundStyle(
        .secondary)
      Text(words(comparison.recalled, missing: false)).lineSpacing(5).textSelection(.enabled)
      Text("Case and punctuation are ignored. Choose your grade after comparing.").font(.caption)
        .foregroundStyle(.secondary)
    }.padding(16).background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
  }
}
