/** Visual tokens aligned with teacher-app.html mockup */

export const COURSE_BANNER_GRADIENTS = [
  "linear-gradient(135deg,#1a237e,#283593)",
  "linear-gradient(135deg,#1b5e20,#2e7d32)",
  "linear-gradient(135deg,#4a148c,#6a1b9a)",
  "linear-gradient(135deg,#0d47a1,#1565c0)",
  "linear-gradient(135deg,#b71c1c,#c62828)",
  "linear-gradient(135deg,#004d40,#00695c)",
] as const;

const COURSE_EMOJI_RULES: [RegExp, string][] = [
  [/баз|sql|db/i, "🗄️"],
  [/операц|ос\b|linux/i, "🖥️"],
  [/крипт|crypto|security/i, "🔐"],
  [/сеть|network/i, "🌐"],
  [/python|питон/i, "🐍"],
  [/java|джава/i, "☕"],
  [/web|веб|frontend|react/i, "🌍"],
  [/алгоритм|algo/i, "📐"],
  [/матем|math/i, "📊"],
];

export function courseBannerForId(courseId: string): string {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) h = (h + courseId.charCodeAt(i)) % COURSE_BANNER_GRADIENTS.length;
  return COURSE_BANNER_GRADIENTS[h];
}

export function courseEmojiForTitle(title: string): string {
  for (const [re, emoji] of COURSE_EMOJI_RULES) {
    if (re.test(title)) return emoji;
  }
  return "📚";
}

export function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return fullName.slice(0, 2).toUpperCase() || "?";
}

const AVATAR_PALETTE: { bg: string; fg: string }[] = [
  { bg: "rgba(37,99,235,0.15)", fg: "#60a5fa" },
  { bg: "rgba(76,175,80,0.15)", fg: "#4caf50" },
  { bg: "rgba(226,75,74,0.15)", fg: "#e24b4a" },
  { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b" },
  { bg: "rgba(139,92,246,0.15)", fg: "#a78bfa" },
  { bg: "rgba(6,182,212,0.15)", fg: "#22d3ee" },
];

export function avatarColorsForName(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h];
}

export type WaitingBadgeTone = "danger" | "warning" | "info" | "muted";

export function waitingBadgeTone(hours: number, isStale: boolean): WaitingBadgeTone {
  if (isStale || hours >= 48) return "danger";
  if (hours >= 24) return "warning";
  if (hours >= 8) return "info";
  return "muted";
}
