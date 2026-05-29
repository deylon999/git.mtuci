import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import {
  CheckCircle2,
  CircleDot,
  Flag,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Tags,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getIssues,
  createIssue,
  updateIssue,
  getLabels,
  getMilestones,
  IssueListItem,
  IssueLabel,
  IssueMilestone,
  CreateIssueRequest,
  UpdateIssueRequest,
} from "../../api/issuesApi";
import { getTheme } from "../../theme";
import { LabelManager } from "./LabelManager";
import { MilestoneManager } from "./MilestoneManager";
import {
  issueDialogBackdropSx,
  issueDialogContentSx,
  issueDialogPaperSx,
  issueFieldSx,
  issueMenuPaperSx,
  issuePrimaryButtonSx,
  issueTextButtonSx,
} from "./issueMuiStyles";

interface IssuesListProps {
  repositoryId: string;
  isDarkTheme?: boolean;
}

const stateTabs: Array<{ value: "open" | "closed" | "all"; key: string }> = [
  { value: "open", key: "repo.issues.open" },
  { value: "closed", key: "repo.issues.closed" },
  { value: "all", key: "repo.issues.all" },
];

function readableLabelColor(color: string) {
  const normalized = color.startsWith("#") ? color : `#${color}`;
  const value = parseInt(normalized.slice(1), 16);
  return Number.isFinite(value) && value > 0xffffff / 2 ? "#111827" : "#ffffff";
}

function formatIssueDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const IssuesList: React.FC<IssuesListProps> = ({ repositoryId, isDarkTheme = false }) => {
  const { t } = useTranslation();
  const theme = getTheme(isDarkTheme);
  const [issues, setIssues] = useState<IssueListItem[]>([]);
  const [labels, setLabels] = useState<IssueLabel[]>([]);
  const [milestones, setMilestones] = useState<IssueMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [milestoneManagerOpen, setMilestoneManagerOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<"open" | "closed" | "all">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState<CreateIssueRequest>({
    title: "",
    body: "",
    label_ids: [],
    assignee_ids: [],
    milestone_id: undefined,
  });

  const counts = useMemo(
    () => ({
      open: issues.filter((issue) => issue.state === "open").length,
      closed: issues.filter((issue) => issue.state === "closed").length,
      all: issues.length,
    }),
    [issues],
  );

  const loadIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(stateFilter === "all" ? {} : { state: stateFilter }),
        ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
      };
      const response = await getIssues(repositoryId, params);
      setIssues(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || t("repo.issues.loadFailed", "Failed to load issues"));
    } finally {
      setLoading(false);
    }
  };

  const loadLabels = async () => {
    try {
      const response = await getLabels(repositoryId);
      setLabels(response.data);
    } catch (err) {
      console.error("Failed to load labels:", err);
    }
  };

  const loadMilestones = async () => {
    try {
      const response = await getMilestones(repositoryId);
      setMilestones(response.data);
    } catch (err) {
      console.error("Failed to load milestones:", err);
    }
  };

  useEffect(() => {
    void loadIssues();
    void loadLabels();
    void loadMilestones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId, stateFilter, searchQuery]);

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      setError(t("repo.issues.titleRequired", "Issue title is required"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createIssue(repositoryId, formData);
      await loadIssues();
      setCreateDialogOpen(false);
      setFormData({
        title: "",
        body: "",
        label_ids: [],
        assignee_ids: [],
        milestone_id: undefined,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || t("repo.issues.createFailed", "Failed to create issue"));
    } finally {
      setLoading(false);
    }
  };

  const handleStateChange = async (issueId: string, newState: "open" | "closed") => {
    try {
      const updateData: UpdateIssueRequest = { state: newState };
      await updateIssue(issueId, updateData);
      await loadIssues();
    } catch (err: any) {
      setError(err.response?.data?.detail || t("repo.issues.updateFailed", "Failed to update issue"));
    }
  };

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: theme.border }}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.text }}>
          <CircleDot className="h-4 w-4" style={{ color: theme.success }} />
          {t("repo.issues.title", "Issues")}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ backgroundColor: theme.bg4, color: theme.text3 }}
          >
            {counts.all}
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLabelManagerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: theme.border, backgroundColor: theme.bg4, color: theme.text }}
          >
            <Tags className="h-3.5 w-3.5" />
            {t("repo.issues.labels.manage", "Labels")}
          </button>
          <button
            type="button"
            onClick={() => setMilestoneManagerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: theme.border, backgroundColor: theme.bg4, color: theme.text }}
          >
            <Flag className="h-3.5 w-3.5" />
            {t("repo.issues.milestones.manage", "Milestones")}
          </button>
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: `${theme.success}55`, backgroundColor: `${theme.success}14`, color: theme.success }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("repo.issues.new", "New Issue")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b px-4 py-3 text-sm" style={{ borderColor: theme.border, color: theme.danger }}>
          <button type="button" onClick={() => setError(null)} className="float-right text-xs hover:underline">
            {t("common.close", "Close")}
          </button>
          {error}
        </div>
      ) : null}

      <div
        className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        <div className="flex w-fit rounded-lg border p-1" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
          {stateTabs.map((tab) => {
            const active = stateFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStateFilter(tab.value)}
                className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium"
                style={{
                  backgroundColor: active ? theme.bg4 : "transparent",
                  color: active ? theme.text : theme.text2,
                }}
              >
                {t(tab.key, tab.value)}
                <span style={{ color: active ? theme.text2 : theme.text3 }}>{counts[tab.value]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-md">
          <div
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3"
            style={{ borderColor: theme.inputBorder, backgroundColor: theme.inputBg }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: theme.text3 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("repo.issues.search", "Search issues by title or description")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: theme.text }}
            />
          </div>
          <SlidersHorizontal className="h-4 w-4 shrink-0" style={{ color: theme.text3 }} />
        </div>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("repo.issues.loading", "Loading issues...")}
          </div>
        ) : issues.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <CircleDot className="mx-auto h-8 w-8" style={{ color: theme.text3 }} />
            <p className="mt-3 text-sm font-medium" style={{ color: theme.text }}>
              {t("repo.issues.empty", "No issues found")}
            </p>
            <p className="mt-1 text-xs" style={{ color: theme.text2 }}>
              {t("repo.issues.emptyHint", "Try another filter or create a new issue.")}
            </p>
          </div>
        ) : (
          <ul>
            {issues.map((issue) => (
              <li
                key={issue.id}
                className="group flex items-start gap-3 border-t px-4 py-3 transition-colors"
                style={{ borderColor: theme.border }}
              >
                <div className="pt-0.5">
                  {issue.state === "open" ? (
                    <CircleDot className="h-4 w-4" style={{ color: theme.success }} />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" style={{ color: theme.text3 }} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: theme.text3 }}>
                      #{issue.number}
                    </span>
                    <Link
                      to={`/repositories/${repositoryId}/issues/${issue.number}`}
                      className="min-w-0 text-sm font-medium leading-5 hover:underline"
                      style={{ color: theme.text }}
                    >
                      {issue.title}
                    </Link>
                    {issue.labels.map((label) => (
                      <span
                        key={label.id}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: label.color,
                          color: readableLabelColor(label.color),
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: theme.text3 }}>
                    <span>{formatIssueDate(issue.created_at)}</span>
                    {issue.assignees.length > 0 ? (
                      <span>
                        {t("repo.issues.assignedTo", "Assigned to")}{" "}
                        {issue.assignees.map((assignee) => assignee.login).join(", ")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleStateChange(issue.id, issue.state === "open" ? "closed" : "open")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.bg4,
                    color: issue.state === "open" ? theme.danger : theme.success,
                  }}
                  title={issue.state === "open" ? t("repo.issues.close", "Close") : t("repo.issues.reopen", "Reopen")}
                >
                  {issue.state === "open" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{
          backdrop: { sx: issueDialogBackdropSx(isDarkTheme) },
          paper: { sx: issueDialogPaperSx(theme) },
        }}
      >
        <DialogTitle sx={{ color: theme.text }}>{t("repo.issues.create", "Create Issue")}</DialogTitle>
        <DialogContent sx={issueDialogContentSx(theme)}>
          <TextField
            fullWidth
            label={t("repo.issues.form.title", "Title")}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            sx={issueFieldSx(theme, { mt: 2, mb: 2 })}
            required
          />
          <TextField
            fullWidth
            label={t("repo.issues.form.description", "Description")}
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            multiline
            rows={6}
            sx={issueFieldSx(theme, { mb: 2 })}
          />
          <Autocomplete
            multiple
            options={labels}
            getOptionLabel={(option) => option.name}
            noOptionsText={t("repo.issues.form.noOptions", "No options")}
            value={labels.filter((label) => formData.label_ids?.includes(label.id))}
            onChange={(_, newValue) =>
              setFormData({ ...formData, label_ids: newValue.map((label) => label.id) })
            }
            renderInput={(params) => (
              <TextField {...params} label={t("repo.issues.form.labels", "Labels")} sx={issueFieldSx(theme)} />
            )}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip
                  {...getItemProps({ index })}
                  key={option.id}
                  label={option.name}
                  size="small"
                  sx={{
                    backgroundColor: option.color,
                    color: readableLabelColor(option.color),
                  }}
                />
              ))
            }
            slotProps={{ paper: { sx: issueMenuPaperSx(theme) } }}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: theme.text2 }}>{t("repo.issues.form.milestone", "Milestone")}</InputLabel>
            <Select
              value={formData.milestone_id || ""}
              onChange={(e) => setFormData({ ...formData, milestone_id: e.target.value || undefined })}
              label={t("repo.issues.form.milestone", "Milestone")}
              sx={issueFieldSx(theme)}
              MenuProps={{ PaperProps: { sx: issueMenuPaperSx(theme) } }}
            >
              <MenuItem value="">
                <em>{t("common.none", "None")}</em>
              </MenuItem>
              {milestones
                .filter((milestone) => milestone.state === "open")
                .map((milestone) => (
                  <MenuItem key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${theme.border}` }}>
          <Button onClick={() => setCreateDialogOpen(false)} sx={issueTextButtonSx(theme)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={loading || !formData.title.trim()}
            sx={issuePrimaryButtonSx(theme)}
          >
            {t("common.create", "Create")}
          </Button>
        </DialogActions>
      </Dialog>

      <LabelManager
        repositoryId={repositoryId}
        open={labelManagerOpen}
        onClose={() => setLabelManagerOpen(false)}
        onLabelsChange={loadLabels}
        isDarkTheme={isDarkTheme}
      />

      <MilestoneManager
        repositoryId={repositoryId}
        open={milestoneManagerOpen}
        onClose={() => setMilestoneManagerOpen(false)}
        onMilestonesChange={loadMilestones}
        isDarkTheme={isDarkTheme}
      />
    </section>
  );
};
