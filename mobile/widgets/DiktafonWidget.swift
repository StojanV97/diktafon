import WidgetKit
import SwiftUI

// MARK: - Data Model

struct WidgetData: Codable {
    let clipCount: Int
    let totalDurationSeconds: Double
    let lastUpdated: String
}

// MARK: - Timeline Provider

struct DiktafonProvider: TimelineProvider {
    func placeholder(in context: Context) -> DiktafonEntry {
        DiktafonEntry(date: Date(), data: WidgetData(clipCount: 0, totalDurationSeconds: 0, lastUpdated: ""))
    }

    func getSnapshot(in context: Context, completion: @escaping (DiktafonEntry) -> Void) {
        completion(DiktafonEntry(date: Date(), data: loadData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DiktafonEntry>) -> Void) {
        let entry = DiktafonEntry(date: Date(), data: loadData())
        let calendar = Calendar.current
        let tomorrow = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: Date())!)
        let timeline = Timeline(entries: [entry], policy: .after(tomorrow))
        completion(timeline)
    }

    private func loadData() -> WidgetData {
        let defaults = UserDefaults(suiteName: "group.com.local.diktafon")
        guard let jsonString = defaults?.string(forKey: "widgetData"),
              let jsonData = jsonString.data(using: .utf8),
              let data = try? JSONDecoder().decode(WidgetData.self, from: jsonData) else {
            return WidgetData(clipCount: 0, totalDurationSeconds: 0, lastUpdated: "")
        }
        return data
    }
}

// MARK: - Timeline Entry

struct DiktafonEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

// MARK: - Widget Views

struct DiktafonWidgetView: View {
    var entry: DiktafonEntry
    @Environment(\.widgetFamily) var family

    var formattedDuration: String {
        let seconds = Int(entry.data.totalDurationSeconds)
        let m = seconds / 60
        let s = seconds % 60
        return "\(m):\(String(format: "%02d", s))"
    }

    var body: some View {
        switch family {
        case .systemMedium:
            mediumWidget
        default:
            smallWidget
        }
    }

    var smallWidget: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: "#3B5EDB"))
                Text("Diktafon")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: "#0F172A"))
            }

            Spacer()

            VStack(alignment: .leading, spacing: 4) {
                Text("\(entry.data.clipCount) snimaka")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Color(hex: "#0F172A"))
                Text(formattedDuration)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(Color(hex: "#64748B"))
            }

            Spacer()

            Link(destination: URL(string: "com.local.diktafon://dailylog?action=record")!) {
                HStack(spacing: 4) {
                    Image(systemName: "record.circle")
                        .font(.system(size: 13, weight: .semibold))
                    Text("Snimi")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color(hex: "#3B5EDB"))
                .cornerRadius(8)
            }
        }
        .padding(12)
    }

    var mediumWidget: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: "#3B5EDB"))
                    Text("Diktafon")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: "#0F172A"))
                }

                Spacer()

                VStack(alignment: .leading, spacing: 4) {
                    Text("\(entry.data.clipCount)")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(Color(hex: "#0F172A"))
                    Text("snimaka")
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "#64748B"))
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("ukupno")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "#64748B"))
                Text(formattedDuration)
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: "#0F172A"))

                Spacer()

                Link(destination: URL(string: "com.local.diktafon://dailylog?action=record")!) {
                    HStack(spacing: 4) {
                        Image(systemName: "record.circle")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Snimi")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color(hex: "#3B5EDB"))
                    .cornerRadius(8)
                }
            }
        }
        .padding(16)
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let scanner = Scanner(string: hex)
        var rgbValue: UInt64 = 0
        scanner.scanHexInt64(&rgbValue)
        let r = Double((rgbValue & 0xFF0000) >> 16) / 255.0
        let g = Double((rgbValue & 0x00FF00) >> 8) / 255.0
        let b = Double(rgbValue & 0x0000FF) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - Widget Entry Point

@main
struct DiktafonWidgetBundle: Widget {
    let kind: String = "DiktafonWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DiktafonProvider()) { entry in
            if #available(iOS 17.0, *) {
                DiktafonWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                DiktafonWidgetView(entry: entry)
                    .background(Color.white)
            }
        }
        .configurationDisplayName("Diktafon")
        .description("Brzi pristup snimanju")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
