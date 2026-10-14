import SelahCore
import SwiftUI

struct PracticeView: View {
  @Bindable var store: Store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var confirmingEnd = false
  private var reader: ReaderPreferences { store.library.preferences.reader }
  var body: some View {
    Column {
      if let unit = store.current {
        header(unit)
        if store.studying {
          ScripturePassage(
            verses: unit.verses, corpus: store.corpus, reader: reader,
            numbered: unit.verses.count > 1, showMargins: store.library.preferences.showMarginNotes)
        } else if store.revealed {
          if unit.isChapter {
            ChapterReview(store: store, unit: unit)
          } else {
            ScripturePassage(
              verses: unit.verses, corpus: store.corpus, reader: reader,
              numbered: unit.verses.count > 1,
              showMargins: store.library.preferences.showMarginNotes, comparison: store.comparison)
            if let comparison = store.comparison {
              RecallFeedback(comparison: comparison)
            } else if store.isComparing {
              ProgressView("Comparing words…").controlSize(.small)
            }
          }
          if let error = store.feedbackError { Text(error).foregroundStyle(.secondary) }
        } else {
          if unit.isChapter {
            CueList(store: store, unit: unit)
          } else if store.hinted {
            Text(unit.initials).font(.scripture(reader)).lineSpacing(Space.xs)
              .foregroundStyle(Palette.cue).textSelection(.enabled)
          }
          if !unit.isChapter || store.typing || !store.typedRecall.isEmpty
            || store.dictation.active
          {
            RecallEditor(store: store)
          }
          DictationStatus(dictation: store.dictation)
        }
      } else {
        finished
      }
    }
    .id(store.current?.id)
    .safeAreaBar(edge: .bottom) { ActionBar(store: store).padding(Space.m) }
    .navigationTitle(store.rehearsalBook.map { "Rehearse \($0)" } ?? "Practice")
    .navigationSubtitle(
      store.current == nil
        ? "" : "\(min(store.completed + 1, store.sessionTotal)) of \(store.sessionTotal)"
    )
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("End Practice") {
          if store.hasRecallInProgress { confirmingEnd = true } else { store.endSession() }
        }
        .help("End practice. Grades already given are kept.")
        .confirmationDialog(
          "End practice?", isPresented: $confirmingEnd, titleVisibility: .visible
        ) {
          Button("End Practice", role: .destructive) { store.endSession() }
        } message: {
          Text(
            "Your recall of \(store.current?.reference ?? "this passage") is discarded. Grades already given are kept."
          )
        }
      }
    }
    .onDisappear { store.dictation.stop() }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: store.revealed)
  }

  private func header(_ unit: PracticeUnit) -> some View {
    VStack(alignment: .leading, spacing: Space.xxs) {
      Text(unit.reference).font(.reference(reader))
      Text(kind(unit)).font(.callout).foregroundStyle(Palette.secondaryText)
    }
  }

  /// What is being practiced, never how: the controls below say what comes next.
  private func kind(_ unit: PracticeUnit) -> String {
    let size = unit.verses.count == 1 ? "1 verse" : "\(unit.verses.count) verses"
    if let category = store.promiseCategory(for: unit) { return "\(category.title) · \(size)" }
    return switch unit.kind {
    case .chapter: "Whole chapter · \(size)"
    case .passage: "Passage · \(size)"
    case .verse: "Verse"
    }
  }

  private var finished: some View {
    VStack(alignment: .leading, spacing: Space.s) {
      Text("Practice complete").font(.title2.weight(.semibold))
      Text("\(store.completed) \(store.completed == 1 ? "review" : "reviews") saved.")
        .foregroundStyle(.secondary)
    }
  }
}

/// The functional layer under the passage: one set of glass controls per phase.
struct ActionBar: View {
  @Bindable var store: Store
  var body: some View {
    GlassEffectContainer(spacing: Space.s) {
      HStack(spacing: Space.s) {
        if let unit = store.current {
          if store.studying {
            Button("Begin Recall") {
              store.revealed = false
              store.studying = false
            }
            .buttonStyle(.glassProminent).keyboardShortcut(.return, modifiers: [.command])
          } else if store.revealed {
            ForEach(RecallRating.allCases, id: \.rawValue) { rating in
              let allowed = store.allowedRatings.contains(rating)
              Button {
                Task { await store.rate(rating) }
              } label: {
                VStack(spacing: Space.xxs) {
                  Text(rating.title).font(.body.weight(.medium))
                  Text(store.preview(rating)).font(.caption).foregroundStyle(.secondary)
                }
                .frame(minWidth: 64)
              }
              .buttonStyle(.glass)
              .keyboardShortcut(KeyEquivalent(Character(String(rating.rawValue))), modifiers: [])
              .disabled(!allowed)
              .help(allowed ? "" : store.ratingLimit)
              .accessibilityHint(
                allowed ? "Next review in \(store.preview(rating))" : store.ratingLimit)
            }
          } else {
            if !unit.isChapter && !store.hinted {
              Button("First Letters") { store.hinted = true }.buttonStyle(.glass)
                .help("Show each word’s first letter. Grades are limited to Again or Hard.")
            }
            if unit.isChapter && !store.typing && store.typedRecall.isEmpty
              && !store.dictation.active
            {
              Button("Type", systemImage: "keyboard") { store.typing = true }.buttonStyle(.glass)
                .help("Type the chapter to compare it word by word")
            }
            if store.library.preferences.dictationEnabled {
              DictateButton(store: store)
            }
            Button(unit.isChapter ? "Reveal Chapter" : "Reveal") { store.reveal() }
              .disabled(store.dictation.phase == .finishing)
              .buttonStyle(.glassProminent).keyboardShortcut(.return, modifiers: [.command])
          }
        } else {
          Button("Back to Today") { store.endSession() }.buttonStyle(.glassProminent)
            .keyboardShortcut(.return, modifiers: [])
        }
      }
      .controlSize(.large)
    }
  }
}

/// Starts a spoken take, stops it, or shows that the model is getting ready or finishing.
struct DictateButton: View {
  @Bindable var store: Store
  var body: some View {
    switch store.dictation.phase {
    case .idle:
      Button("Dictate", systemImage: "mic") { store.startDictation() }
        .buttonStyle(.glass)
        .help(
          "Recite aloud. \(store.library.preferences.dictationModel.title) writes it down on this Mac."
        )
    case .preparing:
      Button("Preparing…", systemImage: "mic") {}.buttonStyle(.glass).disabled(true)
    case .listening:
      Button("Stop", systemImage: "stop.fill") { Task { await store.dictation.finish() } }
        .buttonStyle(.glass)
        .help("Stop listening and keep what was heard")
    case .finishing:
      Button("Finishing…", systemImage: "waveform") {}.buttonStyle(.glass).disabled(true)
    }
  }
}

struct RecallEditor: View {
  @Bindable var store: Store
  @FocusState private var focused: Bool
  private var chapter: Bool { store.current?.isChapter == true }
  var body: some View {
    let shape = RoundedRectangle(cornerRadius: Radius.field, style: .continuous)
    TextEditor(text: $store.typedRecall)
      .font(.recall(store.library.preferences.reader))
      .scrollContentBackground(.hidden).scrollIndicators(.never)
      .focused($focused)
      .frame(minHeight: chapter ? Measure.chapterRecall : Measure.verseRecall)
      .padding(Space.s)
      .background(Palette.field, in: shape)
      .overlay(shape.strokeBorder(.separator))
      .overlay(alignment: .topLeading) {
        if store.typedRecall.isEmpty {
          Text(chapter ? "Type the chapter to compare" : "Type to compare (optional)")
            .font(.recall(store.library.preferences.reader)).foregroundStyle(Palette.cue)
            .padding(Space.s).padding(.leading, Space.xxs).allowsHitTesting(false)
            .accessibilityHidden(true)
        }
      }
      .accessibilityLabel("Your recall")
      .onAppear { if chapter { focused = true } }
  }
}

/// A running take's elapsed time, and any message from dictation.
struct DictationStatus: View {
  let dictation: Dictation
  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      if dictation.phase == .listening, let started = dictation.started {
        TimelineView(.periodic(from: started, by: 1)) { context in
          Label(
            "Listening · \(Duration.seconds(context.date.timeIntervalSince(started)).formatted(.time(pattern: .minuteSecond)))",
            systemImage: "waveform"
          )
          .font(.callout).foregroundStyle(.secondary).monospacedDigit()
        }
      }
      if let message = dictation.message {
        Text(message).font(.callout).foregroundStyle(.secondary)
      }
    }
  }
}

/// Each verse at its cue: full text, first letters, or nothing but its number.
struct CueList: View {
  @Bindable var store: Store
  let unit: PracticeUnit
  private var reader: ReaderPreferences { store.library.preferences.reader }
  var body: some View {
    VStack(alignment: .leading, spacing: reader.verseSpacing + Space.xxs) {
      ForEach(Array(unit.verses.enumerated()), id: \.element.id) { index, verse in
        let cue = index < store.cues.count ? store.cues[index] : .none
        let peeked = store.peeked.contains(verse.number)
        HStack(alignment: .firstTextBaseline, spacing: Space.s) {
          VerseNumber(number: verse.number, slipped: peeked)
          switch peeked && cue == .none ? .initials : cue {
          case .full:
            Text(verse.practiceText).font(.scripture(reader)).foregroundStyle(Palette.cue)
          case .initials:
            Text(verse.initials).font(.scripture(reader)).foregroundStyle(Palette.cue)
              .accessibilityLabel("First letters of verse \(verse.number)")
          case .none:
            HiddenVerse(number: verse.number, reader: reader) { store.peek(verse) }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .lineSpacing(Space.xxs)
  }
}

/// A verse recited without cues: a quiet placeholder at reading height. Hovering or focusing
/// the row offers its first letters, at the cost of the verse counting as slipped.
struct HiddenVerse: View {
  let number: Int
  let reader: ReaderPreferences
  let peek: () -> Void
  @State private var hovering = false
  @FocusState private var focused: Bool
  /// The row only reveals the control; a click lands only on the visible label, so a stray
  /// click on the page never costs a verse.
  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text("· · ·").font(.scripture(reader)).foregroundStyle(.tertiary)
        .accessibilityLabel("Verse \(number) hidden")
      Spacer(minLength: Space.s)
      Button("First Letters", systemImage: "eye", action: peek)
        .buttonStyle(.borderless).font(.callout).foregroundStyle(Palette.cue)
        .opacity(hovering || focused ? 1 : 0)
        .allowsHitTesting(hovering || focused)
        .focused($focused)
        .help("Show this verse’s first letters. The verse counts as slipped.")
        .accessibilityLabel("Show first letters of verse \(number)")
        .accessibilityHint("The verse counts as slipped")
    }
    .contentShape(Rectangle())
    .onHover { hovering = $0 }
  }
}

/// A verse number in the gutter, raised like the reader's; orange when the verse slipped.
struct VerseNumber: View {
  let number: Int
  var slipped = false
  var body: some View {
    Text("\(number)").font(.verseNumber).monospacedDigit()
      .foregroundStyle(slipped ? Palette.slipped : Palette.verseNumber)
      .baselineOffset(Space.xxs + 2)
      .frame(width: Measure.verseGutter, alignment: .trailing)
      .accessibilityLabel(slipped ? "Verse \(number), slipped" : "Verse \(number)")
  }
}

/// The slipped mark beside a revealed verse: one mark in two states, off in the cue colour or
/// set in orange. A verse whose first letters were shown is locked as slipped and shows an eye.
struct SlippedMarkStyle: ToggleStyle {
  var locked = false
  func makeBody(configuration: Configuration) -> some View {
    let symbol =
      locked
      ? "eye.circle.fill"
      : configuration.isOn ? "exclamationmark.circle.fill" : "exclamationmark.circle"
    Button {
      configuration.isOn.toggle()
    } label: {
      Image(systemName: symbol)
        .font(.title3)
        .foregroundStyle(configuration.isOn || locked ? Palette.slipped : Palette.cue)
        .frame(width: Measure.markColumn, height: Measure.markColumn)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .allowsHitTesting(!locked)
    .help(locked ? "First letters were shown, so this verse counts as slipped" : "")
    .accessibilityRepresentation {
      Toggle(isOn: configuration.$isOn) { configuration.label }
        .accessibilityValue(locked ? "Slipped, first letters shown" : "")
    }
  }
}

/// The revealed chapter, verse by verse: missing words marked, slipped verses flagged.
struct ChapterReview: View {
  @Bindable var store: Store
  let unit: PracticeUnit
  private var reader: ReaderPreferences { store.library.preferences.reader }
  private var summary: String {
    guard let comparison = store.comparison else { return "" }
    return "\(comparison.matchedCount) of \(comparison.expected.count) words"
  }
  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      if store.isComparing { ProgressView("Comparing words…").controlSize(.small) }
      HStack(alignment: .firstTextBaseline) {
        Text(summary).font(.callout).foregroundStyle(Palette.secondaryText).monospacedDigit()
        Spacer()
        Text("Slipped").font(.callout).foregroundStyle(Palette.secondaryText)
          .fixedSize().frame(width: Measure.markColumn)
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: reader.verseSpacing + Space.xxs) {
        ForEach(Array(unit.verses.enumerated()), id: \.element.id) { index, verse in
          let peeked = store.peeked.contains(verse.number)
          let slipped = peeked || store.slipped.contains(verse.number)
          HStack(alignment: .firstTextBaseline, spacing: Space.s) {
            VerseNumber(number: verse.number, slipped: slipped)
            ScriptureText(
              verse: verse, scripture: store.corpus.rendering(for: verse), reader: reader,
              numbered: false, missing: store.comparison?.missing(in: index) ?? [],
              missingColor: slipped ? Palette.slipped : Palette.cue
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            Toggle(
              "Verse \(verse.number) slipped",
              isOn: Binding(get: { slipped }, set: { _ in store.toggleSlipped(verse) })
            )
            .toggleStyle(SlippedMarkStyle(locked: peeked))
          }
        }
      }
      if let comparison = store.comparison, comparison.extraCount > 0 {
        DisclosureGroup("Your recall, with extra or changed words marked") {
          Text(RecallFeedback.marked(comparison.recalled, color: Palette.extra))
            .lineSpacing(Space.xxs).textSelection(.enabled).padding(.top, Space.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.callout)
      }
    }
  }
}
