import { Navigate } from "react-router-dom";
import { useAuthUser } from "../context/AuthUserContext";

/** Legacy /projects URL — students go to merged courses, others to teacher courses list. */
export default function ProjectsRoute(_props: { isDarkTheme?: boolean }) {
  const { user, loading } = useAuthUser();

  if (loading) return null;
  if (user?.role === "student") {
    return <Navigate to="/courses" replace />;
  }
  return <Navigate to="/teacher/courses" replace />;
}
