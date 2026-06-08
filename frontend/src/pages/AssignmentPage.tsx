import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  checkPlagiarism,
  comparePlagiarism,
  getSubmissions,
  getMyGrade,
  gradeSubmission,
  submitAssignment,
  downloadSubmissionAttachment,
  getCourse,
  getAssignments,
  getCommits,
  getFiles,
  getFileContent,
} from "../api/coursesApi";
import { getMe } from "../api/authApi";
import type {
  Assignment,
  Commit,
  Course,
  FileContent,
  MyGradeRead,
  PlagiarismCheckResult,
  PlagiarismCompareResult,
  PlagiarismSource,
  RepoFile,
  SubmissionAttachmentRead,
  SubmissionStatusRead,
  UserRead,
} from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";

type ViewState = {
  file: RepoFile | null;
  loading: boolean;
  content: string | null;
  error: string | null;
};

type AssignmentTab = "commits" | "files" | "grading" | "plagiarism";

interface AssignmentPageProps {
  isDarkTheme?: boolean;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function AssignmentPage({ isDarkTheme = false }: AssignmentPageProps) {
  const { t, tp } = useUserPreferences();
  // Theme-based colors
  const pageBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-[#f9fafb]";
  const cardBg = isDarkTheme ? "bg-[#1e1e1e]" : "bg-[#f5f5f5]";
  const cardBorder = isDarkTheme ? "border-[#30363d]" : "border-[#d4d4d4]";
  const textPrimary = isDarkTheme ? "text-[#e6e6e6]" : "text-[#171717]";
  const textSecondary = isDarkTheme ? "text-[#888888]" : "text-[#737373]";
  const textTertiary = isDarkTheme ? "text-[#444444]" : "text-[#a3a3a3]";
  const inputBg = isDarkTheme ? "bg-[#0a0a0a]" : "bg-[#f5f5f5]";
  const inputBorder = isDarkTheme ? "border-[#30363d]" : "border-[#d4d4d4]";
  const hoverBg = isDarkTheme ? "hover:bg-[#1a1a1a]" : "hover:bg-[#f3f4f6]";
  const tabActiveBg = isDarkTheme ? "bg-[#2563eb]/20 border-[#3b82f6] text-[#60a5fa]" : "bg-[#2563eb]/10 border-[#3b82f6] text-[#2563eb]";
  const tabInactiveBg = isDarkTheme ? "bg-[#1e1e1e] border-[#30363d] text-[#888888] hover:border-[#3b82f6] hover:text-[#3b82f6]" : "bg-[#f5f5f5] border-[#d4d4d4] text-[#737373] hover:border-[#3b82f6] hover:text-[#2563eb]";
  const buttonPrimary = "bg-[#2563eb] hover:bg-[#1d4ed8] text-white";
  const breadcrumbText = "text-[#3b82f6]";
  const breadcrumbHover = isDarkTheme ? "hover:text-[#60a5fa]" : "hover:text-[#1d4ed8]";
  const separatorColor = isDarkTheme ? "text-[#30363d]" : "text-[#a3a3a3]";
  const deadlineBadge = isDarkTheme ? "bg-[#2563eb]/20 text-[#60a5fa]" : "bg-[#2563eb]/10 text-[#2563eb]";
  const penaltyBox = isDarkTheme ? "bg-[#1e1e1e] border-[#30363d]" : "bg-[#f5f5f5] border-[#d4d4d4]";
  const errorBox = isDarkTheme ? "bg-[#ef4444]/15 border-[#ef4444]/30 text-[#ef4444]" : "bg-[#ef4444]/10 border-[#ef4444]/25 text-[#dc2626]";
  const successBox = isDarkTheme ? "bg-[#22c55e]/15 border-[#22c55e]/30 text-[#22c55e]" : "bg-[#22c55e]/10 border-[#22c55e]/25 text-[#16a34a]";
  const codeHeader = isDarkTheme ? "bg-[#111111] border-[#30363d] text-[#e6e6e6]" : "bg-white border-[#d4d4d4] text-[#171717]";
  const codeLineNum = isDarkTheme ? "border-r-[#30363d] text-[#444444]" : "border-r border-[#d4d4d4] text-[#a3a3a3]";
  const timelineDot = "bg-[#3b82f6]";
  const timelineLine = isDarkTheme ? "bg-[#2563eb]/30" : "bg-[#2563eb]/15";
  const commitCard = isDarkTheme ? "bg-[#1e1e1e] border-[#30363d]" : "bg-[#f5f5f5] border-[#d4d4d4]";
  const commitHash = "text-[#3b82f6]";
  const modalOverlay = isDarkTheme ? "bg-black/60" : "bg-black/40";
  const modalBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-[#f9fafb]";
  const avatarBg = isDarkTheme ? "bg-[#2563eb]/20 text-[#60a5fa]" : "bg-[#2563eb]/10 text-[#2563eb]";
  const gaugeBg = isDarkTheme ? "#30363d" : "#e5e7eb";
  const similarityHigh = isDarkTheme ? "bg-[#ef4444]/15 text-[#ef4444]" : "bg-[#ef4444]/10 text-[#dc2626]";
  const similarityMedium = isDarkTheme ? "bg-[#f59e0b]/15 text-[#f59e0b]" : "bg-[#f59e0b]/10 text-[#d97706]";
  const similarityLow = isDarkTheme ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-[#22c55e]/10 text-[#16a34a]";
  const { courseId, assignmentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [me, setMe] = useState<UserRead | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionStatusRead[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [gradeInputs, setGradeInputs] = useState<Record<string, string>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [savingGradeFor, setSavingGradeFor] = useState<string | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [myGrade, setMyGrade] = useState<MyGradeRead | null>(null);
  const [myGradeLoading, setMyGradeLoading] = useState(false);
  const [myGradeError, setMyGradeError] = useState<string | null>(null);
  const [submissionAnswer, setSubmissionAnswer] = useState("");
  const [submissionRepoUrl, setSubmissionRepoUrl] = useState("");
  const [submissionReportFile, setSubmissionReportFile] = useState<File | null>(null);
  const [submissionFiles, setSubmissionFiles] = useState<File[]>([]);
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [plagiarism, setPlagiarism] = useState<PlagiarismCompareResult | null>(null);
  const [plagiarismPairs, setPlagiarismPairs] = useState<PlagiarismCheckResult | null>(null);
  const [plagiarismLoading, setPlagiarismLoading] = useState(false);
  const [plagiarismCheckLoading, setPlagiarismCheckLoading] = useState(false);
  const [plagiarismError, setPlagiarismError] = useState<string | null>(null);
  const [plagiarismSource, setPlagiarismSource] = useState<PlagiarismSource>("code");
  const [selectedStudent1Id, setSelectedStudent1Id] = useState("");
  const [selectedStudent2Id, setSelectedStudent2Id] = useState("");
  const [selectedRepoStudentId, setSelectedRepoStudentId] = useState("");
  const [activeTab, setActiveTab] = useState<AssignmentTab>("commits");

  const [view, setView] = useState<ViewState>({
    file: null,
    loading: false,
    content: null,
    error: null,
  });

  const headerTitle = useMemo(() => {
    if (!assignment) return t("repo.assignment.defaultTitle");
    return assignment.title;
  }, [assignment]);

  const selectedStudent1 = useMemo(
    () => submissions.find((s) => s.student_id === selectedStudent1Id) ?? null,
    [submissions, selectedStudent1Id],
  );
  const selectedStudent2 = useMemo(
    () => submissions.find((s) => s.student_id === selectedStudent2Id) ?? null,
    [submissions, selectedStudent2Id],
  );
  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.name.localeCompare(b.name)),
    [files],
  );
  const sortedPenaltyPeriods = useMemo(
    () => (assignment ? [...assignment.late_penalty_periods].sort((a, b) => a.weeks - b.weeks) : []),
    [assignment],
  );

  useEffect(() => {
    if (!courseId || !assignmentId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const asList = await getAssignments(courseId);

        if (cancelled) return;

        const found = asList.find((a) => a.id === assignmentId) ?? null;
        setAssignment(found);
        setCommits([]);
        setFiles([]);
        const meResult = await getMe();
        if (cancelled) return;
        setMe(meResult);
        if (meResult.role === "teacher" || meResult.role === "laborant") {
          const courseRow = await getCourse(courseId);
          if (cancelled) return;
          setCourse(courseRow);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("repo.errors.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [courseId, assignmentId]);

  useEffect(() => {
    if (me?.role === "student") {
      setActiveTab("grading");
    }
  }, [me?.role]);

  useEffect(() => {
    if (!courseId || !assignmentId || !me) return;
    if (me.role === "student") return;
    if (me.role === "teacher" && !selectedRepoStudentId) return;
    let cancelled = false;

    async function loadRepoData() {
      try {
        const [commitsRes, filesRes] = await Promise.all([
          getCommits(courseId, assignmentId, me.role === "teacher" ? selectedRepoStudentId : undefined),
          getFiles(courseId, assignmentId, me.role === "teacher" ? selectedRepoStudentId : undefined),
        ]);
        if (cancelled) return;
        setCommits(commitsRes);
        setFiles(filesRes);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("repo.errors.loadFailed"));
      }
    }

    loadRepoData();
    return () => {
      cancelled = true;
    };
  }, [courseId, assignmentId, me, selectedRepoStudentId]);

  useEffect(() => {
    if (!courseId || !assignmentId || me?.role !== "teacher") return;
    let cancelled = false;

    async function loadSubmissions() {
      setSubmissionsLoading(true);
      setSubmissionsError(null);
      try {
        const data = await getSubmissions(courseId, assignmentId);
        if (cancelled) return;
        setSubmissions(data);
        setGradeInputs(
          Object.fromEntries(data.map((s) => [s.student_id, s.grade !== null ? String(s.grade) : ""])),
        );
        setCommentInputs(Object.fromEntries(data.map((s) => [s.student_id, s.comment ?? ""])));
        if (data.length > 0) {
          setSelectedRepoStudentId((prev) => prev || data[0].student_id);
        }
      } catch (err) {
        if (!cancelled) {
          setSubmissionsError(err instanceof Error ? err.message : t("repo.errors.submissionsLoadFailed"));
        }
      } finally {
        if (!cancelled) setSubmissionsLoading(false);
      }
    }

    loadSubmissions();
    return () => {
      cancelled = true;
    };
  }, [courseId, assignmentId, me?.role]);

  useEffect(() => {
    if (!courseId || !assignmentId || me?.role !== "student") return;
    let cancelled = false;

    async function loadMyGrade() {
      setMyGradeLoading(true);
      setMyGradeError(null);
      try {
        const data = await getMyGrade(courseId, assignmentId);
        if (cancelled) return;
        setMyGrade(data);
        setSubmissionAnswer(data.answer_text ?? "");
        setSubmissionRepoUrl(data.repository_url ?? "");
      } catch (err) {
        if (!cancelled) setMyGradeError(err instanceof Error ? err.message : t("repo.errors.gradeLoadFailed"));
      } finally {
        if (!cancelled) setMyGradeLoading(false);
      }
    }

    loadMyGrade();
    return () => {
      cancelled = true;
    };
  }, [courseId, assignmentId, me?.role]);

  useEffect(() => {
    setPlagiarism(null);
    setPlagiarismPairs(null);
    setPlagiarismError(null);
  }, [plagiarismSource]);

  async function onViewFile(f: RepoFile) {
    if (!courseId || !assignmentId) return;
    setView({ file: f, loading: true, content: null, error: null });
    try {
      const res: FileContent = await getFileContent(
        courseId,
        assignmentId,
        f.name,
        me?.role === "teacher" ? selectedRepoStudentId : undefined,
      );
      setView({ file: f, loading: false, content: res.content, error: null });
    } catch (err) {
      setView({
        file: f,
        loading: false,
        content: null,
        error: err instanceof Error ? err.message : t("repo.errors.fileLoadFailed"),
      });
    }
  }

  async function onSaveGrade(studentId: string) {
    if (!courseId || !assignmentId) return;
    const gradeRaw = (gradeInputs[studentId] ?? "").trim();
    const commentRaw = commentInputs[studentId] ?? "";
    const parsed = Number(gradeRaw);
    const gradeMax = course?.grade_max ?? 100;
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > gradeMax) {
      setSubmissionsError(tp("repo.assignment.gradeIntError", { max: gradeMax }));
      return;
    }

    setSavingGradeFor(studentId);
    setSubmissionsError(null);
    try {
      const updated = await gradeSubmission(courseId, assignmentId, studentId, {
        grade: parsed,
        comment: commentRaw.trim() ? commentRaw.trim() : null,
      });
      setSubmissions((prev) => prev.map((s) => (s.student_id === studentId ? updated : s)));
      setGradeInputs((prev) => ({ ...prev, [studentId]: String(updated.grade ?? "") }));
      setCommentInputs((prev) => ({ ...prev, [studentId]: updated.comment ?? "" }));
    } catch (err) {
      setSubmissionsError(err instanceof Error ? err.message : t("repo.errors.gradeSaveFailed"));
    } finally {
      setSavingGradeFor(null);
    }
  }

  async function onSubmitWork() {
    if (!courseId || !assignmentId) return;
    setSubmissionSaving(true);
    setMyGradeError(null);
    setSubmissionSuccess(null);
    try {
      const updated = await submitAssignment(courseId, assignmentId, {
        answer_text: submissionAnswer,
        repository_url: submissionRepoUrl,
        report_file: submissionReportFile,
        files: submissionFiles,
      });
      setMyGrade(updated);
      setSubmissionAnswer(updated.answer_text ?? "");
      setSubmissionRepoUrl(updated.repository_url ?? "");
      setSubmissionReportFile(null);
      setSubmissionFiles([]);
      setSubmissionSuccess(t("repo.assignment.submissionSaved"));
    } catch (err) {
      setMyGradeError(err instanceof Error ? err.message : t("repo.errors.submitFailed"));
    } finally {
      setSubmissionSaving(false);
    }
  }

  async function onDownloadAttachment(studentId: string, attachment: SubmissionAttachmentRead) {
    if (!courseId || !assignmentId) return;
    setDownloadingAttachmentId(attachment.id);
    try {
      await downloadSubmissionAttachment(courseId, assignmentId, studentId, attachment);
    } catch (err) {
      setSubmissionsError(err instanceof Error ? err.message : t("repo.errors.attachmentDownloadFailed"));
      setMyGradeError(err instanceof Error ? err.message : t("repo.errors.attachmentDownloadFailed"));
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function comparePlagiarismPair(student1Id: string, student2Id: string) {
    if (!courseId || !assignmentId) return;
    if (!student1Id || !student2Id) {
      setPlagiarismError(t("repo.errors.selectTwoStudents"));
      return;
    }
    if (student1Id === student2Id) {
      setPlagiarismError(t("repo.errors.selectDifferentStudents"));
      return;
    }

    setPlagiarismLoading(true);
    setPlagiarismError(null);
    try {
      const result = await comparePlagiarism(courseId, assignmentId, {
        student1_id: student1Id,
        student2_id: student2Id,
        source: plagiarismSource,
      });
      setPlagiarism(result);
    } catch (err) {
      setPlagiarismError(err instanceof Error ? err.message : t("repo.errors.compareFailed"));
    } finally {
      setPlagiarismLoading(false);
    }
  }

  async function onComparePlagiarism() {
    await comparePlagiarismPair(selectedStudent1Id, selectedStudent2Id);
  }

  async function onCheckAllPlagiarism() {
    if (!courseId || !assignmentId) return;
    setPlagiarismCheckLoading(true);
    setPlagiarismError(null);
    try {
      const result = await checkPlagiarism(courseId, assignmentId, plagiarismSource);
      setPlagiarismPairs(result);
    } catch (err) {
      setPlagiarismError(err instanceof Error ? err.message : t("repo.errors.compareFailed"));
    } finally {
      setPlagiarismCheckLoading(false);
    }
  }

  function plagiarismSourceLabel(source: PlagiarismSource) {
    if (source === "report") return t("repo.assignment.plagiarismSourceReport");
    if (source === "combined") return t("repo.assignment.plagiarismSourceCombined");
    return t("repo.assignment.plagiarismSourceCode");
  }

  function verdictClass(verdict: "high" | "medium" | "low") {
    if (verdict === "high") return isDarkTheme ? "bg-[#ef4444]/15 text-[#ef4444]" : "bg-[#ef4444]/10 text-[#dc2626]";
    if (verdict === "medium") return isDarkTheme ? "bg-[#f59e0b]/15 text-[#f59e0b]" : "bg-[#f59e0b]/10 text-[#d97706]";
    return isDarkTheme ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-[#22c55e]/10 text-[#16a34a]";
  }

  function gaugeColor(similarity: number) {
    const percent = similarity * 100;
    if (percent > 80) return "#ef4444";
    if (percent >= 60) return "#f59e0b";
    return "#16a34a";
  }

  function featureBadgeClass(feature: string) {
    if (feature.startsWith("operator:") || feature.startsWith("function:")) {
      return isDarkTheme
        ? "bg-[#2563eb]/20 text-[#60a5fa] border-[#3b82f6]/40"
        : "bg-[#2563eb]/10 text-[#2563eb] border-[#3b82f6]/30";
    }
    return isDarkTheme
      ? "bg-[#2a2a2a] text-[#888888] border-[#30363d]"
      : "bg-[#e5e7eb] text-[#737373] border-[#d4d4d4]";
  }

  function lineStatusClass(status: "exact" | "similar" | "different") {
    if (status === "exact") return isDarkTheme ? "bg-[#ef4444]/15" : "bg-[#ef4444]/10";
    if (status === "similar") return isDarkTheme ? "bg-[#f59e0b]/15" : "bg-[#f59e0b]/10";
    return "bg-transparent";
  }

  function tabButtonClass(tab: AssignmentTab) {
    const base = "rounded-lg border px-3 py-2 text-sm font-medium transition";
    if (tab === activeTab) {
      return `${base} ${tabActiveBg}`;
    }
    return `${base} ${tabInactiveBg}`;
  }

  if (!courseId || !assignmentId) return null;

  return (
    <div className={`mx-auto max-w-7xl px-4 ${pageBg} min-h-screen py-4`}>
      <div className={`mb-3 text-sm ${textSecondary}`}>
        <Link to="/courses" className={`${breadcrumbText} ${breadcrumbHover}`}>
          {t("repo.assignment.coursesBreadcrumb")}
        </Link>
        <span className={`mx-2 ${separatorColor}`}>&gt;</span>
        <Link to={`/courses/${courseId}`} className={`${breadcrumbText} ${breadcrumbHover}`}>
          {course?.title || t("repo.assignment.courseFallback")}
        </Link>
        <span className={`mx-2 ${separatorColor}`}>&gt;</span>
        <span className={`font-medium ${textPrimary}`}>{headerTitle}</span>
      </div>

      <div className={`mb-5 rounded-xl border ${cardBorder} ${cardBg} p-5 shadow-md`}>
        <h1 className={`text-3xl font-semibold ${textPrimary}`}>{headerTitle}</h1>
        {assignment?.description ? <div className={`mt-2 text-sm ${textSecondary}`}>{assignment.description}</div> : null}
        {assignment?.deadline ? (
          <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm ${deadlineBadge}`}>
            {t("repo.assignment.deadline")} <span className="ml-1 font-medium">{formatDate(assignment.deadline)}</span>
          </div>
        ) : null}
        {assignment && assignment.late_penalty_periods.length > 0 ? (
          <div className={`mt-3 rounded-lg border ${penaltyBox} p-3 text-sm`}>
            <div className={`mb-1 font-medium ${textPrimary}`}>{t("repo.assignment.penaltiesTitle")}</div>
            {sortedPenaltyPeriods.map((p, idx) => (
                <div key={`${p.weeks}-${idx}`} className={textSecondary}>
                  {tp("repo.assignment.penaltyWeek", { weeks: p.weeks, grade: p.max_grade })}
                </div>
              ))}
            <div className={textPrimary}>{t("repo.assignment.penaltyLater")}</div>
          </div>
        ) : null}
      </div>

      {loading ? <div className={`text-sm ${textSecondary}`}>{t("common.loading")}</div> : null}
      {error ? (
        <div className={`rounded-md border p-3 text-sm ${errorBox}`}>
          {error}
        </div>
      ) : null}

      {me?.role === "teacher" ? (
        <div className={`mb-4 rounded-xl border ${cardBorder} ${cardBg} p-4 shadow-md`}>
          <div className={`mb-2 text-sm font-semibold ${textPrimary}`}>{t("repo.assignment.studentRepoHint")}</div>
          <select
            value={selectedRepoStudentId}
            onChange={(e) => setSelectedRepoStudentId(e.target.value)}
            className={`w-full max-w-md rounded-lg border ${inputBorder} px-3 py-2 text-sm outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30 ${inputBg} ${textPrimary}`}
          >
            <option value="">{t("repo.assignment.selectStudent")}</option>
            {submissions.map((s) => (
              <option key={`repo-${s.student_id}`} value={s.student_id}>
                {s.student_full_name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {me?.role !== "student" ? (
          <>
        <button type="button" className={tabButtonClass("commits")} onClick={() => setActiveTab("commits")}>
          {t("repo.assignment.tabCommits")}
        </button>
        <button type="button" className={tabButtonClass("files")} onClick={() => setActiveTab("files")}>
          {t("repo.assignment.tabFiles")}
        </button>
          </>
        ) : null}
        <button type="button" className={tabButtonClass("grading")} onClick={() => setActiveTab("grading")}>
          {me?.role === "student" ? t("repo.assignment.myGrade") : t("repo.assignment.grading")}
        </button>
        {me?.role === "teacher" ? (
          <button
            type="button"
            className={tabButtonClass("plagiarism")}
            onClick={() => setActiveTab("plagiarism")}
          >
            {t("repo.assignment.tabPlagiarism")}
          </button>
        ) : null}
      </div>

      {me?.role !== "student" && activeTab === "commits" ? (
        <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 shadow-md`}>
          <div className={`mb-3 text-lg font-semibold ${textPrimary}`}>{t("repo.assignment.commitsHistory")}</div>
          <div className="space-y-4">
            {commits.map((c) => (
              <div key={c.sha} className="relative pl-6">
                <div className={`absolute left-0 top-1 h-3 w-3 rounded-full ${timelineDot}`} />
                <div className={`absolute left-[5px] top-5 h-[calc(100%-10px)] w-[2px] ${timelineLine}`} />
                <div className={`rounded-lg border ${commitCard} p-3`}>
                  <div className={`text-sm font-mono ${commitHash}`}>{c.sha.slice(0, 7)}</div>
                  <div className={`mt-1 text-sm font-medium ${textPrimary}`}>{c.message}</div>
                  <div className={`mt-1 text-xs ${textSecondary}`}>
                    {c.author.name}
                    {c.author.email ? ` (${c.author.email})` : ""}
                  </div>
                  <div className={`mt-1 text-xs ${textTertiary}`}>{formatDate(c.date)}</div>
                </div>
              </div>
            ))}
            {!loading && commits.length === 0 ? <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.noCommits")}</div> : null}
          </div>
        </div>
      ) : null}

      {me?.role !== "student" && activeTab === "files" ? (
        <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 shadow-md`}>
          <div className={`mb-3 text-lg font-semibold ${textPrimary}`}>{t("repo.assignment.filesTree")}</div>
          <div className="space-y-2">
            {sortedFiles.map((f) => (
                <div
                  key={`${f.type}:${f.sha}:${f.name}`}
                  className={`flex items-center justify-between rounded-lg border ${commitCard} p-3`}
                >
                  <div className="min-w-0" style={{ paddingLeft: `${(f.name.match(/\//g)?.length ?? 0) * 14}px` }}>
                    <div className={`truncate text-sm font-medium ${textPrimary}`}>
                      {f.type === "dir" ? "📁" : "📄"} {f.name}
                    </div>
                    <div className={`mt-1 text-xs ${textSecondary}`}>
                      {f.type === "dir" ? "dir" : "file"}{" "}
                      {f.size !== null && f.type === "file" ? `(${f.size} bytes)` : ""}
                    </div>
                  </div>
                  {f.type === "file" ? (
                    <button
                      onClick={() => onViewFile(f)}
                      className={`rounded-lg px-3 py-1 text-sm transition ${buttonPrimary}`}
                    >
                      {t("repo.assignment.open")}
                    </button>
                  ) : (
                    <div className={`text-xs ${textTertiary}`}>—</div>
                  )}
                </div>
              ))}

            {!loading && files.length === 0 ? <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.noFiles")}</div> : null}
          </div>
        </div>
      ) : null}

      {me?.role === "teacher" && activeTab === "plagiarism" ? (
        <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 shadow-md`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className={`text-lg font-semibold ${textPrimary}`}>{t("repo.assignment.plagiarismTitle")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={plagiarismSource}
                onChange={(e) => setPlagiarismSource(e.target.value as PlagiarismSource)}
                className={`rounded-md border ${inputBorder} px-3 py-2 text-sm ${inputBg} ${textPrimary}`}
              >
                <option value="code">{t("repo.assignment.plagiarismSourceCode")}</option>
                <option value="report">{t("repo.assignment.plagiarismSourceReport")}</option>
                <option value="combined">{t("repo.assignment.plagiarismSourceCombined")}</option>
              </select>
              <button
                type="button"
                onClick={onCheckAllPlagiarism}
                disabled={plagiarismCheckLoading || submissions.length < 2}
                className={`rounded-lg px-3 py-2 text-sm transition disabled:opacity-60 ${buttonPrimary}`}
              >
                {plagiarismCheckLoading ? t("repo.assignment.checkingAll") : t("repo.assignment.checkAll")}
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <select
              value={selectedStudent1Id}
              onChange={(e) => setSelectedStudent1Id(e.target.value)}
              className={`w-full rounded-md border ${inputBorder} px-3 py-2 text-sm ${inputBg} ${textPrimary}`}
            >
              <option value="">{t("repo.assignment.student1")}</option>
              {submissions.map((s) => (
                <option key={`s1-${s.student_id}`} value={s.student_id}>
                  {s.student_full_name}
                </option>
              ))}
            </select>
            <select
              value={selectedStudent2Id}
              onChange={(e) => setSelectedStudent2Id(e.target.value)}
              className={`w-full rounded-md border ${inputBorder} px-3 py-2 text-sm ${inputBg} ${textPrimary}`}
            >
              <option value="">{t("repo.assignment.student2")}</option>
              {submissions.map((s) => (
                <option key={`s2-${s.student_id}`} value={s.student_id}>
                  {s.student_full_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onComparePlagiarism}
              disabled={plagiarismLoading || submissions.length < 2}
              className={`rounded-lg px-3 py-2 text-sm transition disabled:opacity-60 ${buttonPrimary}`}
            >
              {plagiarismLoading ? t("repo.assignment.comparing") : t("repo.assignment.compare")}
            </button>
          </div>

          {plagiarismError ? (
            <div className={`mb-3 mt-3 rounded-md border p-3 text-sm ${errorBox}`}>
              {plagiarismError}
            </div>
          ) : null}

          {plagiarismPairs ? (
            <div className={`mb-4 mt-3 rounded-md border ${cardBorder} ${cardBg} p-3`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className={`text-sm font-semibold ${textPrimary}`}>
                  {t("repo.assignment.suspiciousPairs")} · {plagiarismSourceLabel(plagiarismSource)}
                </div>
                <div className={`text-xs ${textTertiary}`}>
                  {new Date(plagiarismPairs.checked_at).toLocaleString()}
                </div>
              </div>
              {plagiarismPairs.pairs.length === 0 ? (
                <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.noSuspiciousPairs")}</div>
              ) : (
                <div className="space-y-2">
                  {plagiarismPairs.pairs.map((pair) => (
                    <div
                      key={`${pair.student1.id}-${pair.student2.id}-${pair.source}`}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border ${commitCard} p-3`}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${textPrimary}`}>
                          {pair.student1.full_name} ↔ {pair.student2.full_name}
                        </div>
                        <div className={`mt-1 text-xs ${textSecondary}`}>
                          {plagiarismSourceLabel(pair.source)} · {(pair.similarity * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${verdictClass(pair.verdict)}`}>
                          {pair.verdict}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudent1Id(pair.student1.id);
                            setSelectedStudent2Id(pair.student2.id);
                            void comparePlagiarismPair(pair.student1.id, pair.student2.id);
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs transition ${buttonPrimary}`}
                        >
                          {t("repo.assignment.comparePair")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {plagiarism ? (
            <div className={`mb-4 mt-3 rounded-md border ${cardBorder} ${cardBg} p-3`}>
              <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <div className={`flex flex-col items-center justify-center rounded-lg border ${commitCard} p-4`}>
                  <div
                    className="relative h-40 w-40 rounded-full"
                    style={{
                      background: `conic-gradient(${gaugeColor(plagiarism.similarity)} ${
                        plagiarism.similarity * 360
                      }deg, ${gaugeBg} 0deg)`,
                    }}
                  >
                    <div className={`absolute inset-4 flex items-center justify-center rounded-full ${cardBg}`}>
                      <div className="text-center">
                        <div className={`text-3xl font-bold ${textPrimary}`}>
                          {(plagiarism.similarity * 100).toFixed(1)}%
                        </div>
                        <div className={`text-xs ${textTertiary}`}>{t("repo.assignment.similarity")}</div>
                      </div>
                    </div>
                  </div>
                  <div className={`mt-3 text-sm ${textSecondary}`}>
                    {t("repo.assignment.verdict")}{" "}
                    <span className={`rounded px-2 py-0.5 text-xs ${verdictClass(plagiarism.verdict)}`}>
                      {plagiarism.verdict}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                    <div className={`rounded-lg border ${cardBorder} ${cardBg} p-3`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${avatarBg}`}>
                          {getInitials(selectedStudent1?.student_full_name ?? "S1")}
                        </div>
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-semibold ${textPrimary}`}>
                            {selectedStudent1?.student_full_name ?? t("repo.assignment.student1")}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-center gap-2 text-sm font-semibold ${textSecondary}`}>
                      <span>→</span>
                      <span>{(plagiarism.similarity * 100).toFixed(1)}%</span>
                      <span>→</span>
                    </div>

                    <div className={`rounded-lg border ${cardBorder} ${cardBg} p-3`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${avatarBg}`}>
                          {getInitials(selectedStudent2?.student_full_name ?? "S2")}
                        </div>
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-semibold ${textPrimary}`}>
                            {selectedStudent2?.student_full_name ?? t("repo.assignment.student2")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={`text-sm font-semibold ${textPrimary}`}>{t("repo.assignment.matchingFeatures")}</div>
                    {plagiarism.common_features.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {plagiarism.common_features.map((feature) => (
                          <span
                            key={feature}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${featureBadgeClass(feature)}`}
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className={`mt-2 text-sm ${textSecondary}`}>{t("repo.assignment.noMatchingFeatures")}</div>
                    )}
                  </div>

                  <div className={`rounded-lg border ${cardBorder} ${cardBg} p-3`}>
                    <div className="mb-3 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                      <div className={`text-sm font-semibold ${textPrimary}`}>
                        {selectedStudent1?.student_full_name ?? t("repo.assignment.student1")}
                      </div>
                      <div className={`text-center text-xs font-semibold ${textSecondary}`}>
                        {(plagiarism.similarity * 100).toFixed(1)}%
                      </div>
                      <div className={`text-right text-sm font-semibold ${textPrimary}`}>
                        {selectedStudent2?.student_full_name ?? t("repo.assignment.student2")}
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className={`overflow-hidden rounded-md border ${cardBorder}`}>
                        <div className={`border-b px-3 py-2 text-sm font-semibold ${codeHeader}`}>
                          {selectedStudent1?.student_full_name ?? t("repo.assignment.student1")}
                        </div>
                        <div className={`max-h-[420px] overflow-auto font-mono text-xs ${inputBg}`}>
                          {plagiarism.lines1.map((row, idx) => (
                            <div
                              key={`l1-${idx}`}
                              className={`grid grid-cols-[48px_1fr] ${lineStatusClass(row.status)}`}
                            >
                              <div className={`border-r px-2 py-1 text-right ${codeLineNum}`}>
                                {idx + 1}
                              </div>
                              <div className={`px-2 py-1 whitespace-pre ${textPrimary}`}>{row.line || " "}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className={`overflow-hidden rounded-md border ${cardBorder}`}>
                        <div className={`border-b px-3 py-2 text-sm font-semibold ${codeHeader}`}>
                          {selectedStudent2?.student_full_name ?? t("repo.assignment.student2")}
                        </div>
                        <div className={`max-h-[420px] overflow-auto font-mono text-xs ${inputBg}`}>
                          {plagiarism.lines2.map((row, idx) => (
                            <div
                              key={`l2-${idx}`}
                              className={`grid grid-cols-[48px_1fr] ${lineStatusClass(row.status)}`}
                            >
                              <div className={`border-r px-2 py-1 text-right ${codeLineNum}`}>
                                {idx + 1}
                              </div>
                              <div className={`px-2 py-1 whitespace-pre ${textPrimary}`}>{row.line || " "}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

        </div>
      ) : null}

      {me?.role === "teacher" && activeTab === "grading" ? (
        <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 shadow-md`}>
          <div className={`mb-3 text-lg font-semibold ${textPrimary}`}>{t("repo.assignment.gradeStudents")}</div>
          {submissionsLoading ? <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.loadingSubmissions")}</div> : null}
          {submissionsError ? (
            <div className={`mb-3 rounded-md border p-3 text-sm ${errorBox}`}>
              {submissionsError}
            </div>
          ) : null}

          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s.student_id} className={`rounded-md border ${cardBorder} ${cardBg} p-3`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className={`text-sm font-semibold ${textPrimary}`}>{s.student_full_name}</div>
                  <div
                    className={`rounded px-2 py-0.5 text-xs ${
                      s.status === "submitted" ? (isDarkTheme ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-[#22c55e]/10 text-[#16a34a]") : (isDarkTheme ? "bg-[#2a2a2a] text-[#888888]" : "bg-[#e5e7eb] text-[#737373]")
                    }`}
                  >
                    {s.status === "submitted" ? t("repo.assignment.submitted") : t("repo.assignment.notSubmitted")}
                  </div>
                  <div className={`text-xs ${textTertiary}`}>
                    {t("repo.assignment.lastCommit")} {s.last_commit_at ? formatDate(s.last_commit_at) : "—"}
                  </div>
                  <div className={`text-xs ${textTertiary}`}>
                    {t("repo.assignment.submittedAt")} {s.submitted_at ? formatDate(s.submitted_at) : "—"}
                  </div>
                </div>

                <div className={`mt-3 rounded-lg border ${cardBorder} ${cardBg} p-3`}>
                  <div className={`mb-2 text-sm font-semibold ${textPrimary}`}>{t("repo.assignment.teacherSubmissionTitle")}</div>
                  {s.answer_text ? (
                    <div className={`whitespace-pre-wrap text-sm ${textSecondary}`}>{s.answer_text}</div>
                  ) : null}
                  {s.repository_url ? (
                    <a
                      href={s.repository_url}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-2 inline-flex text-sm ${breadcrumbText} ${breadcrumbHover}`}
                    >
                      {t("repo.assignment.repositoryLink")}
                    </a>
                  ) : null}
                  {s.attachments.length > 0 ? (
                    <div className="mt-3">
                      <div className={`mb-2 text-xs font-semibold ${textTertiary}`}>{t("repo.assignment.attachments")}</div>
                      <div className="flex flex-wrap gap-2">
                        {s.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            onClick={() => onDownloadAttachment(s.student_id, attachment)}
                            disabled={downloadingAttachmentId === attachment.id}
                            className={`rounded-lg border ${inputBorder} px-3 py-2 text-left text-xs transition disabled:opacity-60 ${inputBg} ${hoverBg}`}
                          >
                            <span className={`block font-medium ${textPrimary}`}>
                              {attachment.kind === "report" ? t("repo.assignment.report") : t("repo.assignment.attachment")}: {attachment.original_filename}
                            </span>
                            <span className={textTertiary}>
                              {formatFileSize(attachment.file_size)} · {downloadingAttachmentId === attachment.id ? t("common.loading") : t("repo.assignment.download")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {!s.answer_text && !s.repository_url && s.attachments.length === 0 ? (
                    <div className={`text-sm ${textTertiary}`}>{t("repo.assignment.noSubmissionDetails")}</div>
                  ) : null}
                </div>

                <div className={`mt-3 text-xs ${textTertiary}`}>{tp("repo.assignment.gradeRange", { max: course?.grade_max ?? 100 })}</div>
                <div className="mt-1 grid gap-2 md:grid-cols-[140px_1fr_auto]">
                  <input
                    type="number"
                    min={0}
                    max={course?.grade_max ?? 100}
                    step={1}
                    value={gradeInputs[s.student_id] ?? ""}
                    onChange={(e) =>
                      setGradeInputs((prev) => ({
                        ...prev,
                        [s.student_id]: e.target.value,
                      }))
                    }
                    placeholder={`0 — ${course?.grade_max ?? 100}`}
                    className={`w-full rounded-lg border ${inputBorder} px-3 py-2 text-sm outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30 ${inputBg} ${textPrimary}`}
                  />
                  <input
                    type="text"
                    value={commentInputs[s.student_id] ?? ""}
                    onChange={(e) =>
                      setCommentInputs((prev) => ({
                        ...prev,
                        [s.student_id]: e.target.value,
                      }))
                    }
                    placeholder={t("repo.assignment.commentPlaceholder")}
                    className={`w-full rounded-lg border ${inputBorder} px-3 py-2 text-sm outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30 ${inputBg} ${textPrimary}`}
                  />
                  <button
                    type="button"
                    onClick={() => onSaveGrade(s.student_id)}
                    disabled={savingGradeFor === s.student_id}
                    className={`rounded-lg px-3 py-2 text-sm transition disabled:opacity-60 ${buttonPrimary}`}
                  >
                    {savingGradeFor === s.student_id ? t("repo.assignment.saving") : t("repo.assignment.save")}
                  </button>
                </div>

                <div className={`mt-2 text-xs ${textTertiary}`}>
                  {t("repo.assignment.originalGrade")} {s.grade ?? "—"} | {t("repo.assignment.penalty")} -{(s.penalty_points ?? 0).toFixed(1)} | {t("repo.assignment.finalGrade")}{" "}
                  {s.final_grade !== null ? s.final_grade.toFixed(1) : "—"} | {t("repo.assignment.gradedAt")}{" "}
                  {s.graded_at ? formatDate(s.graded_at) : "—"}
                </div>
              </div>
            ))}
            {!submissionsLoading && submissions.length === 0 ? (
              <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.noStudentsInCourse")}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {me?.role === "student" && activeTab === "grading" ? (
        <div className={`rounded-xl border ${cardBorder} ${cardBg} p-4 shadow-md`}>
          <div className={`mb-2 text-lg font-semibold ${textPrimary}`}>{t("repo.assignment.myGrade")}</div>
          {myGradeLoading ? <div className={`text-sm ${textSecondary}`}>{t("common.loading")}</div> : null}
          {myGradeError ? (
            <div className={`rounded-md border p-3 text-sm ${errorBox}`}>
              {myGradeError}
            </div>
          ) : null}
          <div className={`mb-4 rounded-lg border ${cardBorder} ${cardBg} p-4`}>
            <div className={`text-base font-semibold ${textPrimary}`}>{t("repo.assignment.submissionTitle")}</div>
            <div className={`mt-1 text-sm ${textSecondary}`}>{t("repo.assignment.submissionHint")}</div>

            <label className={`mt-4 block text-xs font-semibold ${textTertiary}`}>
              {t("repo.assignment.answerLabel")}
            </label>
            <textarea
              value={submissionAnswer}
              onChange={(e) => setSubmissionAnswer(e.target.value)}
              rows={4}
              placeholder={t("repo.assignment.answerPlaceholder")}
              className={`mt-1 w-full rounded-lg border ${inputBorder} px-3 py-2 text-sm outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30 ${inputBg} ${textPrimary}`}
            />

            <label className={`mt-3 block text-xs font-semibold ${textTertiary}`}>
              {t("repo.assignment.repoUrlLabel")}
            </label>
            <input
              type="url"
              value={submissionRepoUrl}
              onChange={(e) => setSubmissionRepoUrl(e.target.value)}
              placeholder={t("repo.assignment.repoUrlPlaceholder")}
              className={`mt-1 w-full rounded-lg border ${inputBorder} px-3 py-2 text-sm outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30 ${inputBg} ${textPrimary}`}
            />

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className={`block text-xs font-semibold ${textTertiary}`}>
                {t("repo.assignment.reportFileLabel")}
                <input
                  type="file"
                  onChange={(e) => setSubmissionReportFile(e.target.files?.[0] ?? null)}
                  className={`mt-1 block w-full text-sm ${textSecondary}`}
                />
                {submissionReportFile ? (
                  <span className={`mt-1 block text-xs ${textTertiary}`}>
                    {submissionReportFile.name} · {formatFileSize(submissionReportFile.size)}
                  </span>
                ) : null}
              </label>
              <label className={`block text-xs font-semibold ${textTertiary}`}>
                {t("repo.assignment.extraFilesLabel")}
                <input
                  type="file"
                  multiple
                  onChange={(e) => setSubmissionFiles(Array.from(e.target.files ?? []))}
                  className={`mt-1 block w-full text-sm ${textSecondary}`}
                />
                {submissionFiles.length > 0 ? (
                  <span className={`mt-1 block text-xs ${textTertiary}`}>
                    {submissionFiles.map((file) => file.name).join(", ")}
                  </span>
                ) : null}
              </label>
            </div>

            {submissionSuccess ? (
              <div className={`mt-3 rounded-md border p-3 text-sm ${successBox}`}>{submissionSuccess}</div>
            ) : null}

            <button
              type="button"
              onClick={onSubmitWork}
              disabled={submissionSaving}
              className={`mt-4 rounded-lg px-4 py-2 text-sm transition disabled:opacity-60 ${buttonPrimary}`}
            >
              {submissionSaving ? t("repo.assignment.submittingWork") : t("repo.assignment.submitWork")}
            </button>

            {myGrade?.submitted_at ? (
              <div className={`mt-3 text-xs ${textTertiary}`}>
                {t("repo.assignment.submittedAt")} {formatDate(myGrade.submitted_at)}
              </div>
            ) : null}
            {myGrade?.attachments && myGrade.attachments.length > 0 && me ? (
              <div className="mt-3">
                <div className={`mb-2 text-xs font-semibold ${textTertiary}`}>{t("repo.assignment.attachments")}</div>
                <div className="flex flex-wrap gap-2">
                  {myGrade.attachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => onDownloadAttachment(me.id, attachment)}
                      disabled={downloadingAttachmentId === attachment.id}
                      className={`rounded-lg border ${inputBorder} px-3 py-2 text-left text-xs transition disabled:opacity-60 ${inputBg} ${hoverBg}`}
                    >
                      <span className={`block font-medium ${textPrimary}`}>
                        {attachment.kind === "report" ? t("repo.assignment.report") : t("repo.assignment.attachment")}: {attachment.original_filename}
                      </span>
                      <span className={textTertiary}>
                        {formatFileSize(attachment.file_size)} · {downloadingAttachmentId === attachment.id ? t("common.loading") : t("repo.assignment.download")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {!myGradeLoading && !myGradeError && myGrade ? (
            <div>
              <div className="mb-2">
                {myGrade.grade === null ? (
                  <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.gradePendingHint")}</div>
                ) : myGrade.weeks_late > 0 ? (
                  <div className={`text-sm ${isDarkTheme ? "text-[#ef4444]" : "text-[#dc2626]"}`}>
                    {tp("repo.assignment.weeksLate", {
                      n: myGrade.weeks_late,
                      max: myGrade.late_max_grade !== null ? myGrade.late_max_grade : 0,
                    })}
                  </div>
                ) : (
                  <div className={`text-sm ${isDarkTheme ? "text-[#22c55e]" : "text-[#16a34a]"}`}>{t("repo.assignment.onTime")}</div>
                )}
              </div>
              {myGrade.grade !== null ? (
                <div className="text-base font-medium">
                  {t("repo.assignment.myGrade")}: {myGrade.grade} / {myGrade.grade_max}
                </div>
              ) : (
                <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.gradeNotSet")}</div>
              )}
              {myGrade.final_grade !== null ? (
                <div className="mt-1 text-base font-semibold text-[#3b82f6]">
                  {tp("repo.assignment.gradeWithPenalty", { grade: myGrade.final_grade.toFixed(1), max: myGrade.grade_max })}
                </div>
              ) : null}
              {myGrade.comment ? (
                <div className={`mt-2 rounded-md border ${cardBorder} ${cardBg} p-3 text-sm ${textSecondary}`}>
                  {tp("repo.assignment.teacherComment", { comment: myGrade.comment })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {view.file ? (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalOverlay}`}>
          <div className={`w-full max-w-3xl rounded-lg p-4 shadow-lg ${modalBg}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className={`text-lg font-semibold ${textPrimary}`}>{tp("repo.assignment.fileTitle", { name: view.file.name })}</div>
                <div className={`mt-1 text-xs ${textTertiary}`}>
                  {view.file.type} • {view.file.size ?? 0} bytes
                </div>
              </div>
              <button
                onClick={() =>
                  setView({ file: null, loading: false, content: null, error: null })
                }
                className={`rounded-md border px-3 py-1 text-sm transition ${inputBorder} ${hoverBg} ${inputBg} ${textPrimary}`}
              >
                {t("repo.assignment.close")}
              </button>
            </div>

            {view.loading ? (
              <div className={`text-sm ${textSecondary}`}>{t("repo.assignment.loadingFile")}</div>
            ) : view.error ? (
              <div className={`rounded-md border p-3 text-sm ${errorBox}`}>
                {view.error}
              </div>
            ) : (
              <pre className={`max-h-[60vh] overflow-auto rounded-md border p-3 text-xs leading-relaxed whitespace-pre-wrap ${cardBorder} ${inputBg} ${textPrimary}`}>
                {view.content ?? ""}
              </pre>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

