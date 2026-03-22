const { withAndroidManifest } = require("@expo/config-plugins")

/**
 * Expo config plugin that disables Android auto-backup.
 * Prevents Google from backing up AsyncStorage, cache files,
 * and other app data to the cloud.
 */
function withDisableBackup(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0]
    app.$["android:allowBackup"] = "false"
    delete app.$["android:fullBackupContent"]
    delete app.$["android:dataExtractionRules"]
    return config
  })
}

module.exports = withDisableBackup
