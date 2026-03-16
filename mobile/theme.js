import { MD3LightTheme } from "react-native-paper";

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#4A9EFF",
    background: "#F5F5F5",
    surface: "#FFFFFF",
    surfaceVariant: "#F8F8F8",
    onSurface: "#111111",
    onSurfaceVariant: "#555555",
    outline: "#E0E0E0",
    error: "#D32F2F",
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: "#F5F5F5",
      level1: "#F0F0F0",
      level2: "#FFFFFF",
    },
  },
};
