import ExpoModulesCore
import WidgetKit
import ActivityKit

public class ReactNativeWidgetExtensionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ReactNativeWidgetExtension")

        Function("setWidgetData") { (jsonString: String) in
            let defaults = UserDefaults(suiteName: "group.com.local.diktafon")
            defaults?.set(jsonString, forKey: "widgetData")
            defaults?.synchronize()

            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }

        Function("areActivitiesEnabled") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }
    }
}
