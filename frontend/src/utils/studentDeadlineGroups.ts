import { translate, translateWithParams, type Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";
import type { StudentDeadlineItem } from "./studentDeadlines";

export type DeadlineGroupKey = "today" | "tomorrow" | "week" | "later";

export interface DeadlineGroup {
  key: DeadlineGroupKey;
  title: string;
  items: StudentDeadlineItem[];
}

const GROUP_TITLE_KEYS: Record<DeadlineGroupKey, string> = {
  today: "student.deadline.groupToday",
  tomorrow: "student.deadline.groupTomorrow",
  week: "student.deadline.groupWeek",
  later: "student.deadline.groupLater",
};

function localeTag(locale: Locale): string {
  return locale === "en" ? "en-US" : "ru-RU";
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function groupDeadlinesByPeriod(
  items: StudentDeadlineItem[],
  now = new Date(),
  locale = getI18nLocale(),
): DeadlineGroup[] {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);

  const buckets: Record<DeadlineGroupKey, StudentDeadlineItem[]> = {
    today: [],
    tomorrow: [],
    week: [],
    later: [],
  };

  for (const item of items) {
    const d = startOfDay(item.deadline);
    if (d.getTime() <= today.getTime()) buckets.today.push(item);
    else if (d.getTime() === tomorrow.getTime()) buckets.tomorrow.push(item);
    else if (item.deadline <= weekEnd) buckets.week.push(item);
    else buckets.later.push(item);
  }

  return (["today", "tomorrow", "week", "later"] as const)
    .map((key) => ({
      key,
      title: translate(locale, GROUP_TITLE_KEYS[key]),
      items: buckets[key],
    }))
    .filter((g) => g.items.length > 0);
}

export function formatDeadlineRemaining(deadline: Date, now = new Date(), locale = getI18nLocale()): string {
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs < 0) {
    const days = Math.ceil(Math.abs(diffMs) / (24 * 60 * 60 * 1000));
    if (days === 1) return translate(locale, "student.deadline.overdueOneDay");
    return translateWithParams(locale, "student.deadline.overdueDays", { n: days });
  }
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    if (hours <= 1) return translate(locale, "student.deadline.remainingUnderHour");
    return translateWithParams(locale, "student.deadline.remainingHours", { n: hours });
  }
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days === 1) return translate(locale, "student.deadline.remainingOneDay");
  if (locale === "en" || days >= 5) {
    return translateWithParams(locale, "student.deadline.remainingDaysMany", { n: days });
  }
  if (days < 5) return translateWithParams(locale, "student.deadline.remainingDaysFew", { n: days });
  return translateWithParams(locale, "student.deadline.remainingDaysMany", { n: days });
}

export function formatTodayLong(now = new Date(), locale = getI18nLocale()): string {
  return now.toLocaleDateString(localeTag(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function deadlineWeekdayLabels(locale = getI18nLocale()): string[] {
  return [
    translate(locale, "student.deadline.weekdays.mon"),
    translate(locale, "student.deadline.weekdays.tue"),
    translate(locale, "student.deadline.weekdays.wed"),
    translate(locale, "student.deadline.weekdays.thu"),
    translate(locale, "student.deadline.weekdays.fri"),
    translate(locale, "student.deadline.weekdays.sat"),
    translate(locale, "student.deadline.weekdays.sun"),
  ];
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function deadlineDatesSet(items: StudentDeadlineItem[]): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    const d = item.deadline;
    set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return set;
}
