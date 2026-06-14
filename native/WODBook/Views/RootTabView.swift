import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            HistoryView()
                .tabItem { Label("Log", systemImage: "list.bullet.rectangle") }

            BenchmarkListView()
                .tabItem { Label("Benchmarks", systemImage: "star") }

            LiftListView()
                .tabItem { Label("Lifts", systemImage: "scalemass") }

            TimerView()
                .tabItem { Label("Timer", systemImage: "stopwatch") }

            CalendarView()
                .tabItem { Label("Calendar", systemImage: "calendar") }

            MoreView()
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}

/// Groups secondary features (Movements library, Progress charts).
struct MoreView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Nutrition") {
                    NavigationLink {
                        NutritionView()
                    } label: {
                        Label("Food & Drink Log", systemImage: "fork.knife")
                    }

                    NavigationLink {
                        MacroTargetsView()
                    } label: {
                        Label("Macro Goals", systemImage: "target")
                    }
                }

                Section("Body") {
                    NavigationLink {
                        BodyweightView()
                    } label: {
                        Label("Bodyweight", systemImage: "figure")
                    }
                }

                Section("Devices & Import") {
                    NavigationLink {
                        HealthActivityView()
                    } label: {
                        Label("Apple Health", systemImage: "heart.fill")
                    }

                    NavigationLink {
                        ActivityImportView()
                    } label: {
                        Label("Import Activity File", systemImage: "square.and.arrow.down")
                    }
                }

                Section {
                    NavigationLink {
                        ProgressDashboardView()
                    } label: {
                        Label("Progress & Charts", systemImage: "chart.xyaxis.line")
                    }

                    NavigationLink {
                        MovementLibraryView()
                    } label: {
                        Label("Movement Library", systemImage: "books.vertical")
                    }
                }
            }
            .navigationTitle("More")
        }
    }
}

#Preview {
    RootTabView()
        .modelContainer(for: [WODEntry.self, LiftPR.self, FoodEntry.self,
                              MacroTargets.self, BodyMass.self],
                        inMemory: true)
}
