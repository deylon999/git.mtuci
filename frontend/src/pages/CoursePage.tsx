import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuthUser } from "../context/AuthUserContext";
import { getAssignments, getCourse } from "../api/coursesApi";
import StudentCourseView from "../components/StudentCourseView";
import TeacherCourseView from "../components/teacher/TeacherCourseView";
import { useUserPreferences } from "../context/UserPreferencesContext";
import type { Assignment, Course } from "../api/types";

interface CoursePageProps {
  isDarkTheme?: boolean;
}

export default function CoursePage({ isDarkTheme = true }: CoursePageProps) {
  const { t } = useUserPreferences();
  const pageBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-gray-50";
  const textPrimary = isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900";
  const textSecondary = isDarkTheme ? "text-[#8b949e]" : "text-gray-600";
  const textTertiary = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const breadcrumbText = isDarkTheme ? "text-purple-400" : "text-purple-700";
  const breadcrumbHover = isDarkTheme ? "hover:text-purple-300" : "hover:text-purple-800";
  const errorBox = isDarkTheme ? "border-red-800 bg-red-900/20 text-red-300" : "border-red-200 bg-red-50 text-red-800";

  const { courseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [courseData, setCourseData] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user: me, loading: authLoading } = useAuthUser();

  const isTeacher = me?.role === "teacher" || me?.role === "laborant" || me?.role === "admin";
  const isStudent = me?.role === "student";

  useEffect(() => {
    if (!courseId || authLoading || isTeacher) return;
    let cancelled = false;
    const courseIdStr = courseId;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [as, courseResult] = await Promise.allSettled([
          getAssignments(courseIdStr),
          getCourse(courseIdStr),
        ]);

        if (as.status === "fulfilled" && !cancelled) setAssignments(as.value);
        if (courseResult.status === "fulfilled" && !cancelled) {
          setCourseTitle(courseResult.value.title);
          setCourseData(courseResult.value);
        }
        if (!cancelled && (as.status === "rejected" || courseResult.status === "rejected")) {
          const reason =
            as.status === "rejected" && as.reason instanceof Error
              ? as.reason.message
              : courseResult.status === "rejected" && courseResult.reason instanceof Error
                ? courseResult.reason.message
                : t("student.errors.loadCourses");
          setError(reason);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("student.errors.loadCourses"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [courseId, authLoading, isTeacher, t]);

  if (!courseId) return null;

  if (isTeacher) {
    return <TeacherCourseView courseId={courseId} isDarkTheme={isDarkTheme} />;
  }

  return (
    <div className={`mx-auto max-w-7xl px-4 ${pageBg} min-h-screen py-4`}>
      <div className={`mb-3 text-sm ${textSecondary}`}>
        <Link to="/courses" className={`${breadcrumbText} ${breadcrumbHover}`}>
          {t("student.courses.title")}
        </Link>
        <span className={`mx-2 ${textTertiary}`}>&gt;</span>
        <span className={`font-medium ${textPrimary}`}>{courseTitle ?? t("common.course")}</span>
      </div>

      {isStudent ? (
        <StudentCourseView
          courseId={courseId}
          course={courseData}
          assignments={assignments}
          loading={loading}
          isDarkTheme={isDarkTheme}
        />
      ) : null}

      {authLoading || (!isStudent && loading) ? (
        <div className={`text-sm ${textSecondary}`}>{t("common.loading")}</div>
      ) : null}
      {!authLoading && !me ? (
        <div className={`text-sm ${textSecondary}`}>{t("auth.loginRequired")}</div>
      ) : null}
      {!authLoading && me && !isStudent && !loading ? (
        <div className={`text-sm ${textSecondary}`}>{t("coursesRoute.noAccess")}</div>
      ) : null}
      {error ? (
        <div className={`rounded-md border p-3 text-sm ${errorBox}`}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
