import { describe, expect, it } from "vitest";
import { daysUntilNext, describeNext, describeProgress, describeSchedule, describeWeekdays, isoWeekday } from "./tasks";

describe("describeWeekdays", () => {
  it("names common sets", () => {
    expect(describeWeekdays([1, 3, 5])).toBe("Mon, Wed & Fri");
    expect(describeWeekdays([5, 1, 2, 3, 4])).toBe("Weekdays");
    expect(describeWeekdays([7, 6])).toBe("Weekends");
    expect(describeWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(describeWeekdays([2])).toBe("Every Tuesday");
  });
});

describe("describeSchedule and progress", () => {
  const base = { weekdays: null, times_per_period: null, done: false, done_today: false, period_count: 0, period_target: 1 };
  it("describes every schedule", () => {
    expect(describeSchedule({ ...base, repeat: "times_per_week", times_per_period: 3 })).toBe("3× a week");
    expect(describeSchedule({ ...base, repeat: "times_per_month", times_per_period: 2 })).toBe("2× a month");
    expect(describeSchedule({ ...base, repeat: "quarterly" })).toBe("Quarterly");
    expect(describeSchedule({ ...base, repeat: "days", weekdays: [6, 7] })).toBe("Weekends");
  });
  it("shows progress per period", () => {
    expect(describeProgress({ ...base, repeat: "times_per_week", times_per_period: 3, period_count: 1, period_target: 3 })).toBe("1 of 3 this week");
    expect(describeProgress({ ...base, repeat: "monthly", done: true })).toBe("Done this month");
    expect(describeProgress({ ...base, repeat: "days", weekdays: [1], done: true })).toBe("Done today");
    expect(describeProgress({ ...base, repeat: "yearly" })).toBeNull();
  });
});

describe("next certain day", () => {
  it("counts days ahead", () => {
    expect(isoWeekday("2026-11-19")).toBe(4); // Thursday
    expect(daysUntilNext([4], "2026-11-19")).toBe(0);
    expect(daysUntilNext([5], "2026-11-19")).toBe(1);
    expect(daysUntilNext([1], "2026-11-19")).toBe(4);
    expect(describeNext([1, 2], "2026-11-19")).toBe("Monday");
    expect(describeNext([5], "2026-11-19")).toBe("Tomorrow");
  });
});
