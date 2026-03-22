import { getRecordedDate } from "../dateHelpers";

describe("getRecordedDate", () => {
  test("uses recorded_date when present", () => {
    const entry = {
      recorded_date: "2024-01-15",
      created_at: "2024-01-10T12:00:00Z",
    };
    expect(getRecordedDate(entry)).toBe("2024-01-15");
  });

  test("falls back to created_at date portion when recorded_date is empty", () => {
    const entry = { recorded_date: "", created_at: "2024-01-10T12:00:00Z" };
    expect(getRecordedDate(entry)).toBe("2024-01-10");
  });

  test("falls back to created_at when recorded_date is undefined", () => {
    const entry = {
      recorded_date: undefined as any,
      created_at: "2024-03-22T09:30:00Z",
    };
    expect(getRecordedDate(entry)).toBe("2024-03-22");
  });
});
