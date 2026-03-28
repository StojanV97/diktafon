import React, { memo, useCallback, useMemo, useRef } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii } from "../theme";
import { t } from "../src/i18n";

const MONTHS = t('calendar.months');
const DAYS = t('calendar.days');

const CHIP_W = 44;
const CHIP_H = 56;
const CHIP_MARGIN = 8;
const ITEM_SIZE = CHIP_W + CHIP_MARGIN;

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

const DayChip = memo(function DayChip({ dateStr, day, dayOfWeek, count, isToday, isSelected, onPress }) {
  const hasEntries = count > 0;

  let bg, textColor;
  if (isSelected) {
    bg = colors.primary;
    textColor = colors.surface;
  } else if (isToday) {
    bg = colors.primaryLight;
    textColor = colors.primary;
  } else if (hasEntries) {
    bg = colors.surface;
    textColor = colors.foreground;
  } else {
    bg = "transparent";
    textColor = colors.muted;
  }

  const dotCount = Math.min(count, 3);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(isSelected ? null : dateStr)}
      style={[
        styles.chip,
        { backgroundColor: bg },
        hasEntries && !isSelected && !isToday && chipElevation,
        !hasEntries && !isToday && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.chipDayAbbr, { color: textColor }]}>{DAYS[dayOfWeek]}</Text>
      <Text style={[styles.chipDayNum, { color: textColor }]}>{day}</Text>
      {isSelected && count > 0 ? (
        <Text style={styles.chipCount}>{count}</Text>
      ) : hasEntries ? (
        <View style={styles.dotsRow}>
          {Array.from({ length: dotCount }, (_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: isToday ? colors.primary : colors.muted }]}
            />
          ))}
        </View>
      ) : (
        <View style={styles.dotsRow} />
      )}
    </TouchableOpacity>
  );
});

const chipElevation = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 3,
  elevation: 1,
};

export default function CalendarStrip({
  viewedYear,
  viewedMonth,
  onMonthChange,
  selectedDay,
  onDaySelect,
  entryCounts,
}) {
  const listRef = useRef(null);
  const now = new Date();
  const isCurrentMonth = viewedYear === now.getFullYear() && viewedMonth === now.getMonth();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const days = useMemo(() => {
    const total = daysInMonth(viewedYear, viewedMonth);
    const result = [];
    for (let d = total; d >= 1; d--) {
      const dateStr = `${viewedYear}-${pad2(viewedMonth + 1)}-${pad2(d)}`;
      result.push({
        dateStr,
        day: d,
        dayOfWeek: new Date(viewedYear, viewedMonth, d).getDay(),
      });
    }
    return result;
  }, [viewedYear, viewedMonth]);

  const getItemLayout = useCallback((_, index) => ({
    length: ITEM_SIZE,
    offset: ITEM_SIZE * index,
    index,
  }), []);

  const renderDay = useCallback(({ item }) => (
    <DayChip
      dateStr={item.dateStr}
      day={item.day}
      dayOfWeek={item.dayOfWeek}
      count={entryCounts.get(item.dateStr) || 0}
      isToday={item.dateStr === todayStr}
      isSelected={item.dateStr === selectedDay}
      onPress={onDaySelect}
    />
  ), [entryCounts, todayStr, selectedDay, onDaySelect]);

  const goToCurrent = useCallback(() => {
    onMonthChange(now.getFullYear(), now.getMonth());
  }, [onMonthChange]);

  return (
    <View style={styles.container}>
      {/* Month navigator */}
      <View style={styles.monthRow}>
        <TouchableOpacity
          onPress={() => onMonthChange(viewedYear, viewedMonth - 1)}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity onPress={goToCurrent}>
          <Text style={styles.monthLabel}>
            {MONTHS[viewedMonth]} {viewedYear}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onMonthChange(viewedYear, viewedMonth + 1)}
          hitSlop={12}
          disabled={isCurrentMonth}
          style={{ opacity: isCurrentMonth ? 0.3 : 1 }}
        >
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Date strip */}
      <FlatList
        ref={listRef}
        data={days}
        keyExtractor={(item) => item.dateStr}
        renderItem={renderDay}
        horizontal
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        contentContainerStyle={styles.stripContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingTop: spacing.sm,
  },
  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  monthLabel: {
    fontWeight: "600",
    fontSize: 16,
    color: colors.foreground,
    textTransform: "capitalize",
  },
  stripContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  chip: {
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    marginRight: CHIP_MARGIN,
  },
  chipDayAbbr: {
    fontWeight: "600",
    fontSize: 10,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  chipDayNum: {
    fontWeight: "700",
    fontSize: 16,
  },
  chipCount: {
    fontWeight: "600",
    fontSize: 9,
    color: colors.surface,
    marginTop: 2,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 8,
    marginTop: 2,
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
