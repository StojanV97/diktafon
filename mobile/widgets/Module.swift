import ExpoModulesCore
import WidgetKit
import ActivityKit

public class ReactNativeWidgetExtensionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ReactNativeWidgetExtension")

        Function("setWidgetData") { (jsonString: String) in
            let defaults = UserDefaults(suiteName: "group.com.diktafon.app")
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

        Function("getPendingAction") { () -> String? in
            let defaults = UserDefaults(suiteName: "group.com.diktafon.app")
            let pending = defaults?.bool(forKey: "pendingRecordAction") ?? false
            if pending {
                defaults?.removeObject(forKey: "pendingRecordAction")
                defaults?.synchronize()
                return "record"
            }
            return nil
        }
    }
}
