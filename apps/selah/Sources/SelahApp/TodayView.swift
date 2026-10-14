import SelahCore
import SwiftUI

struct TodayView: View {
  @Bindable var store: Store
  private var ready: Int { store.available.count }
  private var newCount: Int { store.available.filter { store.library.cards[$0.id] == nil }.count }
  var body: some View {
    Column {
      if store.library.goals.isEmpty {
        empty
      } else {
        summary
        if let waiting = store.readiness?.waitingOn {
          Label(
            "The next chapter begins after you recall \(waiting.reference) without cues.",
            systemImage: "hourglass"
          )
          .font(.callout).foregroundStyle(.secondary)
        }
        VStack(alignment: .leading, spacing: Space.s) {
          Text("Learning").font(.headline)
          VStack(spacing: 0) {
            ForEach(Array(store.library.goals.enumerated()), id: \.element.id) { index, goal in
              if index > 0 { Divider().padding(.leading, Space.m) }
              GoalRow(goal: goal, progress: store.readiness?.progress[goal.id])
            }
          }
          .groupSurface()
        }
      }
    }
    .navigationTitle("Today")
    .navigationSubtitle(Date().formatted(.dateTime.weekday(.wide).month(.wide).day()))
  }

  private var summary: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      HStack(alignment: .firstTextBaseline, spacing: Space.xs) {
        Text("\(ready)").font(.metric)
        Text("ready").font(.title3).foregroundStyle(.secondary)
      }
      Text(
        "\(newCount) new · \(store.dueCount) due · \(store.reviewedToday) done today" + nextReview
      )
      .font(.callout).foregroundStyle(.secondary).monospacedDigit()
      if ready > 0 {
        Button("Begin Practice") { store.begin() }
          .buttonStyle(.borderedProminent).controlSize(.extraLarge)
          .keyboardShortcut(.return, modifiers: [])
      }
    }
  }

  private var nextReview: String {
    guard ready == 0, let next = store.readiness?.nextReview, next > Date() else { return "" }
    let calendar = Calendar.current
    let time = next.formatted(date: .omitted, time: .shortened)
    if calendar.isDateInToday(next) { return " · next at \(time)" }
    if calendar.isDateInTomorrow(next) { return " · next tomorrow at \(time)" }
    return " · next \(next.formatted(.dateTime.weekday(.abbreviated).month().day()))"
  }

  private var empty: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      Text("Choose what to memorize").font(.title2.weight(.semibold))
      HStack(spacing: Space.s) {
        Button("Choose a Passage") { store.section = .passages }.buttonStyle(.borderedProminent)
        Button("Browse Promises") { store.section = .promises }.buttonStyle(.bordered)
      }
      .controlSize(.large)
    }
  }
}

/// How far a goal has come, in the words both Today and Passages use.
struct Meter {
  let value: Int
  let total: Int
  let label: String
  let detail: String?
  /// A single whole chapter shows its cues fading; anything larger counts what is learned.
  init(_ progress: GoalProgress) {
    if progress.measure == .chapters, progress.total == 1, progress.learned == 0,
      let chapter = progress.chapter
    {
      let count = chapter.unit.verses.count
      value = chapter.started ? chapter.uncued : 0
      total = count
      label = chapter.started ? "\(chapter.uncued) of \(count) verses without cues" : "Not started"
      detail = nil
      return
    }
    let noun: String =
      switch progress.measure {
      case .chapters: progress.total == 1 ? "chapter" : "chapters"
      case .promises: "promises"
      case .verses: "verses"
      }
    value = progress.learned
    total = progress.total
    label = "\(progress.learned) of \(progress.total) \(noun) learned"
    if let chapter = progress.chapter, progress.total > 1 {
      detail =
        chapter.started
        ? "\(chapter.unit.reference) · \(chapter.uncued) of \(chapter.unit.verses.count) verses without cues"
        : "\(chapter.unit.reference) is next"
    } else {
      detail = nil
    }
  }
}

struct GoalRow: View {
  let goal: Goal
  let progress: GoalProgress?
  private var kind: String {
    goal.promises != nil ? "Promises" : goal.learning.title
  }
  var body: some View {
    let meter = progress.map(Meter.init)
    VStack(alignment: .leading, spacing: Space.xs) {
      HStack(alignment: .firstTextBaseline) {
        Text(goal.title).font(.body.weight(.medium))
        Text(kind).font(.callout).foregroundStyle(.secondary)
        Spacer()
        if let meter {
          Text(meter.label).font(.callout).foregroundStyle(.secondary).monospacedDigit()
        }
      }
      if let meter {
        if meter.value > 0 {
          ProgressView(value: Double(meter.value), total: Double(max(1, meter.total)))
            .accessibilityLabel(meter.label)
        }
        if let detail = meter.detail {
          Text(detail).font(.callout).foregroundStyle(.secondary)
        }
      }
    }
    .padding(Space.m)
  }
}
