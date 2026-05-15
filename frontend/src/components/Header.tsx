import { useEffect, useState } from "react";
import { getMe } from "../api/authApi";
import type { UserRole } from "../api/types";
import AdminHeader from "./AdminHeader";
import StudentHeader from "./StudentHeader";

interface HeaderProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function Header({ isDarkTheme = false, onToggleTheme }: HeaderProps) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadRole() {
      try {
        const me = await getMe();
        if (!cancelled) {
          setUserRole(me.role);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="h-14" />; // Placeholder
  }

  if (userRole === "admin") {
    return <AdminHeader isDarkTheme={isDarkTheme} onToggleTheme={onToggleTheme} />;
  }

  return <StudentHeader isDarkTheme={isDarkTheme} onToggleTheme={onToggleTheme} />;
}
