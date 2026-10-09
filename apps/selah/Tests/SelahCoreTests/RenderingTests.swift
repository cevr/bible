import Foundation
import Testing

@testable import SelahCore

@Test func italicAndRedLetterSegmentsCarryAcrossBoundariesAndAnchorToVisiblePhrase() {
  let verse = Verse(
    book: 40, bookName: "Matthew", chapter: 5, number: 3,
    text: "¶ ‹Blessed [are] the poor in spirit.›",
    marginNotes: [MarginNote(index: 0, type: "other", phrase: "Blessed are", text: "A note")])
  let plan = Scripture(verse: verse)
  #expect(plan.paragraph)
  #expect(plan.segments.map(\.text).joined() == "“Blessed area the poor in spirit.”")
  #expect(plan.segments.first(where: { $0.text == "are" })?.italic == true)
  #expect(plan.segments.first(where: { $0.text == "are" })?.redLetter == true)
  #expect(plan.segments.first(where: { $0.noteIndex == 0 })?.text == "a")
  #expect(verse.initials == "B a t p i s.")
}

@Test func unmatchedMarginNotesRemainAvailableAndLabelsContinueAfterZ() {
  let note = MarginNote(
    index: 26, type: "hebrew", phrase: "forever", text: "Heb. to length of days")
  let verse = Verse(
    book: 19, bookName: "Psalms", chapter: 23, number: 6, text: "for ever", marginNotes: [note])
  #expect(note.label == "aa")
  #expect(Scripture(verse: verse).notes == [note])
  #expect(!Scripture(verse: verse).segments.contains { $0.noteIndex != nil })
}

@Test func wordAlignmentHandlesOmissionsExtrasRepeatsAndPunctuation() throws {
  let comparison = try RecallComparison(
    expected: "The LORD is my shepherd; I shall not want.",
    recalled: "the lord my shepherd I shall never not want!")
  #expect(comparison.expected.filter { !$0.matched }.map(\.text) == ["is"])
  #expect(comparison.recalled.filter { !$0.matched }.map(\.text) == ["never"])
  #expect(comparison.matchedCount == 8)
  let repeated = try RecallComparison(expected: "holy holy holy", recalled: "holy holy")
  #expect(repeated.missingCount == 1)
  #expect(repeated.extraCount == 0)
  let empty = try RecallComparison(expected: "In the beginning", recalled: "")
  #expect(empty.missingCount == 3)
}
