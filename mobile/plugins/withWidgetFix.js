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

    return config;
  });
};
