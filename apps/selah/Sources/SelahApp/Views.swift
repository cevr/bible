import AppKit
import SelahCore
import SwiftUI

private let muted = Color(white: 0.66)
private let surface = Color(white: 0.075)

struct QuietButton: PrimitiveButtonStyle {
  var primary = false
  func makeBody(configuration: Configuration) -> some View {
    Group {
      if primary {
        Button(configuration).buttonStyle(.borderedProminent).tint(.white).foregroundStyle(.black)
      } else {
        Button(configuration).buttonStyle(.bordered)
      }
    }.controlSize(.large).frame(maxWidth: .infinity)
  }
}

struct RootView: View {
  @Bindable var store: Store
  let delegate: AppDelegate
  let compact: Bool
  @Environment(\.openWindow) private var openWindow
  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 14) {
        Label("Selah", systemImage: "book.closed").font(.headline)
        Spacer()
        if compact {
          Button {
            openWindow(id: "practice")
            NSApp.activate(ignoringOtherApps: true)
          } label: {
            Image(systemName: "arrow.up.left.and.arrow.down.right")
          }.buttonStyle(.borderless).help("Open practice window").accessibilityLabel(
            "Open practice window")
        }
      }.padding(.horizontal, 24).padding(.top, compact ? 20 : 12).padding(.bottom, 16)
      Picker("Section", selection: $store.section) {
        Text("Today").tag("Today")
        Text("Library").tag("Library")
        Text("Settings").tag("Settings")
      }.pickerStyle(.segmented).labelsHidden().padding(.horizontal, 24).padding(.bottom, 16)
      Divider()
      if let error = store.error {
        Label(error, systemImage: "exclamationmark.triangle").font(.callout).padding(16)
      }
      Group {
        if store.isLoading {
          ProgressView("Opening your Bible…").frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.section == "Settings" {
          SettingsView(store: store)
        } else {
          ScrollView {
            Group {
              if store.section == "Library" {
                LibraryView(store: store)
              } else if store.sessionActive {
                PracticeView(store: store)
              } else {
                TodayView(store: store, showLibrary: { store.section = "Library" })
              }
            }.frame(maxWidth: 640, alignment: .leading).padding(24).frame(maxWidth: .infinity)
          }
        }
      }.disabled(store.isSaving || !store.canSave)
      Divider()
      HStack {
        Text("KJV · On this Mac").foregroundStyle(.secondary)
        Spacer()
        if store.isSaving {
          ProgressView().controlSize(.mini)
          Text("Saving…")
        }
        Button("Quit") { NSApp.terminate(nil) }.buttonStyle(.borderless).foregroundStyle(.secondary)
      }.font(.caption).padding(.horizontal, 24).padding(.vertical, 12)
    }
    .background(Color(nsColor: .windowBackgroundColor)).preferredColorScheme(.dark)
    .onAppear {
      delegate.openPractice = {
        store.section = "Today"
        store.begin()
        openWindow(id: "practice")
        NSApp.activate(ignoringOtherApps: true)
      }
    }
    .onReceive(
      NSWorkspace.shared.notificationCenter.publisher(for: NSWorkspace.didWakeNotification)
    ) { _ in
      Task { await store.refreshReminders() }
    }
  }
}

struct TodayView: View {
  @Bindable var store: Store
  var showLibrary: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text(Date(), format: .dateTime.weekday(.wide).month(.wide).day()).font(.system(size: 12))
        .foregroundStyle(muted)
      Text("A little each day.\nA lifetime within.")
        .font(.system(size: 30, weight: .medium, design: .rounded)).tracking(-0.5).fixedSize(
          horizontal: false, vertical: true)
      Text("Read with care. Recall from memory.\nReturn before the words fade.")
        .font(.system(size: 14)).foregroundStyle(muted).lineSpacing(5)
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text("\(store.available.count)").font(.system(size: 48, weight: .light, design: .rounded))
          .monospacedDigit()
        Text("reviews ready").font(.system(size: 13)).foregroundStyle(muted)
        Spacer()
      }.padding(.top, 6)
      if store.library.goals.isEmpty {
        Button("Choose Your First Passage", action: showLibrary).buttonStyle(
          QuietButton(primary: true))
      } else if !store.available.isEmpty {
        Button("Begin Practice") { store.begin() }.buttonStyle(QuietButton(primary: true))
          .keyboardShortcut(.return, modifiers: [])
      } else {
        Label("You’re caught up for now", systemImage: "checkmark.circle").font(.system(size: 14))
        Text(
          "Selah will bring verses back when they’re due. You can still read your passages in Library."
        )
        .font(.system(size: 13)).foregroundStyle(muted)
      }
      HStack {
        Label("\(store.reviewedToday) reviewed today", systemImage: "checkmark")
        Spacer()
        Text("\(store.dueCount) due")
      }.font(.system(size: 11)).foregroundStyle(muted)
      if let goal = store.library.goals.first {
        VStack(alignment: .leading, spacing: 10) {
          Text("YOUR PATH").font(.system(size: 9, weight: .medium)).tracking(1.6).foregroundStyle(
            muted)
          Text(goal.title).font(.system(size: 17, weight: .medium))
          let count = store.readiness?.countByGoal[goal.id] ?? 0
          let learned = store.readiness?.learnedByGoal[goal.id] ?? 0
          ProgressView(value: Double(learned), total: Double(max(1, count))).tint(.white)
          Text("\(learned) of \(count) verses recalled at least twice")
            .font(.system(size: 11)).foregroundStyle(muted)
        }.padding(18).background(surface, in: RoundedRectangle(cornerRadius: 12))
      }
    }
  }
}

struct PracticeView: View {
  @Bindable var store: Store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      HStack {
        Text("\(store.completed) / \(store.sessionTotal)").monospacedDigit()
        Spacer()
        Button("End Session") { store.sessionActive = false }.buttonStyle(.plain)
      }.font(.system(size: 12)).foregroundStyle(muted)
      ProgressView(value: Double(store.completed), total: Double(max(1, store.sessionTotal))).tint(
        .white)
      if let verse = store.current {
        Text(verse.reference).font(.system(size: 25, weight: .medium, design: .rounded)).tracking(
          -0.5)
        Text(
          store.library.cards[verse.id] == nil
            ? "STUDY · Read once, then hide and recall."
            : "RECALL · Say the words before revealing them."
        )
        .font(.system(size: 10, weight: .medium)).foregroundStyle(muted)
        if store.revealed {
          VStack(alignment: .leading, spacing: 18) {
            ForEach(verse.verses) { item in
              ScriptureText(
                verse: item, scripture: store.corpus.rendering(for: item), numbered: verse.isChapter
              )
            }
          }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
            .transition(.opacity)
          if store.studying {
            Button("Hide & Try to Recall") {
              store.revealed = false
              store.studying = false
            }
            .buttonStyle(QuietButton()).keyboardShortcut(.return, modifiers: [.command])
          } else {
            if store.isComparing { ProgressView("Comparing words…").controlSize(.small) }
            if let comparison = store.comparison { RecallFeedback(comparison: comparison) }
            if let error = store.feedbackError { Text(error).foregroundStyle(.secondary) }
            Text(
              store.hinted
                ? "Hints were used. Choose Again or Hard, then try unaided next time."
                : "How well did you recall it without looking?"
            )
            .font(.system(size: 12)).foregroundStyle(muted)
            HStack(spacing: 6) {
              ForEach(RecallRating.allCases, id: \.rawValue) { rating in
                if !store.hinted || rating.rawValue <= RecallRating.hard.rawValue {
                  Button {
                    Task { await store.rate(rating) }
                  } label: {
                    VStack(spacing: 5) {
                      Text(rating.title).font(.system(size: 12, weight: .medium))
                      Text(store.preview(rating)).font(.system(size: 10)).foregroundStyle(muted)
                    }.padding(.vertical, 13).frame(maxWidth: .infinity).background(
                      surface, in: RoundedRectangle(cornerRadius: 12))
                  }.buttonStyle(.plain).keyboardShortcut(
                    KeyEquivalent(Character(String(rating.rawValue))), modifiers: [])
                }
              }
            }
          }
        } else {
          if store.hinted {
            Text(verse.initials).font(.system(size: 21, design: .monospaced)).lineSpacing(8)
              .padding(20).frame(maxWidth: .infinity, alignment: .leading).background(
                surface, in: RoundedRectangle(cornerRadius: 22))
          }
          TextEditor(text: $store.typedRecall).font(.system(size: 16)).scrollContentBackground(
            .hidden
          )
          .frame(height: 100).padding(12).background(
            surface, in: RoundedRectangle(cornerRadius: 16)
          )
          .accessibilityLabel("Type your recall, or recite aloud and leave this blank")
          Text("Recite aloud, or type here. Compare your words after revealing.")
            .font(.system(size: 12)).foregroundStyle(muted)
          Button(verse.isChapter ? "Reveal Chapter" : "Reveal Verse") {
            store.reveal()
          }
          .buttonStyle(QuietButton(primary: true)).keyboardShortcut(.return, modifiers: [.command])
          Button("First-letter Hint") { store.hinted = true }.buttonStyle(QuietButton())
        }
      } else {
        Image(systemName: "checkmark.circle").font(.system(size: 36, weight: .ultraLight)).padding(
          .top, 24)
        Text("Carry it with you.").font(.system(size: 28, weight: .medium, design: .rounded))
        Text(
          "\(store.completed) reviews completed. Your next FSRS reviews are saved."
        )
        .font(.system(size: 14)).foregroundStyle(muted).lineSpacing(5)
        Button("Back to Today") { store.sessionActive = false }.buttonStyle(
          QuietButton(primary: true))
      }
    }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: store.revealed)
  }
}

struct LibraryView: View {
  @Bindable var store: Store
  @State private var book = 19
  @State private var chapter = 23
  @State private var scope = "Chapter"
  @State private var first = 1
  @State private var last = 1
  @State private var message = ""
  @State private var reading: Goal?
  private var books: [Verse] { store.corpus.books }
  private var chapters: Int { store.corpus.chapterCount(book: book) }
  private var verseCount: Int {
    store.corpus.verses(book: book, chapter: chapter).last?.number ?? 1
  }
  private var goal: Goal {
    let name = books.first { $0.book == book }?.bookName ?? "Psalms"
    switch scope {
    case "Whole Bible": return Goal(title: "The Whole Bible")
    case "Book": return Goal(title: name, book: book)
    case "Verses":
      return Goal(
        title: "\(name) \(chapter):\(first)" + (last > first ? "–\(last)" : ""), book: book,
        chapter: chapter, firstVerse: first, lastVerse: max(first, last))
    default: return Goal(title: "\(name) \(chapter)", book: book, chapter: chapter)
    }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("Make room for the Word.").font(.system(size: 24, weight: .medium, design: .rounded))
      Text("Choose a passage. Selah introduces verses in order, a few each day.").font(
        .system(size: 13)
      ).foregroundStyle(muted)
      Picker("Memorize", selection: $scope) {
        ForEach(["Verses", "Chapter", "Book", "Whole Bible"], id: \.self) { Text($0) }
      }
      if scope != "Whole Bible" {
        Picker("Book", selection: $book) { ForEach(books) { Text($0.bookName).tag($0.book) } }
        if scope != "Book" {
          Picker("Chapter", selection: $chapter) {
            ForEach(1...chapters, id: \.self) { Text("\($0)").tag($0) }
          }
          if scope == "Verses" {
            Picker("From verse", selection: $first) {
              ForEach(1...verseCount, id: \.self) { Text("\($0)").tag($0) }
            }
            Picker("Through verse", selection: $last) {
              ForEach(first...max(first, verseCount), id: \.self) { Text("\($0)").tag($0) }
            }
          }
        }
      }
      Button("Add \(goal.title)") {
        let chosen = goal
        if store.library.goals.contains(where: { $0.title == chosen.title }) {
          message = "This passage is already in your library."
        } else {
          Task {
            let saved = await store.add(chosen)
            message = saved ? "Added. Your next practice is ready in Today." : ""
          }
        }
      }.buttonStyle(QuietButton(primary: true)).disabled(!store.canSave)
      if !message.isEmpty { Text(message).font(.system(size: 12)).foregroundStyle(muted) }
      ForEach(store.library.goals) { goal in
        HStack {
          VStack(alignment: .leading, spacing: 5) {
            Text(goal.title).font(.system(size: 15, weight: .medium))
            Text("\(store.readiness?.countByGoal[goal.id] ?? 0) verses").font(
              .system(size: 11)
            ).foregroundStyle(muted)
          }
          Spacer()
          Button("Read") { reading = goal }.buttonStyle(.bordered)
        }.padding(16).background(surface, in: RoundedRectangle(cornerRadius: 12))
      }
    }
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
    .sheet(item: $reading) { goal in
      ReadingView(store: store, chapters: store.corpus.chapters(for: goal), title: goal.title)
    }
  }
}

struct ReadingView: View {
  @Bindable var store: Store
  let chapters: [[Verse]]
  let title: String
  @Environment(\.dismiss) private var dismiss
  @State private var chapterIndex = 0
  @State private var hidden = false
  private var visible: [Verse] { chapters.isEmpty ? [] : chapters[chapterIndex] }
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack {
        Text(title).font(.title2)
        Spacer()
        Button("Done") { dismiss() }
      }
      if let first = visible.first {
        Text("\(first.bookName) \(first.chapter)").foregroundStyle(muted)
      }
      HStack {
        Button("Previous") {
          chapterIndex -= 1
          hidden = false
        }.disabled(chapterIndex == 0)
        Spacer()
        Button(hidden ? "Reveal Chapter" : "Hide & Recite") { hidden.toggle() }
        Spacer()
        Button("Next") {
          chapterIndex += 1
          hidden = false
        }.disabled(chapterIndex >= chapters.count - 1)
      }
      ScrollView {
        if hidden {
          Text(
            "Recite this passage in order. Then reveal it and check the transitions between verses."
          )
          .font(.title3).foregroundStyle(muted).padding(.top, 32)
        } else {
          LazyVStack(alignment: .leading, spacing: 20) {
            ForEach(visible) { verse in
              ScriptureText(verse: verse, scripture: store.corpus.rendering(for: verse))
            }
          }
        }
      }
      if let first = visible.first,
        visible.count == store.corpus.verses(book: first.book, chapter: first.chapter).count
      {
        Button("Practice & Schedule This Chapter") {
          store.beginChapter(visible)
          dismiss()
        }.buttonStyle(.borderedProminent)
      }
      Text("Chapter grades schedule the chapter independently of its verses.").font(.caption)
        .foregroundStyle(muted)
    }.padding(28).frame(minWidth: 480, idealWidth: 620, minHeight: 580).background(
      Color(nsColor: .windowBackgroundColor)
    )
    .preferredColorScheme(.dark)
  }
}

struct SettingsView: View {
  @Bindable var store: Store
  @State private var configuring = false
  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("A rhythm you can keep.").font(.system(size: 24, weight: .medium, design: .rounded))
      Stepper(
        "\(store.library.preferences.newPerDay) new verses per day",
        value: Binding(
          get: { store.library.preferences.newPerDay },
          set: { value in Task { await store.change { $0.preferences.newPerDay = value } } }
        ), in: 1...20)
      Toggle(
        "Practice reminders",
        isOn: Binding(
          get: { store.library.preferences.remindersEnabled },
          set: { enabled in
            configuring = true
            Task {
              await store.configureReminders(
                enabled: enabled, minutes: store.library.preferences.reminderMinutes)
              configuring = false
            }
          })
      ).disabled(configuring)
      Picker(
        "Invite me every",
        selection: Binding(
          get: { store.library.preferences.reminderMinutes },
          set: { minutes in
            Task {
              await store.configureReminders(
                enabled: store.library.preferences.remindersEnabled, minutes: minutes)
            }
          })
      ) {
        Text("30 minutes").tag(30)
        Text("1 hour").tag(60)
        Text("2 hours").tag(120)
        Text("4 hours").tag(240)
      }
      Text(store.notificationStatus).font(.system(size: 12)).foregroundStyle(muted)
      Text(
        "Reminders invite you to practice when there’s work ready. They never interrupt you with an automatic window."
      )
      .font(.system(size: 13)).foregroundStyle(muted).lineSpacing(5)
      Divider()
      Text("Recall first. Then reveal.").font(.system(size: 16, weight: .medium))
      Text(
        "Be honest about recall. Again returns in 10 minutes; successful recalls move to 1 day, 6 days, then longer intervals. First-letter hints limit the grade to Hard."
      )
      .font(.system(size: 13)).foregroundStyle(muted).lineSpacing(5)
      Text(
        "Progress stays on this Mac. No account, subscription, or network connection is required."
      )
      .font(.system(size: 13)).foregroundStyle(muted).lineSpacing(5)
      Button("Show Progress File") {
        NSWorkspace.shared.selectFile(store.file.url.path, inFileViewerRootedAtPath: "")
      }
      .buttonStyle(QuietButton())
    }.font(.system(size: 14))
  }
}
