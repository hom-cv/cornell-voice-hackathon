import SwiftUI
import AVFoundation
#if canImport(WhisperKit) && !HANDOFF_TEXT_ONLY
@preconcurrency import WhisperKit

private actor SpeechTranscriber {
    private var pipeline: WhisperKit?
    func transcribe(_ url: URL) async throws -> String {
        if pipeline == nil {
            let assets = try await SpeechAssets().prepare()
            pipeline = try await WhisperKit(WhisperKitConfig(
                modelFolder: assets.model.path,
                tokenizerFolder: assets.tokenizer,
                verbose: false,
                load: true,
                download: false
            ))
        }
        guard let pipeline else { throw VoiceError.unavailable }
        let results: [TranscriptionResult] = try await pipeline.transcribe(audioPath: url.path)
        return results.map(\.text).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
#endif

private enum VoiceError: LocalizedError {
    case unavailable, microphone, recording, empty, missingNote
    var errorDescription: String? {
        switch self {
        case .unavailable: "Voice is unavailable in this text-only build."
        case .microphone: "Microphone access is off. Enable Handoff in System Settings → Privacy & Security → Microphone."
        case .recording: "Could not start recording. Check that a microphone is connected."
        case .empty: "No speech was transcribed. You can retry or discard this recording."
        case .missingNote: "The original note is unavailable. Your recording has been kept for retry."
        }
    }
}

@MainActor
final class VoiceRecorder: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var isBusy = false
    @Published private(set) var hasPendingAudio = false
    @Published private(set) var targetNoteID: UUID?
    @Published private(set) var status = "Record, then stop to add text."
    @Published private(set) var error: String?
    private var recorder: AVAudioRecorder?
    private var audioURL: URL?
    #if canImport(WhisperKit) && !HANDOFF_TEXT_ONLY
    private let transcriber = SpeechTranscriber()
    let isAvailable = true
    #else
    let isAvailable = false
    #endif

    init() {
        if !isAvailable { status = "Voice unavailable in this text-only build." }
    }

    func start(noteID: UUID) async {
        guard isAvailable, !isBusy, !hasPendingAudio else { return }
        isBusy = true
        targetNoteID = noteID
        error = nil
        status = "Requesting microphone…"
        do {
            guard await AVCaptureDevice.requestAccess(for: .audio) else { throw VoiceError.microphone }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("handoff-\(UUID()).wav")
            let recording = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 16000.0,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false
            ])
            guard recording.prepareToRecord(), recording.record() else {
                try? FileManager.default.removeItem(at: url)
                throw VoiceError.recording
            }
            recorder = recording
            audioURL = url
            hasPendingAudio = true
            isRecording = true
            status = "Recording…"
        } catch {
            self.error = error.localizedDescription
            status = "Recording did not start."
            targetNoteID = nil
            isBusy = false
        }
    }

    func finish(store: WorkspaceStore) async {
        guard isRecording || (!isBusy && hasPendingAudio) else { return }
        recorder?.stop()
        recorder = nil
        isRecording = false
        isBusy = true
        status = "Transcribing… First use downloads the speech model."
        error = nil
        defer { isBusy = false }
        do {
            guard let audioURL, let targetNoteID else { throw VoiceError.recording }
            #if canImport(WhisperKit) && !HANDOFF_TEXT_ONLY
            let text = try await transcriber.transcribe(audioURL)
            guard !text.isEmpty else { throw VoiceError.empty }
            guard store.appendTranscript(text, to: targetNoteID) else { throw VoiceError.missingNote }
            clearAudio()
            status = store.saveFailed ? "Text added. Retry saving your note." : "Text added. Review and edit it as needed."
            #else
            throw VoiceError.unavailable
            #endif
        } catch {
            self.error = error.localizedDescription
            status = "Transcription failed. Recording kept for retry."
        }
    }

    func discard() {
        guard !isBusy else { return }
        clearAudio()
        error = nil
        status = "Record, then stop to add text."
    }

    private func clearAudio() {
        if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
        audioURL = nil
        targetNoteID = nil
        hasPendingAudio = false
    }

    func stopForTermination() {
        recorder?.stop()
        // Temporary recordings are intentionally not deleted on exit; never delete untranscribed audio.
    }
}
