import type { Assignment, Course } from "../api/types";
import { pluralWord } from "../i18n/plural";
import { translate, translateWithParams, type Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";

export type DeadlineUrgency = "danger" | "warning" | "info" | "muted";

export interface StudentDeadlineItem {
  id: string;
  assignmentId: string;
  courseId: string;
  name: string;
  course: string;
  deadline: Date;
  timeLabel: string;
  urgency: DeadlineUrgency;
}

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

function formatTime(d: Date, locale: Locale): string {
  return d.toLocaleTimeString(localeTag(locale), { hour: "2-digit", minute: "2-digit" });
}

function pluralDaysPhrase(n: number, locale: Locale): string {
  const word = pluralWord(locale, "student.plural.days", n);
  return locale === "en" && n === 1 ? word : `${n} ${word}`;
}

export function formatDeadlineLabel(deadline: Date, now = new Date(), locale = getI18nLocale()): string {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const d = startOfDay(deadline);

  if (d.getTime() === today.getTime()) {
    return translateWithParams(locale, "student.deadline.todayAt", { time: formatTime(deadline, locale) });
  }
  if (d.getTime() === tomorrow.getTime()) {
    return translateWithParams(locale, "student.deadline.tomorrowAt", { time: formatTime(deadline, locale) });
  }

  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays >= 2 && diffDays <= 7) {
    return translateWithParams(locale, "student.deadline.inDays", { days: pluralDaysPhrase(diffDays, locale) });
  }

  return deadline.toLocaleString(localeTag(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getDeadlineUrgency(deadline: Date, now = new Date()): DeadlineUrgency {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const d = startOfDay(deadline);

  if (d.getTime() <= today.getTime()) return "danger";
  if (d.getTime() === tomorrow.getTime()) return "warning";

  const diffDays = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 3) return "info";
  if (diffDays <= 7) return "muted";
  return "muted";
}

export function isDeadlineToday(deadline: Date, now = new Date()): boolean {
  return startOfDay(deadline).getTime() === startOfDay(now).getTime();
}

export function pluralDeadlines(count: number, locale = getI18nLocale()): string {
  return pluralWord(locale, "student.plural.deadlines", count);
}

/** @deprecated Use pluralDeadlines(count, locale) */
export function pluralDeadlinesRu(count: number): string {
  return pluralDeadlines(count, "ru");
}

export function firstNameFromFullName(fullName: string, locale = getI18nLocale()): string {
  const trimmed = fullName.trim();
  if (!trimmed) return translate(locale, "student.dashboard.studentFallback");

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];

  return parts[1];
}

export function buildDeadlinesFromCourses(
  courses: Course[],
  assignmentsByCourse: Map<string, Assignment[]>,
  now = new Date(),
  locale = getI18nLocale(),
): StudentDeadlineItem[] {
  const items: StudentDeadlineItem[] = [];

  for (const course of courses) {
    const assignments = assignmentsByCourse.get(course.id) ?? [];
    for (const a of assignments) {
      const deadline = new Date(a.deadline);
      if (deadline < startOfDay(now)) continue;

      items.push({
        id: `${course.id}-${a.id}`,
        assignmentId: a.id,
        courseId: course.id,
        name: a.title,
        course: course.title,
        deadline,
        timeLabel: formatDeadlineLabel(deadline, now, locale),
        urgency: getDeadlineUrgency(deadline, now),
      });
    }
  }

  items.sort((x, y) => x.deadline.getTime() - y.deadline.getTime());
  return items;
}

export function countDeadlinesToday(items: StudentDeadlineItem[], now = new Date()): number {
  return items.filter((item) => isDeadlineToday(item.deadline, now)).length;
}

export function deadlinesTodaySubtitles(
  items: StudentDeadlineItem[],
  now = new Date(),
  locale = getI18nLocale(),
): string {
  const today = items.filter((item) => isDeadlineToday(item.deadline, now));
  if (today.length === 0) {
    const next = items[0];
    if (!next) return translate(locale, "student.deadline.noneToday");
    return translateWithParams(locale, "student.deadline.nextPrefix", { name: next.name });
  }
  return today
    .slice(0, 2)
    .map((d) => d.name)
    .join(locale === "en" ? " and " : " и ");
}
