@preconcurrency import AVFoundation
import Foundation
import SelahCore
import SelahSpeech

/// Runs a recorded take through the same transcriber the app uses and scores it the way
/// a reveal does.
///
///     swift run SelahTranscribe <kjv.json> <audio> <appleSpeech|appleDictation> <book> <chapter> [--no-context]
@main struct Transcribe {
  static func main() async throws {
    let arguments = CommandLine.arguments
    guard arguments.count >= 6, let model = DictationModel(rawValue: arguments[3]),
      let book = Int(arguments[4]), let chapter = Int(arguments[5])
    else {
      print(
        "usage: SelahTranscribe <kjv.json> <audio> <appleSpeech|appleDictation> <book> <chapter> [--no-context]"
      )
      exit(2)
    }
    let verses = try JSONDecoder().decode(
      [Verse].self, from: Data(contentsOf: URL(fileURLWithPath: arguments[1])))
    let passage = Corpus(verses: verses).verses(book: book, chapter: chapter)
    let expected = passage.map(\.practiceText)
    let context = arguments.contains("--no-context") ? [] : contextualWords(for: expected)
    let file = try AVAudioFile(forReading: URL(fileURLWithPath: arguments[2]))
    let seconds = Double(file.length) / file.processingFormat.sampleRate
    print(
      "Audio: \(String(format: "%.1f", seconds)) s · model \(model.title) · \(context.count) context words"
    )

    let clock = ContinuousClock()
    let began = clock.now
    let (transcriber, used) = try await startTranscriber(model: model, context: context) { _ in }
    print(
      "Listening with \(used?.title ?? "legacy recognizer"), ready in \(began.duration(to: clock.now))"
    )
    let fed = clock.now
    // Feed the file the way the microphone tap does: 4,096-frame buffers in the file's format.
    while file.framePosition < file.length {
      let frames = AVAudioFrameCount(min(4096, file.length - file.framePosition))
      guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frames)
      else { break }
      try file.read(into: buffer, frameCount: frames)
      transcriber.append(buffer)
    }
    let text = try await transcriber.finish()
    print("Transcribed in \(fed.duration(to: clock.now))\n\n\(text)\n")

    let comparison = try RecallComparison(segments: expected, recalled: text)
    let slipped = comparison.slippedSegments.map { passage[$0].number }
    print(
      "\(comparison.matchedCount) of \(comparison.expected.count) words matched · \(comparison.missingCount) missing · \(comparison.extraCount) extra"
    )
    print(slipped.isEmpty ? "No verse slipped" : "Slipped verses: \(slipped)")
    let missing = comparison.expected.filter { !$0.matched }.map(\.text)
    if !missing.isEmpty { print("Missing: \(missing.joined(separator: " "))") }
    let extra = comparison.recalled.filter { !$0.matched }.map(\.text)
    if !extra.isEmpty { print("Extra: \(extra.joined(separator: " "))") }
  }
}
