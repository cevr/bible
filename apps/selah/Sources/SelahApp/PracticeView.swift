import SelahCore
import SwiftUI

struct PracticeView: View {
  @Bindable var store: Store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
            if let comparison = store.comparison {
              Text(RecallFeedback.marked(comparison.expected, color: Palette.slipped))
                .font(.scripture(reader)).lineSpacing(Space.xxs).textSelection(.enabled)
              RecallFeedback(comparison: comparison)
            } else {
              ScripturePassage(
                verses: unit.verses, corpus: store.corpus, reader: reader,
                numbered: unit.verses.count > 1,
                showMargins: store.library.preferences.showMarginNotes)
              if store.isComparing { ProgressView("Comparing words…").controlSize(.small) }
            }
            if store.hinted {
              Text("First letters were shown, so grades are limited to Again or Hard.")
                .font(.callout).foregroundStyle(.secondary)
            }
          }
          if let error = store.feedbackError { Text(error).foregroundStyle(.secondary) }
        } else {
          if unit.isChapter {
            CueList(store: store, unit: unit)
          } else if store.hinted {
            Text(unit.initials).font(.scripture(reader)).lineSpacing(Space.xs)
              .foregroundStyle(.secondary).textSelection(.enabled)
          }
          RecallEditor(store: store)
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
        Button("End Session", systemImage: "xmark") { store.endSession() }
          .help("End this practice session")
      }
    }
    .onDisappear { store.dictation.stop() }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: store.revealed)
  }

  private func header(_ unit: PracticeUnit) -> some View {
    VStack(alignment: .leading, spacing: Space.xxs) {
      Text(unit.reference).font(.reference(reader))
      Text(instruction(unit)).font(.callout).foregroundStyle(.secondary)
    }
  }

  private func instruction(_ unit: PracticeUnit) -> String {
    let kind: String =
      switch unit.kind {
      case .chapter: "Whole chapter · \(unit.verses.count) verses"
      case .passage: "Passage · \(unit.verses.count) verses"
      case .verse: "Verse"
      }
    if store.studying {
      return unit.isChapter
        ? "\(kind) · Read it through aloud, then recite it with cues."
        : "\(kind) · Read it once, then hide it and recall."
    }
    if store.revealed { return "\(kind) · Compare, then grade your recall." }
    return unit.isChapter
      ? "\(kind) · Recite the chapter in order. Cues fade as verses hold."
      : "\(kind) · Say it or type it before revealing."
  }

  private var finished: some View {
    VStack(alignment: .leading, spacing: Space.s) {
      Text("Session complete").font(.title2.weight(.semibold))
      Text(
        "\(store.completed) \(store.completed == 1 ? "review" : "reviews") saved. Selah brings each one back when it’s due."
      )
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
            ForEach(store.allowedRatings, id: \.rawValue) { rating in
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
              .accessibilityHint("Next review in \(store.preview(rating))")
            }
          } else {
            if !unit.isChapter && !store.hinted {
              Button("First Letters") { store.hinted = true }.buttonStyle(.glass)
                .help("Show each word’s first letter. Grades are limited to Again or Hard.")
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
  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      TextEditor(text: $store.typedRecall)
        .font(.scripture(store.library.preferences.reader, size: 18))
        .scrollContentBackground(.hidden).scrollIndicators(.never)
        .frame(minHeight: store.current?.isChapter == true ? 160 : 100)
        .padding(Space.s)
        .background(Palette.field, in: RoundedRectangle(cornerRadius: Radius.field))
        .accessibilityLabel("Your recall")
      Text("Type to compare word by word, or recite aloud and leave this empty.")
        .font(.callout).foregroundStyle(.secondary)
      if store.dictation.phase == .listening, let started = store.dictation.started {
        TimelineView(.periodic(from: started, by: 1)) { context in
          Label(
            "Listening · \(Duration.seconds(context.date.timeIntervalSince(started)).formatted(.time(pattern: .minuteSecond)))",
            systemImage: "waveform"
          )
          .font(.callout).foregroundStyle(.secondary).monospacedDigit()
        }
      }
      if let message = store.dictation.message {
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
            Text(verse.practiceText).font(.scripture(reader)).foregroundStyle(.secondary)
          case .initials:
            Text(verse.initials).font(.scripture(reader)).foregroundStyle(.secondary)
              .accessibilityLabel("First letters of verse \(verse.number)")
          case .none:
            Button("Show Letters") { store.peek(verse) }
              .buttonStyle(.borderless).font(.callout).foregroundStyle(.tertiary)
              .help("Show this verse’s first letters. It will count as a verse that slipped.")
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .lineSpacing(Space.xxs)
  }
}

struct VerseNumber: View {
  let number: Int
  var slipped = false
  var body: some View {
    Text("\(number)").font(.caption.weight(.medium)).monospacedDigit()
      .foregroundStyle(slipped ? Palette.slipped : .secondary)
      .frame(width: 24, alignment: .trailing)
      .accessibilityLabel(slipped ? "Verse \(number), slipped" : "Verse \(number)")
  }
}

/// The revealed chapter, verse by verse: missing words underlined, slipped verses marked.
struct ChapterReview: View {
  @Bindable var store: Store
  let unit: PracticeUnit
  private var reader: ReaderPreferences { store.library.preferences.reader }
  private var summary: String {
    let slipped = unit.verses.map(\.number).filter { store.slipped.contains($0) }
    var parts: [String] = []
    if let comparison = store.comparison {
      parts.append("\(comparison.matchedCount) of \(comparison.expected.count) words")
    }
    switch slipped.count {
    case 0:
      parts.append(store.comparison == nil ? "Mark any verse that slipped" : "No verse slipped")
    case 1: parts.append("Verse \(slipped[0]) slipped")
    default:
      parts.append(
        "Verses \(slipped.map(String.init).formatted(.list(type: .and))) slipped")
    }
    return parts.joined(separator: " · ")
  }
  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      if store.isComparing { ProgressView("Comparing words…").controlSize(.small) }
      Text(summary).font(.callout).foregroundStyle(.secondary).monospacedDigit()
      VStack(alignment: .leading, spacing: reader.verseSpacing + Space.xxs) {
        ForEach(Array(unit.verses.enumerated()), id: \.element.id) { index, verse in
          let slipped = store.slipped.contains(verse.number)
          HStack(alignment: .firstTextBaseline, spacing: Space.s) {
            VerseNumber(number: verse.number, slipped: slipped)
            Group {
              if let comparison = store.comparison {
                Text(marked(comparison.expected.filter { $0.segment == index }))
                  .font(.scripture(reader)).lineSpacing(Space.xxs)
              } else {
                ScriptureText(
                  verse: verse, scripture: store.corpus.rendering(for: verse), reader: reader,
                  numbered: false)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Toggle(
              "Slipped", isOn: Binding(get: { slipped }, set: { _ in store.toggleSlipped(verse) })
            )
            .toggleStyle(.checkbox).tint(Palette.slipped).font(.callout).foregroundStyle(.secondary)
            .accessibilityLabel("Verse \(verse.number) slipped")
          }
        }
      }
      if let comparison = store.comparison, comparison.extraCount > 0 {
        DisclosureGroup("Your recall, with extra or changed words underlined") {
          Text(RecallFeedback.marked(comparison.recalled, color: Palette.extra))
            .lineSpacing(Space.xxs).textSelection(.enabled).padding(.top, Space.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.callout)
      }
      if store.allowedRatings.last != .easy {
        Text("Easy needs a recall without cues.").font(.callout).foregroundStyle(.secondary)
      }
    }
  }
  private func marked(_ words: [RecallWord]) -> AttributedString {
    RecallFeedback.marked(words, color: Palette.slipped)
  }
}
