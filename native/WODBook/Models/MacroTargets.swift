import Foundation
import SwiftData

/// User-defined daily nutrition goals. Stored as a single settings record
/// (fetch-or-create the singleton via `MacroTargets.current(in:)`).
///
/// CloudKit-safe: every property has a default value, no unique constraints.
@Model
final class MacroTargets {
    /// Daily calorie goal (kcal).
    var calories: Double
    /// Daily protein goal (grams).
    var proteinG: Double
    /// Daily carbohydrate goal (grams).
    var carbsG: Double
    /// Daily fat goal (grams).
    var fatG: Double
    /// Daily fiber goal (grams). Optional target.
    var fiberG: Double
    /// Daily water goal (milliliters). Optional target.
    var waterML: Double
    /// When `true`, the calorie target is derived from macros (4/4/9) instead of
    /// being entered independently.
    var deriveCaloriesFromMacros: Bool

    var updatedAt: Date

    init(
        calories: Double = 2000,
        proteinG: Double = 150,
        carbsG: Double = 200,
        fatG: Double = 67,
        fiberG: Double = 30,
        waterML: Double = 3000,
        deriveCaloriesFromMacros: Bool = false
    ) {
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.fiberG = fiberG
        self.waterML = waterML
        self.deriveCaloriesFromMacros = deriveCaloriesFromMacros
        self.updatedAt = .now
    }

    /// Calories implied by the macro grams (protein/carbs = 4 kcal/g, fat = 9).
    var caloriesFromMacros: Double {
        proteinG * 4 + carbsG * 4 + fatG * 9
    }

    /// The effective calorie goal, honoring `deriveCaloriesFromMacros`.
    var effectiveCalories: Double {
        deriveCaloriesFromMacros ? caloriesFromMacros : calories
    }

    /// Returns the existing settings record, creating and inserting one with
    /// sensible defaults if none exists yet.
    static func current(in context: ModelContext) -> MacroTargets {
        let descriptor = FetchDescriptor<MacroTargets>()
        if let existing = try? context.fetch(descriptor).first {
            return existing
        }
        let created = MacroTargets()
        context.insert(created)
        return created
    }
}
