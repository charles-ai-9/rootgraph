import Foundation
import PDFKit

// MARK: - Models

struct WordEntry: Codable {
    var word: String
    var phonetic: String?
    var pos: String?
    var definition: String?
    var frequency: Int?
    var mnemonic: String?
    var collocations: [String]
    var etymology: String?
    var examples: [String]
    var rootHint: String?
}

struct RootFamily: Codable {
    var id: String
    var source: String
    var chapter: String
    var chapterOrder: Int
    var titleZh: String
    var semanticLabel: String
    var meaningEn: String?
    var meaningZh: String?
    var roots: [String]
    var words: [WordEntry]
}

// MARK: - Helpers

func normalizeSpaces(_ s: String) -> String {
    s.replacingOccurrences(of: "\u{00A0}", with: " ")
        .replacingOccurrences(of: "词 根", with: "词根")
        .replacingOccurrences(of: "均 表 示", with: "均表示")
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
}

func slugify(_ s: String) -> String {
    let lowered = s.lowercased()
    let allowed = lowered.unicodeScalars.map { scalar -> Character in
        if CharacterSet.alphanumerics.contains(scalar) { return Character(scalar) }
        return "-"
    }
    let slug = String(allowed)
        .replacingOccurrences(of: #"-+"#, with: "-", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    return slug.isEmpty ? "chapter" : String(slug.prefix(60))
}

func extractRoots(from header: String) -> [String] {
    guard let range = header.range(of: "词根") else { return [] }
    var tail = String(header[range.upperBound...])
    tail = tail.replacingOccurrences(of: "“", with: "").replacingOccurrences(of: "”", with: "")
    if let eq = tail.range(of: "=") {
        tail = String(tail[..<eq.lowerBound])
    }
    if let fromIdx = tail.range(of: "来源于") {
        tail = String(tail[..<fromIdx.lowerBound])
    }
    if let variantIdx = tail.range(of: "及其变体") {
        tail = String(tail[..<variantIdx.lowerBound])
    }
    if let allIdx = tail.range(of: "全部表示") ?? tail.range(of: "均表示") ?? tail.range(of: "除了") ?? tail.range(of: "表示") {
        tail = String(tail[..<allIdx.lowerBound])
    }
    let parts = tail.components(separatedBy: CharacterSet(charactersIn: "，,、"))
        .map { normalizeSpaces($0.replacingOccurrences(of: "-", with: "").replacingOccurrences(of: "\"", with: "").replacingOccurrences(of: "\u{201C}", with: "").replacingOccurrences(of: "\u{201D}", with: "")) }
        .filter { part in
            guard !part.isEmpty, part.count >= 2, part.count <= 12 else { return false }
            guard part.range(of: #"^[a-zA-Z*(]"#, options: .regularExpression) != nil else { return false }
            let lower = part.lowercased()
            let blocklist = ["全部都", "除了", "可以", "也是", "也是表"]
            return !blocklist.contains(where: { lower.contains($0) })
        }
    return parts
}

func trimLabel(_ s: String) -> String {
    var t = normalizeSpaces(s)
    let stops = ["例如", "除了", "还可以", "也可以", "是源于", "词汇如下", "由此引", "因此", "其变体", "····", "含义为", "是压缩自", "是来源于", "是来自", "是源于单词", "与单词", "相关词汇"]
    for stop in stops {
        if let r = t.range(of: stop) { t = String(t[..<r.lowerBound]) }
    }
    t = t.replacingOccurrences(of: "\u{201C}", with: "").replacingOccurrences(of: "\u{201D}", with: "")
        .replacingOccurrences(of: "\"", with: "")
    t = t.trimmingCharacters(in: CharacterSet(charactersIn: "，,；;：:\"\"''/"))
    return normalizeSpaces(t)
}

func extractSemanticLabel(from header: String, en: String?, zh: String?) -> String {
    if let zh = zh {
        let cleaned = trimLabel(zh)
        if cleaned.range(of: #"[\u4e00-\u9fff]"#, options: .regularExpression) != nil,
           cleaned.count >= 2 && cleaned.count <= 36 {
            return cleaned
        }
    }
    if let en = en {
        let cleaned = trimLabel(en)
        if cleaned.count >= 2 && cleaned.count <= 48 { return cleaned }
    }
    let h = normalizeSpaces(header)
    if let sep = h.range(of: "均表示") ?? h.range(of: "表示") {
        var tail = String(h[sep.upperBound...])
        if let colon = tail.range(of: "：") ?? tail.range(of: ":") {
            let right = trimLabel(String(tail[colon.upperBound...]))
            if right.count >= 2 { return String(right.prefix(36)) }
        }
        let cleaned = trimLabel(tail)
        if cleaned.count >= 2 { return String(cleaned.prefix(36)) }
    }
    if let eq = h.range(of: "=") {
        let after = String(h[eq.upperBound...])
        if let colon = after.range(of: "：") ?? after.range(of: ":") {
            let right = trimLabel(String(after[colon.upperBound...]))
            if right.range(of: #"[\u4e00-\u9fff]"#, options: .regularExpression) != nil {
                return String(right.prefix(36))
            }
        }
        if let zhStart = after.range(of: #"[\u4e00-\u9fff]"#, options: .regularExpression) {
            return String(trimLabel(String(after[zhStart.lowerBound...])).prefix(36))
        }
        return String(trimLabel(after).prefix(36))
    }
    return trimLabel(extractRoots(from: header).prefix(3).joined(separator: "/"))
}

func chineseChapterOrder(_ chapter: String) -> Int {
    if chapter.hasPrefix("十一") { return 11 }
    if chapter.hasPrefix("十") { return 10 }
    let map: [Character: Int] = ["一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9]
    if let c = chapter.first, let n = map[c] { return n }
    if let n = Int(chapter) { return n + 100 }
    return 999
}

func isSubsectionChapterHeader(_ line: String) -> String? {
    let t = normalizeSpaces(line)
    // 教材2：leg- 在目录为独立词族（p.139），正文中以「词根"leg-"也有法律…」补充标题出现在 -her 章内
    if t.hasPrefix("词根"), t.contains("leg-"), t.contains("也有"), t.contains("法律") {
        return "leg"
    }
    return nil
}

func isSupplementaryHeader(_ t: String) -> Bool {
    if t.contains("····") { return true }
    if t.contains("还可以表示") { return true }
    if t.contains("也可以表示"), let also = t.range(of: "也可以表示"), let first = t.range(of: "表示"), also.lowerBound > first.lowerBound {
        return true
    }
    if t.hasPrefix("词根") && t.count <= 160 {
        if t.contains("表示") || t.contains("=") { return false }
        if t.contains("\"") || t.contains("\u{201C}") || t.contains("\u{201D}") { return false }
        if t.range(of: #"词根\s*[-*“\"'][a-zA-Z]"#, options: .regularExpression) != nil { return false }
    }
    let bad = ["还可以", "也可以", "例如", "词汇如下", "变体有", "是源于单词", "是来源于", "是压缩自", "因此包括", "相关词汇", "引申义为", "派生出", "作动词表示", "作名词", "还可以表示", "还可以进一步", "还可以进一步引申", "均表示\"to", "……"]
    if bad.contains(where: { t.contains($0) }) { return true }
    if t.hasPrefix("词根\"") && !t.contains("=") { return true }
    return false
}

func isChapterHeaderStart(_ line: String) -> Bool {
    let t = normalizeSpaces(line)
    guard t.hasPrefix("词根") else { return false }
    if isSupplementaryHeader(t) { return false }
    return true
}

func completesChapterHeader(_ line: String) -> Bool {
    let t = normalizeSpaces(line)
    return t.contains("表示") || t.contains("=") || t.hasPrefix("来源于")
}

func extractMeanings(from header: String) -> (en: String?, zh: String?) {
    var en: String?
    var zh: String?
    let cleaned = header
        .replacingOccurrences(of: #"^[一二三四五六七八九十]+、\s*"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"^第[一二三四五六七八九十]+章\s*"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"^词根\s*"#, with: "", options: .regularExpression)

    if let eq = cleaned.range(of: "=") {
        let after = String(cleaned[eq.upperBound...])
        if let zhRange = after.range(of: "：") ?? after.range(of: ":") {
            en = normalizeSpaces(String(after[..<zhRange.lowerBound]))
            var zhPart = String(after[zhRange.upperBound...])
            zhPart = zhPart.replacingOccurrences(of: "“", with: "").replacingOccurrences(of: "”", with: "")
            if let stop = zhPart.range(of: "全部") ?? zhPart.range(of: "均") {
                zhPart = String(zhPart[..<stop.lowerBound])
            }
            zh = normalizeSpaces(zhPart)
        } else {
            en = normalizeSpaces(after)
        }
    } else if let also = cleaned.range(of: "也有") {
        var tail = String(cleaned[also.upperBound...])
        tail = tail.replacingOccurrences(of: "的含义", with: "").replacingOccurrences(of: "。", with: "")
        tail = tail.replacingOccurrences(of: "\u{201C}", with: "").replacingOccurrences(of: "\u{201D}", with: "")
            .replacingOccurrences(of: "\"", with: "")
        if let law = tail.range(of: "law") {
            en = "law"
            zh = normalizeSpaces(String(tail[..<law.lowerBound]))
        } else {
            zh = trimLabel(tail)
        }
    } else if let sep = cleaned.range(of: "均表示") ?? cleaned.range(of: "表示") {
        var zhPart = String(cleaned[sep.upperBound...])
        zhPart = zhPart.replacingOccurrences(of: "\u{201C}", with: "").replacingOccurrences(of: "\u{201D}", with: "")
            .replacingOccurrences(of: "\"", with: "")
        if let colon = zhPart.range(of: "：") ?? zhPart.range(of: ":") {
            let left = normalizeSpaces(String(zhPart[..<colon.lowerBound]))
            let right = normalizeSpaces(String(zhPart[colon.upperBound...]))
            en = left.replacingOccurrences(of: "/", with: " / ")
            zh = trimLabel(right)
        } else {
            zh = trimLabel(zhPart)
        }
    }
    return (en, zh)
}

func parseWordLine(_ line: String) -> (word: String, phonetic: String?, rest: String)? {
    let line = normalizeSpaces(line)

    let withPhonetic = #"^([a-zA-Z][a-zA-Z0-9\-]*)\s+\[([^\]]+)\]\s*(.*)$"#
    if let regex = try? NSRegularExpression(pattern: withPhonetic),
       let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
       let wordRange = Range(match.range(at: 1), in: line),
       let phonRange = Range(match.range(at: 2), in: line),
       let restRange = Range(match.range(at: 3), in: line) {
        return (String(line[wordRange]), String(line[phonRange]), String(line[restRange]))
    }

    // 少数词条缺音标：demographics n. 人口统计资料 8881（须有中文释义 + 词频，避免误匹配）
    let noPhonetic = #"^([a-zA-Z][a-zA-Z0-9\-]{3,})\s+([a-zA-Z./0-9]+\.\s+.*[\u4e00-\u9fff].*\s+\d{3,6})$"#
    if let regex = try? NSRegularExpression(pattern: noPhonetic),
       let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
       let wordRange = Range(match.range(at: 1), in: line),
       let restRange = Range(match.range(at: 2), in: line) {
        let word = String(line[wordRange])
        guard word.count >= 3 else { return nil }
        return (word, nil, String(line[restRange]))
    }

    return nil
}

func parseDefinitionRest(_ rest: String) -> (pos: String?, definition: String?, frequency: Int?) {
    var text = normalizeSpaces(rest)
    var freq: Int?
    if let m = text.range(of: #"\s(\d{1,6})$"#, options: .regularExpression) {
        let numStr = text[m].trimmingCharacters(in: .whitespaces)
        freq = Int(numStr)
        text = normalizeSpaces(String(text[..<m.lowerBound]))
    }
    var pos: String?
    if let pm = text.range(of: #"^[a-zA-Z./]+"#, options: .regularExpression) {
        pos = String(text[pm])
        text = normalizeSpaces(String(text[pm.upperBound...]))
    }
    return (pos, text.isEmpty ? nil : text, freq)
}

func isChapterHeader(_ line: String) -> Bool {
    let t = normalizeSpaces(line)
    guard t.contains("词根") else { return false }
    if isSupplementaryHeader(t) { return false }
    if t.range(of: #"^[一二三四五六七八九十]+、"#, options: .regularExpression) != nil { return true }
    if t.range(of: #"^第[一二三四五六七八九十]+章"#, options: .regularExpression) != nil { return true }
    if t.hasPrefix("词根") && (t.contains("=") || t.contains("表示")) { return true }
    return false
}

func isNoiseLine(_ line: String) -> Bool {
    let t = normalizeSpaces(line)
    if t.isEmpty { return true }
    let noise = ["20000", "词汇巅峰", "速记", "笔记区", "·", "目", "录", "班"]
    if noise.contains(where: { t == $0 || t.hasPrefix($0) && t.count < 8 }) { return true }
    if t.range(of: #"^·\s*\d+\s*·$"#, options: .regularExpression) != nil { return true }
    return false
}

func inferRootHint(word: String, roots: [String]) -> String? {
    let w = word.lowercased()
    for root in roots {
        // (s)pend 归一化为 pend 做匹配（spend/depend 都含 pend）
        let r = root.lowercased().replacingOccurrences(of: "-", with: "").replacingOccurrences(of: "(s)", with: "")
        if r.count >= 3 && w.contains(r) { return root }
    }
    return roots.first
}

// MARK: - Parser

func parsePDF(at path: String, sourceLabel: String) -> [RootFamily] {
    guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else {
        fputs("Cannot open PDF: \(path)\n", stderr)
        return []
    }

    var fullText = ""
    for i in 0..<doc.pageCount {
        if let pageText = doc.page(at: i)?.string {
            fullText += pageText + "\n"
        }
    }

    let rawLines = fullText.components(separatedBy: .newlines)
    var lines: [String] = []
    for line in rawLines {
        let n = normalizeSpaces(line)
        if !isNoiseLine(n) { lines.append(n) }
    }

    var families: [RootFamily] = []
    var currentHeader: String?
    var currentChapter = ""
    var chapterCounter = 0
    var currentRoots: [String] = []
    var currentWords: [WordEntry] = []
    var currentWordIdx: Int?
    var pendingEtymology: [String] = []
    var collectingEtymology = false
    var collectingExample = false
    var collectingDefinition = false
    var collectingMnemonic = false
    var collectingCollocation = false
    var collectingFrequency = false
    var collectingInlineExample = false
    var inlineExampleBuffer = ""
    var pendingChapterHeaderLine: String?

    func resetWordCollectors() {
        collectingDefinition = false
        collectingMnemonic = false
        collectingCollocation = false
        collectingExample = false
        collectingEtymology = false
        collectingFrequency = false
        collectingInlineExample = false
        inlineExampleBuffer = ""
        pendingEtymology = []
    }

    func isFrequencyOnlyLine(_ line: String) -> Bool {
        let t = normalizeSpaces(line)
        return t.range(of: #"^\d{3,6}$"#, options: .regularExpression) != nil
    }

    func isInlineExampleStart(_ line: String) -> Bool {
        let t = normalizeSpaces(line)
        if parseWordLine(t) != nil { return false }
        if t.hasPrefix("助记") || t.hasPrefix("搭配") || t.hasPrefix("词源") { return false }
        if isChapterHeader(t) || isExampleStart(t) { return false }
        if t.hasPrefix("笔记") || t.hasPrefix("20000") { return false }
        if t.hasPrefix("例如：") || t.hasPrefix("例如:") { return true }
        if t.hasPrefix("(chemistry)") || t.hasPrefix("(化)") { return true }
        if t.hasPrefix("(N-COUNT)") || t.contains("N-COUNT)") { return true }
        // 英文阅读补充：大写或小写开头均可（如 Bondage is… / the process of…）
        if t.range(of: #"^[(\[]?[a-zA-Z][A-Za-z0-9 ,'\"();:\[\]-]{11,}"#, options: .regularExpression) != nil {
            return true
        }
        // 如 hydrogen bonding 氢键结合
        if t.range(of: #"^[a-zA-Z][a-zA-Z -]{2,}[\u4e00-\u9fff]"#, options: .regularExpression) != nil {
            return true
        }
        return false
    }

    func isInlineExampleContinuation(_ line: String) -> Bool {
        let t = normalizeSpaces(line)
        if t.isEmpty { return true }
        if parseWordLine(t) != nil { return false }
        if isChapterHeader(t) || isExampleStart(t) { return false }
        if t.hasPrefix("助记") || t.hasPrefix("搭配") || t.hasPrefix("词源") { return false }
        if isInlineExampleStart(t) { return false }
        if t.range(of: #"^[a-zA-Z ,'\"();:\[\]-]{8,}"#, options: .regularExpression) != nil { return true }
        if t.range(of: #"[\u4e00-\u9fff]"#, options: .regularExpression) != nil { return true }
        return false
    }

    func flushInlineExample(to idx: Int) {
        guard !inlineExampleBuffer.isEmpty else { return }
        currentWords[idx].collocations.append(inlineExampleBuffer)
        inlineExampleBuffer = ""
    }

    func appendInlineExampleLine(_ line: String) {
        let chunk = normalizeSpaces(line)
        guard !chunk.isEmpty else { return }
        inlineExampleBuffer = inlineExampleBuffer.isEmpty ? chunk : inlineExampleBuffer + "\n" + chunk
    }

    func isUnlabeledMnemonicStart(_ line: String) -> Bool {
        let t = normalizeSpaces(line)
        if parseWordLine(t) != nil { return false }
        if t.hasPrefix("助记") || t.hasPrefix("搭配") || t.hasPrefix("词源") || t.hasPrefix("释义和用法") { return false }
        if isChapterHeader(t) || isExampleStart(t) { return false }
        if isInlineExampleStart(t) && !t.contains("→") { return false }
        if t.contains("→") && t.range(of: #"[\u4e00-\u9fff]"#, options: .regularExpression) != nil { return true }
        if t.hasPrefix("+") { return true }
        return false
    }

    func isDefinitionContinuationLine(_ line: String) -> Bool {
        if parseWordLine(line) != nil { return false }
        if line.hasPrefix("助记") || line.hasPrefix("搭配") || line.hasPrefix("词源") { return false }
        if isExampleStart(line) || isChapterHeader(line) { return false }
        if line.hasPrefix("阅读") || line.hasPrefix("释义") { return false }
        if line.range(of: #"^[a-zA-Z]+\s*\["#, options: .regularExpression) != nil { return false }
        return line.range(of: #"[\u4e00-\u9fff]"#, options: .regularExpression) != nil
    }

    func parseDefinitionContinuation(_ line: String) -> (text: String, frequency: Int?) {
        var text = normalizeSpaces(line)
        var freq: Int?
        if let m = text.range(of: #"\s(\d{1,6})$"#, options: .regularExpression) {
            freq = Int(text[m].trimmingCharacters(in: .whitespaces))
            text = normalizeSpaces(String(text[..<m.lowerBound]))
        }
        return (text, freq)
    }

    func isMnemonicContinuationLine(_ line: String) -> Bool {
        if parseWordLine(line) != nil { return false }
        if line.hasPrefix("搭配") || line.hasPrefix("词源") || line.hasPrefix("助记") { return false }
        if isExampleStart(line) || isChapterHeader(line) { return false }
        if line.hasPrefix("阅读") || line.hasPrefix("释义") { return false }
        if line.hasPrefix("搭配") { return false }
        return line.hasPrefix("+")
            || line.contains("→")
            || line.range(of: #"^[a-zA-Z(\[]"#, options: .regularExpression) != nil
    }

    func isCollocationContinuationLine(_ line: String) -> Bool {
        if parseWordLine(line) != nil { return false }
        if line.hasPrefix("助记") || line.hasPrefix("词源") || line.hasPrefix("搭配") { return false }
        if isExampleStart(line) || isChapterHeader(line) { return false }
        if line.hasPrefix("释义") { return false }
        if line.contains("(考)") { return true }
        if line.range(of: #"^[a-zA-Z].*[：:].*[\u4e00-\u9fff]"#, options: .regularExpression) != nil { return true }
        // 搭配续行中的英文阅读块（如 A bunch of people is...）
        if line.range(of: #"^[(\[]?[a-zA-Z][A-Za-z0-9 ,'\"();:\[\]-]{11,}"#, options: .regularExpression) != nil { return true }
        if line.hasPrefix("例如：") || line.hasPrefix("例如:") { return true }
        return false
    }

    func appendMnemonic(_ line: String, to idx: Int) {
        let chunk = normalizeSpaces(line)
        guard !chunk.isEmpty else { return }
        if let existing = currentWords[idx].mnemonic, !existing.isEmpty {
            currentWords[idx].mnemonic = existing + "\n" + chunk
        } else {
            currentWords[idx].mnemonic = chunk
        }
    }

    func stripExampleLabel(_ line: String) -> String {
        let labels = ["写作例句：", "写作例句:", "仿写例句：", "仿写例句:", "例句：", "例句:"]
        for label in labels where line.hasPrefix(label) {
            return normalizeSpaces(String(line.dropFirst(label.count)))
        }
        return normalizeSpaces(line)
    }

    func isExampleStart(_ line: String) -> Bool {
        line.hasPrefix("写作例句") || line.hasPrefix("仿写例句") || line.hasPrefix("例句")
    }

    func isExampleContinuationEnd(_ line: String) -> Bool {
        if parseWordLine(line) != nil { return true }
        if isChapterHeader(line) { return true }
        if line.hasPrefix("助记") || line.hasPrefix("搭配") || line.hasPrefix("词源") { return true }
        if isExampleStart(line) { return true }
        if line.hasPrefix("阅读") || line.hasPrefix("解析") || line.hasPrefix("搭配") { return true }
        if line.range(of: #"^·\s*\d+\s*·$"#, options: .regularExpression) != nil { return true }
        if line.hasPrefix("20000") || line == "笔 记 区" || line == "笔记区" { return true }
        return false
    }

    func flushFamily() {
        if let idx = currentWordIdx, !inlineExampleBuffer.isEmpty {
            flushInlineExample(to: idx)
            collectingInlineExample = false
        }
        guard let header = currentHeader, !currentWords.isEmpty else { return }
        let meanings = extractMeanings(from: header)
        let roots = currentRoots.isEmpty ? extractRoots(from: header) : currentRoots
        let semanticLabel = extractSemanticLabel(from: header, en: meanings.en, zh: meanings.zh)
        let titleZh = semanticLabel
        let order = chineseChapterOrder(currentChapter)
        let id = slugify(roots.first ?? currentChapter)
        var family = RootFamily(
            id: id,
            source: sourceLabel,
            chapter: currentChapter,
            chapterOrder: order,
            titleZh: titleZh,
            semanticLabel: semanticLabel,
            meaningEn: meanings.en,
            meaningZh: meanings.zh,
            roots: roots,
            words: currentWords
        )
        for i in family.words.indices {
            if family.words[i].rootHint == nil {
                family.words[i].rootHint = inferRootHint(word: family.words[i].word, roots: roots)
            }
        }
        families.append(family)
    }

    func startChapter(with header: String) {
        flushFamily()
        currentHeader = header
        if let m = header.range(of: #"^[一二三四五六七八九十]+、"#, options: .regularExpression) {
            currentChapter = String(header[m].dropLast())
        } else {
            chapterCounter += 1
            currentChapter = "\(chapterCounter)"
        }
        currentRoots = extractRoots(from: header)
        currentWords = []
        currentWordIdx = nil
        resetWordCollectors()
    }

    var i = 0
    while i < lines.count {
        let line = lines[i]

        if let pending = pendingChapterHeaderLine {
            if completesChapterHeader(line) {
                startChapter(with: normalizeSpaces(pending + " " + line))
                pendingChapterHeaderLine = nil
                i += 1
                continue
            }
            pendingChapterHeaderLine = nil
        }

        if isChapterHeader(line) {
            startChapter(with: line)
            i += 1
            continue
        }

        if let subRoot = isSubsectionChapterHeader(line) {
            startChapter(with: line)
            currentRoots = [subRoot]
            i += 1
            continue
        }

        if isChapterHeaderStart(line) && !completesChapterHeader(line) {
            pendingChapterHeaderLine = line
            i += 1
            continue
        }

        if collectingDefinition, let idx = currentWordIdx {
            if isDefinitionContinuationLine(line) {
                let part = parseDefinitionContinuation(line)
                if !part.text.isEmpty {
                    let base = currentWords[idx].definition ?? ""
                    currentWords[idx].definition = base.isEmpty ? part.text : base + part.text
                }
                if let freq = part.frequency {
                    currentWords[idx].frequency = freq
                    collectingDefinition = false
                }
                i += 1
                continue
            }
            collectingDefinition = false
        }

        if collectingFrequency, let idx = currentWordIdx {
            if isFrequencyOnlyLine(line) {
                currentWords[idx].frequency = Int(normalizeSpaces(line))
                collectingFrequency = false
                i += 1
                continue
            }
            collectingFrequency = false
        }

        if collectingInlineExample, let idx = currentWordIdx {
            if isInlineExampleContinuation(line) {
                appendInlineExampleLine(line)
                i += 1
                continue
            }
            flushInlineExample(to: idx)
            collectingInlineExample = false
        }

        if let idx = currentWordIdx, !collectingMnemonic, isUnlabeledMnemonicStart(line) {
            appendMnemonic(line, to: idx)
            collectingMnemonic = true
            i += 1
            continue
        }

        if let idx = currentWordIdx, !collectingInlineExample, isInlineExampleStart(line) {
            collectingInlineExample = true
            inlineExampleBuffer = ""
            appendInlineExampleLine(line)
            i += 1
            continue
        }

        if collectingMnemonic, let idx = currentWordIdx {
            if isMnemonicContinuationLine(line) {
                appendMnemonic(line, to: idx)
                i += 1
                continue
            }
            collectingMnemonic = false
        }

        if collectingCollocation, let idx = currentWordIdx {
            if isCollocationContinuationLine(line) {
                currentWords[idx].collocations.append(normalizeSpaces(line))
                i += 1
                continue
            }
            collectingCollocation = false
        }

        if collectingExample {
            if isExampleContinuationEnd(line) {
                collectingExample = false
                continue
            }
            if let idx = currentWordIdx, !line.isEmpty {
                let last = currentWords[idx].examples.count - 1
                if last >= 0 {
                    currentWords[idx].examples[last] += "\n" + line
                }
            }
            i += 1
            continue
        }

        if isExampleStart(line) {
            if let idx = currentWordIdx {
                let ex = stripExampleLabel(line)
                if !ex.isEmpty {
                    currentWords[idx].examples.append(ex)
                    collectingExample = true
                }
            }
            i += 1
            continue
        }

        if line.hasPrefix("词源") || line.hasPrefix("词源：") || line.hasPrefix("词源:") {
            collectingEtymology = true
            pendingEtymology = []
            let rest = line.replacingOccurrences(of: "词源：", with: "").replacingOccurrences(of: "词源:", with: "").replacingOccurrences(of: "词源", with: "")
            if !rest.trimmingCharacters(in: .whitespaces).isEmpty {
                pendingEtymology.append(normalizeSpaces(rest))
            }
            i += 1
            continue
        }

        if collectingEtymology {
            if line.hasPrefix("助记") || line.hasPrefix("搭配") || parseWordLine(line) != nil || isChapterHeader(line) || isExampleStart(line) {
                if let idx = currentWordIdx, !pendingEtymology.isEmpty {
                    currentWords[idx].etymology = pendingEtymology.joined(separator: " ")
                }
                collectingEtymology = false
                pendingEtymology = []
                continue
            }
            pendingEtymology.append(line)
            i += 1
            continue
        }

        if line.hasPrefix("阅读难点") || line.hasPrefix("阅读难点：") || line.hasPrefix("阅读难点:") {
            if let idx = currentWordIdx {
                currentWords[idx].collocations.append(normalizeSpaces(line))
            }
            collectingCollocation = false
            i += 1
            continue
        }

        if line.hasPrefix("释义和用法") {
            if let idx = currentWordIdx {
                if collectingInlineExample {
                    flushInlineExample(to: idx)
                }
                var rest = line
                for prefix in ["释义和用法：", "释义和用法:", "释义和用法"] {
                    if rest.hasPrefix(prefix) {
                        rest = String(rest.dropFirst(prefix.count))
                        break
                    }
                }
                collectingInlineExample = true
                inlineExampleBuffer = ""
                let chunk = normalizeSpaces(rest)
                if !chunk.isEmpty {
                    appendInlineExampleLine(chunk)
                }
            }
            collectingMnemonic = false
            collectingCollocation = false
            i += 1
            continue
        }

        if line.hasPrefix("助记：") || line.hasPrefix("助记:") {
            let memo = line.replacingOccurrences(of: "助记：", with: "").replacingOccurrences(of: "助记:", with: "")
            if let idx = currentWordIdx {
                appendMnemonic(memo, to: idx)
                collectingMnemonic = true
            }
            collectingCollocation = false
            i += 1
            continue
        }

        if line.hasPrefix("搭配：") || line.hasPrefix("搭配:") {
            let col = line.replacingOccurrences(of: "搭配：", with: "").replacingOccurrences(of: "搭配:", with: "")
            if let idx = currentWordIdx {
                currentWords[idx].collocations.append(normalizeSpaces(col))
                collectingCollocation = true
            }
            collectingMnemonic = false
            i += 1
            continue
        }

        if let parsed = parseWordLine(line) {
            resetWordCollectors()
            if let idx = currentWordIdx, !pendingEtymology.isEmpty {
                currentWords[idx].etymology = pendingEtymology.joined(separator: " ")
                pendingEtymology = []
            }
            let defParts = parseDefinitionRest(parsed.rest)
            let entry = WordEntry(
                word: parsed.word,
                phonetic: parsed.phonetic,
                pos: defParts.pos,
                definition: defParts.definition,
                frequency: defParts.frequency,
                mnemonic: nil,
                collocations: [],
                etymology: nil,
                examples: [],
                rootHint: nil
            )
            currentWords.append(entry)
            currentWordIdx = currentWords.count - 1
            if defParts.frequency == nil {
                // 释义或词频可能换行（如「可牺」+「牲的 19381」，或单独一行词频）
                collectingDefinition = true
                collectingFrequency = true
            }
            i += 1
            continue
        }

        i += 1
    }

    flushFamily()
    if let idx = currentWordIdx, collectingInlineExample {
        flushInlineExample(to: idx)
    }
    return families
}

// MARK: - CLI

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("""
    Usage: swift parse-pdf.swift <pdf-path> <output-dir> [source-label]

    Example:
      swift parse-pdf.swift ~/Downloads/20000词汇巅峰速记营（教材1）.pdf ./data/textbook-1 textbook-1
    """)
    exit(1)
}

let pdfPath = args[1]
let outputDir = args[2]
let sourceLabel = args.count > 3 ? args[3] : URL(fileURLWithPath: pdfPath).deletingPathExtension().lastPathComponent

let families = parsePDF(at: pdfPath, sourceLabel: sourceLabel)
guard !families.isEmpty else {
    fputs("ERROR: parsed 0 families (PDF may lack a text layer) — aborting without touching existing data\n", stderr)
    exit(1)
}
let fm = FileManager.default
try? fm.createDirectory(atPath: outputDir, withIntermediateDirectories: true)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

var index: [[String: Any]] = []
var usedIds = Set<String>()
var outputFiles = Set<String>()
for family in families {
    // 同教材内 slug 撞车（如两章都含 plus 词根）→ 追加 -2 / -3 后缀，避免覆盖丢数据
    var familyId = family.id
    if usedIds.contains(familyId) {
        var n = 2
        while usedIds.contains("\(familyId)-\(n)") { n += 1 }
        familyId = "\(familyId)-\(n)"
    }
    usedIds.insert(familyId)
    let fileName = "\(familyId).json"
    outputFiles.insert(fileName)
    let filePath = (outputDir as NSString).appendingPathComponent(fileName)
    var payload = family
    payload.id = familyId
    guard let data = try? encoder.encode(payload) else {
        fputs("ERROR: failed to encode family \(familyId) — aborting\n", stderr)
        exit(1)
    }
    do {
        try data.write(to: URL(fileURLWithPath: filePath))
    } catch {
        fputs("ERROR: failed to write \(filePath): \(error) — aborting\n", stderr)
        exit(1)
    }
    index.append([
        "id": familyId,
        "file": fileName,
        "chapter": family.chapter,
        "chapterOrder": family.chapterOrder,
        "titleZh": family.titleZh,
        "semanticLabel": family.semanticLabel,
        "meaningEn": family.meaningEn ?? "",
        "meaningZh": family.meaningZh ?? "",
        "roots": family.roots,
        "wordCount": family.words.count,
        "source": family.source
    ])
}

let indexPath = (outputDir as NSString).appendingPathComponent("index.json")
if let indexData = try? JSONSerialization.data(withJSONObject: index, options: [.prettyPrinted, .sortedKeys]) {
    do {
        try indexData.write(to: URL(fileURLWithPath: indexPath))
    } catch {
        fputs("ERROR: failed to write \(indexPath): \(error) — aborting\n", stderr)
        exit(1)
    }
}
outputFiles.insert("index.json")

// 全部写成功后才清理旧文件（先写后删：中途失败时旧数据仍在）
if let oldFiles = try? fm.contentsOfDirectory(atPath: outputDir) {
    for f in oldFiles where f.hasSuffix(".json") && !outputFiles.contains(f) {
        try? fm.removeItem(atPath: (outputDir as NSString).appendingPathComponent(f))
    }
}

let totalWords = families.reduce(0) { $0 + $1.words.count }
print("Parsed \(families.count) root families, \(totalWords) words → \(outputDir)")
