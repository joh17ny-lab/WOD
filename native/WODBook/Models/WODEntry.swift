import Foundation
import SwiftData

/// Type of WOD scoring used by CrossFit-style workouts.
enum WODType: String, Codable, CaseIterable, Identifiable {
    case forTime          = "For Time"
    case amrap            = "AMRAP"
    case emom             = "EMOM"
    case rounds           = "Rounds"
    case load             = "Load"
    case distance         = "Distance"
    case other            = "Other"

    var id: String { rawValue }

    /// The unit/label shown next to the result field.
    var resultPlaceholder: String {
        switch self {
        case .forTime:  return "mm:ss"
        case .amrap:    return "rounds + reps"
        case .emom:     return "completed?"
        case .rounds:   return "rounds"
        case .load:     return "weight"
        case .distance: return "meters"
        case .other:    return "result"
        }
    }

    var systemImage: String {
        switch self {
        case .forTime:  return "stopwatch"
        case .amrap:    return "repeat"
        case .emom:     return "timer"
        case .rounds:   return "arrow.triangle.2.circlepath"
        case .load:     return "scalemass"
        case .distance: return "figure.run"
        case .other:    return "square.grid.2x2"
        }
    }
}

/// A logged workout entry (the core of the WOD history).
@Model
final class WODEntry {
    var title: String
    var details: String          // The workout description / movements
    var typeRaw: String
    var result: String           // User's score (time, rounds, etc.)
    var rxd: Bool                // Performed "as prescribed"
    var notes: String
    var date: Date
    var createdAt: Date

    /// Optional link to a benchmark workout if this entry is a benchmark attempt.
    var benchmarkName: String?

    /// Where this entry came from: "manual", "healthkit", "file". Used so
    /// imported activities can be distinguished and re-synced without dupes.
    var source: String

    /// Stable identifier from the source (HealthKit UUID, file activity id, …).
    /// Used to skip duplicates when re-importing. `nil` for manual entries.
    var externalID: String?

    init(
        title: String,
        details: String = "",
        type: WODType = .forTime,
        result: String = "",
        rxd: Bool = false,
        notes: String = "",
        date: Date = .now,
        benchmarkName: String? = nil,
        source: String = "manual",
        externalID: String? = nil
    ) {
        self.title = title
        self.details = details
        self.typeRaw = type.rawValue
        self.result = result
        self.rxd = rxd
        self.notes = notes
        self.date = date
        self.createdAt = .now
        self.benchmarkName = benchmarkName
        self.source = source
        self.externalID = externalID
    }

    var type: WODType {
        get { WODType(rawValue: typeRaw) ?? .other }
        set { typeRaw = newValue.rawValue }
    }
}
