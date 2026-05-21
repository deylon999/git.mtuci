import { useAuthUser } from "../context/AuthUserContext";
import type { UserRole } from "../api/types";
import AdminHeader from "./AdminHeader";
import StudentHeader from "./StudentHeader";

interface HeaderProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function Header({ isDarkTheme = false, onToggleTheme }: HeaderProps) {
  const { user, loading } = useAuthUser();

  if (loading) {
    return <div className="h-14" />;
  }

  const userRole = (user?.role ?? null) as UserRole | null;

  if (userRole === "admin") {
    return <AdminHeader isDarkTheme={isDarkTheme} onToggleTheme={onToggleTheme} />;
  }

  return <StudentHeader isDarkTheme={isDarkTheme} onToggleTheme={onToggleTheme} />;
}
