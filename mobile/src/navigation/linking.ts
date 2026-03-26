export const linking = {
  prefixes: ["com.diktafon.app://", "diktafon://"],
  config: {
    screens: {
      DailyLogsTab: {
        screens: {
          DailyLogsRoot: { path: "dailylog" },
        },
      },
      PlansTab: { path: "plans" },
      RemindersTab: {
        screens: {
          RemindersRoot: { path: "reminders" },
        },
      },
    },
  },
  getStateFromPath(path: string, config: any) {
    const {
      getStateFromPath: defaultGetState,
    } = require("@react-navigation/native");
    const normalized = path.replace(/^\/+/, "");
    if (normalized === "record") {
      return {
        routes: [{
          name: "DailyLogsTab",
          state: {
            routes: [{ name: "DailyLogsRoot", params: { action: "record" } }],
          },
        }],
      };
    }
    return defaultGetState(path, config);
  },
};
