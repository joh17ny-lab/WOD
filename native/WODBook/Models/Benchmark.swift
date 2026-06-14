import Foundation

/// A built-in benchmark WOD (the "Girls" and "Hero" workouts).
struct Benchmark: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let category: BenchmarkCategory
    let type: WODType
    let description: String
}

enum BenchmarkCategory: String, CaseIterable, Identifiable {
    case girls = "The Girls"
    case heroes = "Hero WODs"
    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .girls:  return "star.fill"
        case .heroes: return "shield.fill"
        }
    }
}
