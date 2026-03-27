import React from "react";
import { getHeaderTitle } from "@react-navigation/elements";
import { colors } from "../../theme";
import DetailScreenHeader from "../components/DetailScreenHeader";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";

export const stackScreenOptions = {
  animation: "slide_from_right" as const,
  contentStyle: { backgroundColor: colors.background },
  header: ({ options, route }: NativeStackHeaderProps) => (
    <DetailScreenHeader title={getHeaderTitle(options, route.name)} />
  ),
};
