import SelahCore
import SwiftUI

struct PassagesView: View {
  enum Scope: String, CaseIterable {
    case verses = "Verses"
    case chapter = "Chapter"
    case book = "Book"
    case bible = "Whole Bible"
  }
  @Bindable var store: Store
  @State private var book = 19
  @State private var chapter = 23
  @State private var scope = Scope.chapter
  @State private var method = LearningMethod.wholeChapter
  @State private var first = 1
  @State private var last = 1
  @State private var message: String?
  private var books: [Verse] { store.corpus.books }
  private var chapters: Int { store.corpus.chapterCount(book: book) }
  private var verseCount: Int {
    store.corpus.verses(book: book, chapter: chapter).last?.number ?? 1
  }
  private var goal: Goal {
    let name = books.first { $0.book == book }?.bookName ?? "Psalms"
    switch scope {
    case .bible: return Goal(title: "The Whole Bible", method: method)
    case .book: return Goal(title: name, book: book, method: method)
    case .verses:
      return Goal(
        title: "\(name) \(chapter):\(first)" + (last > first ? "–\(last)" : ""), book: book,
        chapter: chapter, firstVerse: first, lastVerse: max(first, last))
    case .chapter:
      return Goal(title: "\(name) \(chapter)", book: book, chapter: chapter, method: method)
    }
  }
  private var passages: [Goal] { store.library.goals.filter { $0.promises == nil } }
  private var alreadyAdded: Bool { passages.contains { $0.title == goal.title } }
  var body: some View {
    Form {
      Section {
        Picker("Add", selection: $scope) {
          ForEach(Scope.allCases, id: \.self) { Text($0.rawValue) }
        }
        .pickerStyle(.segmented)
        if scope != .bible {
          Picker("Book", selection: $book) { ForEach(books) { Text($0.bookName).tag($0.book) } }
        }
        if scope == .chapter || scope == .verses {
          Picker("Chapter", selection: $chapter) {
            ForEach(1...chapters, id: \.self) { Text("\($0)").tag($0) }
          }
        }
        if scope == .verses {
          Picker("From verse", selection: $first) {
            ForEach(1...verseCount, id: \.self) { Text("\($0)").tag($0) }
          }
          Picker("Through verse", selection: $last) {
            ForEach(first...max(first, verseCount), id: \.self) { Text("\($0)").tag($0) }
          }
        } else {
          Picker("Learn", selection: $method) {
            ForEach(LearningMethod.allCases, id: \.self) { Text($0.title) }
          }
          .pickerStyle(.radioGroup)
          Text(methodDetail).font(.callout).foregroundStyle(.secondary)
        }
        HStack {
          if alreadyAdded {
            Text("Already in your passages").font(.callout).foregroundStyle(.secondary)
          } else if let message {
            Text(message).font(.callout).foregroundStyle(.secondary)
          }
          Spacer()
          Button("Add \(goal.title)") { add() }.buttonStyle(.borderedProminent)
            .disabled(!store.canSave || alreadyAdded)
        }
      } header: {
        Text("Add a passage")
      }
      Section("Your passages") {
        if passages.isEmpty {
          Text("Nothing added yet.").foregroundStyle(.secondary)
        }
        ForEach(passages) { goal in PassageRow(store: store, goal: goal) }
      }
    }
    .formStyle(.grouped)
    .scrollContentBackground(.hidden)
    .navigationTitle("Passages")
    .onChange(of: book) {
      chapter = 1
      first = 1
      last = 1
    }
    .onChange(of: chapter) {
      first = 1
      last = 1
    }
    .onChange(of: first) { last = max(first, last) }
    .onChange(of: scope) { message = nil }
    .onAppear { if alreadyAdded { advance() } }
  }
  private var methodDetail: String {
    switch method {
    case .wholeChapter:
      "Read the chapter, then recite it whole with first-letter cues that fade as verses hold. Verses that slip get their cues back. The next chapter starts when this one stands without cues."
    case .verseByVerse:
      "A few new verses each day. The chapter joins review once every verse is learned."
    }
  }
  /// Moves the chapter pickers past passages already added, so the form offers something new.
  private func advance() {
    guard scope == .chapter else { return }
    let added = Set(passages.compactMap { goal in goal.chapter.map { "\(goal.book ?? 0):\($0)" } })
    let order = Array(chapter...chapters) + Array(1..<chapter)
    if let next = order.first(where: { !added.contains("\(book):\($0)") }) {
      chapter = next
    }
  }
  private func add() {
    let chosen = goal
    guard !alreadyAdded else { return }
    Task {
      message = await store.add(chosen) ? "Added. Practice is ready in Today." : nil
      advance()
    }
  }
}

struct PassageRow: View {
  @Bindable var store: Store
  let goal: Goal
  @Environment(\.openWindow) private var openWindow
  @State private var confirmingRemoval = false
  var body: some View {
    let progress = store.readiness?.progress[goal.id]
    HStack(alignment: .center, spacing: Space.s) {
      VStack(alignment: .leading, spacing: Space.xxs) {
        Text(goal.title).font(.body.weight(.medium))
        if let progress {
          Text(Meter(progress).label).font(.callout).foregroundStyle(.secondary).monospacedDigit()
        }
      }
      Spacer()
      if goal.supportsWholeChapters {
        Picker(
          "Learn",
          selection: Binding(
            get: { goal.learning },
            set: { method in Task { await store.setMethod(method, for: goal) } })
        ) {
          ForEach(LearningMethod.allCases, id: \.self) { Text($0.title) }
        }
        .labelsHidden().fixedSize()
        .accessibilityLabel("Learn \(goal.title)")
      }
      Button("Read") {
        store.reader.present(store: store, goal: goal) { openWindow(id: "practice") }
      }
      Menu("More", systemImage: "ellipsis") {
        Button("Remove from Practice…", role: .destructive) { confirmingRemoval = true }
      }
      .menuStyle(.button).buttonStyle(.borderless).labelStyle(.iconOnly).menuIndicator(.hidden)
      .fixedSize()
      .accessibilityLabel("More for \(goal.title)")
    }
    .contextMenu {
      Button("Remove from Practice…", role: .destructive) { confirmingRemoval = true }
    }
    .removalConfirmation(goal: goal, isPresented: $confirmingRemoval, store: store)
  }
}

extension View {
  /// Asks before a goal leaves practice, and says that its progress is kept.
  func removalConfirmation(goal: Goal, isPresented: Binding<Bool>, store: Store) -> some View {
    confirmationDialog(
      "Remove \(goal.title) from practice?", isPresented: isPresented, titleVisibility: .visible
    ) {
      Button("Remove", role: .destructive) { Task { await store.remove(goal) } }
    } message: {
      Text("It leaves your daily practice. Its progress is kept if you add it again.")
    }
  }
}
