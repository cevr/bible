import SelahCore
import SwiftUI

struct ScripturePassage: View {
  let verses: [Verse]
  let corpus: Corpus
  let reader: ReaderPreferences
  var numbered = true
  var showMargins = false
  var body: some View {
    LazyVStack(alignment: .leading, spacing: 0) {
      ForEach(Array(verses.enumerated()), id: \.element.id) { index, verse in
        let scripture = corpus.rendering(for: verse)
        ScriptureText(
          verse: verse, scripture: scripture, reader: reader, numbered: numbered,
          showMargins: showMargins
        )
        .padding(
          .top,
          index == 0 ? 0 : reader.verseSpacing + (scripture.paragraph ? reader.paragraphSpacing : 0)
        )
      }
    }
  }
}

struct ReaderSettings: View {
  @Bindable var store: Store
  @Environment(\.dismiss) private var dismiss
  @State private var draft: ReaderPreferences
  init(store: Store) {
    self.store = store
    _draft = State(initialValue: store.library.preferences.reader)
  }
  private func adjustment(
    _ title: String, value: Binding<Double>, range: ClosedRange<Double>, step: Double,
    suffix: String
  ) -> some View {
    VStack(alignment: .leading, spacing: Space.xxs) {
      HStack {
        Text(title)
        Spacer()
        Text("\(value.wrappedValue, specifier: step < 1 ? "%.2f" : "%.0f")\(suffix)")
          .monospacedDigit().foregroundStyle(.secondary)
      }
      Slider(value: value, in: range, step: step).accessibilityLabel(title)
    }
  }
  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        ScripturePassage(
          verses: Array(store.corpus.verses(book: 19, chapter: 23).prefix(3)), corpus: store.corpus,
          reader: draft
        )
        .padding(Space.l).frame(maxWidth: 600)
      }
      .frame(height: 200).frame(maxWidth: .infinity).background(Palette.page)
      .accessibilityLabel("Preview")
      Divider()
      Form {
        Section("Typography") {
          Picker("Font", selection: $draft.font) {
            ForEach(ReaderFont.allCases, id: \.self) { Text($0.rawValue).tag($0) }
          }
          adjustment("Text size", value: $draft.size, range: 16...36, step: 1, suffix: " pt")
          adjustment(
            "Line height", value: $draft.lineHeight, range: 1.2...2.2, step: 0.05, suffix: "×")
          adjustment(
            "Character spacing", value: $draft.characterSpacing, range: -0.3...2, step: 0.1,
            suffix: " pt")
        }
        Section("Spacing & detail") {
          adjustment(
            "Paragraph spacing", value: $draft.paragraphSpacing, range: 0...40, step: 1,
            suffix: " pt")
          adjustment(
            "Verse spacing", value: $draft.verseSpacing, range: 0...24, step: 1, suffix: " pt")
          Text("Paragraph spacing is added at the Bible’s ¶ paragraph marks.").font(.caption)
            .foregroundStyle(.secondary)
          Toggle("Verse numbers", isOn: $draft.showVerseNumbers)
          Toggle("Red letters", isOn: $draft.redLetters)
          Button("Restore Defaults") { draft = ReaderPreferences() }
        }
      }
      .formStyle(.grouped)
    }
    .frame(width: 580, height: 600)
    .navigationTitle("Reader Settings")
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Apply") {
          let settings = draft
          Task { if await store.change({ $0.preferences.reader = settings }) { dismiss() } }
        }
        .disabled(store.isSaving)
      }
    }
  }
}
