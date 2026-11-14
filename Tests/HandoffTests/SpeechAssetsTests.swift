import Foundation

final class AssetProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var requests: [URLRequest] = []
    nonisolated(unsafe) static var listingStatus = 200
    nonisolated(unsafe) static var failDownload = false
    private static let lock = NSLock()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        Self.requests.append(request)
        let listingStatus = Self.listingStatus
        let failDownload = Self.failDownload
        Self.lock.unlock()
        let url = request.url!
        let isListing = url.path.hasPrefix("/api/")
        var data = Data("fixture contents".utf8)
        if isListing {
            let paths = url.path.contains("argmaxinc") ? [
                "openai_whisper-base.en/AudioEncoder.mlmodelc/weights.bin",
                "openai_whisper-base.en/MelSpectrogram.mlmodelc/weights.bin",
                "openai_whisper-base.en/TextDecoder.mlmodelc/weights.bin",
                "openai_whisper-large-v3/weights.bin"
            ] : ["tokenizer.json", "tokenizer_config.json", "pytorch_model.bin"]
            data = try! JSONSerialization.data(withJSONObject: ["sha": "abcdef1234", "siblings": paths.map { ["rfilename": $0] }])
        }
        let code = isListing ? listingStatus : (failDownload ? 403 : 200)
        let response = HTTPURLResponse(url: url, statusCode: code, httpVersion: "HTTP/1.1", headerFields: ["Content-Length": String(data.count)])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main
struct SpeechAssetsTests {
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AssetProtocol.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        let assets = SpeechAssets(root: root, session: session)
        let locations = try await assets.prepare()
        precondition(AssetProtocol.requests.count == 7, "Only selected model + tokenizer files should download")
        precondition(AssetProtocol.requests.allSatisfy { $0.value(forHTTPHeaderField: "Authorization") == nil }, "Public downloads must not carry credentials")
        precondition(FileManager.default.fileExists(atPath: locations.tokenizer.appendingPathComponent("tokenizer.json").path))
        _ = try await assets.prepare()
        precondition(AssetProtocol.requests.count == 7, "Complete assets must work without network requests")
        let modelFile = locations.model.appendingPathComponent("AudioEncoder.mlmodelc/weights.bin")
        try FileManager.default.removeItem(at: modelFile)
        _ = try await assets.prepare()
        precondition(FileManager.default.fileExists(atPath: modelFile.path), "Missing cached file must be repaired")
        precondition(AssetProtocol.requests.count == 11)
        print("Passed anonymous downloads, model filtering, offline cache, and missing-file recovery.")

        AssetProtocol.listingStatus = 401
        do {
            _ = try await SpeechAssets(root: root.appendingPathComponent("denied"), session: session).prepare()
            preconditionFailure("HTTP 401 must surface as a download error")
        } catch {
            precondition(error.localizedDescription.contains("HTTP 401"))
            precondition(!error.localizedDescription.contains("Model not found"))
        }
        AssetProtocol.listingStatus = 200
        AssetProtocol.failDownload = true
        let partial = root.appendingPathComponent("partial")
        do {
            _ = try await SpeechAssets(root: partial, session: session).prepare()
            preconditionFailure("Failed file must not be marked complete")
        } catch {
            precondition(error.localizedDescription.contains("HTTP 403"))
            precondition(!FileManager.default.fileExists(atPath: partial.appendingPathComponent(SpeechAssets.modelVariant + "/.complete.json").path))
        }
        precondition(!SpeechAssets.isSafePath("../escape"))
        precondition(!SpeechAssets.isSafePath("/absolute"))
        precondition(!SpeechAssets.isSafePath("folder//file"))
        precondition(SpeechAssets.isSafePath("AudioEncoder.mlmodelc/weights.bin"))
        print("Passed authorization-error reporting, incomplete-cache, and path validation checks.")
    }
}
