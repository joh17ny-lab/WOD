# WODBook

A CrossFit / functional-fitness workout tracker for iOS, inspired by **myWOD**.
Built with **SwiftUI** + **SwiftData**, targeting **iOS 17+**.

## Features

| Tab | Feature |
|-----|---------|
| **Log** | Log any WOD with title, type (For Time / AMRAP / EMOM / Rounds / Load / Distance), description, result, RX flag, notes, and date. Searchable, swipe-to-delete history. |
| **Benchmarks** | Built-in "Girls" (Fran, Grace, Cindy, …) and "Hero" WODs (Murph, DT, …). Log attempts per benchmark, see your personal best (fastest time for timed WODs) and full attempt history. |
| **Lifts** | Track 1RM / strength PRs for common barbell lifts (or custom). Logs sub-maximal sets with automatic **estimated 1RM** (Epley formula) and a progress line chart per lift. |
| **Timer** | Built-in WOD timer with four modes — **For Time** (stopwatch + round splits), **AMRAP** (countdown), **EMOM**, and **Tabata** (work/rest intervals). Sound + haptic cues on each round and at the finish, then a prompt to log the result as a WOD entry. |
| **Calendar** | Month grid that dots days with logged workouts; tap a day to see its entries. |
| **More → Nutrition** | Per-day food & drink log grouped by meal (Breakfast / Lunch / Dinner / Snack). Each entry has a quantity + unit that distinguishes **solids** (g, kg, oz, lb), **liquids** (mL, L, fl oz, cup, tbsp, tsp), and **count** (piece, serving), plus optional calories and macros (protein / carbs / fat / fiber). Daily totals show consumed-vs-target progress bars. |
| **More → Macro Goals** | User-defined daily targets: calories, protein, carbs, fat, fiber, and water. Optionally derive calories from macros (4 / 4 / 9 kcal per g). |
| **More → Bodyweight** | Track bodyweight over time (lb/kg, matching Lifts) with a trend chart, manual entry, and **import full history from Apple Health** (de-duped by sample UUID). |
| **More → Apple Health** | Connect to HealthKit to import recent **workouts** (from Apple Watch, or Garmin/Fitbit/Whoop apps that sync into Health) and read your latest **bodyweight**. Import workouts one-by-one or **Import All** at once; all are de-duplicated by their Health UUID. |
| **Log → Edit WOD → Apple Health** | Write a manually-logged workout **back to Apple Health** — duration auto-filled from a timed result, **distance auto-filled** from an `m`/`km`/`mi` result, optional calories. Requires Health write permission. |
| **Bodyweight → swipe → To Health** | Swipe a manually-logged bodyweight reading to **write it to Apple Health**. |
| **More → Import Activity File** | Import a workout from a `.tcx` or `.gpx` file exported by a watch / Garmin Connect — useful when an activity isn't in Apple Health. |
| **More → Progress** | Dashboard: total workouts, workouts this month, lifts tracked, count of device-imported workouts, workouts-per-month bar chart, a bodyweight trend chart, and a top-lifts e1RM chart. |
| **More → Movements** | Searchable reference library of common movements grouped by category. |

## Project layout

```
WODBook/
├── WODBook.xcodeproj/            # Open this in Xcode
└── WODBook/
    ├── WODBookApp.swift          # @main, SwiftData ModelContainer
    ├── Models/
    │   ├── WODEntry.swift        # @Model — logged workouts
    │   ├── LiftPR.swift          # @Model — lift PRs + e1RM
    │   ├── BodyMass.swift        # @Model — bodyweight readings (lb/kg)
    │   ├── FoodEntry.swift       # @Model — food/drink log + FoodUnit/MealSlot
    │   ├── MacroTargets.swift    # @Model — user-defined daily macro goals
    │   ├── Movement.swift        # value type — library entries
    │   └── Benchmark.swift       # value type — built-in WODs
    ├── Data/
    │   └── SeedData.swift        # benchmark + movement catalogs
    ├── Timer/
    │   ├── TimerEngine.swift     # all 4 timer modes (ObservableObject)
    │   ├── SoundPlayer.swift     # system-sound cues + haptics
    │   └── TimerView.swift       # timer UI + log-result prompt
    ├── Health/
    │   ├── HealthKitManager.swift   # HealthKit auth + read workouts/bodyweight
    │   └── ActivityFileParser.swift # .tcx / .gpx summary parser
    ├── Views/                    # one file per screen
    ├── Assets.xcassets/          # AppIcon + AccentColor
    └── WODBook.entitlements      # iCloud / CloudKit + push entitlements
```

## How to run

1. Copy the `WODBook` folder to a Mac with **Xcode 15 or later**.
2. Open `WODBook.xcodeproj`.
3. (Optional) In the **WODBook** target → *Signing & Capabilities*, pick your
   development team. The bundle ID is `com.johnny.WODBook` — change it if needed.
4. Select an iOS 17+ simulator (e.g. iPhone 15) and press **⌘R**.

No third-party dependencies — only Apple frameworks (`SwiftUI`, `SwiftData`,
`Charts`, `AVFoundation`, `AudioToolbox`, `UIKit`, `HealthKit`).

> **HealthKit:** the project ships with the HealthKit entitlement and usage
> strings. In Xcode → target → *Signing & Capabilities*, make sure **HealthKit**
> is listed (add it if signing strips it). HealthKit only returns data on a real
> device or a simulator with Health data; reads require the user to grant access
> on first use. Garmin/Fitbit/Whoop data appears here when their apps are set to
> write into Apple Health.

> The app ships **local-only by default** so it builds and runs without a paid
> Apple Developer account. iCloud sync is wired up but switched off until you
> enable it (see below).

## Enabling iCloud sync (CloudKit)

SwiftData can mirror your data to each user's **private** iCloud database so it
syncs across their devices. This requires a **paid Apple Developer account**.

1. Open the project in Xcode and select the **WODBook** target.
2. **Signing & Capabilities** → set your **Team** (signing must succeed).
3. Click **+ Capability** and add **iCloud**.
   - Check **CloudKit**.
   - Under *Containers*, add/select `iCloud.com.johnny.WODBook`
     (must match the value in `WODBook.entitlements` — change both if you use a
     different bundle ID).
4. Click **+ Capability** again and add **Background Modes** →
   check **Remote notifications** (already set via `INFOPLIST_KEY_UIBackgroundModes`).
5. In `WODBookApp.swift`, flip the flag:

   ```swift
   private static let cloudSyncEnabled = true
   ```

6. Build & run on two devices/simulators signed into the **same iCloud account**.
   New entries appear on both within a few seconds.

**Notes**
- `cloudKitDatabase: .automatic` is used when the flag is on; `.none` otherwise.
- SwiftData + CloudKit requires every model property to be optional or have a
  default — `WODEntry` and `LiftPR` already satisfy this (all properties are set
  in their initializers, no unique constraints, no non-optional relationships).
- The `aps-environment` entitlement is set to `development`; Xcode promotes it to
  `production` automatically for App Store / TestFlight builds.

## Notes & next steps

- Persisted models: `WODEntry`, `LiftPR`, `BodyMass`, `FoodEntry`, `MacroTargets`. Benchmarks/movements are static seed data.
- `MacroTargets` is a single settings record fetched-or-created via `MacroTargets.current(in:)`.
- Food/drink units are grouped by category (Solid / Liquid / Count); conversions are only valid within a category — see `FoodUnit.convert(_:to:)`.
- "Personal best" for timed benchmarks parses `mm:ss`; other types use the latest scored attempt.
- The timer uses built-in system sounds (no audio files) and plays cues even on
  silent via an `AVAudioSession` `.playback` category that mixes with music.
- Easy future additions: notifications/reminders, a Live Activity for the
  running timer, and a dedicated Apple Watch app.
- **Device sync:** Apple Health import (workouts + bodyweight) and `.tcx`/`.gpx`
  file import are implemented. **Direct** Garmin/Fitbit/Whoop API sync still
  requires OAuth + a back-end and is out of scope — see `../wodbook.md`
  (Feature 3c). The recommended path is letting those apps write into Apple
  Health, which WODBook already reads.
