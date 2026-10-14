import Foundation
import Testing

@testable import SelahCore

@Test func everyPromiseResolvesToRealKJVVersesSizedForMemorizing() {
  let categories = Promises.categories
  #expect(categories.count == 14)
  #expect(Set(categories.map(\.id)).count == categories.count)
  var everyReference = Set<PromiseReference>()
  for category in categories {
    #expect((10...12).contains(category.promises.count), "\(category.title)")
    #expect(Set(category.promises).count == category.promises.count, "\(category.title)")
    for promise in category.promises {
      let verses = kjv.verses(for: promise)
      let label = "\(category.title): \(promise.book) \(promise.chapter):\(promise.first)"
      #expect(verses.count == promise.last - promise.first + 1, "\(label)")
      #expect((1...3).contains(verses.count), "\(label)")
      let words = verses.map(\.practiceText).joined(separator: " ").split(separator: " ").count
      #expect(words <= 70, "\(label) has \(words) words")
      #expect(everyReference.insert(promise).inserted, "\(label) appears twice")
    }
    #expect(kjv.promiseUnits(for: category).count == category.promises.count)
  }
}

@Test func promiseGoalsShareTheSchedulerAndTakeTurnsWithVerses() throws {
  let now = Date(timeIntervalSince1970: 1_800_000_000)
  var library = Library()
  library.goals = [
    Goal(title: "Psalms 37", book: 19, chapter: 37),
    Goal(title: "Rest", promises: "rest"),
  ]
  let queue = library.practiceQueue(in: kjv, now: now)
  #expect(queue.map(\.reference) == ["Psalms 37:1", "Matthew 11:28–30", "Psalms 37:2"])
  #expect(queue[1].kind == .passage)
  try library.record(queue[1], rating: .good, usedHint: false, now: now)
  #expect(library.cards["passage:40:11:28-30"] != nil)
  let progress = Readiness(library: library, corpus: kjv, now: now).progress[library.goals[1].id]
  #expect(progress?.measure == .promises)
  #expect(progress?.total == 10)
  #expect(progress?.learned == 0)
  // A single-verse promise shares its card with the verse itself.
  #expect(kjv.promiseUnits(for: Promises.category("rest")!)[2].id == "2:33:14")
}

@Test func removingAGoalStopsItsPracticeButKeepsItsProgress() throws {
  let now = Date(timeIntervalSince1970: 1_800_000_000)
  let later = now.addingTimeInterval(30 * 86_400)
  var library = Library()
  library.goals = [Goal(title: "Rest", promises: "rest")]
  let first = try #require(library.practiceQueue(in: kjv, now: now).first)
  try library.record(first, rating: .good, usedHint: false, now: now)
  library.removeGoal(library.goals[0].id)
  #expect(library.practiceQueue(in: kjv, now: later).isEmpty)
  #expect(Readiness(library: library, corpus: kjv, now: later).dueCount == 0)
  #expect(library.cards[first.id] != nil)
  // Adding the category again brings back the promise already started, now due.
  library.goals.append(Goal(title: "Rest", promises: "rest"))
  #expect(library.practiceQueue(in: kjv, now: later).first?.id == first.id)
}
