import type { LogEntry } from "../api/types";

const EMAIL_PATTERNS = [
  /for user:\s*(\S+@\S+)/i,
  /for email:\s*(\S+@\S+)/i,
  /Approved user:\s*(\S+@\S+)/i,
  /Rejected pending user:\s*(\S+@\S+)/i,
  /Deleted user:\s*(\S+@\S+)/i,
  /Blocked user attempted login:\s*(\S+@\S+)/i,
  /Failed login attempt for (?:email|user):\s*(\S+@\S+)/i,
  /Successful login for user:\s*(\S+@\S+)/i,
];

export function extractEmailFromLogMessage(message: string): string | null {
  for (const pattern of EMAIL_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/[.,;]+$/, "");
    }
  }
  return null;
}

export function getLogUserDisplayName(log: LogEntry, unknownLabel: string): string {
  const name = log.user_full_name?.trim();
  const email = log.user_email?.trim();
  if (name) return name;
  if (email) return email;
  const fromMessage = extractEmailFromLogMessage(log.message);
  if (fromMessage) return fromMessage;
  return unknownLabel;
}

export function getLogUserInitials(log: LogEntry, unknownLabel: string): string {
  const display = getLogUserDisplayName(log, unknownLabel);
  if (display === unknownLabel) return "?";
  if (display.includes("@")) {
    return display.slice(0, 2).toUpperCase();
  }
  return display
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
