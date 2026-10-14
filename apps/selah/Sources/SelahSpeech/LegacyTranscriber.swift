@preconcurrency import AVFoundation
import Foundation
@preconcurrency import Speech

/// The pre-SpeechAnalyzer recognizer, kept for Macs where neither Apple model is offered.
/// It needs Speech Recognition permission and stays on device.
public final class LegacyTranscriber: RecallTranscriber, @unchecked Sendable {
  private let request = SFSpeechAudioBufferRecognitionRequest()
  private var task: SFSpeechRecognitionTask?
  private let lock = NSLock()
  private var latest = ""
  private var ended: CheckedContinuation<String, Never>?
  private var done = false

  public enum Failure: LocalizedError {
    case denied, unavailable
    public var errorDescription: String? {
      switch self {
      case .denied:
        "Allow Speech Recognition for Selah in System Settings → Privacy & Security."
      case .unavailable:
        "On-device English dictation is unavailable on this Mac. You can still type your recall."
      }
    }
  }

  public static func start(update: @escaping @Sendable (String) -> Void) async throws
    -> LegacyTranscriber
  {
    let status = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
    }
    guard status == .authorized else { throw Failure.denied }
    guard let recognizer = SFSpeechRecognizer(locale: AppleModels.english),
      recognizer.isAvailable, recognizer.supportsOnDeviceRecognition
    else { throw Failure.unavailable }
    let transcriber = LegacyTranscriber()
    transcriber.request.requiresOnDeviceRecognition = true
    transcriber.request.shouldReportPartialResults = true
    transcriber.task = recognizer.recognitionTask(with: transcriber.request) {
      [transcriber] result, error in
      if let text = result?.bestTranscription.formattedString {
        transcriber.record(text)
        update(text)
      }
      if result?.isFinal == true || error != nil { transcriber.end() }
    }
    return transcriber
  }

  private func record(_ text: String) {
    lock.withLock { latest = text }
  }
  private func end() {
    let waiter: CheckedContinuation<String, Never>? = lock.withLock {
      done = true
      defer { ended = nil }
      return ended
    }
    waiter?.resume(returning: lock.withLock { latest })
  }

  public func append(_ buffer: AVAudioPCMBuffer) { request.append(buffer) }

  public func finish() async throws -> String {
    request.endAudio()
    return await withCheckedContinuation { continuation in
      let finished: Bool = lock.withLock {
        if done { return true }
        ended = continuation
        return false
      }
      if finished { continuation.resume(returning: lock.withLock { latest }) }
    }
  }

  public func cancel() async {
    task?.cancel()
    end()
  }
}
