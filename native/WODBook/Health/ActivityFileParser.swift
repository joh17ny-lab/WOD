import Foundation

/// A summarized activity parsed from a `.tcx` or `.gpx` file (the formats most
/// watches/Garmin export). Geometry/track points are ignored — we only need a
/// loggable summary.
struct ParsedActivity {
    var sport: String
    var start: Date?
    var totalSeconds: Double
    var distanceMeters: Double
    var calories: Double

    var title: String {
        sport.isEmpty ? "Imported Activity" : sport
    }

    /// A short result string for a WOD entry.
    var resultSummary: String {
        var parts: [String] = []
        if totalSeconds > 0 {
            parts.append(TimeFormat.mmss(Int(totalSeconds)))
        }
        if calories > 0 { parts.append("\(Int(calories)) kcal") }
        if distanceMeters > 0 { parts.append("\(Int(distanceMeters)) m") }
        return parts.joined(separator: " · ")
    }
}

enum ActivityFileError: LocalizedError {
    case unsupported
    case parseFailed
    case noData

    var errorDescription: String? {
        switch self {
        case .unsupported: return "Unsupported file. Use a .tcx or .gpx file."
        case .parseFailed: return "Couldn't read that file — it may be malformed."
        case .noData:      return "No activity data found in the file."
        }
    }
}

/// Parses `.tcx` and `.gpx` activity files into a `ParsedActivity` summary.
enum ActivityFileParser {
    static func parse(data: Data, fileName: String) throws -> ParsedActivity {
        let lower = fileName.lowercased()
        if lower.hasSuffix(".tcx") {
            return try parseTCX(data)
        } else if lower.hasSuffix(".gpx") {
            return try parseGPX(data)
        }
        // Fall back to sniffing the contents.
        if let text = String(data: data, encoding: .utf8) {
            if text.contains("TrainingCenterDatabase") { return try parseTCX(data) }
            if text.contains("<gpx") { return try parseGPX(data) }
        }
        throw ActivityFileError.unsupported
    }

    private static func parseTCX(_ data: Data) throws -> ParsedActivity {
        let d = TCXDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = d
        guard parser.parse() else { throw ActivityFileError.parseFailed }
        guard d.hasData else { throw ActivityFileError.noData }
        return ParsedActivity(
            sport: d.sport.isEmpty ? "Activity" : d.sport,
            start: d.startTime,
            totalSeconds: d.totalSeconds,
            distanceMeters: d.distanceMeters,
            calories: d.calories
        )
    }

    private static func parseGPX(_ data: Data) throws -> ParsedActivity {
        let d = GPXDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = d
        guard parser.parse() else { throw ActivityFileError.parseFailed }
        guard d.firstTime != nil else { throw ActivityFileError.noData }
        let seconds = (d.firstTime != nil && d.lastTime != nil)
            ? d.lastTime!.timeIntervalSince(d.firstTime!) : 0
        return ParsedActivity(
            sport: d.sport.isEmpty ? "Activity" : d.sport,
            start: d.firstTime,
            totalSeconds: max(0, seconds),
            distanceMeters: 0,   // GPX distance would require summing trackpoints
            calories: 0
        )
    }
}

// MARK: - TCX

private final class TCXDelegate: NSObject, XMLParserDelegate {
    var sport = ""
    var startTime: Date?
    var totalSeconds: Double = 0
    var distanceMeters: Double = 0
    var calories: Double = 0
    var hasData = false

    private var current = ""
    private var buffer = ""
    private let iso = ISO8601DateFormatter()

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName qName: String?,
                attributes attributeDict: [String: String]) {
        current = elementName
        buffer = ""
        if elementName == "Activity", let s = attributeDict["Sport"] {
            sport = s
            hasData = true
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        buffer += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String,
                namespaceURI: String?, qualifiedName qName: String?) {
        let value = buffer.trimmingCharacters(in: .whitespacesAndNewlines)
        switch elementName {
        case "Id":
            if startTime == nil { startTime = iso.date(from: value) }
        case "TotalTimeSeconds":
            totalSeconds += Double(value) ?? 0
            hasData = true
        case "DistanceMeters":
            // Lap-level DistanceMeters; trackpoint ones also match but summing
            // laps is close enough for a summary. Keep the max to avoid double-add.
            distanceMeters = max(distanceMeters, Double(value) ?? 0)
        case "Calories":
            calories += Double(value) ?? 0
        default:
            break
        }
        buffer = ""
    }
}

// MARK: - GPX

private final class GPXDelegate: NSObject, XMLParserDelegate {
    var sport = ""
    var firstTime: Date?
    var lastTime: Date?

    private var buffer = ""
    private let iso = ISO8601DateFormatter()

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName qName: String?,
                attributes attributeDict: [String: String]) {
        buffer = ""
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        buffer += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String,
                namespaceURI: String?, qualifiedName qName: String?) {
        let value = buffer.trimmingCharacters(in: .whitespacesAndNewlines)
        switch elementName {
        case "time":
            if let t = iso.date(from: value) {
                if firstTime == nil { firstTime = t }
                lastTime = t
            }
        case "type":
            if sport.isEmpty { sport = value }
        default:
            break
        }
        buffer = ""
    }
}
