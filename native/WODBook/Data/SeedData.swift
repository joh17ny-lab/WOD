import Foundation

/// Static seed catalogs for benchmarks and the movement library.
enum SeedData {

    // MARK: - Benchmark WODs

    static let benchmarks: [Benchmark] = [
        // The Girls
        Benchmark(name: "Fran", category: .girls, type: .forTime,
                  description: "21-15-9 reps for time:\n• Thrusters (95/65 lb)\n• Pull-ups"),
        Benchmark(name: "Grace", category: .girls, type: .forTime,
                  description: "30 Clean & Jerks (135/95 lb) for time."),
        Benchmark(name: "Isabel", category: .girls, type: .forTime,
                  description: "30 Snatches (135/95 lb) for time."),
        Benchmark(name: "Helen", category: .girls, type: .forTime,
                  description: "3 rounds for time:\n• 400 m run\n• 21 KB swings (1.5/1 pood)\n• 12 pull-ups"),
        Benchmark(name: "Cindy", category: .girls, type: .amrap,
                  description: "AMRAP in 20 min:\n• 5 pull-ups\n• 10 push-ups\n• 15 air squats"),
        Benchmark(name: "Annie", category: .girls, type: .forTime,
                  description: "50-40-30-20-10 reps for time:\n• Double-unders\n• Sit-ups"),
        Benchmark(name: "Diane", category: .girls, type: .forTime,
                  description: "21-15-9 reps for time:\n• Deadlifts (225/155 lb)\n• Handstand push-ups"),
        Benchmark(name: "Karen", category: .girls, type: .forTime,
                  description: "150 wall-ball shots (20/14 lb) for time."),
        Benchmark(name: "Elizabeth", category: .girls, type: .forTime,
                  description: "21-15-9 reps for time:\n• Cleans (135/95 lb)\n• Ring dips"),
        Benchmark(name: "Jackie", category: .girls, type: .forTime,
                  description: "For time:\n• 1000 m row\n• 50 thrusters (45/35 lb)\n• 30 pull-ups"),

        // Hero WODs
        Benchmark(name: "Murph", category: .heroes, type: .forTime,
                  description: "For time (with 20/14 lb vest):\n• 1 mile run\n• 100 pull-ups\n• 200 push-ups\n• 300 air squats\n• 1 mile run"),
        Benchmark(name: "DT", category: .heroes, type: .forTime,
                  description: "5 rounds for time (155/105 lb):\n• 12 deadlifts\n• 9 hang power cleans\n• 6 push jerks"),
        Benchmark(name: "Chad", category: .heroes, type: .forTime,
                  description: "1000 box step-ups (20\" box, 45/35 lb ruck) for time."),
        Benchmark(name: "JT", category: .heroes, type: .forTime,
                  description: "21-15-9 reps for time:\n• Handstand push-ups\n• Ring dips\n• Push-ups"),
        Benchmark(name: "Michael", category: .heroes, type: .forTime,
                  description: "3 rounds for time:\n• 800 m run\n• 50 back extensions\n• 50 sit-ups"),
        Benchmark(name: "The Seven", category: .heroes, type: .forTime,
                  description: "7 rounds for time:\n• 7 HSPU\n• 7 thrusters (135/95)\n• 7 KB swings (2/1.5 pood)\n• 7 deadlifts (245/165)\n• 7 burpees\n• 7 KTE\n• 7 pull-ups")
    ]

    static func benchmarks(in category: BenchmarkCategory) -> [Benchmark] {
        benchmarks.filter { $0.category == category }
    }

    // MARK: - Movement Library

    static let movements: [Movement] = [
        Movement(name: "Thruster", category: .weightlifting, abbreviation: "THR",
                 summary: "Front squat into a push press in one fluid motion."),
        Movement(name: "Clean", category: .weightlifting, abbreviation: "CLN",
                 summary: "Pull the bar from the floor to the front-rack in a squat."),
        Movement(name: "Snatch", category: .weightlifting, abbreviation: "SN",
                 summary: "Pull the bar from the floor to overhead in one motion."),
        Movement(name: "Deadlift", category: .weightlifting, abbreviation: "DL",
                 summary: "Lift the bar from the floor to the hips with a flat back."),
        Movement(name: "Clean & Jerk", category: .weightlifting, abbreviation: "C&J",
                 summary: "A clean immediately followed by a jerk overhead."),
        Movement(name: "Overhead Squat", category: .weightlifting, abbreviation: "OHS",
                 summary: "Squat with the bar held locked out overhead."),
        Movement(name: "Push Press", category: .weightlifting, abbreviation: "PP",
                 summary: "Press the bar overhead using a slight dip-and-drive."),

        Movement(name: "Pull-up", category: .gymnastics, abbreviation: "PU",
                 summary: "Pull chin over the bar from a dead hang."),
        Movement(name: "Toes-to-Bar", category: .gymnastics, abbreviation: "T2B",
                 summary: "Raise toes to touch the bar while hanging."),
        Movement(name: "Handstand Push-up", category: .gymnastics, abbreviation: "HSPU",
                 summary: "Press from a handstand until arms lock out."),
        Movement(name: "Muscle-up", category: .gymnastics, abbreviation: "MU",
                 summary: "Transition from a pull-up to a dip above the rings/bar."),
        Movement(name: "Ring Dip", category: .gymnastics, abbreviation: "RD",
                 summary: "Dip on rings until shoulders pass below elbows."),
        Movement(name: "Air Squat", category: .gymnastics, abbreviation: "AS",
                 summary: "Bodyweight squat below parallel."),

        Movement(name: "Row", category: .monostructural, abbreviation: "ROW",
                 summary: "Erg rowing for distance or calories."),
        Movement(name: "Double-under", category: .monostructural, abbreviation: "DU",
                 summary: "Jump rope passing twice per jump."),
        Movement(name: "Run", category: .monostructural, abbreviation: "RUN",
                 summary: "Running for distance, typically 200–800 m intervals."),
        Movement(name: "Assault Bike", category: .monostructural, abbreviation: "BIKE",
                 summary: "Fan bike for calories or distance."),

        Movement(name: "Sit-up", category: .core, abbreviation: "SU",
                 summary: "Anchored or AbMat sit-up for the core."),
        Movement(name: "Hollow Hold", category: .core, abbreviation: "HH",
                 summary: "Isometric hold with lower back pressed to the floor."),

        Movement(name: "Kettlebell Swing", category: .accessory, abbreviation: "KBS",
                 summary: "Hip-driven swing of a kettlebell to eye level or overhead."),
        Movement(name: "Wall Ball", category: .accessory, abbreviation: "WB",
                 summary: "Squat and throw a medicine ball to a target."),
        Movement(name: "Box Jump", category: .accessory, abbreviation: "BJ",
                 summary: "Jump onto a box and stand to full extension.")
    ]

    static func movements(in category: MovementCategory) -> [Movement] {
        movements.filter { $0.category == category }
    }
}
