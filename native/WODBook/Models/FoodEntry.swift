import Foundation
import SwiftData

/// Broad category a measuring unit belongs to. Conversions are only valid
/// *within* a category (never across — e.g. grams cannot convert to mL).
enum MeasureCategory: String, Codable, CaseIterable, Identifiable {
    case solid   // mass / weight
    case liquid  // volume
    case count   // discrete items / servings

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .solid:  return "Solid"
        case .liquid: return "Liquid"
        case .count:  return "Count"
        }
    }
}

/// Measuring units for food (solid/mass), drink (liquid/volume), and count.
///
/// `baseFactor` converts a value in this unit to the category's base unit:
///   - solid base  = gram (g)
///   - liquid base = milliliter (mL)
///   - count base  = piece
enum FoodUnit: String, Codable, CaseIterable, Identifiable {
    // Solid / mass
    case gram      = "g"
    case kilogram  = "kg"
    case ounce     = "oz"
    case pound     = "lb"
    // Liquid / volume
    case milliliter = "mL"
    case liter      = "L"
    case fluidOunce = "fl oz"
    case cup        = "cup"
    case tablespoon = "tbsp"
    case teaspoon   = "tsp"
    // Count
    case piece    = "piece"
    case serving  = "serving"

    var id: String { rawValue }

    var displayName: String { rawValue }

    var category: MeasureCategory {
        switch self {
        case .gram, .kilogram, .ounce, .pound:
            return .solid
        case .milliliter, .liter, .fluidOunce, .cup, .tablespoon, .teaspoon:
            return .liquid
        case .piece, .serving:
            return .count
        }
    }

    /// Multiplier to convert a quantity in this unit to the category base unit.
    var baseFactor: Double {
        switch self {
        // → grams
        case .gram:       return 1
        case .kilogram:   return 1000
        case .ounce:      return 28.3495
        case .pound:      return 453.592
        // → milliliters
        case .milliliter: return 1
        case .liter:      return 1000
        case .fluidOunce: return 29.5735
        case .cup:        return 236.588
        case .tablespoon: return 14.7868
        case .teaspoon:   return 4.92892
        // → pieces
        case .piece:      return 1
        case .serving:    return 1
        }
    }

    static func units(in category: MeasureCategory) -> [FoodUnit] {
        allCases.filter { $0.category == category }
    }

    /// Convert a quantity from this unit to another unit in the same category.
    /// Returns `nil` if the units are in different categories.
    func convert(_ quantity: Double, to other: FoodUnit) -> Double? {
        guard category == other.category else { return nil }
        return quantity * baseFactor / other.baseFactor
    }
}

/// Which meal a food entry belongs to.
enum MealSlot: String, Codable, CaseIterable, Identifiable {
    case breakfast = "Breakfast"
    case lunch     = "Lunch"
    case dinner    = "Dinner"
    case snack     = "Snack"

    var id: String { rawValue }

    /// Ordering used when grouping a day's entries.
    var sortIndex: Int {
        switch self {
        case .breakfast: return 0
        case .lunch:     return 1
        case .dinner:    return 2
        case .snack:     return 3
        }
    }

    var systemImage: String {
        switch self {
        case .breakfast: return "sunrise"
        case .lunch:     return "sun.max"
        case .dinner:    return "moon.stars"
        case .snack:     return "carrot"
        }
    }
}

/// A single logged food or drink item.
///
/// CloudKit-safe: every property has a default value, no unique constraints.
@Model
final class FoodEntry {
    var name: String
    var quantity: Double
    /// Stored as the unit's raw value (see `FoodUnit`).
    var unitRaw: String
    /// Stored as the meal slot's raw value (see `MealSlot`).
    var mealRaw: String

    var calories: Double      // kcal for this entry (0 = unspecified)
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var fiberG: Double

    var notes: String
    var date: Date
    var createdAt: Date

    /// Dedup key for imported items (mirrors the PWA `mywodKey` pattern).
    var externalID: String?

    init(
        name: String,
        quantity: Double = 1,
        unit: FoodUnit = .gram,
        meal: MealSlot = .breakfast,
        calories: Double = 0,
        proteinG: Double = 0,
        carbsG: Double = 0,
        fatG: Double = 0,
        fiberG: Double = 0,
        notes: String = "",
        date: Date = .now,
        externalID: String? = nil
    ) {
        self.name = name
        self.quantity = quantity
        self.unitRaw = unit.rawValue
        self.mealRaw = meal.rawValue
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.fiberG = fiberG
        self.notes = notes
        self.date = date
        self.createdAt = .now
        self.externalID = externalID
    }

    var unit: FoodUnit {
        get { FoodUnit(rawValue: unitRaw) ?? .gram }
        set { unitRaw = newValue.rawValue }
    }

    var meal: MealSlot {
        get { MealSlot(rawValue: mealRaw) ?? .breakfast }
        set { mealRaw = newValue.rawValue }
    }

    /// "150 g" / "500 mL" — quantity with its unit, trimmed of trailing zeros.
    var displayAmount: String {
        let q = quantity.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(quantity))
            : String(format: "%.1f", quantity)
        return "\(q) \(unit.displayName)"
    }
}
