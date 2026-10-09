import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getRoleHint, getToken } from "../api/client";
import {
  isStudentBootstrapPath,
  markStudentShellBootstrapSkipped,
  resetStudentShellBootstrap,
  runStudentShellBootstrap,
} from "../api/studentAppBootstrap";
import {
  getStudentDashboardBundleDeduped,
  getStudentProfileBundleDeduped,
} from "../api/studentRequestDedup";

/** One HTTP bundle per student /dashboard or /profile visit; hydrates global app caches. */
export default function StudentShellBootstrapRunner() {
  const { pathname } = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!getToken() || !isStudentBootstrapPath(pathname)) {
      return;
    }

    if (prevPathRef.current !== pathname) {
      resetStudentShellBootstrap();
      prevPathRef.current = pathname;
    }

    // The bundle is student-only: for a known instructor/admin it is a guaranteed 403. Release the waiters so
    // they load the user on their own. (A teaching assistant can be in student mode, so it still tries.)
    const roleHint = getRoleHint();
    if (roleHint === "teacher" || roleHint === "admin") {
      markStudentShellBootstrapSkipped();
      return;
    }

    if (pathname === "/dashboard") {
      void runStudentShellBootstrap(() => getStudentDashboardBundleDeduped(5, 12));
      return;
    }

    if (pathname === "/profile") {
      void runStudentShellBootstrap(() => getStudentProfileBundleDeduped(8));
    }
  }, [pathname]);

  return null;
}
