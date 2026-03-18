const { withEntitlementsPlist, withInfoPlist } = require("@expo/config-plugins")

const ICLOUD_CONTAINER = "iCloud.com.diktafon.app"

/**
 * Expo config plugin that adds iCloud Documents capability.
 * Enables the iCloud container for document sync.
 */
function withICloud(config) {
  // Add iCloud entitlements
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.icloud-container-identifiers"] = [
      ICLOUD_CONTAINER,
    ]
    config.modResults["com.apple.developer.icloud-services"] = [
      "CloudDocuments",
    ]
    config.modResults["com.apple.developer.ubiquity-container-identifiers"] = [
      ICLOUD_CONTAINER,
    ]
    return config
  })

  // Add NSUbiquitousContainers to Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSUbiquitousContainers = {
      [ICLOUD_CONTAINER]: {
        NSUbiquitousContainerIsDocumentScopePublic: true,
        NSUbiquitousContainerSupportedFolderLevels: "Any",
        NSUbiquitousContainerName: "Diktafon",
      },
    }
    return config
  })

  return config
}

module.exports = withICloud
