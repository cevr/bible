import Foundation

@testable import SelahCore

/// The app's whole KJV, decoded and rendered once for every test that reads it.
let kjv: Corpus = {
  let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    .appendingPathComponent("../../Sources/SelahApp/Resources/kjv.json").standardized
  return Corpus(verses: try! JSONDecoder().decode([Verse].self, from: Data(contentsOf: url)))
}()
