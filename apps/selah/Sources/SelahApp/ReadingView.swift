import SelahCore
import SwiftUI

struct ReadingView: View {
  @Bindable var store: Store
  let chapters: [[Verse]]
  let title: String
  let close: () -> Void
  let onPractice: () -> Void
  @State private var chapterIndex = 0
  @State private var hidden = false
  @State private var readerSettings = false
  @State private var confirmingRehearsal = false
  /// A whole book in Passages is worth rehearsing end to end; a single chapter is not.
  private func bookIsAGoal(_ book: Int) -> Bool {
    store.library.goals.contains { $0.book == book && $0.chapter == nil && $0.promises == nil }
  }
  private var visible: [Verse] { chapters.isEmpty ? [] : chapters[chapterIndex] }
  private var reader: ReaderPreferences { store.library.preferences.reader }
  private var reference: String {
    visible.first.map { "\($0.bookName) \($0.chapter)" } ?? title
  }
  private var isWholeChapter: Bool {
    guard let first = visible.first else { return false }
    return visible.count == store.corpus.verses(book: first.book, chapter: first.chapter).count
  }
  var body: some View {
    Column {
      Text(reference).font(.reference(reader))
      if hidden {
        Text("Recite from memory, then show the text to check.")
          .font(.title3).foregroundStyle(.secondary).padding(.top, Space.l)
      } else {
        ScripturePassage(
          verses: visible, corpus: store.corpus, reader: reader,
          showMargins: store.library.preferences.showMarginNotes)
      }
    }
    .background(Palette.page)
    .navigationTitle(reference)
    .navigationSubtitle(title == reference ? "" : title)
    .toolbar {
      if chapters.count > 1 {
        ToolbarItemGroup(placement: .navigation) {
          Button("Previous Chapter", systemImage: "chevron.left") { move(by: -1) }
            .disabled(chapterIndex == 0).keyboardShortcut(.leftArrow, modifiers: [.command])
          Button("Next Chapter", systemImage: "chevron.right") { move(by: 1) }
            .disabled(chapterIndex >= chapters.count - 1)
            .keyboardShortcut(.rightArrow, modifiers: [.command])
        }
      }
      ToolbarItemGroup(placement: .primaryAction) {
        Button(hidden ? "Show Text" : "Hide Text", systemImage: hidden ? "eye" : "eye.slash") {
          hidden.toggle()
        }
        .help(hidden ? "Show the text again" : "Hide the text and recite from memory")
        Button("Reader Settings", systemImage: "textformat.size") { readerSettings = true }
          .help("Reader settings")
      }
      if isWholeChapter, let first = visible.first {
        ToolbarSpacer(.fixed, placement: .primaryAction)
        if bookIsAGoal(first.book) {
          ToolbarItem(placement: .primaryAction) {
            Button("Rehearse \(first.bookName)…") { confirmingRehearsal = true }
              .help("Recall every chapter of \(first.bookName) in order")
              .confirmationDialog(
                "Rehearse all \(store.corpus.chapterCount(book: first.book)) chapters of \(first.bookName)?",
                isPresented: $confirmingRehearsal, titleVisibility: .visible
              ) {
                Button("Rehearse \(first.bookName)") {
                  store.beginBook(first.book)
                  close()
                  onPractice()
                }
              } message: {
                Text(
                  "Each chapter is recalled and graded in order. Ending early schedules only the chapters you graded."
                )
              }
          }
        }
        ToolbarItem(placement: .primaryAction) {
          Button("Practice Now") {
            store.beginChapter(visible)
            close()
            onPractice()
          }
          .buttonStyle(.glassProminent)
          .help("Practice \(reference) as one whole-chapter recall now")
        }
      }
    }
    .frame(minWidth: 480, idealWidth: 680, minHeight: 560)
    .preferredColorScheme(store.library.preferences.appearance.colorScheme)
    .sheet(isPresented: $readerSettings) { ReaderSettings(store: store) }
  }
  private func move(by offset: Int) {
    chapterIndex += offset
    hidden = false
  }
}
