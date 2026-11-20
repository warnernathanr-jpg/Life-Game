import { describe, expect, it } from "vitest";
import { describeDue, isOnDay, stepDate, viewDays, viewTitle } from "./task-calendar";

const task = (o: Partial<Parameters<typeof isOnDay>[0]>) => ({
  id: "t", repeat: "daily" as const, weekdays: null, due_date: null, created_at: "2026-11-01T10:00:00Z", done: false, ...o,
});
const none = new Set<string>();

describe("isOnDay", () => {
  it("places daily, certain-days and dated one-offs", () => {
    expect(isOnDay(task({}), "2026-11-21", "2026-11-20", none)).toBe(true);
    expect(isOnDay(task({}), "2026-10-30", "2026-11-20", none)).toBe(false); // before it was added
    const mwf = task({ repeat: "days", weekdays: [1, 3, 5] });
    expect(isOnDay(mwf, "2026-11-20", "2026-11-20", none)).toBe(true); // Friday
    expect(isOnDay(mwf, "2026-11-21", "2026-11-20", none)).toBe(false); // Saturday
    const due = task({ repeat: "once", due_date: "2026-11-25" });
    expect(isOnDay(due, "2026-11-25", "2026-11-20", none)).toBe(true);
    expect(isOnDay(due, "2026-11-20", "2026-11-20", none)).toBe(false);
    expect(isOnDay(task({ repeat: "weekly" }), "2026-11-20", "2026-11-20", none)).toBe(false);
  });
  it("carries overdue one-offs to today; undated ones sit on today or the day they were done", () => {
    const late = task({ repeat: "once", due_date: "2026-11-18" });
    expect(isOnDay(late, "2026-11-20", "2026-11-20", none)).toBe(true);
    expect(isOnDay({ ...late, done: true }, "2026-11-20", "2026-11-20", new Set(["2026-11-19"]))).toBe(false);
    const undated = task({ repeat: "once" });
    expect(isOnDay(undated, "2026-11-20", "2026-11-20", none)).toBe(true);
    expect(isOnDay(undated, "2026-11-21", "2026-11-20", none)).toBe(false);
    expect(isOnDay({ ...undated, done: true }, "2026-11-19", "2026-11-20", new Set(["2026-11-19"]))).toBe(true);
  });
});

describe("views", () => {
  it("weeks start Monday, months fill whole weeks", () => {
    expect(viewDays("week", "2026-11-20")[0]).toBe("2026-11-16");
    const m = viewDays("month", "2026-11-20");
    expect(m[0]).toBe("2026-10-26");
    expect(m.length % 7).toBe(0);
    expect(m.at(-1)).toBe("2026-12-06");
  });
  it("steps and titles", () => {
    expect(stepDate("day", "2026-11-20", 1)).toBe("2026-11-21");
    expect(stepDate("week", "2026-11-20", -1)).toBe("2026-11-13");
    expect(stepDate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(viewTitle("week", "2026-11-20")).toBe("Nov 16 – 22");
    expect(viewTitle("week", "2026-12-02")).toBe("Nov 30 – Dec 6");
    expect(viewTitle("month", "2026-11-20")).toBe("November 2026");
    expect(describeDue("2026-11-21", "2026-11-20")).toBe("Due tomorrow");
    expect(describeDue("2026-11-18", "2026-11-20")).toBe("Overdue (Nov 18)");
  });
});
