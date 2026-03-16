import { MD3DarkTheme } from "react-native-paper";

export const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#4A9EFF",
    background: "#111",
    surface: "#1E1E1E",
    surfaceVariant: "#1A1A1A",
    onSurface: "#FFFFFF",
    onSurfaceVariant: "#AAAAAA",
    outline: "#2A2A2A",
    error: "#FF6B6B",
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: "#111",
      level1: "#1A1A1A",
      level2: "#1E1E1E",
    },
  },
};
