import SwiftUI

/// Reference library of CrossFit movements, grouped by category and searchable.
struct MovementLibraryView: View {
    @State private var searchText = ""

    private var categories: [MovementCategory] { MovementCategory.allCases }

    private func movements(in category: MovementCategory) -> [Movement] {
        let all = SeedData.movements(in: category)
        guard !searchText.isEmpty else { return all }
        return all.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.abbreviation.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        List {
            ForEach(categories) { category in
                let items = movements(in: category)
                if !items.isEmpty {
                    Section {
                        ForEach(items) { movement in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(movement.name).font(.headline)
                                    Spacer()
                                    Text(movement.abbreviation)
                                        .font(.caption.bold())
                                        .foregroundStyle(.tint)
                                }
                                Text(movement.summary)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 2)
                        }
                    } header: {
                        Label(category.rawValue, systemImage: category.systemImage)
                    }
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search movements")
        .navigationTitle("Movements")
    }
}

#Preview {
    NavigationStack { MovementLibraryView() }
}
