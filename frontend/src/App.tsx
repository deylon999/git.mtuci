import { lazy, Suspense, useState, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearToken, getToken } from "./api/client";
import { Toaster } from "react-hot-toast";
import AuthRequired from "./components/AuthRequired";
import AdminRequired from "./components/AdminRequired";
import RoleBasedHomeRedirect from "./components/RoleBasedHomeRedirect";
import DashboardRoute from "./components/DashboardRoute";
import HomeRoute from "./components/HomeRoute";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import { PendingCountProvider } from "./context/PendingCountContext";
import { StudentNavCountsProvider } from "./context/StudentNavCountsContext";
import { AuthUserProvider, useAuthUser } from "./context/AuthUserContext";
import { PermissionsProvider } from "./context/PermissionsContext";
import RequirePermission from "./components/RequirePermission";
import { UserPreferencesProvider, useUserPreferences } from "./context/UserPreferencesContext";
import { RoleModeProvider, useRoleMode } from "./context/RoleModeContext";
import StudentShellBootstrapRunner from "./components/StudentShellBootstrapRunner";
import AppErrorBoundary from "./components/AppErrorBoundary";
import PageLoadingFallback from "./components/PageLoadingFallback";
import { getTheme } from "./theme";
import { pageGutterClass } from "./layout/pageLayout";
import StudentRepositoryLayout from "./layouts/StudentRepositoryLayout";
import StudentRepoCodePanel from "./pages/student/StudentRepoCodePanel";
import CoursesRoute from "./components/CoursesRoute";
import ProjectsRoute from "./components/ProjectsRoute";
import StudentCreateRepoPage from "./pages/StudentCreateRepoPage";
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const CoursePage = lazy(() => import("./pages/CoursePage"));
const AssignmentPage = lazy(() => import("./pages/AssignmentPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const RolesPage = lazy(() => import("./pages/RolesPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const RepositoriesRoute = lazy(() => import("./components/RepositoriesRoute"));
const ForksPage = lazy(() => import("./pages/ForksPage"));
const LogsPage = lazy(() => import("./pages/LogsPage"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage"));
const AdminSettingsPage = lazy(() => import("./pages/AdminSettingsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const StudentDeadlinesPage = lazy(() => import("./pages/StudentDeadlinesPage"));
const StudentAssignmentsPage = lazy(() => import("./pages/StudentAssignmentsPage"));
const StudentGradesPage = lazy(() => import("./pages/StudentGradesPage"));
const StudentForksPage = lazy(() => import("./pages/StudentForksPage"));
const TeacherCoursesPage = lazy(() => import("./pages/teacher/TeacherCoursesPage"));
const TeacherStudentsPage = lazy(() => import("./pages/teacher/TeacherStudentsPage"));
const TeacherCodeReviewPage = lazy(() => import("./pages/teacher/TeacherCodeReviewPage"));
const TeacherTemplatesPage = lazy(() => import("./pages/teacher/TeacherTemplatesPage"));
const TeacherActivityPage = lazy(() => import("./pages/teacher/TeacherActivityPage"));
const StudentRepositoryCommitsPage = lazy(() => import("./pages/StudentRepositoryCommitsPage"));
const StudentRepositoryBranchesPage = lazy(() => import("./pages/StudentRepositoryBranchesPage"));
const StudentRepositorySectionPage = lazy(() => import("./pages/StudentRepositorySectionPage"));
const StudentRepositoryCommitDiffPage = lazy(() => import("./pages/StudentRepositoryCommitDiffPage"));
const IssuesPage = lazy(() => import("./pages/IssuesPage"));
const IssueDetailPage = lazy(() => import("./components/issues/IssueDetail"));
const ReviewsPage = lazy(() => import("./pages/ReviewsPage"));
const CodeSearchPage = lazy(() => import("./pages/CodeSearchPage"));
const AdminSystemSearchPage = lazy(() => import("./pages/AdminSystemSearchPage"));
const AdminNotificationsPage = lazy(() => import("./pages/AdminNotificationsPage"));

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

const ADMIN_PATHS = ["/admin", "/users", "/roles", "/admin/forks", "/admin/activity", "/admin/monitoring", "/admin/settings", "/repositories", "/logs", "/dashboard"];

function PendingApprovalScreen({
  isDarkTheme,
  onBackToLogin,
}: {
  isDarkTheme: boolean;
  onBackToLogin: () => void;
}) {
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);

  return (
    <div className="h-screen w-full flex items-center justify-center px-6" style={{ backgroundColor: theme.bg }}>
      <div className="text-center max-w-xl">
        <h1 className="text-3xl font-semibold" style={{ color: theme.text }}>
          {t("auth.pendingApproval.title")}
        </h1>
        <p className="mt-3 text-base" style={{ color: theme.text2 }}>
          {t("auth.pendingApproval.subtitle")}
        </p>
        <button
          type="button"
          onClick={onBackToLogin}
          className="mt-8 rounded-lg border px-4 py-2.5 text-sm transition"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
        >
          {t("auth.pendingApproval.backToLogin")}
        </button>
      </div>
    </div>
  );
}

function AuthLoadingScreen({ isDarkTheme }: { isDarkTheme: boolean }) {
  const { t } = useUserPreferences();
  const bg = isDarkTheme ? "#111827" : "#f3f4f6";
  const text = isDarkTheme ? "#e5e7eb" : "#374151";

  return (
    <div className="h-screen w-full flex items-center justify-center px-6" style={{ backgroundColor: bg, color: text }}>
      <p className="text-sm">{t("common.loading")}</p>
    </div>
  );
}

export default function App() {
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });

  useEffect(() => {
    localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
    document.documentElement.classList.toggle("dark", isDarkTheme);
  }, [isDarkTheme]);

  return (
    <UserPreferencesProvider isDarkTheme={isDarkTheme} setIsDarkTheme={setIsDarkTheme}>
      <AuthUserProvider>
        <PermissionsProvider>
          <RoleModeProvider>
            <StudentShellBootstrapRunner />
            <AppShell isDarkTheme={isDarkTheme} setIsDarkTheme={setIsDarkTheme} />
          </RoleModeProvider>
        </PermissionsProvider>
      </AuthUserProvider>
    </UserPreferencesProvider>
  );
}

function AppShell({
  isDarkTheme,
  setIsDarkTheme,
}: {
  isDarkTheme: boolean;
  setIsDarkTheme: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthPage = AUTH_PATHS.includes(location.pathname);
  const { persistTheme } = useUserPreferences();
  const { user, loading, clearUser } = useAuthUser();
  const { mode, canSwitchLaborantMode } = useRoleMode();
  const effectiveRole =
    user?.role === "laborant" && canSwitchLaborantMode && mode === "student" ? "student" : user?.role;
  const isTeacherLike = effectiveRole === "teacher" || effectiveRole === "laborant";
  const mainPaddingY = !isAuthPage && isTeacherLike ? "py-4" : "py-6";

  if (!isAuthPage && !getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const isPendingStudent = Boolean(user?.role === "student" && user.is_pending);

  if (!isAuthPage && loading && !user) {
    return <AuthLoadingScreen isDarkTheme={isDarkTheme} />;
  }

  if (!isAuthPage && isPendingStudent) {
    return (
      <PendingApprovalScreen
        isDarkTheme={isDarkTheme}
        onBackToLogin={() => {
          clearToken();
          clearUser();
          navigate("/login", { replace: true });
        }}
      />
    );
  }

  const toggleTheme = () => {
    setIsDarkTheme((prev) => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      void persistTheme(next ? "dark" : "light");
      return next;
    });
  };

  const theme = getTheme(isDarkTheme);

  return (
    <PendingCountProvider>
    <StudentNavCountsProvider>
    <AppErrorBoundary isDarkTheme={isDarkTheme}>
    <div className={`h-screen flex flex-col`} style={{ color: theme.text, backgroundColor: theme.bg }}>
      {!isAuthPage && <Header isDarkTheme={isDarkTheme} onToggleTheme={toggleTheme} />}
      <div
        className="flex flex-1 min-h-0 overflow-hidden"
        style={isAuthPage || isTeacherLike ? undefined : { height: "calc(100vh - 56px)" }}
      >
        {!isAuthPage ? <Sidebar isDarkTheme={isDarkTheme} /> : null}
        <div className="flex flex-1 flex-col min-h-0">
          <main
            className={`flex-1 overflow-y-auto min-w-0 ${
              isAuthPage ? "" : isTeacherLike ? "px-6 py-5" : `${mainPaddingY} ${pageGutterClass}`
            }`}
            style={{ backgroundColor: theme.bg }}
          >
            <Suspense fallback={<PageLoadingFallback isDarkTheme={isDarkTheme} />}>
              <Routes>
                <Route path="/" element={<RoleBasedHomeRedirect />} />
                <Route path="/home" element={<HomeRoute isDarkTheme={isDarkTheme} />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                <Route element={<AuthRequired />}>
                  <Route path="/profile" element={<ProfilePage isDarkTheme={isDarkTheme} />} />
                  <Route element={<RequirePermission permission="assignment_view" />}>
                    <Route path="/courses" element={<CoursesRoute isDarkTheme={isDarkTheme} />} />
                    <Route path="/courses/:courseId" element={<CoursePage isDarkTheme={isDarkTheme} />} />
                    <Route
                      path="/courses/:courseId/assignments/:assignmentId"
                      element={<AssignmentPage />}
                    />
                    <Route path="/assignments" element={<StudentAssignmentsPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/deadlines" element={<StudentDeadlinesPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/grades" element={<StudentGradesPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                  <Route path="/dashboard" element={<DashboardRoute isDarkTheme={isDarkTheme} />} />
                  <Route path="/projects" element={<ProjectsRoute isDarkTheme={isDarkTheme} />} />
                  <Route path="/search/code" element={<CodeSearchPage isDarkTheme={isDarkTheme} />} />
                  <Route element={<RequirePermission permission="repo_view" />}>
                    <Route path="/repositories" element={<RepositoriesRoute isDarkTheme={isDarkTheme} />} />
                    <Route path="/repositories/forks" element={<StudentForksPage isDarkTheme={isDarkTheme} />} />
                  <Route
                    path="/repositories/:repoId"
                    element={<StudentRepositoryLayout isDarkTheme={isDarkTheme} />}
                  >
                    <Route index element={<Navigate to="code" replace />} />
                    <Route path="code" element={<StudentRepoCodePanel isDarkTheme={isDarkTheme} />} />
                    <Route
                      path="branches"
                      element={<StudentRepositoryBranchesPage isDarkTheme={isDarkTheme} />}
                    />
                    <Route path="issues">
                      <Route index element={<IssuesPage isDarkTheme={isDarkTheme} />} />
                      <Route path=":number" element={<IssueDetailPage isDarkTheme={isDarkTheme} />} />
                    </Route>
                    <Route path="pulls">
                      <Route index element={<StudentRepositorySectionPage isDarkTheme={isDarkTheme} section="pulls" />} />
                      <Route path=":prNumber/reviews" element={<ReviewsPage isDarkTheme={isDarkTheme} />} />
                    </Route>
                    <Route
                      path="wiki"
                      element={<StudentRepositorySectionPage isDarkTheme={isDarkTheme} section="wiki" />}
                    />
                    <Route
                      path="settings"
                      element={<StudentRepositorySectionPage isDarkTheme={isDarkTheme} section="settings" />}
                    />
                    <Route
                      path="commits"
                      element={<StudentRepositoryCommitsPage isDarkTheme={isDarkTheme} />}
                    />
                    <Route
                      path="commits/:sha"
                      element={<StudentRepositoryCommitDiffPage isDarkTheme={isDarkTheme} />}
                    />
                  </Route>
                  </Route>
                  <Route element={<RequirePermission permission="repo_create" />}>
                    <Route path="/repositories/new" element={<StudentCreateRepoPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                  <Route path="/grading-queue" element={<Navigate to="/teacher/code-review" replace />} />
                  <Route element={<RequirePermission permission="assignment_view" />}>
                    <Route path="/teacher/courses" element={<TeacherCoursesPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                  <Route element={<RequirePermission permission="user_view" />}>
                    <Route path="/teacher/students" element={<TeacherStudentsPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                  <Route element={<RequirePermission anyOf={["grade_edit", "repo_view_students", "lab_accept"]} />}>
                    <Route path="/teacher/code-review" element={<TeacherCodeReviewPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                  <Route element={<RequirePermission permission="repo_view" />}>
                    <Route path="/teacher/templates" element={<TeacherTemplatesPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                  <Route element={<RequirePermission permission="repo_view_students" />}>
                    <Route path="/teacher/activity" element={<TeacherActivityPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                  <Route path="/submissions" element={<Navigate to="/teacher/code-review" replace />} />
                  <Route path="/students" element={<Navigate to="/teacher/students" replace />} />
                  <Route path="/settings" element={<SettingsPage isDarkTheme={isDarkTheme} onToggleTheme={toggleTheme} />} />
                  <Route element={<AdminRequired />}>
                    <Route path="/admin" element={<AdminPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/admin/search" element={<AdminSystemSearchPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/admin/notifications" element={<AdminNotificationsPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/roles" element={<RolesPage isDarkTheme={isDarkTheme} />} />
                    <Route element={<RequirePermission permission="user_view" />}>
                      <Route path="/users" element={<UsersPage isDarkTheme={isDarkTheme} />} />
                    </Route>
                    <Route element={<RequirePermission permission="repo_view" />}>
                      <Route path="/repositories" element={<RepositoriesRoute isDarkTheme={isDarkTheme} />} />
                      <Route path="/admin/forks" element={<ForksPage isDarkTheme={isDarkTheme} />} />
                    </Route>
                    <Route element={<RequirePermission permission="settings_view" />}>
                      <Route path="/admin/activity" element={<ActivityPage isDarkTheme={isDarkTheme} />} />
                      <Route path="/admin/monitoring" element={<MonitoringPage isDarkTheme={isDarkTheme} />} />
                    </Route>
                    <Route element={<RequirePermission permission="settings_edit" />}>
                      <Route path="/admin/settings" element={<AdminSettingsPage isDarkTheme={isDarkTheme} />} />
                    </Route>
                    <Route element={<RequirePermission permission="logs_view" />}>
                      <Route path="/logs" element={<LogsPage isDarkTheme={isDarkTheme} />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<RoleBasedHomeRedirect />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: theme.bg3,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            padding: "12px 16px",
            borderRadius: "8px",
          },
          success: {
            iconTheme: {
              primary: theme.success,
              secondary: theme.bg3,
            },
          },
          error: {
            iconTheme: {
              primary: theme.danger,
              secondary: theme.bg3,
            },
          },
        }}
      />
    </div>
    </AppErrorBoundary>
    </StudentNavCountsProvider>
    </PendingCountProvider>
  );
}
