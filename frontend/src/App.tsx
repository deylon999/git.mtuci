import { lazy, Suspense, useState, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import AuthRequired from "./components/AuthRequired";
import AdminRequired from "./components/AdminRequired";
import RoleBasedHomeRedirect from "./components/RoleBasedHomeRedirect";
import DashboardRoute from "./components/DashboardRoute";
import HomeRoute from "./components/HomeRoute";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Footer from "./components/Footer";
import { PendingCountProvider } from "./context/PendingCountContext";
import { StudentNavCountsProvider } from "./context/StudentNavCountsContext";
import { getTheme } from "./theme";
import { pageGutterClass } from "./layout/pageLayout";
import StudentRepositoryLayout from "./layouts/StudentRepositoryLayout";
import StudentRepoCodePanel from "./pages/student/StudentRepoCodePanel";
import CoursesRoute from "./components/CoursesRoute";
import StudentCreateRepoPage from "./pages/StudentCreateRepoPage";
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const CoursesPage = lazy(() => import("./pages/CoursesPage"));
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
const TeacherGradingQueuePage = lazy(() => import("./pages/TeacherGradingQueuePage"));
const StudentRepositoryCommitsPage = lazy(() => import("./pages/StudentRepositoryCommitsPage"));
const StudentRepositorySectionPage = lazy(() => import("./pages/StudentRepositorySectionPage"));

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

const ADMIN_PATHS = ["/admin", "/users", "/roles", "/admin/forks", "/admin/activity", "/admin/monitoring", "/admin/settings", "/repositories", "/logs", "/dashboard"];

export default function App() {
  const location = useLocation();
  const isAuthPage = AUTH_PATHS.includes(location.pathname);
  const isAdminPage = ADMIN_PATHS.some(path => location.pathname.startsWith(path));

  // Theme state
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });

  useEffect(() => {
    localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
  }, [isDarkTheme]);

  const toggleTheme = () => setIsDarkTheme(prev => !prev);

  const theme = getTheme(isDarkTheme);
  const appBgStyle = { backgroundColor: theme.bg };
  const mainBgStyle = { backgroundColor: theme.bg2 };

  return (
    <PendingCountProvider>
    <StudentNavCountsProvider>
    <div className={`h-screen flex flex-col`} style={{ color: theme.text, backgroundColor: theme.bg }}>
      {!isAuthPage && <Header isDarkTheme={isDarkTheme} onToggleTheme={toggleTheme} />}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        {!isAuthPage ? <Sidebar isDarkTheme={isDarkTheme} /> : null}
        <div className="flex flex-1 flex-col min-h-0">
          <main className={`flex-1 overflow-y-auto py-6 ${pageGutterClass}`} style={{ backgroundColor: theme.bg2 }}>
            <Suspense fallback={<div className="text-sm" style={{ color: theme.text3 }}>Loading...</div>}>
              <Routes>
                <Route path="/" element={<RoleBasedHomeRedirect />} />
                <Route path="/home" element={<HomeRoute isDarkTheme={isDarkTheme} />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                <Route element={<AuthRequired />}>
                  <Route path="/profile" element={<ProfilePage isDarkTheme={isDarkTheme} />} />
                  <Route path="/courses" element={<CoursesRoute isDarkTheme={isDarkTheme} />} />
                  <Route path="/courses/:courseId" element={<CoursePage />} />
                  <Route
                    path="/courses/:courseId/assignments/:assignmentId"
                    element={<AssignmentPage />}
                  />
                  {/* Placeholder routes for new sidebar items */}
                  <Route path="/dashboard" element={<DashboardRoute isDarkTheme={isDarkTheme} />} />
                  <Route path="/projects" element={<CoursesPage />} />
                  <Route path="/repositories" element={<RepositoriesRoute isDarkTheme={isDarkTheme} />} />
                  <Route
                    path="/repositories/:repoId"
                    element={<StudentRepositoryLayout isDarkTheme={isDarkTheme} />}
                  >
                    <Route index element={<Navigate to="code" replace />} />
                    <Route path="code" element={<StudentRepoCodePanel isDarkTheme={isDarkTheme} />} />
                    <Route
                      path="issues"
                      element={<StudentRepositorySectionPage isDarkTheme={isDarkTheme} section="issues" />}
                    />
                    <Route
                      path="pulls"
                      element={<StudentRepositorySectionPage isDarkTheme={isDarkTheme} section="pulls" />}
                    />
                    <Route
                      path="wiki"
                      element={<StudentRepositorySectionPage isDarkTheme={isDarkTheme} section="wiki" />}
                    />
                    <Route
                      path="settings"
                      element={<StudentRepositorySectionPage isDarkTheme={isDarkTheme} section="settings" />}
                    />
                  </Route>
                  <Route
                    path="/repositories/:repoId/commits"
                    element={<StudentRepositoryCommitsPage isDarkTheme={isDarkTheme} />}
                  />
                  <Route path="/assignments" element={<StudentAssignmentsPage isDarkTheme={isDarkTheme} />} />
                  <Route path="/deadlines" element={<StudentDeadlinesPage isDarkTheme={isDarkTheme} />} />
                  <Route path="/repositories/new" element={<StudentCreateRepoPage isDarkTheme={isDarkTheme} />} />
                  <Route path="/repositories/forks" element={<StudentForksPage isDarkTheme={isDarkTheme} />} />
                  <Route path="/grades" element={<StudentGradesPage isDarkTheme={isDarkTheme} />} />
                  <Route path="/grading-queue" element={<TeacherGradingQueuePage isDarkTheme={isDarkTheme} />} />
                  <Route path="/submissions" element={<CoursesPage />} />
                  <Route path="/students" element={<CoursesPage />} />
                  <Route path="/settings" element={<SettingsPage isDarkTheme={isDarkTheme} onToggleTheme={toggleTheme} />} />
                  <Route element={<AdminRequired />}>
                    <Route path="/admin" element={<AdminPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/users" element={<UsersPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/roles" element={<RolesPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/admin/forks" element={<ForksPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/admin/activity" element={<ActivityPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/admin/monitoring" element={<MonitoringPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/admin/settings" element={<AdminSettingsPage isDarkTheme={isDarkTheme} />} />
                    <Route path="/logs" element={<LogsPage isDarkTheme={isDarkTheme} />} />
                  </Route>
                </Route>

                <Route path="*" element={<RoleBasedHomeRedirect />} />
              </Routes>
            </Suspense>
          </main>
          {!isAuthPage ? <Footer isDarkTheme={isDarkTheme} /> : null}
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
    </StudentNavCountsProvider>
    </PendingCountProvider>
  );
}
