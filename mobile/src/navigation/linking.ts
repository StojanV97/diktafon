const VALID_DEEP_LINK_SCREENS = new Set(["DailyLog", "Reminders"]);

export const linking = {
  prefixes: ["com.diktafon.app://", "diktafon://"],
  config: {
    screens: {
      DailyLog: { path: "dailylog" },
      Reminders: { path: "reminders" },
    },
  },
  getStateFromPath(path: string, config: any) {
    const {
      getStateFromPath: defaultGetState,
    } = require("@react-navigation/native");
    const normalized = path.replace(/^\/+/, "");
    if (normalized === "record") {
      return {
        routes: [{ name: "DailyLog", params: { action: "record" } }],
      };
    }
    const state = defaultGetState(path, config);
    if (!state?.routes?.length) return undefined;
    const allValid = state.routes.every((r: any) =>
      VALID_DEEP_LINK_SCREENS.has(r.name)
    );
    return allValid ? state : undefined;
  },
};
