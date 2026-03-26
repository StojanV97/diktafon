import { Platform } from "react-native";
import { MD3LightTheme } from "react-native-paper";

// ── Color tokens ────────────────────────────────────────────────
export const colors = {
  // Surfaces
  background: "#FAF9F6",
  surface: "#FFFFFF",
  surfaceSecondary: "#F3F1EE",

  // Text
  foreground: "#1E293B",
  muted: "#6B7280",

  // Brand
  primary: "#4A6FA5",
  primaryLight: "#EEF3FA",

  // Status
  success: "#3D9A5F",
  successLight: "#ECFDF5",
  warning: "#D97706",
  warningLight: "#FFFBEB",
  danger: "#DC4A3D",
  dangerLight: "#FEF2F2",

  // Utility
  borderGhost: "rgba(0,0,0,0.05)",
  divider: "#E8E5E0",
  overlay: "rgba(255,255,255,0.92)",

  // Badge backgrounds (moved from hardcoded in components)
  badgePending: "#EEF3FA",
  badgeSnoozed: "#FEF3C7",
  badgeDone: "#DCFCE7",
  badgeNeutral: "#F3F1EE",

  // Badge foregrounds
  badgePendingFg: "#4A6FA5",
  badgeSnoozedFg: "#D97706",
  badgeDoneFg: "#16A34A",
};

// ── Spacing (4px base) ──────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// ── Border radii (concentric system) ────────────────────────────
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

// ── Icon size hierarchy ─────────────────────────────────────────
export const iconSize = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
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
        shadowColor: "#8B7355",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  md: {
    ...ghostBorder,
    ...Platform.select({
      ios: {
        shadowColor: "#8B7355",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
    }),
  },
  lg: {
    ...ghostBorder,
    ...Platform.select({
      ios: {
        shadowColor: "#8B7355",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
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
  subheading: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.foreground,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
  },
  bodySmall: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.foreground,
  },
  caption: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: colors.primary,
  },
  mono: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    color: colors.muted,
  },
};

// ── Folder color palette ────────────────────────────────────────
export const FOLDER_COLORS = [
  "#4A6FA5",
  "#DC4A3D",
  "#3D9A5F",
  "#D97706",
  "#8B5CF6",
  "#D4577A",
  "#2D8A7F",
  "#C4841D",
];

// ── Standard card style ─────────────────────────────────────────
export const card = {
  backgroundColor: colors.surface,
  borderRadius: radii.lg,
  padding: spacing.lg,
  marginBottom: spacing.md,
};

// ── Paper theme override ────────────────────────────────────────
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceSecondary,
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
