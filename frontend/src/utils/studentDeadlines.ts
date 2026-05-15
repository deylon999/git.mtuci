import type { Assignment, Course } from "../api/types";

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

function formatTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

export function formatDeadlineLabel(deadline: Date, now = new Date()): string {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  const d = startOfDay(deadline);

  if (d.getTime() === today.getTime()) {
    return `Сегодня ${formatTime(deadline)}`;
  }
  if (d.getTime() === tomorrow.getTime()) {
    return `Завтра ${formatTime(deadline)}`;
  }

  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays >= 2 && diffDays <= 7) {
    return `Через ${pluralDays(diffDays)}`;
  }

  return deadline.toLocaleString("ru-RU", {
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

export function pluralDeadlinesRu(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "дедлайн";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дедлайна";
  return "дедлайнов";
}

/** Имя из ФИО: в формате «Фамилия Имя …» берём вторую часть, не фамилию. */
export function firstNameFromFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "студент";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];

  return parts[1];
}

export function buildDeadlinesFromCourses(
  courses: Course[],
  assignmentsByCourse: Map<string, Assignment[]>,
  now = new Date(),
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
        timeLabel: formatDeadlineLabel(deadline, now),
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

export function deadlinesTodaySubtitles(items: StudentDeadlineItem[], now = new Date()): string {
  const today = items.filter((item) => isDeadlineToday(item.deadline, now));
  if (today.length === 0) {
    const next = items[0];
    if (!next) return "На сегодня нет";
    return `Ближайший: ${next.name}`;
  }
  return today
    .slice(0, 2)
    .map((d) => d.name)
    .join(" и ");
}
