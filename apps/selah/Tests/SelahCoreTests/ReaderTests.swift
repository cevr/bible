import Foundation
import Testing

@testable import SelahCore

@Test func existingProgressGetsSerifDefaultsAndReaderChoicesSurviveRelaunch() throws {
  let original = Data(#"{"newPerDay":5,"showMarginNotes":true}"#.utf8)
  var preferences = try JSONDecoder().decode(Preferences.self, from: original)
  #expect(preferences.newPerDay == 5)
  #expect(preferences.showMarginNotes)
  #expect(preferences.reader.font == .georgia)
  #expect(preferences.reader.size == 22)
  #expect(!preferences.dictationEnabled)
  preferences.reader.font = .baskerville
  preferences.reader.size = 28
  preferences.reader.lineHeight = 1.8
  preferences.reader.characterSpacing = 0.4
  preferences.reader.paragraphSpacing = 24
  preferences.reader.showVerseNumbers = false
  preferences.dictationEnabled = true
  let reopened = try JSONDecoder().decode(Preferences.self, from: JSONEncoder().encode(preferences))
  #expect(reopened.reader == preferences.reader)
  #expect(reopened.dictationEnabled)
  #expect(reopened.showMarginNotes)
}

@Test func bookRehearsalsKeepChapterOrderAndScheduleOnlyTheGradedChapter() throws {
  let verses = [
    Verse(book: 43, bookName: "John", chapter: 1, number: 1, text: "In the beginning"),
    Verse(book: 43, bookName: "John", chapter: 1, number: 2, text: "The same was"),
    Verse(book: 43, bookName: "John", chapter: 2, number: 1, text: "And the third day"),
    Verse(book: 44, bookName: "Acts", chapter: 1, number: 1, text: "The former treatise"),
  ]
  let corpus = Corpus(verses: verses)
  let rehearsal = corpus.bookRehearsal(book: 43)
  #expect(rehearsal.map(\.id) == ["chapter:43:1", "chapter:43:2"])
  #expect(rehearsal.first?.verses == Array(verses.prefix(2)))
  #expect(corpus.bookRehearsal(book: 99).isEmpty)
  var library = Library()
  try library.record(rehearsal[0], rating: .good, usedHint: false, now: Date())
  #expect(Set(library.cards.keys) == ["chapter:43:1"])
  #expect(library.reviews.count == 1)
  #expect(library.cards[verses[0].id] == nil)
}
