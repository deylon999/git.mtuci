import { describe, expect, it } from "vitest";
import type { Assignment, Course } from "../api/types";
import {
  buildDeadlinesFromCourses,
  countDeadlinesToday,
  firstNameFromFullName,
  formatDeadlineLabel,
  getDeadlineUrgency,
} from "./studentDeadlines";
import {
  computeDeadlineStats,
  formatDeadlineRemaining,
  groupDeadlinesByPeriod,
} from "./studentDeadlineGroups";
import { formatRelativeTime } from "./formatRelativeTime";

// Wednesday 2026-10-07 12:00 local time.
const NOW = new Date(2026, 9, 7, 12, 0);
const at = (dayOffset: number, hours = 12, minutes = 0) =>
  new Date(2026, 9, 7 + dayOffset, hours, minutes);

function item(id: string, deadline: Date) {
  return {
    id,
    assignmentId: id,
    courseId: "c",
    name: id,
    course: "Course",
    deadline,
    timeLabel: "",
    urgency: "info" as const,
  };
}

describe("formatDeadlineLabel", () => {
  it("labels today and tomorrow with the time", () => {
    expect(formatDeadlineLabel(at(0, 18, 30), NOW, "en")).toMatch(/^Today /);
    expect(formatDeadlineLabel(at(1, 9), NOW, "en")).toMatch(/^Tomorrow /);
  });

  it("uses Russian plurals for 2..7 days", () => {
    expect(formatDeadlineLabel(at(2), NOW, "ru")).toBe("Через 2 дня");
    expect(formatDeadlineLabel(at(5), NOW, "ru")).toBe("Через 5 дней");
  });
});

describe("getDeadlineUrgency", () => {
  it("escalates as the deadline approaches", () => {
    expect(getDeadlineUrgency(at(0), NOW)).toBe("danger");
    expect(getDeadlineUrgency(at(1), NOW)).toBe("warning");
    expect(getDeadlineUrgency(at(3), NOW)).toBe("info");
    expect(getDeadlineUrgency(at(10), NOW)).toBe("muted");
  });
});

describe("buildDeadlinesFromCourses", () => {
  it("drops past days and sorts by deadline", () => {
    const courses = [{ id: "c1", title: "Math" }] as Course[];
    const assignments = new Map<string, Assignment[]>([
      [
        "c1",
        [
          { id: "late", title: "Late", deadline: at(3).toISOString() },
          { id: "old", title: "Old", deadline: at(-2).toISOString() },
          { id: "soon", title: "Soon", deadline: at(1).toISOString() },
        ] as Assignment[],
      ],
    ]);
    const items = buildDeadlinesFromCourses(courses, assignments, NOW, "en");
    expect(items.map((i) => i.assignmentId)).toEqual(["soon", "late"]);
    expect(countDeadlinesToday(items, NOW)).toBe(0);
  });
});

describe("firstNameFromFullName", () => {
  it("takes the given name from 'Surname Name Patronymic'", () => {
    expect(firstNameFromFullName("Иванов Иван Иванович", "ru")).toBe("Иван");
    expect(firstNameFromFullName("Admin", "ru")).toBe("Admin");
  });
});

describe("groupDeadlinesByPeriod", () => {
  it("puts a deadline 7 days ahead into the week group regardless of its time", () => {
    const groups = groupDeadlinesByPeriod(
      [item("overdue", at(-1)), item("today", at(0, 23)), item("tomorrow", at(1)), item("d7", at(7, 18)), item("d8", at(8))],
      NOW,
      "en",
    );
    expect(Object.fromEntries(groups.map((g) => [g.key, g.items.map((i) => i.id)]))).toEqual({
      overdue: ["overdue"],
      today: ["today"],
      tomorrow: ["tomorrow"],
      week: ["d7"],
      later: ["d8"],
    });
  });
});

describe("computeDeadlineStats", () => {
  it("skips submitted items and counts overdue ones", () => {
    const stats = computeDeadlineStats(
      [item("a", at(0, 8)), item("b", at(0, 20)), item("c", at(1)), item("done", at(0, 20))],
      { done: true },
      NOW,
    );
    expect(stats.today).toBe(2);
    expect(stats.overdue).toBe(1);
  });
});

describe("formatDeadlineRemaining", () => {
  it("says 'under an hour' only below 60 minutes", () => {
    expect(formatDeadlineRemaining(new Date(NOW.getTime() + 30 * 60_000), NOW, "en")).toBe("less than an hour left");
    expect(formatDeadlineRemaining(new Date(NOW.getTime() + 90 * 60_000), NOW, "en")).toBe("1 h left");
  });

  it("uses Russian plural forms for days", () => {
    const inDays = (n: number) => new Date(NOW.getTime() + (n - 0.5) * 86_400_000);
    expect(formatDeadlineRemaining(inDays(3), NOW, "ru")).toBe("осталось 3 дня");
    expect(formatDeadlineRemaining(inDays(5), NOW, "ru")).toBe("осталось 5 дней");
    expect(formatDeadlineRemaining(inDays(21), NOW, "ru")).toBe("остался 21 день");
    expect(formatDeadlineRemaining(inDays(22), NOW, "ru")).toBe("осталось 22 дня");
  });

  it("reports overdue days", () => {
    expect(formatDeadlineRemaining(at(-3), NOW, "en")).toBe("overdue by 3 days");
  });
});

describe("formatRelativeTime", () => {
  it("formats recent moments", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 30_000), NOW, "en")).toBe("just now");
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000), NOW, "en")).toBe("5 min ago");
    expect(formatRelativeTime(new Date(NOW.getTime() - 3 * 3_600_000), NOW, "en")).toBe("3 h ago");
    expect(formatRelativeTime(at(-1), NOW, "en")).toBe("Yesterday");
    expect(formatRelativeTime(at(-3), NOW, "ru")).toBe("3 дня назад");
  });
});
