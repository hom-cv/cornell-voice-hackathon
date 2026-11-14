import Foundation

/// Downloads only public speech assets. Never reads account tokens or sends Authorization.
struct SpeechAssets {
    static let modelRepository = "argmaxinc/whisperkit-coreml"
    static let modelVariant = "openai_whisper-base.en"
    static let tokenizerRepository = "openai/whisper-base.en"
    let root: URL
    let session: URLSession

    init(root: URL? = nil, session: URLSession? = nil) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("InspectionHandoff/SpeechAssets")
        if let session { self.session = session }
        else {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil
            configuration.urlCredentialStorage = nil
            configuration.timeoutIntervalForRequest = 60
            configuration.timeoutIntervalForResource = 1800
            self.session = URLSession(configuration: configuration)
        }
    }

    struct Locations { let model: URL; let tokenizer: URL }
    private struct Repository: Decodable {
        let sha: String
        let siblings: [Entry]
        struct Entry: Decodable { let rfilename: String }
    }
    private struct CachedFile: Codable { let path: String; let size: Int }

    func prepare() async throws -> Locations {
        let model = root.appendingPathComponent(Self.modelVariant)
        let tokenizer = root.appendingPathComponent("tokenizer-base.en")
        try await prepareRepository(Self.modelRepository, prefix: Self.modelVariant + "/", destination: model,
                                    required: ["AudioEncoder.mlmodelc/", "MelSpectrogram.mlmodelc/", "TextDecoder.mlmodelc/"])
        try await prepareRepository(Self.tokenizerRepository, prefix: "", destination: tokenizer,
                                    required: ["tokenizer.json", "tokenizer_config.json"],
                                    include: ["tokenizer.json", "tokenizer_config.json", "config.json", "special_tokens_map.json", "added_tokens.json", "vocab.json", "merges.txt"])
        return Locations(model: model, tokenizer: tokenizer)
    }

    private func prepareRepository(_ repo: String, prefix: String, destination: URL,
                                   required: [String], include: Set<String>? = nil) async throws {
        let marker = destination.appendingPathComponent(".complete.json")
        if let data = try? Data(contentsOf: marker),
           let cached = try? JSONDecoder().decode([CachedFile].self, from: data), !cached.isEmpty,
           required.allSatisfy({ requiredPath in cached.contains { $0.path.hasPrefix(requiredPath) } }),
           cached.allSatisfy({ file in
               guard Self.isSafePath(file.path), file.size > 0,
                     let attributes = try? FileManager.default.attributesOfItem(atPath: destination.appendingPathComponent(file.path).path),
                     let size = attributes[.size] as? NSNumber else { return false }
               return size.intValue == file.size
           }) { return }

        let listingURL = URL(string: "https://huggingface.co/api/models/\(repo)")!
        let (data, response) = try await session.data(from: listingURL)
        try Self.validate(response)
        let repository = try JSONDecoder().decode(Repository.self, from: data)
        guard !repository.sha.isEmpty, repository.sha.allSatisfy(\.isHexDigit) else {
            throw AssetError.invalidManifest
        }
        let files = repository.siblings.map(\.rfilename).filter {
            $0.hasPrefix(prefix) && (include == nil || include!.contains($0))
        }
        let relativePaths = files.map { String($0.dropFirst(prefix.count)) }
        guard !files.isEmpty, relativePaths.allSatisfy(Self.isSafePath),
              required.allSatisfy({ requiredPath in relativePaths.contains { $0.hasPrefix(requiredPath) } }) else {
            throw AssetError.invalidManifest
        }
        var completed: [CachedFile] = []
        for (path, relativePath) in zip(files, relativePaths) {
            let url = URL(string: "https://huggingface.co")!
                .appendingPathComponent(repo).appendingPathComponent("resolve")
                .appendingPathComponent(repository.sha).appendingPathComponent(path)
            let (temporary, response) = try await session.download(from: url)
            defer { try? FileManager.default.removeItem(at: temporary) }
            try Self.validate(response)
            let attributes = try FileManager.default.attributesOfItem(atPath: temporary.path)
            guard let size = attributes[.size] as? NSNumber, size.intValue > 0 else { throw AssetError.invalidManifest }
            let target = destination.appendingPathComponent(relativePath)
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: target.path) {
                _ = try FileManager.default.replaceItemAt(target, withItemAt: temporary)
            } else { try FileManager.default.moveItem(at: temporary, to: target) }
            completed.append(CachedFile(path: relativePath, size: size.intValue))
        }
        try JSONEncoder().encode(completed).write(to: marker, options: .atomic)
    }

    static func isSafePath(_ path: String) -> Bool {
        !path.isEmpty && !path.hasPrefix("/") && !path.split(separator: "/", omittingEmptySubsequences: false)
            .contains(where: { $0 == ".." || $0 == "." || $0.isEmpty })
    }

    static func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw AssetError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw AssetError.http(http.statusCode) }
    }

    enum AssetError: LocalizedError {
        case http(Int), invalidManifest, invalidResponse
        var errorDescription: String? {
            switch self {
            case .http(let code):
                return "Speech model download failed: Hugging Face returned HTTP \(code). These public assets are requested without an API key. Check your connection or network filtering, then retry."
            case .invalidManifest: return "The speech model download is incomplete or has an unexpected file list. Retry the download."
            case .invalidResponse: return "The speech model server returned an invalid response. Check your connection and retry."
            }
        }
    }
}
