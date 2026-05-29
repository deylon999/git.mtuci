import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  CircleDot,
  Flag,
  Loader2,
  MessageSquare,
  Send,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getIssueByNumber,
  updateIssue,
  createComment,
  getComments,
  Issue,
  IssueComment,
  IssueTimelineEvent,
  UpdateIssueRequest,
  CreateCommentRequest,
  getIssueTimeline,
} from "../../api/issuesApi";
import { getTheme } from "../../theme";
import { MarkdownWithLinks } from "../common/MarkdownWithLinks";

interface IssueDetailProps {
  isDarkTheme?: boolean;
}

function readableLabelColor(color: string) {
  const normalized = color.startsWith("#") ? color : `#${color}`;
  const value = parseInt(normalized.slice(1), 16);
  return Number.isFinite(value) && value > 0xffffff / 2 ? "#111827" : "#ffffff";
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timelineEventLabel(t: (key: string, fallback?: string) => string, event: IssueTimelineEvent) {
  if (event.type === "created") return t("repo.issues.timelineEvents.created", "Created");
  if (event.type === "comment") return t("repo.issues.timelineEvents.comment", "Comment");
  if (event.type === "closed") return t("repo.issues.timelineEvents.closed", "Closed");
  if (event.type === "reopened") return t("repo.issues.timelineEvents.reopened", "Reopened");
  if (event.type === "assigned") return t("repo.issues.timelineEvents.assigned", "Assigned");
  if (event.type === "unassigned") return t("repo.issues.timelineEvents.unassigned", "Unassigned");
  if (event.reference_type === "issue_backlink") return t("repo.issues.timelineEvents.issueBacklink", "Referenced by issue");
  if (event.reference_type === "pr_backlink") return t("repo.issues.timelineEvents.prBacklink", "Referenced by pull request");
  if (event.reference_type === "commit_backlink") return t("repo.issues.timelineEvents.commitBacklink", "Referenced by commit");
  if (event.reference_type === "issue") return t("repo.issues.timelineEvents.issueReference", "Issue reference");
  if (event.reference_type === "pr") return t("repo.issues.timelineEvents.prReference", "Pull request reference");
  if (event.reference_type === "commit") return t("repo.issues.timelineEvents.commitReference", "Commit reference");
  return event.type;
}

export const IssueDetail: React.FC<IssueDetailProps> = ({ isDarkTheme = false }) => {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { t } = useTranslation();
  const theme = getTheme(isDarkTheme);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [timeline, setTimeline] = useState<IssueTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadIssue = async () => {
    if (!repoId || !number) return;

    setLoading(true);
    setError(null);
    try {
      const issueNumber = parseInt(number, 10);
      const response = await getIssueByNumber(repoId, issueNumber);
      setIssue(response.data);
      const timelineResp = await getIssueTimeline(repoId, issueNumber);
      setTimeline(timelineResp.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || t("repo.issues.loadFailed", "Failed to load issues"));
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    if (!issue?.id) return;

    try {
      const response = await getComments(issue.id);
      setComments(response.data);
    } catch (err) {
      console.error("Failed to load comments:", err);
    }
  };

  useEffect(() => {
    if (repoId && number) {
      void loadIssue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, number]);

  useEffect(() => {
    if (issue?.id) {
      void loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  const handleStateChange = async (newState: "open" | "closed") => {
    if (!issue) return;

    try {
      const updateData: UpdateIssueRequest = { state: newState };
      await updateIssue(issue.id, updateData);
      await loadIssue();
    } catch (err: any) {
      setError(err.response?.data?.detail || t("repo.issues.updateFailed", "Failed to update issue"));
    }
  };

  const handleAddComment = async () => {
    if (!issue || !commentText.trim()) return;

    setSubmitting(true);
    try {
      const data: CreateCommentRequest = { body: commentText };
      await createComment(issue.id, data);
      await loadComments();
      if (repoId && number) {
        const timelineResp = await getIssueTimeline(repoId, parseInt(number, 10));
        setTimeline(timelineResp.data);
      }
      setCommentText("");
    } catch (err: any) {
      setError(err.response?.data?.detail || t("repo.issues.commentFailed", "Failed to add comment"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-xl border flex items-center justify-center gap-2 py-16 text-sm"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text2 }}
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        {t("repo.issues.loading", "Loading issues...")}
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.danger }}>
        {error || t("repo.issues.notFound", "Issue not found")}
      </div>
    );
  }

  return (
      <section className="overflow-hidden rounded-xl border" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
        <div
          className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-start lg:justify-between"
          style={{ borderColor: theme.border }}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {issue.state === "open" ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={{ borderColor: `${theme.success}55`, backgroundColor: `${theme.success}14`, color: theme.success }}
                >
                  <CircleDot className="h-3 w-3" />
                  {t("repo.issues.stateOpen", "Open")}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: theme.bg4, color: theme.text2 }}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {t("repo.issues.stateClosed", "Closed")}
                </span>
              )}
              <span className="text-xs font-medium" style={{ color: theme.text3 }}>
                #{issue.number}
              </span>
            </div>

            <h1 className="mt-2 text-base font-semibold leading-6" style={{ color: theme.text }}>
              {issue.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {issue.labels.map((label) => (
                <span
                  key={label.id}
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: label.color, color: readableLabelColor(label.color) }}
                >
                  {label.name}
                </span>
              ))}
              {issue.milestone_id ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                  style={{ borderColor: theme.border, color: theme.text2 }}
                >
                  <Flag className="h-3.5 w-3.5" />
                  {t("repo.issues.form.milestone", "Milestone")}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleStateChange(issue.state === "open" ? "closed" : "open")}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{
              borderColor: issue.state === "open" ? `${theme.danger}55` : `${theme.success}55`,
              backgroundColor: issue.state === "open" ? `${theme.danger}12` : `${theme.success}12`,
              color: issue.state === "open" ? theme.danger : theme.success,
            }}
          >
            {issue.state === "open" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {issue.state === "open" ? t("repo.issues.close", "Close") : t("repo.issues.reopen", "Reopen")}
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
          <div className="border-b p-4 lg:border-b-0 lg:border-r" style={{ borderColor: theme.border }}>
            <div className="min-h-24 rounded-lg border p-4" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
              {issue.body ? (
                <MarkdownWithLinks content={issue.body} repositoryId={repoId} />
              ) : (
                <p className="text-sm" style={{ color: theme.text2 }}>
                  {t("repo.issues.noDescription", "No description provided.")}
                </p>
              )}
            </div>

            <section className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.text }}>
                  <MessageSquare className="h-4 w-4" />
                  {t("repo.issues.comments", "Comments")} ({comments.length})
                </h2>
              </div>

              <div className="space-y-3">
                {comments.map((comment) => (
                  <article key={comment.id} className="rounded-lg border" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
                    <div className="border-b px-4 py-2 text-xs" style={{ borderColor: theme.border, color: theme.text2 }}>
                      {formatDateTime(comment.created_at)}
                    </div>
                    <div className="p-4">
                      <MarkdownWithLinks content={comment.body} repositoryId={repoId} />
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 rounded-lg border p-3" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder={t("repo.issues.addComment", "Add a comment...")}
                  rows={4}
                  className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }}
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleAddComment()}
                    disabled={submitting || !commentText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ borderColor: `${theme.success}55`, backgroundColor: `${theme.success}14`, color: theme.success }}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t("common.comment", "Comment")}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <aside className="p-4">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase" style={{ color: theme.text3 }}>
                  {t("repo.issues.created", "Created")}
                </p>
                <p className="mt-1 text-sm" style={{ color: theme.text }}>
                  {formatDateTime(issue.created_at)}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase" style={{ color: theme.text3 }}>
                  {t("repo.issues.assignees", "Assignees")}
                </p>
                <p className="mt-1 text-sm" style={{ color: issue.assignees.length ? theme.text : theme.text2 }}>
                  {issue.assignees.length
                    ? issue.assignees.map((assignee) => assignee.login).join(", ")
                    : t("repo.issues.noAssignees", "No assignees")}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase" style={{ color: theme.text3 }}>
                  {t("repo.issues.timeline", "Timeline")}
                </p>
                <div className="mt-2 space-y-2">
                  {timeline.map((event) => (
                    <div key={event.id} className="border-t py-2 first:border-t-0" style={{ borderColor: theme.border }}>
                      <p className="text-xs font-medium" style={{ color: theme.text }}>
                        {timelineEventLabel(t, event)}
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: theme.text2 }}>
                        {formatDateTime(event.created_at)}
                      </p>
                      {event.reference_type && event.reference_value ? (
                        <p className="mt-1 text-xs" style={{ color: theme.text2 }}>
                          {event.reference_value}
                          {event.target_exists === false ? ` ${t("repo.issues.notFoundSuffix", "(not found)")}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
  );
};

export default IssueDetail;
