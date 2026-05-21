import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getToken } from "../api/client";
import {
  isStudentBootstrapPath,
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
