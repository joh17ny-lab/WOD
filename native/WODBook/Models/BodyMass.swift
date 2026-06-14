import Foundation
import SwiftData

/// A bodyweight measurement. Reuses `WeightUnit` (lb/kg) so it stays consistent
/// with `LiftPR`.
///
/// CloudKit-safe: every property has a default value, no unique constraints.
@Model
final class BodyMass {
    var weight: Double        // stored in the unit chosen at entry time
    var unitRaw: String       // "lb" or "kg"
    var date: Date
    var notes: String
    var createdAt: Date

    /// Where this entry came from: "manual", "healthkit". Used to dedup imports.
    var source: String
    /// Stable identifier from the source (HealthKit sample UUID). nil = manual.
    var externalID: String?

    init(
        weight: Double,
        unit: WeightUnit = .lb,
        date: Date = .now,
        notes: String = "",
        source: String = "manual",
        externalID: String? = nil
    ) {
        self.weight = weight
        self.unitRaw = unit.rawValue
        self.date = date
        self.notes = notes
        self.createdAt = .now
        self.source = source
        self.externalID = externalID
    }

    var unit: WeightUnit {
        get { WeightUnit(rawValue: unitRaw) ?? .lb }
        set { unitRaw = newValue.rawValue }
    }

    /// Weight converted to kilograms (for charting on a common axis).
    var kilograms: Double {
        unit == .kg ? weight : weight * 0.453592
    }

    var displayWeight: String {
        let w = weight.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(weight))
            : String(format: "%.1f", weight)
        return "\(w) \(unit.rawValue)"
    }
}

extension WeightUnit {
    /// Convert a value in kilograms into this unit.
    func fromKilograms(_ kg: Double) -> Double {
        self == .kg ? kg : kg / 0.453592
    }
}
