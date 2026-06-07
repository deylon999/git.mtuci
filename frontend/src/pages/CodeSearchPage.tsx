import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  CalendarCheck,
  ChevronRight,
  Clock,
  FileText,
  GitCommit,
  GitFork,
  GraduationCap,
  Search,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { globalSearch, type SearchHit } from "../api/searchApi";
import { useAuthUser } from "../context/AuthUserContext";

interface Props {
  isDarkTheme?: boolean;
}

type SearchTab = "all" | "repositories" | "courses" | "assignments" | "students";

const SUGGESTIONS = ["lab", "Базы данных", "Алгоритмы", "Python", "ИСТ"];

const LANGUAGE_COLORS: Record<string, string> = {
  python: "#3572A5",
  javascript: "#f1e05a",
  typescript: "#3178c6",
  "c++": "#f34b7d",
  c: "#555555",
  java: "#b07219",
  go: "#00ADD8",
  rust: "#dea584",
  php: "#4F5D95",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  return text.split(re).map((part, index) =>
    part.toLowerCase() === q.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ST";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatDate(value?: string | null): string {
  if (!value) return "недавно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "недавно";
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "только что";
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} мин назад`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} ч назад`;
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)} дн назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function languageColor(language?: string | null): string {
  if (!language) return "#6b7280";
  return LANGUAGE_COLORS[language.toLowerCase()] ?? "#60a5fa";
}

function pluralResults(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} результат`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} результата`;
  return `${count} результатов`;
}

function getCourseAbbr(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "К";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
}

export default function CodeSearchPage({ isDarkTheme = true }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const [params, setParams] = useSearchParams();
  const qFromUrl = params.get("q") ?? "";
  const [query, setQuery] = useState(qFromUrl);
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    setQuery(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = query.trim();
      const currentQuery = params.get("q") ?? "";
      if (nextQuery === currentQuery) return;
      const next = new URLSearchParams(params);
      if (nextQuery) next.set("q", nextQuery);
      else next.delete("q");
      setParams(next, { replace: true });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, params, setParams]);

  useEffect(() => {
    const q = qFromUrl.trim();
    if (!q) {
      setHits([]);
      setElapsedMs(null);
      return;
    }

    let cancelled = false;
    const started = performance.now();
    setLoading(true);
    void globalSearch(q, 50)
      .then((res) => {
        if (cancelled) return;
        setHits(res.hits);
        setElapsedMs(Math.round(performance.now() - started));
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Ошибка поиска");
        setHits([]);
        setElapsedMs(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qFromUrl]);

  const grouped = useMemo(() => {
    const repositories = hits.filter((hit) => hit.type === "repository");
    const courses = hits.filter((hit) => hit.type === "course");
    const assignments = hits.filter((hit) => hit.type === "assignment");
    const students = hits.filter((hit) => hit.type === "user");
    return { repositories, courses, assignments, students };
  }, [hits]);

  const counts = {
    repositories: grouped.repositories.length,
    courses: grouped.courses.length,
    assignments: grouped.assignments.length,
    students: grouped.students.length,
  };
  const total = counts.repositories + counts.courses + counts.assignments + counts.students;
  const currentQuery = qFromUrl.trim();

  function applyQuery(nextQuery: string) {
    setQuery(nextQuery);
    const next = new URLSearchParams(params);
    if (nextQuery.trim()) next.set("q", nextQuery.trim());
    else next.delete("q");
    setParams(next, { replace: true });
  }

  function openHit(hit: SearchHit) {
    navigate(hit.href || "/dashboard");
  }

  const ownerLogin = user?.mtuci_login || user?.email?.split("@")[0] || "";

  return (
    <div className="student-search-page" data-theme={isDarkTheme ? "dark" : "light"}>
      <style>{studentSearchStyles}</style>

      <section className="search-hero">
        <form
          className="search-hero-bar"
          onSubmit={(event) => {
            event.preventDefault();
            applyQuery(query);
          }}
        >
          <Search />
          <input
            id="main-search"
            className="search-hero-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по курсам, заданиям и репозиториям..."
            autoFocus
          />
        </form>

        {currentQuery ? (
          <div className="search-meta">
            <div className="search-query-info">
              Результаты по запросу <strong>"{currentQuery}"</strong>
            </div>
            <div className="search-total">
              {loading ? "поиск..." : pluralResults(total)}
              {elapsedMs != null && !loading ? ` · ${elapsedMs} ms` : ""}
            </div>
          </div>
        ) : null}
      </section>

      {!currentQuery ? (
        <section className="no-query">
          <div className="no-query-icon">
            <Search />
          </div>
          <h3>Начните поиск</h3>
          <p>Найдите свои репозитории, курсы, задания или студентов из вашей группы.</p>
          <div className="suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} className="suggestion-chip" type="button" onClick={() => applyQuery(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <nav className="filter-tabs" aria-label="Фильтры поиска">
            <TabButton activeTab={activeTab} count={total} label="Все" tab="all" onSelect={setActiveTab} />
            <TabButton activeTab={activeTab} count={counts.repositories} label="Репозитории" tab="repositories" onSelect={setActiveTab} />
            <TabButton activeTab={activeTab} count={counts.courses} label="Курсы" tab="courses" onSelect={setActiveTab} />
            <TabButton activeTab={activeTab} count={counts.assignments} label="Задания" tab="assignments" onSelect={setActiveTab} />
            <TabButton activeTab={activeTab} count={counts.students} label="Студенты" tab="students" onSelect={setActiveTab} />
          </nav>

          {loading ? (
            <div className="empty-section">
              <Search />
              <p>Ищем совпадения...</p>
            </div>
          ) : total === 0 ? (
            <div className="empty-section">
              <Search />
              <p>Ничего не найдено по запросу "{currentQuery}"</p>
            </div>
          ) : (
            <div id="results-content">
              {(activeTab === "all" || activeTab === "repositories") && grouped.repositories.length > 0 ? (
                <section className="results-section">
                  <SectionHeader
                    count={grouped.repositories.length}
                    icon={<GitFork />}
                    label="Репозитории"
                    moreLabel={activeTab === "all" && grouped.repositories.length > 3 ? "Все репозитории" : undefined}
                    onMore={() => setActiveTab("repositories")}
                  />
                  <div className="result-list">
                    {(activeTab === "all" ? grouped.repositories.slice(0, 3) : grouped.repositories).map((hit) => {
                      const displayName = hit.display_name || hit.title;
                      const isMine = ownerLogin ? displayName.toLowerCase().startsWith(`${ownerLogin.toLowerCase()}/`) : false;
                      const updated = formatDate(hit.repo_pushed_at || hit.repo_updated_at);
                      return (
                        <button key={`repo-${hit.id}`} className="result-card" type="button" onClick={() => openHit(hit)}>
                          <div className="result-icon repo-icon">
                            <GitFork />
                          </div>
                          <div className="result-body">
                            <div className="result-title">
                              {highlightText(displayName, currentQuery)}
                              <span className={`tag ${hit.repo_visibility === "public" ? "tag-green" : "tag-gray"}`}>
                                {hit.repo_visibility === "public" ? "Public" : "Private"}
                              </span>
                              {isMine ? <span className="tag tag-blue">Мой</span> : null}
                            </div>
                            {hit.repo_description || hit.subtitle ? (
                              <div className="result-sub">{highlightText(hit.repo_description || hit.subtitle || "", currentQuery)}</div>
                            ) : null}
                            <div className="result-meta">
                              {hit.repo_language ? (
                                <span>
                                  <i className="lang-dot" style={{ background: languageColor(hit.repo_language) }} />
                                  {hit.repo_language}
                                </span>
                              ) : null}
                              <span>
                                <GitCommit />
                                {hit.repo_commits_count ?? 0} коммитов
                              </span>
                              {(hit.repo_forks_count ?? 0) > 0 ? (
                                <span>
                                  <GitFork />
                                  {hit.repo_forks_count} форков
                                </span>
                              ) : null}
                              <span>обновлён {updated}</span>
                            </div>
                          </div>
                          <div className="result-right">
                            <div className="result-time">{updated}</div>
                            <span className="open-btn">Открыть</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {(activeTab === "all" || activeTab === "courses") && grouped.courses.length > 0 ? (
                <section className="results-section">
                  <SectionHeader count={grouped.courses.length} icon={<BookOpen />} label="Курсы" />
                  <div className="course-result">
                    {grouped.courses.map((hit) => {
                      const progress = hit.course_status === "archived" ? 100 : hit.course_nearest_deadline ? 60 : 35;
                      return (
                        <button key={`course-${hit.id}`} className="course-card" type="button" onClick={() => openHit(hit)}>
                          <div className="course-card-top">
                            <div className="course-abbr">{getCourseAbbr(hit.title)}</div>
                            <div className="course-card-name">{highlightText(hit.title, currentQuery)}</div>
                          </div>
                          <div className="course-teacher-line">
                            {[hit.course_teacher_name, hit.course_groups?.join(", ")].filter(Boolean).join(" · ") || hit.subtitle}
                          </div>
                          <div className="course-tags">
                            <span className={`tag ${hit.course_status === "archived" ? "tag-gray" : "tag-green"}`}>
                              {hit.course_status === "archived" ? "Архив" : "Активный"}
                            </span>
                            <span className="tag tag-gray">{hit.course_assignments_count ?? 0} заданий</span>
                            <span className="tag tag-gray">{hit.course_students_count ?? 0} студентов</span>
                            {hit.course_nearest_deadline ? <span className="tag tag-yellow">до {formatDate(hit.course_nearest_deadline)}</span> : null}
                          </div>
                          <div className="course-prog-label">
                            <span>Прогресс</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="prog-bar">
                            <div className="prog-fill" style={{ width: `${progress}%` }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {(activeTab === "all" || activeTab === "assignments") && grouped.assignments.length > 0 ? (
                <section className="results-section">
                  <SectionHeader count={grouped.assignments.length} icon={<CalendarCheck />} label="Задания" />
                  <div className="result-list">
                    {grouped.assignments.map((hit) => (
                      <button key={`assignment-${hit.id}`} className="assign-card" type="button" onClick={() => openHit(hit)}>
                        <div className="assign-icon">
                          <CalendarCheck />
                        </div>
                        <div className="assign-body">
                          <div className="assign-name">{highlightText(hit.title, currentQuery)}</div>
                          <div className="assign-course">{hit.subtitle || "Задание"}</div>
                          <span className="tag tag-blue">В процессе</span>
                        </div>
                        <div className="assign-right">
                          <div className="assign-score">—</div>
                          <div className="assign-score-label">баллов</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {(activeTab === "all" || activeTab === "students") && grouped.students.length > 0 ? (
                <section className="results-section">
                  <SectionHeader count={grouped.students.length} icon={<Users />} label="Студенты" />
                  <div className="student-result">
                    {grouped.students.map((hit, index) => {
                      const avatarColor = ["#3ecf8e", "#4f8ef7", "#a78bfa", "#f55f57", "#f5c842", "#fb923c"][index % 6];
                      return (
                        <button key={`student-${hit.id}`} className="student-card" type="button" onClick={() => openHit(hit)}>
                          <div className="student-av" style={{ background: `${avatarColor}22`, color: avatarColor }}>
                            {initials(hit.title)}
                          </div>
                          <div className="student-info">
                            <div className="student-name">{highlightText(hit.title, currentQuery)}</div>
                            <div className="student-login">{hit.display_name || "student"}</div>
                            <div className="student-meta">{hit.subtitle || user?.group_name || "Группа"}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {activeTab !== "all" && counts[activeTab] === 0 ? (
                <div className="empty-section">
                  <Search />
                  <p>Ничего не найдено в этой категории</p>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  activeTab,
  count,
  label,
  tab,
  onSelect,
}: {
  activeTab: SearchTab;
  count: number;
  label: string;
  tab: SearchTab;
  onSelect: (tab: SearchTab) => void;
}) {
  return (
    <button className={`ftab ${activeTab === tab ? "active" : ""}`} type="button" onClick={() => onSelect(tab)}>
      {label}
      <span className="ftab-count">{count}</span>
    </button>
  );
}

function SectionHeader({
  count,
  icon,
  label,
  moreLabel,
  onMore,
}: {
  count: number;
  icon: ReactNode;
  label: string;
  moreLabel?: string;
  onMore?: () => void;
}) {
  return (
    <div className="section-header">
      <div className="section-title">
        {icon}
        {label}
        <span className="section-count">{count}</span>
      </div>
      {moreLabel ? (
        <button className="section-more" type="button" onClick={onMore}>
          {moreLabel}
          <ChevronRight />
        </button>
      ) : null}
    </div>
  );
}

const studentSearchStyles = `
.student-search-page {
  color: rgb(230,230,230);
  min-height: 100%;
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}
.student-search-page * { box-sizing: border-box; letter-spacing: 0; }
.search-hero { margin-bottom: 24px; }
.search-hero-bar { position: relative; margin-bottom: 16px; }
.search-hero-bar svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: rgb(68,68,68); pointer-events: none; }
.search-hero-input { width: 100%; background: rgb(17,17,17); border: 1px solid rgb(45,45,45); border-radius: 11px; padding: 12px 16px 12px 42px; font-size: 15px; color: rgb(230,230,230); outline: none; font-family: inherit; transition: border-color .15s, box-shadow .15s; }
.search-hero-input:focus { border-color: rgba(37,99,235,0.6); box-shadow: 0 0 0 3px rgba(37,99,235,0.08); }
.search-hero-input::placeholder { color: rgb(68,68,68); }
.search-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.search-query-info { font-size: 13px; color: rgb(136,136,136); }
.search-query-info strong { color: rgb(230,230,230); font-weight: 600; }
.search-total { font-size: 12px; color: rgb(68,68,68); }
.filter-tabs { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
.ftab { display: flex; align-items: center; gap: 5px; padding: 6px 13px; border-radius: 8px; font-size: 12px; font-weight: 500; border: 1px solid rgb(40,40,40); background: rgb(17,17,17); color: rgb(136,136,136); cursor: pointer; transition: all .15s; }
.ftab:hover { border-color: rgb(55,55,55); color: rgb(200,200,200); }
.ftab.active { border-color: rgba(37,99,235,0.5); background: rgba(37,99,235,0.1); color: rgb(96,165,250); }
.ftab-count { background: rgba(255,255,255,0.07); border-radius: 8px; padding: 0 5px; font-size: 11px; }
.ftab.active .ftab-count { background: rgba(37,99,235,0.2); }
.results-section { margin-bottom: 28px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.section-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: rgb(136,136,136); }
.section-title svg { width: 14px; height: 14px; color: currentColor; }
.section-count { background: rgb(30,30,30); border: 1px solid rgb(40,40,40); border-radius: 8px; padding: 1px 8px; font-size: 11px; color: rgb(136,136,136); font-weight: 600; margin-left: 6px; }
.section-more { font-size: 12px; color: rgb(37,99,235); cursor: pointer; display: flex; align-items: center; gap: 4px; background: transparent; border: 0; font-family: inherit; }
.section-more:hover { text-decoration: underline; }
.section-more svg { width: 12px; height: 12px; }
.result-list { display: flex; flex-direction: column; gap: 6px; }
.result-card { width: 100%; background: rgb(17,17,17); border: 1px solid rgb(40,40,40); border-radius: 10px; padding: 13px 16px; display: flex; align-items: flex-start; gap: 12px; cursor: pointer; transition: border-color .15s, background .1s; position: relative; text-align: left; font-family: inherit; }
.result-card:hover { border-color: rgb(55,55,55); background: rgb(19,19,19); }
.result-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.result-icon svg { width: 16px; height: 16px; }
.repo-icon { background: rgba(96,165,250,0.1); color: rgb(96,165,250); }
.result-body { flex: 1; min-width: 0; }
.result-title { font-size: 13px; font-weight: 600; color: rgb(96,165,250); margin-bottom: 3px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
mark { background: rgba(37,99,235,0.2); color: rgb(147,197,253); border-radius: 2px; padding: 0 2px; font-style: normal; }
.result-sub { font-size: 12px; color: rgb(136,136,136); line-height: 1.5; margin-bottom: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.result-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.result-meta span { font-size: 11px; color: rgb(85,85,85); display: flex; align-items: center; gap: 4px; }
.result-meta span svg { width: 11px; height: 11px; }
.result-right { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.result-time { font-size: 11px; color: rgb(68,68,68); font-family: 'Courier New', monospace; }
.open-btn { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; border: 1px solid rgb(45,45,45); background: rgb(26,26,26); color: rgb(136,136,136); transition: all .15s; opacity: 0; }
.result-card:hover .open-btn { opacity: 1; }
.tag { display: inline-flex; align-items: center; font-size: 10px; font-weight: 500; padding: 2px 7px; border-radius: 5px; }
.tag-blue { background: rgba(37,99,235,0.1); color: rgb(96,165,250); }
.tag-green { background: rgba(34,197,94,0.1); color: rgb(34,197,94); }
.tag-yellow { background: rgba(245,158,11,0.1); color: rgb(245,158,11); }
.tag-gray { background: rgb(28,28,28); color: rgb(100,100,100); border: 1px solid rgb(40,40,40); }
.lang-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.course-result { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.course-card { background: rgb(17,17,17); border: 1px solid rgb(40,40,40); border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: border-color .15s; text-align: left; font-family: inherit; }
.course-card:hover { border-color: rgb(55,55,55); }
.course-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.course-abbr { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; background: rgba(79,142,247,0.12); color: #4f8ef7; }
.course-card-name { font-size: 13px; font-weight: 600; color: rgb(230,230,230); line-height: 1.3; }
.course-teacher-line { font-size: 11px; color: rgb(100,100,100); margin-bottom: 8px; min-height: 16px; }
.course-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
.course-prog-label { display: flex; justify-content: space-between; font-size: 10px; color: rgb(68,68,68); margin-bottom:4px; }
.prog-bar { height: 3px; background: rgb(30,30,30); border-radius: 2px; overflow: hidden; }
.prog-fill { height: 100%; border-radius: 2px; background: rgb(96,165,250); }
.assign-card { width: 100%; background: rgb(17,17,17); border: 1px solid rgb(40,40,40); border-radius: 10px; padding: 13px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: border-color .15s; text-align: left; font-family: inherit; }
.assign-card:hover { border-color: rgb(55,55,55); }
.assign-icon { width: 34px; height: 34px; border-radius: 8px; background: rgba(167,139,250,0.1); color: rgb(167,139,250); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.assign-icon svg { width: 16px; height: 16px; }
.assign-body { flex: 1; min-width: 0; }
.assign-name { font-size: 13px; font-weight: 600; color: rgb(230,230,230); margin-bottom: 3px; }
.assign-course { font-size: 11px; color: rgb(100,100,100); margin-bottom: 6px; }
.assign-right { flex-shrink: 0; text-align: right; }
.assign-score { font-size: 14px; font-weight: 700; color: rgb(68,68,68); font-family: 'Courier New', monospace; }
.assign-score-label { font-size: 10px; color: rgb(68,68,68); margin-top: 2px; }
.student-result { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.student-card { background: rgb(17,17,17); border: 1px solid rgb(40,40,40); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: border-color .15s; text-align: left; font-family: inherit; }
.student-card:hover { border-color: rgb(55,55,55); }
.student-av { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.student-info { flex: 1; min-width: 0; }
.student-name { font-size: 13px; font-weight: 600; color: rgb(230,230,230); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.student-login { font-size: 11px; color: rgb(100,100,100); font-family: 'Courier New', monospace; }
.student-meta { font-size: 11px; color: rgb(68,68,68); margin-top: 3px; }
.empty-section { background: rgb(17,17,17); border: 1px solid rgb(40,40,40); border-radius: 10px; padding: 32px; text-align: center; color: rgb(68,68,68); }
.empty-section svg { width: 28px; height: 28px; color: currentColor; margin: 0 auto 8px; opacity: 0.4; }
.empty-section p { font-size: 13px; }
.no-query { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; }
.no-query-icon { width: 56px; height: 56px; border-radius: 16px; background: rgb(22,22,22); border: 1px solid rgb(40,40,40); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
.no-query-icon svg { width: 24px; height: 24px; color: rgb(68,68,68); }
.no-query h3 { font-size: 16px; font-weight: 600; color: rgb(136,136,136); margin-bottom: 8px; }
.no-query p { font-size: 13px; color: rgb(68,68,68); line-height: 1.6; max-width: 340px; }
.suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px; }
.suggestion-chip { padding: 5px 12px; border-radius: 20px; font-size: 12px; border: 1px solid rgb(40,40,40); background: rgb(20,20,20); color: rgb(100,100,100); cursor: pointer; transition: all .15s; font-family: inherit; }
.suggestion-chip:hover { border-color: rgba(37,99,235,0.4); color: rgb(96,165,250); background: rgba(37,99,235,0.05); }
.student-search-page {
  --search-text: rgb(230,230,230);
  --search-text-soft: rgb(136,136,136);
  --search-text-muted: rgb(100,100,100);
  --search-text-faint: rgb(68,68,68);
  --search-surface: rgb(17,17,17);
  --search-surface-muted: rgb(20,20,20);
  --search-surface-hover: rgb(19,19,19);
  --search-surface-strong: rgb(28,28,28);
  --search-border: rgb(40,40,40);
  --search-border-strong: rgb(55,55,55);
  --search-accent: rgb(96,165,250);
  --search-accent-strong: rgb(37,99,235);
  --search-accent-soft: rgba(37,99,235,0.1);
  --search-accent-mark: rgba(37,99,235,0.2);
  --search-mark-text: rgb(147,197,253);
  --search-shadow: rgba(37,99,235,0.08);
  color: var(--search-text);
}
.student-search-page[data-theme="light"] {
  --search-text: #101828;
  --search-text-soft: #475467;
  --search-text-muted: #667085;
  --search-text-faint: #98a2b3;
  --search-surface: #ffffff;
  --search-surface-muted: #f8fafc;
  --search-surface-hover: #f1f5f9;
  --search-surface-strong: #eef2f7;
  --search-border: #d0d5dd;
  --search-border-strong: #98a2b3;
  --search-accent: #2563eb;
  --search-accent-strong: #1d4ed8;
  --search-accent-soft: rgba(37,99,235,0.08);
  --search-accent-mark: rgba(37,99,235,0.14);
  --search-mark-text: #1d4ed8;
  --search-shadow: rgba(37,99,235,0.12);
}
.student-search-page .search-hero-bar svg { color: var(--search-text-faint); }
.student-search-page .search-hero-input { background: var(--search-surface); border-color: var(--search-border); color: var(--search-text); box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
.student-search-page .search-hero-input:focus { border-color: color-mix(in srgb, var(--search-accent) 65%, transparent); box-shadow: 0 0 0 3px var(--search-shadow); }
.student-search-page .search-hero-input::placeholder { color: var(--search-text-faint); }
.student-search-page .search-query-info,
.student-search-page .section-title,
.student-search-page .ftab { color: var(--search-text-soft); }
.student-search-page .search-query-info strong,
.student-search-page .course-card-name,
.student-search-page .assign-name,
.student-search-page .student-name { color: var(--search-text); }
.student-search-page .search-total,
.student-search-page .result-time,
.student-search-page .course-prog-label,
.student-search-page .assign-score,
.student-search-page .assign-score-label,
.student-search-page .student-meta { color: var(--search-text-faint); }
.student-search-page .ftab,
.student-search-page .result-card,
.student-search-page .course-card,
.student-search-page .assign-card,
.student-search-page .student-card,
.student-search-page .empty-section,
.student-search-page .suggestion-chip,
.student-search-page .no-query-icon { background: var(--search-surface); border-color: var(--search-border); }
.student-search-page .ftab:hover,
.student-search-page .result-card:hover,
.student-search-page .course-card:hover,
.student-search-page .assign-card:hover,
.student-search-page .student-card:hover,
.student-search-page .suggestion-chip:hover { background: var(--search-surface-hover); border-color: var(--search-border-strong); }
.student-search-page .ftab:hover { color: var(--search-text); }
.student-search-page .ftab.active { background: var(--search-accent-soft); border-color: color-mix(in srgb, var(--search-accent) 45%, transparent); color: var(--search-accent); }
.student-search-page .ftab-count { background: var(--search-surface-strong); color: var(--search-text-muted); }
.student-search-page .ftab.active .ftab-count { background: color-mix(in srgb, var(--search-accent) 16%, transparent); color: var(--search-accent); }
.student-search-page .section-count { background: var(--search-surface-strong); border-color: var(--search-border); color: var(--search-text-soft); }
.student-search-page .section-more,
.student-search-page .result-title { color: var(--search-accent); }
.student-search-page mark { background: var(--search-accent-mark); color: var(--search-mark-text); }
.student-search-page .repo-icon { background: var(--search-accent-soft); color: var(--search-accent); }
.student-search-page .result-sub,
.student-search-page .course-teacher-line,
.student-search-page .assign-course,
.student-search-page .student-login,
.student-search-page .no-query h3 { color: var(--search-text-soft); }
.student-search-page .result-meta span,
.student-search-page .empty-section,
.student-search-page .no-query p,
.student-search-page .no-query-icon svg,
.student-search-page .suggestion-chip { color: var(--search-text-muted); }
.student-search-page .open-btn { background: var(--search-surface-muted); border-color: var(--search-border); color: var(--search-text-soft); }
.student-search-page .tag-blue { background: rgba(37,99,235,0.10); color: var(--search-accent); }
.student-search-page .tag-green { background: rgba(34,197,94,0.10); color: #16a34a; }
.student-search-page .tag-yellow { background: rgba(245,158,11,0.13); color: #d97706; }
.student-search-page .tag-gray { background: var(--search-surface-strong); border-color: var(--search-border); color: var(--search-text-muted); }
.student-search-page .course-abbr { background: var(--search-accent-soft); color: var(--search-accent); }
.student-search-page .prog-bar { background: var(--search-surface-strong); }
.student-search-page .prog-fill { background: var(--search-accent); }
.student-search-page .assign-icon { background: rgba(124,58,237,0.10); color: #7c3aed; }
@media (max-width: 900px) {
  .course-result, .student-result { grid-template-columns: 1fr; }
  .result-card { align-items: flex-start; }
  .result-right { display: none; }
}
@media (max-width: 640px) {
  .student-search-page { padding-bottom: 24px; }
  .search-hero-input { font-size: 14px; }
  .result-card, .assign-card { padding: 12px; }
  .result-meta { gap: 8px; }
}
`;
