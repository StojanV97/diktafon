const IS_DEV = process.env.EAS_BUILD_PROFILE === "development"

module.exports = {
  expo: {
    name: "Diktaphone",
    slug: "diktafon",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "com.diktafon.app",
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.diktafon.app",
      buildNumber: "1",
      infoPlist: {
        NSMicrophoneUsageDescription:
          "Diktafon koristi mikrofon za snimanje glasovnih zapisa.",
        NSFileProtectionKey: "NSFileProtectionCompleteUntilFirstUserAuthentication",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#FFFFFF",
      },
      package: "com.diktafon.app",
      permissions: ["READ_EXTERNAL_STORAGE", "RECORD_AUDIO"],
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
      [
        "@sentry/react-native/expo",
        {
          // TODO: Replace with your Sentry organization and project slugs
          organization: "YOUR_SENTRY_ORG",
          project: "diktafon",
        },
      ],
    ],
    experiments: {
      reactCompiler: true,
    },
  },
}
