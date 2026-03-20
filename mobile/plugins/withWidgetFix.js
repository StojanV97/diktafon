const { withXcodeProject } = require("@expo/config-plugins");

module.exports = function withWidgetFix(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targetName = "DiktaphoneWidgets";

    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key in buildConfigs) {
      const cfg = buildConfigs[key];
      if (
        cfg.buildSettings &&
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER &&
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER.includes(targetName)
      ) {
        cfg.buildSettings.SKIP_INSTALL = "YES";
        cfg.buildSettings.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
      }
    }

    // Link AppIntents.framework to the widget extension target
    const nativeTargets = project.pbxNativeTargetSection();
    let widgetTargetUuid;
    for (const key in nativeTargets) {
      const t = nativeTargets[key];
      if (typeof t === "object" && t.name && t.name.replace(/"/g, "") === targetName) {
        widgetTargetUuid = key;
        break;
      }
    }

    if (widgetTargetUuid) {
      project.addFramework("AppIntents.framework", {
        target: widgetTargetUuid,
        link: true,
      });
    }

    return config;
  });
};
