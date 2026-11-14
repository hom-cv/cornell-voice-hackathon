import SwiftUI
import AppKit

@main
struct HandoffApp: App {
    @StateObject private var store = WorkspaceStore()
    @StateObject private var voice = VoiceRecorder()
    var body: some Scene {
        WindowGroup {
            ContentView(store: store, voice: voice)
                .frame(minWidth: 760, minHeight: 520).tint(.teal)
                .onAppear {
                    NSApplication.shared.setActivationPolicy(.regular)
                    NSApplication.shared.activate(ignoringOtherApps: true)
                }
        }.defaultSize(width: 1040, height: 740)
    }
}

struct ContentView: View {
    @ObservedObject var store: WorkspaceStore
    @ObservedObject var voice: VoiceRecorder
    @State private var selectedID: UUID?
    @State private var search = ""
    @FocusState private var editorFocused: Bool
    private var selectedNote: InspectionNote? { store.workspace.notes.first { $0.id == selectedID } }

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Divider()
            if let note = selectedNote { editor(note) }
            else {
                VStack(spacing: 18) {
                    Image(systemName: "square.and.pencil").font(.system(size: 38)).foregroundStyle(.teal)
                    Text("Your shift starts with a note.").font(.title2.weight(.semibold))
                    Text("Capture an observation, work completed, or something to follow up.")
                        .foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("Create a note", action: addNote).buttonStyle(.borderedProminent)
                        .controlSize(.large).disabled(!store.canSave)
                }.padding(40).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color(nsColor: .textBackgroundColor))
        .onAppear { selectedID = store.workspace.notes.first?.id }
        .alert("Workspace notice", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK") { store.error = nil }
        } message: { Text(store.error ?? "") }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
            voice.stopForTermination()
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Handoff", systemImage: "airplane").font(.title2.bold())
                Spacer()
                Button(action: addNote) { Image(systemName: "square.and.pencil") }
                    .buttonStyle(.plain).help("New note (⌘N)").keyboardShortcut("n").disabled(!store.canSave)
            }
            TextField("Search notes", text: $search).textFieldStyle(.roundedBorder)
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(store.workspace.notes.filter { $0.matches(search) }) { note in
                        Button { selectedID = note.id } label: {
                            VStack(alignment: .leading, spacing: 7) {
                                Text(note.displayTitle).font(.headline).lineLimit(1)
                                Text(note.text.isEmpty ? "No text yet" : note.text.replacingOccurrences(of: "\n", with: " "))
                                    .font(.callout).foregroundStyle(.secondary).lineLimit(2)
                                if let date = note.updatedAt { Text(date, style: .date).font(.caption2).foregroundStyle(.secondary) }
                            }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                                .background(selectedID == note.id ? Color.teal.opacity(0.12) : Color.clear, in: RoundedRectangle(cornerRadius: 9))
                                .contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                    if !search.isEmpty && !store.workspace.notes.contains(where: { $0.matches(search) }) {
                        Text("No matching notes").foregroundStyle(.secondary).padding(.top, 20)
                    }
                }
            }
            if store.lastDeleted != nil { Button("Undo delete") { selectedID = store.restoreDeleted() } }
            Divider()
            Label(store.saveFailed ? "Changes not saved" : "Saved on this Mac", systemImage: store.saveFailed ? "exclamationmark.circle" : "internaldrive")
                .font(.caption).foregroundStyle(store.saveFailed ? Color.orange : Color.secondary)
            if store.saveFailed && store.canSave { Button("Retry save") { store.save() } }
        }.padding(18).frame(width: 235).background(Color(nsColor: .windowBackgroundColor))
    }

    private func editor(_ note: InspectionNote) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("NOTES").font(.caption.weight(.semibold)).tracking(1.5).foregroundStyle(.secondary)
                Spacer()
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(note.displayTitle + "\n\n" + note.text, forType: .string)
                } label: { Image(systemName: "doc.on.doc") }.help("Copy note")
                Button {
                    store.delete(note.id)
                    selectedID = store.workspace.notes.first?.id
                } label: { Image(systemName: "trash") }
                    .help("Delete note").disabled(voice.targetNoteID == note.id || !store.canSave)
            }.buttonStyle(.borderless)
            TextField("Note title", text: Binding(get: { store.workspace.notes.first { $0.id == note.id }?.title ?? "" }, set: { store.update(note.id, title: $0) }))
                .font(.system(size: 28, weight: .semibold)).textFieldStyle(.plain).disabled(!store.canSave)
            ZStack(alignment: .topLeading) {
                if note.text.isEmpty {
                    Text("Type a note, or record what you observed…")
                        .foregroundStyle(.tertiary).padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
                }
                TextEditor(text: Binding(get: { store.workspace.notes.first { $0.id == note.id }?.text ?? "" }, set: { store.update(note.id, text: $0) }))
                    .font(.system(size: 16)).lineSpacing(6).scrollContentBackground(.hidden)
                    .focused($editorFocused).disabled(!store.canSave).accessibilityLabel("Note text")
            }.frame(maxHeight: .infinity)
            Divider()
            voiceControls(note)
        }.padding(30).frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func voiceControls(_ note: InspectionNote) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                if voice.isRecording {
                    Button { Task { await voice.finish(store: store) } } label: {
                        Label("Stop & transcribe", systemImage: "stop.circle.fill")
                    }.buttonStyle(.borderedProminent).tint(.red)
                } else {
                    Button { Task { await voice.start(noteID: note.id) } } label: {
                        Label("Record note", systemImage: "mic.fill")
                    }.buttonStyle(.borderedProminent)
                        .disabled(voice.isBusy || voice.hasPendingAudio || !voice.isAvailable || !store.canSave)
                }
                if voice.isBusy && !voice.isRecording { ProgressView().controlSize(.small) }
                Text(voice.status).font(.caption).foregroundStyle(.secondary)
                Spacer()
            }
            if let target = voice.targetNoteID, target != note.id,
               let targetNote = store.workspace.notes.first(where: { $0.id == target }) {
                Text("Recording belongs to: \(targetNote.displayTitle)").font(.caption).foregroundStyle(.secondary)
            }
            if let error = voice.error { Text(error).font(.caption).foregroundStyle(.orange).textSelection(.enabled) }
            if voice.hasPendingAudio && !voice.isBusy {
                HStack {
                    Button("Retry transcription") { Task { await voice.finish(store: store) } }
                    Button("Discard recording", role: .destructive) { voice.discard() }
                }
            }
        }
    }

    private func addNote() {
        search = ""
        selectedID = store.addNote()
        editorFocused = true
    }
}
