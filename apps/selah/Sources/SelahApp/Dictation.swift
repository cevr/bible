@preconcurrency import AVFoundation
@preconcurrency import Speech
import SwiftUI

// Audio tap callbacks run off the main actor. Speech accepts concurrent buffer appends.
private final class AudioSink: @unchecked Sendable {
  let request: SFSpeechAudioBufferRecognitionRequest
  init(_ request: SFSpeechAudioBufferRecognitionRequest) { self.request = request }
  func append(_ buffer: AVAudioPCMBuffer) { request.append(buffer) }
}

@MainActor @Observable
final class Dictation {
  private(set) var active = false
  private(set) var message: String?
  private var generation = UUID()
  private var engine: AVAudioEngine?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var recognition: SFSpeechRecognitionTask?
  private var permission: Task<Void, Never>?

  func start(update: @escaping @MainActor (String) -> Void) {
    stop()
    let token = generation
    active = true
    message = "Preparing dictation…"
    permission = Task { [self] in
      let speech = await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
      }
      guard generation == token, !Task.isCancelled else { return }
      guard speech == .authorized else {
        stop()
        message = "Allow Speech Recognition for Selah in System Settings → Privacy & Security."
        return
      }
      let microphone = await AVCaptureDevice.requestAccess(for: .audio)
      guard generation == token, !Task.isCancelled else { return }
      guard microphone else {
        stop()
        message = "Allow Microphone access for Selah in System Settings → Privacy & Security."
        return
      }
      guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
        recognizer.isAvailable, recognizer.supportsOnDeviceRecognition
      else {
        stop()
        message =
          "On-device English dictation is unavailable on this Mac. You can still type your recall."
        return
      }
      do {
        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        let sink = AudioSink(request)
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
          throw CocoaError(.featureUnsupported)
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
          sink.append(buffer)
        }
        self.engine = engine
        self.request = request
        recognition = recognizer.recognitionTask(with: request) { [weak self] result, error in
          let text = result?.bestTranscription.formattedString
          let finished = result?.isFinal == true
          let failure = error?.localizedDescription
          Task { @MainActor in
            guard let self, self.generation == token else { return }
            if let text { update(text) }
            if finished || failure != nil {
              self.stop()
              self.message = failure.map { "Dictation stopped: \($0)" }
            }
          }
        }
        engine.prepare()
        try engine.start()
        message = "Listening on this Mac… Stop before checking your recall."
      } catch {
        stop()
        message = "Could not start dictation: \(error.localizedDescription)"
      }
    }
  }

  func stop() {
    generation = UUID()
    permission?.cancel()
    permission = nil
    engine?.stop()
    engine?.inputNode.removeTap(onBus: 0)
    engine = nil
    request?.endAudio()
    recognition?.cancel()
    recognition = nil
    request = nil
    active = false
    message = nil
  }
}
