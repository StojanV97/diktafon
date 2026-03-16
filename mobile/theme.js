import { Platform } from "react-native";
import { MD3LightTheme } from "react-native-paper";

// ── Color tokens ────────────────────────────────────────────────
export const colors = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  foreground: "#0F172A",
  muted: "#64748B",
  primary: "#3B5EDB",
  primaryLight: "#EBF0FB",
  success: "#31C47E",
  successLight: "#ECFDF5",
  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  danger: "#E04040",
  dangerLight: "#FEF2F2",
  borderGhost: "rgba(0,0,0,0.06)",
};

// ── Spacing (4px base) ──────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// ── Border radii (concentric system) ────────────────────────────
export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
};

// ── Elevation presets ───────────────────────────────────────────
const ghostBorder = {
  borderWidth: 0.5,
  borderColor: colors.borderGhost,
};

export const elevation = {
  sm: {
    ...ghostBorder,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  md: {
    ...ghostBorder,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  lg: {
    ...ghostBorder,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
};

// ── Typography presets ──────────────────────────────────────────
export const typography = {
  monoLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.foreground,
  },
  heading: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.foreground,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
  },
  caption: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
};

// ── Folder color palette ────────────────────────────────────────
export const FOLDER_COLORS = [
  "#3B5EDB",
  "#E04040",
  "#31C47E",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

// ── Paper theme override ────────────────────────────────────────
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.background,
    onSurface: colors.foreground,
    onSurfaceVariant: colors.muted,
    outline: colors.borderGhost,
    error: colors.danger,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: colors.background,
      level1: colors.background,
      level2: colors.surface,
    },
  },
};
