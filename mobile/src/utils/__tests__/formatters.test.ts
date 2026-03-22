import {
  formatDuration,
  formatDurationCompact,
  formatDurationVerbose,
  formatTime,
  formatPlaybackTime,
  formatTimer,
} from "../formatters";

jest.mock("../../i18n", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "calendar.today": "Danas",
      "calendar.yesterday": "Juce",
    };
    return map[key] || key;
  },
}));

describe("formatDuration", () => {
  test("returns 0:00 for null/undefined/0", () => {
    expect(formatDuration(null)).toBe("0:00");
    expect(formatDuration(undefined)).toBe("0:00");
    expect(formatDuration(0)).toBe("0:00");
  });

  test("formats seconds correctly", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3661)).toBe("61:01");
  });
});

describe("formatDurationCompact", () => {
  test("returns empty string for falsy input", () => {
    expect(formatDurationCompact(null)).toBe("");
    expect(formatDurationCompact(0)).toBe("");
  });

  test("formats seconds correctly", () => {
    expect(formatDurationCompact(65)).toBe("1:05");
  });
});

describe("formatDurationVerbose", () => {
  test("returns empty string for falsy input", () => {
    expect(formatDurationVerbose(null)).toBe("");
  });

  test("formats seconds correctly", () => {
    expect(formatDurationVerbose(65)).toBe("1 min 5 s");
    expect(formatDurationVerbose(120)).toBe("2 min 0 s");
  });
});

describe("formatTime", () => {
  test("formats ISO string to HH:MM", () => {
    const result = formatTime("2024-01-15T14:05:00.000Z");
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatPlaybackTime", () => {
  test("returns 0:00 for invalid input", () => {
    expect(formatPlaybackTime(null)).toBe("0:00");
    expect(formatPlaybackTime(NaN)).toBe("0:00");
  });

  test("formats seconds correctly", () => {
    expect(formatPlaybackTime(125)).toBe("2:05");
  });
});

describe("formatTimer", () => {
  test("formats milliseconds to M:SS", () => {
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(null)).toBe("0:00");
    expect(formatTimer(65000)).toBe("1:05");
    expect(formatTimer(500)).toBe("0:00");
    expect(formatTimer(1500)).toBe("0:01");
  });
});
