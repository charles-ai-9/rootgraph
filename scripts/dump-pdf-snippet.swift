import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    fputs("Usage: dump-pdf-snippet.swift <pdf> <needle>\n", stderr)
    exit(1)
}

guard let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { exit(1) }
var full = ""
for i in 0..<doc.pageCount {
    full += (doc.page(at: i)?.string ?? "") + "\n"
}

let needle = args[2].lowercased()
let lower = full.lowercased()
var idx = lower.startIndex
while let range = lower.range(of: needle, range: idx..<lower.endIndex) {
    let pos = lower.distance(from: lower.startIndex, to: range.lowerBound)
    let start = full.index(full.startIndex, offsetBy: max(0, pos - 200), limitedBy: full.endIndex) ?? full.startIndex
    let end = full.index(full.startIndex, offsetBy: min(full.count, pos + 1200), limitedBy: full.endIndex) ?? full.endIndex
    print("=== offset \(pos) ===")
    print(String(full[start..<end]))
    print()
    idx = range.upperBound
}
