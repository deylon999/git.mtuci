import { useEffect, useState } from "react";

import { Link } from "react-router-dom";

import { AlertTriangle, BookOpen, Calendar, GitCommit } from "lucide-react";

import { getMe } from "../../api/authApi";

import { getTeacherDashboardFull, type TeacherDashboardFull } from "../../api/teacherDashboardApi";

import {

  TeacherPageShell,

  TeacherStatGrid,

  TeacherSurface,

  useTeacherTheme,

} from "../../components/teacher/teacherPageUi";

import { useUserPreferences } from "../../context/UserPreferencesContext";

import { formatRelativeTime } from "../../utils/formatRelativeTime";



interface Props {

  isDarkTheme?: boolean;

}



function initials(name: string): string {

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();

  return name.slice(0, 2).toUpperCase();

}



export default function TeacherDashboardPage({ isDarkTheme = false }: Props) {

  const theme = useTeacherTheme(isDarkTheme);

  const { t, tp } = useUserPreferences();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<TeacherDashboardFull | null>(null);

  const [department, setDepartment] = useState<string | null>(null);



  useEffect(() => {

    let cancelled = false;

    async function load() {

      setLoading(true);

      setError(null);

      try {

        const [me, dash] = await Promise.all([getMe(), getTeacherDashboardFull()]);

        if (cancelled) return;

        setData(dash);

        const prefs = me as { preferences?: Record<string, unknown> };

        const dept =

          dash.department ||

          (typeof prefs?.preferences?.department === "string"

            ? prefs.preferences.department

            : null);

        setDepartment(dept);

      } catch (e) {

        if (!cancelled) setError(e instanceof Error ? e.message : t("teacher.errors.dashboardLoadFailed"));

      } finally {

        if (!cancelled) setLoading(false);

      }

    }

    void load();

    return () => {

      cancelled = true;

    };

  }, [t]);



  const maxActivity = Math.max(1, ...(data?.activity_by_day.map((d) => d.commits) ?? [1]));

  const greetingName = data?.greeting_name?.split(" ")[0] ?? t("teacher.dashboard.greetingFallback");



  return (

    <TeacherPageShell>

      <div>

        <h1 className="text-xl font-semibold" style={{ color: theme.text }}>

          {tp("teacher.dashboard.greeting", { name: greetingName })}

        </h1>

        {department ? (

          <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>

            {department}

          </p>

        ) : null}

      </div>



      {!loading && data && data.pending_grading > 0 ? (

        <Link

          to="/teacher/code-review"

          className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-opacity hover:opacity-90"

          style={{

            backgroundColor: `${theme.danger}14`,

            borderColor: `${theme.danger}50`,

            color: theme.danger,

          }}

        >

          <AlertTriangle className="h-5 w-5 shrink-0" />

          <span className="text-sm font-medium">

            {tp(

              data.pending_grading === 1

                ? "teacher.dashboard.pendingBannerOne"

                : "teacher.dashboard.pendingBannerMany",

              { count: data.pending_grading },

            )}

          </span>

        </Link>

      ) : null}



      {loading ? (

        <p className="text-sm py-8 text-center" style={{ color: theme.text2 }}>

          {t("teacher.dashboard.loading")}

        </p>

      ) : error ? (

        <p className="text-sm rounded-xl border px-4 py-3" style={{ color: theme.danger, borderColor: theme.border }}>

          {error}

        </p>

      ) : data ? (

        <>

          <TeacherStatGrid

            theme={theme}

            items={[

              {

                label: t("teacher.dashboard.statActiveCourses"),

                value: data.active_courses_count,

                sub: t("teacher.dashboard.statActiveCoursesSub"),

              },

              { label: t("teacher.dashboard.statStudentsTotal"), value: data.students_total },

              {

                label: t("teacher.dashboard.statPending"),

                value: data.pending_grading,

                color: data.pending_grading > 0 ? theme.danger : theme.text,

              },

              {

                label: t("teacher.dashboard.statCommitsToday"),

                value: data.commits_today,

                color: theme.accent2,

              },

            ]}

          />



          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            <div className="xl:col-span-2 flex flex-col gap-4">

              <TeacherSurface

                theme={theme}

                title={t("teacher.dashboard.pendingWorkTitle")}

                action={

                  <Link to="/teacher/code-review" className="text-xs" style={{ color: theme.accent2 }}>

                    {t("teacher.dashboard.viewAll")}

                  </Link>

                }

              >

                {data.pending_work.length === 0 ? (

                  <p className="px-4 py-8 text-sm text-center" style={{ color: theme.text2 }}>

                    {t("teacher.dashboard.noPendingWork")}

                  </p>

                ) : (

                  <ul>

                    {data.pending_work.map((item) => (

                      <li

                        key={item.submission_id}

                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b last:border-b-0"

                        style={{

                          borderColor: theme.border,

                          backgroundColor: item.is_stale ? `${theme.danger}08` : undefined,

                        }}

                      >

                        <div className="flex items-center gap-3 min-w-0">

                          <div

                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"

                            style={{ backgroundColor: `${theme.accent}22`, color: theme.accent2 }}

                          >

                            {initials(item.student_name)}

                          </div>

                          <div className="min-w-0">

                            <p className="text-sm font-medium truncate" style={{ color: theme.text }}>

                              {item.student_name}

                            </p>

                            <p className="text-xs truncate" style={{ color: theme.text2 }}>

                              {item.course_title} · {item.assignment_title}

                              {item.repo_name ? ` · ${item.repo_name}` : ""}

                            </p>

                            <p

                              className="text-[10px] mt-0.5"

                              style={{ color: item.is_stale ? theme.danger : theme.text3 }}

                            >

                              {formatRelativeTime(new Date(item.submitted_at))}

                              {item.is_stale ? t("teacher.dashboard.staleOver48h") : ""}

                            </p>

                          </div>

                        </div>

                        <Link

                          to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}

                          className="rounded-lg px-3 py-1.5 text-xs font-medium shrink-0"

                          style={{ backgroundColor: theme.accent, color: "#fff" }}

                        >

                          {t("teacher.dashboard.review")}

                        </Link>

                      </li>

                    ))}

                  </ul>

                )}

              </TeacherSurface>



              <TeacherSurface theme={theme} title={t("teacher.dashboard.recentCommitsTitle")}>

                {data.recent_commits.length === 0 ? (

                  <p className="px-4 py-8 text-sm text-center" style={{ color: theme.text2 }}>

                    {t("teacher.dashboard.noCommits")}

                  </p>

                ) : (

                  <ul>

                    {data.recent_commits.map((c, i) => (

                      <li

                        key={`${c.created_at}-${i}`}

                        className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"

                        style={{ borderColor: theme.border }}

                      >

                        <GitCommit className="h-4 w-4 mt-0.5 shrink-0" style={{ color: theme.accent2 }} />

                        <div className="min-w-0 flex-1">

                          <p className="text-sm" style={{ color: theme.text }}>

                            <span className="font-medium">{c.student_name}</span>

                            {c.repo_name ? (

                              <span style={{ color: theme.text2 }}> · {c.repo_name}</span>

                            ) : null}

                          </p>

                          {c.message ? (

                            <p className="text-xs truncate mt-0.5 font-mono" style={{ color: theme.text3 }}>

                              {c.message}

                            </p>

                          ) : null}

                        </div>

                        <span className="text-[10px] shrink-0" style={{ color: theme.text3 }}>

                          {formatRelativeTime(new Date(c.created_at))}

                        </span>

                      </li>

                    ))}

                  </ul>

                )}

              </TeacherSurface>

            </div>



            <div className="flex flex-col gap-4">

              <TeacherSurface

                theme={theme}

                title={t("teacher.dashboard.myCoursesTitle")}

                action={

                  <Link to="/teacher/courses" className="text-xs" style={{ color: theme.accent2 }}>

                    {t("teacher.dashboard.viewAll")}

                  </Link>

                }

              >

                {data.courses.length === 0 ? (

                  <p className="px-4 py-6 text-sm text-center" style={{ color: theme.text2 }}>

                    {t("teacher.dashboard.noCourses")}

                  </p>

                ) : (

                  <ul>

                    {data.courses.slice(0, 6).map((c) => (

                      <li key={c.course_id}>

                        <Link

                          to={`/courses/${c.course_id}`}

                          className="flex items-center justify-between gap-2 px-4 py-3 border-b last:border-b-0 hover:opacity-90"

                          style={{ borderColor: theme.border }}

                        >

                          <div className="min-w-0">

                            <p className="text-sm font-medium truncate flex items-center gap-2" style={{ color: theme.text }}>

                              <BookOpen className="h-3.5 w-3.5 shrink-0" style={{ color: theme.accent2 }} />

                              {c.title}

                            </p>

                            <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>

                              {tp("teacher.dashboard.courseMeta", {

                                students: c.students_count,

                                assignments: c.assignments_count,

                              })}

                            </p>

                          </div>

                          {c.pending_count > 0 ? (

                            <span

                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"

                              style={{ backgroundColor: theme.danger, color: "#fff" }}

                            >

                              {c.pending_count}

                            </span>

                          ) : null}

                        </Link>

                      </li>

                    ))}

                  </ul>

                )}

              </TeacherSurface>



              <TeacherSurface theme={theme} title={t("teacher.dashboard.deadlinesTitle")}>

                {data.deadlines.length === 0 ? (

                  <p className="px-4 py-6 text-sm text-center" style={{ color: theme.text2 }}>

                    {t("teacher.dashboard.noDeadlines")}

                  </p>

                ) : (

                  <ul>

                    {data.deadlines.map((d) => (

                      <li

                        key={d.assignment_id}

                        className="px-4 py-3 border-b last:border-b-0"

                        style={{ borderColor: theme.border }}

                      >

                        <p className="text-sm font-medium truncate" style={{ color: theme.text }}>

                          {d.assignment_title}

                        </p>

                        <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>

                          {d.course_title}

                        </p>

                        <div className="mt-2 flex items-center justify-between text-xs">

                          <span className="flex items-center gap-1" style={{ color: theme.text3 }}>

                            <Calendar className="h-3 w-3" />

                            {new Date(d.deadline).toLocaleString("ru-RU", {

                              day: "numeric",

                              month: "short",

                              hour: "2-digit",

                              minute: "2-digit",

                            })}

                          </span>

                          <span style={{ color: theme.accent2 }}>

                            {tp("teacher.dashboard.submittedRatio", {

                              submitted: d.submitted_count,

                              total: d.total_students,

                            })}

                          </span>

                        </div>

                      </li>

                    ))}

                  </ul>

                )}

              </TeacherSurface>



              <TeacherSurface theme={theme} title={t("teacher.dashboard.activityTitle")}>

                <div className="px-4 py-4">

                  <div className="flex items-end gap-1.5 h-24">

                    {data.activity_by_day.map((day) => {

                      const pct = (day.commits / maxActivity) * 100;

                      const label = new Date(day.date).toLocaleDateString("ru-RU", { weekday: "short" });

                      return (

                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">

                          <div

                            className="w-full rounded-t-md min-h-[4px]"

                            style={{

                              height: `${Math.max(8, pct)}%`,

                              backgroundColor: theme.accent,

                            }}

                            title={tp("teacher.dashboard.commitsTooltip", { count: day.commits })}

                          />

                          <span className="text-[9px] truncate w-full text-center" style={{ color: theme.text3 }}>

                            {label}

                          </span>

                        </div>

                      );

                    })}

                  </div>

                </div>

              </TeacherSurface>

            </div>

          </div>

        </>

      ) : null}

    </TeacherPageShell>

  );

}

