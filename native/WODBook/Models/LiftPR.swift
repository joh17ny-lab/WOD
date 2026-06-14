import Foundation
import SwiftData

/// A personal-record entry for a barbell lift / strength movement.
@Model
final class LiftPR {
    var liftName: String
    var weight: Double        // stored in the unit chosen at entry time
    var unitRaw: String       // "lb" or "kg"
    var reps: Int             // reps the weight was lifted for (1 = true 1RM)
    var date: Date
    var notes: String
    var createdAt: Date

    init(
        liftName: String,
        weight: Double,
        unit: WeightUnit = .lb,
        reps: Int = 1,
        date: Date = .now,
        notes: String = ""
    ) {
        self.liftName = liftName
        self.weight = weight
        self.unitRaw = unit.rawValue
        self.reps = reps
        self.date = date
        self.notes = notes
        self.createdAt = .now
    }

    var unit: WeightUnit {
        get { WeightUnit(rawValue: unitRaw) ?? .lb }
        set { unitRaw = newValue.rawValue }
    }

    /// Estimated one-rep max using the Epley formula.
    var estimatedOneRepMax: Double {
        guard reps > 1 else { return weight }
        return weight * (1.0 + Double(reps) / 30.0)
    }

    var displayWeight: String {
        let w = weight.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(weight))
            : String(format: "%.1f", weight)
        return "\(w) \(unit.rawValue)"
    }
}

enum WeightUnit: String, Codable, CaseIterable, Identifiable {
    case lb
    case kg
    var id: String { rawValue }
}

/// The catalog of common lifts users track.
enum CommonLift: String, CaseIterable, Identifiable {
    case backSquat       = "Back Squat"
    case frontSquat      = "Front Squat"
    case overheadSquat   = "Overhead Squat"
    case deadlift        = "Deadlift"
    case benchPress      = "Bench Press"
    case strictPress     = "Strict Press"
    case pushPress       = "Push Press"
    case pushJerk        = "Push Jerk"
    case clean           = "Clean"
    case powerClean      = "Power Clean"
    case cleanAndJerk    = "Clean & Jerk"
    case snatch          = "Snatch"
    case powerSnatch     = "Power Snatch"
    case thruster        = "Thruster"

    var id: String { rawValue }
}
