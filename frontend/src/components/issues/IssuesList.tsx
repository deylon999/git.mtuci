import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
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
import type { Locale } from "../../i18n";
import { localeTag } from "../../utils/dates";
import { normalizeHexColor, readableTextColor } from "../../utils/labelColor";
import { useUserPreferences } from "../../context/UserPreferencesContext";
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

const SEARCH_DEBOUNCE_MS = 300;

function formatIssueDate(date: string, locale: Locale) {
  return new Date(date).toLocaleDateString(localeTag(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const IssuesList: React.FC<IssuesListProps> = ({ repositoryId, isDarkTheme = false }) => {
  const { t, language } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  // Every issue matching the search, all states: the tabs filter locally so each tab's count is real.
  const [allIssues, setAllIssues] = useState<IssueListItem[]>([]);
  const [labels, setLabels] = useState<IssueLabel[]>([]);
  const [milestones, setMilestones] = useState<IssueMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [milestoneManagerOpen, setMilestoneManagerOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<"open" | "closed" | "all">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const [formData, setFormData] = useState<CreateIssueRequest>({
    title: "",
    body: "",
    label_ids: [],
    assignee_ids: [],
    milestone_id: undefined,
  });

  const counts = useMemo(
    () => ({
      open: allIssues.filter((issue) => issue.state === "open").length,
      closed: allIssues.filter((issue) => issue.state === "closed").length,
      all: allIssues.length,
    }),
    [allIssues],
  );
  const issues = useMemo(
    () => (stateFilter === "all" ? allIssues : allIssues.filter((issue) => issue.state === stateFilter)),
    [allIssues, stateFilter],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // `silent` refreshes after an action keep the list on screen instead of the spinner.
  const loadIssues = async ({ silent = false }: { silent?: boolean } = {}) => {
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await getIssues(repositoryId, debouncedQuery ? { q: debouncedQuery } : undefined);
      // Typing starts a new search; a slower earlier response must not overwrite its results.
      if (seq !== loadSeqRef.current) return;
      setAllIssues(response.data);
    } catch {
      if (seq === loadSeqRef.current) setError(t("repo.issues.loadFailed"));
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId, debouncedQuery]);

  useEffect(() => {
    void loadLabels();
    void loadMilestones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId]);

  // Errors from the dialog and row actions go to a toast: the list's error banner sits behind the dialog.
  const handleCreate = async () => {
    if (creating) return;
    if (!formData.title.trim()) {
      toast.error(t("repo.issues.titleRequired"));
      return;
    }

    setCreating(true);
    try {
      await createIssue(repositoryId, formData);
      void loadIssues({ silent: true });
      setCreateDialogOpen(false);
      setFormData({
        title: "",
        body: "",
        label_ids: [],
        assignee_ids: [],
        milestone_id: undefined,
      });
    } catch {
      toast.error(t("repo.issues.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const handleStateChange = async (issueId: string, newState: "open" | "closed") => {
    if (busyIssueId) return;
    setBusyIssueId(issueId);
    try {
      const updateData: UpdateIssueRequest = { state: newState };
      await updateIssue(issueId, updateData);
      await loadIssues({ silent: true });
    } catch {
      toast.error(t("repo.issues.updateFailed"));
    } finally {
      setBusyIssueId(null);
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
          {t("repo.issues.title")}
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
            {t("repo.issues.labels.manage")}
          </button>
          <button
            type="button"
            onClick={() => setMilestoneManagerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: theme.border, backgroundColor: theme.bg4, color: theme.text }}
          >
            <Flag className="h-3.5 w-3.5" />
            {t("repo.issues.milestones.manage")}
          </button>
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: `${theme.success}55`, backgroundColor: `${theme.success}14`, color: theme.success }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("repo.issues.new")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b px-4 py-3 text-sm" style={{ borderColor: theme.border, color: theme.danger }}>
          <button type="button" onClick={() => setError(null)} className="float-right text-xs hover:underline">
            {t("common.close")}
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
                {t(tab.key)}
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
              placeholder={t("repo.issues.search")}
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
            {t("repo.issues.loading")}
          </div>
        ) : issues.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <CircleDot className="mx-auto h-8 w-8" style={{ color: theme.text3 }} />
            <p className="mt-3 text-sm font-medium" style={{ color: theme.text }}>
              {t("repo.issues.empty")}
            </p>
            <p className="mt-1 text-xs" style={{ color: theme.text2 }}>
              {t("repo.issues.emptyHint")}
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
                          backgroundColor: normalizeHexColor(label.color),
                          color: readableTextColor(label.color),
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: theme.text3 }}>
                    <span>{formatIssueDate(issue.created_at, language)}</span>
                    {issue.assignees.length > 0 ? (
                      <span>
                        {t("repo.issues.assignedTo")}{" "}
                        {issue.assignees.map((assignee) => assignee.login).join(", ")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleStateChange(issue.id, issue.state === "open" ? "closed" : "open")}
                  disabled={busyIssueId === issue.id}
                  aria-label={issue.state === "open" ? t("repo.issues.close") : t("repo.issues.reopen")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.bg4,
                    color: issue.state === "open" ? theme.danger : theme.success,
                  }}
                  title={issue.state === "open" ? t("repo.issues.close") : t("repo.issues.reopen")}
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
        <DialogTitle sx={{ color: theme.text }}>{t("repo.issues.create")}</DialogTitle>
        <DialogContent sx={issueDialogContentSx(theme)}>
          <TextField
            fullWidth
            label={t("repo.issues.form.title")}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            sx={issueFieldSx(theme, { mt: 2, mb: 2 })}
            required
          />
          <TextField
            fullWidth
            label={t("repo.issues.form.description")}
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
            noOptionsText={t("repo.issues.form.noOptions")}
            value={labels.filter((label) => formData.label_ids?.includes(label.id))}
            onChange={(_, newValue) =>
              setFormData({ ...formData, label_ids: newValue.map((label) => label.id) })
            }
            renderInput={(params) => (
              <TextField {...params} label={t("repo.issues.form.labels")} sx={issueFieldSx(theme)} />
            )}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip
                  {...getItemProps({ index })}
                  key={option.id}
                  label={option.name}
                  size="small"
                  sx={{
                    backgroundColor: normalizeHexColor(option.color),
                    color: readableTextColor(option.color),
                  }}
                />
              ))
            }
            slotProps={{ paper: { sx: issueMenuPaperSx(theme) } }}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: theme.text2 }}>{t("repo.issues.form.milestone")}</InputLabel>
            <Select
              value={formData.milestone_id || ""}
              onChange={(e) => setFormData({ ...formData, milestone_id: e.target.value || undefined })}
              label={t("repo.issues.form.milestone")}
              sx={issueFieldSx(theme)}
              MenuProps={{ slotProps: { paper: { sx: issueMenuPaperSx(theme) } } }}
            >
              <MenuItem value="">
                <em>{t("common.none")}</em>
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
            {t("common.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !formData.title.trim()}
            sx={issuePrimaryButtonSx(theme)}
          >
            {t("common.create")}
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
