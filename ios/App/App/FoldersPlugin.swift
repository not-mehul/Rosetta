import Capacitor
import UIKit
import UniformTypeIdentifiers

/// The bridge with Rosetta's own plugins registered (SceneDelegate uses it).
class RosettaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FoldersPlugin())
    }
}

/// Folders the reader chooses with the document picker, for the sync file and
/// the weekly backups (src/platform/folders.ts). Rosetta's own Documents folder
/// shows in Files as On My iPhone › Rosetta, but iCloud Drive and other sync
/// apps can't be pointed at it; a folder chosen here can be anywhere Files
/// reaches, iCloud Drive included. Each folder is kept under a key ("sync" or
/// "backup") as a bookmark, and files are read and written through a file
/// coordinator, so iCloud brings a file down before it is read.
@objc(FoldersPlugin)
public class FoldersPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "FoldersPlugin"
    public let jsName = "Folders"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "walk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readBytes", returnType: CAPPluginReturnPromise),
    ]

    private var picking: (call: CAPPluginCall, key: String)?

    private func key(_ call: CAPPluginCall) -> String? {
        let key = call.getString("key") ?? "sync"
        return key == "sync" || key == "backup" || key == "import" ? key : nil
    }

    private func defaultsKey(_ key: String) -> String { "rosetta.folder.\(key)" }

    /// The folder kept for a key, refreshing its bookmark when the system says it went stale.
    private func folder(_ key: String) -> URL? {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey(key)) else { return nil }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        if stale, url.startAccessingSecurityScopedResource() {
            defer { url.stopAccessingSecurityScopedResource() }
            if let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
                UserDefaults.standard.set(fresh, forKey: defaultsKey(key))
            }
        }
        return url
    }

    /// Runs `body` with access to the call's folder, or rejects the call.
    private func withFolder(_ call: CAPPluginCall, _ body: (URL) throws -> Void) {
        guard let key = key(call) else { return call.reject("Unknown folder") }
        guard let url = folder(key) else { return call.reject("No folder chosen", "NO_FOLDER") }
        let granted = url.startAccessingSecurityScopedResource()
        defer { if granted { url.stopAccessingSecurityScopedResource() } }
        do {
            try body(url)
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    private func coordinated(reading url: URL, _ body: (URL) throws -> Void) throws {
        var outer: NSError?
        var inner: Error?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &outer) { u in
            do { try body(u) } catch { inner = error }
        }
        if let e = outer ?? inner { throw e }
    }

    private func coordinated(writing url: URL, options: NSFileCoordinator.WritingOptions, _ body: (URL) throws -> Void) throws {
        var outer: NSError?
        var inner: Error?
        NSFileCoordinator().coordinate(writingItemAt: url, options: options, error: &outer) { u in
            do { try body(u) } catch { inner = error }
        }
        if let e = outer ?? inner { throw e }
    }

    @objc func status(_ call: CAPPluginCall) {
        guard let key = key(call) else { return call.reject("Unknown folder") }
        if let url = folder(key) {
            call.resolve(["chosen": true, "name": url.lastPathComponent])
        } else {
            call.resolve(["chosen": false])
        }
    }

    @objc func pick(_ call: CAPPluginCall) {
        guard let key = key(call) else { return call.reject("Unknown folder") }
        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
            picker.delegate = self
            picker.allowsMultipleSelection = false
            self.picking = (call, key)
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let pending = picking else { return }
        picking = nil
        let call = pending.call
        let key = pending.key
        guard let url = urls.first else { return call.reject("cancelled", "CANCELLED") }
        let granted = url.startAccessingSecurityScopedResource()
        defer { if granted { url.stopAccessingSecurityScopedResource() } }
        do {
            let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(bookmark, forKey: defaultsKey(key))
            call.resolve(["chosen": true, "name": url.lastPathComponent])
        } catch {
            call.reject("That folder can't be kept: \(error.localizedDescription)")
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        picking?.call.reject("cancelled", "CANCELLED")
        picking = nil
    }

    @objc func forget(_ call: CAPPluginCall) {
        guard let key = key(call) else { return call.reject("Unknown folder") }
        UserDefaults.standard.removeObject(forKey: defaultsKey(key))
        call.resolve()
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { return call.reject("No file named") }
        withFolder(call) { dir in
            let file = dir.appendingPathComponent(name)
            // A file iCloud hasn't brought down yet shows only as a placeholder; ask for it.
            try? FileManager.default.startDownloadingUbiquitousItem(at: file)
            var text: String?
            try coordinated(reading: file) { u in
                if FileManager.default.fileExists(atPath: u.path) {
                    let bytes = try Data(contentsOf: u)
                    text = String(decoding: bytes, as: UTF8.self)
                }
            }
            if let text = text {
                call.resolve(["data": text])
            } else {
                call.resolve(["data": NSNull()])
            }
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let data = call.getString("data") else { return call.reject("Nothing to write") }
        withFolder(call) { dir in
            try coordinated(writing: dir.appendingPathComponent(name), options: .forReplacing) { u in
                try Data(data.utf8).write(to: u, options: .atomic)
            }
            call.resolve()
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        withFolder(call) { dir in
            let names = try FileManager.default.contentsOfDirectory(atPath: dir.path)
            call.resolve(["names": names])
        }
    }

    /// Every file under the folder, as paths inside it ("Author/Book/book.epub"), up to 5,000.
    @objc func walk(_ call: CAPPluginCall) {
        withFolder(call) { dir in
            var paths: [String] = []
            let root = dir.standardizedFileURL.path
            let keys: [URLResourceKey] = [.isDirectoryKey]
            if let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) {
                for case let url as URL in walker {
                    if paths.count >= 5000 { break }
                    let isDir = (try? url.resourceValues(forKeys: Set(keys)).isDirectory) ?? false
                    if isDir { continue }
                    var path = url.standardizedFileURL.path
                    if path.hasPrefix(root) { path = String(path.dropFirst(root.count)) }
                    while path.hasPrefix("/") { path.removeFirst() }
                    paths.append(path)
                }
            }
            call.resolve(["paths": paths])
        }
    }

    /// A file's bytes, as base64, by its path inside the folder.
    @objc func readBytes(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { return call.reject("No file named") }
        withFolder(call) { dir in
            let file = dir.appendingPathComponent(path)
            try? FileManager.default.startDownloadingUbiquitousItem(at: file)
            var data = Data()
            try coordinated(reading: file) { u in
                data = try Data(contentsOf: u)
            }
            call.resolve(["data": data.base64EncodedString()])
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { return call.reject("No file named") }
        withFolder(call) { dir in
            let file = dir.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: file.path) {
                try coordinated(writing: file, options: .forDeleting) { u in
                    try FileManager.default.removeItem(at: u)
                }
            }
            call.resolve()
        }
    }
}
