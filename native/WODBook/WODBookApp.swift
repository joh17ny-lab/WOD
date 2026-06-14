import SwiftUI
import SwiftData

@main
struct WODBookApp: App {
    /// Set to `true` after you enable the iCloud + CloudKit capability in Xcode
    /// (see README → "Enabling iCloud sync"). Leaving it `false` keeps the app
    /// fully local so it builds and runs without a paid developer account.
    private static let cloudSyncEnabled = false

    /// Shared SwiftData container holding all persisted models.
    let container: ModelContainer = {
        let schema = Schema([
            WODEntry.self,
            LiftPR.self,
            FoodEntry.self,
            MacroTargets.self,
            BodyMass.self
        ])

        let config: ModelConfiguration
        if cloudSyncEnabled {
            // Syncs to the user's private CloudKit database across their devices.
            config = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: false,
                cloudKitDatabase: .automatic
            )
        } else {
            config = ModelConfiguration(
                schema: schema,
                isStoredInMemoryOnly: false,
                cloudKitDatabase: .none
            )
        }

        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
        .modelContainer(container)
    }
}
