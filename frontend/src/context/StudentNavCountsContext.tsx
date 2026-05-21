import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { getCachedDashboardSidebarCounts } from "../api/studentRequestDedup";
import type { StudentSidebarCounts } from "../api/studentDashboardApi";

interface StudentNavCountsContextType {
  sidebar: StudentSidebarCounts | null;
  setSidebarCounts: (counts: StudentSidebarCounts) => void;
  refreshSidebarCounts: () => Promise<void>;
}

const StudentNavCountsContext = createContext<StudentNavCountsContextType | undefined>(undefined);

export function StudentNavCountsProvider({ children }: { children: ReactNode }) {
  const [sidebar, setSidebar] = useState<StudentSidebarCounts | null>(null);

  const setSidebarCounts = useCallback((counts: StudentSidebarCounts) => {
    setSidebar(counts);
  }, []);

  const refreshSidebarCounts = useCallback(async () => {
    const cached = getCachedDashboardSidebarCounts();
    if (cached) {
      setSidebar(cached);
    }
  }, []);

  return (
    <StudentNavCountsContext.Provider value={{ sidebar, setSidebarCounts, refreshSidebarCounts }}>
      {children}
    </StudentNavCountsContext.Provider>
  );
}

export function useStudentNavCounts() {
  const context = useContext(StudentNavCountsContext);
  if (!context) {
    throw new Error("useStudentNavCounts must be used within StudentNavCountsProvider");
  }
  return context;
}

export function useStudentNavCountsOptional() {
  return useContext(StudentNavCountsContext);
}
