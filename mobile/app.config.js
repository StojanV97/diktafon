const IS_DEV = process.env.EAS_BUILD_PROFILE === "development"

module.exports = {
  expo: {
    name: "Diktaphone",
    slug: "diktafon",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: ["com.diktafon.app", "diktafon"],
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.diktafon.app",
      buildNumber: "1",
      infoPlist: {
        NSMicrophoneUsageDescription:
          "Diktafon koristi mikrofon za snimanje glasovnih zapisa.",
        NSFileProtectionKey: "NSFileProtectionCompleteUntilFirstUserAuthentication",
        // AES-256-GCM used for local data-at-rest protection only (not network communication).
        // Qualifies as exempt under Apple's encryption FAQ and EAR Category 5 Part 2 Note 4
        // (mass-market encryption for personal data protection).
        ITSAppUsesNonExemptEncryption: false,
        NSFaceIDUsageDescription: "Diktafon koristi Face ID za zastitu vasih podataka.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#FFFFFF",
      },
      package: "com.diktafon.app",
      permissions: ["READ_EXTERNAL_STORAGE", "RECORD_AUDIO", "POST_NOTIFICATIONS"],
    },
    plugins: [
      [
        "expo-document-picker",
        {
          iCloudContainerEnvironment: "Production",
        },
      ],
      "expo-asset",
      "expo-font",
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "15.1",
          },
          android: {
            minSdkVersion: 24,
            ndkVersion: "26.1.10909125",
          },
        },
      ],
      // expo-dev-client only in dev builds — excluded from production
      ...(IS_DEV ? ["expo-dev-client"] : []),
      "expo-secure-store",
      [
        "@react-native-google-signin/google-signin",
        {
          // TODO: Replace with your Google Cloud Console OAuth Web Client ID
          webClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
          iosUrlScheme: "com.googleusercontent.apps.YOUR_WEB_CLIENT_ID",
          offlineAccess: true,
          scopes: ["https://www.googleapis.com/auth/drive.appdata"],
        },
      ],
      "./plugins/withDisableBackup",
      "expo-apple-authentication",
      "./plugins/withICloud",
      [
        "react-native-widget-extension",
        {
          widgetsFolder: "widgets",
          groupIdentifier: "group.com.diktafon.app",
          deploymentTarget: "17.0",
        },
      ],
      "./plugins/withWidgetFix",
      "expo-notifications",
      "@react-native-community/datetimepicker",
      [
        "@sentry/react-native/expo",
        {
          // TODO: Replace with your Sentry organization and project slugs
          organization: "YOUR_SENTRY_ORG",
          project: "diktafon",
        },
      ],
    ],
    extra: {
      FREERASP_APPLE_TEAM_ID: process.env.FREERASP_APPLE_TEAM_ID || "",
      FREERASP_ANDROID_CERT_HASH: process.env.FREERASP_ANDROID_CERT_HASH || "",
      FREERASP_WATCHER_MAIL: process.env.FREERASP_WATCHER_MAIL || "",
    },
    experiments: {
      reactCompiler: true,
    },
  },
}
