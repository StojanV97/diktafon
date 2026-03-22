import { colors } from "../../theme";

export const stackScreenOptions = {
  animation: "slide_from_right" as const,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.foreground,
  headerTitleStyle: {
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  contentStyle: { backgroundColor: colors.background },
};
