const { getDefaultConfig } = require("expo/metro-config")

const config = getDefaultConfig(__dirname)

// Production JS obfuscation — only active for non-dev builds
if (process.env.NODE_ENV === "production") {
  const {
    obfuscatorPlugin,
  } = require("obfuscator-io-metro-plugin")(
    {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.3,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.1,
      stringArray: true,
      stringArrayEncoding: ["rc4"],
      stringArrayThreshold: 0.5,
      disableConsoleOutput: true,
    },
    { runInDev: false, logObfuscatedFiles: false }
  )
  config.serializer = {
    ...config.serializer,
    customSerializer: obfuscatorPlugin,
  }
}

module.exports = config
