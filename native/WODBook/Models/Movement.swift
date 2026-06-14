import Foundation

/// Category for movements in the reference library.
enum MovementCategory: String, Codable, CaseIterable, Identifiable {
    case weightlifting = "Weightlifting"
    case gymnastics    = "Gymnastics"
    case monostructural = "Cardio / Mono"
    case core          = "Core"
    case accessory     = "Accessory"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .weightlifting:  return "dumbbell"
        case .gymnastics:     return "figure.gymnastics"
        case .monostructural: return "figure.run"
        case .core:           return "figure.core.training"
        case .accessory:      return "figure.strengthtraining.functional"
        }
    }
}

/// A reference movement. This is static seed data (not persisted as SwiftData),
/// kept as a lightweight value type for the library browser.
struct Movement: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let category: MovementCategory
    let abbreviation: String
    let summary: String
}
