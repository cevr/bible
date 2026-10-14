@preconcurrency import AVFoundation
import Foundation
import SelahCore

/// One spoken recall: audio in, text out.
///
/// The microphone and a recorded file both feed `append`, so a test take runs through
/// exactly the code a live take does. A model that only transcribes after the take
/// (a downloaded local model, say) conforms the same way: it buffers in `append` and
/// does its work in `finish`.
public protocol RecallTranscriber: AnyObject, Sendable {
  /// Called from the audio thread with buffers in any PCM format.
  func append(_ buffer: AVAudioPCMBuffer)
  /// Ends the take and returns the final transcript.
  func finish() async throws -> String
  /// Ends the take and discards it.
  func cancel() async
}

/// Words that help a speech model hear the passage as printed: archaic forms, names, and
/// the LORD. Common words need no help and would crowd out the ones that do.
public func contextualWords(for passage: [String], limit: Int = 100) -> [String] {
  let archaic: Set<String> = [
    "thee", "thou", "thy", "thine", "ye", "hath", "doth", "art", "unto", "shalt", "wilt",
    "hast", "dost", "saith", "lo", "behold", "verily", "yea", "nay", "wherefore", "whence",
    "thither", "hither", "whither", "henceforth", "LORD",
  ]
  var seen = Set<String>()
  var words: [String] = []
  for verse in passage {
    for raw in verse.split(whereSeparator: { $0.isWhitespace }) {
      let word = raw.trimmingCharacters(in: .punctuationCharacters)
      guard word.count > 1, seen.insert(word.lowercased()).inserted else { continue }
      let lower = word.lowercased()
      let isName = word.first?.isUppercase == true && word != "I" && word != word.uppercased()
      if archaic.contains(word) || archaic.contains(lower) || lower.hasSuffix("eth")
        || lower.hasSuffix("est") || isName || word == "LORD"
      {
        words.append(word)
      }
    }
  }
  return Array(words.prefix(limit))
}

/// Joins finalized segments and the current volatile guess into one transcript.
struct Transcript: Sendable {
  private(set) var finalized: [String] = []
  var volatile = ""
  mutating func finalize(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { finalized.append(trimmed) }
    volatile = ""
  }
  var text: String {
    (finalized + [volatile.trimmingCharacters(in: .whitespacesAndNewlines)])
      .filter { !$0.isEmpty }.joined(separator: " ")
  }
}

/// Converts buffers from whatever the source delivers into the format a model asks for,
/// keeping converter state across buffers so a stream resamples without seams.
final class StreamConverter: @unchecked Sendable {
  let format: AVAudioFormat
  private var converter: AVAudioConverter?
  private let lock = NSLock()
  init(to format: AVAudioFormat) { self.format = format }

  func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    lock.lock()
    defer { lock.unlock() }
    if buffer.format == format { return buffer }
    if converter?.inputFormat != buffer.format {
      converter = AVAudioConverter(from: buffer.format, to: format)
    }
    guard let converter else { return nil }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1024
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      return nil
    }
    nonisolated(unsafe) var supplied = false
    var error: NSError?
    let status = converter.convert(to: output, error: &error) { _, inputStatus in
      if supplied {
        inputStatus.pointee = .noDataNow
        return nil
      }
      supplied = true
      inputStatus.pointee = .haveData
      return buffer
    }
    guard status != .error, output.frameLength > 0 else { return nil }
    return output
  }
}

/// Starts the chosen model, falling back to Apple's models and then to the legacy recognizer
/// when a model is not offered or not downloaded on this Mac. Returns what is actually
/// listening. A downloaded model hears the whole take and transcribes it when the take ends.
public func startTranscriber(
  model: DictationModel, context: [String], models directory: URL,
  update: @escaping @Sendable (String) -> Void
) async throws -> (transcriber: any RecallTranscriber, model: DictationModel?) {
  if model.isLocal, let engine = LocalModels.engine,
    await engine.state(of: model, in: directory) == .installed
  {
    return (try await engine.start(model, in: directory), model)
  }
  let apple = DictationModel.allCases.filter { !$0.isLocal }
  for candidate in (apple.contains(model) ? [model] : []) + apple.filter({ $0 != model }) {
    do {
      let transcriber = try await AppleTranscriber.start(
        model: candidate, context: context, update: update)
      return (transcriber, candidate)
    } catch SpeechError.unsupported {
      continue
    }
  }
  return (try await LegacyTranscriber.start(update: update), nil)
}
