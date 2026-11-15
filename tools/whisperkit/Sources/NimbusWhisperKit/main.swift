import Foundation
import Darwin
import WhisperKit

private struct Transcript: Encodable { let text: String }
private struct WorkerRequest: Decodable { let id: String; let audio: String }
private struct WorkerResponse: Encodable { let id: String; let text: String?; let error: String? }
private struct BridgeFailure: Error { let message: String }

// Any unexpected SDK network fallback must fail instead of downloading assets.
private final class OfflineOnlyURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        ["http", "https"].contains(request.url?.scheme?.lowercased() ?? "")
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    }
    override func stopLoading() {}
}

@main
struct NimbusWhisperKit {
    static func main() async {
        // Preserve a dedicated output descriptor so library prints cannot corrupt JSON.
        let output = FileHandle(fileDescriptor: dup(STDOUT_FILENO), closeOnDealloc: true)
        dup2(STDERR_FILENO, STDOUT_FILENO)
        do {
            var values: [String: String] = [:]
            var arguments = Array(CommandLine.arguments.dropFirst())
            let serving = arguments.contains("--serve")
            arguments.removeAll { $0 == "--serve" }
            if arguments == ["--help"] {
                output.write(Data("Usage: nimbus-whisperkit [--serve | --audio FILE] --model-folder DIR --tokenizer-folder DIR\n".utf8))
                return
            }
            guard arguments.count.isMultiple(of: 2) else {
                throw BridgeFailure(message: "Arguments must be named --audio, --model-folder, and --tokenizer-folder.")
            }
            for index in stride(from: 0, to: arguments.count, by: 2) {
                guard ["--audio", "--model-folder", "--tokenizer-folder"].contains(arguments[index]) else {
                    throw BridgeFailure(message: "Unknown argument. Use --help for usage.")
                }
                values[arguments[index]] = arguments[index + 1]
            }
            let environment = ProcessInfo.processInfo.environment
            guard let model = values["--model-folder"] ?? environment["WHISPERKIT_MODEL_FOLDER"],
                  let tokenizer = values["--tokenizer-folder"] ?? environment["WHISPERKIT_TOKENIZER_FOLDER"] else {
                throw BridgeFailure(message: "Provide audio, model folder, and tokenizer folder.")
            }
            let audio = values["--audio"]
            guard serving || audio != nil else {
                throw BridgeFailure(message: "Provide --serve or --audio FILE.")
            }
            let manager = FileManager.default
            for file in [
                         "\(model)/AudioEncoder.mlmodelc/coremldata.bin",
                         "\(model)/MelSpectrogram.mlmodelc/coremldata.bin",
                         "\(model)/TextDecoder.mlmodelc/coremldata.bin",
                         "\(tokenizer)/tokenizer.json", "\(tokenizer)/tokenizer_config.json", "\(tokenizer)/config.json"] {
                guard manager.isReadableFile(atPath: file) else {
                    throw BridgeFailure(message: "An audio or local model/tokenizer file is missing or unreadable.")
                }
            }
            for name in ["tokenizer.json", "tokenizer_config.json", "config.json"] {
                let data = try Data(contentsOf: URL(fileURLWithPath: "\(tokenizer)/\(name)"))
                guard (try JSONSerialization.jsonObject(with: data)) is [String: Any] else {
                    throw BridgeFailure(message: "Local tokenizer configuration is invalid.")
                }
            }
            URLProtocol.registerClass(OfflineOnlyURLProtocol.self)
            let compute: ModelComputeOptions? = environment["WHISPERKIT_COMPUTE_UNITS"] == "cpu"
                ? ModelComputeOptions(melCompute: .cpuOnly, audioEncoderCompute: .cpuOnly,
                                      textDecoderCompute: .cpuOnly, prefillCompute: .cpuOnly)
                : nil
            let config = WhisperKitConfig(
                modelFolder: model,
                tokenizerFolder: URL(fileURLWithPath: tokenizer),
                computeOptions: compute,
                verbose: false,
                logLevel: .error,
                prewarm: false,
                load: true,
                download: false
            )
            let whisper = try await WhisperKit(config)
            let options = DecodingOptions(
                verbose: false, language: "en", temperature: 0,
                temperatureFallbackCount: 0, skipSpecialTokens: true,
                withoutTimestamps: true
            )
            if serving {
                output.write(Data("{\"ready\":true}\n".utf8))
                // One loaded model, sequential JSON-lines requests over private pipes.
                // EOF closes the worker when the parent backend exits.
                while let line = readLine() {
                    let request = try JSONDecoder().decode(WorkerRequest.self, from: Data(line.utf8))
                    let response: WorkerResponse
                    do {
                        let results = try await whisper.transcribe(audioPath: request.audio, decodeOptions: options)
                        let text = results.map(\.text).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
                        response = WorkerResponse(id: request.id, text: text, error: nil)
                    } catch {
                        response = WorkerResponse(id: request.id, text: nil, error: "Transcription failed. Try another recording.")
                    }
                    output.write(try JSONEncoder().encode(response))
                    output.write(Data("\n".utf8))
                }
            } else if let audio {
                let results = try await whisper.transcribe(audioPath: audio, decodeOptions: options)
                let text = results.map(\.text).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
                output.write(try JSONEncoder().encode(Transcript(text: text)))
                output.write(Data("\n".utf8))
            }
        } catch let failure as BridgeFailure {
            FileHandle.standardError.write(Data("WhisperKit: \(failure.message)\n".utf8))
            exit(1)
        } catch {
            FileHandle.standardError.write(Data("WhisperKit transcription failed: \(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
}
