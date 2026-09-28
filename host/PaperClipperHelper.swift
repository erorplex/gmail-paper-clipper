// Paper Clipper helper for macOS.
// Chrome starts it via native messaging (4-byte little-endian length + UTF-8 JSON on stdin/stdout).
// It writes the files it receives to ~/Library/Caches/PaperClipper and puts the mail text plus those
// files on the general pasteboard, so Cmd+V pastes real attachments (Finder, Claude, Slack, ...).
// Files are quarantined like browser downloads, so Gatekeeper checks them before they are opened.
//
// Protocol, one reply per message:
//   {"type":"ping"}                                 -> {"ok":true,"version":"..."}
//   {"type":"begin"}                                -> starts a new copy, drops copies older than 1 h
//   {"type":"file","name":"a.pdf","data":"<base64>"} -> stores one file
//   {"type":"commit","text":"..."}                  -> writes text + files to the pasteboard

import AppKit
import CoreServices
import Foundation

let version = "0.1.0"
let cacheRoot = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("PaperClipper", isDirectory: true)

struct HelperError: Error, CustomStringConvertible {
    let description: String
}

enum Incoming {
    case message([String: Any])
    case invalid
}

// nil means Chrome closed the pipe. Invalid JSON (e.g. an escaped lone surrogate, which Foundation
// rejects) gets an error reply instead of silently ending the helper.
func readMessage() -> Incoming? {
    let input = FileHandle.standardInput
    let header = [UInt8](input.readData(ofLength: 4))
    guard header.count == 4 else { return nil }
    let length = Int(header[0]) | Int(header[1]) << 8 | Int(header[2]) << 16 | Int(header[3]) << 24
    var data = Data(capacity: length)
    while data.count < length {
        let chunk = input.readData(ofLength: length - data.count)
        if chunk.isEmpty { return nil }
        data.append(chunk)
    }
    guard let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return .invalid }
    return .message(message)
}

func send(_ message: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: message) else { return }
    let length = UInt32(data.count)
    let header = Data([UInt8(length & 0xff), UInt8(length >> 8 & 0xff), UInt8(length >> 16 & 0xff), UInt8(length >> 24 & 0xff)])
    FileHandle.standardOutput.write(header + data)
}

// Bidi controls could disguise "invoice\u{202E}fdp.exe" as "invoiceexe.pdf".
let hiddenScalars: [ClosedRange<UInt32>] = [0x00...0x1F, 0x7F...0x9F, 0x200E...0x200F, 0x202A...0x202E, 0x2066...0x2069, 0x061C...0x061C]

func safeName(_ name: String) -> String {
    var scalars = String.UnicodeScalarView()
    scalars.append(contentsOf: name.unicodeScalars.filter { s in !hiddenScalars.contains { $0.contains(s.value) } })
    let cleaned = String(scalars)
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: ":", with: "_")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.isEmpty || cleaned.hasPrefix(".") { return "attachment" + cleaned }
    return String(cleaned.prefix(200))
}

func quarantine(_ url: URL) {
    var values = URLResourceValues()
    values.quarantineProperties = [
        kLSQuarantineAgentNameKey as String: "Paper Clipper",
        kLSQuarantineTypeKey as String: kLSQuarantineTypeOtherDownload as String,
    ]
    var target = url
    try? target.setResourceValues(values)
}

func uniqueURL(in dir: URL, name: String) -> URL {
    let base = (name as NSString).deletingPathExtension
    let ext = (name as NSString).pathExtension
    var url = dir.appendingPathComponent(name)
    var n = 2
    while FileManager.default.fileExists(atPath: url.path) {
        url = dir.appendingPathComponent(ext.isEmpty ? "\(base) (\(n))" : "\(base) (\(n)).\(ext)")
        n += 1
    }
    return url
}

// Only the latest copy is still on the pasteboard; older folders are kept an hour in case an app
// is still reading them.
func removeOldCopies() {
    let fm = FileManager.default
    guard let entries = try? fm.contentsOfDirectory(at: cacheRoot, includingPropertiesForKeys: [.creationDateKey]) else { return }
    let cutoff = Date().addingTimeInterval(-3600)
    for url in entries {
        let created = (try? url.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
        if created < cutoff { try? fm.removeItem(at: url) }
    }
}

var copyDir: URL?
var files: [URL] = []

func handle(_ message: [String: Any]) throws -> [String: Any] {
    switch message["type"] as? String {
    case "ping":
        return ["ok": true, "version": version]

    case "begin":
        removeOldCopies()
        let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let dir = cacheRoot.appendingPathComponent("\(stamp)-\(UUID().uuidString.prefix(8))", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        copyDir = dir
        files = []
        return ["ok": true]

    case "file":
        guard let dir = copyDir else { throw HelperError(description: "file before begin") }
        guard let name = message["name"] as? String,
              let base64 = message["data"] as? String,
              let data = Data(base64Encoded: base64)
        else { throw HelperError(description: "invalid file message") }
        let url = uniqueURL(in: dir, name: safeName(name))
        try data.write(to: url)
        quarantine(url)
        files.append(url)
        return ["ok": true]

    case "commit":
        let text = message["text"] as? String ?? ""
        var objects: [NSPasteboardItem] = []
        if !text.isEmpty {
            let item = NSPasteboardItem()
            item.setString(text, forType: .string)
            objects.append(item)
        }
        for url in files {
            let item = NSPasteboardItem()
            item.setString(url.absoluteString, forType: .fileURL)
            objects.append(item)
        }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        guard pasteboard.writeObjects(objects) else { throw HelperError(description: "pasteboard write failed") }
        // The pasteboard server takes the items over asynchronously; if the helper exits first
        // (Chrome closes the port right after this reply), trailing items get lost. Reading every
        // item back forces the hand-over.
        let written = pasteboard.pasteboardItems ?? []
        for item in written {
            if let type = item.types.first { _ = item.data(forType: type) }
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        guard written.count == objects.count else {
            throw HelperError(description: "pasteboard holds \(written.count) of \(objects.count) items")
        }
        return ["ok": true, "files": files.count]

    default:
        throw HelperError(description: "unknown message type")
    }
}

while let incoming = readMessage() {
    guard case .message(let message) = incoming else {
        send(["ok": false, "error": "invalid message"])
        continue
    }
    do {
        send(try handle(message))
    } catch {
        send(["ok": false, "error": String(describing: error)])
    }
}
