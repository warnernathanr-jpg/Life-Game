import { describe, expect, it } from "vitest";
import { addDays, isHabit, rateWords, summarizeHabit } from "./habits";

const today = "2026-11-19"; // Thursday
const base = { weekdays: null, times_per_period: null, created_at: "2026-10-01T10:00:00Z" };

describe("summarizeHabit", () => {
  it("daily: last 7 days, unfinished today doesn't count against you", () => {
    const done = [addDays(today, -1), addDays(today, -2), addDays(today, -4), addDays(today, -5), addDays(today, -6)];
    const s = summarizeHabit({ ...base, repeat: "daily" }, done, today);
    expect(s.week.map((d) => d.done)).toEqual([true, true, true, false, true, true, false]);
    expect(s.line).toBe("5 of the last 7 days");
    expect(s.rate).toBeCloseTo(5 / 27); // 27 past days in the window (today not done yet)
  });

  it("missing a day only lowers the rate a little", () => {
    const all = Array.from({ length: 27 }, (_, i) => addDays(today, -1 - i));
    const perfect = summarizeHabit({ ...base, repeat: "daily" }, all, today).rate;
    const oneMiss = summarizeHabit({ ...base, repeat: "daily" }, all.slice(1), today).rate;
    expect(perfect).toBe(1);
    expect(oneMiss).toBeGreaterThan(0.95);
  });

  it("certain days: only scheduled days count", () => {
    // Mon/Wed/Fri. Last 7 days (Fri 13 .. Thu 19): Fri 13, Mon 16, Wed 18 scheduled.
    const s = summarizeHabit({ ...base, repeat: "days", weekdays: [1, 3, 5] }, ["2026-11-16", "2026-11-18"], today);
    expect(s.week.filter((d) => d.scheduled).map((d) => d.day)).toEqual(["2026-11-13", "2026-11-16", "2026-11-18"]);
    expect(s.line).toBe("2 of the last 3 scheduled days");
  });

  it("times per week: this week so far, and past weeks capped at the target", () => {
    const done = ["2026-11-16", "2026-11-18", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
    const s = summarizeHabit({ ...base, repeat: "times_per_week", times_per_period: 3 }, done, today);
    expect(s.line).toBe("2 of 3 this week");
    // This week 2/2 so far, last week 3/3 (4 done, capped), two weeks before 0/3 each.
    expect(s.rate).toBeCloseTo(5 / 11);
  });

  it("new habits don't show days before they existed", () => {
    const s = summarizeHabit({ ...base, repeat: "daily", created_at: "2026-11-18T09:00:00Z" }, ["2026-11-18"], today);
    expect(s.week.filter((d) => d.scheduled).length).toBe(2);
    expect(s.line).toBe("1 of the last 2 days");
    expect(s.rate).toBe(1);
  });

  it("times per month", () => {
    const s = summarizeHabit({ ...base, repeat: "times_per_month", times_per_period: 4 }, ["2026-11-02", "2026-11-10"], today);
    expect(s.line).toBe("2 of 4 this month");
  });
});

describe("helpers", () => {
  it("knows what a habit is and words for rates", () => {
    expect(isHabit({ repeat: "daily" })).toBe(true);
    expect(isHabit({ repeat: "yearly" })).toBe(false);
    expect([0.9, 0.7, 0.4, 0.1].map(rateWords)).toEqual(["Rock solid", "Steady", "Building up", "Getting started"]);
  });
});
