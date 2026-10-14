import SelahCore
import SwiftUI

/// Promise categories as a list; each opens to its promises on the reading page.
struct PromisesView: View {
  @Bindable var store: Store
  var body: some View {
    NavigationStack(path: $store.promisePath) {
      Form {
        Section {
          ForEach(Promises.categories) { category in
            NavigationLink(value: category.id) {
              PromiseCategoryRow(store: store, category: category)
            }
          }
        } footer: {
          Text(
            "Each promise is a verse or a short passage. Added categories join your daily practice."
          )
          .font(.callout).foregroundStyle(.secondary)
        }
      }
      .formStyle(.grouped)
      .scrollContentBackground(.hidden)
      .background(Palette.page)
      .navigationTitle("Promises")
      .navigationDestination(for: String.self) { id in
        if let category = Promises.category(id) {
          PromiseCategoryView(store: store, category: category)
        }
      }
    }
  }
}

extension Store {
  func promiseGoal(_ category: PromiseCategory) -> Goal? {
    library.goals.first { $0.promises == category.id }
  }
  func promiseStatus(_ category: PromiseCategory) -> String {
    guard let goal = promiseGoal(category), let progress = readiness?.progress[goal.id] else {
      return "\(category.promises.count) promises"
    }
    return "\(progress.learned) of \(progress.total) learned"
  }
}

struct PromiseCategoryRow: View {
  @Bindable var store: Store
  let category: PromiseCategory
  var body: some View {
    HStack(spacing: Space.s) {
      Image(systemName: category.symbol).foregroundStyle(.secondary).frame(width: 20)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Space.xxs) {
        Text(category.title).font(.body.weight(.medium))
        Text(store.promiseStatus(category)).font(.callout).foregroundStyle(.secondary)
          .monospacedDigit()
      }
      Spacer()
      if let goal = store.promiseGoal(category), let progress = store.readiness?.progress[goal.id] {
        ProgressView(value: Double(progress.learned), total: Double(max(1, progress.total)))
          .frame(width: 72).accessibilityHidden(true)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// One category's promises in the reader's face, with the action to practice them.
struct PromiseCategoryView: View {
  @Bindable var store: Store
  let category: PromiseCategory
  private var reader: ReaderPreferences { store.library.preferences.reader }
  private var units: [PracticeUnit] { store.corpus.promiseUnits(for: category) }
  private var added: Bool { store.promiseGoal(category) != nil }
  var body: some View {
    Column {
      VStack(alignment: .leading, spacing: Space.xxs) {
        Text(category.title).font(.reference(reader))
        Text(
          added
            ? store.promiseStatus(category)
            : "\(category.promises.count) promises · Add them to learn a few each day."
        )
        .font(.callout).foregroundStyle(.secondary).monospacedDigit()
      }
      VStack(alignment: .leading, spacing: Space.l) {
        ForEach(units) { unit in
          VStack(alignment: .leading, spacing: Space.xs) {
            HStack(spacing: Space.xs) {
              Text(unit.reference).font(.callout.weight(.medium)).foregroundStyle(.secondary)
              if added && store.library.isLearned(unit) {
                Image(systemName: "checkmark").font(.caption).foregroundStyle(.secondary)
                  .accessibilityLabel("Learned")
              }
            }
            Text(unit.verses.map(\.practiceText).joined(separator: " "))
              .font(.scripture(reader)).lineSpacing(Space.xxs).textSelection(.enabled)
          }
        }
      }
    }
    .navigationTitle(category.title)
    .toolbar {
      if !added {
        ToolbarItem(placement: .primaryAction) {
          Button("Add to Practice") { Task { await store.addPromises(category) } }
            .buttonStyle(.glassProminent).disabled(!store.canSave)
        }
      }
    }
  }
}
