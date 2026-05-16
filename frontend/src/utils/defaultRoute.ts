import type { UserRole } from "../api/types";

export function getDefaultRouteForRole(role: UserRole | string): string {
  if (role === "admin") return "/admin";
  if (role === "student") return "/dashboard";
  if (role === "teacher" || role === "laborant") return "/dashboard";
  return "/home";
}
